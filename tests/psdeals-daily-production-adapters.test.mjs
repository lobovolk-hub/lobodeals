import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildPsdealsProductionParityRequest,
  createPsdealsDailyProductionAdapters,
  PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY,
  validatePsdealsDailyProductionRegistry,
} from '../scripts/lib/psdeals-daily-production-adapters.mjs'

const REMOTE_ID = '11111111-1111-4111-8111-111111111111'
const RECEIPT_ID = '22222222-2222-4222-8222-222222222222'
const MARK_ID = '33333333-3333-4333-8333-333333333333'
const CERTIFY_ID = '44444444-4444-4444-8444-444444444444'

const EXPECTED_NAMES = [
  'run_local_preflight', 'verify_remote_preflight', 'probe_edge_cdp',
  'wait_for_captcha_clear', 'create_remote_cycle', 'collect_recently_added',
  'analyze_recently_added', 'import_recently_added', 'collect_discounts',
  'analyze_fast_refresh', 'import_discount_details', 'retry_failed_details',
  'process_monthly', 'analyze_ended', 'revalidate_ambiguous_details',
  'reanalyze_ended', 'apply_safe_demotions_v2', 'prepare_candidates',
  'certify_candidates_v3', 'apply_compact_minima', 'refresh_cache_v16',
  'run_final_postchecks', 'finalize_or_reconcile_cycle',
]

test('production registry binds the exact 23 adapters to concrete sources', () => {
  const adapters = createPsdealsDailyProductionAdapters()
  const validation = validatePsdealsDailyProductionRegistry(adapters)
  assert.deepEqual(PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY.map((row) => row.name), EXPECTED_NAMES)
  assert.deepEqual(Object.keys(adapters), EXPECTED_NAMES)
  assert.equal(validation.valid, true)
  assert.equal(validation.total, 23)
  assert.equal(validation.bound, 23)
  assert.deepEqual(validation.missing, [])
  assert.equal(
    PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY.find((row) => row.name === 'import_recently_added').rpc,
    'begin_psdeals_cycle_action_v1+finish_psdeals_cycle_action_v1'
  )
  for (const row of PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY) {
    assert.equal(row.status, 'BOUND')
    assert.ok(row.source)
    assert.ok(row.inputs)
    assert.ok(row.outputs)
    assert.ok(row.evidence)
    assert.ok(row.idempotency)
    assert.ok(row.reconciliation)
    assert.ok(Number.isSafeInteger(row.timeout_ms))
    assert.equal(adapters[row.name].psdeals_implementation_status, 'production')
    assert.equal(adapters[row.name].psdeals_source, row.source)
  }
})

test('parity requests expose the same exact registry targets and types', () => {
  const context = {
    run_identity: { run_intent_id: 'local-cycle-production-parity', remote_cycle_id: REMOTE_ID },
    previous_stage_receipt_id: RECEIPT_ID,
    production_inputs: Object.fromEntries(EXPECTED_NAMES.map((name) => [name, {
      idempotency_key: `${name}:fixture`,
      rpc_args: { p_cycle_id: REMOTE_ID, p_idempotency_key: `${name}:fixture`, p_request_hash: 'a'.repeat(64) },
    }])),
  }
  const requests = EXPECTED_NAMES.map((name) => buildPsdealsProductionParityRequest(name, context))
  assert.equal(requests.length, 23)
  assert.deepEqual(requests.map((request) => request.adapter), EXPECTED_NAMES)
  assert.equal(requests.every((request) => request.remote_cycle_id === REMOTE_ID), true)
  assert.equal(requests.every((request) => request.previous_stage_receipt_id === RECEIPT_ID), true)
  assert.equal(requests.every((request) => typeof request.target === 'string' && request.target.length > 0), true)
  assert.equal(requests.every((request) => Number.isSafeInteger(request.timeout_ms)), true)
})

test('bounded process adapter uses the exact entrypoint and in-memory process ports', async () => {
  const adapters = createPsdealsDailyProductionAdapters()
  const workspaceRoot = path.join(os.tmpdir(), 'lobodeals-production-process-fixture')
  const expectedArtifact = path.join(workspaceRoot, 'evidence', 'recently-added.json')
  let observedSpec
  const result = await adapters.collect_recently_added({
    previous_stage_receipt_id: null,
    run_identity: { run_intent_id: 'local-cycle-production-process', remote_cycle_id: REMOTE_ID },
    production_inputs: {
      collect_recently_added: {
        project_root: process.cwd(),
        workspace: { root_dir: workspaceRoot },
        args: ['--url=https://psdeals.net/us-store/all-games', `--output-json=${expectedArtifact}`],
        expected_artifacts: [expectedArtifact],
        authorization: { permission: 'allow_collect_listing', authorization_id: 'auth-collect-fixture' },
      },
    },
    production_ports: {
      run_process: async (spec) => {
        observedSpec = spec
        return { exit_code: 0, stdout_bytes: 10, stderr_bytes: 0, timed_out: false, output_exceeded: false }
      },
      verify_artifacts: async () => ({ valid: true, evidence: { status: 'succeeded' } }),
    },
  })
  assert.equal(result.status, 'succeeded')
  assert.equal(observedSpec.shell, false)
  assert.equal(observedSpec.executable, process.execPath)
  assert.equal(observedSpec.entrypoint, path.resolve('scripts/collect-psdeals-listing-edge-live-cdp.mjs'))
  assert.deepEqual(observedSpec.expected_artifacts, [expectedArtifact])
})

test('production factory binds concrete inputs and ports without optional stage dispatchers', async () => {
  const workspaceRoot = path.join(os.tmpdir(), 'lobodeals-production-bound-fixture')
  const expectedArtifact = path.join(workspaceRoot, 'evidence', 'recently-added.json')
  let calls = 0
  const adapters = createPsdealsDailyProductionAdapters({
    production_inputs: {
      collect_recently_added: {
        project_root: process.cwd(),
        workspace: { root_dir: workspaceRoot },
        args: ['--url=https://psdeals.net/us-store/all-games', `--output-json=${expectedArtifact}`],
        expected_artifacts: [expectedArtifact],
        authorization: { permission: 'allow_collect_listing', authorization_id: 'auth-bound-fixture' },
      },
    },
    production_ports: {
      run_process: async () => {
        calls += 1
        return { exit_code: 0, stdout_bytes: 0, stderr_bytes: 0, timed_out: false, output_exceeded: false }
      },
      verify_artifacts: async () => ({ valid: true, evidence: { status: 'succeeded' } }),
    },
  })
  const result = await adapters.collect_recently_added({
    run_identity: { run_intent_id: 'local-cycle-production-bound', remote_cycle_id: REMOTE_ID },
    previous_stage_receipt_id: null,
  })
  assert.equal(result.status, 'succeeded')
  assert.equal(calls, 1)
})

test('process and write adapters fail closed before their ports without stage authorization', async () => {
  const adapters = createPsdealsDailyProductionAdapters()
  let processCalls = 0
  await assert.rejects(adapters.collect_discounts({
    production_inputs: {
      collect_discounts: {
        project_root: process.cwd(),
        workspace: { root_dir: os.tmpdir() },
        args: [],
        expected_artifacts: [path.join(os.tmpdir(), 'listing.json')],
      },
    },
    production_ports: { run_process: async () => { processCalls += 1 } },
  }), /PRODUCTION_ADAPTER_AUTHORIZATION_REQUIRED/)
  assert.equal(processCalls, 0)

  let rpcCalls = 0
  await assert.rejects(adapters.refresh_cache_v16({
    run_identity: { remote_cycle_id: REMOTE_ID },
    production_inputs: { refresh_cache_v16: { rpc_args: {} } },
    production_ports: { supabase: { write: { invokeAllowedRpc: async () => { rpcCalls += 1 } } } },
  }), /PRODUCTION_ADAPTER_AUTHORIZATION_REQUIRED/)
  assert.equal(rpcCalls, 0)
})

test('legacy demotion v1 and cache v15 are rejected before RPC invocation', async () => {
  const adapters = createPsdealsDailyProductionAdapters()
  let calls = 0
  const ports = {
    supabase: {
      read: { findActionReceiptByIdempotencyKey: async () => null },
      write: { invokeAllowedRpc: async () => { calls += 1 } },
    },
  }
  const demotion = await adapters.apply_safe_demotions_v2({
    previous_stage_receipt_id: null,
    run_identity: { remote_cycle_id: REMOTE_ID },
    production_inputs: { apply_safe_demotions_v2: {
      authorization: { permission: 'allow_apply_demotion', authorization_id: 'auth-demotion' },
      rpc: 'apply_psdeals_ended_deals_v1',
    } },
    production_ports: ports,
  })
  const cache = await adapters.refresh_cache_v16({
    previous_stage_receipt_id: null,
    run_identity: { remote_cycle_id: REMOTE_ID },
    production_inputs: { refresh_cache_v16: {
      authorization: { permission: 'allow_refresh_cache', authorization_id: 'auth-cache' },
      rpc: 'refresh_catalog_public_cache_v15',
    } },
    production_ports: ports,
  })
  assert.equal(demotion.status, 'failed')
  assert.equal(cache.status, 'failed')
  assert.equal(calls, 0)
})

test('certification adapter invokes mark-succeeded before v3 and propagates the returned receipt', async () => {
  const adapters = createPsdealsDailyProductionAdapters()
  const calls = []
  const base = {
    p_cycle_id: REMOTE_ID,
    p_idempotency_key: 'mark:fixture',
    p_request_hash: 'a'.repeat(64),
  }
  const result = await adapters.certify_candidates_v3({
    previous_stage_receipt_id: RECEIPT_ID,
    run_identity: { remote_cycle_id: REMOTE_ID },
    production_inputs: { certify_candidates_v3: {
      authorization: { permission: 'allow_certify', authorization_id: 'auth-certify' },
      mark_rpc_args: {
        ...base,
        p_demotion_receipt_id: RECEIPT_ID,
        p_required_receipt_ids: [RECEIPT_ID],
        p_manifest_hash: 'b'.repeat(64),
        p_details_completed_at: '2026-08-02T12:00:00.000Z',
        p_validation_completed_at: '2026-08-02T12:01:00.000Z',
        p_finished_at: '2026-08-02T12:02:00.000Z',
        p_items_updated: 1,
        p_items_failed: 0,
        p_new_items_detected: 1,
        p_metrics: {},
      },
      certify_rpc_args: {
        p_cycle_id: REMOTE_ID,
        p_idempotency_key: 'certify:fixture',
        p_request_hash: 'c'.repeat(64),
        p_started_at: '2026-08-02T12:03:00.000Z',
      },
    } },
    production_ports: { supabase: {
      read: { findActionReceiptByIdempotencyKey: async () => null },
      write: { invokeAllowedRpc: async (name, args) => {
        calls.push({ name, args })
        return name === 'mark_psdeals_price_refresh_cycle_succeeded_v1'
          ? { id: MARK_ID, cycle_id: REMOTE_ID, status: 'committed' }
          : { receipt_id: CERTIFY_ID, action_status: 'committed' }
      } },
    } },
  })
  assert.deepEqual(calls.map((call) => call.name), [
    'mark_psdeals_price_refresh_cycle_succeeded_v1',
    'certify_price_refresh_cycle_v3',
  ])
  assert.equal(calls[1].args.p_mark_succeeded_receipt_id, MARK_ID)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.executed_writes, 2)
  assert.equal(result.action_receipt.receipt_id, CERTIFY_ID)
})

test('lost cache response reconciles the committed receipt without a second invocation', async () => {
  const adapters = createPsdealsDailyProductionAdapters()
  const idempotencyKey = 'cache:fixture'
  const requestHash = 'd'.repeat(64)
  let committed = false
  let calls = 0
  const receipt = {
    id: RECEIPT_ID,
    cycle_id: REMOTE_ID,
    action_kind: 'cache_refresh',
    idempotency_key: idempotencyKey,
    request_hash: requestHash,
    status: 'committed',
  }
  const result = await adapters.refresh_cache_v16({
    previous_stage_receipt_id: CERTIFY_ID,
    run_identity: { remote_cycle_id: REMOTE_ID },
    production_inputs: { refresh_cache_v16: {
      authorization: { permission: 'allow_refresh_cache', authorization_id: 'auth-cache' },
      rpc_args: {
        p_cycle_id: REMOTE_ID,
        p_certification_receipt_id: CERTIFY_ID,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
        p_started_at: '2026-08-02T12:04:00.000Z',
      },
    } },
    production_ports: { supabase: {
      read: { findActionReceiptByIdempotencyKey: async () => committed ? receipt : null },
      write: { invokeAllowedRpc: async () => { calls += 1; committed = true; throw new Error('SIMULATED_RESPONSE_LOSS') } },
    } },
  })
  assert.equal(calls, 1)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.action_receipt.receipt_id, RECEIPT_ID)
  assert.equal(result.external_action_performed, true)
})
