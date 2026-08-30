import {
  campaign,
  exactTimeState,
  expireAtExactEnd,
  isExcludedCampaignText,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import { decodeHtml, extractAnchors, extractMeta, textFromHtml, uniqueBy } from '../_shared/html.ts'
import { extractOfficialArtwork } from '../_shared/artwork.ts'
import { fetchOfficialText } from '../_shared/http.ts'
import { extractExactEnglishDateTimes } from '../_shared/time.ts'
import { AdapterError } from '../_shared/types.ts'
import { verifyKnownCampaigns } from '../_shared/verification.ts'
import type { AdapterResult, DetectedCampaign, StoreAdapter } from '../_shared/types.ts'

const DEALS_URL = 'https://www.ea.com/sales/deals'
const NEWS_URL = 'https://www.ea.com/news'

function tagAttribute(tag: string, name: string): string | null {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    'i'
  ).exec(tag)
  return match ? decodeHtml(match[1] ?? match[2] ?? '') : null
}

function hasCanonicalUrl(html: string, expected: string): boolean {
  const expectedUrl = new URL(expected)

  return [...html.matchAll(/<link\b[^>]*>/gi)].some((match) => {
    const rel = tagAttribute(match[0], 'rel')
    const href = tagAttribute(match[0], 'href')
    if (!rel?.split(/\s+/).includes('canonical') || !href) return false

    try {
      const actual = new URL(href, expectedUrl)
      actual.search = ''
      actual.hash = ''
      return actual.toString() === expectedUrl.toString()
    } catch {
      return false
    }
  })
}

function assertDealsDiscoveryContract(html: string): void {
  const recognized =
    hasCanonicalUrl(html, DEALS_URL) &&
    /<ea-hybrid-themedsale-controller\b/i.test(html) &&
    /<ea-hybrid-themedsale-row\b/i.test(html) &&
    /<ea-hybrid-themedsale-product\b/i.test(html)

  if (!recognized) {
    throw new AdapterError(
      'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE',
      'EA Deals no longer exposes the recognized official themed-sale surface'
    )
  }
}

function assertNewsDiscoveryContract(html: string): void {
  const hasHeading = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].some(
    (match) => textFromHtml(match[1]) === 'News & Updates'
  )
  const hasArticleLink = extractAnchors(html, NEWS_URL).some(({ href }) => {
    const url = new URL(href)
    return (
      url.hostname === 'www.ea.com' &&
      /^\/news\/[^/]+\/?$/i.test(url.pathname)
    )
  })
  const recognized =
    hasCanonicalUrl(html, NEWS_URL) &&
    /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>/i.test(html) &&
    /<main\b/i.test(html) &&
    hasHeading &&
    hasArticleLink

  if (!recognized) {
    throw new AdapterError(
      'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE',
      'EA News no longer exposes the recognized official News & Updates surface'
    )
  }
}

function customElementLinks(
  html: string,
  baseUrl: string
): readonly { href: string; label: string }[] {
  const links: { href: string; label: string }[] = []
  for (const match of html.matchAll(/<[^>]+(?:href|link-url)=["']([^"']+)["'][^>]*>/gi)) {
    const tag = match[0]
    const label = /(?:label-text|title-text|aria-label)=["']([^"']+)["']/i.exec(
      tag
    )?.[1]
    try {
      links.push({
        href: new URL(decodeHtml(match[1]), baseUrl).toString(),
        label: decodeHtml(label ?? ''),
      })
    } catch {
      // Ignore malformed official links.
    }
  }
  return links
}

function campaignLinks(
  html: string,
  baseUrl: string
): readonly { href: string; label: string }[] {
  return uniqueBy(
    [...extractAnchors(html, baseUrl), ...customElementLinks(html, baseUrl)].filter(
      ({ href, label }) => {
        const url = new URL(href)
        return (
          url.hostname === 'www.ea.com' &&
          !/^\/(?:[a-z]{2}-[a-z]{2}\/)?games\//i.test(url.pathname) &&
          !/^\/(?:[a-z]{2}-[a-z]{2}\/)?legal\//i.test(url.pathname) &&
          !/^\/(?:[a-z]{2}-[a-z]{2}\/)?sales\/deals(?:\/|$)/i.test(
            url.pathname
          ) &&
          isSaleCampaignText(`${url.pathname} ${label}`) &&
          !isExcludedCampaignText(label)
        )
      }
    ),
    ({ href }) => {
      const url = new URL(href)
      url.search = ''
      url.hash = ''
      return url.toString()
    }
  )
}

export const runEaAppAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const [dealsHtml, newsHtml] = await Promise.all([
    fetchOfficialText(fetch, DEALS_URL),
    fetchOfficialText(fetch, NEWS_URL),
  ])
  assertDealsDiscoveryContract(dealsHtml)
  assertNewsDiscoveryContract(newsHtml)

  const links = uniqueBy(
    [...campaignLinks(dealsHtml, DEALS_URL), ...campaignLinks(newsHtml, NEWS_URL)],
    ({ href }) => href
  )

  const settled = await Promise.allSettled(
    links.map(async ({ href, label }): Promise<DetectedCampaign | null> => {
      const officialUrl = new URL(href)
      officialUrl.search = ''
      officialUrl.hash = ''
      const html = await fetchOfficialText(fetch, officialUrl.toString())
      const title = extractMeta(html, 'og:title') ?? label
      const text = textFromHtml(html)
      if (!isSaleCampaignText(`${title} ${text.slice(0, 800)}`)) return null
      if (isExcludedCampaignText(title)) return null

      const exact = extractExactEnglishDateTimes(text)
      if (exact.length >= 2) {
        const starts = exact[0]
        const ends = exact[exact.length - 1]
        if (Date.parse(ends.value) <= Date.parse(starts.value)) return null
        return campaign({
          sourceUid: officialUrl.toString(),
          name: title,
          storeSlug: 'ea-app',
          state: exactTimeState(starts, ends, now),
          lifecycleBasis: 'exact-time',
          starts,
          ends,
          officialUrl: officialUrl.toString(),
          sourceUrl: href.startsWith(NEWS_URL) ? NEWS_URL : DEALS_URL,
          artworkUrl: extractOfficialArtwork(html, officialUrl.toString()),
        })
      }

      const ends = exact.length === 1 ? exact[0] : undefined
      return campaign({
        sourceUid: officialUrl.toString(),
        name: title,
        storeSlug: 'ea-app',
        state: expireAtExactEnd('live', ends, now),
        lifecycleBasis: 'official-source',
        ends,
        officialUrl: officialUrl.toString(),
        sourceUrl: href.startsWith(NEWS_URL) ? NEWS_URL : DEALS_URL,
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
    ['www.ea.com']
  )

  return {
    storeSlug: 'ea-app',
    sourceUrl: DEALS_URL,
    sourceUrls: [DEALS_URL, NEWS_URL],
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
