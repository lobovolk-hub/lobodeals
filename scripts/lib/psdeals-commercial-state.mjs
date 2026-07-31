export const CERTIFIED_PRICE_RATIO_LIMIT = 20

function roundMoney(value) {
  return Number(value.toFixed(2))
}

function normalizeRawValue(value) {
  return value === undefined ? null : value
}

export function parsePsdealsPriceSignal(value) {
  const raw = normalizeRawValue(value)

  if (raw === null || raw === '') {
    return { raw, amount: null, kind: 'missing' }
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return { raw, amount: null, kind: 'unparseable' }
    }

    if (raw < 0) {
      return { raw, amount: null, kind: 'negative' }
    }

    return { raw, amount: roundMoney(raw), kind: 'amount' }
  }

  const text = String(raw).trim()
  if (!text) return { raw, amount: null, kind: 'missing' }
  if (/^FREE$/i.test(text)) return { raw, amount: 0, kind: 'free' }

  const cleaned = text.replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  if (!/[0-9]/.test(cleaned)) {
    return { raw, amount: null, kind: 'unparseable' }
  }

  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) {
    return { raw, amount: null, kind: 'unparseable' }
  }

  if (parsed < 0) {
    return { raw, amount: null, kind: 'negative' }
  }

  return { raw, amount: roundMoney(parsed), kind: 'amount' }
}

export function parsePsdealsDiscountSignal(value) {
  const raw = normalizeRawValue(value)

  if (raw === null || raw === '') {
    return { raw, percent: null, kind: 'missing' }
  }

  const text = String(raw).trim()
  if (!text) return { raw, percent: null, kind: 'missing' }

  const cleaned = text.replace(/[^0-9+.-]/g, '')
  if (!/[0-9]/.test(cleaned)) {
    return { raw, percent: null, kind: 'unparseable' }
  }

  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) {
    return { raw, percent: null, kind: 'unparseable' }
  }

  if (!Number.isInteger(parsed)) {
    return { raw, percent: parsed, kind: 'not_integer' }
  }

  return { raw, percent: parsed, kind: 'integer' }
}

function expectedDiscountPercent(currentPrice, originalPrice) {
  const currentCents = Math.round(currentPrice * 100)
  const originalCents = Math.round(originalPrice * 100)
  return Math.round(
    (100 * (originalCents - currentCents)) / originalCents
  )
}

function addSignalReason(reasons, signal, fieldName) {
  if (signal.kind === 'missing') {
    reasons.push(`${fieldName}_missing`)
  } else if (signal.kind === 'unparseable') {
    reasons.push(`${fieldName}_unparseable`)
  } else if (signal.kind === 'negative') {
    reasons.push(`${fieldName}_negative`)
  } else if (signal.kind === 'not_integer') {
    reasons.push(`${fieldName}_not_integer`)
  }
}

function uniqueReasons(reasons) {
  return [...new Set(reasons)]
}

export function normalizePsdealsCommercialState({
  currentPrice,
  originalPrice,
  discountPercent,
  sourceContext = 'unknown',
  certifiedPriceRatioLimit = CERTIFIED_PRICE_RATIO_LIMIT,
} = {}) {
  const currentSignal = parsePsdealsPriceSignal(currentPrice)
  const originalSignal = parsePsdealsPriceSignal(originalPrice)
  const discountSignal = parsePsdealsDiscountSignal(discountPercent)
  const reasons = []

  addSignalReason(reasons, currentSignal, 'current_price')
  addSignalReason(reasons, originalSignal, 'original_price')
  addSignalReason(reasons, discountSignal, 'discount_percent')

  const currentPriceAmount = currentSignal.amount
  const originalPriceAmount = originalSignal.amount
  const sourceDiscountPercent =
    discountSignal.kind === 'integer' ? discountSignal.percent : null
  const normalizedDiscountPercent =
    sourceDiscountPercent === null ? null : Math.abs(sourceDiscountPercent)
  const priceRatio =
    currentPriceAmount !== null &&
    currentPriceAmount > 0 &&
    originalPriceAmount !== null
      ? originalPriceAmount / currentPriceAmount
      : null

  let classification = 'invalid'
  let isValid = false
  let isRegularDiscountEligible = false
  let isCertifiedRegularDiscountEligible = false
  let requiresDetailRevalidation = true
  let isSafeForPriceUpdate = false
  let calculatedDiscountPercent = null

  if (discountSignal.kind === 'missing' || sourceDiscountPercent === 0) {
    if (sourceDiscountPercent === 0) {
      reasons.push('discount_percent_zero')
    }

    if (currentPriceAmount === 0) {
      classification = 'ambiguous_zero_price'
      reasons.push('zero_price_without_discount_evidence')
    } else if (
      currentPriceAmount !== null &&
      currentPriceAmount > 0 &&
      (
        originalPriceAmount === null ||
        originalPriceAmount === currentPriceAmount
      )
    ) {
      classification = 'no_discount'
      isValid = true
      requiresDetailRevalidation = sourceContext === 'discount_listing'
      isSafeForPriceUpdate = sourceContext === 'detail'

      if (requiresDetailRevalidation) {
        reasons.push('discount_expected_but_missing')
      }
    } else {
      classification = 'ambiguous_no_discount'
      reasons.push('price_tuple_incomplete_without_discount')
    }
  } else if (discountSignal.kind !== 'integer') {
    classification = 'invalid_discount_percent'
  } else if (
    normalizedDiscountPercent >= 1 &&
    normalizedDiscountPercent <= 99
  ) {
    if (currentPriceAmount === null) {
      reasons.push('current_price_required_for_discount')
    } else if (currentPriceAmount <= 0) {
      reasons.push('current_price_not_positive')
    }

    if (originalPriceAmount === null) {
      reasons.push('original_price_required_for_discount')
    } else if (originalPriceAmount <= 0) {
      reasons.push('original_price_not_positive')
    }

    if (
      currentPriceAmount !== null &&
      originalPriceAmount !== null &&
      originalPriceAmount <= currentPriceAmount
    ) {
      reasons.push('original_price_not_greater_than_current')
    }

    const hasComparablePrices =
      currentPriceAmount !== null &&
      originalPriceAmount !== null &&
      currentPriceAmount > 0 &&
      originalPriceAmount > currentPriceAmount

    if (hasComparablePrices) {
      calculatedDiscountPercent = expectedDiscountPercent(
        currentPriceAmount,
        originalPriceAmount
      )

      if (calculatedDiscountPercent !== normalizedDiscountPercent) {
        reasons.push('discount_percent_price_mismatch')
      }
    }

    const coherent =
      hasComparablePrices &&
      calculatedDiscountPercent === normalizedDiscountPercent

    if (coherent) {
      classification = 'regular_discount'
      isValid = true
      isRegularDiscountEligible = true
      isSafeForPriceUpdate = true
      requiresDetailRevalidation = false

      if (
        priceRatio !== null &&
        priceRatio <= certifiedPriceRatioLimit
      ) {
        isCertifiedRegularDiscountEligible = true
      } else {
        reasons.push('certified_price_ratio_exceeded')
        requiresDetailRevalidation = true
      }
    } else {
      classification = 'incoherent_regular_discount'
    }
  } else if (normalizedDiscountPercent === 100) {
    if (
      currentPriceAmount === 0 &&
      originalPriceAmount !== null &&
      originalPriceAmount > 0
    ) {
      classification = 'temporary_free_promotion_candidate'
      isValid = true
      requiresDetailRevalidation = sourceContext !== 'detail'
      isSafeForPriceUpdate = sourceContext === 'detail'
      reasons.push('temporary_free_promotion_candidate')

      if (requiresDetailRevalidation) {
        reasons.push('temporary_free_promotion_requires_detail')
      }
    } else if (currentPriceAmount === null) {
      classification = 'ambiguous_full_discount'
      reasons.push('full_discount_current_price_missing')
    } else if (currentPriceAmount > 0) {
      classification = 'extreme_full_discount'
      reasons.push('full_discount_positive_current_price')

      if (
        priceRatio !== null &&
        priceRatio > certifiedPriceRatioLimit
      ) {
        reasons.push('certified_price_ratio_exceeded')
      }
    } else {
      classification = 'invalid_full_discount'
      reasons.push('full_discount_invalid_price_tuple')
    }
  } else {
    classification = 'invalid_discount_percent'
    reasons.push('discount_percent_out_of_range')
  }

  return {
    source: {
      current_price: currentSignal.raw,
      original_price: originalSignal.raw,
      discount_percent: discountSignal.raw,
      context: sourceContext,
    },
    current_price_signal: currentSignal.kind,
    original_price_signal: originalSignal.kind,
    discount_percent_signal: discountSignal.kind,
    current_price_amount: currentPriceAmount,
    original_price_amount: originalPriceAmount,
    discount_percent_source: sourceDiscountPercent,
    discount_percent_normalized: normalizedDiscountPercent,
    calculated_discount_percent: calculatedDiscountPercent,
    price_ratio:
      priceRatio === null ? null : Number(priceRatio.toFixed(4)),
    certified_price_ratio_limit: certifiedPriceRatioLimit,
    classification,
    is_valid: isValid,
    reason_codes: uniqueReasons(reasons),
    is_regular_discount_eligible: isRegularDiscountEligible,
    is_certified_regular_discount_eligible:
      isCertifiedRegularDiscountEligible,
    requires_detail_revalidation: requiresDetailRevalidation,
    is_safe_for_price_update: isSafeForPriceUpdate,
  }
}
