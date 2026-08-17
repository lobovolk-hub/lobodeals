import { createHash } from 'node:crypto'

export const PSDEALS_CERTIFICATION_EVIDENCE_VERSION = 1
export const PSDEALS_CERTIFICATION_CANDIDATE_MAX_BYTES = 1024

const HASH_PATTERN = /^[a-f0-9]{64}$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_TYPE_PAIRS = new Set([
  'game:game',
  'bundle:bundle',
  'dlc:addon',
])
const TARGET_PLATFORMS = new Set(['PS5', 'PS4'])

function cleanText(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned || null
}

function validTimestamp(value) {
  const cleaned = cleanText(value)
  if (!cleaned || Number.isNaN(new Date(cleaned).getTime())) return null
  return new Date(cleaned).toISOString()
}

function validMoney(value) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 99999999.99
    ? Number(value.toFixed(2))
    : null
}

function moneyCents(value) {
  const money = validMoney(value)
  return money === null ? null : Math.round(money * 100)
}

function expectedDiscountPercent(current, original) {
  const currentCents = moneyCents(current)
  const originalCents = moneyCents(original)
  if (
    currentCents === null ||
    originalCents === null ||
    originalCents <= currentCents
  ) {
    return null
  }
  return Math.round(
    (100 * (originalCents - currentCents)) / originalCents
  )
}

function uniqueReasons(values) {
  return [...new Set(values)].sort()
}

function canonicalPlatforms(classification, reasons) {
  const platforms = classification?.target_platforms
  const legacy = classification?.legacy_platforms
  const unknown = classification?.unknown_tokens
  if (
    classification?.classification !== 'target_only' ||
    classification?.can_write !== true ||
    !Array.isArray(platforms) ||
    platforms.length === 0 ||
    platforms.some((platform) => !TARGET_PLATFORMS.has(platform)) ||
    (Array.isArray(legacy) && legacy.length > 0) ||
    (Array.isArray(unknown) && unknown.length > 0)
  ) {
    reasons.push('certification_platform_classification_unsafe')
    return null
  }
  return ['PS5', 'PS4'].filter((platform) => platforms.includes(platform))
}

function safeType(classification, reasons) {
  const pair = `${classification?.content_type || ''}:${classification?.item_type_label || ''}`
  if (
    classification?.can_write !== true ||
    classification?.confidence !== 'high' ||
    !ALLOWED_TYPE_PAIRS.has(pair)
  ) {
    reasons.push('certification_type_classification_unsafe')
    return null
  }
  return {
    content_type: classification.content_type,
    item_type_label: classification.item_type_label,
  }
}

function commonContext(context, reasons) {
  const cycleId = cleanText(context?.remote_cycle_id)
  const observedAt = validTimestamp(context?.observed_at)
  const evidenceSha256 = cleanText(context?.evidence_sha256)?.toLowerCase() || null
  if (!cycleId || !UUID_PATTERN.test(cycleId)) {
    reasons.push('certification_remote_cycle_id_invalid')
  }
  if (!observedAt) reasons.push('certification_observed_at_invalid')
  if (!evidenceSha256 || !HASH_PATTERN.test(evidenceSha256)) {
    reasons.push('certification_evidence_sha256_invalid')
  }
  return { cycleId, observedAt, evidenceSha256 }
}

const REGULAR_HASH_FIELDS = Object.freeze([
  'contract_version',
  'kind',
  'cycle_id',
  'observed_at',
  'evidence_sha256',
  'psdeals_id',
  'region_code',
  'storefront',
  'currency_code',
  'current_price_amount',
  'original_price_amount',
  'discount_percent',
  'is_active_discount',
  'is_free_to_play',
  'content_type',
  'item_type_label',
  'platforms',
])

const PS_PLUS_HASH_FIELDS = Object.freeze([
  'contract_version',
  'kind',
  'cycle_id',
  'observed_at',
  'evidence_sha256',
  'input_artifact_sha256',
  'psdeals_id',
  'region_code',
  'storefront',
  'currency_code',
  'current_price_amount',
  'ps_plus_price_amount',
  'is_active_discount',
  'is_ps_plus_discount',
  'is_free_to_play',
  'parser_status',
  'source_consistent',
  'content_type',
  'item_type_label',
  'platforms',
])

const MONTHLY_REGULAR_HASH_FIELDS = Object.freeze([
  'contract_version',
  'kind',
  'cycle_id',
  'observed_at',
  'evidence_sha256',
  'input_artifact_sha256',
  'psdeals_id',
  'region_code',
  'storefront',
  'currency_code',
  'regular_price_amount',
  'entitlement_price_amount',
  'discount_percent',
  'classification',
  'content_type',
  'item_type_label',
  'platforms',
])

function hashFieldValue(value) {
  if (Array.isArray(value)) return value.join(',')
  if (value === null || value === undefined) return '<null>'
  return String(value)
}

export function hashPsdealsCertificationCandidate(candidate) {
  const fields =
    candidate?.kind === 'regular'
      ? REGULAR_HASH_FIELDS
      : candidate?.kind === 'ps_plus'
        ? PS_PLUS_HASH_FIELDS
        : candidate?.kind === 'monthly_regular'
          ? MONTHLY_REGULAR_HASH_FIELDS
        : null
  if (!fields) return null
  const canonical = fields
    .map((field) => hashFieldValue(candidate[field]))
    .join('\u001f')
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

function sealCandidate(candidate, reasons) {
  const candidateSha256 = hashPsdealsCertificationCandidate(candidate)
  if (!candidateSha256) {
    reasons.push('certification_candidate_hash_invalid')
    return candidate
  }
  const sealed = {
    ...candidate,
    candidate_sha256: candidateSha256,
  }
  if (
    Buffer.byteLength(JSON.stringify(sealed), 'utf8') >
    PSDEALS_CERTIFICATION_CANDIDATE_MAX_BYTES
  ) {
    reasons.push('certification_candidate_too_large')
  }
  return sealed
}

function result(kind, reasons, common, candidate) {
  const reasonCodes = uniqueReasons(reasons)
  if (reasonCodes.length > 0) {
    return {
      eligible: false,
      kind,
      reason_codes: reasonCodes,
      candidate: null,
      columns: {},
    }
  }
  const prefix = kind === 'regular'
    ? 'regular_certification'
    : kind === 'ps_plus'
      ? 'ps_plus_certification'
      : 'monthly_regular_certification'
  return {
    eligible: true,
    kind,
    reason_codes: [],
    candidate,
    columns: {
      [`${prefix}_cycle_id`]: common.cycleId,
      [`${prefix}_observed_at`]: common.observedAt,
      [`${prefix}_evidence_sha256`]: common.evidenceSha256,
      ...(kind === 'monthly_regular'
        ? {
            [`${prefix}_input_artifact_sha256`]:
              candidate.input_artifact_sha256,
          }
        : {}),
      [`${prefix}_candidate`]: candidate,
    },
  }
}

export function buildPsdealsRegularCertificationEvidence(
  listingItem,
  context = {}
) {
  const reasons = []
  const common = commonContext(context, reasons)
  const commercial = listingItem?.commercial_state
  const platforms = canonicalPlatforms(
    listingItem?.platform_classification,
    reasons
  )
  const type = safeType(listingItem?.type_classification, reasons)
  const current = validMoney(commercial?.current_price_amount)
  const original = validMoney(commercial?.original_price_amount)
  const percent = commercial?.discount_percent_normalized
  const calculated = expectedDiscountPercent(current, original)

  if (!String(listingItem?.source_page_url || '').includes('/discounts')) {
    reasons.push('regular_discount_listing_source_required')
  }
  if (
    commercial?.classification !== 'regular_discount' ||
    commercial?.is_safe_for_price_update !== true ||
    commercial?.is_certified_regular_discount_eligible !== true
  ) {
    reasons.push('regular_commercial_state_not_certifiable')
  }
  if (current === null) reasons.push('regular_current_price_invalid')
  if (original === null) reasons.push('regular_original_price_invalid')
  if (current !== null && original !== null && original <= current) {
    reasons.push('regular_original_not_above_current')
  }
  if (!Number.isInteger(percent) || percent < 1 || percent > 99) {
    reasons.push('regular_discount_percent_invalid')
  } else if (calculated !== percent) {
    reasons.push('regular_discount_percent_mismatch')
  }

  const candidate = sealCandidate({
    contract_version: PSDEALS_CERTIFICATION_EVIDENCE_VERSION,
    kind: 'regular',
    cycle_id: common.cycleId,
    observed_at: common.observedAt,
    evidence_sha256: common.evidenceSha256,
    psdeals_id: listingItem?.psdeals_id ?? null,
    region_code: 'us',
    storefront: 'playstation',
    currency_code: 'USD',
    current_price_amount: current,
    original_price_amount: original,
    discount_percent: percent ?? null,
    is_active_discount: true,
    is_free_to_play: false,
    content_type: type?.content_type ?? null,
    item_type_label: type?.item_type_label ?? null,
    platforms,
  }, reasons)
  return result('regular', reasons, common, candidate)
}

export function buildPsdealsPsPlusCertificationEvidence(
  parsedDetail,
  context = {}
) {
  const reasons = []
  const common = commonContext(context, reasons)
  const platforms = canonicalPlatforms(
    parsedDetail?.platform_classification,
    reasons
  )
  const type = safeType(parsedDetail?.type_classification, reasons)
  const raw = parsedDetail?.raw_detail_json
  const plusEvidence = raw?.ps_plus_evidence
  const plus = validMoney(raw?.current_ps_plus_price_amount)
  const current = validMoney(parsedDetail?.current_price_amount)
  const inputArtifactSha256 =
    cleanText(context?.input_artifact_sha256)?.toLowerCase() || null

  if (parsedDetail?.is_ps_plus_discount !== true) {
    reasons.push('ps_plus_discount_not_explicitly_true')
  }
  if (
    parsedDetail?.commercial_state?.classification ===
    'temporary_free_promotion_candidate'
  ) {
    reasons.push('ps_plus_temporary_free_promotion_forbidden')
  }
  if (plusEvidence?.parser_status !== 'parsed_current_discount') {
    reasons.push('ps_plus_parser_state_unsafe')
  }
  if (plusEvidence?.source_consistent !== true) {
    reasons.push('ps_plus_source_discrepancy')
  }
  if (plus === null) reasons.push('ps_plus_price_invalid')
  if (current === null) reasons.push('ps_plus_regular_price_invalid')
  if (plus !== null && current !== null && plus >= current) {
    reasons.push('ps_plus_not_below_regular_price')
  }
  if (parsedDetail?.is_free_to_play !== false) {
    reasons.push('ps_plus_free_to_play_not_explicitly_false')
  }
  if (
    !inputArtifactSha256 ||
    !HASH_PATTERN.test(inputArtifactSha256)
  ) {
    reasons.push('ps_plus_input_artifact_sha256_invalid')
  }

  const candidate = sealCandidate({
    contract_version: PSDEALS_CERTIFICATION_EVIDENCE_VERSION,
    kind: 'ps_plus',
    cycle_id: common.cycleId,
    observed_at: common.observedAt,
    evidence_sha256: common.evidenceSha256,
    input_artifact_sha256: inputArtifactSha256,
    psdeals_id: parsedDetail?.psdeals_id ?? null,
    region_code: 'us',
    storefront: 'playstation',
    currency_code: String(parsedDetail?.currency_code || '').toUpperCase(),
    current_price_amount: current,
    ps_plus_price_amount: plus,
    is_active_discount: true,
    is_ps_plus_discount: true,
    is_free_to_play: false,
    parser_status: plusEvidence?.parser_status ?? null,
    source_consistent: plusEvidence?.source_consistent ?? null,
    content_type: type?.content_type ?? null,
    item_type_label: type?.item_type_label ?? null,
    platforms,
  }, reasons)
  return result('ps_plus', reasons, common, candidate)
}

export function buildPsdealsMonthlyRegularCertificationEvidence(
  parsedDetail,
  context = {}
) {
  const reasons = []
  const common = commonContext(context, reasons)
  const commercial = parsedDetail?.commercial_state
  const platforms = canonicalPlatforms(
    parsedDetail?.platform_classification,
    reasons
  )
  const type = safeType(parsedDetail?.type_classification, reasons)
  const regular = validMoney(commercial?.original_price_amount)
  const entitlement = Number(commercial?.current_price_amount)
  const percent = commercial?.discount_percent_normalized
  const inputArtifactSha256 =
    cleanText(context?.input_artifact_sha256)?.toLowerCase() || null

  if (
    commercial?.classification !== 'temporary_free_promotion_candidate' ||
    commercial?.is_safe_for_price_update !== true
  ) {
    reasons.push('monthly_regular_detail_state_not_certifiable')
  }
  if (entitlement !== 0 || percent !== 100) {
    reasons.push('monthly_regular_entitlement_tuple_invalid')
  }
  if (regular === null) reasons.push('monthly_regular_price_invalid')
  if (String(parsedDetail?.currency_code || '').toUpperCase() !== 'USD') {
    reasons.push('monthly_regular_currency_invalid')
  }
  if (!inputArtifactSha256 || !HASH_PATTERN.test(inputArtifactSha256)) {
    reasons.push('monthly_regular_input_artifact_sha256_invalid')
  }

  const candidate = sealCandidate({
    contract_version: PSDEALS_CERTIFICATION_EVIDENCE_VERSION,
    kind: 'monthly_regular',
    cycle_id: common.cycleId,
    observed_at: common.observedAt,
    evidence_sha256: common.evidenceSha256,
    input_artifact_sha256: inputArtifactSha256,
    psdeals_id: parsedDetail?.psdeals_id ?? null,
    region_code: 'us',
    storefront: 'playstation',
    currency_code: String(parsedDetail?.currency_code || '').toUpperCase(),
    regular_price_amount: regular,
    entitlement_price_amount: entitlement,
    discount_percent: percent ?? null,
    classification: commercial?.classification ?? null,
    content_type: type?.content_type ?? null,
    item_type_label: type?.item_type_label ?? null,
    platforms,
  }, reasons)

  return result('monthly_regular', reasons, common, candidate)
}
