import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assessPsdealsLifecycleContracts,
  executeIdempotentPsdealsCreateCycle,
  executeReconciledPsdealsLifecycleAction,
  preparePsdealsCreateCycleRequest,
} from '../scripts/lib/psdeals-cycle-operational-adapters.mjs'

const remoteId = '11111111-1111-4111-8111-111111111111'
const workspace = {
  identity: {
    local_cycle_id: 'local-cycle-operational-fixture',
    run_token: 'run_operational_fixture_token_12345',
    code_revision: 'fixture',
    mode: 'operational',
    context: { fingerprint: 'a'.repeat(64) },
  },
}
const authorization = {
  authorization_id: 'auth-create-fixture',
  stage: 'create_cycle',
  permission: 'allow_create_remote_cycle',
}
const capableContract = {
  columns: ['local_cycle_id', 'run_token_sha256'],
  indexes: ['price_refresh_cycles_local_identity_unique_idx'],
}

function request(contract = capableContract) {
  return preparePsdealsCreateCycleRequest({
    workspace,
    authorization,
    remote_contract: contract,
    cycle_date: '2026-07-29',
    started_at: '2026-07-29T21:30:00.000Z',
  })
}

function remoteRow(value) {
  return {
    id: remoteId,
    region_code: 'us',
    storefront: 'playstation',
    metrics: value.payload.metrics,
  }
}

test('real remote create-cycle contract remains blocked without unique local identity', () => {
  const result = request({ columns: ['metrics'], indexes: ['price_refresh_cycles_pkey'] })
  assert.equal(result.ready, false)
  assert.ok(result.blockers.includes('create_cycle_unique_reconciliation_contract_missing'))
})

test('fake create-cycle succeeds and existing receipt path reconciles without insert', async () => {
  const value = request()
  let inserts = 0
  const result = await executeIdempotentPsdealsCreateCycle(value, {
    find_cycles: async () => [remoteRow(value)],
    insert_cycle: async () => { inserts += 1 },
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(result.status, 'succeeded')
  assert.equal(result.reconciled, true)
  assert.equal(inserts, 0)
})

test('timeout after simulated commit reconciles exactly once without duplicate insert', async () => {
  const value = request()
  let committed = false
  let inserts = 0
  const result = await executeIdempotentPsdealsCreateCycle(value, {
    find_cycles: async () => committed ? [remoteRow(value)] : [],
    insert_cycle: async () => {
      inserts += 1
      committed = true
      throw new Error('SIMULATED_TIMEOUT_AFTER_COMMIT')
    },
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(result.status, 'succeeded')
  assert.equal(result.ambiguous_transport_result, true)
  assert.equal(inserts, 1)
})

test('ambiguous or absent reconciliation after timeout stays blocked or indeterminate', async () => {
  const value = request()
  let reads = 0
  const ambiguous = await executeIdempotentPsdealsCreateCycle(value, {
    find_cycles: async () => {
      reads += 1
      return reads === 1 ? [] : [remoteRow(value), { ...remoteRow(value), id: '22222222-2222-4222-8222-222222222222' }]
    },
    insert_cycle: async () => { throw new Error('SIMULATED_TIMEOUT') },
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(ambiguous.status, 'blocked')

  const absent = await executeIdempotentPsdealsCreateCycle(value, {
    find_cycles: async () => [],
    insert_cycle: async () => { throw new Error('SIMULATED_TIMEOUT') },
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(absent.status, 'indeterminate')
})

test('lifecycle readiness exposes cache and demotion reconciliation blockers', () => {
  const contracts = assessPsdealsLifecycleContracts({
    objects: { price_refresh_cycles: { exists: true } },
    functions: {
      certify_price_refresh_cycle: { definition_verified: true },
      refresh_catalog_public_cache_v15: { independent_receipt_supported: false },
    },
  })
  assert.equal(contracts.mark_succeeded.ready, true)
  assert.equal(contracts.certify.ready, true)
  assert.equal(contracts.refresh_cache.ready, false)
  assert.equal(contracts.apply_demotion.ready, false)
})

test('certification timeout reconciles from remote state and is never repeated', async () => {
  let reads = 0
  let calls = 0
  const result = await executeReconciledPsdealsLifecycleAction({
    ready: true,
    action: 'certify',
    remote_cycle_id: remoteId,
  }, {
    read_cycle: async () => {
      reads += 1
      return reads === 1
        ? { status: 'succeeded', finished_at: '2026-07-29T21:40:00Z' }
        : { status: 'certified', certified_at: '2026-07-29T21:41:00Z' }
    },
    perform_action: async () => {
      calls += 1
      throw new Error('SIMULATED_TIMEOUT_AFTER_COMMIT')
    },
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(result.status, 'succeeded')
  assert.equal(calls, 1)
})
