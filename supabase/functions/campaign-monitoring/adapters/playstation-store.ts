import {
  campaign,
  exactTimeState,
  isExcludedCampaignText,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import { extractOfficialArtwork, isSafeArtworkUrl } from '../_shared/artwork.ts'
import { extractAnchors, extractMeta, textFromHtml, uniqueBy } from '../_shared/html.ts'
import { fetchOfficialJson, fetchOfficialText } from '../_shared/http.ts'
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

const DEALS_URL = 'https://store.playstation.com/en-us/pages/deals'
const LATEST_URL = 'https://store.playstation.com/en-us/pages/latest'
const BLOG_URL = 'https://blog.playstation.com/category/ps-store/'
const GRAPHQL_URL = 'https://web.np.playstation.com/api/graphql/v1/op'
const STORE_CLIENT_ID = 'b6de8d4d-bf9b-11ee-ad2a-aea73dc1ea43'
const GET_EXPERIENCE_HASH =
  'b5078800ed1bdebee9800979f9306abeadc5169030263f7095fe573b12e52270'
const GET_DEFAULT_VIEW_HASH =
  'fc2998417fe7297a559b7f3798bf1c5e1650d88e926269bf6d8bd2cce3fddc76'

type JsonObject = Readonly<Record<string, unknown>>

type EmsLink = Readonly<{
  localizedName?: string | null
  target?: string | null
  type?: string | null
}>

type EmsTelemetry = Readonly<{
  contentSource?: string | null
  emsCategoryId?: string | null
  interactAction?: string | null
  interactCta?: string | null
  interactLink?: string | null
  strandName?: string | null
}>

type EmsComponent = Readonly<{
  __typename?: string | null
  altText?: string | null
  imageUrl?: string | null
  link?: EmsLink | null
  name?: string | null
  priceSourceId?: string | null
  telemetryData?: EmsTelemetry | null
  text?: string | null
}>

type EmsView = Readonly<{
  __typename: 'EMSView'
  components: readonly EmsComponent[]
  purpose?: string | null
  reportingName?: string | null
}>

type EmsExperience = Readonly<{
  alias: 'deals' | 'latest'
  id: string
  roots: readonly JsonObject[]
  views: readonly EmsView[]
}>

type NameCandidate = Readonly<{
  priority: number
  value: string
}>

type StoreCandidate = {
  categoryId: string
  current: boolean
  experienceId: string
  images: string[]
  internalText: string[]
  localizedKeyId?: string
  names: NameCandidate[]
  publicText: string[]
  seenInDeals: boolean
  seenInLatest: boolean
}

type CampaignTiming = Readonly<{
  ended: boolean
  ends?: SourceBoundary
  lifecycleBasis: 'official-source' | 'exact-time'
  starts?: SourceBoundary
  state: 'live' | 'upcoming' | null
}>

type ParsedBlogArticle = Readonly<{
  allowsStoreNameMatch?: boolean
  campaign: DetectedCampaign | null
  endedIdentity?: string
}>

type BlogCampaign = Readonly<{
  allowsStoreNameMatch: boolean
  campaign: DetectedCampaign
}>

type LinkedStoreCampaign = Readonly<{
  campaignPageUrl: string | null
  categoryUrl: string | null
}>

const CAMPAIGN_COMMERCIAL_PATTERN =
  /\b(?:sale|sales|deals?|savings|promotion|discount event|discounts?|offers?)\b/i

const DIGITAL_GAMES_PATTERN = /\b(?:digital\s+)?(?:games?|titles?)\b/i

const NON_DIGITAL_SCOPE_PATTERN =
  /\b(?:hardware|consoles?|controllers?|headsets?|accessories|merch(?:andise)?|apparel|credit[ -]card|visa signature)\b/i

const BLOG_EXCLUSION_PATTERN =
  /\b(?:ps plus monthly games|playstation plus monthly games|free games?|free play days?|demos?|giveaways?|single[- ]game|individual (?:game|title)|dlc|add-ons?)\b/i

const GENERIC_NAME_PATTERN =
  /^(?:deals?|promotion|sale|sales|savings|save now|shop now|buy now|learn more|see more|view deals?)$/i

const CTA_PATTERN =
  /^(?:save|shop|buy|learn|see|view|explore|discover)(?:\s+the)?(?:\s+sale|\s+deals?)?\s+now$|^(?:learn|see)\s+more$/i

function isPermanentNavigationIdentity(value: string): boolean {
  const normalized = value
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
  return /^(?:all deals|all ps5 games|all ps4 games|ps5 pro enhanced games|playstation vr2 games|add ons? by game|free to play|playstation plus|ps plus|new games|pre orders?|top 10|playstation visa(?: signature)?(?: credit card)?|(?:hardware|consoles?|controllers?|headsets?|accessories|merch(?:andise)?|apparel)(?: sale| promotion| deals?)?)$/i.test(
    normalized
  )
}

function hasDigitalSaleEvidence(value: string): boolean {
  return (
    DIGITAL_GAMES_PATTERN.test(value) &&
    (CAMPAIGN_COMMERCIAL_PATTERN.test(value) ||
      /\b(?:save|discounted|off)\b/i.test(value))
  )
}

function hasCampaignLinkedGameList(html: string): boolean {
  for (const match of html.matchAll(
    /<(p|h[2-6])\b[^>]*>([\s\S]*?)<\/\1>\s*<(ul|ol)\b[^>]*>([\s\S]*?)<\/\3>/gi
  )) {
    const introduction = textFromHtml(match[2])
    if (
      !CAMPAIGN_COMMERCIAL_PATTERN.test(introduction) ||
      !/\b(?:games|titles)\b/i.test(introduction) ||
      !/\b(?:includes?|included|including|features?|featured|featuring|contains?|comprises?|following|listed)\b/i.test(
        introduction
      )
    ) {
      continue
    }

    const explicitTitles = [...match[4].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((item) => textFromHtml(item[1]))
      .filter((item) => item.length >= 2 && item.length <= 120)
    if (new Set(explicitTitles).size >= 2) return true
  }
  return false
}

function hasCampaignBreadthEvidence(value: string, html: string): boolean {
  const breadth =
    /\b(?:select(?:ed)?|multiple|several|various|many|hundreds?|thousands?)\s+(?:of\s+)?(?:games|titles)\b/i.test(
      value
    ) ||
    /\b(?:lineup|selection|range)\s+of\s+(?:games|titles)\b/i.test(value) ||
    /\b(?:games|titles)\s+(?:and|with|featuring)\s+(?:discounts?|deals?|offers?|savings)\b/i.test(
      value
    ) ||
    /\bstore[ -]wide\b/i.test(value) ||
    /\bacross\s+(?:a\s+)?(?:wide\s+)?(?:range|selection|lineup)\s+of\s+(?:games|titles)\b/i.test(
      value
    )
  return breadth || hasCampaignLinkedGameList(html)
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function contractUnavailable(message: string): AdapterError {
  return new AdapterError('OFFICIAL_STORE_CONTRACT_UNAVAILABLE', message)
}

function persistedUrl(
  operationName: 'getExperience' | 'getDefaultView',
  hash: string,
  variables: JsonObject
): string {
  const url = new URL(GRAPHQL_URL)
  url.searchParams.set('operationName', operationName)
  url.searchParams.set('variables', JSON.stringify(variables))
  url.searchParams.set(
    'extensions',
    JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } })
  )
  return url.toString()
}

async function persistedGet(
  fetcher: typeof fetch,
  operationName: 'getExperience' | 'getDefaultView',
  hash: string,
  variables: JsonObject
): Promise<JsonObject> {
  let response: unknown
  try {
    response = await fetchOfficialJson<unknown>(
      fetcher,
      persistedUrl(operationName, hash, variables),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Language': 'en-US',
          'x-apollo-operation-name': operationName,
          'apollo-require-preflight': 'true',
          'x-psn-store-locale-override': 'en-us',
        },
      }
    )
  } catch (error) {
    if (
      error instanceof AdapterError &&
      error.code === 'INVALID_OFFICIAL_RESPONSE'
    ) {
      throw contractUnavailable(
        `PlayStation ${operationName} did not return a valid GraphQL response`
      )
    }
    throw error
  }

  const envelope = object(response)
  if (!envelope) {
    throw contractUnavailable(
      `PlayStation ${operationName} returned a malformed GraphQL envelope`
    )
  }
  if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
    throw contractUnavailable(
      `PlayStation ${operationName} rejected its persisted operation`
    )
  }
  return envelope
}

function component(value: unknown): EmsComponent | null {
  const entry = object(value)
  if (!entry) return null
  const typename = string(entry.__typename)
  if (
    typename !== 'EMSImageComponent' &&
    typename !== 'EMSTextComponent' &&
    typename !== 'EMSStrandComponent' &&
    typename !== 'EMSGridComponent'
  ) {
    return null
  }

  const rawLink = object(entry.link)
  const rawTelemetry = object(entry.telemetryData)
  return {
    __typename: typename,
    altText: string(entry.altText),
    imageUrl: string(entry.imageUrl),
    link: rawLink
      ? {
          localizedName: string(rawLink.localizedName),
          target: string(rawLink.target),
          type: string(rawLink.type),
        }
      : null,
    name: string(entry.name),
    priceSourceId: string(entry.priceSourceId),
    telemetryData: rawTelemetry
      ? {
          contentSource: string(rawTelemetry.contentSource),
          emsCategoryId: string(rawTelemetry.emsCategoryId),
          interactAction: string(rawTelemetry.interactAction),
          interactCta: string(rawTelemetry.interactCta),
          interactLink: string(rawTelemetry.interactLink),
          strandName: string(rawTelemetry.strandName),
        }
      : null,
    text: string(entry.text),
  }
}

function collectViews(value: unknown, roots: JsonObject[], views: EmsView[]): void {
  const entry = object(value)
  if (!entry) return
  const typename = string(entry.__typename)
  if (typename === 'EMSViewCollection') {
    roots.push(entry)
    if (Array.isArray(entry.childViews)) {
      for (const child of entry.childViews) collectViews(child, roots, views)
    }
    return
  }
  if (typename !== 'EMSView' || !Array.isArray(entry.components)) return

  views.push({
    __typename: 'EMSView',
    components: entry.components.flatMap((value) => {
      const parsed = component(value)
      return parsed ? [parsed] : []
    }),
    purpose: string(entry.purpose),
    reportingName: string(entry.reportingName),
  })
}

function experienceContractText(experience: EmsExperience): string {
  return [
    ...experience.roots.flatMap((root) => [
      string(root.reportingName),
      string(root.type),
    ]),
    ...experience.views.flatMap((view) => [
      view.purpose,
      view.reportingName,
      ...view.components.flatMap((entry) => [
        entry.name,
        entry.altText,
        entry.text,
        entry.link?.localizedName,
        entry.telemetryData?.interactAction,
        entry.telemetryData?.interactLink,
      ]),
    ]),
  ]
    .filter(Boolean)
    .join(' ')
}

function validateRegion(experience: EmsExperience): void {
  const normalized = experienceContractText(experience)
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
  const foreign = /(?:^|_)(?:SIEE|SIEJ|SIEK|EN_GB|FR_FR|DE_DE|JA_JP)(?:_|$)/i.test(
    normalized
  )
  const usa = /(?:^|_)(?:SIEA|EN_US)(?:_|$)/i.test(normalized)
  if (foreign && !usa) {
    throw contractUnavailable(
      `PlayStation ${experience.alias} returned an obvious non-US experience`
    )
  }
}

function hasRecognizableDealsSurface(views: readonly EmsView[]): boolean {
  return views.some((view) => {
    const reporting = (view.reportingName ?? '').replace(/[^a-z0-9]+/gi, '')
    const internalText = [
      view.reportingName,
      ...view.components.flatMap(componentInternalText),
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/[^a-z0-9]+/gi, ' ')
    const hasCategory = view.components.some((entry) => categoryLink(entry))
    const hasAllDeals = view.components.some((entry) =>
      componentPublicText(entry).some((value) =>
        /^(?:all\s+)?deals$/i.test(value.trim())
      )
    )
    const hasDealsStrand = view.components.some(
      (entry) =>
        entry.__typename === 'EMSStrandComponent' &&
        componentInternalText(entry).some((value) => /\bdeals?\b/i.test(value))
    )
    const recognizedReporting =
      /^(?:DEALSLINKS|DEALSGAMES|DEALSNAV(?:IGATION)?|DEALSSTRAND|DEALSTOP|TOPDEALS?|PROMOTIONS?)$/i.test(
        reporting
      )
    const hasDealNavigationTelemetry =
      /\b(?:all deals|deals? (?:navigation|links|strand|games))\b/i.test(
        internalText
      )

    return (
      (hasCategory &&
        (hasAllDeals || recognizedReporting || hasDealNavigationTelemetry)) ||
      (hasDealsStrand && /^(?:DEALSGAMES|DEALSSTRAND)$/i.test(reporting)) ||
      (hasCategory && candidateView('deals', view) !== null)
    )
  })
}

function parseExperienceEnvelope(
  envelope: JsonObject,
  requestedAlias: 'deals' | 'latest'
): EmsExperience {
  const data = object(envelope.data)
  const retrieved = object(data?.emsExperienceRetrieve)
  if (
    !retrieved ||
    string(retrieved.alias) !== requestedAlias ||
    !string(retrieved.id) ||
    !Array.isArray(retrieved.views)
  ) {
    throw contractUnavailable(
      `PlayStation ${requestedAlias} omitted its expected persisted experience`
    )
  }

  const roots: JsonObject[] = []
  const views: EmsView[] = []
  for (const value of retrieved.views) collectViews(value, roots, views)
  if (roots.length === 0 || views.length === 0) {
    throw contractUnavailable(
      `PlayStation ${requestedAlias} returned no usable EMS view structure`
    )
  }

  const experience: EmsExperience = {
    alias: requestedAlias,
    id: string(retrieved.id)!,
    roots,
    views,
  }
  const rootNames = roots
    .map((root) => string(root.reportingName) ?? '')
    .join(' ')
    .replace(/[^a-z0-9]+/gi, ' ')
  if (!new RegExp(`\\b${requestedAlias}\\b`, 'i').test(rootNames)) {
    throw contractUnavailable(
      `PlayStation ${requestedAlias} no longer exposes its recognizable EMS surface`
    )
  }
  if (
    requestedAlias === 'deals' &&
    !hasRecognizableDealsSurface(views)
  ) {
    throw contractUnavailable(
      'PlayStation Deals no longer exposes recognizable deal navigation'
    )
  }
  validateRegion(experience)
  return experience
}

async function getExperience(
  fetcher: typeof fetch,
  alias: 'deals' | 'latest'
): Promise<EmsExperience> {
  return parseExperienceEnvelope(
    await persistedGet(fetcher, 'getExperience', GET_EXPERIENCE_HASH, {
      clientId: STORE_CLIENT_ID,
      alias,
    }),
    alias
  )
}

function componentPublicText(entry: EmsComponent): readonly string[] {
  return [entry.altText, entry.text].filter(
    (value): value is string => Boolean(value)
  )
}

function componentInternalText(entry: EmsComponent): readonly string[] {
  return [
    entry.name,
    entry.link?.localizedName,
    entry.telemetryData?.contentSource,
    entry.telemetryData?.interactAction,
    entry.telemetryData?.interactCta,
    entry.telemetryData?.interactLink,
    entry.telemetryData?.strandName,
    entry.telemetryData?.emsCategoryId,
  ].filter((value): value is string => Boolean(value))
}

function categoryLink(entry: EmsComponent): Readonly<{
  categoryId: string
  localizedKeyId?: string
}> | null {
  if (entry.link?.type !== 'EMS_CATEGORY' || !entry.link.target) return null
  if (!/^[a-z0-9-]+$/i.test(entry.link.target)) return null
  return {
    categoryId: entry.link.target,
    localizedKeyId: entry.link.localizedName ?? undefined,
  }
}

function currentCta(entry: EmsComponent): boolean {
  return /^(?:save|shop|buy|view|explore)(?:\s+the)?(?:\s+sale|\s+deals?)?\s+now$/i.test(
    entry.text ?? entry.telemetryData?.interactCta ?? ''
  )
}

function candidateView(
  alias: 'deals' | 'latest',
  view: EmsView
): Readonly<{ current: boolean; priority: number }> | null {
  const reporting = view.reportingName ?? ''
  const topDeals =
    alias === 'deals' &&
    view.purpose === 'COLLECTION' &&
    /(?:DEALSTOP|TOP.?DEALS?|PROMO)/i.test(reporting)
  const hero = view.purpose === 'HERO'
  if (!topDeals && !hero) return null

  const publicText = view.components.flatMap(componentPublicText).join(' ')
  const internalText = [
    reporting,
    ...view.components.flatMap(componentInternalText),
  ]
    .join(' ')
    .replaceAll('_', ' ')
  if (
    !isSaleCampaignText(publicText) &&
    !/\b(?:PROMO(?:TION)?|SALE|SAVINGS|DEALS?|DISCOUNT)\b/i.test(internalText)
  ) {
    return null
  }

  return {
    current: topDeals || view.components.some(currentCta),
    priority: alias === 'latest' && hero ? 300 : 200,
  }
}

function mergeStoreCandidate(
  candidates: Map<string, StoreCandidate>,
  incoming: StoreCandidate
): void {
  const current = candidates.get(incoming.categoryId)
  if (!current) {
    candidates.set(incoming.categoryId, incoming)
    return
  }
  current.current ||= incoming.current
  current.seenInDeals ||= incoming.seenInDeals
  current.seenInLatest ||= incoming.seenInLatest
  current.localizedKeyId ??= incoming.localizedKeyId
  current.names.push(...incoming.names)
  current.publicText.push(...incoming.publicText)
  current.internalText.push(...incoming.internalText)
  if (incoming.seenInLatest) current.images.unshift(...incoming.images)
  else current.images.push(...incoming.images)
}

function storeCandidates(
  experiences: readonly EmsExperience[]
): Map<string, StoreCandidate> {
  const candidates = new Map<string, StoreCandidate>()

  for (const experience of experiences) {
    for (const view of experience.views) {
      const evidence = candidateView(experience.alias, view)
      if (!evidence) continue
      const linked = uniqueBy(view.components.flatMap((entry) => {
        const link = categoryLink(entry)
        return link ? [{ entry, link }] : []
      }), ({ link }) => link.categoryId)
      for (const { entry, link } of linked) {
        const associated = linked.length === 1 ? view.components : [entry]
        const publicText = associated.flatMap(componentPublicText)
        const internalText = [
          view.reportingName ?? '',
          ...associated.flatMap(componentInternalText),
        ]
        const candidateText = `${publicText.join(' ')} ${internalText.join(' ')}`
        const identityText = publicText.filter(
          (value) => !CTA_PATTERN.test(value.trim())
        )
        if (
          (identityText.length > 0 &&
            identityText.every(isPermanentNavigationIdentity)) ||
          (NON_DIGITAL_SCOPE_PATTERN.test(candidateText) &&
            !hasDigitalSaleEvidence(candidateText)) ||
          (isExcludedCampaignText(publicText.join(' ')) &&
            !isSaleCampaignText(publicText.join(' ')))
        ) {
          continue
        }
        if (
          !isSaleCampaignText(publicText.join(' ')) &&
          !/\b(?:PROMO(?:TION)?|SALE|SAVINGS|DEALS?|DISCOUNT)\b/i.test(
            internalText.join(' ').replaceAll('_', ' ')
          )
        ) {
          continue
        }
        mergeStoreCandidate(candidates, {
          categoryId: link.categoryId,
          current: evidence.current,
          experienceId: experience.id,
          images: associated.flatMap((component) =>
            component.imageUrl ? [component.imageUrl] : []
          ),
          internalText,
          localizedKeyId: link.localizedKeyId,
          names: publicText.map((value) => ({
            priority: evidence.priority,
            value,
          })),
          publicText,
          seenInDeals: experience.alias === 'deals',
          seenInLatest: experience.alias === 'latest',
        })
      }
    }
  }

  return candidates
}

function cleanCampaignName(value: string): string | null {
  const cleaned = value
    .replace(/\s*[–—|-]\s*PlayStation(?:\.Blog| Store)?.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (
    cleaned.length < 3 ||
    cleaned.length > 120 ||
    GENERIC_NAME_PATTERN.test(cleaned) ||
    CTA_PATTERN.test(cleaned) ||
    isPermanentNavigationIdentity(cleaned) ||
    (NON_DIGITAL_SCOPE_PATTERN.test(cleaned) &&
      !hasDigitalSaleEvidence(cleaned)) ||
    (isExcludedCampaignText(cleaned) && !isSaleCampaignText(cleaned)) ||
    (/\w[.!?]$/.test(cleaned) && cleaned.split(/\s+/).length > 10)
  ) {
    return null
  }
  return cleaned
}

function bestName(names: readonly NameCandidate[]): string | null {
  return (
    names
      .flatMap(({ priority, value }) => {
        const cleaned = cleanCampaignName(value)
        return cleaned ? [{ priority, value: cleaned }] : []
      })
      .sort(
        (left, right) =>
          right.priority - left.priority || left.value.length - right.value.length
      )[0]?.value ?? null
  )
}

function canonicalCategoryUrl(categoryId: string): string {
  return `https://store.playstation.com/en-us/category/${categoryId}/1`
}

function playStationArtwork(values: readonly string[]): string | undefined {
  return values.find((value) => {
    if (!isSafeArtworkUrl(value)) return false
    try {
      return new URL(value).hostname === 'image.api.playstation.com'
    } catch {
      return false
    }
  })
}

function explicitState(text: string): 'live' | 'upcoming' | null {
  const live =
    /\b(?:sale|campaign|promotion|event)\s+(?:is\s+)?(?:live|available)\s+now\b/i.test(
      text
    ) ||
    /\b(?:sales|deals|savings|offers)\s+(?:are\s+)?(?:live|available)\s+now\b/i.test(
      text
    ) ||
    /\bshop\s+(?:the|this)\s+(?:sale|promotion)\s+now\b/i.test(text)
  const upcoming =
    /\b(?:sale|campaign|promotion|event)\s+(?:is\s+)?coming\s+soon\b/i.test(
      text
    ) ||
    /\b(?:sale|campaign|promotion|event)\s+(?:starts?|begins?)\s+soon\b/i.test(
      text
    ) ||
    /\b(?:sales|deals|savings|offers)\s+(?:are\s+)?coming\s+soon\b/i.test(
      text
    )
  return live === upcoming ? null : live ? 'live' : 'upcoming'
}

function campaignTiming(
  text: string,
  now: Date,
  current: boolean,
  reportedState = explicitState(text)
): CampaignTiming {
  const exact = [...extractExactEnglishDateTimes(text)].sort(
    (left, right) => Date.parse(left.value) - Date.parse(right.value)
  )
  const hasStart = /\b(?:starts?|begins?|from)\b/i.test(text)
  const hasEnd = /\b(?:ends?|until|through)\b/i.test(text)

  if (hasStart && hasEnd && exact.length >= 2) {
    const starts = exact[0]
    const ends = exact[exact.length - 1]
    if (Date.parse(ends.value) > Date.parse(starts.value)) {
      const state = exactTimeState(starts, ends, now)
      return {
        ended: state === 'ended',
        ends,
        lifecycleBasis: 'exact-time',
        starts,
        state: state === 'ended' ? null : state,
      }
    }
  }

  if (hasStart && !hasEnd && exact.length > 0) {
    const starts = exact[0]
    if (now.getTime() < Date.parse(starts.value)) {
      return {
        ended: false,
        lifecycleBasis: 'official-source',
        starts,
        state: 'upcoming',
      }
    }
    return {
      ended: false,
      lifecycleBasis: 'official-source',
      starts,
      state: current || reportedState === 'live' ? 'live' : null,
    }
  }

  if (hasEnd && exact.length > 0) {
    const ends = exact[exact.length - 1]
    if (Date.parse(ends.value) <= now.getTime()) {
      return {
        ended: true,
        ends,
        lifecycleBasis: 'official-source',
        state: null,
      }
    }
    return {
      ended: false,
      ends,
      lifecycleBasis: 'official-source',
      state: current || reportedState === 'live' ? 'live' : null,
    }
  }

  const range = extractEnglishDateOnlyRange(text)
  if (range) {
    const currentCalendarDay = now.toISOString().slice(0, 10)
    const conservativePastCutoff = new Date(now.getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10)
    const ended = range.ends.value < conservativePastCutoff
    const future = range.starts.value > currentCalendarDay
    return {
      ended,
      ...range,
      lifecycleBasis: 'official-source',
      state: ended ? null : future ? 'upcoming' : current ? 'live' : reportedState,
    }
  }

  return {
    ended: false,
    lifecycleBasis: 'official-source',
    state: current ? 'live' : reportedState,
  }
}

function parseDefaultViewEnvelope(envelope: JsonObject): readonly string[] {
  const data = object(envelope.data)
  const retrieved = object(data?.emsDefaultViewRetrieve)
  if (!retrieved) {
    throw contractUnavailable(
      'PlayStation getDefaultView omitted its expected persisted view'
    )
  }

  const roots: JsonObject[] = []
  const views: EmsView[] = []
  collectViews(retrieved, roots, views)
  if (roots.length === 0 && views.length === 0) {
    throw contractUnavailable(
      'PlayStation getDefaultView returned no recognizable EMS structure'
    )
  }
  for (const view of views) {
    if (
      view.purpose === 'CATEGORY_GRID' &&
      !view.components.some((entry) => entry.__typename === 'EMSGridComponent')
    ) {
      throw contractUnavailable(
        'PlayStation getDefaultView returned a malformed category-grid shell'
      )
    }
  }
  return views.flatMap((view) => view.components.flatMap(componentPublicText))
}

async function getDefaultView(
  fetcher: typeof fetch,
  candidate: StoreCandidate
): Promise<readonly string[]> {
  if (!candidate.localizedKeyId) return []
  return parseDefaultViewEnvelope(
    await persistedGet(fetcher, 'getDefaultView', GET_DEFAULT_VIEW_HASH, {
      categoryId: candidate.categoryId,
      experienceId: candidate.experienceId,
      localizedKeyId: candidate.localizedKeyId,
    })
  )
}

function detectedStoreCampaign(
  candidate: StoreCandidate,
  now: Date
): Readonly<{ campaign: DetectedCampaign | null; endedIdentity?: string }> {
  const name = bestName(candidate.names)
  const officialUrl = canonicalCategoryUrl(candidate.categoryId)
  const timing = campaignTiming(
    candidate.publicText.join(' '),
    now,
    candidate.current
  )
  if (timing.ended) return { campaign: null, endedIdentity: officialUrl }
  if (!name || !timing.state) return { campaign: null }

  return {
    campaign: campaign({
      sourceUid: officialUrl,
      name,
      storeSlug: 'playstation-store',
      state: timing.state,
      lifecycleBasis: timing.lifecycleBasis,
      ...(timing.starts ? { starts: timing.starts } : {}),
      ...(timing.ends ? { ends: timing.ends } : {}),
      officialUrl,
      sourceUrl: candidate.seenInDeals ? DEALS_URL : LATEST_URL,
      artworkUrl: playStationArtwork(candidate.images),
    }),
  }
}

function blogCampaignLinks(html: string): readonly { href: string; label: string }[] {
  return uniqueBy(
    extractAnchors(html, BLOG_URL).filter(({ href }) => {
      const url = new URL(href)
      return (
        url.hostname === 'blog.playstation.com' &&
        /^\/\d{4}\/\d{2}\/\d{2}\//.test(url.pathname)
      )
    }),
    ({ href }) => href
  )
}

function blogArticleBody(html: string): string {
  const articles = [...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)]
  const current = articles.find(
    (match) =>
      /\bclass=["'][^"']*\bpost-single\b/i.test(match[1]) ||
      /\bid=["']post-[^"']+["']/i.test(match[1])
  )
  if (current) return current[2]

  const reasonable = articles.find((match) => textFromHtml(match[2]).length > 0)
  return reasonable?.[2] ?? html
}

function timingSegments(articleHtml: string): readonly string[] {
  const blocks = [
    ...articleHtml.matchAll(
      /<(?:p|li|h[2-6])\b[^>]*>([\s\S]*?)<\/(?:p|li|h[2-6])>/gi
    ),
  ].map((match) => textFromHtml(match[1]))
  const source = blocks.length > 0 ? blocks : [textFromHtml(articleHtml)]

  return source.flatMap((block) =>
    block
      .replace(/\b([ap])\.m\./gi, '$1m')
      .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
      .map((segment) => segment.trim())
      .filter(Boolean)
  )
}

function campaignNameTokens(name: string): readonly string[] {
  const ignored = new Set([
    'playstation',
    'store',
    'sale',
    'sales',
    'deals',
    'savings',
    'promotion',
    'campaign',
    'discount',
    'discounts',
    'event',
    'offers',
    'the',
    'and',
  ])
  return name
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter(
      (token) => token.length >= 4 && !/^20\d{2}$/.test(token) && !ignored.has(token)
    ) ?? []
}

function normalizedWords(value: string): readonly string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? []
}

function campaignNameMatchesText(value: string, name: string): boolean {
  const words = normalizedWords(value)
  const expectedYears = new Set(
    normalizedWords(name).filter((word) => /^20\d{2}$/.test(word))
  )
  const candidateYears = new Set(words.filter((word) => /^20\d{2}$/.test(word)))
  if (
    expectedYears.size > 0 &&
    candidateYears.size > 0 &&
    ![...candidateYears].some((year) => expectedYears.has(year))
  ) {
    return false
  }

  const normalizedValue = ` ${words.join(' ')} `
  const normalizedName = normalizedWords(name).join(' ')
  if (normalizedName && normalizedValue.includes(` ${normalizedName} `)) {
    return true
  }

  const tokens = campaignNameTokens(name)
  const wordSet = new Set(words)
  if (tokens.length >= 2) return tokens.every((token) => wordSet.has(token))
  if (tokens.length !== 1 || !wordSet.has(tokens[0])) return false

  const weakSingleTokens = new Set([
    'black',
    'days',
    'double',
    'friday',
    'game',
    'games',
    'holiday',
    'play',
    'plus',
    'spring',
    'summer',
    'title',
    'titles',
    'week',
    'weekend',
    'winter',
  ])
  return tokens[0].length >= 6 && !weakSingleTokens.has(tokens[0])
}

function articleIdentifiesCampaign(
  html: string,
  articleHtml: string,
  name: string
): boolean {
  const identityText = [
    extractMeta(html, 'og:title'),
    ...[...articleHtml.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(
      (match) => textFromHtml(match[1])
    ),
  ].filter((value): value is string => Boolean(value))
  return identityText.some((value) => campaignNameMatchesText(value, name))
}

function blogCampaignTimingText(
  articleHtml: string,
  name: string,
  articleIdentityMatches: boolean
): string {
  return timingSegments(articleHtml)
    .filter((segment) => {
      if (
        !/\b(?:starts?|begins?|ends?|until|through|from|runs?|coming soon|live now|available now|is now live|are now live)\b/i.test(
          segment
        )
      ) {
        return false
      }
      if (
        /\b(?:last year|last year's|previous(?: year's)?|earlier|formerly|past campaign|past promotion)\b/i.test(
          segment
        )
      ) {
        return false
      }

      const namesCampaign = campaignNameMatchesText(segment, name)
      const refersToCurrentCampaign =
        /\b(?:this|the)\s+(?:sale|campaign|promotion|discount event)\b/i.test(
          segment
        )
      if (!CAMPAIGN_COMMERCIAL_PATTERN.test(segment) && !namesCampaign) {
        return false
      }
      return namesCampaign || (articleIdentityMatches && refersToCurrentCampaign)
    })
    .join(' ')
}

function blogReportedState(
  timingText: string
): 'live' | 'upcoming' | undefined {
  const explicit = explicitState(timingText)
  if (explicit) return explicit

  const live = /\b(?:is|are)\s+(?:live|available)\s+now\b/i.test(timingText)
  const upcoming = /\b(?:is|are)\s+coming\s+soon\b/i.test(timingText)
  return live === upcoming ? undefined : live ? 'live' : 'upcoming'
}

const EXPLICIT_CAMPAIGN_END_PATTERN =
  /\b(?:has|is)\s+(?:now\s+)?(?:ended|over|finished|closed)\b/i

function articleExplicitlyEndsKnownCampaign(
  html: string,
  known: KnownCampaign
): boolean {
  const articleHtml = blogArticleBody(html)
  const identityMatches = articleIdentifiesCampaign(
    html,
    articleHtml,
    known.name
  )
  return timingSegments(articleHtml).some((segment) =>
    segment
      .split(/\s*(?:;|—|–)\s*|,\s+(?=(?:but|while)\b)/i)
      .some((clause) => {
        if (!EXPLICIT_CAMPAIGN_END_PATTERN.test(clause)) return false
        if (campaignNameMatchesText(clause, known.name)) return true
        return (
          identityMatches &&
          /\b(?:this|the)\s+(?:sale|campaign|promotion|discount event)\b/i.test(
            clause
          )
        )
      })
  )
}

async function verifyKnownBlogCampaigns(
  fetcher: typeof fetch,
  knownCampaigns: readonly KnownCampaign[]
): Promise<readonly string[]> {
  const byUrl = new Map<string, KnownCampaign[]>()
  for (const known of knownCampaigns) {
    try {
      const officialUrl = new URL(known.officialUrl)
      if (
        officialUrl.hostname !== 'blog.playstation.com' ||
        !/^\/\d{4}\/\d{2}\/\d{2}\//.test(officialUrl.pathname)
      ) {
        continue
      }
      const group = byUrl.get(known.officialUrl) ?? []
      group.push(known)
      byUrl.set(known.officialUrl, group)
    } catch {
      // Ignore malformed persisted URLs; absence or verification failure is safe.
    }
  }

  const settled = await Promise.allSettled(
    [...byUrl.entries()].map(async ([officialUrl, knownAtUrl]) => {
      const html = await fetchOfficialText(fetcher, officialUrl)
      return knownAtUrl.flatMap((known) =>
        articleExplicitlyEndsKnownCampaign(html, known)
          ? [known.sourceUid]
          : []
      )
    })
  )
  return settled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  )
}

function linkedStoreCampaign(
  html: string,
  articleUrl: string
): LinkedStoreCampaign {
  let campaignPageUrl: string | null = null
  for (const { href } of extractAnchors(html, articleUrl)) {
    try {
      const url = new URL(href)
      if (url.hostname !== 'store.playstation.com') continue

      const match = /^\/en-us\/category\/([a-z0-9-]+)(?:\/\d+)?\/?$/i.exec(
        url.pathname
      )
      if (match) {
        return {
          campaignPageUrl,
          categoryUrl: canonicalCategoryUrl(match[1]),
        }
      }

      const pageMatch = /^\/(?:en-us\/)?pages\/([^/]+)\/?$/i.exec(url.pathname)
      if (!pageMatch) continue
      const pageIdentity = decodeURIComponent(pageMatch[1])
        .replace(/[-_]+/g, ' ')
        .trim()
      if (
        /^(?:latest|deals|collections)$/i.test(pageIdentity) ||
        isPermanentNavigationIdentity(pageIdentity)
      ) {
        continue
      }
      url.hash = ''
      url.search = ''
      campaignPageUrl ??= url.toString()
    } catch {
      // Ignore malformed article links.
    }
  }
  return { campaignPageUrl, categoryUrl: null }
}

function qualifyingBlogSale(
  title: string,
  text: string,
  articleHtml: string,
  hasCategory: boolean
): boolean {
  const combined = `${title} ${text.slice(0, 6_000)}`
  if (isPermanentNavigationIdentity(title)) return false
  if (!CAMPAIGN_COMMERCIAL_PATTERN.test(combined)) return false
  if (!hasCategory && !/\bPlayStation Store\b/i.test(combined)) return false
  if (
    /\b(?:ps plus monthly games|playstation plus monthly games|free play days?|demos?)\b/i.test(
      title
    ) ||
    (BLOG_EXCLUSION_PATTERN.test(combined) &&
      !hasCampaignBreadthEvidence(combined, articleHtml))
  ) {
    return false
  }
  if (
    /\b(?:free games?|giveaways?)\b/i.test(combined) &&
    !/\b(?:sale|sales|deals?|savings|discounts?|\d+%\s+off|save\s+\d+)\b/i.test(
      combined
    )
  ) {
    return false
  }
  if (
    NON_DIGITAL_SCOPE_PATTERN.test(combined) &&
    !hasDigitalSaleEvidence(combined)
  ) {
    return false
  }
  return hasCampaignBreadthEvidence(combined, articleHtml)
}

async function parseBlogArticle(
  fetcher: typeof fetch,
  now: Date,
  href: string,
  label: string
): Promise<ParsedBlogArticle> {
  const html = await fetchOfficialText(fetcher, href)
  const articleHtml = blogArticleBody(html)
  const title = cleanCampaignName(extractMeta(html, 'og:title') ?? label)
  if (!title) return { campaign: null }
  const text = textFromHtml(articleHtml)
  const storeLink = linkedStoreCampaign(articleHtml, href)
  if (
    !qualifyingBlogSale(
      title,
      text,
      articleHtml,
      Boolean(storeLink.categoryUrl || storeLink.campaignPageUrl)
    )
  ) {
    return { campaign: null }
  }

  const identity = storeLink.categoryUrl ?? href
  const timingText = blogCampaignTimingText(
    articleHtml,
    title,
    articleIdentifiesCampaign(html, articleHtml, title)
  )
  const timing = campaignTiming(
    timingText,
    now,
    false,
    blogReportedState(timingText)
  )
  if (timing.ended) return { campaign: null, endedIdentity: identity }
  if (!timing.state) return { campaign: null }

  return {
    allowsStoreNameMatch: Boolean(
      storeLink.campaignPageUrl && !storeLink.categoryUrl
    ),
    campaign: campaign({
      sourceUid: identity,
      name: title,
      storeSlug: 'playstation-store',
      state: timing.state,
      lifecycleBasis: timing.lifecycleBasis,
      ...(timing.starts ? { starts: timing.starts } : {}),
      ...(timing.ends ? { ends: timing.ends } : {}),
      officialUrl: identity,
      sourceUrl: href,
      artworkUrl: extractOfficialArtwork(html, href),
    }),
  }
}

function mergeCampaigns(
  storeCampaigns: readonly DetectedCampaign[],
  blogCampaigns: readonly BlogCampaign[]
): readonly DetectedCampaign[] {
  const campaigns = new Map(storeCampaigns.map((entry) => [entry.sourceUid, entry]))
  const storesByName = new Map<string, DetectedCampaign[]>()
  for (const store of storeCampaigns) {
    const name = store.name.toLowerCase().replace(/\s+/g, ' ').trim()
    const matches = storesByName.get(name) ?? []
    matches.push(store)
    storesByName.set(name, matches)
  }

  for (const blogEntry of blogCampaigns) {
    const blog = blogEntry.campaign
    let targetSourceUid = blog.sourceUid
    let store = campaigns.get(targetSourceUid)
    if (!store && blogEntry.allowsStoreNameMatch) {
      const normalizedName = blog.name.toLowerCase().replace(/\s+/g, ' ').trim()
      const nameMatches = storesByName.get(normalizedName) ?? []
      if (nameMatches.length === 1) {
        store = nameMatches[0]
        targetSourceUid = store.sourceUid
      }
    }
    if (!store) {
      campaigns.set(blog.sourceUid, blog)
      continue
    }
    if (blog.state !== store.state) continue

    const mergeBoundary = (
      storeBoundary: SourceBoundary | undefined,
      blogBoundary: SourceBoundary | undefined
    ): SourceBoundary | undefined => {
      if (!storeBoundary) return blogBoundary
      if (!blogBoundary) return storeBoundary
      if (
        storeBoundary.precision === 'date' &&
        blogBoundary.precision === 'datetime' &&
        blogBoundary.value.slice(0, 10) === storeBoundary.value
      ) {
        return blogBoundary
      }
      return storeBoundary
    }
    const starts = mergeBoundary(store.starts, blog.starts)
    const ends = mergeBoundary(store.ends, blog.ends)
    const blogProvidesExactRange =
      blog.lifecycleBasis === 'exact-time' &&
      starts?.precision === 'datetime' &&
      ends?.precision === 'datetime' &&
      starts.value === blog.starts?.value &&
      ends.value === blog.ends?.value
    const lifecycleBasis =
      store.lifecycleBasis === 'exact-time' || !blogProvidesExactRange
        ? store.lifecycleBasis
        : 'exact-time'
    campaigns.set(targetSourceUid, {
      ...store,
      ...(starts ? { starts } : {}),
      ...(ends ? { ends } : {}),
      lifecycleBasis,
      artworkUrl: store.artworkUrl ?? blog.artworkUrl,
    })
  }
  return [...campaigns.values()]
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
  endedIdentities: ReadonlySet<string>,
  now: Date
): readonly string[] {
  const ended = new Set([...endedIdentities].map(comparableIdentity))
  return knownCampaigns.flatMap((known) => {
    const exactEndPassed =
      Boolean(known.endsAt) &&
      Number.isFinite(Date.parse(known.endsAt!)) &&
      now.getTime() >= Date.parse(known.endsAt!)
    return exactEndPassed ||
      ended.has(comparableIdentity(known.sourceUid)) ||
      ended.has(comparableIdentity(known.officialUrl))
      ? [known.sourceUid]
      : []
  })
}

export const runPlayStationStoreAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const [deals, latest] = await Promise.all([
    getExperience(fetch, 'deals'),
    getExperience(fetch, 'latest'),
  ])
  const candidates = storeCandidates([deals, latest])

  for (const candidate of candidates.values()) {
    if (bestName(candidate.names) || !candidate.localizedKeyId) continue
    const publicText = await getDefaultView(fetch, candidate)
    candidate.publicText.push(...publicText)
    candidate.names.push(
      ...publicText.map((value) => ({ priority: 100, value }))
    )
  }

  const endedIdentities = new Set<string>()
  const storeCampaigns = [...candidates.values()].flatMap((candidate) => {
    const result = detectedStoreCampaign(candidate, now)
    if (result.endedIdentity) endedIdentities.add(result.endedIdentity)
    return result.campaign ? [result.campaign] : []
  })

  let blogHtml: string | null = null
  try {
    blogHtml = await fetchOfficialText(fetch, BLOG_URL)
  } catch {
    // Blog is complementary; the required Store persisted contracts succeeded.
  }
  const blogResults = blogHtml
    ? await Promise.allSettled(
        blogCampaignLinks(blogHtml).map(({ href, label }) =>
          parseBlogArticle(fetch, now, href, label)
        )
      )
    : []
  const blogCampaigns = blogResults.flatMap((result) => {
    if (result.status !== 'fulfilled') return []
    if (result.value.endedIdentity) {
      endedIdentities.add(result.value.endedIdentity)
    }
    return result.value.campaign
      ? [
          {
            allowsStoreNameMatch: Boolean(result.value.allowsStoreNameMatch),
            campaign: result.value.campaign,
          },
        ]
      : []
  })

  const campaigns = mergeCampaigns(storeCampaigns, blogCampaigns)
  const currentSourceUids = new Set(
    campaigns.map(({ sourceUid }) => comparableIdentity(sourceUid))
  )
  const verifiedBlogEnds = await verifyKnownBlogCampaigns(fetch, knownCampaigns)
  const explicitlyEndedSourceUids = uniqueBy(
    [
      ...knownExplicitEnds(knownCampaigns, endedIdentities, now),
      ...verifiedBlogEnds,
    ],
    (value) => value
  ).filter((sourceUid) => !currentSourceUids.has(comparableIdentity(sourceUid)))

  return {
    storeSlug: 'playstation-store',
    sourceUrl: DEALS_URL,
    sourceUrls: [DEALS_URL, GRAPHQL_URL, LATEST_URL, BLOG_URL],
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
