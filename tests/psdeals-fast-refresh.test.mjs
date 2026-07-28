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
