import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCollectedListingItem } from '../scripts/collect-psdeals-listing-edge-live-cdp.mjs'
import { parsePage } from '../scripts/import-psdeals-detail-local.mjs'
import {
  buildPsdealsDetailUpsertPayload,
  buildPsdealsListingInsertPayload,
  buildPsdealsListingUpdatePayload,
} from '../scripts/lib/psdeals-stage-payload.mjs'

const OBSERVED_AT = '2026-07-29T12:00:00.123456+00:00'
const CYCLE = '11111111-1111-4111-8111-111111111111'
const HASH = 'a'.repeat(64)
const INPUT_HASH = 'b'.repeat(64)
const PROTECTED_PRICE_LOW_FIELDS = [
  'lowest_price_amount',
  'lowest_ps_plus_price_amount',
  'lobodeals_lowest_regular_price_amount',
  'lobodeals_lowest_regular_price_first_seen_at',
  'lobodeals_lowest_ps_plus_price_amount',
  'lobodeals_lowest_ps_plus_price_first_seen_at',
]
const DETAIL_OWNED_FIELDS = [
  'store_url',
  'ps_store_primary_id',
  'description',
  'publisher',
  'genres',
  'release_date',
  'playstation_rating',
  'all_add_ons_url',
  'detail_last_synced_at',
  'raw_detail_json',
]

function listing(overrides = {}) {
  return buildCollectedListingItem(
    {
      href: 'https://psdeals.net/us-store/game/123/example',
      title: 'Example',
      platformLabel: 'PS5 / PS4',
      typeLabel: 'Full Game',
      discountText: '-50%',
      discountPriceText: '$4.99',
      regularPriceText: '$4.99',
      originalPriceText: '$9.99',
      imageUrl: 'https://example.com/image.jpg',
      ...overrides,
    },
    'https://psdeals.net/us-store/discounts'
  )
}

function detailHtml({
  type = 'game',
  platform = 'PS5',
  current = '$9.99',
  original = null,
  discount = '',
} = {}) {
  const prices = original === null
    ? `<span class="game-buy-button-price">${current}</span>`
    : `<span class="game-buy-button-price strikethrough">${original}</span><span class="game-buy-button-price-discount">${current}</span>`

  return `
    <html><head><script>
      var item_id=123;var item_type="${type}";var item_currency="$";
      var chart_bonus_prices="[]";var chart_bonus_active=false;var next_marker=true;
    </script></head><body>
      <div itemprop="name" class="game-title-info-name">Example</div>
      <span class="game-cover-top-platform">${platform}</span>
      <p class="game-cover-bottom-big">SAVE: <span>${discount}</span></p>
      <div class="game-buy-button-right"><p>${prices}</p></div>
    </body></html>
  `
}

function psPlusDetailHtml() {
  return `
    <html><head><script>
      var item_id=123;var item_type="game";var item_currency="$";
      var chart_bonus_prices="[{\"date\":\"2026-07-29\",\"price\":\"$4.99\"}]";var chart_bonus_active=true;var next_marker=true;
    </script></head><body>
      <div itemprop="name" class="game-title-info-name">Example</div>
      <span class="game-cover-top-platform">PS5</span>
      <div class="game-buy-button-right">
        <span class="game-buy-button-price">$9.99</span>
        <span class="game-buy-button-price-bonus">$4.99</span>
      </div>
    </body></html>
  `
}

function parsedDetail(options = {}) {
  return parsePage(
    detailHtml(options),
    'https://psdeals.net/us-store/game/123/example'
  )
}

function assertNoNullishTopLevel(payload) {
  for (const [key, value] of Object.entries(payload)) {
    assert.notEqual(value, null, key)
    assert.notEqual(value, undefined, key)
  }
}

test('builds the locally demonstrated minimum new listing row', () => {
  const source = listing()
  const result = buildPsdealsListingInsertPayload(source, {
    listingObservedAt: OBSERVED_AT,
  })

  assert.equal(result.is_valid, true)
  assert.equal(result.payload.psdeals_id, 123)
  assert.equal(result.payload.region_code, 'us')
  assert.equal(result.payload.storefront, 'playstation')
  assert.equal(result.payload.listing_last_seen_at, OBSERVED_AT)
  assert.equal(result.payload.discount_percent, 50)
  assert.equal(result.payload.content_type, 'game')
  assert.deepEqual(result.payload.platforms, ['PS5', 'PS4'])
  assert.equal(result.payload.raw_listing_json, source)
  assertNoNullishTopLevel(result.payload)
})

test('builds a partial listing update with only safe producer-owned fields', () => {
  const result = buildPsdealsListingUpdatePayload(listing(), {
    listingObservedAt: OBSERVED_AT,
  })

  assert.equal(result.is_valid, true)
  for (const field of DETAIL_OWNED_FIELDS) {
    assert.equal(field in result.payload, false, field)
  }
  for (const field of PROTECTED_PRICE_LOW_FIELDS) {
    assert.equal(field in result.payload, false, field)
  }
})

test('omits ambiguous and incoherent listing prices without losing safe fields', () => {
  for (const source of [
    listing({
      discountText: '-100%',
      discountPriceText: '$0.49',
      originalPriceText: '$945.00',
    }),
    listing({
      discountText: '-50%',
      discountPriceText: '$8.00',
      originalPriceText: '$10.00',
    }),
  ]) {
    const result = buildPsdealsListingUpdatePayload(source, {
      listingObservedAt: OBSERVED_AT,
    })

    assert.equal('current_price_amount' in result.payload, false)
    assert.equal('original_price_amount' in result.payload, false)
    assert.equal('discount_percent' in result.payload, false)
    assert.equal(result.payload.title, 'Example')
    assert.equal(result.payload.raw_listing_json, source)
  }
})

test('omits unknown type and platform classifications on update', () => {
  const source = listing({
    typeLabel: 'Full Gamer',
    platformLabel: 'PS5 / Mystery',
  })
  const result = buildPsdealsListingUpdatePayload(source, {
    listingObservedAt: OBSERVED_AT,
  })

  assert.equal('content_type' in result.payload, false)
  assert.equal('item_type_label' in result.payload, false)
  assert.equal('platforms' in result.payload, false)
  assert.ok(result.reason_codes.includes('type_update_omitted'))
  assert.ok(result.reason_codes.includes('platform_update_omitted'))
})

test('omits a medium-confidence type proposal even for a new listing row', () => {
  const source = listing({ typeLabel: 'Catalog' })
  const result = buildPsdealsListingInsertPayload(source, {
    listingObservedAt: '2026-07-29T12:00:00.000Z',
  })

  assert.equal(result.is_valid, true)
  assert.equal('content_type' in result.payload, false)
  assert.equal('item_type_label' in result.payload, false)
  assert.ok(result.reason_codes.includes('type_update_omitted'))
  assert.equal(
    result.payload.raw_listing_json.type_classification.classification,
    'ambiguous'
  )
})

test('does not infer permanent free-to-play from a temporary FREE promotion', () => {
  const source = listing({
    discountText: '-100%',
    discountPriceText: 'FREE',
    regularPriceText: 'FREE',
    originalPriceText: '$24.99',
  })
  const result = buildPsdealsListingUpdatePayload(source, {
    listingObservedAt: OBSERVED_AT,
  })

  assert.equal('is_free_to_play' in result.payload, false)
  assert.equal('availability_state' in result.payload, false)
  assert.equal('current_price_amount' in result.payload, false)
  assert.equal(result.payload.raw_listing_json.commercial_state.classification,
    'temporary_free_promotion_candidate')
})

test('complete listing stamps public verification without changing unsafe commercial state', () => {
  const source = listing({
    discountText: '-100%',
    discountPriceText: 'FREE',
    regularPriceText: 'FREE',
    originalPriceText: '$19.99',
  })
  const result = buildPsdealsListingUpdatePayload(source, {
    listingObservedAt: OBSERVED_AT,
    certificationContext: {
      remote_cycle_id: CYCLE,
      evidence_sha256: HASH,
    },
  })

  assert.equal(result.payload.public_offer_verification_cycle_id, CYCLE)
  assert.equal(result.payload.public_offer_verified_at, OBSERVED_AT)
  assert.equal(result.payload.public_offer_verification_source, 'complete_listing')
  assert.equal(result.payload.public_offer_evidence_sha256, HASH)
  assert.equal(result.payload.public_offer_input_artifact_sha256, null)
  assert.equal('current_price_amount' in result.payload, false)
})

test('Monthly Detail preserves regular evidence but writes no free commercial tuple', () => {
  const parsed = parsePage(
    detailHtml({ current: 'FREE', original: '$19.99', discount: '-100%' }),
    'https://psdeals.net/us-store/game/123/example',
    { observedAt: OBSERVED_AT }
  )
  const result = buildPsdealsDetailUpsertPayload(parsed, {
    isExisting: true,
    certificationContext: {
      remote_cycle_id: CYCLE,
      evidence_sha256: HASH,
      input_artifact_sha256: INPUT_HASH,
    },
  })

  assert.equal(result.is_valid, true)
  assert.equal('current_price_amount' in result.payload, false)
  assert.equal('original_price_amount' in result.payload, false)
  assert.equal('discount_percent' in result.payload, false)
  assert.equal('public_offer_verification_cycle_id' in result.payload, false)
  assert.equal(result.payload.monthly_regular_certification_cycle_id, CYCLE)
  assert.equal(
    result.payload.monthly_regular_certification_input_artifact_sha256,
    INPUT_HASH
  )
  assert.equal(
    result.payload.monthly_regular_certification_input_artifact_sha256,
    result.payload.monthly_regular_certification_candidate.input_artifact_sha256
  )
  assert.equal(
    result.payload.monthly_regular_certification_candidate.regular_price_amount,
    19.99
  )
})

test('strong regular Detail stamps a public commercial verification', () => {
  const parsed = parsePage(
    detailHtml({ current: '$4.99', original: '$9.99', discount: '-50%' }),
    'https://psdeals.net/us-store/game/123/example',
    { observedAt: OBSERVED_AT }
  )
  const result = buildPsdealsDetailUpsertPayload(parsed, {
    isExisting: true,
    certificationContext: {
      remote_cycle_id: CYCLE,
      evidence_sha256: HASH,
      input_artifact_sha256: INPUT_HASH,
    },
  })

  assert.equal(result.payload.public_offer_verification_cycle_id, CYCLE)
  assert.equal(
    result.payload.public_offer_verification_source,
    'strong_detail_revalidation'
  )
  assert.equal(result.payload.public_offer_input_artifact_sha256, INPUT_HASH)
})

test('positive no-discount Detail emits Monthly continuity evidence without bypassing ended reconciliation', () => {
  const parsed = parsePage(
    detailHtml({ current: '$19.99' }),
    'https://psdeals.net/us-store/game/123/example',
    { observedAt: OBSERVED_AT }
  )
  const result = buildPsdealsDetailUpsertPayload(parsed, {
    isExisting: true,
    certificationContext: {
      remote_cycle_id: CYCLE,
      evidence_sha256: HASH,
      input_artifact_sha256: INPUT_HASH,
    },
  })

  assert.equal(parsed.commercial_state.classification, 'no_discount')
  assert.equal(result.payload.current_price_amount, 19.99)
  assert.equal('public_offer_verification_cycle_id' in result.payload, false)
  assert.equal('public_offer_verification_source' in result.payload, false)
  assert.equal(
    result.payload.monthly_regular_certification_candidate.classification,
    'no_discount'
  )
  assert.equal(
    result.payload.monthly_regular_certification_candidate.regular_price_amount,
    19.99
  )
})

test('strong PS Plus Detail stamps a public commercial verification', () => {
  const parsed = parsePage(
    psPlusDetailHtml(),
    'https://psdeals.net/us-store/game/123/example',
    { observedAt: OBSERVED_AT }
  )
  const result = buildPsdealsDetailUpsertPayload(parsed, {
    isExisting: true,
    certificationContext: {
      remote_cycle_id: CYCLE,
      evidence_sha256: HASH,
      input_artifact_sha256: INPUT_HASH,
    },
  })

  assert.equal(result.payload.ps_plus_certification_cycle_id, CYCLE)
  assert.equal(result.payload.public_offer_verification_cycle_id, CYCLE)
  assert.equal(
    result.payload.public_offer_verification_source,
    'strong_detail_revalidation'
  )
})

test('strong Detail requires a valid input artifact SHA before stamping public verification', () => {
  const parsed = parsePage(
    detailHtml({ current: '$4.99', original: '$9.99', discount: '-50%' }),
    'https://psdeals.net/us-store/game/123/example',
    { observedAt: OBSERVED_AT }
  )
  const result = buildPsdealsDetailUpsertPayload(parsed, {
    isExisting: true,
    certificationContext: {
      remote_cycle_id: CYCLE,
      evidence_sha256: HASH,
      input_artifact_sha256: 'invalid',
    },
  })

  assert.equal('public_offer_verification_source' in result.payload, false)
  assert.equal('public_offer_input_artifact_sha256' in result.payload, false)
  assert.ok(result.reason_codes.includes('public_offer_verification_input_invalid'))
})

test('rejects a new listing row when mandatory local identity is missing', () => {
  const source = listing({ href: null })
  source.psdeals_id = null
  source.psdeals_url = null
  const result = buildPsdealsListingInsertPayload(source, {
    listingObservedAt: OBSERVED_AT,
  })

  assert.equal(result.is_valid, false)
  assert.deepEqual(result.payload, {})
  assert.ok(result.reason_codes.includes('psdeals_id_invalid'))
})

test('safe listing fields survive when another field is invalid', () => {
  const source = listing({ typeLabel: 'Unknown Thing' })
  const result = buildPsdealsListingUpdatePayload(source, {
    listingObservedAt: OBSERVED_AT,
  })

  assert.equal(result.is_valid, true)
  assert.equal(result.payload.current_price_amount, 4.99)
  assert.equal(result.payload.discount_percent, 50)
  assert.deepEqual(result.payload.platforms, ['PS5', 'PS4'])
  assert.equal('content_type' in result.payload, false)
})

test('builds an existing detail update without null wipes or listing-owned fields', () => {
  const parsed = parsedDetail()
  const result = buildPsdealsDetailUpsertPayload(parsed, {
    isExisting: true,
    rawDetailMetadata: { http_status: 200 },
  })

  assert.equal(result.is_valid, true)
  assert.equal(result.payload.psdeals_id, 123)
  assert.equal(result.payload.current_price_amount, 9.99)
  assert.equal(result.payload.is_free_to_play, false)
  assert.equal(result.payload.raw_detail_json.http_status, 200)
  for (const field of ['psdeals_slug', 'psdeals_url', 'title', 'image_url', 'platforms', 'content_type', 'item_type_label']) {
    assert.equal(field in result.payload, false, field)
  }
  for (const field of PROTECTED_PRICE_LOW_FIELDS) {
    assert.equal(field in result.payload, false, field)
  }
  assertNoNullishTopLevel(result.payload)
})

test('builds a safe new detail row when no listing row exists', () => {
  const parsed = parsedDetail({ type: 'addon', platform: 'PS4' })
  const result = buildPsdealsDetailUpsertPayload(parsed, { isExisting: false })

  assert.equal(result.is_valid, true)
  assert.equal(result.payload.psdeals_slug, 'example')
  assert.equal(result.payload.content_type, 'dlc')
  assert.equal(result.payload.item_type_label, 'addon')
  assert.deepEqual(result.payload.platforms, ['PS4'])
})

test('omits absent detail fields and never converts undefined to null', () => {
  const parsed = parsedDetail()
  parsed.description = undefined
  parsed.publisher = null
  parsed.genres = []
  parsed.release_date = null
  parsed.store_url = undefined
  const result = buildPsdealsDetailUpsertPayload(parsed, { isExisting: true })

  for (const field of ['description', 'publisher', 'genres', 'release_date', 'store_url']) {
    assert.equal(field in result.payload, false, field)
  }
  assertNoNullishTopLevel(result.payload)
})

test('detail payload never writes legacy or certified price-low fields', () => {
  const parsed = parsedDetail()

  for (const field of PROTECTED_PRICE_LOW_FIELDS) {
    parsed[field] = field.endsWith('_at') ? OBSERVED_AT : 1.99
  }

  const result = buildPsdealsDetailUpsertPayload(parsed, { isExisting: true })

  for (const field of PROTECTED_PRICE_LOW_FIELDS) {
    assert.equal(field in result.payload, false, field)
  }
})

test('an incoherent detail tuple does not overwrite previous valid prices', () => {
  const parsed = parsedDetail({
    current: '$8.00',
    original: '$10.00',
    discount: '50%',
  })
  const result = buildPsdealsDetailUpsertPayload(parsed, { isExisting: true })

  assert.equal('current_price_amount' in result.payload, false)
  assert.equal('original_price_amount' in result.payload, false)
  assert.equal('discount_percent' in result.payload, false)
  assert.ok(result.reason_codes.includes('detail_commercial_state_omitted'))
})
