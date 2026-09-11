import {
  campaign,
  exactTimeState,
  expireAtExactEnd,
  isExcludedCampaignText,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import {
  extractAnchors,
  extractMeta,
  textFromHtml,
  uniqueBy,
} from '../_shared/html.ts'
import { extractOfficialArtwork } from '../_shared/artwork.ts'
import { fetchOfficialPage, fetchOfficialText } from '../_shared/http.ts'
import {
  extractEnglishDateOnlyRange,
  extractExactEnglishDateTimes,
} from '../_shared/time.ts'
import { currentCampaignEvidence, sourceExplicitlyEndsCampaign } from '../_shared/verification.ts'
import type {
  AdapterResult,
  DetectedCampaign,
  KnownCampaign,
  StoreAdapter,
} from '../_shared/types.ts'

const SALES_URL = 'https://www.nintendo.com/us/store/sales-and-deals/'
const NEWS_URL = 'https://www.nintendo.com/us/whatsnew/'

type NintendoArticle = {
  __typename?: string
  tags?: readonly { __ref?: string }[]
  title?: string
  'url({"relative":true})'?: string
}

function nintendoArticlePublicationYear(
  text: string
): number | undefined {
  const match =
    /\b\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})\b/.exec(text)

  if (!match) return undefined

  const parsed = Number(match[1])

  return match[1].length === 2
    ? 2000 + parsed
    : parsed
}

function newsCampaignName(title: string): string {
  const cleaned = title
    .replace(
      /\s+(?:\||-|\u2013|\u2014)\s+News\s+(?:\||-|\u2013|\u2014)\s+Nintendo Official Site.*$/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()

  const announced =
    /\bannounc(?:e|es|ed|ing)\s+(?:the\s+)?([^.!?]{1,100}?\b(?:Sale|Sales|Deals))\b/i.exec(
      cleaned
    )?.[1]

  return announced?.trim() || cleaned
}

function comparableNintendoUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.hostname !== 'www.nintendo.com') return null
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString().toLowerCase()
  } catch {
    return null
  }
}

async function verifyNintendoKnownCampaigns(
  fetcher: typeof fetch,
  knownCampaigns: readonly KnownCampaign[],
  detectedTabs: readonly DetectedCampaign[]
): Promise<readonly string[]> {
  const salesUrl = comparableNintendoUrl(SALES_URL)
  const detectedUrls = new Set(
    detectedTabs.flatMap((entry) =>
      [entry.sourceUid, entry.officialUrl].flatMap((value) => {
        const normalized = comparableNintendoUrl(value)
        return normalized ? [normalized] : []
      })
    )
  )
  const eligible = knownCampaigns.filter((known) => {
    const officialUrl = comparableNintendoUrl(known.officialUrl)
    const sourceUrl = comparableNintendoUrl(known.sourceUrl)
    return officialUrl !== null && officialUrl !== sourceUrl
  })

  const byUrl = new Map<string, KnownCampaign[]>()
  for (const known of eligible) {
    const normalized = comparableNintendoUrl(known.officialUrl)
    if (!normalized) continue
    const group = byUrl.get(normalized) ?? []
    group.push(known)
    byUrl.set(normalized, group)
  }

  const settled = await Promise.allSettled(
    [...byUrl.values()].map(async (knownAtUrl) => {
      const page = await fetchOfficialPage(fetcher, knownAtUrl[0].officialUrl)
      const explicitlyEnded = sourceExplicitlyEndsCampaign(page.text)
      const redirectedToSalesIndex =
        comparableNintendoUrl(page.url) === salesUrl

      return knownAtUrl
        .filter((known) => {
          if (explicitlyEnded) return true

          const sourceUid = comparableNintendoUrl(known.sourceUid)
          const officialUrl = comparableNintendoUrl(known.officialUrl)
          const wasDiscoveredFromSales =
            comparableNintendoUrl(known.sourceUrl) === salesUrl
          const stillDetected =
            (sourceUid !== null && detectedUrls.has(sourceUid)) ||
            (officialUrl !== null && detectedUrls.has(officialUrl))

          return (
            wasDiscoveredFromSales &&
            !stillDetected &&
            redirectedToSalesIndex
          )
        })
        .map(({ sourceUid }) => sourceUid)
    })
  )

  return settled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  )
}

function tabName(title: string, label: string): string {
  const identity = title.split(/\s+-\s+Nintendo\b/i)[0]?.trim() || label.trim()
  return /\b(?:sale|sales|deals)\b/i.test(identity)
    ? identity
    : `${identity} Sale`
}

async function discoverCampaignTabs(
  fetcher: typeof fetch,
  html: string
): Promise<readonly DetectedCampaign[]> {
  const links = uniqueBy(
    extractAnchors(html, SALES_URL).filter(({ href, label }) => {
      const url = new URL(href)
      const relative = url.pathname.toLowerCase()
      return (
        url.hostname === 'www.nintendo.com' &&
        relative.startsWith('/us/store/sales-and-deals/') &&
        relative !== '/us/store/sales-and-deals/' &&
        !relative.endsWith('/best-sellers/') &&
        !/^all (?:deals|sales)$/i.test(label.trim())
      )
    }),
    ({ href }) => new URL(href).pathname.toLowerCase()
  )

  const settled = await Promise.allSettled(
    links.map(async ({ href, label }): Promise<DetectedCampaign | null> => {
      const officialUrl = new URL(href)
      officialUrl.search = ''
      officialUrl.hash = ''
      const pageHtml = await fetchOfficialText(fetcher, officialUrl.toString())
      const title = extractMeta(pageHtml, 'og:title') ?? label
      const name = tabName(title, label)
      if (isExcludedCampaignText(name)) return null
      return campaign({
        sourceUid: officialUrl.toString(),
        name,
        storeSlug: 'nintendo-eshop',
        state: 'live',
        lifecycleBasis: 'official-source',
        officialUrl: officialUrl.toString(),
        sourceUrl: SALES_URL,
        artworkUrl: extractOfficialArtwork(pageHtml, officialUrl.toString()),
      })
    })
  )
  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  return settled.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : []
  )
}

async function discoverNewsCampaigns(
  now: Date,
  fetcher: typeof fetch
): Promise<readonly DetectedCampaign[]> {
  const indexHtml = await fetchOfficialText(fetcher, NEWS_URL)
  const nextData = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
    indexHtml
  )
  if (!nextData) return []

  const parsed = JSON.parse(nextData[1]) as {
    props?: { pageProps?: { initialApolloState?: Record<string, NintendoArticle> } }
  }
  const state = parsed.props?.pageProps?.initialApolloState ?? {}
  const articles = Object.values(state).filter((entry) => {
    const promotion = entry.tags?.some(
      (tag) => tag.__ref === 'ContentTag:articleCategoryPromotions'
    )
    return (
      entry.__typename === 'NewsArticle' &&
      promotion &&
      Boolean(entry.title) &&
      isSaleCampaignText(entry.title ?? '') &&
      !isExcludedCampaignText(entry.title ?? '')
    )
  })

  const settled = await Promise.allSettled(
    articles.map(async (article): Promise<DetectedCampaign | null> => {
      const relativeUrl = article['url({"relative":true})']
      if (!relativeUrl) return null
      const url = new URL(relativeUrl, NEWS_URL).toString()
      const html = await fetchOfficialText(fetcher, url)
      const title = extractMeta(html, 'og:title') ?? article.title ?? ''
      const name = newsCampaignName(title)
      const text = textFromHtml(html)
      const exact = extractExactEnglishDateTimes(text)

      if (exact.length >= 2) {
        const starts = exact[0]
        const ends = exact[exact.length - 1]
        if (Date.parse(ends.value) <= Date.parse(starts.value)) return null
        return campaign({
          sourceUid: url,
          name,
          storeSlug: 'nintendo-eshop',
          state: exactTimeState(starts, ends, now),
          lifecycleBasis: 'exact-time',
          starts,
          ends,
          officialUrl: url,
          sourceUrl: NEWS_URL,
          artworkUrl: extractOfficialArtwork(html, url),
        })
      }

      if (exact.length === 1 && /\b(?:ends|until|through)\b/i.test(text)) {
        const ends = exact[0]
        return campaign({
          sourceUid: url,
          name,
          storeSlug: 'nintendo-eshop',
          state: expireAtExactEnd('live', ends, now),
          lifecycleBasis: 'official-source',
          ends,
          officialUrl: url,
          sourceUrl: NEWS_URL,
          artworkUrl: extractOfficialArtwork(html, url),
        })
      }

      const dateOnlyRange =
        extractEnglishDateOnlyRange(
          text,
          nintendoArticlePublicationYear(text)
        )

      const currentCalendarDay =
        now.toISOString().slice(0, 10)

      if (
        dateOnlyRange &&
        dateOnlyRange.ends.value >= currentCalendarDay &&
        /\bNintendo eShop\b/i.test(text)
      ) {
        return campaign({
          sourceUid: url,
          name,
          storeSlug: 'nintendo-eshop',
          state: 'upcoming',
          lifecycleBasis: 'official-source',
          starts: dateOnlyRange.starts,
          ends: dateOnlyRange.ends,
          officialUrl: url,
          sourceUrl: NEWS_URL,
          artworkUrl: extractOfficialArtwork(html, url),
        })
      }

      return null
    })
  )
  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  return settled.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : []
  )
}

export const runNintendoEshopAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const salesHtml = await fetchOfficialText(fetch, SALES_URL)
  const tabsPromise = discoverCampaignTabs(fetch, salesHtml)
  const [tabs, news, explicitlyEndedSourceUids] = await Promise.all([
    tabsPromise,
    discoverNewsCampaigns(now, fetch),
    tabsPromise.then((detectedTabs) =>
      verifyNintendoKnownCampaigns(fetch, knownCampaigns, detectedTabs)
    ),
  ])

  const stableTabs = tabs.map((tab) => {
    const announcement = news.find((entry) => entry.name.toLowerCase() === tab.name.toLowerCase())
    const existing = knownCampaigns.filter((known) =>
      comparableNintendoUrl(known.officialUrl) === comparableNintendoUrl(tab.officialUrl) ||
      (announcement !== undefined && known.sourceUid === announcement.sourceUid)
    )
    // Reuse the persisted announcement identity when Store evidence takes over.
    // The next run can match the saved Store URL even after News leaves the feed.
    return existing.length === 1 ? campaign({ ...tab, sourceUid: existing[0].sourceUid }) : tab
  })

  return {
    storeSlug: 'nintendo-eshop',
    sourceUrl: SALES_URL,
    sourceUrls: [SALES_URL, NEWS_URL],
    coverage: 'partial',
    ...currentCampaignEvidence(
      uniqueBy([...stableTabs, ...news], (entry) => entry.name.toLowerCase()),
      knownCampaigns,
      explicitlyEndedSourceUids
    ),
  } satisfies AdapterResult
}
