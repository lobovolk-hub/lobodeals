import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyFastRefreshItem,
  selectFastRefreshQueues,
} from '../scripts/lib/psdeals-fast-refresh.mjs'

const NOW = Date.parse('2026-07-28T12:00:00Z')

function row(id, {
  shouldRefresh = false,
  psPlus = false,
  syncedAt = '2026-07-20T00:00:00Z',
} = {}) {
  return {
    listing: {
      psdeals_id: id,
      psdeals_url: `https://psdeals.net/us-store/game/${id}/item-${id}`,
    },
    db: {
      is_ps_plus_discount: psPlus,
      detail_last_synced_at: syncedAt,
    },
    shouldRefresh,
    reasons: shouldRefresh ? ['required'] : [],
  }
}

function regularDiscountRow(id, {
  psPlus = false,
  syncedAt = '2026-07-20T00:00:00Z',
  dbCurrentPrice = 8.99,
} = {}) {
  const listing = {
    psdeals_id: id,
    psdeals_url: `https://psdeals.net/us-store/game/${id}/item-${id}`,
    current_price_amount: 8.99,
    original_price_amount: 29.99,
    discount_percent: 70,
  }
  const db = {
    current_price_amount: dbCurrentPrice,
    original_price_amount: 29.99,
    discount_percent: 70,
    is_ps_plus_discount: psPlus,
    detail_last_synced_at: syncedAt,
    raw_detail_json: psPlus
      ? { current_ps_plus_price_amount: 5.99 }
      : {},
  }

  return {
    listing,
    db,
    ...classifyFastRefreshItem(listing, db),
  }
}

test('null listing prices produce observable must-refresh reasons', () => {
  const classification = classifyFastRefreshItem(
    {
      psdeals_id: 1,
      current_price_amount: null,
      original_price_amount: 9.99,
      discount_percent: -100,
    },
    {
      current_price_amount: 0,
      original_price_amount: 9.99,
      discount_percent: 100,
      detail_last_synced_at: '2026-07-27T00:00:00Z',
      is_ps_plus_discount: false,
    }
  )

  assert.equal(classification.shouldRefresh, true)
  assert.ok(classification.reasons.includes('current_price_missing'))
  assert.ok(
    classification.reasons.includes('full_discount_current_price_missing')
  )
})

test('PS Plus recheck queue may be populated independently', () => {
  const result = selectFastRefreshQueues(
    [row(1, { psPlus: true }), row(2, { psPlus: true })],
    { psPlusRecheckLimit: 2, staleLimit: 0, nowMs: NOW }
  )

  assert.equal(result.psPlusRecheckCandidates.length, 2)
  assert.equal(result.staleCandidates.length, 0)
})

test('empty PS Plus queue is handled safely', () => {
  const result = selectFastRefreshQueues(
    [row(1), row(2)],
    { psPlusRecheckLimit: 5, staleLimit: 1, nowMs: NOW }
  )

  assert.equal(result.psPlusRecheckCandidates.length, 0)
  assert.equal(result.staleCandidates.length, 1)
})

test('empty must-refresh queue is handled safely', () => {
  const result = selectFastRefreshQueues(
    [row(1, { syncedAt: '2026-07-28T11:30:00Z' })],
    { staleHours: 24, nowMs: NOW }
  )

  assert.deepEqual(result.mustRefresh, [])
  assert.deepEqual(result.combined, [])
  assert.equal(result.skippedSafe.length, 1)
})

test('null analyzed arrays are handled safely', () => {
  const result = selectFastRefreshQueues(null)

  assert.deepEqual(result.mustRefresh, [])
  assert.deepEqual(result.psPlusRecheckCandidates, [])
  assert.deepEqual(result.staleCandidates, [])
  assert.deepEqual(result.combined, [])
})

test('queues do not overlap and combined URLs remain unique', () => {
  const result = selectFastRefreshQueues(
    [
      row(1, { shouldRefresh: true }),
      row(1, { psPlus: true }),
      row(2, { psPlus: true }),
      row(3),
    ],
    { psPlusRecheckLimit: 2, staleLimit: 2, nowMs: NOW }
  )

  const mustIds = new Set(result.mustRefresh.map((entry) => entry.listing.psdeals_id))
  const psPlusIds = new Set(result.psPlusRecheckCandidates.map((entry) => entry.listing.psdeals_id))
  const staleIds = new Set(result.staleCandidates.map((entry) => entry.listing.psdeals_id))
  const combinedUrls = result.combined.map((entry) => entry.listing.psdeals_url)

  assert.equal([...mustIds].some((id) => psPlusIds.has(id) || staleIds.has(id)), false)
  assert.equal([...psPlusIds].some((id) => staleIds.has(id)), false)
  assert.equal(new Set(combinedUrls).size, combinedUrls.length)
})

test('PS Plus and stale limits are independent', () => {
  const result = selectFastRefreshQueues(
    [
      row(1, { psPlus: true }),
      row(2, { psPlus: true }),
      row(3, { psPlus: true }),
      row(4),
      row(5),
      row(6),
      row(7),
    ],
    { psPlusRecheckLimit: 3, staleLimit: 2, nowMs: NOW }
  )

  assert.equal(result.psPlusRecheckCandidates.length, 3)
  assert.equal(result.staleCandidates.length, 2)
  assert.equal(result.combined.length, 5)
})

test('recent safe regular discount without known PS Plus avoids Detail', () => {
  const candidate = regularDiscountRow(100, {
    syncedAt: '2026-07-28T11:30:00Z',
    dbCurrentPrice: 9.99,
  })
  assert.equal(candidate.shouldRefresh, true)
  assert.ok(candidate.reasons.includes('current_price_mismatch'))

  const result = selectFastRefreshQueues([candidate], {
    staleLimit: 2,
    staleHours: 24,
    psPlusRecheckLimit: 3,
    psPlusDiscoveryLimit: 50,
    psPlusDiscoveryHours: 7 * 24,
    nowMs: NOW,
  })

  assert.equal(result.mustRefresh.length, 0)
  assert.equal(result.listingOwnedSafeChanges.length, 1)
  assert.equal(result.psPlusDiscoveryCandidates.length, 0)
  assert.equal(result.combined.length, 0)
  assert.equal(result.skippedSafe.length, 1)
})

test('sub-seven-day regular row stays out of discovery but may use generic stale', () => {
  const candidate = regularDiscountRow(104, {
    syncedAt: '2026-07-25T12:00:00Z',
  })

  const result = selectFastRefreshQueues([candidate], {
    staleLimit: 2,
    staleHours: 24,
    psPlusRecheckLimit: 3,
    psPlusDiscoveryLimit: 50,
    psPlusDiscoveryHours: 7 * 24,
    nowMs: NOW,
  })

  assert.equal(result.psPlusDiscoveryCandidates.length, 0)
  assert.equal(result.staleCandidates.length, 1)
  assert.ok(result.staleCandidates[0].reasons.includes('stale_rotation'))
  assert.equal(result.combined.length, 1)
})

test('old safe regular discount without known PS Plus enters bounded discovery', () => {
  const candidate = regularDiscountRow(101, {
    syncedAt: '2026-04-30T00:00:00Z',
    dbCurrentPrice: 9.99,
  })

  const result = selectFastRefreshQueues([candidate], {
    staleLimit: 0,
    psPlusRecheckLimit: 0,
    psPlusDiscoveryLimit: 1,
    psPlusDiscoveryHours: 7 * 24,
    nowMs: NOW,
  })

  assert.equal(result.mustRefresh.length, 0)
  assert.equal(result.psPlusDiscoveryCandidates.length, 1)
  assert.equal(result.psPlusDiscoveryCandidates[0].listing.psdeals_id, 101)
  assert.ok(
    result.psPlusDiscoveryCandidates[0].reasons.includes(
      'ps_plus_discovery_stale_regular_discount'
    )
  )
})

test('known PS Plus keeps revalidation priority during a safe regular mismatch', () => {
  const knownCandidate = regularDiscountRow(102, {
    psPlus: true,
    syncedAt: '2026-07-20T00:00:00Z',
    dbCurrentPrice: 9.99,
  })
  const discoveryCandidate = regularDiscountRow(101, {
    syncedAt: '2026-04-30T00:00:00Z',
  })

  const result = selectFastRefreshQueues(
    [discoveryCandidate, knownCandidate],
    {
    staleLimit: 0,
    psPlusRecheckLimit: 1,
    psPlusDiscoveryLimit: 1,
    nowMs: NOW,
    }
  )

  assert.equal(result.mustRefresh.length, 0)
  assert.equal(result.psPlusRecheckCandidates.length, 1)
  assert.equal(result.psPlusDiscoveryCandidates.length, 1)
  assert.equal(result.combined[0].listing.psdeals_id, 102)
  assert.equal(result.combined[1].listing.psdeals_id, 101)
})

test('listing-owned safe changes do not suppress non-listing Detail risks', () => {
  const candidate = regularDiscountRow(103, {
    psPlus: true,
    syncedAt: null,
    dbCurrentPrice: 9.99,
  })
  candidate.db.raw_detail_json = {}
  Object.assign(
    candidate,
    classifyFastRefreshItem(candidate.listing, candidate.db)
  )

  const result = selectFastRefreshQueues([candidate], {
    staleLimit: 0,
    psPlusRecheckLimit: 0,
    psPlusDiscoveryLimit: 0,
    nowMs: NOW,
  })

  assert.ok(candidate.reasons.includes('detail_never_synced'))
  assert.ok(candidate.reasons.includes('ps_plus_risk_missing_raw_price'))
  assert.equal(result.mustRefresh.length, 1)
  assert.equal(result.combined.length, 1)
})

test('safe regular discounts are not revalidated en masse', () => {
  const candidates = Array.from({ length: 500 }, (_, index) =>
    regularDiscountRow(index + 1, {
      syncedAt: '2026-07-28T11:30:00Z',
    })
  )

  const result = selectFastRefreshQueues(candidates, {
    staleLimit: 2,
    staleHours: 24,
    psPlusRecheckLimit: 3,
    psPlusDiscoveryLimit: 50,
    psPlusDiscoveryHours: 7 * 24,
    nowMs: NOW,
  })

  assert.equal(result.combined.length, 0)
  assert.equal(result.skippedSafe.length, 500)
})

test('PS Plus discovery remains deterministic and bounded for thousands of old rows', () => {
  const candidates = Array.from({ length: 2000 }, (_, index) =>
    regularDiscountRow(index + 1, {
      syncedAt: '2026-04-30T00:00:00Z',
    })
  )
  const options = {
    staleLimit: 2,
    staleHours: 24,
    psPlusRecheckLimit: 3,
    psPlusDiscoveryLimit: 50,
    psPlusDiscoveryHours: 7 * 24,
    nowMs: NOW,
  }

  const forward = selectFastRefreshQueues(candidates, options)
  const reversed = selectFastRefreshQueues([...candidates].reverse(), options)
  const selectedIds = (result) =>
    result.psPlusDiscoveryCandidates.map((entry) => entry.listing.psdeals_id)

  assert.equal(forward.psPlusDiscoveryCandidates.length, 50)
  assert.equal(forward.staleCandidates.length, 2)
  assert.equal(forward.combined.length, 52)
  assert.deepEqual(selectedIds(forward), selectedIds(reversed))
  assert.equal(new Set(forward.combined.map((entry) => entry.listing.psdeals_id)).size, 52)
})
