import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCollectedListingItem } from '../scripts/collect-psdeals-listing-edge-live-cdp.mjs'
import { normalizePsdealsCommercialState } from '../scripts/lib/psdeals-commercial-state.mjs'

function normalize(overrides = {}) {
  return normalizePsdealsCommercialState({
    currentPrice: '$4.99',
    originalPrice: '$9.99',
    discountPercent: '50%',
    sourceContext: 'detail',
    ...overrides,
  })
}

test('accepts a coherent regular discount', () => {
  const state = normalize()

  assert.equal(state.classification, 'regular_discount')
  assert.equal(state.discount_percent_normalized, 50)
  assert.equal(state.calculated_discount_percent, 50)
  assert.equal(state.is_valid, true)
  assert.equal(state.is_regular_discount_eligible, true)
  assert.equal(state.is_certified_regular_discount_eligible, true)
})

test('preserves the negative PSDeals percentage while normalizing it', () => {
  const state = normalize({ discountPercent: '-50%' })

  assert.equal(state.discount_percent_source, -50)
  assert.equal(state.discount_percent_normalized, 50)
  assert.equal(state.source.discount_percent, '-50%')
  assert.equal(state.classification, 'regular_discount')
})

test('rejects a percentage that does not match the prices', () => {
  const state = normalize({
    currentPrice: '$6.00',
    originalPrice: '$10.00',
    discountPercent: '-50%',
  })

  assert.equal(state.classification, 'incoherent_regular_discount')
  assert.equal(state.is_valid, false)
  assert.ok(state.reason_codes.includes('discount_percent_price_mismatch'))
})

test('rejects a discounted tuple whose current price is not lower', () => {
  const state = normalize({
    currentPrice: '$10.00',
    originalPrice: '$10.00',
    discountPercent: '-50%',
  })

  assert.equal(state.classification, 'incoherent_regular_discount')
  assert.equal(state.is_valid, false)
  assert.ok(
    state.reason_codes.includes('original_price_not_greater_than_current')
  )
})

test('reports a missing current price', () => {
  const state = normalize({ currentPrice: null })

  assert.equal(state.is_valid, false)
  assert.ok(state.reason_codes.includes('current_price_missing'))
  assert.ok(state.reason_codes.includes('current_price_required_for_discount'))
})

test('reports a missing original price', () => {
  const state = normalize({ originalPrice: null })

  assert.equal(state.is_valid, false)
  assert.ok(state.reason_codes.includes('original_price_missing'))
  assert.ok(state.reason_codes.includes('original_price_required_for_discount'))
})

test('rejects a negative price', () => {
  const state = normalize({ currentPrice: '-$1.00' })

  assert.equal(state.current_price_amount, null)
  assert.equal(state.is_valid, false)
  assert.ok(state.reason_codes.includes('current_price_negative'))
})

test('rejects arbitrary monetary text', () => {
  const state = normalize({ currentPrice: 'not a price' })

  assert.equal(state.current_price_amount, null)
  assert.equal(state.current_price_signal, 'unparseable')
  assert.ok(state.reason_codes.includes('current_price_unparseable'))
})

test('classifies FREE with an original price as a temporary promotion candidate', () => {
  const state = normalize({
    currentPrice: 'FREE',
    originalPrice: '$24.99',
    discountPercent: '-100%',
    sourceContext: 'discount_listing',
  })

  assert.equal(state.current_price_amount, 0)
  assert.equal(state.discount_percent_source, -100)
  assert.equal(state.discount_percent_normalized, 100)
  assert.equal(state.classification, 'temporary_free_promotion_candidate')
  assert.equal(state.is_regular_discount_eligible, false)
  assert.equal(state.is_certified_regular_discount_eligible, false)
  assert.equal(state.requires_detail_revalidation, true)
})

test('classifies $945.00 to $0.49 at -100% as extreme and non-certifiable', () => {
  const state = normalize({
    currentPrice: '$0.49',
    originalPrice: '$945.00',
    discountPercent: '-100%',
  })

  assert.equal(state.classification, 'extreme_full_discount')
  assert.equal(state.is_valid, false)
  assert.equal(state.is_certified_regular_discount_eligible, false)
  assert.ok(state.reason_codes.includes('full_discount_positive_current_price'))
  assert.ok(state.reason_codes.includes('certified_price_ratio_exceeded'))
})

test('classifies $12.99 to $0.02 at -100% as extreme and non-certifiable', () => {
  const state = normalize({
    currentPrice: '$0.02',
    originalPrice: '$12.99',
    discountPercent: '-100%',
  })

  assert.equal(state.classification, 'extreme_full_discount')
  assert.equal(state.is_regular_discount_eligible, false)
  assert.equal(state.is_safe_for_price_update, false)
})

test('does not infer permanent free-to-play from an unexplained zero', () => {
  const state = normalize({
    currentPrice: 0,
    originalPrice: null,
    discountPercent: null,
  })

  assert.equal(state.classification, 'ambiguous_zero_price')
  assert.equal(state.is_valid, false)
  assert.equal(state.is_safe_for_price_update, false)
  assert.ok(state.reason_codes.includes('zero_price_without_discount_evidence'))
})

test('accepts a priced item without a discount in detail context', () => {
  const state = normalize({
    currentPrice: '$19.99',
    originalPrice: null,
    discountPercent: null,
  })

  assert.equal(state.classification, 'no_discount')
  assert.equal(state.is_valid, true)
  assert.equal(state.is_safe_for_price_update, true)
  assert.equal(state.discount_percent_normalized, null)
})

test('does not silently accept a missing percentage for discounted prices', () => {
  const state = normalize({ discountPercent: null })

  assert.equal(state.classification, 'ambiguous_no_discount')
  assert.equal(state.is_valid, false)
  assert.ok(state.reason_codes.includes('discount_percent_missing'))
})

test('collector preserves raw negative evidence and adds normalized state', () => {
  const item = buildCollectedListingItem(
    {
      href: 'https://psdeals.net/us-store/game/123/example',
      title: 'Example',
      platformLabel: 'PS5',
      typeLabel: 'Full Game',
      discountText: '-50%',
      discountPriceText: '$4.99',
      regularPriceText: '$4.99',
      originalPriceText: '$9.99',
      imageUrl: null,
    },
    'https://psdeals.net/us-store/discounts'
  )

  assert.equal(item.discount_percent, -50)
  assert.equal(item.discount_percent_normalized, 50)
  assert.equal(item.commercial_state.source.discount_percent, '-50%')
  assert.equal(item.commercial_state.classification, 'regular_discount')
})

test('collector distinguishes FREE from a missing price', () => {
  const item = buildCollectedListingItem(
    {
      href: 'https://psdeals.net/us-store/game/456/free-example',
      title: 'Free Example',
      platformLabel: 'PS4',
      typeLabel: 'Full Game',
      discountText: '-100%',
      discountPriceText: 'FREE',
      regularPriceText: 'FREE',
      originalPriceText: '$24.99',
      imageUrl: null,
    },
    'https://psdeals.net/us-store/discounts'
  )

  assert.equal(item.current_price_amount, 0)
  assert.equal(item.commercial_state.current_price_signal, 'free')
  assert.equal(
    item.commercial_state.classification,
    'temporary_free_promotion_candidate'
  )
})
