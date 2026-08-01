import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluateEndedDiscountDemotionCandidate,
  selectEndedDiscountCandidatesFromListing,
} from '../scripts/lib/psdeals-ended-discounts.mjs'

const OBSERVED_AT = '2026-08-01T12:00:00.000Z'

function row(overrides = {}) {
  return {
    id: 101,
    region_code: 'us',
    storefront: 'playstation',
    psdeals_id: 900101,
    psdeals_slug: 'safe-ended-deal',
    psdeals_url: 'https://psdeals.net/us-store/game/900101/safe-ended-deal',
    title: 'Safe ended deal',
    content_type: 'game',
    item_type_label: 'game',
    current_price_amount: 5,
    original_price_amount: 10,
    discount_percent: 50,
    deal_ends_at: '2026-07-31T23:59:59.000Z',
    is_ps_plus_discount: false,
    updated_at: '2026-07-31T23:00:00.000Z',
    ...overrides,
  }
}

function options(overrides = {}) {
  return {
    listing_complete: true,
    monthly_evidence_verified: true,
    monthly_item_ids: [],
    observed_at: OBSERVED_AT,
    ...overrides,
  }
}

test('selects only a coherent regular deal absent from a strongly complete listing', () => {
  const value = selectEndedDiscountCandidatesFromListing([], [row()], options())
  assert.deepEqual(value.candidates.map((entry) => entry.psdeals_id), [900101])
  assert.equal(value.blocked_candidates.length, 0)

  const active = selectEndedDiscountCandidatesFromListing(
    [{ psdeals_id: 900101 }],
    [row()],
    options()
  )
  assert.equal(active.absent_candidates.length, 0)
  assert.equal(active.candidates.length, 0)
})

test('fails closed when listing or monthly evidence is not verified', () => {
  const incomplete = evaluateEndedDiscountDemotionCandidate(
    row(),
    options({ listing_complete: false })
  )
  assert.equal(incomplete.eligible, false)
  assert.ok(incomplete.reason_codes.includes('listing_not_strongly_complete'))

  const monthlyUnknown = evaluateEndedDiscountDemotionCandidate(
    row(),
    options({ monthly_evidence_verified: false })
  )
  assert.ok(monthlyUnknown.reason_codes.includes('monthly_membership_unverified'))
})

test('blocks future deals, active PS Plus and active Monthly rows', () => {
  const future = evaluateEndedDiscountDemotionCandidate(
    row({ deal_ends_at: '2026-08-02T00:00:00.000Z' }),
    options()
  )
  assert.ok(future.reason_codes.includes('deal_end_in_future'))

  for (const isPsPlus of [true, null]) {
    const plus = evaluateEndedDiscountDemotionCandidate(
      row({ is_ps_plus_discount: isPsPlus }),
      options()
    )
    assert.ok(plus.reason_codes.includes('ps_plus_state_ambiguous_or_active'))
  }

  const monthly = evaluateEndedDiscountDemotionCandidate(
    row(),
    options({ monthly_item_ids: [101] })
  )
  assert.ok(monthly.reason_codes.includes('active_monthly_game'))
})

test('blocks missing or incoherent prices and extreme discounts', () => {
  const fixtures = [
    [row({ original_price_amount: null }), 'original_price_invalid'],
    [row({ original_price_amount: 4 }), 'original_price_not_greater_than_current'],
    [row({ discount_percent: 40 }), 'discount_percent_price_mismatch'],
    [row({ current_price_amount: 0, discount_percent: 100 }), 'discount_percent_not_regular'],
  ]
  for (const [candidate, reason] of fixtures) {
    const value = evaluateEndedDiscountDemotionCandidate(candidate, options())
    assert.equal(value.eligible, false)
    assert.ok(value.reason_codes.includes(reason), reason)
  }
})

test('blocks wrong family and doubtful product identity', () => {
  const wrongFamily = evaluateEndedDiscountDemotionCandidate(
    row({ content_type: 'dlc', item_type_label: 'game' }),
    options()
  )
  assert.ok(wrongFamily.reason_codes.includes('content_family_invalid'))

  const wrongUrl = evaluateEndedDiscountDemotionCandidate(
    row({ psdeals_url: 'https://psdeals.net/us-store/game/999999/wrong' }),
    options()
  )
  assert.ok(wrongUrl.reason_codes.includes('psdeals_url_identity_mismatch'))

  const ambiguous = evaluateEndedDiscountDemotionCandidate(
    row({ identity_ambiguous: true }),
    options()
  )
  assert.ok(ambiguous.reason_codes.includes('identity_ambiguous'))
})

test('one invalid listing identity blocks every absence-based demotion', () => {
  const value = selectEndedDiscountCandidatesFromListing(
    [{ psdeals_id: 'not-an-id' }],
    [row()],
    options()
  )
  assert.equal(value.invalid_listing_items.length, 1)
  assert.equal(value.candidates.length, 0)
  assert.ok(value.blocked_candidates[0].demotion_blockers.includes('listing_identity_invalid'))
})
