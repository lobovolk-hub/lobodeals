function normalizePsdealsId(value) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : null
}

function normalizeMoney(value) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Number(numberValue.toFixed(2)) : null
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isInteger(numberValue) ? numberValue : null
}

function expectedDiscountPercent(currentPrice, originalPrice) {
  const currentCents = Math.round(currentPrice * 100)
  const originalCents = Math.round(originalPrice * 100)
  return Math.round((100 * (originalCents - currentCents)) / originalCents)
}

function validFamily(row) {
  const pair = `${row?.content_type || ''}:${row?.item_type_label || ''}`
  return ['game:game', 'bundle:bundle', 'dlc:addon'].includes(pair)
}

function identityReasons(row, psdealsId, expectedRegion, expectedStorefront) {
  const reasons = []
  if (psdealsId === null) reasons.push('psdeals_id_invalid')
  if (row?.region_code !== expectedRegion) reasons.push('region_identity_mismatch')
  if (row?.storefront !== expectedStorefront) reasons.push('storefront_identity_mismatch')
  if (typeof row?.psdeals_slug !== 'string' || !row.psdeals_slug.trim()) {
    reasons.push('psdeals_slug_missing')
  }
  if (typeof row?.psdeals_url !== 'string' || !row.psdeals_url.trim()) {
    reasons.push('psdeals_url_missing')
  } else if (
    psdealsId !== null &&
    !row.psdeals_url.includes(`/us-store/game/${psdealsId}/`)
  ) {
    reasons.push('psdeals_url_identity_mismatch')
  }
  if (row?.identity_ambiguous === true) reasons.push('identity_ambiguous')
  if (row?.category_changed === true) reasons.push('category_changed')
  if (row?.is_published === false) reasons.push('product_not_published')
  return reasons
}

export function evaluateEndedDiscountDemotionCandidate(
  row,
  {
    listing_complete = false,
    listing_identity_valid = true,
    monthly_evidence_verified = false,
    monthly_item_ids = [],
    observed_at = null,
    expected_region = 'us',
    expected_storefront = 'playstation',
  } = {}
) {
  const reasons = []
  const psdealsId = normalizePsdealsId(row?.psdeals_id)
  const current = normalizeMoney(row?.current_price_amount)
  const original = normalizeMoney(row?.original_price_amount)
  const discount = normalizeInteger(row?.discount_percent)
  const observedAt = observed_at ? new Date(observed_at) : null
  const monthlyIds = new Set(
    Array.isArray(monthly_item_ids) ? monthly_item_ids.map(String) : []
  )

  if (listing_complete !== true) reasons.push('listing_not_strongly_complete')
  if (listing_identity_valid !== true) reasons.push('listing_identity_invalid')
  reasons.push(...identityReasons(row, psdealsId, expected_region, expected_storefront))

  if (current === null || current <= 0) reasons.push('current_price_invalid')
  if (original === null || original <= 0) reasons.push('original_price_invalid')
  if (current !== null && original !== null && original <= current) {
    reasons.push('original_price_not_greater_than_current')
  }
  if (discount === null || discount < 1 || discount > 99) {
    reasons.push('discount_percent_not_regular')
  } else if (
    current !== null &&
    original !== null &&
    original > current &&
    expectedDiscountPercent(current, original) !== discount
  ) {
    reasons.push('discount_percent_price_mismatch')
  }

  if (!validFamily(row)) reasons.push('content_family_invalid')
  if (row?.is_ps_plus_discount !== false) reasons.push('ps_plus_state_ambiguous_or_active')
  if (monthly_evidence_verified !== true) {
    reasons.push('monthly_membership_unverified')
  } else if (row?.id !== null && row?.id !== undefined && monthlyIds.has(String(row.id))) {
    reasons.push('active_monthly_game')
  }

  if (!observedAt || Number.isNaN(observedAt.getTime())) {
    reasons.push('observation_timestamp_invalid')
  } else if (row?.deal_ends_at) {
    const dealEndsAt = new Date(row.deal_ends_at)
    if (Number.isNaN(dealEndsAt.getTime())) {
      reasons.push('deal_end_timestamp_invalid')
    } else if (dealEndsAt > observedAt) {
      reasons.push('deal_end_in_future')
    }
  }

  const reasonCodes = [...new Set(reasons)]
  return {
    eligible: reasonCodes.length === 0,
    reason_codes: reasonCodes,
    psdeals_id: psdealsId,
    restore_price_amount: reasonCodes.length === 0 ? original : null,
  }
}

export function selectEndedDiscountCandidatesFromListing(
  discountsItemsInput,
  stageRowsInput,
  options = {}
) {
  const discountsItems = Array.isArray(discountsItemsInput) ? discountsItemsInput : []
  const stageRows = Array.isArray(stageRowsInput) ? stageRowsInput : []
  const activeDiscountIds = new Set()
  const invalidListingItems = []
  for (const item of discountsItems) {
    const psdealsId = normalizePsdealsId(item?.psdeals_id)
    if (psdealsId !== null) {
      activeDiscountIds.add(psdealsId)
    } else {
      invalidListingItems.push(item)
    }
  }
  const absentCandidates = stageRows
    .filter((row) => normalizePsdealsId(row?.psdeals_id) !== null)
    .filter((row) => !activeDiscountIds.has(normalizePsdealsId(row.psdeals_id)))
    .sort((a, b) => {
      const aUpdated = a?.updated_at ? new Date(a.updated_at).getTime() : 0
      const bUpdated = b?.updated_at ? new Date(b.updated_at).getTime() : 0
      return aUpdated - bUpdated || String(a?.title || '').localeCompare(String(b?.title || ''))
    })
  const evaluated = absentCandidates.map((row) => ({
    row,
    evaluation: evaluateEndedDiscountDemotionCandidate(row, {
      ...options,
      listing_identity_valid: invalidListingItems.length === 0,
    }),
  }))
  const candidates = evaluated
    .filter((entry) => entry.evaluation.eligible)
    .map((entry) => entry.row)
  const blockedCandidates = evaluated
    .filter((entry) => !entry.evaluation.eligible)
    .map((entry) => ({
      ...entry.row,
      demotion_blockers: entry.evaluation.reason_codes,
    }))
  return {
    active_discount_ids: [...activeDiscountIds].sort((a, b) => a - b),
    invalid_listing_items: invalidListingItems,
    absent_candidates: absentCandidates,
    candidates,
    blocked_candidates: blockedCandidates,
  }
}
