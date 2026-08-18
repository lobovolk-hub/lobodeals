import {
  normalizePsdealsCommercialState,
  parsePsdealsDiscountSignal,
  parsePsdealsPriceSignal,
} from './psdeals-commercial-state.mjs'

export function normalizeComparableMoney(value) {
  return parsePsdealsPriceSignal(value).amount
}

export function normalizeComparableDiscount(value) {
  const signal = parsePsdealsDiscountSignal(value)
  return signal.kind === 'integer' ? Math.abs(signal.percent) : null
}

function moneyEqual(left, right) {
  const a = normalizeComparableMoney(left)
  const b = normalizeComparableMoney(right)

  if (a === null && b === null) return true
  if (a === null || b === null) return false

  return Math.abs(a - b) < 0.01
}

function discountEqual(left, right) {
  const a = normalizeComparableDiscount(left)
  const b = normalizeComparableDiscount(right)

  if (a === null && b === null) return true
  if (a === null || b === null) return false

  return a === b
}

function getRawCurrentPsPlusPrice(dbItem) {
  return normalizeComparableMoney(
    dbItem?.raw_detail_json?.current_ps_plus_price_amount
  )
}

function uniqueReasons(reasons) {
  return [...new Set(reasons)]
}

export function getListingCommercialState(listingItem = {}) {
  const source = listingItem?.commercial_state?.source || {}

  return normalizePsdealsCommercialState({
    currentPrice:
      source.current_price ?? listingItem.current_price_amount ?? null,
    originalPrice:
      source.original_price ?? listingItem.original_price_amount ?? null,
    discountPercent:
      source.discount_percent ?? listingItem.discount_percent ?? null,
    sourceContext: 'discount_listing',
  })
}

export function classifyFastRefreshItem(listingItem = {}, dbItem = null) {
  const commercialState = getListingCommercialState(listingItem)
  const reasons = []

  if (
    !commercialState.is_valid ||
    commercialState.requires_detail_revalidation
  ) {
    reasons.push(...commercialState.reason_codes)
  }

  if (!dbItem) {
    reasons.unshift('new_item')

    return {
      shouldRefresh: true,
      reasons: uniqueReasons(reasons),
      commercialState,
    }
  }

  const listingCurrentPrice = commercialState.current_price_amount
  const listingOriginalPrice = commercialState.original_price_amount
  const listingDiscountPercent =
    commercialState.discount_percent_normalized

  if (
    listingCurrentPrice !== null &&
    !moneyEqual(listingCurrentPrice, dbItem.current_price_amount)
  ) {
    reasons.push('current_price_mismatch')
  }

  if (
    listingOriginalPrice !== null &&
    !moneyEqual(listingOriginalPrice, dbItem.original_price_amount)
  ) {
    reasons.push('original_price_mismatch')
  }

  if (
    listingDiscountPercent !== null &&
    !discountEqual(listingDiscountPercent, dbItem.discount_percent)
  ) {
    reasons.push('discount_percent_mismatch')
  }

  if (!dbItem.detail_last_synced_at) {
    reasons.push('detail_never_synced')
  }

  const hasDiscountSignal =
    listingDiscountPercent !== null &&
    listingDiscountPercent > 0 &&
    listingDiscountPercent < 100

  const listingLooksLikePsPlusOnly =
    hasDiscountSignal &&
    (
      listingOriginalPrice === null ||
      (
        listingCurrentPrice !== null &&
        listingOriginalPrice !== null &&
        moneyEqual(listingCurrentPrice, listingOriginalPrice)
      )
    )

  const dbLooksPsPlusButRawMissing =
    dbItem.is_ps_plus_discount === true &&
    getRawCurrentPsPlusPrice(dbItem) === null

  if (listingLooksLikePsPlusOnly) {
    reasons.push('ps_plus_risk_listing_discount_without_regular_sale')
  }

  if (dbLooksPsPlusButRawMissing) {
    reasons.push('ps_plus_risk_missing_raw_price')
  }

  const unique = uniqueReasons(reasons)

  return {
    shouldRefresh: unique.length > 0,
    reasons: unique,
    commercialState,
  }
}

function getAgeHours(value, nowMs) {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  return (nowMs - parsed.getTime()) / 1000 / 60 / 60
}

function rowKey(row, index) {
  return (
    row?.listing?.psdeals_url ??
    row?.listing?.psdeals_id ??
    `row:${index}`
  )
}

function dedupeRows(rows) {
  const found = new Map()

  rows.forEach((row, index) => {
    const key = rowKey(row, index)
    if (!found.has(key)) found.set(key, row)
  })

  return [...found.values()]
}

const LISTING_OWNED_SAFE_REASON_CODES = new Set([
  'current_price_mismatch',
  'original_price_mismatch',
  'discount_percent_mismatch',
])

function isListingOwnedSafeCommercialChange(row) {
  const reasons = Array.isArray(row?.reasons) ? row.reasons : []

  return Boolean(
    row?.db &&
    row?.commercialState?.is_safe_for_price_update === true &&
    reasons.length > 0 &&
    reasons.every((reason) => LISTING_OWNED_SAFE_REASON_CODES.has(reason))
  )
}

function isPsPlusDiscoveryCandidate(row) {
  return Boolean(
    row?.db &&
    row?.db?.is_ps_plus_discount !== true &&
    row?.commercialState?.classification === 'regular_discount' &&
    row?.commercialState?.is_safe_for_price_update === true
  )
}

function compareOldestDetailFirst(left, right) {
  const leftTime = left?.db?.detail_last_synced_at
    ? new Date(left.db.detail_last_synced_at).getTime()
    : 0
  const rightTime = right?.db?.detail_last_synced_at
    ? new Date(right.db.detail_last_synced_at).getTime()
    : 0
  const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0
  const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0

  if (safeLeftTime !== safeRightTime) return safeLeftTime - safeRightTime

  return String(rowKey(left, 0)).localeCompare(String(rowKey(right, 0)))
}

export function selectFastRefreshQueues(analyzedRows, {
  staleLimit = 500,
  staleHours = 24,
  psPlusRecheckLimit = 500,
  psPlusDiscoveryLimit = 0,
  psPlusDiscoveryHours = 7 * 24,
  nowMs = Date.now(),
} = {}) {
  const analyzed = Array.isArray(analyzedRows) ? analyzedRows : []
  const boundedStaleLimit = Math.max(0, Math.trunc(Number(staleLimit) || 0))
  const boundedPsPlusRecheckLimit = Math.max(
    0,
    Math.trunc(Number(psPlusRecheckLimit) || 0)
  )
  const boundedPsPlusDiscoveryLimit = Math.max(
    0,
    Math.trunc(Number(psPlusDiscoveryLimit) || 0)
  )
  const safeStaleHours = Math.max(0, Number(staleHours) || 0)
  const safePsPlusDiscoveryHours = Math.max(
    0,
    Number(psPlusDiscoveryHours) || 0
  )
  const listingOwnedSafeChanges = dedupeRows(
    analyzed.filter(
      (row) =>
        row?.shouldRefresh === true &&
        isListingOwnedSafeCommercialChange(row)
    )
  )
  const mustRefresh = dedupeRows(
    analyzed.filter(
      (row) =>
        row?.shouldRefresh === true &&
        !isListingOwnedSafeCommercialChange(row)
    )
  )
  const mustKeys = new Set(
    mustRefresh.map((row, index) => rowKey(row, index))
  )

  const rotationCandidates = dedupeRows(
    analyzed.filter((row, index) =>
      !mustKeys.has(rowKey(row, index))
    )
  )
    .map((row) => ({
      ...row,
      detailAgeHours: getAgeHours(
        row?.db?.detail_last_synced_at,
        nowMs
      ),
    }))
    .sort(compareOldestDetailFirst)

  const psPlusRecheckCandidates = rotationCandidates
    .filter(
      (row) =>
        row?.db?.is_ps_plus_discount === true &&
        (
          row.detailAgeHours === null ||
          row.detailAgeHours >= safeStaleHours
        )
    )
    .slice(0, boundedPsPlusRecheckLimit)
    .map((row) => ({
      ...row,
      reasons: [...(row.reasons || []), 'ps_plus_revalidation'],
    }))

  const psPlusKeys = new Set(
    psPlusRecheckCandidates.map((row, index) => rowKey(row, index))
  )

  const psPlusDiscoveryCandidates = rotationCandidates
    .filter((row, index) => {
      const key = rowKey(row, index)
      return (
        isPsPlusDiscoveryCandidate(row) &&
        !mustKeys.has(key) &&
        !psPlusKeys.has(key) &&
        (
          row.detailAgeHours === null ||
          row.detailAgeHours >= safePsPlusDiscoveryHours
        )
      )
    })
    .slice(0, boundedPsPlusDiscoveryLimit)
    .map((row) => ({
      ...row,
      reasons: [
        ...(row.reasons || []),
        'ps_plus_discovery_stale_regular_discount',
      ],
    }))

  const psPlusDiscoveryKeys = new Set(
    psPlusDiscoveryCandidates.map((row, index) => rowKey(row, index))
  )

  const staleCandidates = rotationCandidates
    .filter((row, index) => {
      const key = rowKey(row, index)
      return (
        row?.db?.is_ps_plus_discount !== true &&
        !mustKeys.has(key) &&
        !psPlusKeys.has(key) &&
        !psPlusDiscoveryKeys.has(key) &&
        (
          row.detailAgeHours === null ||
          row.detailAgeHours >= safeStaleHours
        )
      )
    })
    .slice(0, boundedStaleLimit)
    .map((row) => ({
      ...row,
      reasons: [...(row.reasons || []), 'stale_rotation'],
    }))

  const combined = dedupeRows([
    ...mustRefresh,
    ...psPlusRecheckCandidates,
    ...psPlusDiscoveryCandidates,
    ...staleCandidates,
  ])
  const selectedKeys = new Set(
    combined.map((row, index) => rowKey(row, index))
  )
  const skippedSafe = dedupeRows(
    analyzed.filter(
      (row, index) => !selectedKeys.has(rowKey(row, index))
    )
  )

  return {
    mustRefresh,
    listingOwnedSafeChanges,
    psPlusRecheckCandidates,
    psPlusDiscoveryCandidates,
    staleCandidates,
    combined,
    skippedSafe,
    boundedStaleLimit,
    boundedPsPlusRecheckLimit,
    boundedPsPlusDiscoveryLimit,
    staleHours: safeStaleHours,
    psPlusDiscoveryHours: safePsPlusDiscoveryHours,
  }
}

export function summarizeCommercialClassifications(analyzedRows) {
  const counts = new Map()

  for (const row of Array.isArray(analyzedRows) ? analyzedRows : []) {
    const classification =
      row?.commercialState?.classification || 'unknown'
    counts.set(classification, (counts.get(classification) || 0) + 1)
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )
  )
}
