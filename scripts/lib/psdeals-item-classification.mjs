const TYPE_SOURCE_CONTEXTS = new Set(['listing', 'detail', 'unknown'])

const GAME_TYPE_LABELS = new Set([
  'full game',
  'game content',
  'psn game',
  'vr game',
])

const ADDON_TYPE_LABELS = new Set([
  'add-on',
  'avatar',
  'avatars',
  'character',
  'costume',
  'dynamic theme',
  'extra episode',
  'item',
  'level',
  'map',
  'music track',
  'season pass',
  'soundtrack',
  'static theme',
  'theme',
  'vehicle',
  'vr add-on',
  'weapons',
])

const LIMITED_SAMPLE_ADDON_TYPE_LABELS = new Set([
  'catalog',
  'combo',
  'subscription',
])

const DETAIL_TYPE_LABELS = new Map([
  ['game', { contentType: 'game', itemTypeLabel: 'game', family: 'game' }],
  ['bundle', { contentType: 'bundle', itemTypeLabel: 'bundle', family: 'bundle' }],
  ['addon', { contentType: 'dlc', itemTypeLabel: 'addon', family: 'addon' }],
])

const TARGET_PLATFORM_ORDER = ['PS5', 'PS4']
const LEGACY_PLATFORM_ORDER = ['PS3', 'PS Vita', 'PSP']

function cleanSourceText(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned || null
}

function normalizeComparisonText(value) {
  const cleaned = cleanSourceText(value)
  return cleaned ? cleaned.toLocaleLowerCase('en-US') : null
}

function normalizeSourceContext(value) {
  return TYPE_SOURCE_CONTEXTS.has(value) ? value : 'unknown'
}

function buildTypeResult({
  rawLabel,
  normalizedLabel,
  sourceContext,
  contentType = null,
  itemTypeLabel = null,
  family = 'unknown',
  confidence = 'none',
  reasons,
  canWrite = false,
  requiresDetail = true,
  canReplaceExisting = false,
}) {
  return {
    source_label: rawLabel,
    normalized_label: normalizedLabel,
    source_context: sourceContext,
    content_type: contentType,
    item_type_label: itemTypeLabel,
    family,
    classification: canWrite ? 'mapped' : normalizedLabel ? 'unknown' : 'missing',
    confidence,
    reason_codes: reasons,
    can_write: canWrite,
    requires_detail_revalidation: requiresDetail,
    can_replace_existing: canReplaceExisting,
  }
}

export function classifyPsdealsItemType(rawLabel, options = {}) {
  const sourceContext = normalizeSourceContext(options.sourceContext)
  const sourceLabel = cleanSourceText(rawLabel)
  const normalizedLabel = normalizeComparisonText(rawLabel)

  if (!normalizedLabel) {
    return buildTypeResult({
      rawLabel: sourceLabel,
      normalizedLabel,
      sourceContext,
      reasons: ['type_label_missing'],
    })
  }

  if (sourceContext === 'detail' && DETAIL_TYPE_LABELS.has(normalizedLabel)) {
    const mapping = DETAIL_TYPE_LABELS.get(normalizedLabel)
    const isLossyGameSignal = normalizedLabel === 'game'

    return buildTypeResult({
      rawLabel: sourceLabel,
      normalizedLabel,
      sourceContext,
      contentType: mapping.contentType,
      itemTypeLabel: mapping.itemTypeLabel,
      family: mapping.family,
      confidence: 'high',
      reasons: isLossyGameSignal
        ? ['detail_type_mapped', 'detail_game_signal_is_lossy']
        : ['detail_type_mapped'],
      canWrite: true,
      requiresDetail: false,
      canReplaceExisting: !isLossyGameSignal,
    })
  }

  if (GAME_TYPE_LABELS.has(normalizedLabel)) {
    return buildTypeResult({
      rawLabel: sourceLabel,
      normalizedLabel,
      sourceContext,
      contentType: 'game',
      itemTypeLabel: 'game',
      family: 'game',
      confidence: 'high',
      reasons: ['listing_type_mapped_to_game'],
      canWrite: true,
      requiresDetail: false,
      canReplaceExisting: true,
    })
  }

  if (normalizedLabel === 'bundle') {
    return buildTypeResult({
      rawLabel: sourceLabel,
      normalizedLabel,
      sourceContext,
      contentType: 'bundle',
      itemTypeLabel: 'bundle',
      family: 'bundle',
      confidence: 'high',
      reasons: ['listing_type_mapped_to_bundle'],
      canWrite: true,
      requiresDetail: false,
      canReplaceExisting: true,
    })
  }

  if (normalizedLabel === 'demo') {
    return buildTypeResult({
      rawLabel: sourceLabel,
      normalizedLabel,
      sourceContext,
      contentType: 'demo',
      itemTypeLabel: 'demo',
      family: 'demo',
      confidence: 'high',
      reasons: ['listing_type_mapped_to_demo'],
      canWrite: true,
      requiresDetail: false,
      canReplaceExisting: true,
    })
  }

  if (ADDON_TYPE_LABELS.has(normalizedLabel)) {
    return buildTypeResult({
      rawLabel: sourceLabel,
      normalizedLabel,
      sourceContext,
      contentType: 'dlc',
      itemTypeLabel: 'addon',
      family: normalizedLabel === 'season pass' ? 'season_pass' : 'addon',
      confidence: 'high',
      reasons: ['listing_type_mapped_to_public_addon_bucket'],
      canWrite: true,
      requiresDetail: false,
      canReplaceExisting: true,
    })
  }

  if (LIMITED_SAMPLE_ADDON_TYPE_LABELS.has(normalizedLabel)) {
    return buildTypeResult({
      rawLabel: sourceLabel,
      normalizedLabel,
      sourceContext,
      contentType: 'dlc',
      itemTypeLabel: 'addon',
      family: 'addon',
      confidence: 'medium',
      reasons: [
        'listing_type_mapped_to_public_addon_bucket',
        'mapping_supported_by_limited_local_detail_samples',
      ],
      canWrite: true,
      requiresDetail: true,
      canReplaceExisting: false,
    })
  }

  return buildTypeResult({
    rawLabel: sourceLabel,
    normalizedLabel,
    sourceContext,
    reasons: ['type_label_unknown'],
  })
}

function sourcePlatformTokens(rawSignal) {
  const values = Array.isArray(rawSignal) ? rawSignal : [rawSignal]

  return values
    .flatMap((value) => {
      if (typeof value !== 'string') return []
      return value.split(/\s*(?:\/|,|\||&)\s*/)
    })
    .map((value) => cleanSourceText(value))
    .filter(Boolean)
}

function normalizePlatformToken(token) {
  const normalized = String(token).toUpperCase().replace(/\s+/g, ' ').trim()

  if (normalized === 'PS5') return { kind: 'target', value: 'PS5' }
  if (normalized === 'PS4') return { kind: 'target', value: 'PS4' }
  if (normalized === 'PS3') return { kind: 'legacy', value: 'PS3' }
  if (normalized === 'PS VITA' || normalized === 'PSVITA') {
    return { kind: 'legacy', value: 'PS Vita' }
  }
  if (normalized === 'PSP') return { kind: 'legacy', value: 'PSP' }

  return { kind: 'unknown', value: cleanSourceText(token) }
}

function orderedUnique(values, order) {
  const set = new Set(values)
  return order.filter((value) => set.has(value))
}

export function normalizePsdealsPlatforms(rawSignal, options = {}) {
  const sourceContext = normalizeSourceContext(options.sourceContext)
  const tokens = sourcePlatformTokens(rawSignal)
  const normalizedTokens = tokens.map(normalizePlatformToken)
  const targetPlatforms = orderedUnique(
    normalizedTokens.filter((entry) => entry.kind === 'target').map((entry) => entry.value),
    TARGET_PLATFORM_ORDER
  )
  const legacyPlatforms = orderedUnique(
    normalizedTokens.filter((entry) => entry.kind === 'legacy').map((entry) => entry.value),
    LEGACY_PLATFORM_ORDER
  )
  const unknownTokens = [...new Set(
    normalizedTokens
      .filter((entry) => entry.kind === 'unknown' && entry.value)
      .map((entry) => entry.value)
  )]

  const result = {
    source_signal: rawSignal ?? null,
    source_tokens: tokens,
    source_context: sourceContext,
    target_platforms: targetPlatforms,
    legacy_platforms: legacyPlatforms,
    unknown_tokens: unknownTokens,
    classification: 'missing',
    confidence: 'none',
    reason_codes: [],
    can_write: false,
    requires_detail_revalidation: true,
    can_replace_existing: false,
  }

  if (tokens.length === 0) {
    result.reason_codes.push('platform_signal_missing')
    return result
  }

  if (unknownTokens.length > 0) {
    result.classification = targetPlatforms.length > 0
      ? 'target_with_unknown'
      : legacyPlatforms.length > 0
        ? 'legacy_with_unknown'
        : 'unknown'
    result.reason_codes.push('unknown_platform_token')
    if (targetPlatforms.length > 0) {
      result.reason_codes.push('target_platforms_not_written_with_unknown_tokens')
    }
    return result
  }

  if (targetPlatforms.length > 0 && legacyPlatforms.length === 0) {
    result.classification = 'target_only'
    result.confidence = 'high'
    result.reason_codes.push('target_platforms_normalized')
    result.can_write = true
    result.requires_detail_revalidation = false
    result.can_replace_existing = true
    return result
  }

  if (targetPlatforms.length > 0 && legacyPlatforms.length > 0) {
    result.classification = 'target_with_legacy'
    result.confidence = 'medium'
    result.reason_codes.push(
      'target_platforms_normalized',
      'legacy_platform_evidence_preserved',
      'mixed_platforms_cannot_replace_existing'
    )
    result.can_write = true
    result.requires_detail_revalidation = sourceContext !== 'detail'
    return result
  }

  result.classification = 'legacy_only'
  result.confidence = 'high'
  result.reason_codes.push(
    'legacy_platform_evidence_preserved',
    'no_target_platform_present'
  )
  return result
}
