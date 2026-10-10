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
import {
  extractOfficialArtwork,
  isSafeArtworkUrl,
} from '../_shared/artwork.ts'
import { fetchOfficialPage, fetchOfficialText, type OfficialPage } from '../_shared/http.ts'
import { extractExactEnglishDateTimes } from '../_shared/time.ts'
import { currentCampaignEvidence, sourceExplicitlyEndsCampaign } from '../_shared/verification.ts'
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
const CURRENT_PROMOTIONS_URL =
  'https://www.gog.com/en/now_on_sale?countryCode=US&locale=en-US&currencyCode=USD'

type CampaignCandidate = Readonly<{
  officialUrl: string
  label: string
  sourceUrl: string
  articleHtml?: string
  promotionName?: string
  artworkUrl?: string
}>

function isGogPromotionText(value: string): boolean {
  const words = value.replace(/[_/-]+/g, ' ')
  return isSaleCampaignText(words) || /\bpromo(?:tion)?\b/i.test(words)
}

function usefulCampaignName(value: string): boolean {
  return isGogPromotionText(value) && !isGiveawayOnly(value) &&
    !/^(?:\d[\d,+.]*\+?\s+)?(?:games?|deals|titles|products)(?:\s+(?:on sale|up to\b.*))?$/i.test(value.trim()) &&
    !/^(?:all\s+)?(?:sales|deals|promotions|promos)$/i.test(value.trim())
}

function currentPromotionCandidates(raw: string): readonly CampaignCandidate[] {
  const unavailable = () => new AdapterError(
    'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE',
    'GOG current promotions no longer expose recognizable promotion tabs'
  )
  let data: { tabs?: unknown }
  try { data = JSON.parse(raw) } catch { throw unavailable() }
  if (!data || !Array.isArray(data.tabs)) throw unavailable()
  return data.tabs.flatMap((tab: unknown): CampaignCandidate[] => {
    if (!tab || typeof tab !== 'object') throw unavailable()
    const { title, bigThingy } = tab as {
      title?: unknown
      bigThingy?: { url?: unknown; text?: unknown; background?: unknown }
    }
    if (typeof title !== 'string' || !title.trim() || !bigThingy ||
        typeof bigThingy.url !== 'string') throw unavailable()
    const officialUrl = normalizedGogUrl(bigThingy.url)
    if (!officialUrl || !/^\/promo\/[^/]+$/i.test(new URL(campaignIdentityUrl(officialUrl)!).pathname)) {
      throw unavailable()
    }
    const name = [title, bigThingy.text].find((value): value is string =>
      typeof value === 'string' && usefulCampaignName(value)
    )
    if (!name || isGiveawayOnly(`${title} ${bigThingy.text ?? ''}`)) return []
    let artworkUrl: string | undefined
    if (typeof bigThingy.background === 'string') {
      try {
        const url = new URL(bigThingy.background, CURRENT_PROMOTIONS_URL)
        if (/^images(?:-\d+)?\.gog-statics\.com$/i.test(url.hostname) && isSafeArtworkUrl(url.href)) artworkUrl = url.href
      } catch { /* Optional banner metadata. */ }
    }
    return [{ officialUrl, label: name.trim(), promotionName: name.trim(),
      sourceUrl: CURRENT_PROMOTIONS_URL, artworkUrl }]
  })
}

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
      // The routing segment /promo/ is not commercial evidence. Retain named
      // campaign vocabulary in the slug, label, or related official article.
      const path = new URL(campaignIdentityUrl(href)!).pathname.replace(/^\/promo\//i, '/')
      const identity = `${context} ${label} ${path}`.replace(/[_/-]+/g, ' ')
      const promoContract = /^\/promo\//i.test(new URL(campaignIdentityUrl(href)!).pathname)
      return (promoContract ? isGogPromotionText(identity) : isSaleCampaignText(identity)) && !isGiveawayOnly(identity)
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

// Use only at individual article/landing boundaries, never required roots.
// Parsing and identity validation remain outside this transport-only catch.
async function fetchCandidatePage(
  fetcher: typeof fetch,
  url: string
): Promise<OfficialPage | null> {
  try {
    return await fetchOfficialPage(fetcher, url)
  } catch (error) {
    if (error instanceof AdapterError &&
        (/^HTTP_\d{3}$/.test(error.code) ||
          error.code === 'SOURCE_TIMEOUT')) return null
    if (error instanceof AdapterError && error.code === 'SOURCE_FETCH_FAILED') {
      // The shared code also wraps application errors. Only recognized native
      // fetch network signatures permit omission; preserve all other causes.
      const cause = error.cause
      if (cause instanceof TypeError &&
          /^(?:fetch failed|Failed to fetch|NetworkError when attempting to fetch resource\.)$|^(?:Fetch failed: |error sending request for url \()/.test(cause.message)) return null
      throw cause ?? error
    }
    throw error
  }
}

async function discoverNewsCandidates(
  fetcher: typeof fetch,
  feedXml: string
): Promise<Readonly<{
  candidates: readonly CampaignCandidate[]
  failedArticleIdentities: ReadonlySet<string>
}>> {
  const failedArticleIdentities = new Set<string>()
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
      const article = await fetchCandidatePage(fetcher, item.link)
      if (!article) {
        failedArticleIdentities.add(campaignIdentityUrl(item.link)!.toLowerCase())
        return []
      }
      const articleUrl = normalizedGogUrl(article.url)
      if (!articleUrl || !isNewsArticleUrl(articleUrl) ||
          campaignIdentityUrl(articleUrl) !== campaignIdentityUrl(item.link)) {
        // The final destination controls authority, never the pre-redirect URL.
        failedArticleIdentities.add(campaignIdentityUrl(item.link)!.toLowerCase())
        return []
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
  return {
    candidates: settled.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : []
    ),
    failedArticleIdentities,
  }
}

function gogCampaignDesktopArtwork(html: string): string | undefined {
  // GOG publishes separate mobile and desktop artwork, not compositing layers.
  // The desktop asset contains the campaign montage missing from some mobile
  // backgrounds. Read only the campaign hero, never promotional sidebars.
  const hero = /<hero\b[^>]*>([\s\S]*?)<\/hero>/i.exec(html)?.[1]
  const desktop = hero && /<div\b[^>]*class=["'][^"']*\bhero-background--desktop\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(hero)?.[1]
  return desktop ? gogCampaignHeroArtwork(desktop) : undefined
}

function gogCampaignHeroArtwork(html: string): string | undefined {
  const picture = [...html.matchAll(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi)]
    .map((match) => match[0])
    .find((value) =>
      /\bselenium-id=["']heroBackgroundImage["']/i.test(value)
    )

  if (!picture) return undefined

  const candidates = [...picture.matchAll(/\bsrcset=["']([^"']+)["']/gi)]
    .flatMap((match) =>
      decodeHtml(match[1])
        .split(',')
        .map((entry) => entry.trim().split(/\s+/)[0])
        .filter(Boolean)
    )
    .flatMap((value, index) => {
      try {
        const url = new URL(value)

        if (
          url.protocol !== 'https:' ||
          !/^images(?:-\d+)?\.gog-statics\.com$/i.test(url.hostname) ||
          !isSafeArtworkUrl(url.toString())
        ) {
          return []
        }

        const dimensions =
          /_hero_(\d+)x(\d+)(?:_2x)?\.(webp|jpe?g)$/i.exec(
            url.pathname
          )

        if (!dimensions) return []

        return [
          {
            url: url.toString(),
            width: Number(dimensions[1]),
            height: Number(dimensions[2]),
            webp: dimensions[3].toLowerCase() === 'webp',
            index,
          },
        ]
      } catch {
        return []
      }
    })
    .sort((left, right) => {
      const targetRatio = 16 / 9
      const leftRatioDistance =
        Math.abs(left.width / left.height - targetRatio)
      const rightRatioDistance =
        Math.abs(right.width / right.height - targetRatio)

      return (
        leftRatioDistance - rightRatioDistance ||
        Number(right.webp) - Number(left.webp) ||
        right.width - left.width ||
        left.index - right.index
      )
    })

  return candidates[0]?.url
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

function embeddedGogCampaignYear(
  value: string
): number | undefined {
  const normalized = campaignIdentityUrl(value)

  if (!normalized) return undefined

  const pathname =
    new URL(normalized).pathname.toLowerCase()

  const compactDate =
    /(?:^|[\/_-])(20\d{2})(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?=[\/_-]|$)/.exec(
      pathname
    )

  if (compactDate) {
    return Number(compactDate[1])
  }

  const standaloneYear =
    /(?:^|[\/_-])(20\d{2})(?=[\/_-]|$)/.exec(
      pathname
    )

  return standaloneYear
    ? Number(standaloneYear[1])
    : undefined
}

function gogCampaignExplicitlyEnded(
  html: string
): boolean {
  const text = textFromHtml(html)

  return (
    sourceExplicitlyEndsCampaign(html) ||
    /\bit(?:['\u2019])s\s+(?:now\s+)?over\b/i.test(text)
  )
}

// A generic title alone is also used by active promos. Require the observed
// SSR soft-404 contract and no campaign content, not merely missing headings.
export function gogPromoPageEvidence(
  page: OfficialPage,
  officialUrl: string,
  name: string
): Readonly<{ kind: 'present' | 'generic' | 'unknown'; country?: string }> {
  const identity = campaignIdentityUrl(officialUrl)
  if (!identity || !/^\/promo\/[^/]+$/i.test(new URL(identity).pathname) ||
      campaignIdentityUrl(page.url) !== identity) return { kind: 'unknown' }

  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const normalizedName = normalize(name)
  const identityText = `${textFromHtml(page.text)} ${extractMeta(page.text, 'og:title') ?? ''}`
  if (normalizedName && normalize(identityText).includes(normalizedName)) {
    return { kind: 'present' }
  }
  const raw = /<script\b[^>]*id=["']gogcom-store-state["'][^>]*>([\s\S]*?)<\/script>/i.exec(page.text)?.[1]
  if (!raw) return { kind: 'unknown' }
  let state: Record<string, unknown>
  try { state = JSON.parse(raw) } catch { return { kind: 'unknown' } }
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { kind: 'unknown' }
  // Any retained page/section state is reason to preserve. Do not inspect or
  // traverse the embedded catalog, products, prices, or individual offers.
  if (Object.keys(state).some(key => key.startsWith('sections.gog/v1/pages/')) ||
      /<app-page\b|<hero\b/i.test(page.text)) return { kind: 'present' }

  const metadata = state.pageMetadata as Record<string, unknown> | undefined
  const config = state.consulConfig
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      typeof metadata.country !== 'string' || typeof metadata.locale !== 'string' ||
      typeof metadata.currency !== 'string' || !config || typeof config !== 'object' ||
      Array.isArray(config) || Object.keys(state).some(key => !['consulConfig', 'pageMetadata'].includes(key))) {
    return { kind: 'unknown' }
  }
  const root = /<app-root\b[^>]*ng-server-context=["']ssr["'][^>]*>([\s\S]*?)<\/app-root>/i.exec(page.text)?.[1]
  if (!root || !/<page-not-found\b[^>]*>\s*<\/page-not-found>/i.test(root) ||
      !/<title>\s*GOG\.COM\s*<\/title>/i.test(page.text)) return { kind: 'unknown' }
  return { kind: 'generic', country: metadata.country }
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
      (value) => usefulCampaignName(value)
    ) ?? null
  )
}

async function verifyCandidates(
  now: Date,
  fetcher: typeof fetch,
  candidates: readonly CampaignCandidate[],
  knownCampaigns: readonly KnownCampaign[],
  hasUnresolvedArticles: boolean
): Promise<Readonly<{
  campaigns: readonly DetectedCampaign[]
  rejectedIdentities: ReadonlySet<string>
}>> {
  const knownSourceUids = knownSourceUidsByIdentity(knownCampaigns)
  const rejectedIdentities = new Set<string>()
  const settled = await Promise.allSettled(
    candidates.map(async (candidate): Promise<DetectedCampaign | null> => {
      const rejectIdentity = (): null => {
        // Structured promotion identity is required evidence, not an auxiliary
        // Home/News guess. Its broken landing must remain an explicit failure.
        if (candidate.promotionName) {
          throw new AdapterError('OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE',
            'A structured GOG promotion no longer exposes compatible campaign identity')
        }
        rejectedIdentities.add(campaignIdentityUrl(candidate.officialUrl)!.toLowerCase())
        return null
      }
      const page = await fetchCandidatePage(fetcher, candidate.officialUrl)
      if (!page) {
        // Even a structured tab still needs its own successful landing under
        // the current contract. Omit it, never fabricate it from the tab alone.
        rejectedIdentities.add(campaignIdentityUrl(candidate.officialUrl)!.toLowerCase())
        return null
      }
      const identityUrl = campaignIdentityUrl(page.url || candidate.officialUrl)
      if (!identityUrl || !isCampaignPageUrl(identityUrl) ||
          identityUrl.toLowerCase() !== campaignIdentityUrl(candidate.officialUrl)!.toLowerCase()) return rejectIdentity()

      if (gogPromoPageEvidence(page, candidate.officialUrl, candidate.promotionName ?? candidate.label).kind === 'generic') return null

      const name = candidate.promotionName ?? campaignName(page.text, candidate.label, candidate.articleHtml)
      const pageRecognized =
        /<h[1-3]\b[^>]*>/i.test(page.text) ||
        /<script\b[^>]*id=["']gogcom-store-state["'][^>]*>/i.test(page.text) ||
        extractMeta(page.text, 'og:title') !== null
      if (!name || !pageRecognized) {
        return rejectIdentity()
      }

      const publication = candidate.articleHtml
        ? articlePublicationDate(candidate.articleHtml)
        : null
      const ends =
        (candidate.articleHtml
          ? exactSaleEnd(candidate.articleHtml)
          : undefined) ?? exactSaleEnd(page.text, publication)

      const identityYear =
        embeddedGogCampaignYear(identityUrl)

      const clearlyHistoricalIdentity =
        identityYear !== undefined &&
        identityYear < now.getUTCFullYear() &&
        !(
          ends?.precision === 'datetime' &&
          Date.parse(ends.value) > now.getTime()
        )

      if (
        gogCampaignExplicitlyEnded(page.text) ||
        clearlyHistoricalIdentity
      ) {
        return null
      }

      const artworkUrl =
        gogCampaignDesktopArtwork(page.text) ??
        extractOfficialArtwork(page.text, identityUrl) ??
        gogCampaignHeroArtwork(page.text) ??
        candidate.artworkUrl ??
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

  if (![...merged.values()].some(entry => entry.state !== 'ended') &&
      (rejectedIdentities.size > 0 || hasUnresolvedArticles)) {
    throw new AdapterError('OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE',
      'GOG discovery contains unresolved campaign candidates without independently verified campaigns')
  }
  return { campaigns: [...merged.values()], rejectedIdentities }
}

async function verifyKnownGogCampaigns(
  fetcher: typeof fetch,
  knownCampaigns: readonly KnownCampaign[],
  now: Date
): Promise<readonly string[]> {
  const eligible = knownCampaigns.filter((known) => {
    try {
      const hostname =
        new URL(known.officialUrl).hostname

      return (
        known.officialUrl !== known.sourceUrl &&
        (
          hostname === 'www.gog.com' ||
          hostname === 'gog.com'
        )
      )
    } catch {
      return false
    }
  })

  const historicalSourceUids: string[] = []
  const byUrl =
    new Map<string, KnownCampaign[]>()

  for (const known of eligible) {
    const embeddedYear =
      embeddedGogCampaignYear(
        known.officialUrl
      ) ??
      embeddedGogCampaignYear(
        known.sourceUid
      )

    if (
      embeddedYear !== undefined &&
      embeddedYear < now.getUTCFullYear()
    ) {
      historicalSourceUids.push(
        known.sourceUid
      )

      continue
    }

    const group =
      byUrl.get(known.officialUrl) ?? []

    group.push(known)
    byUrl.set(
      known.officialUrl,
      group
    )
  }

  const settled = await Promise.allSettled(
    [...byUrl.entries()].map(
      async ([officialUrl, knownAtUrl]) => {
        const page =
          await fetchCandidatePage(
            fetcher,
            officialUrl
          )
        if (!page || campaignIdentityUrl(page.url) !== campaignIdentityUrl(officialUrl)) return []
        return knownAtUrl.flatMap((known) => {
          const evidence = gogPromoPageEvidence(page, officialUrl, known.name)
          return gogCampaignExplicitlyEnded(page.text) ||
            (evidence.kind === 'generic' && evidence.country === 'US')
            ? [known.sourceUid] : []
        })
      }
    )
  )

  const rejected = settled.find(result => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  return uniqueBy(
    [
      ...historicalSourceUids,
      ...settled.flatMap((result) =>
        result.status === 'fulfilled'
          ? result.value
          : []
      ),
    ],
    (value) => value
  )
}

async function enrichKnownGogCampaigns(
  fetcher: typeof fetch,
  knownCampaigns: readonly KnownCampaign[],
  detected: readonly DetectedCampaign[],
  now: Date
): Promise<readonly DetectedCampaign[]> {
  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const containsName = (text: string, name: string) =>
    normalize(name).length >= 6 && ` ${normalize(text)} `.includes(` ${normalize(name)} `)
  const settled = await Promise.allSettled(knownCampaigns.filter(known =>
    known.state === 'live' && !known.endsAt && isNewsArticleUrl(known.sourceUrl) &&
    isCampaignPageUrl(known.officialUrl) &&
    !detected.find(entry => entry.sourceUid === known.sourceUid)?.ends
  ).map(async (known): Promise<DetectedCampaign | null> => {
    const article = await fetchCandidatePage(fetcher, known.sourceUrl)
    if (!article || campaignIdentityUrl(article.url) !== campaignIdentityUrl(known.sourceUrl)) return null
    // Scope timing to the saved announcement, never page navigation or related news.
    const body = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(article.text)?.[1]
    if (!body) return null
    const title = textFromHtml(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body)?.[1] ?? '')
    if (!containsName(title, known.name)) return null
    const links = campaignLinks(body, known.sourceUrl, title)
    const identities = new Set(links.map(link => campaignIdentityUrl(link.href)))
    if (identities.size !== 1 || !identities.has(campaignIdentityUrl(known.officialUrl))) return null
    const publication = articlePublicationDate(body)
    // A retained article from another edition cannot refresh a recurring landing.
    if (!publication || publication.year !== now.getUTCFullYear()) return null
    const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(match => textFromHtml(match[1]))
      .filter(text => containsName(text, known.name) || /^The (?:sale|promotion|campaign|event)\s+(?:ends?|lasts|runs)\b/i.test(text))
    const boundaries = paragraphs.flatMap(text => {
      const end = exactSaleEnd(text, publication)
      return end ? [end] : []
    })
    const uniqueEnds = uniqueBy(boundaries, end => end.value)
    if (uniqueEnds.length !== 1) return null
    const ends = uniqueEnds[0]
    const page = await fetchCandidatePage(fetcher, known.officialUrl)
    if (!page || campaignIdentityUrl(page.url) !== campaignIdentityUrl(known.officialUrl) ||
        gogCampaignExplicitlyEnded(page.text)) return null
    const headings = [...page.text.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
      .map(match => textFromHtml(match[1]))
    if (![...headings, extractMeta(page.text, 'og:title') ?? ''].some(text => containsName(text, known.name))) return null
    const current = detected.find(entry => entry.sourceUid === known.sourceUid)
    return campaign({
      sourceUid: known.sourceUid,
      name: current?.name ?? known.name,
      storeSlug: 'gog',
      state: expireAtExactEnd('live', ends, now),
      lifecycleBasis: 'official-source',
      starts: current?.starts ?? (known.startsAt ? { precision: 'datetime', value: known.startsAt } :
        known.startsOn ? { precision: 'date', value: known.startsOn } : undefined),
      ends,
      officialUrl: known.officialUrl,
      sourceUrl: known.sourceUrl,
      artworkUrl: current?.artworkUrl,
    })
  }))
  const rejected = settled.find(result => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  // Expected transport failures preserve the row; unexpected errors propagate.
  const enriched = settled.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : [])
  return uniqueBy([...enriched, ...detected], entry => entry.sourceUid)
}

export const runGogAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const [homeHtml, feedXml, currentJson] = await Promise.all([
    fetchOfficialText(fetch, HOME_URL),
    fetchOfficialText(fetch, NEWS_FEED_URL),
    fetchOfficialText(fetch, CURRENT_PROMOTIONS_URL),
  ])
  assertHomeDiscoveryContract(homeHtml)
  const currentCandidates = currentPromotionCandidates(currentJson)

  const homeCandidates = campaignLinks(homeHtml, HOME_URL).map(
    ({ href, label }): CampaignCandidate => ({
      officialUrl: normalizedGogUrl(href) ?? href,
      label,
      sourceUrl: HOME_URL,
    })
  )
  const { candidates: newsCandidates, failedArticleIdentities } = await discoverNewsCandidates(fetch, feedXml)
  const { campaigns: detected, rejectedIdentities } = await verifyCandidates(
    now,
    fetch,
    [...currentCandidates, ...homeCandidates, ...newsCandidates],
    knownCampaigns,
    failedArticleIdentities.size > 0
  )
  // Rejection is not END evidence. Do not reinterpret the same unresolved
  // landing through auxiliary enrichment or known-campaign retirement.
  const verifiableKnown = knownCampaigns.filter(known =>
    !failedArticleIdentities.has(campaignIdentityUrl(known.sourceUrl)?.toLowerCase() ?? '') &&
    ![known.sourceUid, known.officialUrl].some(value => {
      const identity = campaignIdentityUrl(value)
      return identity !== null && rejectedIdentities.has(identity.toLowerCase())
    })
  )
  const campaigns = await enrichKnownGogCampaigns(fetch, verifiableKnown, detected, now)
  const currentSourceUids =
    new Set(
      campaigns.map(
        ({ sourceUid }) => sourceUid
      )
    )

  const explicitlyEndedSourceUids =
    (
      await verifyKnownGogCampaigns(
        fetch,
        verifiableKnown.filter((known) =>
          !currentSourceUids.has(known.sourceUid) &&
          !currentCandidates.some(candidate =>
            campaignIdentityUrl(candidate.officialUrl) === campaignIdentityUrl(known.officialUrl)
          )
        ),
        now
      )
    ).filter(
      (sourceUid) =>
        !currentSourceUids.has(sourceUid)
    )

  return {
    storeSlug: 'gog',
    sourceUrl: HOME_URL,
    sourceUrls: [HOME_URL, NEWS_FEED_URL, CURRENT_PROMOTIONS_URL],
    coverage: 'partial',
    ...currentCampaignEvidence(campaigns, knownCampaigns, explicitlyEndedSourceUids),
  } satisfies AdapterResult
}
