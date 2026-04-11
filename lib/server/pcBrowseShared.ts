import {
  comparePcSectionRows,
  getPcSectionFilterSpec,
  getPcSectionSortRules,
  getPcSectionTimeContext,
  normalizePcSectionKey,
  rowMatchesPcSection,
  type PcSectionComparableRow,
  type PcSectionKey,
  type PcSectionSortRule,
  type PcSectionTimeContext,
} from './pcSectionRules'

export const PC_PUBLIC_BROWSE_SELECT =
  [
    'pc_game_id',
    'steam_app_id',
    'slug',
    'title',
    'thumb',
    'is_free_to_play',
    'has_active_offer',
    'is_catalog_ready',
    'sale_price',
    'normal_price',
    'discount_percent',
    'store_id',
    'url',
    'region_code',
    'currency_code',
    'price_source',
    'price_last_synced_at',
    'sort_discount',
    'sort_latest',
    'metacritic',
    'updated_at',
  ].join(', ')

export type PcBrowseRow = {
  pc_game_id: string
  steam_app_id: string | null
  slug: string
  title: string
  thumb: string
  is_free_to_play: boolean
  has_active_offer: boolean
  is_catalog_ready: boolean
  sale_price: number | null
  normal_price: number | null
  discount_percent: number
  store_id: string | null
  url: string | null
  region_code: string | null
  currency_code: string | null
  price_source: string | null
  price_last_synced_at: string | null
  sort_discount: number
  sort_latest: number
  metacritic: number | null
  updated_at: string
}

export type PcBrowseInputSort = string | null | undefined

export type QueryOrderOptions = {
  ascending?: boolean
  nullsFirst?: boolean
}

export type QueryBuilderLike = {
  eq: (column: string, value: unknown) => QueryBuilderLike
  gt: (column: string, value: unknown) => QueryBuilderLike
  gte: (column: string, value: unknown) => QueryBuilderLike
  lt: (column: string, value: unknown) => QueryBuilderLike
  lte: (column: string, value: unknown) => QueryBuilderLike
  ilike: (column: string, value: string) => QueryBuilderLike
  or: (filters: string) => QueryBuilderLike
  order: (column: string, options?: QueryOrderOptions) => QueryBuilderLike
}

export type PcBrowseRuntimeOptions = {
  sort: PcBrowseInputSort
  query?: string | null
  maxSearchTokens?: number
  nowMs?: number
}

export type PcBrowseResolvedOptions = {
  section: PcSectionKey
  searchQuery: string
  timeContext: PcSectionTimeContext
}

export function resolvePcBrowseOptions(
  options: PcBrowseRuntimeOptions
): PcBrowseResolvedOptions {
  const section = normalizePcSectionKey(options.sort)
  const searchQuery = normalizeSearchQuery(options.query)
  const timeContext = getPcSectionTimeContext(options.nowMs)

  return {
    section,
    searchQuery,
    timeContext,
  }
}

export function applyPcSectionFilters<T extends QueryBuilderLike>(
  query: T,
  section: PcSectionKey,
  timeContext: PcSectionTimeContext
): T {
  const filterSpec = getPcSectionFilterSpec(section, timeContext)

  if (filterSpec.requireDiscount) {
    query = query.gt('discount_percent', 0) as T
  }

  if (filterSpec.requireActiveOffer) {
    query = query.eq('has_active_offer', true) as T
  }

  if (filterSpec.requireMetacritic) {
    query = query.gt('metacritic', 0) as T
  }

  if (filterSpec.minDiscountPercent !== undefined) {
    query = query.gte('discount_percent', filterSpec.minDiscountPercent) as T
  }

  if (filterSpec.minMetacritic !== undefined) {
    query = query.gte('metacritic', filterSpec.minMetacritic) as T
  }

  if (filterSpec.minSortLatest !== undefined) {
    query = query.gte('sort_latest', filterSpec.minSortLatest) as T
  }

  if (filterSpec.maxSortLatest !== undefined) {
    query = query.lte('sort_latest', filterSpec.maxSortLatest) as T
  }

  return query
}

export function applyPcSearchFilter<T extends QueryBuilderLike>(
  query: T,
  searchQuery: string,
  maxSearchTokens: number = 8
): T {
  if (!searchQuery) {
    return query
  }

  const tokens = tokenizeSearchQuery(searchQuery).slice(0, maxSearchTokens)
  if (tokens.length === 0) {
    return query
  }

  if (tokens.length === 1) {
    return query.ilike('search_title_normalized', `%${escapeForLike(tokens[0])}%`) as T
  }

  const orConditions = tokens
    .map((token) => `search_title_normalized.ilike.%${escapeForOrFilter(token)}%`)
    .join(',')

  return query.or(orConditions) as T
}

export function applyPcSectionSort<T extends QueryBuilderLike>(
  query: T,
  section: PcSectionKey
): T {
  const rules = getPcSectionSortRules(section)

  for (const rule of rules) {
    query = applyOrderRule(query, rule) as T
  }

  return query
}

export function filterPcRowsInMemory(
  rows: PcBrowseRow[],
  sort: PcBrowseInputSort,
  options?: {
    query?: string | null
    nowMs?: number
  }
): PcBrowseRow[] {
  const resolved = resolvePcBrowseOptions({
    sort,
    query: options?.query,
    nowMs: options?.nowMs,
  })

  const filteredBySection = rows.filter((row) =>
    rowMatchesPcSection(row, resolved.section, resolved.timeContext)
  )

  const filteredBySearch = resolved.searchQuery
    ? filteredBySection.filter((row) =>
        matchesSearchQuery(row, resolved.searchQuery)
      )
    : filteredBySection

  return [...filteredBySearch].sort((a, b) =>
    comparePcSectionRows(a, b, resolved.section)
  )
}

export function getHomeSectionRows(
  rows: PcBrowseRow[],
  section: PcSectionKey,
  limit: number,
  options?: {
    nowMs?: number
  }
): PcBrowseRow[] {
  const resolved = resolvePcBrowseOptions({
    sort: section,
    nowMs: options?.nowMs,
  })

  return rows
    .filter((row) =>
      rowMatchesPcSection(row, resolved.section, resolved.timeContext)
    )
    .sort((a, b) => comparePcSectionRows(a, b, resolved.section))
    .slice(0, limit)
}

export function buildPcBrowseCountQuery<T extends QueryBuilderLike>(
  query: T,
  options: PcBrowseRuntimeOptions
): T {
  const resolved = resolvePcBrowseOptions(options)

  query = applyPcSectionFilters(query, resolved.section, resolved.timeContext)
  query = applyPcSearchFilter(query, resolved.searchQuery)

  return query
}

export function buildPcBrowseDataQuery<T extends QueryBuilderLike>(
  query: T,
  options: PcBrowseRuntimeOptions
): T {
  const resolved = resolvePcBrowseOptions(options)

  query = applyPcSectionFilters(query, resolved.section, resolved.timeContext)
  query = applyPcSearchFilter(query, resolved.searchQuery)
  query = applyPcSectionSort(query, resolved.section)

  return query
}

function applyOrderRule<T extends QueryBuilderLike>(
  query: T,
  rule: PcSectionSortRule
): T {
  return query.order(rule.column, {
    ascending: rule.ascending,
    nullsFirst: rule.nullsFirst ?? false,
  }) as T
}

function matchesSearchQuery(
  row: PcSectionComparableRow,
  searchQuery: string
): boolean {
  const normalizedTitle = normalizeSearchText(String(row.title || ''))
  if (!normalizedTitle) {
    return false
  }

  const tokens = tokenizeSearchQuery(searchQuery)
  if (tokens.length === 0) {
    return true
  }

  return tokens.every((token) => normalizedTitle.includes(token))
}

function normalizeSearchQuery(value: string | null | undefined): string {
  return normalizeSearchText(String(value || ''))
}

function tokenizeSearchQuery(value: string): string[] {
  return normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™©]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeForLike(value: string): string {
  return value.replace(/[%_]/g, '')
}

function escapeForOrFilter(value: string): string {
  return value.replace(/[%_,]/g, '').trim()
}