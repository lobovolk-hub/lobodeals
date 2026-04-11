export type PcSectionKey =
  | 'all'
  | 'best-deals'
  | 'latest-discounts'
  | 'latest-releases'
  | 'biggest-discount'
  | 'top-rated'

export type PcSectionSortableColumn =
  | 'discount_percent'
  | 'metacritic'
  | 'sort_latest'
  | 'title'
  | 'price_last_synced_at'
  | 'normal_price'

export type PcSectionSortRule = {
  column: PcSectionSortableColumn
  ascending: boolean
  nullsFirst?: boolean
}

export type PcSectionTimeContext = {
  nowEpoch: number
  latestReleasesMinEpoch: number
}

export type PcSectionFilterSpec = {
  requireDiscount: boolean
  requireActiveOffer: boolean
  requireMetacritic: boolean
  minDiscountPercent?: number
  minMetacritic?: number
  minSortLatest?: number
  maxSortLatest?: number
}

export type PcSectionComparableRow = {
  title?: string | null
  discount_percent?: number | string | null
  has_active_offer?: boolean | null
  sort_latest?: number | string | null
  metacritic?: number | string | null
  price_last_synced_at?: string | null
  normal_price?: number | string | null
}

export const PC_SECTION_KEYS: readonly PcSectionKey[] = [
  'all',
  'best-deals',
  'latest-discounts',
  'latest-releases',
  'biggest-discount',
  'top-rated',
] as const

export const BEST_DEALS_MIN_METACRITIC = 60
export const BEST_DEALS_MIN_DISCOUNT = 70
export const LATEST_RELEASES_WINDOW_DAYS = 30

const PC_SECTION_LABELS: Record<PcSectionKey, string> = {
  all: 'PC',
  'best-deals': 'Best Deals',
  'latest-discounts': 'Latest Discounts',
  'latest-releases': 'Latest Releases',
  'biggest-discount': 'Biggest Discounts',
  'top-rated': 'Top Rated',
}

const PC_SECTION_SORT_RULES: Record<PcSectionKey, PcSectionSortRule[]> = {
  all: [
    { column: 'discount_percent', ascending: false, nullsFirst: false },
    { column: 'title', ascending: true },
  ],
  'best-deals': [
    { column: 'metacritic', ascending: false, nullsFirst: false },
    { column: 'discount_percent', ascending: false, nullsFirst: false },
    { column: 'normal_price', ascending: false, nullsFirst: false },
    { column: 'price_last_synced_at', ascending: false, nullsFirst: false },
    { column: 'title', ascending: true },
  ],
  'latest-discounts': [
    { column: 'price_last_synced_at', ascending: false, nullsFirst: false },
    { column: 'discount_percent', ascending: false, nullsFirst: false },
    { column: 'title', ascending: true },
  ],
  'latest-releases': [
    { column: 'sort_latest', ascending: false, nullsFirst: false },
    { column: 'metacritic', ascending: false, nullsFirst: false },
    { column: 'title', ascending: true },
  ],
  'biggest-discount': [
    { column: 'discount_percent', ascending: false, nullsFirst: false },
    { column: 'normal_price', ascending: false, nullsFirst: false },
    { column: 'metacritic', ascending: false, nullsFirst: false },
    { column: 'title', ascending: true },
  ],
  'top-rated': [
    { column: 'metacritic', ascending: false, nullsFirst: false },
    { column: 'sort_latest', ascending: false, nullsFirst: false },
    { column: 'title', ascending: true },
  ],
}

export function normalizePcSectionKey(
  value: string | null | undefined
): PcSectionKey {
  const safe = String(value || '').trim().toLowerCase()

  if (safe === 'best' || safe === 'best-deals') return 'best-deals'
  if (safe === 'latest-discounts') return 'latest-discounts'
  if (safe === 'latest' || safe === 'latest-releases') return 'latest-releases'
  if (safe === 'biggest-discount') return 'biggest-discount'
  if (safe === 'top-rated') return 'top-rated'
  return 'all'
}

export function getPcSectionLabel(section: PcSectionKey): string {
  return PC_SECTION_LABELS[section]
}

export function getPcSectionTimeContext(
  nowMs: number = Date.now(),
  latestReleasesWindowDays: number = LATEST_RELEASES_WINDOW_DAYS
): PcSectionTimeContext {
  const nowEpoch = Math.floor(nowMs / 1000)
  const latestReleasesMinEpoch =
    nowEpoch - latestReleasesWindowDays * 24 * 60 * 60

  return {
    nowEpoch,
    latestReleasesMinEpoch,
  }
}

export function getPcSectionFilterSpec(
  section: PcSectionKey,
  timeContext: PcSectionTimeContext
): PcSectionFilterSpec {
  switch (section) {
    case 'best-deals':
      return {
        requireDiscount: true,
        requireActiveOffer: true,
        requireMetacritic: true,
        minDiscountPercent: BEST_DEALS_MIN_DISCOUNT,
        minMetacritic: BEST_DEALS_MIN_METACRITIC,
        maxSortLatest: timeContext.nowEpoch,
      }

    case 'latest-discounts':
      return {
        requireDiscount: true,
        requireActiveOffer: true,
        requireMetacritic: false,
        maxSortLatest: timeContext.nowEpoch,
      }

    case 'latest-releases':
      return {
        requireDiscount: false,
        requireActiveOffer: false,
        requireMetacritic: false,
        minSortLatest: timeContext.latestReleasesMinEpoch,
        maxSortLatest: timeContext.nowEpoch,
      }

    case 'biggest-discount':
      return {
        requireDiscount: true,
        requireActiveOffer: true,
        requireMetacritic: false,
        maxSortLatest: timeContext.nowEpoch,
      }

    case 'top-rated':
      return {
        requireDiscount: false,
        requireActiveOffer: false,
        requireMetacritic: true,
        maxSortLatest: timeContext.nowEpoch,
      }

    case 'all':
    default:
      return {
        requireDiscount: false,
        requireActiveOffer: false,
        requireMetacritic: false,
      }
  }
}

export function getPcSectionSortRules(
  section: PcSectionKey
): PcSectionSortRule[] {
  return PC_SECTION_SORT_RULES[section]
}

export function rowMatchesPcSection(
  row: PcSectionComparableRow,
  section: PcSectionKey,
  timeContext: PcSectionTimeContext
): boolean {
  const filter = getPcSectionFilterSpec(section, timeContext)

  const discountPercent = toFiniteNumber(row.discount_percent)
  const metacritic = toFiniteNumber(row.metacritic)
  const sortLatest = toFiniteNumber(row.sort_latest)
  const hasActiveOffer = Boolean(row.has_active_offer)

  if (filter.requireDiscount && discountPercent <= 0) {
    return false
  }

  if (
    filter.minDiscountPercent !== undefined &&
    discountPercent < filter.minDiscountPercent
  ) {
    return false
  }

  if (filter.requireActiveOffer && !hasActiveOffer) {
    return false
  }

  if (filter.requireMetacritic && metacritic <= 0) {
    return false
  }

  if (
    filter.minMetacritic !== undefined &&
    metacritic < filter.minMetacritic
  ) {
    return false
  }

  if (
    filter.minSortLatest !== undefined &&
    (sortLatest <= 0 || sortLatest < filter.minSortLatest)
  ) {
    return false
  }

  if (
    filter.maxSortLatest !== undefined &&
    sortLatest > filter.maxSortLatest
  ) {
    return false
  }

  return true
}

export function comparePcSectionRows(
  a: PcSectionComparableRow,
  b: PcSectionComparableRow,
  section: PcSectionKey
): number {
  const sortRules = getPcSectionSortRules(section)

  for (const rule of sortRules) {
    const result = compareSectionValues(
      getComparableValue(a, rule.column),
      getComparableValue(b, rule.column),
      rule.ascending,
      rule.nullsFirst ?? false
    )

    if (result !== 0) {
      return result
    }
  }

  return 0
}

function getComparableValue(
  row: PcSectionComparableRow,
  column: PcSectionSortableColumn
): number | string | null {
  switch (column) {
    case 'discount_percent':
      return normalizeNullableNumber(row.discount_percent)

    case 'metacritic':
      return normalizeNullableNumber(row.metacritic)

    case 'sort_latest':
      return normalizeNullableNumber(row.sort_latest)

    case 'price_last_synced_at':
      return normalizeNullableTimestamp(row.price_last_synced_at)

    case 'normal_price':
      return normalizeNullableNumber(row.normal_price)

    case 'title':
    default: {
      const safeTitle = String(row.title || '').trim().toLowerCase()
      return safeTitle || null
    }
  }
}

function compareSectionValues(
  a: number | string | null,
  b: number | string | null,
  ascending: boolean,
  nullsFirst: boolean
): number {
  const aIsNull = a === null
  const bIsNull = b === null

  if (aIsNull && bIsNull) return 0
  if (aIsNull) return nullsFirst ? -1 : 1
  if (bIsNull) return nullsFirst ? 1 : -1

  if (typeof a === 'string' && typeof b === 'string') {
    const result = a.localeCompare(b)
    return ascending ? result : -result
  }

  const aNumber = Number(a)
  const bNumber = Number(b)

  if (aNumber === bNumber) return 0
  if (ascending) return aNumber < bNumber ? -1 : 1
  return aNumber > bNumber ? -1 : 1
}

function toFiniteNumber(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function normalizeNullableNumber(
  value: number | string | null | undefined
): number | null {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function normalizeNullableTimestamp(
  value: string | null | undefined
): number | null {
  const safe = String(value || '').trim()
  if (!safe) return null

  const timestamp = Date.parse(safe)
  return Number.isFinite(timestamp) ? timestamp : null
}