import {
  campaign,
  canonicalDate,
  dateBoundary,
  exactTimeState,
  monthNumber,
} from '../_shared/campaign.ts'
import { isSafeArtworkUrl } from '../_shared/artwork.ts'
import { uniqueBy } from '../_shared/html.ts'
import { fetchOfficialJson } from '../_shared/http.ts'
import {
  extractEnglishDateOnlyRange,
  extractExactEnglishDateTimes,
} from '../_shared/time.ts'
import { AdapterError } from '../_shared/types.ts'
import type {
  AdapterResult,
  DetectedCampaign,
  KnownCampaign,
  SourceBoundary,
  StoreAdapter,
} from '../_shared/types.ts'

const SALES_URL = 'https://store.epicgames.com/sales-and-specials'
const GRAPHQL_URL = 'https://store.epicgames.com/graphql'
const STOREFRONT_DISCOVER_HASH =
  'aed7a7d1ba0945df842b06cb8b42d5d2cad76d8b4dec51dfb294d7c18047960d'
const DEALS_OF_THE_WEEK_UID = 'epic-storefront:deals-of-the-week'

const CAMPAIGN_PATTERN =
  /\b(?:sale|sales|deals?|savings|promotion|discount event|festival)\b/i
const COMMERCIAL_PATTERN =
  /\b(?:sales?|deals?|savings?|promotions?|discounts?|discounted|save)\b/i
const BREADTH_PATTERN =
  /\b(?:(?:select(?:ed)?|multiple|several|various|many)\s+(?:games|titles)|(?:selection|range|lineup)\s+of\s+(?:games|titles)|games?\s+(?:and|with)\s+(?:dlc|add-ons?|discounts?|deals?|offers?))\b/i
const FREE_OR_NON_DIGITAL_PATTERN =
  /\b(?:free games?|free-to-play|free to play|giveaways?|demos?|free weekends?|free play days?|hardware|consoles?|controllers?|headsets?|merch(?:andise)?|apparel)\b/i
const DIGITAL_GAME_PATTERN = /\b(?:digital\s+)?(?:games?|titles?)\b/i
const EPIC_ARTWORK_HOSTS = new Set([
  'cdn1.epicgames.com',
  'cdn2.unrealengine.com',
  'static-assets-prod.epicgames.com',
])

type JsonObject = Readonly<Record<string, unknown>>

type EpicTiming = Readonly<{
  ends?: SourceBoundary
  lifecycleBasis: 'official-source' | 'exact-time'
  starts?: SourceBoundary
  state: 'live' | 'upcoming' | 'ended'
}>

type ModuleCandidate = Readonly<{
  artworkUrl?: string
  landingUrl?: string
  name?: string
  officialUrl: string
  text: string
  timing: EpicTiming
}>

type LandingInfo = Readonly<{
  artworkUrl?: string
  ended: boolean
  name: string
  text: string
  timing: EpicTiming
  url: string
}>

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function unavailable(message: string): AdapterError {
  return new AdapterError('OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE', message)
}

function graphQlErrors(value: unknown): readonly JsonObject[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null
  const errors = value.flatMap((entry) => {
    const error = object(entry)
    return error ? [error] : []
  })
  return errors.length === value.length ? errors : null
}

async function storefrontDiscover(
  fetcher: typeof fetch,
  layoutSlug: string | null
): Promise<JsonObject> {
  const url = new URL(GRAPHQL_URL)
  url.searchParams.set('operationName', 'storefrontDiscover')
  url.searchParams.set(
    'variables',
    JSON.stringify({ layoutSlug, locale: 'en-US', country: 'US', layoutType: 'sale' })
  )
  url.searchParams.set(
    'extensions',
    JSON.stringify({
      persistedQuery: { version: 1, sha256Hash: STOREFRONT_DISCOVER_HASH },
    })
  )

  let response: unknown
  try {
    response = await fetchOfficialJson<unknown>(fetcher, url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    if (error instanceof AdapterError && error.code === 'INVALID_OFFICIAL_RESPONSE') {
      throw unavailable('Epic storefrontDiscover did not return valid JSON')
    }
    throw error
  }

  const envelope = object(response)
  const errors = graphQlErrors(envelope?.errors)
  if (!envelope || errors === null || errors.length > 0) {
    const persistedQueryMissing = errors?.some((error) =>
      /PersistedQueryNotFound/i.test(
        `${string(error.message) ?? ''} ${string(object(error.extensions)?.code) ?? ''}`
      )
    )
    throw unavailable(
      persistedQueryMissing
        ? 'Epic storefrontDiscover persisted query is unavailable'
        : 'Epic storefrontDiscover returned GraphQL errors'
    )
  }

  const data = object(envelope.data)
  const storefront = object(data?.Storefront)
  const layout = object(storefront?.discoverLayout)
  if (!data || !storefront || !layout) {
    throw unavailable('Epic storefrontDiscover response shape is unavailable')
  }
  return layout
}

const STRUCTURAL_KEYS = new Set([
  'children',
  'components',
  'content',
  'data',
  'elements',
  'layout',
  'modules',
  'pageHeader',
  'rows',
  'sections',
  'subModules',
])
const BLOCKED_CHILD_KEYS = new Set([
  'browseResults',
  'catalog',
  'offer',
  'offers',
  'price',
  'prices',
  'product',
  'products',
])

function nodeType(value: JsonObject): string {
  return (
    string(value.__typename) ??
    string(value.type) ??
    string(value.moduleType) ??
    ''
  )
}

function looksStructural(value: unknown): boolean {
  const candidate = object(value)
  if (!candidate) return false
  return /^(?:PageHeader|Storefront)/i.test(nodeType(candidate))
}

function structuralNodes(root: unknown): readonly JsonObject[] {
  const nodes: JsonObject[] = []
  const queue: unknown[] = [root]
  const seen = new Set<object>()

  while (queue.length > 0) {
    const value = queue.shift()
    if (Array.isArray(value)) {
      queue.push(...value)
      continue
    }
    const candidate = object(value)
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    nodes.push(candidate)

    for (const [key, child] of Object.entries(candidate)) {
      if (BLOCKED_CHILD_KEYS.has(key)) continue
      if (STRUCTURAL_KEYS.has(key)) {
        queue.push(child)
        continue
      }
      if (Array.isArray(child) && child.some(looksStructural)) queue.push(child)
      else if (looksStructural(child)) queue.push(child)
    }
  }
  return nodes
}

function nestedStrings(value: unknown, depth = 0): readonly string[] {
  if (depth > 4) return []
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) {
    return value.flatMap((entry) => nestedStrings(entry, depth + 1))
  }
  const candidate = object(value)
  return candidate
    ? Object.values(candidate).flatMap((entry) => nestedStrings(entry, depth + 1))
    : []
}

function fieldStrings(node: JsonObject, fields: readonly string[]): readonly string[] {
  return fields.flatMap((field) => nestedStrings(node[field]))
}

function publicText(node: JsonObject): readonly string[] {
  return uniqueBy(
    [
      ...fieldStrings(node, ['title', 'titleGroup']),
      ...fieldStrings(object(node.image) ?? {}, ['alt']),
      ...fieldStrings(node, ['description', 'subtitle', 'text']),
    ]
      .map((value) => value.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
    (value) => value
  )
}

function normalizeIdentity(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function cleanPublicName(value: string): string | null {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  if (/\bDeals of the Week\b/i.test(collapsed)) return 'Deals of the Week'
  const cleaned = collapsed
    .replace(/^Epic Games Store\s+/i, '')
    .replace(/\s+[|–—-]\s+Epic Games Store.*$/i, '')
    .trim()
  if (
    cleaned.length < 3 ||
    cleaned.length > 100 ||
    /^(?:Epic Games )?Sales\s*(?:&|and)\s*Specials$/i.test(cleaned) ||
    /^(?:Current )?Sales\s*(?:&|and)\s*Specials$/i.test(cleaned) ||
    /^(?:shop|learn|see|view|browse|check out)(?:\s+now|\s+more|\s+the\s+deals?)?$/i.test(
      cleaned
    ) ||
    /^(?:save|shop|explore|discover|browse|check out|get|find|enjoy)\b/i.test(
      cleaned
    ) ||
    (/\w[.!?]$/.test(cleaned) && cleaned.split(/\s+/).length > 8)
  ) {
    return null
  }
  return cleaned
}

function publicNameFromModule(node: JsonObject): string | null {
  if (publicText(node).some((value) => /\bDeals of the Week\b/i.test(value))) {
    return 'Deals of the Week'
  }

  const preferredValues = [
    ...fieldStrings(node, ['title', 'titleGroup']),
    ...fieldStrings(object(node.image) ?? {}, ['alt']),
  ]
  for (const value of preferredValues) {
    const name = cleanPublicName(value)
    if (name) return name
  }

  for (const value of fieldStrings(node, ['description', 'subtitle', 'text'])) {
    const name = cleanPublicName(value)
    if (
      name &&
      name.split(/\s+/).length <= 6 &&
      !/[.!?]$/.test(name) &&
      (CAMPAIGN_PATTERN.test(name) ||
        /\b(?:black friday|cyber monday|gamescom|holiday event|publisher week)\b/i.test(
          name
        ))
    ) {
      return name
    }
  }
  return null
}

function pageHeader(layout: unknown): JsonObject | null {
  return (
    structuralNodes(layout).find((node) => /PageHeader/i.test(nodeType(node))) ??
    null
  )
}

function headerTitle(header: JsonObject): string | null {
  return (
    fieldStrings(header, ['title'])
      .map((value) => value.replace(/\s+/g, ' ').trim())
      .find(Boolean) ?? null
  )
}

function validateMainHeader(layout: unknown): void {
  const header = pageHeader(layout)
  const title = header ? headerTitle(header) : null
  if (
    !title ||
    !/^Epic Games(?: Store)? Sales\s*(?:&|and)\s*Specials$/i.test(title)
  ) {
    throw unavailable('Epic discoverLayout is not the Sales & Specials surface')
  }
}

function rawLinkValues(node: JsonObject): readonly string[] {
  return uniqueBy(
    [
      ...nestedStrings(node.link),
      ...nestedStrings(node.cta),
      ...nestedStrings(node.action),
      ...nestedStrings(node.destination),
      ...nestedStrings(node.href),
      ...nestedStrings(node.url),
    ].filter((value) => /^(?:https?:\/\/|\/)/i.test(value)),
    (value) => value
  )
}

function officialLinks(node: JsonObject): readonly URL[] {
  return rawLinkValues(node).flatMap((value) => {
    try {
      const url = new URL(value, SALES_URL)
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'store.epicgames.com' ||
        url.username ||
        url.password
      ) {
        return []
      }
      url.hash = ''
      return [url]
    } catch {
      return []
    }
  })
}

function campaignLandingUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'store.epicgames.com') {
      return null
    }
    const match = /^\/(?:en-US\/)?sales-and-specials\/([^/]+)\/?$/i.exec(
      url.pathname
    )
    if (!match) return null
    return `https://store.epicgames.com/sales-and-specials/${match[1]}`
  } catch {
    return null
  }
}

function browseUrl(links: readonly URL[]): string | null {
  const link = links.find((url) => /^\/(?:en-US\/)?browse\/?$/i.test(url.pathname))
  return link?.toString() ?? null
}

function isDealsOfTheWeek(text: string, browse: string | null): boolean {
  if (/\bDeals of the Week\b/i.test(text)) return true
  if (!browse || !/\bdeals?\b.*\bweek\b/i.test(text)) return false
  return new URL(browse).searchParams
    .getAll('tag')
    .some((tag) => normalizeIdentity(tag) === 'deals of the week')
}

function safeEpicArtwork(value: unknown, baseUrl = SALES_URL): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value, baseUrl).toString()
    return isSafeArtworkUrl(url) && EPIC_ARTWORK_HOSTS.has(new URL(url).hostname)
      ? url
      : undefined
  } catch {
    return undefined
  }
}

function nodeArtwork(node: JsonObject, baseUrl = SALES_URL): string | undefined {
  for (const value of [
    ...nestedStrings(node.image),
    ...nestedStrings(node.banner),
    ...nestedStrings(node.heroImage),
  ]) {
    const artwork = safeEpicArtwork(value, baseUrl)
    if (artwork) return artwork
  }
  return undefined
}

function dateOnlyBoundaryFromMarker(
  text: string,
  marker: 'start' | 'end'
): SourceBoundary | undefined {
  const months =
    '(January|February|March|April|May|June|July|August|September|October|November|December)'
  const action = marker === 'start' ? '(?:starts?|begins?)' : '(?:ends?)'
  const match = new RegExp(
    `\\b${action}\\s+(?:on\\s+)?${months}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`,
    'i'
  ).exec(text)
  if (!match) return undefined
  const month = monthNumber(match[1])
  if (!month) return undefined
  return dateBoundary(canonicalDate(Number(match[3]), month, Number(match[2])))
}

function timingFromText(text: string, now: Date, currentEvidence: boolean): EpicTiming {
  const exact = extractExactEnglishDateTimes(text)
  const hasStart = /\b(?:starts?|begins?|from)\b/i.test(text)
  const hasEnd = /\b(?:ends?|until|through)\b/i.test(text)
  if (hasStart && hasEnd && exact.length >= 2) {
    const starts = exact[0]
    const ends = exact[exact.length - 1]
    try {
      const state = exactTimeState(starts, ends, now)
      if (state === 'ended' && currentEvidence) {
        return { lifecycleBasis: 'official-source', state: 'live' }
      }
      return { starts, ends, lifecycleBasis: 'exact-time', state }
    } catch {
      // Ignore incompatible exact instants rather than inventing reconciliation.
    }
  }

  if (exact.length === 1 && hasStart !== hasEnd) {
    const boundary = exact[0]
    if (hasStart) {
      return {
        starts: boundary,
        lifecycleBasis: 'official-source',
        state: Date.parse(boundary.value) > now.getTime() ? 'upcoming' : 'live',
      }
    }
    if (Date.parse(boundary.value) <= now.getTime() && !currentEvidence) {
      return { ends: boundary, lifecycleBasis: 'official-source', state: 'ended' }
    }
    return {
      ...(Date.parse(boundary.value) > now.getTime() ? { ends: boundary } : {}),
      lifecycleBasis: 'official-source',
      state: 'live',
    }
  }

  const range = extractEnglishDateOnlyRange(text)
  const today = now.toISOString().slice(0, 10)
  if (range) {
    const ended = range.ends.value < today
    return {
      starts: range.starts,
      ends: range.ends,
      lifecycleBasis: 'official-source',
      state:
        range.starts.value > today
          ? 'upcoming'
          : ended && !currentEvidence
            ? 'ended'
            : 'live',
    }
  }

  const starts = dateOnlyBoundaryFromMarker(text, 'start')
  const ends = dateOnlyBoundaryFromMarker(text, 'end')
  if (starts || ends) {
    return {
      ...(starts ? { starts } : {}),
      ...(ends && (ends.value >= today || !currentEvidence) ? { ends } : {}),
      lifecycleBasis: 'official-source',
      state:
        starts && starts.value > today
          ? 'upcoming'
          : ends && ends.value < today && !currentEvidence
            ? 'ended'
            : 'live',
    }
  }

  return {
    lifecycleBasis: 'official-source',
    state: /\bcoming soon\b/i.test(text) ? 'upcoming' : 'live',
  }
}

function individualProductNode(node: JsonObject, links: readonly URL[]): boolean {
  const offer = object(node.offer)
  return Boolean(
    string(offer?.namespace) ||
    string(offer?.id) ||
    links.some((url) => /^\/(?:en-US\/)?p\//i.test(url.pathname))
  )
}

function excludedWithoutDigitalSale(name: string, text: string): boolean {
  const combined = `${name} ${text}`
  if (!FREE_OR_NON_DIGITAL_PATTERN.test(combined)) return false
  const saleText = combined.replace(
    new RegExp(FREE_OR_NON_DIGITAL_PATTERN.source, 'gi'),
    ' '
  )
  return !(
    DIGITAL_GAME_PATTERN.test(saleText) &&
    (CAMPAIGN_PATTERN.test(saleText) || BREADTH_PATTERN.test(saleText))
  )
}

function qualifiesCampaignModule(
  text: string,
  landingUrl: string | null,
  dealsOfTheWeek: boolean
): boolean {
  return Boolean(
    dealsOfTheWeek ||
      landingUrl ||
      CAMPAIGN_PATTERN.test(text) ||
      (COMMERCIAL_PATTERN.test(text) && BREADTH_PATTERN.test(text))
  )
}

function moduleCandidate(node: JsonObject, now: Date): ModuleCandidate | null {
  const type = nodeType(node)
  if (
    /PageHeader|StorefrontSubModules|StorefrontCardGroup/i.test(type) ||
    Array.isArray(node.offers)
  ) {
    return null
  }

  const links = officialLinks(node)
  if (individualProductNode(node, links)) return null
  const landingUrl = links.map(({ href }) => campaignLandingUrl(href)).find(Boolean)
  const browse = browseUrl(links)
  const text = publicText(node).join(' ')
  const dealsOfTheWeek = isDealsOfTheWeek(text, browse)
  const name = dealsOfTheWeek ? 'Deals of the Week' : publicNameFromModule(node)
  if (!qualifiesCampaignModule(text, landingUrl ?? null, dealsOfTheWeek)) {
    return null
  }
  if (!landingUrl && !name) return null
  if (excludedWithoutDigitalSale(name ?? '', text)) return null

  const officialUrl = landingUrl ?? browse ?? SALES_URL
  const artworkUrl = nodeArtwork(node)
  return {
    ...(artworkUrl ? { artworkUrl } : {}),
    ...(landingUrl ? { landingUrl } : {}),
    ...(name ? { name } : {}),
    officialUrl,
    text,
    timing: timingFromText(text, now, true),
  }
}

function newSourceUid(name: string): string {
  const normalizedName = normalizeIdentity(name)
  if (normalizedName === 'deals of the week') {
    return DEALS_OF_THE_WEEK_UID
  }
  return `epic-storefront:${encodeURIComponent(normalizedName)}`
}

function stableSourceUid(
  name: string,
  landingUrl: string | undefined,
  knownCampaigns: readonly KnownCampaign[]
): string {
  if (landingUrl) {
    const canonicalLanding = campaignLandingUrl(landingUrl)
    const landingMatches = canonicalLanding
      ? knownCampaigns.filter((known) =>
          [known.officialUrl, known.sourceUid].some(
            (value) => campaignLandingUrl(value) === canonicalLanding
          )
        )
      : []
    if (landingMatches.length === 1) return landingMatches[0].sourceUid
  }

  const normalizedName = normalizeIdentity(name)
  const nameMatches = knownCampaigns.filter(
    (known) => normalizeIdentity(known.name) === normalizedName
  )
  return nameMatches.length === 1
    ? nameMatches[0].sourceUid
    : newSourceUid(name)
}

function landingExplicitlyEnded(name: string, description: string): boolean {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(?:^|\\b)${escapedName}\\s+(?:(?:has|have)\\s+(?:now\\s+)?(?:ended|finished)|is\\s+(?:now\\s+)?over)\\b`,
    'i'
  ).test(description)
}

function parseLanding(layout: JsonObject, url: string, now: Date): LandingInfo {
  const canonicalUrl = campaignLandingUrl(url)
  if (!canonicalUrl) throw unavailable('Epic campaign landing URL is invalid')
  const header = pageHeader(layout)
  if (!header) throw unavailable('Epic campaign landing PageHeader is missing')
  const name = publicNameFromModule(header)
  if (!name) throw unavailable('Epic campaign landing public name is unavailable')
  const description = fieldStrings(header, ['description', 'subtitle', 'text']).join(' ')
  const text = `${name} ${description}`.trim()
  const artworkUrl = nodeArtwork(header, canonicalUrl)
  return {
    ...(artworkUrl ? { artworkUrl } : {}),
    ended: landingExplicitlyEnded(name, description),
    name,
    text,
    timing: timingFromText(text, now, false),
    url: canonicalUrl,
  }
}

function comparableIdentity(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return value.trim()
  }
}

function knownExplicitEnds(
  knownCampaigns: readonly KnownCampaign[],
  now: Date
): readonly string[] {
  return knownCampaigns.flatMap((known) => {
    const exactEndPassed =
      Boolean(known.endsAt) &&
      Number.isFinite(Date.parse(known.endsAt!)) &&
      now.getTime() >= Date.parse(known.endsAt!)
    return exactEndPassed ? [known.sourceUid] : []
  })
}

export const runEpicGamesStoreAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const mainLayout = await storefrontDiscover(fetch, null)
  validateMainHeader(mainLayout)

  const landingCache = new Map<string, Promise<LandingInfo>>()
  const loadLanding = (url: string): Promise<LandingInfo> => {
    const canonicalUrl = campaignLandingUrl(url)
    if (!canonicalUrl) return Promise.reject(unavailable('Invalid Epic landing URL'))
    const existing = landingCache.get(canonicalUrl)
    if (existing) return existing
    const slug = canonicalUrl.split('/').at(-1)!
    const pending = storefrontDiscover(fetch, slug).then((layout) =>
      parseLanding(layout, canonicalUrl, now)
    )
    landingCache.set(canonicalUrl, pending)
    return pending
  }

  const candidates = structuralNodes(mainLayout).flatMap((node) => {
    const candidate = moduleCandidate(node, now)
    return candidate ? [candidate] : []
  })
  const campaignFromMain = (
    candidate: ModuleCandidate,
    name: string,
    useLandingIdentity = true
  ): DetectedCampaign =>
    campaign({
      sourceUid: stableSourceUid(
        name,
        useLandingIdentity ? candidate.landingUrl : undefined,
        knownCampaigns
      ),
      name,
      storeSlug: 'epic-games-store',
      state: candidate.timing.state,
      lifecycleBasis: candidate.timing.lifecycleBasis,
      ...(candidate.timing.starts ? { starts: candidate.timing.starts } : {}),
      ...(candidate.timing.ends ? { ends: candidate.timing.ends } : {}),
      officialUrl: candidate.officialUrl,
      sourceUrl: SALES_URL,
      ...(candidate.artworkUrl ? { artworkUrl: candidate.artworkUrl } : {}),
    })
  const settledCampaigns = await Promise.allSettled(
    candidates.map(async (candidate): Promise<DetectedCampaign | null> => {
      if (!candidate.landingUrl) {
        if (!candidate.name || candidate.timing.state === 'ended') return null
        return campaignFromMain(candidate, candidate.name)
      }

      let landing: LandingInfo
      try {
        landing = await loadLanding(candidate.landingUrl)
      } catch {
        return candidate.name ? campaignFromMain(candidate, candidate.name) : null
      }
      if (
        candidate.name &&
        normalizeIdentity(candidate.name) !== normalizeIdentity(landing.name)
      ) {
        return campaignFromMain(candidate, candidate.name, false)
      }
      if (excludedWithoutDigitalSale(landing.name, `${candidate.text} ${landing.text}`)) {
        return null
      }
      const timing =
        landing.ended || landing.timing.state === 'ended'
          ? candidate.timing
          : landing.timing
      return campaign({
        sourceUid: stableSourceUid(landing.name, landing.url, knownCampaigns),
        name: landing.name,
        storeSlug: 'epic-games-store',
        state: timing.state,
        lifecycleBasis: timing.lifecycleBasis,
        ...(timing.starts ? { starts: timing.starts } : {}),
        ...(timing.ends ? { ends: timing.ends } : {}),
        officialUrl: landing.url,
        sourceUrl: SALES_URL,
        ...(candidate.artworkUrl ?? landing.artworkUrl
          ? { artworkUrl: candidate.artworkUrl ?? landing.artworkUrl }
          : {}),
      })
    })
  )
  const campaigns = uniqueBy(
    settledCampaigns.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : []
    ),
    ({ sourceUid }) => sourceUid
  )

  const knownLandingResults = await Promise.allSettled(
    knownCampaigns.map(async (known): Promise<string | null> => {
      const officialUrl =
        campaignLandingUrl(known.officialUrl) ??
        campaignLandingUrl(known.sourceUid)
      if (!officialUrl) return null
      const landing = await loadLanding(officialUrl)
      return landing.ended &&
        normalizeIdentity(landing.name) === normalizeIdentity(known.name)
        ? known.sourceUid
        : null
    })
  )
  const currentSourceUids = new Set(
    campaigns.map(({ sourceUid }) => comparableIdentity(sourceUid))
  )
  const explicitlyEndedSourceUids = uniqueBy(
    [
      ...knownExplicitEnds(knownCampaigns, now),
      ...knownLandingResults.flatMap((result) =>
        result.status === 'fulfilled' && result.value ? [result.value] : []
      ),
    ],
    (value) => value
  ).filter((sourceUid) => !currentSourceUids.has(comparableIdentity(sourceUid)))

  return {
    storeSlug: 'epic-games-store',
    sourceUrl: SALES_URL,
    sourceUrls: [SALES_URL, GRAPHQL_URL],
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
