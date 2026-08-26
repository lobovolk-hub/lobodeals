import {
  campaign,
  isExcludedCampaignText,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import {
  extractAnchors,
  extractMeta,
  textFromHtml,
  uniqueBy,
} from '../_shared/html.ts'
import { fetchOfficialText } from '../_shared/http.ts'
import { verifyKnownCampaigns } from '../_shared/verification.ts'
import type { AdapterResult, DetectedCampaign, StoreAdapter } from '../_shared/types.ts'

const SOURCE_URL = 'https://www.gog.com/en/'

export const runGogAdapter: StoreAdapter = async ({
  fetch,
  knownCampaigns = [],
}) => {
  const html = await fetchOfficialText(fetch, SOURCE_URL)
  const links = uniqueBy(
    extractAnchors(html, SOURCE_URL).filter(({ href, label }) => {
      const url = new URL(href)
      return (
        url.hostname === 'www.gog.com' &&
        /^\/en\/(?:promo\/[^/]+|[^/]*sale[^/]*)\/?$/i.test(url.pathname) &&
        isSaleCampaignText(`${url.pathname} ${label}`) &&
        !isExcludedCampaignText(label)
      )
    }),
    ({ href }) => {
      const url = new URL(href)
      url.search = ''
      url.hash = ''
      return url.toString()
    }
  )

  const settled = await Promise.allSettled(
    links.map(async ({ href, label }): Promise<DetectedCampaign | null> => {
      const officialUrl = new URL(href)
      officialUrl.search = ''
      officialUrl.hash = ''
      const campaignHtml = await fetchOfficialText(fetch, officialUrl.toString())
      const headings = [
        ...campaignHtml.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi),
      ]
        .map((match) => textFromHtml(match[1]))
        .filter((heading) => isSaleCampaignText(heading))
      const title = headings[0] ?? extractMeta(campaignHtml, 'og:title') ?? label
      if (!isSaleCampaignText(title) || isExcludedCampaignText(title)) return null

      return campaign({
        sourceUid: officialUrl.toString(),
        name: title,
        storeSlug: 'gog',
        state: 'live',
        lifecycleBasis: 'official-source',
        officialUrl: officialUrl.toString(),
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
    ['www.gog.com']
  )

  return {
    storeSlug: 'gog',
    sourceUrl: SOURCE_URL,
    sourceUrls: [SOURCE_URL],
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
