import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizePsdealsCommercialState } from '../scripts/lib/psdeals-commercial-state.mjs'
import {
  applyPsdealsCertifiedPriceLow,
  evaluatePsdealsCertifiedPriceLowObservation,
} from '../scripts/lib/psdeals-compact-minima.mjs'

function regularObservation(overrides = {}) {
  return {
    local_cycle_id: 'cycle-2026-07-30',
    item_id: 'item-001',
    psdeals_id: 1001,
    region_code: 'us',
    storefront: 'playstation',
    currency_code: 'USD',
    price_kind: 'regular',
    price_amount: 4.99,
    observed_at: '2026-07-30T12:00:00Z',
    producer: 'listing',
    commercial_state: normalizePsdealsCommercialState({
      currentPrice: '$4.99',
      originalPrice: '$9.99',
      discountPercent: '-50%',
      sourceContext: 'discount_listing',
    }),
    is_free_to_play: false,
    type_classification_safe: true,
    platform_classification_safe: true,
    deal_active: true,
    ...overrides,
  }
}

function psPlusObservation(overrides = {}) {
  return {
    local_cycle_id: 'cycle-2026-07-30',
    item_id: 'item-001',
    psdeals_id: 1001,
    region_code: 'us',
    storefront: 'playstation',
    currency_code: 'USD',
    price_kind: 'ps_plus',
    price_amount: 3.99,
    ps_plus_price_amount: 3.99,
    current_price_amount: 4.99,
    observed_at: '2026-07-30T12:05:00Z',
    producer: 'detail',
    is_ps_plus_discount: true,
    ps_plus_price_source: 'detail_buy_box',
    current_ps_plus_buy_box_price_amount: 3.99,
    ps_plus_parser_status: 'parsed_current_discount',
    ps_plus_source_consistent: true,
    is_monthly_entitlement: false,
    is_monthly_game: false,
    is_free_to_play: false,
    commercial_state: { classification: 'regular_price' },
    type_classification_safe: true,
    platform_classification_safe: true,
    deal_active: true,
    ...overrides,
  }
}

test('accepts a coherent regular observation from one explicit future cycle', () => {
  const result = evaluatePsdealsCertifiedPriceLowObservation(regularObservation())
  assert.equal(result.is_valid, true)
  assert.equal(result.can_update_certified_low, true)
  assert.equal(result.classification, 'regular_certified_cycle_observation')
  assert.equal(result.normalized_observation.price_amount, 4.99)
})

test('accepts coherent regular observations across the full 1 to 99 range', () => {
  for (const percent of [1, 50, 95, 96, 97, 98, 99]) {
    const current = 100 - percent
    const commercialState = normalizePsdealsCommercialState({
      currentPrice: current,
      originalPrice: 100,
      discountPercent: -percent,
      sourceContext: 'discount_listing',
    })
    const result = evaluatePsdealsCertifiedPriceLowObservation(
      regularObservation({
        price_amount: current,
        commercial_state: commercialState,
      })
    )
    assert.equal(result.can_update_certified_low, true, `${percent}%`)
  }
})

test('rejects one hundred percent as a certified regular observation', () => {
  const commercialState = normalizePsdealsCommercialState({
    currentPrice: 0,
    originalPrice: 100,
    discountPercent: -100,
    sourceContext: 'discount_listing',
  })
  const result = evaluatePsdealsCertifiedPriceLowObservation(
    regularObservation({
      price_amount: 0,
      commercial_state: commercialState,
    })
  )
  assert.equal(result.can_update_certified_low, false)
})

test('non-Monthly regular and PS Plus observations keep their certified-low behavior', () => {
  const regular = evaluatePsdealsCertifiedPriceLowObservation(
    regularObservation()
  )
  const result = evaluatePsdealsCertifiedPriceLowObservation(psPlusObservation())
  assert.equal(regular.is_valid, true)
  assert.equal(result.is_valid, true)
  assert.equal(result.classification, 'ps_plus_certified_cycle_observation')
})

test('Monthly FREE entitlement alone never initializes Lowest PS Plus', () => {
  const result = applyPsdealsCertifiedPriceLow(null, psPlusObservation({
    price_amount: 0,
    ps_plus_price_amount: 0,
    current_price_amount: 19.99,
    current_ps_plus_buy_box_price_amount: 0,
    ps_plus_price_source: 'monthly_entitlement',
    ps_plus_parser_status: 'parsed_not_discount',
    is_ps_plus_discount: false,
    is_monthly_game: true,
    is_monthly_entitlement: true,
    commercial_state: {
      classification: 'temporary_free_promotion_candidate',
    },
  }))

  assert.equal(result.changed, false)
  assert.equal(result.value, null)
  assert.equal(result.reason_code, 'observation_not_certifiable')
})

test('Monthly membership allows an independent positive PS Plus commercial low', () => {
  const result = applyPsdealsCertifiedPriceLow(null, psPlusObservation({
    price_amount: 39.99,
    ps_plus_price_amount: 39.99,
    current_price_amount: 59.99,
    current_ps_plus_buy_box_price_amount: 39.99,
    is_monthly_game: true,
    is_monthly_entitlement: false,
  }))

  assert.equal(result.changed, true)
  assert.equal(result.reason_code, 'certified_low_initialized')
  assert.equal(result.value.amount, 39.99)
})

test('Monthly PS Plus buy-box zero can never write zero as a low', () => {
  const result = applyPsdealsCertifiedPriceLow(null, psPlusObservation({
    price_amount: 0,
    ps_plus_price_amount: 0,
    current_price_amount: 59.99,
    current_ps_plus_buy_box_price_amount: 0,
    is_monthly_game: true,
    is_monthly_entitlement: true,
  }))

  assert.equal(result.changed, false)
  assert.equal(result.value, null)
})

test('Big Walk Monthly evidence keeps Lowest PS Plus null', () => {
  const result = applyPsdealsCertifiedPriceLow(null, psPlusObservation({
    item_id: 'big-walk-item',
    psdeals_id: 3781017,
    price_amount: 0,
    ps_plus_price_amount: 0,
    current_price_amount: 19.99,
    current_ps_plus_buy_box_price_amount: 0,
    ps_plus_price_source: 'monthly_entitlement',
    ps_plus_parser_status: 'parsed_not_discount',
    is_ps_plus_discount: false,
    is_monthly_game: true,
    is_monthly_entitlement: true,
    commercial_state: {
      classification: 'temporary_free_promotion_candidate',
    },
  }))

  assert.equal(result.changed, false)
  assert.equal(result.value, null)
})

test('temporary free promotion classification can never write a PS Plus low', () => {
  const result = applyPsdealsCertifiedPriceLow(null, psPlusObservation({
    price_amount: 39.99,
    ps_plus_price_amount: 39.99,
    current_price_amount: 59.99,
    current_ps_plus_buy_box_price_amount: 39.99,
    is_monthly_game: true,
    is_monthly_entitlement: false,
    commercial_state: {
      classification: 'temporary_free_promotion_candidate',
    },
  }))

  assert.equal(result.changed, false)
  assert.equal(result.value, null)
  assert.ok(
    result.evaluation.reason_codes.includes(
      'ps_plus_temporary_free_promotion_forbidden'
    )
  )
})

test('rejects evidence not bound to an explicit cycle and producer', () => {
  const result = evaluatePsdealsCertifiedPriceLowObservation(
    regularObservation({ local_cycle_id: null, producer: 'history' })
  )
  assert.equal(result.can_update_certified_low, false)
  assert.ok(result.reason_codes.includes('local_cycle_id_missing'))
  assert.ok(result.reason_codes.includes('regular_listing_producer_required'))
})

test('rejects incoherent, FREE, zero and extreme -100 percent observations', () => {
  const extreme = normalizePsdealsCommercialState({
    currentPrice: '$0.02',
    originalPrice: '$12.99',
    discountPercent: '-100%',
    sourceContext: 'discount_listing',
  })

  for (const observation of [
    regularObservation({
      price_amount: 8,
      commercial_state: normalizePsdealsCommercialState({
        currentPrice: '$8.00',
        originalPrice: '$10.00',
        discountPercent: '-50%',
        sourceContext: 'discount_listing',
      }),
    }),
    regularObservation({ price_amount: 0 }),
    regularObservation({ price_amount: 'FREE' }),
    regularObservation({ price_amount: 0.02, commercial_state: extreme }),
  ]) {
    assert.equal(
      evaluatePsdealsCertifiedPriceLowObservation(observation)
        .can_update_certified_low,
      false
    )
  }
})

test('rejects unsafe classification, wrong scope and wrong currency', () => {
  for (const observation of [
    regularObservation({ type_classification_safe: false }),
    regularObservation({ platform_classification_safe: false }),
    regularObservation({ storefront: 'other' }),
    regularObservation({ currency_code: 'EUR' }),
  ]) {
    assert.equal(
      evaluatePsdealsCertifiedPriceLowObservation(observation)
        .can_update_certified_low,
      false
    )
  }
})

test('initializes and lowers a certified low but ignores equal and higher values', () => {
  const initialized = applyPsdealsCertifiedPriceLow(
    null,
    regularObservation()
  )
  assert.equal(initialized.changed, true)
  assert.equal(initialized.reason_code, 'certified_low_initialized')

  const equal = applyPsdealsCertifiedPriceLow(
    initialized.value,
    regularObservation({ observed_at: '2026-07-31T12:00:00Z' })
  )
  assert.equal(equal.changed, false)
  assert.equal(equal.reason_code, 'certified_low_equal')

  const higherCommercial = normalizePsdealsCommercialState({
    currentPrice: '$5.99',
    originalPrice: '$9.99',
    discountPercent: '-40%',
    sourceContext: 'discount_listing',
  })
  const higher = applyPsdealsCertifiedPriceLow(
    initialized.value,
    regularObservation({
      price_amount: 5.99,
      commercial_state: higherCommercial,
    })
  )
  assert.equal(higher.changed, false)
  assert.equal(higher.reason_code, 'certified_low_higher')

  const lowerCommercial = normalizePsdealsCommercialState({
    currentPrice: '$3.99',
    originalPrice: '$9.99',
    discountPercent: '-60%',
    sourceContext: 'discount_listing',
  })
  const lower = applyPsdealsCertifiedPriceLow(
    initialized.value,
    regularObservation({
      price_amount: 3.99,
      observed_at: '2026-08-01T12:00:00Z',
      commercial_state: lowerCommercial,
    })
  )
  assert.equal(lower.changed, true)
  assert.equal(lower.reason_code, 'certified_low_lowered')
})

test('an invalid future observation never clears an existing certified low', () => {
  const previous = {
    amount: 4.99,
    observed_at: '2026-07-30T12:00:00Z',
  }
  const result = applyPsdealsCertifiedPriceLow(
    previous,
    regularObservation({ price_amount: null })
  )
  assert.equal(result.changed, false)
  assert.deepEqual(result.value, previous)
})
