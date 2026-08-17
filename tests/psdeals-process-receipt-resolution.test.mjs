import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createPsdealsDailyProductionAdapters,
} from '../scripts/lib/psdeals-daily-production-adapters.mjs'

const REMOTE_ID = '11111111-1111-4111-8111-111111111111'
const PARENT_ID = '22222222-2222-4222-8222-222222222222'
const RECEIPT_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_HASH = 'a'.repeat(64)
const INPUT_HASH = 'b'.repeat(64)

function input(workspaceRoot) {
  const expected = path.join(workspaceRoot, 'evidence', 'detail-import.json')
  return {
    project_root: process.cwd(),
    workspace: { root_dir: workspaceRoot },
    args: ['--file=fixture.txt', `--evidence-output=${expected}`],
    expected_artifacts: [expected],
    authorization: {
      permission: 'allow_detail_import',
      authorization_id: 'authorization-process-receipt-resolution',
    },
    receipt: {
      parent_receipt_id: PARENT_ID,
      idempotency_key: 'detail-import:runtime-resolution',
      request_hash: REQUEST_HASH,
      input_artifact_hash: INPUT_HASH,
      started_at: '2026-08-05T04:00:00.000Z',
      finished_at: '2026-08-05T04:30:00.000Z',
      resolve_after_process: true,
    },
  }
}

function committedReceipt(status = 'committed') {
  return {
    id: RECEIPT_ID,
    cycle_id: REMOTE_ID,
    parent_receipt_id: PARENT_ID,
    action_kind: 'detail_import',
    idempotency_key: 'detail-import:runtime-resolution',
    request_hash: REQUEST_HASH,
    input_artifact_hash: INPUT_HASH,
    status,
  }
}

test('receipt-bound process resolves actual terminal counts after artifact verification', async () => {
  const adapters = createPsdealsDailyProductionAdapters()
  const workspaceRoot = path.join(os.tmpdir(), 'lobodeals-process-receipt-resolution')
  const calls = []
  let resolverObserved = null

  const result = await adapters.import_discount_details({
    previous_stage_receipt_id: null,
    run_identity: {
      run_intent_id: 'local-cycle-process-receipt-resolution',
      remote_cycle_id: REMOTE_ID,
    },
    production_inputs: {
      import_discount_details: input(workspaceRoot),
    },
    production_ports: {
      run_process: async () => ({
        exit_code: 0,
        stdout_bytes: 0,
        stderr_bytes: 0,
        timed_out: false,
        output_exceeded: false,
      }),
      verify_artifacts: async () => ({
        valid: true,
        evidence: {
          status: 'succeeded',
          summary: { inserted: 2, updated: 3, failed: 0 },
        },
      }),
      resolve_process_receipt: async (value) => {
        resolverObserved = value
        return {
          finished_at: '2026-08-05T04:20:00.000Z',
          affected_rows: 5,
          result: {
            inserted: 2,
            updated: 3,
            failed: 0,
            evidence_sha256: 'c'.repeat(64),
          },
          error_code: null,
        }
      },
      supabase: {
        read: {
          findActionReceiptByIdempotencyKey: async () => null,
        },
        write: {
          invokeAllowedRpc: async (name, args) => {
            calls.push({ name, args })
            if (name === 'begin_psdeals_cycle_action_v1') {
              return { ...committedReceipt('running'), status: 'running' }
            }
            if (name === 'finish_psdeals_cycle_action_v1') {
              return committedReceipt('committed')
            }
            throw new Error(`unexpected rpc: ${name}`)
          },
        },
      },
    },
  })

  assert.equal(result.status, 'succeeded')
  assert.equal(result.action_receipt.receipt_id, RECEIPT_ID)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].name, 'finish_psdeals_cycle_action_v1')
  assert.equal(calls[1].args.p_affected_rows, 5)
  assert.deepEqual(calls[1].args.p_result, {
    inserted: 2,
    updated: 3,
    failed: 0,
    evidence_sha256: 'c'.repeat(64),
  })
  assert.equal(calls[1].args.p_finished_at, '2026-08-05T04:20:00.000Z')
  assert.deepEqual(
    resolverObserved.process_result.evidence.summary,
    { inserted: 2, updated: 3, failed: 0 }
  )
})

test('required terminal resolver fails closed and closes the remote receipt as indeterminate', async () => {
  const adapters = createPsdealsDailyProductionAdapters()
  const workspaceRoot = path.join(os.tmpdir(), 'lobodeals-process-receipt-missing')
  const calls = []

  const result = await adapters.import_discount_details({
    previous_stage_receipt_id: null,
    run_identity: {
      run_intent_id: 'local-cycle-process-receipt-missing',
      remote_cycle_id: REMOTE_ID,
    },
    production_inputs: {
      import_discount_details: input(workspaceRoot),
    },
    production_ports: {
      run_process: async () => ({
        exit_code: 0,
        stdout_bytes: 0,
        stderr_bytes: 0,
        timed_out: false,
        output_exceeded: false,
      }),
      verify_artifacts: async () => ({
        valid: true,
        evidence: { status: 'succeeded' },
      }),
      supabase: {
        read: {
          findActionReceiptByIdempotencyKey: async () => null,
        },
        write: {
          invokeAllowedRpc: async (name, args) => {
            calls.push({ name, args })
            if (name === 'begin_psdeals_cycle_action_v1') {
              return { ...committedReceipt('running'), status: 'running' }
            }
            if (name === 'finish_psdeals_cycle_action_v1') {
              return committedReceipt('indeterminate')
            }
            throw new Error(`unexpected rpc: ${name}`)
          },
        },
      },
    },
  })

  assert.equal(result.status, 'requires_reconciliation')
  assert.deepEqual(result.blockers, ['process_receipt_resolver_missing'])
  assert.equal(calls.length, 2)
  assert.equal(calls[1].args.p_status, 'indeterminate')
  assert.equal(calls[1].args.p_error_code, 'PROCESS_RECEIPT_RESOLVER_REQUIRED')
  assert.equal(calls[1].args.p_result.status, 'requires_reconciliation')
})
