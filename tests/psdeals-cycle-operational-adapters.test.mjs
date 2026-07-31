import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assessPsdealsLifecycleContracts,
  executeIdempotentPsdealsCreateCycle,
  executeReconciledPsdealsLifecycleAction,
  preparePsdealsCreateCycleRequest,
} from '../scripts/lib/psdeals-cycle-operational-adapters.mjs'

const remoteId = '11111111-1111-4111-8111-111111111111'
const receiptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const workspace = {
  identity: {
    local_cycle_id: 'local-cycle-operational-fixture',
    run_token: 'run_operational_fixture_token_12345',
    code_revision: '1'.repeat(40),
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
  columns: [
    'local_cycle_id', 'run_token_sha256', 'code_revision',
    'filter_fingerprint', 'manifest_hash', 'mode',
  ],
  indexes: [
    'price_refresh_cycles_local_cycle_id_unique_idx',
    'price_refresh_cycles_run_token_sha256_unique_idx',
    'price_refresh_cycles_local_identity_unique_idx',
  ],
  create_rpc_ready: true,
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
    local_cycle_id: value.local_cycle_id,
    run_token_sha256: value.run_token_sha256,
    code_revision: value.code_revision,
    filter_fingerprint: value.filter_fingerprint,
    manifest_hash: value.manifest_hash,
    mode: 'operational',
  }
}

function remoteReceipt(value, action = 'create_cycle') {
  return {
    id: receiptId,
    cycle_id: remoteId,
    action_kind: action,
    idempotency_key: value.idempotency_key,
    request_hash: value.request_hash,
    input_artifact_hash: null,
    parent_receipt_id: null,
    status: 'committed',
  }
}

test('real remote create-cycle contract remains blocked without migration identity and RPC', () => {
  const result = request({ columns: ['metrics'], indexes: ['price_refresh_cycles_pkey'] })
  assert.equal(result.ready, false)
  assert.ok(result.blockers.includes('create_cycle_unique_reconciliation_contract_missing'))
  assert.ok(result.blockers.includes('create_cycle_rpc_contract_missing'))
})

test('fake create-cycle reconciles an existing cycle and committed remote receipt without RPC', async () => {
  const value = request()
  let invocations = 0
  const result = await executeIdempotentPsdealsCreateCycle(value, {
    find_cycles: async () => [remoteRow(value)],
    find_receipt: async () => remoteReceipt(value),
    invoke_create_cycle: async () => { invocations += 1 },
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(result.status, 'succeeded')
  assert.equal(result.reconciled, true)
  assert.equal(invocations, 0)
})

test('timeout after simulated RPC commit reconciles exactly once from cycle and receipt', async () => {
  const value = request()
  let committed = false
  let invocations = 0
  const result = await executeIdempotentPsdealsCreateCycle(value, {
    find_cycles: async () => committed ? [remoteRow(value)] : [],
    find_receipt: async () => committed ? remoteReceipt(value) : null,
    invoke_create_cycle: async () => {
      invocations += 1
      committed = true
      throw new Error('SIMULATED_TIMEOUT_AFTER_COMMIT')
    },
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(result.status, 'succeeded')
  assert.equal(result.ambiguous_transport_result, true)
  assert.equal(invocations, 1)
})

test('ambiguous or absent reconciliation after timeout stays blocked or indeterminate', async () => {
  const value = request()
  let reads = 0
  const ambiguous = await executeIdempotentPsdealsCreateCycle(value, {
    find_cycles: async () => {
      reads += 1
      return reads === 1 ? [] : [remoteRow(value), { ...remoteRow(value), id: '22222222-2222-4222-8222-222222222222' }]
    },
    find_receipt: async () => remoteReceipt(value),
    invoke_create_cycle: async () => { throw new Error('SIMULATED_TIMEOUT') },
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(ambiguous.status, 'blocked')

  const absent = await executeIdempotentPsdealsCreateCycle(value, {
    find_cycles: async () => [],
    find_receipt: async () => null,
    invoke_create_cycle: async () => { throw new Error('SIMULATED_TIMEOUT') },
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(absent.status, 'indeterminate')
})

test('lifecycle readiness requires every migrated receipt-bound RPC', () => {
  const missing = assessPsdealsLifecycleContracts({
    objects: { price_refresh_cycles: { exists: true } },
    functions: { certify_price_refresh_cycle: { definition_verified: true } },
  })
  assert.equal(missing.mark_succeeded.ready, false)
  assert.equal(missing.certify.ready, false)
  assert.equal(missing.refresh_cache.ready, false)
  assert.equal(missing.apply_demotion.ready, false)

  const functions = Object.fromEntries([
    'create_or_reconcile_price_refresh_cycle_v1',
    'mark_psdeals_price_refresh_cycle_succeeded_v1',
    'certify_price_refresh_cycle_v3',
    'refresh_catalog_public_cache_v16',
    'apply_psdeals_ended_deals_v1',
    'record_psdeals_monthly_check_v1',
  ].map((name) => [name, { definition_verified: true }]))
  const ready = assessPsdealsLifecycleContracts({
    objects: {
      price_refresh_cycles: { exists: true },
      psdeals_cycle_action_receipts: { exists: true, contract_verified: true },
    },
    functions,
  })
  assert.equal(Object.values(ready).every((entry) => entry.ready), true)
})

test('certification timeout reconciles from remote cycle and committed receipt and is never repeated', async () => {
  let committed = false
  let calls = 0
  const lifecycleRequest = {
    ready: true,
    action: 'certify',
    remote_cycle_id: remoteId,
    idempotency_key: 'certify:local-cycle-fixture',
    request_hash: 'c'.repeat(64),
  }
  const result = await executeReconciledPsdealsLifecycleAction(lifecycleRequest, {
    read_cycle: async () => committed
      ? { status: 'certified', certified_at: '2026-07-29T21:41:00Z' }
      : { status: 'succeeded', finished_at: '2026-07-29T21:40:00Z' },
    find_receipt: async () => committed
      ? {
          id: receiptId,
          cycle_id: remoteId,
          action_kind: 'certify',
          idempotency_key: lifecycleRequest.idempotency_key,
          request_hash: lifecycleRequest.request_hash,
          status: 'committed',
        }
      : null,
    perform_action: async () => {
      calls += 1
      committed = true
      throw new Error('SIMULATED_TIMEOUT_AFTER_COMMIT')
    },
    write_receipt: async (receipt) => receipt,
  })
  assert.equal(result.status, 'succeeded')
  assert.equal(calls, 1)
})
