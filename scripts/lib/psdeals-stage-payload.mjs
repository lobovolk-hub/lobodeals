const PROTECTED_PRICE_LOW_FIELDS = new Set([
  'lowest_price_amount',
  'lowest_ps_plus_price_amount',
  'lobodeals_lowest_regular_price_amount',
  'lobodeals_lowest_regular_price_first_seen_at',
  'lobodeals_lowest_ps_plus_price_amount',
  'lobodeals_lowest_ps_plus_price_first_seen_at',
])

function cleanText(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned || null
}

function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function finiteNumber(value, { minimum = null } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (minimum !== null && value < minimum) return null
  return value
}

function safeHttpUrl(value, hostSuffix = null) {
  const cleaned = cleanText(value)
  if (!cleaned) return null

  try {
    const parsed = new URL(cleaned)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    if (hostSuffix) {
      const hostname = parsed.hostname.toLowerCase()
      if (hostname !== hostSuffix && !hostname.endsWith(`.${hostSuffix}`)) {
        return null
      }
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function validTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }

  const cleaned = cleanText(value)
  if (!cleaned || Number.isNaN(new Date(cleaned).getTime())) return null
  return cleaned
}

function validDateOnly(value) {
  const cleaned = cleanText(value)
  if (!cleaned || !/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return null
  const parsed = new Date(`${cleaned}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10) === cleaned ? cleaned : null
}

function currencyCode(value) {
  const cleaned = cleanText(value)?.toUpperCase() || null
  return cleaned && /^[A-Z]{3}$/.test(cleaned) ? cleaned : null
}

function availabilityState(value) {
  const cleaned = cleanText(value)
  return new Set([
    'priced',
    'free_to_play',
    'demo',
    'included',
    'not_available',
    'tba',
  ]).has(cleaned)
    ? cleaned
    : null
}

function nonEmptyStringArray(value) {
  if (!Array.isArray(value)) return null
  const normalized = [...new Set(value.map(cleanText).filter(Boolean))]
  return normalized.length > 0 ? normalized : null
}

function copyPresentSafeFields(target, source, fieldRules) {
  for (const [field, normalize] of Object.entries(fieldRules)) {
    const normalized = normalize(source?.[field])
    if (normalized !== null && normalized !== undefined) {
      target[field] = normalized
    }
  }
}

function omitNullishKeys(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== undefined)
  )
}

function assertNoPriceLowFields(payload) {
  for (const field of PROTECTED_PRICE_LOW_FIELDS) {
    delete payload[field]
  }
  return payload
}

function result(payload, reasonCodes, isValid = true) {
  return {
    payload: assertNoPriceLowFields(omitNullishKeys(payload)),
    is_valid: isValid,
    reason_codes: [...new Set(reasonCodes)],
  }
}

function buildListingIdentity(listingItem, reasonCodes) {
  const psdealsId = positiveInteger(listingItem?.psdeals_id)
  const psdealsSlug = cleanText(listingItem?.psdeals_slug)
  const psdealsUrl = safeHttpUrl(listingItem?.psdeals_url, 'psdeals.net')

  if (psdealsId === null) reasonCodes.push('psdeals_id_invalid')
  if (!psdealsSlug) reasonCodes.push('psdeals_slug_missing')
  if (!psdealsUrl) reasonCodes.push('psdeals_url_invalid')

  return {
    psdeals_id: psdealsId,
    psdeals_slug: psdealsSlug,
    psdeals_url: psdealsUrl,
  }
}

function addListingClassifications(payload, listingItem, options, reasonCodes) {
  const type = listingItem?.type_classification
  const platform = listingItem?.platform_classification
  const isExisting = options.isExisting === true

  if (type?.can_write && (!isExisting || type.can_replace_existing)) {
    payload.content_type = type.content_type
    payload.item_type_label = type.item_type_label
  } else {
    reasonCodes.push('type_update_omitted')
  }

  if (platform?.can_write && (!isExisting || platform.can_replace_existing)) {
    payload.platforms = [...platform.target_platforms]
  } else {
    reasonCodes.push('platform_update_omitted')
  }
}

function addSafeListingCommercialState(payload, listingItem, reasonCodes) {
  const commercial = listingItem?.commercial_state
  const percent = commercial?.discount_percent_normalized

  if (
    commercial?.is_safe_for_price_update === true &&
    commercial?.is_regular_discount_eligible === true &&
    Number.isInteger(percent) &&
    percent >= 1 &&
    percent <= 99
  ) {
    payload.current_price_amount = commercial.current_price_amount
    payload.original_price_amount = commercial.original_price_amount
    payload.discount_percent = percent
    payload.currency_code = 'USD'
    return
  }

  reasonCodes.push('listing_commercial_state_omitted')
}

function buildListingBase(listingItem, options, isExisting) {
  const reasonCodes = []
  const identity = buildListingIdentity(listingItem, reasonCodes)
  const observedAt = validTimestamp(options.listingObservedAt)
  const title = cleanText(listingItem?.title)

  if (!observedAt) reasonCodes.push('listing_observed_at_invalid')
  if (!isExisting && !title) reasonCodes.push('title_missing_for_insert')

  const payload = {
    region_code: 'us',
    storefront: 'playstation',
    ...identity,
  }

  if (observedAt) payload.listing_last_seen_at = observedAt
  if (title) payload.title = title

  const imageUrl = safeHttpUrl(listingItem?.image_url)
  if (imageUrl) payload.image_url = imageUrl

  addSafeListingCommercialState(payload, listingItem, reasonCodes)
  addListingClassifications(payload, listingItem, { isExisting }, reasonCodes)

  if (listingItem && typeof listingItem === 'object') {
    payload.raw_listing_json = listingItem
  } else {
    reasonCodes.push('raw_listing_json_missing')
  }

  const requiredInvalid = reasonCodes.some((code) =>
    [
      'psdeals_id_invalid',
      'psdeals_slug_missing',
      'psdeals_url_invalid',
      'listing_observed_at_invalid',
      'title_missing_for_insert',
      'raw_listing_json_missing',
    ].includes(code)
  )

  return result(requiredInvalid ? {} : payload, reasonCodes, !requiredInvalid)
}

export function buildPsdealsListingInsertPayload(listingItem, options = {}) {
  return buildListingBase(listingItem, options, false)
}

export function buildPsdealsListingUpdatePayload(listingItem, options = {}) {
  return buildListingBase(listingItem, options, true)
}

function addDetailClassificationFields(payload, parsed, isExisting, reasonCodes) {
  if (isExisting) {
    reasonCodes.push('listing_owned_classification_fields_omitted')
    return
  }

  const type = parsed?.type_classification
  const platform = parsed?.platform_classification

  if (type?.can_write) {
    payload.content_type = type.content_type
    payload.item_type_label = type.item_type_label
  } else {
    reasonCodes.push('type_insert_omitted')
  }

  if (platform?.can_write) {
    payload.platforms = [...platform.target_platforms]
  } else {
    reasonCodes.push('platform_insert_omitted')
  }
}

function addDetailCommercialFields(payload, parsed, reasonCodes) {
  const commercial = parsed?.commercial_state

  if (commercial?.is_safe_for_price_update !== true) {
    reasonCodes.push('detail_commercial_state_omitted')
    return
  }

  copyPresentSafeFields(payload, parsed, {
    current_price_amount: (value) => finiteNumber(value, { minimum: 0 }),
    original_price_amount: (value) => finiteNumber(value, { minimum: 0 }),
    discount_percent: (value) => finiteNumber(value, { minimum: 0 }),
    deal_ends_at: validTimestamp,
  })

  if (typeof parsed.is_ps_plus_discount === 'boolean') {
    payload.is_ps_plus_discount = parsed.is_ps_plus_discount
  }
  if (typeof parsed.is_free_to_play === 'boolean') {
    payload.is_free_to_play = parsed.is_free_to_play
  }

  const normalizedAvailability = availabilityState(parsed.availability_state)
  if (normalizedAvailability) {
    payload.availability_state = normalizedAvailability
  }
}

export function buildPsdealsDetailUpsertPayload(parsed, options = {}) {
  const reasonCodes = []
  const isExisting = options.isExisting === true
  const psdealsId = positiveInteger(parsed?.psdeals_id)
  const detailSyncedAt = validTimestamp(parsed?.detail_last_synced_at)
  const rawDetailJson = parsed?.raw_detail_json

  if (psdealsId === null) reasonCodes.push('psdeals_id_invalid')
  if (!detailSyncedAt) reasonCodes.push('detail_last_synced_at_invalid')
  if (!rawDetailJson || typeof rawDetailJson !== 'object') {
    reasonCodes.push('raw_detail_json_missing')
  }

  const payload = {
    region_code: 'us',
    storefront: 'playstation',
    psdeals_id: psdealsId,
  }

  if (!isExisting) {
    const identityReasons = []
    const identity = buildListingIdentity(parsed, identityReasons)
    const title = cleanText(parsed?.title)
    reasonCodes.push(...identityReasons)
    if (!title) reasonCodes.push('title_missing_for_insert')

    Object.assign(payload, identity)
    if (title) payload.title = title

    const imageUrl = safeHttpUrl(parsed?.image_url)
    if (imageUrl) payload.image_url = imageUrl
  }

  addDetailClassificationFields(payload, parsed, isExisting, reasonCodes)
  addDetailCommercialFields(payload, parsed, reasonCodes)

  const storeUrl = safeHttpUrl(parsed?.store_url, 'playstation.com')
  if (storeUrl) {
    payload.store_url = storeUrl
    const storeUrlKind = cleanText(parsed?.store_url_kind)
    if (['product', 'concept', 'other'].includes(storeUrlKind)) {
      payload.store_url_kind = storeUrlKind
    }
    const primaryId = cleanText(parsed?.ps_store_primary_id)
    if (primaryId) payload.ps_store_primary_id = primaryId
  } else if (
    parsed?.store_url != null ||
    parsed?.store_url_kind != null ||
    parsed?.ps_store_primary_id != null
  ) {
    reasonCodes.push('official_store_identity_omitted')
  }

  copyPresentSafeFields(payload, parsed, {
    description: cleanText,
    publisher: cleanText,
    genres: nonEmptyStringArray,
    release_date: validDateOnly,
    currency_code: currencyCode,
    playstation_rating: (value) => finiteNumber(value, { minimum: 0 }),
    playstation_ratings_count: (value) => finiteNumber(value, { minimum: 0 }),
    all_add_ons_url: (value) => safeHttpUrl(value, 'psdeals.net'),
    whats_inside_lines: nonEmptyStringArray,
    source_note: cleanText,
  })

  if (detailSyncedAt) payload.detail_last_synced_at = detailSyncedAt

  if (rawDetailJson && typeof rawDetailJson === 'object') {
    payload.raw_detail_json = {
      ...rawDetailJson,
      ...(options.rawDetailMetadata || {}),
    }
  }

  const requiredInvalid = reasonCodes.some((code) =>
    [
      'psdeals_id_invalid',
      'psdeals_slug_missing',
      'psdeals_url_invalid',
      'title_missing_for_insert',
      'detail_last_synced_at_invalid',
      'raw_detail_json_missing',
    ].includes(code)
  )

  return result(requiredInvalid ? {} : payload, reasonCodes, !requiredInvalid)
}
