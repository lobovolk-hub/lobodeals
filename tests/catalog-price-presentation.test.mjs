import assert from 'node:assert/strict'
import test from 'node:test'

import {
  derivePriceLowPresentation,
  derivePublicPricePresentation,
} from '../lib/catalog-price-presentation.mjs'

test('regular-only card exposes one verified regular price and percentage', () => {
  const result = derivePublicPricePresentation({
    current_price_amount: 8.99,
    original_price_amount: 29.99,
    discount_percent: 70,
    ps_plus_price_amount: null,
    has_verified_deal: true,
    has_verified_ps_plus_deal: false,
  })

  assert.equal(result.has_regular_offer, true)
  assert.equal(result.regular_discount_percent, 70)
  assert.equal(result.has_ps_plus_offer, false)
  assert.equal(result.show_buy_price, false)
  assert.equal(result.show_original_price, true)
  assert.deepEqual(result.savings_labels, ['-70%'])
})

test('PS+-only card derives its percentage from the regular buy price', () => {
  const result = derivePublicPricePresentation({
    current_price_amount: 29.99,
    original_price_amount: null,
    discount_percent: 0,
    ps_plus_price_amount: 5.99,
    has_verified_deal: false,
    has_verified_ps_plus_deal: true,
  })

  assert.equal(result.has_regular_offer, false)
  assert.equal(result.has_ps_plus_offer, true)
  assert.equal(result.ps_plus_base_amount, 29.99)
  assert.equal(result.ps_plus_discount_percent, 80)
  assert.equal(result.show_buy_price, true)
  assert.equal(result.buy_price_amount, 29.99)
  assert.equal(result.show_original_price, false)
})

test('regular and PS+ offers remain simultaneous with independent percentages', () => {
  const result = derivePublicPricePresentation({
    current_price_amount: 8.99,
    original_price_amount: 29.99,
    discount_percent: 80,
    ps_plus_price_amount: 5.99,
    has_verified_deal: true,
    has_verified_ps_plus_deal: true,
  })

  assert.equal(result.has_regular_offer, true)
  assert.equal(result.has_ps_plus_offer, true)
  assert.equal(result.regular_discount_percent, 70)
  assert.equal(result.ps_plus_discount_percent, 80)
  assert.equal(result.show_buy_price, false)
  assert.equal(result.show_original_price, true)
  assert.deepEqual(result.savings_labels, ['-70%', 'PS+ -80%'])
})

test('41 Hours double-discount derives regular and PS+ percentages independently', () => {
  const result = derivePublicPricePresentation({
    current_price_amount: 6.99,
    original_price_amount: 19.99,
    discount_percent: 75,
    ps_plus_price_amount: 4.99,
    has_verified_deal: true,
    has_verified_ps_plus_deal: true,
  })

  assert.equal(result.has_regular_offer, true)
  assert.equal(result.regular_discount_percent, 65)
  assert.equal(result.has_ps_plus_offer, true)
  assert.equal(result.ps_plus_discount_percent, 75)
  assert.deepEqual(result.savings_labels, ['-65%', 'PS+ -75%'])
})

test('regular-only arithmetic remains independent from stored best-price semantics', () => {
  const result = derivePublicPricePresentation({
    current_price_amount: 5.99,
    original_price_amount: 19.99,
    discount_percent: 70,
    ps_plus_price_amount: null,
    has_verified_deal: true,
    has_verified_ps_plus_deal: false,
  })

  assert.equal(result.regular_discount_percent, 70)
  assert.equal(result.has_regular_offer, true)
})

test('stored percentage cannot manufacture an offer without coherent amounts', () => {
  const result = derivePublicPricePresentation({
    current_price_amount: 19.99,
    original_price_amount: 19.99,
    discount_percent: 75,
    ps_plus_price_amount: 29.99,
    has_verified_deal: true,
    has_verified_ps_plus_deal: true,
  })

  assert.equal(result.has_regular_offer, false)
  assert.equal(result.has_ps_plus_offer, false)
  assert.equal(result.show_buy_price, true)
  assert.equal(result.buy_price_amount, 19.99)
  assert.deepEqual(result.savings_labels, [])
})

test('Monthly entitlement stays separate and zero never becomes a commercial PS+ offer', () => {
  const result = derivePublicPricePresentation({
    current_price_amount: 19.99,
    original_price_amount: 19.99,
    discount_percent: 0,
    ps_plus_price_amount: 0,
    has_verified_deal: false,
    has_verified_ps_plus_deal: true,
    is_ps_plus_monthly_game: true,
  })

  assert.equal(result.is_monthly_entitlement, true)
  assert.equal(result.buy_price_amount, 19.99)
  assert.equal(result.has_regular_offer, false)
  assert.equal(result.has_ps_plus_offer, false)
  assert.equal(result.show_buy_price, true)
  assert.deepEqual(result.savings_labels, [])
})

test('Monthly membership preserves an independent verified regular sale', () => {
  const result = derivePublicPricePresentation({
    current_price_amount: 44.99,
    original_price_amount: 59.99,
    discount_percent: 25,
    ps_plus_price_amount: 0,
    has_verified_deal: true,
    has_verified_ps_plus_deal: false,
    is_ps_plus_monthly_game: true,
  })

  assert.equal(result.is_monthly_entitlement, true)
  assert.equal(result.has_regular_offer, true)
  assert.equal(result.regular_price_amount, 44.99)
  assert.equal(result.regular_discount_percent, 25)
  assert.equal(result.has_ps_plus_offer, false)
})

test('Monthly membership permits an independent positive verified PS+ offer', () => {
  const result = derivePublicPricePresentation({
    current_price_amount: 59.99,
    original_price_amount: 59.99,
    discount_percent: 0,
    ps_plus_price_amount: 39.99,
    has_verified_deal: false,
    has_verified_ps_plus_deal: true,
    is_ps_plus_monthly_game: true,
  })

  assert.equal(result.is_monthly_entitlement, true)
  assert.equal(result.has_ps_plus_offer, true)
  assert.equal(result.ps_plus_discount_percent, 33)
  assert.equal(result.show_buy_price, true)
})

test('unverified flags cannot make preserved commercial values public', () => {
  const result = derivePublicPricePresentation({
    current_price_amount: 8.99,
    original_price_amount: 29.99,
    discount_percent: 70,
    ps_plus_price_amount: 5.99,
    has_verified_deal: false,
    has_verified_ps_plus_deal: false,
  })

  assert.equal(result.has_regular_offer, false)
  assert.equal(result.has_ps_plus_offer, false)
  assert.equal(result.show_buy_price, true)
})

test('legacy lows stay visible without being promoted to certified lows', () => {
  const legacyOnly = derivePriceLowPresentation({ legacy: 3.99, certified: null })
  assert.equal(legacyOnly.historical_amount, 3.99)
  assert.equal(legacyOnly.certified_amount, null)
  assert.equal(legacyOnly.values_match, false)

  const both = derivePriceLowPresentation({ legacy: 3.99, certified: 3.99 })
  assert.equal(both.historical_amount, 3.99)
  assert.equal(both.certified_amount, 3.99)
  assert.equal(both.values_match, true)
})
