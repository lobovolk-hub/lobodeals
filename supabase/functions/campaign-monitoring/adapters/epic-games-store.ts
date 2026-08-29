import {
  campaign,
  expireAtExactEnd,
  isExcludedCampaignText,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import { extractAnchors, extractMeta, textFromHtml, uniqueBy } from '../_shared/html.ts'
import { extractOfficialArtwork } from '../_shared/artwork.ts'
import { fetchOfficialText } from '../_shared/http.ts'
import { extractExactEnglishDateTimes } from '../_shared/time.ts'
import { AdapterError } from '../_shared/types.ts'
import { sourceExplicitlyEndsCampaign, verifyKnownCampaigns } from '../_shared/verification.ts'
import type { AdapterResult, DetectedCampaign, StoreAdapter } from '../_shared/types.ts'

const SALES_URL = 'https://store.epicgames.com/en-US/sales-and-specials'
const NEWS_URL = 'https://store.epicgames.com/en-US/news/'
const NEWS_API_URL =
  'https://egs-platform-service.store.epicgames.com/api/v2/public/content/news'

function campaignLinks(
  html: string,
  baseUrl: string
): readonly { href: string; label: string; sourceUrl: string }[] {
  return uniqueBy(
    extractAnchors(html, baseUrl)
      .filter(({ href, label }) => {
        const url = new URL(href)
        return (
          url.hostname === 'store.epicgames.com' &&
          (/\/sales-and-specials\//i.test(url.pathname) ||
            /\/news\/[^/]+/i.test(url.pathname)) &&
          isSaleCampaignText(`${url.pathname} ${label}`) &&
          !isExcludedCampaignText(label)
        )
      })
      .map((link) => ({ ...link, sourceUrl: baseUrl })),
    ({ href }) => {
      const url = new URL(href)
      url.search = ''
      url.hash = ''
      return url.toString()
    }
  )
}

export const runEpicGamesStoreAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const sourceResults = await Promise.allSettled([
    fetchOfficialText(fetch, SALES_URL),
    fetchOfficialText(fetch, NEWS_URL),
    fetchOfficialText(fetch, NEWS_API_URL, {
      headers: {
        Accept: 'application/json',
        Origin: 'https://store.epicgames.com',
        Referer: NEWS_URL,
      },
    }),
  ])
  const successfulHtml = sourceResults.flatMap((result, index) =>
    result.status === 'fulfilled' && index < 2
      ? [{ html: result.value, sourceUrl: index === 0 ? SALES_URL : NEWS_URL }]
      : []
  )

  if (successfulHtml.length === 0) {
    const failures = sourceResults.map((result) =>
      result.status === 'rejected' && result.reason instanceof AdapterError
        ? result.reason.code
        : result.status
    )
    throw new AdapterError(
      'OFFICIAL_SOURCE_AUTOMATION_BLOCKED',
      `Epic official Sales & Specials and News HTML are unavailable to server-side monitoring (${failures.join(', ')})`,
      true
    )
  }

  const links = uniqueBy(
    successfulHtml.flatMap(({ html, sourceUrl }) =>
      campaignLinks(html, sourceUrl)
    ),
    ({ href }) => href
  )
  const settled = await Promise.allSettled(
    links.map(async ({ href, label, sourceUrl }): Promise<DetectedCampaign | null> => {
      const officialUrl = new URL(href)
      officialUrl.search = ''
      officialUrl.hash = ''
      const html = await fetchOfficialText(fetch, officialUrl.toString())
      if (sourceExplicitlyEndsCampaign(html)) return null
      const title = extractMeta(html, 'og:title') ?? label
      const text = textFromHtml(html)
      if (!isSaleCampaignText(`${title} ${text.slice(0, 800)}`)) return null
      if (isExcludedCampaignText(title)) return null
      const exact = extractExactEnglishDateTimes(text)
      const ends = exact.length > 0 ? exact[exact.length - 1] : undefined
      return campaign({
        sourceUid: officialUrl.toString(),
        name: title,
        storeSlug: 'epic-games-store',
        state: expireAtExactEnd('live', ends, now),
        lifecycleBasis: 'official-source',
        ends,
        officialUrl: officialUrl.toString(),
        sourceUrl,
        artworkUrl: extractOfficialArtwork(html, officialUrl.toString()),
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
    ['store.epicgames.com']
  )

  return {
    storeSlug: 'epic-games-store',
    sourceUrl: SALES_URL,
    sourceUrls: [SALES_URL, NEWS_URL, NEWS_API_URL],
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
