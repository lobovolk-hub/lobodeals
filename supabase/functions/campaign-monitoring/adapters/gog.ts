import {
  campaign,
  expireAtExactEnd,
  isExcludedCampaignText,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import {
  decodeHtml,
  extractAnchors,
  extractMeta,
  textFromHtml,
  uniqueBy,
} from '../_shared/html.ts'
import { extractOfficialArtwork } from '../_shared/artwork.ts'
import { fetchOfficialPage, fetchOfficialText } from '../_shared/http.ts'
import { extractExactEnglishDateTimes } from '../_shared/time.ts'
import { verifyKnownCampaigns } from '../_shared/verification.ts'
import {
  AdapterError,
  type AdapterResult,
  type DetectedCampaign,
  type KnownCampaign,
  type SourceBoundary,
  type StoreAdapter,
} from '../_shared/types.ts'

const HOME_URL = 'https://www.gog.com/en/'
const NEWS_FEED_URL = 'https://www.gog.com/frontpage/rss'

type CampaignCandidate = Readonly<{
  officialUrl: string
  label: string
  sourceUrl: string
  articleHtml?: string
}>

type PublicationDate = Readonly<{
  year: number
  month: number
  day: number
}>

function normalizedGogUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password ||
      (url.hostname !== 'www.gog.com' && url.hostname !== 'gog.com')
    ) {
      return null
    }
    url.protocol = 'https:'
    url.hostname = 'www.gog.com'
    url.port = ''
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return null
  }
}

function campaignIdentityUrl(value: string): string | null {
  const normalized = normalizedGogUrl(value)
  if (!normalized) return null

  const url = new URL(normalized)
  url.pathname = url.pathname.replace(
    /^\/(?:en|de|es|fr|pl|ru|zh-hans)(?=\/)/i,
    ''
  )
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString()
}

function knownSourceUidsByIdentity(
  knownCampaigns: readonly KnownCampaign[]
): ReadonlyMap<string, string> {
  const sourceUids = new Map<string, string>()

  for (const known of knownCampaigns) {
    for (const value of [known.sourceUid, known.officialUrl]) {
      const identity = campaignIdentityUrl(value)?.toLowerCase()
      if (identity && !sourceUids.has(identity)) {
        sourceUids.set(identity, known.sourceUid)
      }
    }
  }

  return sourceUids
}

function isCampaignPageUrl(value: string): boolean {
  const normalized = campaignIdentityUrl(value)
  if (!normalized) return false
  const pathname = new URL(normalized).pathname
  return (
    /^\/promo\/[^/]+\/?$/i.test(pathname) ||
    /^\/[^/]*(?:sale|sales|deals|savings)[^/]*\/?$/i.test(pathname)
  )
}

function isNewsArticleUrl(value: string): boolean {
  const normalized = normalizedGogUrl(value)
  if (!normalized) return false
  return /^\/(?:[a-z]{2}(?:-[a-z]+)?\/)?news\/[^/]+\/?$/i.test(
    new URL(normalized).pathname
  )
}

function isGiveawayOnly(value: string): boolean {
  return isExcludedCampaignText(value) && !isSaleCampaignText(value)
}

function campaignLinks(
  html: string,
  baseUrl: string,
  context = ''
): readonly { href: string; label: string }[] {
  return uniqueBy(
    extractAnchors(html, baseUrl).filter(({ href, label }) => {
      if (!isCampaignPageUrl(href)) return false
      const identity = `${context} ${label} ${new URL(href).pathname}`
      return isSaleCampaignText(identity) && !isGiveawayOnly(identity)
    }),
    ({ href }) => campaignIdentityUrl(href)?.toLowerCase() ?? href.toLowerCase()
  )
}

function assertHomeDiscoveryContract(html: string): void {
  const hasStoreState =
    /<script\b[^>]*id=["']gogcom-store-state["'][^>]*>/i.test(html)
  const hasPromotionSurface =
    /<promo-banner-section\b|PROMO_BANNER_SECTION/i.test(html)

  if (!hasStoreState || !hasPromotionSurface) {
    throw new AdapterError(
      'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE',
      'GOG Home no longer exposes the recognized campaign discovery surface'
    )
  }
}

function feedItems(
  xml: string
): readonly Readonly<{ title: string; link: string; description: string }>[] {
  const hasRssContract =
    /<rss\b[^>]*>[\s\S]*<channel\b[^>]*>/i.test(xml) &&
    /<title>\s*GOG\.com News\s*<\/title>/i.test(xml)
  if (!hasRssContract) {
    throw new AdapterError(
      'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE',
      'GOG News no longer exposes the recognized RSS discovery contract'
    )
  }

  const rawItems = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
  const parsedItems = rawItems.flatMap((match) => {
    const item = match[1]
    const title = textFromHtml(
      /<title>([\s\S]*?)<\/title>/i.exec(item)?.[1] ?? ''
    )
    const rawLink = decodeHtml(
      /<link>([\s\S]*?)<\/link>/i.exec(item)?.[1] ?? ''
    ).trim()
    const link = normalizedGogUrl(rawLink)
    const description =
      /<description>([\s\S]*?)<\/description>/i.exec(item)?.[1] ?? ''
    return title && link && isNewsArticleUrl(link)
      ? [{ title, link, description }]
      : []
  })

  if (parsedItems.length !== rawItems.length) {
    throw new AdapterError(
      'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE',
      'GOG News RSS items no longer expose recognizable article identity'
    )
  }

  return parsedItems
}

async function discoverNewsCandidates(
  fetcher: typeof fetch,
  feedXml: string
): Promise<readonly CampaignCandidate[]> {
  const candidates = feedItems(feedXml).filter((item) => {
    const describedCampaign = campaignLinks(
      item.description,
      item.link,
      item.title
    ).length > 0
    return (
      describedCampaign ||
      (isSaleCampaignText(item.title) && !isGiveawayOnly(item.title))
    )
  })

  const settled = await Promise.allSettled(
    candidates.map(async (item): Promise<readonly CampaignCandidate[]> => {
      const article = await fetchOfficialPage(fetcher, item.link)
      const articleUrl = normalizedGogUrl(article.url) ?? item.link
      if (!isNewsArticleUrl(articleUrl)) {
        throw new AdapterError(
          'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE',
          'A GOG News campaign article no longer resolves to GOG News'
        )
      }

      const articleTitle = extractMeta(article.text, 'og:title') ?? item.title
      const links = campaignLinks(article.text, articleUrl, articleTitle)
      return links.map(({ href, label }) => ({
        officialUrl: normalizedGogUrl(href) ?? href,
        label,
        sourceUrl: articleUrl,
        articleHtml: article.text,
      }))
    })
  )
  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  return settled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  )
}

function articlePublicationDate(html: string): PublicationDate | null {
  const tags = [...html.matchAll(/<time\b[^>]*>/gi)]
  const articleDate = tags.find((match) => /article__date/i.test(match[0]))
  const datetime = articleDate?.[0].match(
    /\bdatetime=["'](\d{4})-(\d{2})-(\d{2})/i
  )
  if (!datetime) return null

  return {
    year: Number(datetime[1]),
    month: Number(datetime[2]),
    day: Number(datetime[3]),
  }
}

function exactSaleEnd(
  html: string,
  fallbackPublication?: PublicationDate | null
): SourceBoundary | undefined {
  const text = textFromHtml(html)
  const publication = articlePublicationDate(html) ?? fallbackPublication ?? null
  const phrases = [
    ...text.matchAll(
      /[^.!?]*(?:sale|promotion|event|campaign)[^.!?]*(?:ends?|lasts|until|through)[^.!?]*/gi
    ),
  ].map((match) => match[0])

  for (const phrase of phrases) {
    if (/\bgiveaway\b[^.!?]{0,100}\b(?:ends?|until|through)\b/i.test(phrase)) {
      continue
    }

    const explicit = extractExactEnglishDateTimes(phrase)
    if (explicit.length > 0) return explicit[explicit.length - 1]
    if (!publication) continue

    let contextual = extractExactEnglishDateTimes(phrase, publication.year)
    let end = contextual[contextual.length - 1]
    if (!end) continue

    const [, month, day] = /^(\d{4})-(\d{2})-(\d{2})/.exec(end.value) ?? []
    if (
      Number(month) < publication.month &&
      Date.UTC(publication.year, Number(month) - 1, Number(day)) <
        Date.UTC(publication.year, publication.month - 1, publication.day)
    ) {
      contextual = extractExactEnglishDateTimes(phrase, publication.year + 1)
      end = contextual[contextual.length - 1]
    }

    if (end) return end
  }

  return undefined
}

function campaignName(
  pageHtml: string,
  label: string,
  articleHtml?: string
): string | null {
  const headings = [
    ...pageHtml.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi),
  ]
    .map((match) => textFromHtml(match[1]))
    .filter(Boolean)
  const candidates = [
    ...headings,
    label,
    extractMeta(pageHtml, 'og:title') ?? '',
    articleHtml ? extractMeta(articleHtml, 'og:title') ?? '' : '',
  ]
  return (
    candidates.find(
      (value) => isSaleCampaignText(value) && !isGiveawayOnly(value)
    ) ?? null
  )
}

async function verifyCandidates(
  now: Date,
  fetcher: typeof fetch,
  candidates: readonly CampaignCandidate[],
  knownCampaigns: readonly KnownCampaign[]
): Promise<readonly DetectedCampaign[]> {
  const knownSourceUids = knownSourceUidsByIdentity(knownCampaigns)
  const settled = await Promise.allSettled(
    candidates.map(async (candidate): Promise<DetectedCampaign | null> => {
      const page = await fetchOfficialPage(fetcher, candidate.officialUrl)
      const identityUrl = campaignIdentityUrl(page.url || candidate.officialUrl)
      if (!identityUrl || !isCampaignPageUrl(identityUrl)) return null

      const name = campaignName(page.text, candidate.label, candidate.articleHtml)
      const pageRecognized =
        /<h[1-3]\b[^>]*>/i.test(page.text) ||
        /<script\b[^>]*id=["']gogcom-store-state["'][^>]*>/i.test(page.text) ||
        extractMeta(page.text, 'og:title') !== null
      if (!name || !pageRecognized) {
        throw new AdapterError(
          'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE',
          'A linked GOG campaign page no longer exposes recognizable campaign identity'
        )
      }

      const publication = candidate.articleHtml
        ? articlePublicationDate(candidate.articleHtml)
        : null
      const ends =
        (candidate.articleHtml
          ? exactSaleEnd(candidate.articleHtml)
          : undefined) ?? exactSaleEnd(page.text, publication)
      const artworkUrl =
        extractOfficialArtwork(page.text, identityUrl) ??
        (candidate.articleHtml
          ? extractOfficialArtwork(candidate.articleHtml, candidate.sourceUrl)
          : undefined)

      return campaign({
        sourceUid:
          knownSourceUids.get(identityUrl.toLowerCase()) ?? identityUrl,
        name,
        storeSlug: 'gog',
        state: expireAtExactEnd('live', ends, now),
        lifecycleBasis: 'official-source',
        ends,
        officialUrl: identityUrl,
        sourceUrl: candidate.sourceUrl,
        artworkUrl,
      })
    })
  )
  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason

  const merged = new Map<string, DetectedCampaign>()
  for (const entry of settled.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : []
  )) {
    const key = entry.sourceUid.toLowerCase()
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, entry)
      continue
    }

    const ends = existing.ends ?? entry.ends
    merged.set(
      key,
      campaign({
        sourceUid: existing.sourceUid,
        name: existing.name,
        storeSlug: 'gog',
        state: expireAtExactEnd('live', ends, now),
        lifecycleBasis: 'official-source',
        ends,
        officialUrl: existing.officialUrl,
        sourceUrl:
          entry.sourceUrl === HOME_URL ? existing.sourceUrl : entry.sourceUrl,
        artworkUrl: existing.artworkUrl ?? entry.artworkUrl,
      })
    )
  }

  return [...merged.values()]
}

export const runGogAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const [homeHtml, feedXml] = await Promise.all([
    fetchOfficialText(fetch, HOME_URL),
    fetchOfficialText(fetch, NEWS_FEED_URL),
  ])
  assertHomeDiscoveryContract(homeHtml)

  const homeCandidates = campaignLinks(homeHtml, HOME_URL).map(
    ({ href, label }): CampaignCandidate => ({
      officialUrl: normalizedGogUrl(href) ?? href,
      label,
      sourceUrl: HOME_URL,
    })
  )
  const newsCandidates = await discoverNewsCandidates(fetch, feedXml)
  const campaigns = await verifyCandidates(
    now,
    fetch,
    [...homeCandidates, ...newsCandidates],
    knownCampaigns
  )
  const explicitlyEndedSourceUids = await verifyKnownCampaigns(
    fetch,
    knownCampaigns,
    ['www.gog.com', 'gog.com']
  )

  return {
    storeSlug: 'gog',
    sourceUrl: HOME_URL,
    sourceUrls: [HOME_URL, NEWS_FEED_URL],
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
