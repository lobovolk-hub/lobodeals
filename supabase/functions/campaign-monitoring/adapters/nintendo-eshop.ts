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
import { fetchOfficialText } from '../_shared/http.ts'
import { extractExactEnglishDateTimes } from '../_shared/time.ts'
import { verifyKnownCampaigns } from '../_shared/verification.ts'
import type { AdapterResult, DetectedCampaign, StoreAdapter } from '../_shared/types.ts'

const SALES_URL = 'https://www.nintendo.com/us/store/sales-and-deals/'
const NEWS_URL = 'https://www.nintendo.com/us/whatsnew/'

type NintendoArticle = {
  __typename?: string
  tags?: readonly { __ref?: string }[]
  title?: string
  'url({"relative":true})'?: string
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
      const text = textFromHtml(html)
      const exact = extractExactEnglishDateTimes(text)

      if (exact.length >= 2) {
        const starts = exact[0]
        const ends = exact[exact.length - 1]
        if (Date.parse(ends.value) <= Date.parse(starts.value)) return null
        return campaign({
          sourceUid: url,
          name: title,
          storeSlug: 'nintendo-eshop',
          state: exactTimeState(starts, ends, now),
          lifecycleBasis: 'exact-time',
          starts,
          ends,
          officialUrl: url,
          sourceUrl: NEWS_URL,
        })
      }

      if (exact.length === 1 && /\b(?:ends|until|through)\b/i.test(text)) {
        const ends = exact[0]
        return campaign({
          sourceUid: url,
          name: title,
          storeSlug: 'nintendo-eshop',
          state: expireAtExactEnd('live', ends, now),
          lifecycleBasis: 'official-source',
          ends,
          officialUrl: url,
          sourceUrl: NEWS_URL,
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
  const [tabs, news, explicitlyEndedSourceUids] = await Promise.all([
    discoverCampaignTabs(fetch, salesHtml),
    discoverNewsCampaigns(now, fetch),
    verifyKnownCampaigns(fetch, knownCampaigns, ['www.nintendo.com']),
  ])

  return {
    storeSlug: 'nintendo-eshop',
    sourceUrl: SALES_URL,
    sourceUrls: [SALES_URL, NEWS_URL],
    coverage: 'partial',
    campaigns: uniqueBy([...tabs, ...news], (entry) => entry.name.toLowerCase()),
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
