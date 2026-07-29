import assert from 'node:assert/strict'
import test from 'node:test'

import {
  executePreparedPsdealsListingBatches,
  executeReconciledPsdealsListingUpsert,
  preparePsdealsListingUpsertBatches,
  PSDEALS_STAGE_UPSERT_CONFLICT_TARGET,
} from '../scripts/lib/psdeals-listing-upsert-adapter.mjs'
import {
  buildPsdealsCriticalActionRequest,
  executePsdealsCriticalActionWithPort,
} from '../scripts/lib/psdeals-operational-contracts.mjs'
import { normalizePsdealsCommercialState } from '../scripts/lib/psdeals-commercial-state.mjs'
import {
  classifyPsdealsItemType,
  normalizePsdealsPlatforms,
} from '../scripts/lib/psdeals-item-classification.mjs'

function item(id, overrides = {}) {
  return {
    psdeals_id: id,
    psdeals_slug: `fixture-${id}`,
    psdeals_url: `https://psdeals.net/us-store/game/${id}/fixture-${id}`,
    title: `Fixture ${id}`,
    commercial_state: normalizePsdealsCommercialState({
      current_price: '$9.99',
      original_price: '$19.99',
      source_discount_percent: '-50%',
    }),
    type_classification: classifyPsdealsItemType('Full Game'),
    platform_classification: normalizePsdealsPlatforms('PS5 / PS4'),
    ...overrides,
  }
}

test('prepares homogeneous safe insert and update batches with demonstrated conflict target', () => {
  const result = preparePsdealsListingUpsertBatches({
    listing_items: [item(1), item(2)],
    existing_psdeals_ids: [2],
    listing_observed_at: '2026-07-29T18:00:00.000Z',
    batch_size: 1,
  })
  assert.equal(result.prepared, 2)
  assert.equal(result.batches.length, 2)
  assert.equal(result.conflict_target, PSDEALS_STAGE_UPSERT_CONFLICT_TARGET)
  assert.deepEqual(result.batches.map((batch) => batch.operation).sort(), ['insert', 'update'])
  assert.equal(result.batches.some((batch) => batch.rows.some((row) => Object.values(row).includes(null))), false)
  assert.equal(result.batches.some((batch) => batch.columns.some((column) => column.startsWith('lobodeals_lowest_'))), false)
})

test('omits an unsafe row without losing another safe row', () => {
  const result = preparePsdealsListingUpsertBatches({
    listing_items: [item(1), item(null)],
    existing_psdeals_ids: [],
    listing_observed_at: '2026-07-29T18:00:00.000Z',
  })
  assert.equal(result.prepared, 1)
  assert.equal(result.omitted_count, 1)
  assert.equal(result.valid, false)
})

test('requires explicit existing-row knowledge instead of guessing insert ownership', () => {
  assert.throws(
    () => preparePsdealsListingUpsertBatches({ listing_items: [item(1)] }),
    /EXISTING_PSDEALS_IDS_REQUIRED/
  )
})

test('fake upsert port reports succeeded, partial, and failed batches structurally', async () => {
  const prepared = preparePsdealsListingUpsertBatches({
    listing_items: [item(1), item(2)],
    existing_psdeals_ids: [],
    listing_observed_at: '2026-07-29T18:00:00.000Z',
    batch_size: 1,
  })
  let call = 0
  const result = await executePreparedPsdealsListingBatches(prepared, {
    upsert_batch: async (batch) => {
      call += 1
      if (call === 2) throw new Error('fixture failure')
      return { succeeded: batch.rows.length, failed: 0 }
    },
  })
  assert.equal(result.status, 'partial')
  assert.equal(result.succeeded, 1)
  assert.equal(result.failed, 1)
})

test('reconciled listing upsert distinguishes inserts, updates, and exact postconditions', async () => {
  const rows = new Map()
  const result = await executeReconciledPsdealsListingUpsert({
    listing_items: [item(1), item(2)],
    listing_observed_at: '2026-07-29T21:30:00.000Z',
    authorization_id: 'auth-stage-upsert-fixture',
  }, {
    select_existing_rows: async () => [{ psdeals_id: 2 }],
    upsert_batch: async (batch) => {
      for (const row of batch.rows) rows.set(row.psdeals_id, { ...row })
      return batch.rows
    },
    select_rows_for_verification: async (ids) => ids.map((id) => rows.get(id)),
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(result.status, 'succeeded')
  assert.equal(result.inserted, 1)
  assert.equal(result.updated, 1)
  assert.equal(result.failed, 0)
})

test('upsert timeout is reconciled from exact owned fields without automatic retry', async () => {
  const rows = new Map()
  let calls = 0
  const result = await executeReconciledPsdealsListingUpsert({
    listing_items: [item(1)],
    listing_observed_at: '2026-07-29T21:30:00.000Z',
    authorization_id: 'auth-stage-upsert-fixture',
  }, {
    select_existing_rows: async () => [],
    upsert_batch: async (batch) => {
      calls += 1
      for (const row of batch.rows) rows.set(row.psdeals_id, { ...row })
      throw new Error('SIMULATED_TIMEOUT_AFTER_COMMIT')
    },
    select_rows_for_verification: async (ids) => ids.map((id) => rows.get(id)),
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(result.status, 'succeeded')
  assert.equal(result.batches[0].reconciled_after_ambiguous_transport, true)
  assert.equal(calls, 1)
})

test('partial and concurrent postcondition mismatches remain observable', async () => {
  const result = await executeReconciledPsdealsListingUpsert({
    listing_items: [item(1), item(2)],
    listing_observed_at: '2026-07-29T21:30:00.000Z',
    authorization_id: 'auth-stage-upsert-fixture',
    batch_size: 1,
  }, {
    select_existing_rows: async () => [],
    upsert_batch: async () => [],
    select_rows_for_verification: async (ids) => ids.map((id) => {
      const built = preparePsdealsListingUpsertBatches({
        listing_items: [item(id)],
        existing_psdeals_ids: [],
        listing_observed_at: '2026-07-29T21:30:00.000Z',
      }).batches[0].rows[0]
      return id === 1 ? built : { ...built, title: 'Concurrent change' }
    }),
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(result.status, 'partial')
  assert.equal(result.failed, 1)
  assert.equal(result.batches[1].failed_rows[0].reason, 'postcondition_mismatch')
})

test('duplicate IDs and missing authorization never become a clean upsert', async () => {
  const prepared = preparePsdealsListingUpsertBatches({
    listing_items: [item(1), item(1)],
    existing_psdeals_ids: [],
    listing_observed_at: '2026-07-29T21:30:00.000Z',
  })
  assert.equal(prepared.valid, false)
  assert.ok(prepared.omitted[0].reason_codes.includes('duplicate_psdeals_id_in_listing'))

  const blocked = await executeReconciledPsdealsListingUpsert({
    listing_items: [item(1)],
  }, {
    select_existing_rows: async () => [],
    upsert_batch: async () => [],
    select_rows_for_verification: async () => [],
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(blocked.status, 'awaiting_authorization')
})

test('critical lifecycle requests fail closed without remote UUID, gate, or authorization', () => {
  const request = buildPsdealsCriticalActionRequest({
    action: 'certify',
    local_cycle_id: 'local-cycle-fixture',
    gates: { can_certify: false },
  })
  assert.equal(request.ready, false)
  assert.ok(request.blockers.includes('remote_cycle_id_missing_or_invalid'))
  assert.ok(request.blockers.includes('stage_specific_authorization_missing'))
  assert.ok(request.blockers.includes('can_certify_gate_closed'))
})

test('authorized fake lifecycle port requires a matching action receipt', async () => {
  const request = buildPsdealsCriticalActionRequest({
    action: 'certify',
    local_cycle_id: 'local-cycle-fixture',
    remote_cycle_id: '11111111-1111-4111-8111-111111111111',
    authorization_id: 'fixture-auth-certify',
    gates: { can_certify: true },
  })
  const result = await executePsdealsCriticalActionWithPort(request, {
    perform_authorized_action: async (value) => ({
      action: value.action,
      authorization_id: value.authorization_id,
      simulated: true,
    }),
  })
  assert.equal(result.simulated, true)
  await assert.rejects(
    executePsdealsCriticalActionWithPort(request, {
      perform_authorized_action: async () => ({ action: 'refresh_cache', authorization_id: 'wrong' }),
    }),
    /CRITICAL_ACTION_RECEIPT_MISMATCH/
  )
})
