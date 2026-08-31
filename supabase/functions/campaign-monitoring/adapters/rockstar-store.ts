import {
  campaign,
  canonicalDate,
  exactBoundary,
  exactTimeState,
  isSaleCampaignText,
  monthNumber,
} from '../_shared/campaign.ts'
import { isSafeArtworkUrl } from '../_shared/artwork.ts'
import { textFromHtml } from '../_shared/html.ts'
import { fetchOfficialJson } from '../_shared/http.ts'
import {
  extractEnglishDateOnlyRange,
  extractExactEnglishDateTimes,
} from '../_shared/time.ts'
import { sourceExplicitlyEndsCampaign } from '../_shared/verification.ts'
import {
  AdapterError,
  type AdapterResult,
  type CampaignState,
  type DetectedCampaign,
  type KnownCampaign,
  type SourceBoundary,
  type StoreAdapter,
} from '../_shared/types.ts'

const SOURCE_URL = 'https://www.rockstargames.com/newswire?tag=661'
const GRAPHQL_URL =
  'https://graph.rockstargames.com?origin=https%3A%2F%2Fwww.rockstargames.com'
const SALES_TAG_ID = 661
const PAGE_SIZE = 20
const MAX_PAGES = 25
const MAX_RESULTS = 500
const MAX_ARTICLE_TEXT = 200_000

const NEWSWIRE_LIST_QUERY = `query NewswireList($locale: String!, $page: Int!, $limit: Int, $tagId: Int, $tagIdHash: String, $metaUrl: String!, $cache: Boolean = true) {
  meta: metaUrl(url: $metaUrl, domain: "www", locale: $locale) {
    title
  }
  posts(page: $page, tagId: $tagId, tagIdHash: $tagIdHash, locale: $locale, limit: $limit) {
    paging {
      ...paging
    }
    results {
      ...postFields
    }
  }
}

fragment paging on RockstarGames_Cake_Graph_Type_Paging_o {
  pageCount
  page
  count
  nextPage
  prevPage
  perPage
}

fragment postFields on RockstarGames_Newswire_Model_Entity_Post_o {
  id: id_hash
  url
  title
  name_slug
  created
  created_formatted
  primary_tags {
    id
    name
  }
  secondary_tags {
    id
    name
  }
  preview_images_parsed {
    newswire_block {
      square
      d16x9
      _fallback
    }
  }
}`

const NEWSWIRE_POST_QUERY = `query NewswirePost($id_hash: String!, $locale: String!, $cache: Boolean = true) {
  post(id_hash: $id_hash, locale: $locale) {
    id: id_hash
    title
    subtitle
    content
    show_related
    created
    created_formatted
    posts_hero {
      type
      hero
    }
    primary_tags {
      id
      name
    }
    secondary_tags {
      id
      name
    }
    jsx
    posts_jsx {
      markup
      variables_us_defaulted
    }
    tina {
      id
      payload
      variables {
        translation_status
        keys
      }
      status
    }
    __typename @skip(if: true)
  }
  root_url_translations: metaUrlTree(domain: "www", url: "/", locale: $locale) {
    tina_tree {
      tina {
        payload
        variables {
          keys
        }
      }
    }
  }
  related: posts(limit: 4, relatedToId: $id_hash, locale: $locale) {
    results {
      ...postFields
    }
  }
}

fragment postFields on RockstarGames_Newswire_Model_Entity_Post_o {
  id: id_hash
  url
  title
  name_slug
  created
  created_formatted
  primary_tags {
    id
    name
  }
  secondary_tags {
    id
    name
  }
  preview_images_parsed {
    newswire_block {
      square
      d16x9
      _fallback
    }
  }
}`

type JsonRecord = Record<string, unknown>

type NewswireTag = Readonly<{
  id: number
  name: string
}>

type NewswireSummary = Readonly<{
  id: string
  officialUrl: string
  title: string
  tags: readonly NewswireTag[]
  artworkUrl?: string
}>

type NewswirePost = Readonly<{
  id: string
  title: string
  createdFormatted?: string
  tags: readonly NewswireTag[]
  rawText: string
  text: string
}>

type Paging = Readonly<{
  page: number
  pageCount: number
  count: number
  perPage: number
  nextPage: boolean
  prevPage: boolean
}>

type ListPage = Readonly<{
  paging: Paging
  results: readonly NewswireSummary[]
}>

type CampaignTiming = Readonly<{
  state: CampaignState | null
  lifecycleBasis: 'official-source' | 'exact-time'
  starts?: SourceBoundary
  ends?: SourceBoundary
  exactEndPassed: boolean
  dateRangeClearlyPast: boolean
}>

const queryHashCache = new Map<string, Promise<string>>()

function discoveryUnavailable(message: string): AdapterError {
  return new AdapterError('OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE', message)
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

async function sha256Hex(value: string): Promise<string> {
  let digest = queryHashCache.get(value)
  if (!digest) {
    digest = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(value))
      .then((bytes) =>
        [...new Uint8Array(bytes)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
      )
    queryHashCache.set(value, digest)
  }
  return digest
}

function graphQlErrorMessages(envelope: JsonRecord): readonly string[] {
  if (envelope.errors === undefined || envelope.errors === null) return []
  if (!Array.isArray(envelope.errors)) {
    throw discoveryUnavailable('Rockstar GraphQL returned malformed errors')
  }

  return envelope.errors.map((value) => {
    const message = asRecord(value)?.message
    return typeof message === 'string' && message.trim()
      ? message.trim()
      : 'Unknown GraphQL error'
  })
}

function graphQlData(value: unknown, operationName: string): unknown {
  const envelope = asRecord(value)
  if (!envelope) {
    throw discoveryUnavailable(
      `Rockstar ${operationName} did not return a GraphQL envelope`
    )
  }
  const errors = graphQlErrorMessages(envelope)
  if (errors.length > 0) {
    throw discoveryUnavailable(
      `Rockstar ${operationName} returned GraphQL errors: ${errors.join('; ')}`
    )
  }
  if (!Object.hasOwn(envelope, 'data') || envelope.data === null) {
    throw discoveryUnavailable(
      `Rockstar ${operationName} did not return GraphQL data`
    )
  }
  return envelope.data
}

async function graphQlGet(
  fetcher: typeof fetch,
  operationName: 'NewswireList' | 'NewswirePost',
  query: string,
  variables: Readonly<Record<string, unknown>>
): Promise<unknown> {
  const hash = await sha256Hex(query)
  const requestUrl = (includeQuery: boolean): string => {
    const url = new URL(GRAPHQL_URL)
    url.searchParams.set('operationName', operationName)
    url.searchParams.set('variables', JSON.stringify(variables))
    url.searchParams.set(
      'extensions',
      JSON.stringify({
        persistedQuery: { version: 1, sha256Hash: hash },
      })
    )
    if (includeQuery) url.searchParams.set('query', query)
    return url.toString()
  }

  const first = await fetchOfficialJson<unknown>(fetcher, requestUrl(false))
  const firstEnvelope = asRecord(first)
  if (!firstEnvelope) {
    throw discoveryUnavailable(
      `Rockstar ${operationName} did not return a GraphQL envelope`
    )
  }
  const firstErrors = graphQlErrorMessages(firstEnvelope)
  const persistedQueryMiss =
    firstErrors.length > 0 &&
    firstErrors.every((message) => /PersistedQueryNotFound/i.test(message))

  if (!persistedQueryMiss) return graphQlData(first, operationName)

  const fallback = await fetchOfficialJson<unknown>(fetcher, requestUrl(true))
  return graphQlData(fallback, operationName)
}

function parseTags(value: unknown, context: string): readonly NewswireTag[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw discoveryUnavailable(`${context} tags are no longer an array`)
  }

  return value.map((entry) => {
    const tag = asRecord(entry)
    const numericId =
      typeof tag?.id === 'string' && /^\d+$/.test(tag.id)
        ? Number(tag.id)
        : integer(tag?.id)
    if (!tag || numericId === null || typeof tag.name !== 'string') {
      throw discoveryUnavailable(`${context} contains an unrecognizable tag`)
    }
    return { id: numericId, name: tag.name.trim() }
  })
}

function isSalesTag(tag: NewswireTag): boolean {
  return tag.id === SALES_TAG_ID && tag.name.toLowerCase() === 'sales'
}

function canonicalArticleUrl(value: string, expectedId?: string): string | null {
  try {
    const url = new URL(value, 'https://www.rockstargames.com')
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.hostname !== 'www.rockstargames.com' ||
      url.username ||
      url.password
    ) {
      return null
    }
    const match = /^\/newswire\/article\/([^/]+)\/[^/]+\/?$/i.exec(
      url.pathname
    )
    if (!match || (expectedId && match[1] !== expectedId)) return null

    url.protocol = 'https:'
    url.port = ''
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return null
  }
}

function articleId(value: string): string | null {
  const normalized = canonicalArticleUrl(value)
  return normalized
    ? /^\/newswire\/article\/([^/]+)\//i.exec(new URL(normalized).pathname)?.[1] ??
        null
    : null
}

function rockstarArtwork(value: unknown): string | undefined {
  if (!isSafeArtworkUrl(value)) return undefined
  const hostname = new URL(value).hostname
  return hostname === 'media-rockstargames-com.akamaized.net' ||
    hostname === 'www.rockstargames.com'
    ? value
    : undefined
}

function summaryArtwork(result: JsonRecord): string | undefined {
  const parsed = asRecord(result.preview_images_parsed)
  const block = asRecord(parsed?.newswire_block)
  return (
    rockstarArtwork(block?.d16x9) ??
    rockstarArtwork(block?.square) ??
    rockstarArtwork(block?._fallback)
  )
}

function parseSummary(value: unknown): NewswireSummary {
  const result = asRecord(value)
  if (
    !result ||
    typeof result.id !== 'string' ||
    !result.id.trim() ||
    typeof result.url !== 'string' ||
    typeof result.title !== 'string' ||
    !result.title.trim()
  ) {
    throw discoveryUnavailable(
      'Rockstar NewswireList returned unrecognizable article identity'
    )
  }
  const officialUrl = canonicalArticleUrl(result.url, result.id)
  if (!officialUrl) {
    throw discoveryUnavailable(
      'Rockstar NewswireList returned a non-official article URL'
    )
  }

  return {
    id: result.id,
    officialUrl,
    title: result.title.trim(),
    tags: [
      ...parseTags(result.primary_tags, `Rockstar article ${result.id}`),
      ...parseTags(result.secondary_tags, `Rockstar article ${result.id}`),
    ],
    artworkUrl: summaryArtwork(result),
  }
}

function parseListPage(value: unknown, requestedPage: number): ListPage {
  const data = asRecord(value)
  const meta = asRecord(data?.meta)
  const posts = asRecord(data?.posts)
  const paging = asRecord(posts?.paging)
  const results = posts?.results
  if (
    !data ||
    !meta ||
    typeof meta.title !== 'string' ||
    !/\bNewswire\b/i.test(meta.title) ||
    !posts ||
    !paging ||
    !Array.isArray(results)
  ) {
    throw discoveryUnavailable(
      'Rockstar NewswireList no longer exposes the recognized Newswire contract'
    )
  }

  const page = integer(paging.page)
  const pageCount = integer(paging.pageCount)
  const count = integer(paging.count)
  const perPage = integer(paging.perPage)
  const nextPage = paging.nextPage
  const prevPage = paging.prevPage
  if (
    page === null ||
    pageCount === null ||
    count === null ||
    perPage === null ||
    typeof nextPage !== 'boolean' ||
    typeof prevPage !== 'boolean' ||
    page !== requestedPage ||
    page < 1 ||
    pageCount < 0 ||
    pageCount > MAX_PAGES ||
    count < 0 ||
    count > MAX_RESULTS ||
    perPage < 1 ||
    perPage > 100 ||
    pageCount !== (count === 0 ? 0 : Math.ceil(count / perPage)) ||
    nextPage !== (page < pageCount) ||
    prevPage !== (page > 1) ||
    results.length > perPage ||
    (pageCount === 0 && results.length !== 0) ||
    (pageCount > 0 && page > pageCount) ||
    (page < pageCount && results.length !== perPage) ||
    (page === pageCount && results.length !== count - perPage * (page - 1))
  ) {
    throw discoveryUnavailable(
      'Rockstar NewswireList returned incoherent Sales pagination'
    )
  }

  return {
    paging: { page, pageCount, count, perPage, nextPage, prevPage },
    results: results.map(parseSummary),
  }
}

async function fetchSalesSurface(
  fetcher: typeof fetch
): Promise<readonly NewswireSummary[]> {
  const results: NewswireSummary[] = []
  const seenPages = new Set<number>()
  const seenArticles = new Set<string>()
  let expectedPaging: Omit<Paging, 'page' | 'nextPage' | 'prevPage'> | null = null

  for (let requestedPage = 1; requestedPage <= MAX_PAGES; requestedPage += 1) {
    if (seenPages.has(requestedPage)) {
      throw discoveryUnavailable('Rockstar Sales pagination repeated a page')
    }
    seenPages.add(requestedPage)
    const page = parseListPage(
      await graphQlGet(fetcher, 'NewswireList', NEWSWIRE_LIST_QUERY, {
        tagIdHash: String(SALES_TAG_ID),
        page: requestedPage,
        metaUrl: '/newswire',
        limit: PAGE_SIZE,
        locale: 'en_us',
      }),
      requestedPage
    )

    const stablePaging = {
      pageCount: page.paging.pageCount,
      count: page.paging.count,
      perPage: page.paging.perPage,
    }
    if (
      expectedPaging &&
      (expectedPaging.pageCount !== stablePaging.pageCount ||
        expectedPaging.count !== stablePaging.count ||
        expectedPaging.perPage !== stablePaging.perPage)
    ) {
      throw discoveryUnavailable(
        'Rockstar Sales pagination changed during discovery'
      )
    }
    expectedPaging ??= stablePaging

    for (const result of page.results) {
      if (seenArticles.has(result.id)) {
        throw discoveryUnavailable(
          'Rockstar Sales pagination repeated an article'
        )
      }
      seenArticles.add(result.id)
      results.push(result)
    }

    if (!page.paging.nextPage) {
      if (results.length !== page.paging.count) {
        throw discoveryUnavailable(
          'Rockstar Sales pagination did not return its declared result count'
        )
      }
      return results
    }
  }

  throw discoveryUnavailable('Rockstar Sales pagination exceeded its safe limit')
}

function collectStrings(value: unknown): readonly string[] {
  const strings: string[] = []
  const stack: unknown[] = [value]
  let length = 0

  while (stack.length > 0 && length < MAX_ARTICLE_TEXT) {
    const current = stack.pop()
    if (typeof current === 'string') {
      const remaining = MAX_ARTICLE_TEXT - length
      const text = current.slice(0, remaining)
      strings.push(text)
      length += text.length
      continue
    }
    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push(current[index])
      }
      continue
    }
    const record = asRecord(current)
    if (record) stack.push(...Object.values(record).reverse())
  }

  return strings
}

function parsePost(value: unknown, expectedId: string): NewswirePost {
  const data = asRecord(value)
  const post = asRecord(data?.post)
  if (
    !post ||
    post.id !== expectedId ||
    typeof post.title !== 'string' ||
    !post.title.trim()
  ) {
    throw discoveryUnavailable(
      `Rockstar NewswirePost no longer exposes article ${expectedId}`
    )
  }
  const strings = collectStrings([
    post.title,
    post.subtitle,
    post.content,
    post.posts_jsx,
    post.tina,
  ])
  const rawText = strings.join(' ')

  return {
    id: expectedId,
    title: post.title.trim(),
    createdFormatted:
      typeof post.created_formatted === 'string'
        ? post.created_formatted
        : undefined,
    tags: [
      ...parseTags(post.primary_tags, `Rockstar article ${expectedId}`),
      ...parseTags(post.secondary_tags, `Rockstar article ${expectedId}`),
    ],
    rawText,
    text: textFromHtml(rawText).replace(/\s+/g, ' ').trim(),
  }
}

function hasCampaignSaleIdentity(post: NewswirePost): boolean {
  const value = `${post.title} ${post.text}`
  const hasConservativeEventIdentity =
    /\bevents?\b/i.test(post.title) &&
    /\b(?:discounts?|save(?: up to)?|savings|sales?|deals?|\d{1,3}%\s+off)\b/i.test(
      value
    )
  return (
    isSaleCampaignText(post.title) ||
    /\b(?:promotions?|campaigns?|offers?)\b/i.test(post.title) ||
    hasConservativeEventIdentity ||
    /\brockstar(?: games)?\s+(?:store|warehouse)\s+(?:[\w'-]+\s+){0,6}(?:sale|sales|deals|savings)\b/i.test(
      value
    ) ||
    /\b(?:sale|sales|deals|savings)\b[^\n.]{0,80}\brockstar(?: games)?\s+(?:store|warehouse)\b/i.test(
      value
    ) ||
    /\brockstar games\s+(?:[\w&'-]+\s+){0,6}(?:sale|sales|deals|savings)\b/i.test(
      value
    )
  )
}

function articleUrls(rawText: string): readonly URL[] {
  return [...rawText.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)].flatMap(
    (match) => {
      try {
        return [new URL(match[0].replace(/[),.;]+$/, ''))]
      } catch {
        return []
      }
    }
  )
}

function isQualifyingStoreSale(post: NewswirePost): boolean {
  const identity = `${post.title} ${post.text}`
  if (!hasCampaignSaleIdentity(post)) return false
  if (/\b(?:Humble Bundle|App Store|Google Play|mobile sale)\b/i.test(identity)) {
    return false
  }

  const urls = articleUrls(post.rawText)
  const storeUrls = urls.filter((url) =>
    /^(?:store|warehouse)\.rockstargames\.com$/i.test(url.hostname)
  )
  const gameLinks = new Set(
    storeUrls
      .filter((url) => /^\/game\//i.test(url.pathname))
      .map((url) => `${url.hostname}${url.pathname}`.toLowerCase())
  )
  const hasDigitalEvidence =
    gameLinks.size >= 1 ||
    /\b(?:PC games?|games? for PC|digital games?|Rockstar Games titles?|GTA titles?|select games|multiple games|Rockstar Games Launcher)\b/i.test(
      identity
    )
  const hasExplicitMultiProductLanguage =
    /\b(?:select(?:ed)?|multiple|several|various)\s+(?:PC\s+)?(?:games|titles)\b/i.test(
      identity
    ) ||
    /\b(?:wide\s+|broad\s+|curated\s+)?(?:selection|assortment|range)\s+of\s+(?:PC\s+)?(?:games|titles)\b/i.test(
      identity
    ) ||
    /\b(?:site|store)[- ]?wide\b/i.test(identity)
  const hasCampaignBreadth =
    gameLinks.size >= 2 || hasExplicitMultiProductLanguage

  if (storeUrls.length === 0 || !hasDigitalEvidence || !hasCampaignBreadth) {
    return false
  }
  return true
}

function hasHistoricalRockstarStoreSaleEvidence(post: NewswirePost): boolean {
  return isQualifyingStoreSale(post)
}

function easternOffset(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string | null {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const expected = { year, month, day, hour, minute }
  const offsets = [
    { minutes: -300, value: '-05:00' },
    { minutes: -240, value: '-04:00' },
  ] as const
  const matches = offsets.filter((offset) => {
    const instant = new Date(
      Date.UTC(year, month - 1, day, hour, minute) - offset.minutes * 60_000
    )
    const parts = Object.fromEntries(
      formatter
        .formatToParts(instant)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)])
    )
    return Object.entries(expected).every(([key, value]) => parts[key] === value)
  })

  return matches.length === 1 ? matches[0].value : null
}

function extractEasternDateTimes(text: string): readonly SourceBoundary[] {
  const pattern =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*ET\b/gi
  const boundaries: SourceBoundary[] = []

  for (const match of text.matchAll(pattern)) {
    const month = monthNumber(match[1])
    const year = Number(match[3])
    let hour = Number(match[4])
    const minute = Number(match[5] ?? '0')
    const meridiem = match[6]?.toLowerCase().replaceAll('.', '')
    if (!month || hour > 23 || minute > 59) continue
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0

    const offset = easternOffset(
      year,
      month,
      Number(match[2]),
      hour,
      minute
    )
    if (!offset) continue
    try {
      boundaries.push(
        exactBoundary(
          `${year.toString().padStart(4, '0')}-${month
            .toString()
            .padStart(2, '0')}-${Number(match[2])
            .toString()
            .padStart(2, '0')}T${hour
            .toString()
            .padStart(2, '0')}:${minute
            .toString()
            .padStart(2, '0')}:00${offset}`
        )
      )
    } catch {
      // Ignore malformed or DST-ambiguous official prose rather than guessing.
    }
  }

  return boundaries
}

function timingSnippets(text: string): readonly string[] {
  const snippets: string[] = []
  for (const match of text.matchAll(
    /\b(?:sales?|campaign|promotion|event|deals|savings|offers)\b/gi
  )) {
    const snippet = text.slice(match.index, match.index + 600)
    if (/\b(?:starts?|begins?|ends?|until|through)\b/i.test(snippet)) {
      snippets.push(snippet)
    }
  }
  return snippets
}

function extractRockstarDateOnlyRange(
  text: string
): Readonly<{ starts: SourceBoundary; ends: SourceBoundary }> | null {
  const sharedRange = extractEnglishDateOnlyRange(text)
  if (sharedRange) return sharedRange

  const match =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s*(?:-|–|—|to|through|until)\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(
      text
    )
  if (!match) return null

  const startMonth = monthNumber(match[1])
  const endMonth = monthNumber(match[4])
  if (!startMonth || !endMonth) return null
  const starts = canonicalDate(Number(match[3]), startMonth, Number(match[2]))
  const ends = canonicalDate(Number(match[6]), endMonth, Number(match[5]))
  if (ends < starts) return null

  return {
    starts: { precision: 'date', value: starts },
    ends: { precision: 'date', value: ends },
  }
}

function campaignTiming(post: NewswirePost, now: Date): CampaignTiming {
  const snippets = timingSnippets(post.text)
  const exact = new Map<string, SourceBoundary>()
  let hasStart = false
  let hasEnd = false

  for (const snippet of snippets) {
    hasStart ||= /\b(?:starts?|begins?)\b/i.test(snippet)
    hasEnd ||= /\b(?:ends?|until|through)\b/i.test(snippet)
    for (const boundary of [
      ...extractExactEnglishDateTimes(snippet),
      ...extractEasternDateTimes(snippet),
    ]) {
      exact.set(boundary.value, boundary)
    }
  }
  const exactBoundaries = [...exact.values()].sort(
    (left, right) => Date.parse(left.value) - Date.parse(right.value)
  )

  if (hasStart && hasEnd && exactBoundaries.length >= 2) {
    const starts = exactBoundaries[0]
    const ends = exactBoundaries[exactBoundaries.length - 1]
    if (Date.parse(ends.value) > Date.parse(starts.value)) {
      const state = exactTimeState(starts, ends, now)
      return {
        state,
        lifecycleBasis: 'exact-time',
        starts,
        ends,
        exactEndPassed: state === 'ended',
        dateRangeClearlyPast: false,
      }
    }
  }

  if (hasStart && !hasEnd && exactBoundaries.length > 0) {
    const starts = exactBoundaries[0]
    return {
      state: now.getTime() < Date.parse(starts.value) ? 'upcoming' : null,
      lifecycleBasis: 'official-source',
      starts,
      exactEndPassed: false,
      dateRangeClearlyPast: false,
    }
  }

  if (hasEnd && exactBoundaries.length > 0) {
    const ends = exactBoundaries[exactBoundaries.length - 1]
    const exactEndPassed = Date.parse(ends.value) <= now.getTime()
    return {
      state: exactEndPassed ? 'ended' : null,
      lifecycleBasis: 'official-source',
      ends,
      exactEndPassed,
      dateRangeClearlyPast: false,
    }
  }

  for (const snippet of snippets) {
    const range = extractRockstarDateOnlyRange(snippet)
    if (!range) continue
    // Date-only facts have no official timezone. Requiring one complete UTC-day
    // buffer avoids treating the same calendar-day boundary as already past.
    const conservativePastCutoff = new Date(now.getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10)
    return {
      state: null,
      lifecycleBasis: 'official-source',
      ...range,
      exactEndPassed: false,
      dateRangeClearlyPast: range.ends.value < conservativePastCutoff,
    }
  }

  return {
    state: null,
    lifecycleBasis: 'official-source',
    exactEndPassed: false,
    dateRangeClearlyPast: false,
  }
}

function explicitCampaignState(post: NewswirePost): CampaignState | null {
  const isLive =
    /\b(?:sale|campaign|promotion|event)\s+(?:is\s+)?(?:live|available)\s+now\b/i.test(
      post.text
    ) ||
    /\b(?:sale|campaign|promotion|event)\s+is\s+now\s+(?:live|available)\b/i.test(
      post.text
    ) ||
    /\b(?:sales|deals|savings|offers)\s+(?:are\s+)?(?:live|available)\s+now\b/i.test(
      post.text
    ) ||
    /\b(?:sales|deals|savings|offers)\s+are\s+now\s+(?:live|available)\b/i.test(
      post.text
    ) ||
    /\bshop\s+(?:the|this)\s+(?:sale|campaign)\s+now\b/i.test(post.text)
  const isUpcoming =
    /\b(?:sale|campaign|promotion|event)\s+(?:is\s+)?coming\s+soon\b/i.test(
      post.text
    ) ||
    /\b(?:sale|campaign|promotion|event)\s+(?:starts?|begins?)\s+soon\b/i.test(
      post.text
    ) ||
    /\b(?:sales|deals|savings|offers)\s+(?:are\s+)?coming\s+soon\b/i.test(
      post.text
    ) ||
    /\b(?:sales|deals|savings|offers)\s+(?:start|begin)\s+soon\b/i.test(
      post.text
    )

  if (isLive === isUpcoming) return null
  return isLive ? 'live' : 'upcoming'
}

function detectedCampaign(
  summary: NewswireSummary,
  post: NewswirePost,
  now: Date
): DetectedCampaign | null {
  if (!isQualifyingStoreSale(post)) return null
  const timing = campaignTiming(post, now)
  if (timing.dateRangeClearlyPast) return null
  const state = timing.state ?? explicitCampaignState(post)
  if (state === null || state === 'ended') return null

  return campaign({
    sourceUid: summary.officialUrl,
    name: post.title,
    storeSlug: 'rockstar-store',
    state,
    lifecycleBasis: timing.lifecycleBasis,
    starts: timing.starts,
    ends: timing.ends,
    officialUrl: summary.officialUrl,
    sourceUrl: SOURCE_URL,
    artworkUrl: summary.artworkUrl,
  })
}

function rockstarSourceExplicitlyEndsCampaign(text: string): boolean {
  return (
    sourceExplicitlyEndsCampaign(text) ||
    /\b(?:sales|deals|savings|offers)\s+(?:have\s+(?:now\s+)?ended|are\s+(?:now\s+)?over)\b/i.test(
      text
    )
  )
}

async function explicitlyEndedKnownCampaigns(
  knownCampaigns: readonly KnownCampaign[],
  now: Date,
  loadPost: (id: string) => Promise<NewswirePost>
): Promise<readonly string[]> {
  const settled = await Promise.allSettled(
    knownCampaigns.map(async (known): Promise<string | null> => {
      const id = articleId(known.officialUrl) ?? articleId(known.sourceUid)
      if (!id) return null
      const post = await loadPost(id)
      if (rockstarSourceExplicitlyEndsCampaign(post.text)) {
        return known.sourceUid
      }
      return campaignTiming(post, now).exactEndPassed ? known.sourceUid : null
    })
  )

  return settled.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : []
  )
}

export const runRockstarStoreAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const summaries = await fetchSalesSurface(fetch)
  if (summaries.length === 0) {
    throw discoveryUnavailable(
      'Rockstar Sales tag 661 no longer exposes recognizable historical Sales evidence'
    )
  }

  const postCache = new Map<string, Promise<NewswirePost>>()
  const loadPost = (id: string): Promise<NewswirePost> => {
    let pending = postCache.get(id)
    if (!pending) {
      pending = graphQlGet(fetch, 'NewswirePost', NEWSWIRE_POST_QUERY, {
        id_hash: id,
        locale: 'en_us',
      }).then((data) => parsePost(data, id))
      postCache.set(id, pending)
    }
    return pending
  }

  const posts = new Map<string, NewswirePost>()
  for (const summary of summaries) {
    posts.set(summary.id, await loadPost(summary.id))
  }
  const tagVerified =
    summaries.some((summary) => summary.tags.some(isSalesTag)) ||
    [...posts.values()].some((post) => post.tags.some(isSalesTag))
  if (!tagVerified) {
    throw discoveryUnavailable(
      'Rockstar Sales tag 661 can no longer be verified as the official Sales surface'
    )
  }
  if (
    ![...posts.values()].some(hasHistoricalRockstarStoreSaleEvidence)
  ) {
    throw discoveryUnavailable(
      'Rockstar Sales tag 661 no longer exposes historical Rockstar Store or Warehouse campaign evidence'
    )
  }

  const campaigns = summaries.flatMap((summary) => {
    const post = posts.get(summary.id)
    if (!post) return []
    const detected = detectedCampaign(summary, post, now)
    return detected ? [detected] : []
  })
  const explicitlyEndedSourceUids = await explicitlyEndedKnownCampaigns(
    knownCampaigns,
    now,
    loadPost
  )

  return {
    storeSlug: 'rockstar-store',
    sourceUrl: SOURCE_URL,
    sourceUrls: [SOURCE_URL, GRAPHQL_URL],
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
