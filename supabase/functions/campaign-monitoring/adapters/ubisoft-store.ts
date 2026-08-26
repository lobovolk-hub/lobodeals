import {
  campaign,
  expireAtExactEnd,
  isExcludedCampaignText,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import { extractAnchors, extractMeta, textFromHtml, uniqueBy } from '../_shared/html.ts'
import { fetchOfficialText } from '../_shared/http.ts'
import { verifyKnownCampaigns } from '../_shared/verification.ts'
import { extractExactEnglishDateTimes } from '../_shared/time.ts'
import type { AdapterResult, DetectedCampaign, StoreAdapter } from '../_shared/types.ts'

const SOURCE_URL = 'https://store.ubisoft.com/us/deals'

export const runUbisoftStoreAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const html = await fetchOfficialText(fetch, SOURCE_URL)
  const links = uniqueBy(
    extractAnchors(html, SOURCE_URL).filter(({ href, label }) => {
      const url = new URL(href)
      return (
        url.hostname === 'store.ubisoft.com' &&
        url.pathname.startsWith('/us/') &&
        url.pathname !== '/us/deals' &&
        /sale/i.test(`${url.pathname} ${label}`) &&
        !isExcludedCampaignText(label)
      )
    }),
    ({ href }) => href
  )

  const settled = await Promise.allSettled(
    links.map(async ({ href, label }): Promise<DetectedCampaign | null> => {
      const campaignHtml = await fetchOfficialText(fetch, href)
      const headings = [
        ...campaignHtml.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi),
      ]
        .map((match) => textFromHtml(match[1]))
        .filter((heading) => isSaleCampaignText(heading))
      const metaTitle = extractMeta(campaignHtml, 'og:title') ?? label
      const title = /^(?:deals|sale|ubisoft store)$/i.test(metaTitle.trim())
        ? (headings[0] ?? metaTitle)
        : metaTitle
      const text = textFromHtml(campaignHtml)
      if (!isSaleCampaignText(`${title} ${text.slice(0, 500)}`)) return null
      const exact = extractExactEnglishDateTimes(text)
      const ends = exact.length > 0 ? exact[exact.length - 1] : undefined
      return campaign({
        sourceUid: href,
        name: title.replace(/\s*[|–—-]\s*Ubisoft Store.*$/i, '').trim(),
        storeSlug: 'ubisoft-store',
        state: expireAtExactEnd('live', ends, now),
        lifecycleBasis: 'official-source',
        ends,
        officialUrl: href,
        sourceUrl: SOURCE_URL,
      })
    })
  )

  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason

  const campaigns = settled.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : []
  )
  const explicitlyEndedSourceUids = await verifyKnownCampaigns(
    fetch,
    knownCampaigns,
    ['store.ubisoft.com']
  )
  return {
    storeSlug: 'ubisoft-store',
    sourceUrl: SOURCE_URL,
    sourceUrls: [SOURCE_URL],
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
