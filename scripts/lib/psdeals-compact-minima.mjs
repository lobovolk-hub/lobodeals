export const PSDEALS_CERTIFIED_PRICE_LOW_CONTRACT_VERSION = 1
export const PSDEALS_CERTIFIED_PRICE_LOW_KINDS = Object.freeze([
  'regular',
  'ps_plus',
])

const MAX_PRICE = 99999999.99

function cleanText(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned || null
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function positiveMoney(value) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > MAX_PRICE
  ) {
    return null
  }

  return Number(value.toFixed(2))
}

function validTimestamp(value) {
  const cleaned = cleanText(value)
  if (!cleaned) return null
  const parsed = new Date(cleaned)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function exactMoney(value, expected) {
  return positiveMoney(value) === expected
}

function expectedDiscountPercent(current, original) {
  const currentCents = Math.round(current * 100)
  const originalCents = Math.round(original * 100)
  return Math.round(
    (100 * (originalCents - currentCents)) / originalCents
  )
}

function evaluateRegularObservation(observation, priceAmount, reasons) {
  const commercial = observation?.commercial_state

  if (observation?.producer !== 'listing') {
    reasons.push('regular_listing_producer_required')
  }
  if (!commercial || typeof commercial !== 'object') {
    reasons.push('regular_commercial_state_missing')
    return
  }
  if (commercial.classification !== 'regular_discount') {
    reasons.push('regular_classification_not_certifiable')
  }
  if (commercial.is_certified_regular_discount_eligible !== true) {
    reasons.push('regular_discount_not_certified_eligible')
  }
  if (!exactMoney(commercial.current_price_amount, priceAmount)) {
    reasons.push('regular_price_evidence_mismatch')
  }

  const current = positiveMoney(commercial.current_price_amount)
  const original = positiveMoney(commercial.original_price_amount)
  const percent = commercial.discount_percent_normalized

  if (current === null) reasons.push('regular_current_price_invalid')
  if (original === null) reasons.push('regular_original_price_invalid')
  if (current !== null && original !== null && original <= current) {
    reasons.push('regular_original_not_above_current')
  }
  if (!Number.isInteger(percent) || percent < 1 || percent > 99) {
    reasons.push('regular_discount_percent_invalid')
  } else if (
    current !== null &&
    original !== null &&
    expectedDiscountPercent(current, original) !== percent
  ) {
    reasons.push('regular_discount_percent_mismatch')
  }
}

function evaluatePsPlusObservation(observation, priceAmount, reasons) {
  if (observation?.producer !== 'detail') {
    reasons.push('ps_plus_detail_producer_required')
  }
  if (observation?.is_ps_plus_discount !== true) {
    reasons.push('ps_plus_discount_not_explicitly_true')
  }
  if (!exactMoney(observation?.ps_plus_price_amount, priceAmount)) {
    reasons.push('ps_plus_price_evidence_mismatch')
  }
  if (observation?.ps_plus_price_source !== 'detail_buy_box') {
    reasons.push('ps_plus_detail_buy_box_source_required')
  }
  if (
    !exactMoney(
      observation?.current_ps_plus_buy_box_price_amount,
      priceAmount
    )
  ) {
    reasons.push('ps_plus_buy_box_price_evidence_mismatch')
  }
  if (observation?.ps_plus_parser_status !== 'parsed_current_discount') {
    reasons.push('ps_plus_parser_state_unsafe')
  }
  if (observation?.ps_plus_source_consistent !== true) {
    reasons.push('ps_plus_source_discrepancy')
  }

  const current = positiveMoney(observation?.current_price_amount)
  if (current === null) {
    reasons.push('ps_plus_current_price_invalid')
  } else if (current <= priceAmount) {
    reasons.push('ps_plus_not_below_current_price')
  }
  if (observation?.is_monthly_entitlement !== false) {
    reasons.push('ps_plus_monthly_entitlement_exclusion_not_demonstrated')
  }
  if (
    observation?.commercial_state?.classification ===
    'temporary_free_promotion_candidate'
  ) {
    reasons.push('ps_plus_temporary_free_promotion_forbidden')
  }
}

export function evaluatePsdealsCertifiedPriceLowObservation(observation) {
  const reasons = []
  const localCycleId = cleanText(observation?.local_cycle_id)
  const itemId = cleanText(observation?.item_id)
  const psdealsId = positiveInteger(observation?.psdeals_id)
  const regionCode = cleanText(observation?.region_code)?.toLowerCase() || null
  const storefront = cleanText(observation?.storefront)?.toLowerCase() || null
  const currencyCode = cleanText(observation?.currency_code)?.toUpperCase() || null
  const priceKind = cleanText(observation?.price_kind)?.toLowerCase() || null
  const observedAt = validTimestamp(observation?.observed_at)
  const priceAmount = positiveMoney(observation?.price_amount)

  if (!localCycleId) reasons.push('local_cycle_id_missing')
  if (!itemId) reasons.push('item_id_missing')
  if (psdealsId === null) reasons.push('psdeals_id_invalid')
  if (regionCode !== 'us') reasons.push('region_out_of_scope')
  if (storefront !== 'playstation') reasons.push('storefront_out_of_scope')
  if (currencyCode !== 'USD') reasons.push('currency_out_of_scope')
  if (!PSDEALS_CERTIFIED_PRICE_LOW_KINDS.includes(priceKind)) {
    reasons.push('price_kind_unknown')
  }
  if (!observedAt) reasons.push('observed_at_invalid')
  if (priceAmount === null) reasons.push('price_amount_invalid')
  if (observation?.is_free_to_play !== false) {
    reasons.push('free_to_play_not_explicitly_false')
  }
  if (observation?.type_classification_safe !== true) {
    reasons.push('type_classification_not_explicitly_safe')
  }
  if (observation?.platform_classification_safe !== true) {
    reasons.push('platform_classification_not_explicitly_safe')
  }
  if (observation?.deal_active !== true) {
    reasons.push('deal_not_explicitly_active')
  }

  if (priceAmount !== null && priceKind === 'regular') {
    evaluateRegularObservation(observation, priceAmount, reasons)
  } else if (priceAmount !== null && priceKind === 'ps_plus') {
    evaluatePsPlusObservation(observation, priceAmount, reasons)
  }

  const reasonCodes = [...new Set(reasons)].sort()
  const eligible = reasonCodes.length === 0

  return {
    contract_version: PSDEALS_CERTIFIED_PRICE_LOW_CONTRACT_VERSION,
    classification: eligible
      ? `${priceKind}_certified_cycle_observation`
      : 'ineligible_cycle_observation',
    is_valid: eligible,
    can_update_certified_low: eligible,
    reason_codes: reasonCodes,
    normalized_observation: eligible
      ? {
          local_cycle_id: localCycleId,
          item_id: itemId,
          psdeals_id: psdealsId,
          region_code: regionCode,
          storefront,
          currency_code: currencyCode,
          price_kind: priceKind,
          price_amount: priceAmount,
          observed_at: observedAt,
          producer: observation.producer,
        }
      : null,
  }
}

export function applyPsdealsCertifiedPriceLow(previous, observation) {
  const evaluation = evaluatePsdealsCertifiedPriceLowObservation(observation)

  if (!evaluation.can_update_certified_low) {
    return {
      changed: false,
      value: previous || null,
      reason_code: 'observation_not_certifiable',
      evaluation,
    }
  }

  const candidate = evaluation.normalized_observation
  if (!previous) {
    return {
      changed: true,
      value: {
        amount: candidate.price_amount,
        observed_at: candidate.observed_at,
      },
      reason_code: 'certified_low_initialized',
      evaluation,
    }
  }

  const previousAmount = positiveMoney(previous.amount)
  const previousObservedAt = validTimestamp(previous.observed_at)
  if (previousAmount === null || !previousObservedAt) {
    throw new Error('PREVIOUS_CERTIFIED_PRICE_LOW_INVALID')
  }

  if (candidate.price_amount >= previousAmount) {
    return {
      changed: false,
      value: {
        amount: previousAmount,
        observed_at: previousObservedAt,
      },
      reason_code: candidate.price_amount === previousAmount
        ? 'certified_low_equal'
        : 'certified_low_higher',
      evaluation,
    }
  }

  return {
    changed: true,
    value: {
      amount: candidate.price_amount,
      observed_at: candidate.observed_at,
    },
    reason_code: 'certified_low_lowered',
    evaluation,
  }
}
