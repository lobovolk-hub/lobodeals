import {
  campaign,
  expireAtExactEnd,
  isExcludedCampaignText,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import { extractMeta, textFromHtml, uniqueBy } from '../_shared/html.ts'
import { extractOfficialArtwork } from '../_shared/artwork.ts'
import { fetchOfficialJson, fetchOfficialText } from '../_shared/http.ts'
import { extractExactEnglishDateTimes } from '../_shared/time.ts'
import { verifyKnownCampaigns } from '../_shared/verification.ts'
import type { AdapterResult, DetectedCampaign, StoreAdapter } from '../_shared/types.ts'

const SOURCE_URL = 'https://news.blizzard.com/en-us/api/feed/blizzard?offset=0'

type FeedProperties = {
  title?: string
  summary?: string
  newsUrl?: string
  newsPath?: string
  newsSlug?: string
}

type FeedResponse = {
  contentItems?: readonly { properties?: FeedProperties }[]
  pagination?: {
    offset?: number
    limit?: number
    hasNextPage?: boolean
  }
}

function feedItems(value: FeedResponse): readonly FeedProperties[] {
  return (value.contentItems ?? []).flatMap((item) =>
    item.properties ? [item.properties] : []
  )
}

async function fetchDiscoveryWindow(fetcher: typeof fetch): Promise<readonly FeedResponse[]> {
  const pages: FeedResponse[] = []
  let offset = 0

  for (let page = 0; page < 20; page += 1) {
    const response = await fetchOfficialJson<FeedResponse>(
      fetcher,
      `https://news.blizzard.com/en-us/api/feed/blizzard?offset=${offset}`
    )
    pages.push(response)
    if (!response.pagination?.hasNextPage) break
    const limit = response.pagination.limit ?? response.contentItems?.length ?? 15
    if (limit <= 0) break
    offset = (response.pagination.offset ?? offset) + limit
  }

  return pages
}

export const runBattleNetAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const pages = await fetchDiscoveryWindow(fetch)
  const candidates = uniqueBy(
    pages
      .flatMap(feedItems)
      .filter(
        (item) =>
          Boolean(item.title) &&
          isSaleCampaignText(`${item.title ?? ''} ${item.summary ?? ''}`) &&
          !isExcludedCampaignText(`${item.title ?? ''} ${item.summary ?? ''}`) &&
          !/\b(?:in-game|gear store|merch)\b/i.test(
            `${item.title ?? ''} ${item.summary ?? ''}`
          )
      ),
    (item) => item.newsUrl ?? item.newsPath ?? item.newsSlug ?? item.title ?? ''
  )

  const settled = await Promise.allSettled(
    candidates.map(async (item): Promise<DetectedCampaign | null> => {
      const url = item.newsUrl
        ? new URL(item.newsUrl, 'https://news.blizzard.com').toString()
        : item.newsPath
          ? new URL(item.newsPath, 'https://news.blizzard.com').toString()
          : null
      if (!url) return null
      const html = await fetchOfficialText(fetch, url)
      const title = extractMeta(html, 'og:title') ?? item.title ?? ''
      const text = textFromHtml(html)
      if (!isSaleCampaignText(title) || isExcludedCampaignText(title)) return null
      const exact = extractExactEnglishDateTimes(text)
      if (exact.length === 0) return null
      const ends = exact[exact.length - 1]
      return campaign({
        sourceUid: url,
        name: title.replace(/\s*[|–—-]\s*Blizzard News.*$/i, '').trim(),
        storeSlug: 'battle-net',
        state: expireAtExactEnd('live', ends, now),
        lifecycleBasis: 'official-source',
        ends,
        officialUrl: url,
        sourceUrl: SOURCE_URL,
        artworkUrl: extractOfficialArtwork(html, url),
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
    ['news.blizzard.com']
  )
  return {
    storeSlug: 'battle-net',
    sourceUrl: SOURCE_URL,
    sourceUrls: pages.map(
      (page) =>
        `https://news.blizzard.com/en-us/api/feed/blizzard?offset=${page.pagination?.offset ?? 0}`
    ),
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
