import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createPsdealsDailyOperationalExecutor,
  PSDEALS_DAILY_OPERATIONAL_STAGES,
} from '../scripts/lib/psdeals-daily-refresh-v3.mjs'

const REMOTE_ID = '11111111-1111-4111-8111-111111111111'

function buildAdapters(observed) {
  return Object.fromEntries(PSDEALS_DAILY_OPERATIONAL_STAGES.map((stage, index) => [
    stage.adapter,
    async (context) => {
      observed.push({
        state: stage.state,
        stage_input: context.production_inputs?.[stage.adapter]?.stage_state || null,
        port_marker: context.production_ports?.marker || null,
        prior_states: Object.keys(context.stage_results || {}),
      })
      return {
        status: 'succeeded',
        accepted_parent_receipt_id: context.previous_stage_receipt_id ?? null,
        executed_writes: 0,
        external_action_performed: false,
        action_receipt: null,
        ...(stage.state === 'cycle_created' ? { remote_cycle_id: REMOTE_ID } : {}),
      }
    },
  ]))
}

test('operational executor resolves runtime inputs and ports per stage and propagates full results', async () => {
  const observed = []
  const adapters = buildAdapters(observed)
  const executor = createPsdealsDailyOperationalExecutor({
    adapters,
    resolve_stage_runtime: async (context) => ({
      production_inputs: {
        [context.stage.adapter]: { stage_state: context.stage.state },
      },
      production_ports: { marker: 'runtime-bound' },
    }),
  })
  const result = await executor({
    authorization: {
      authorization_id: 'authorization-runtime-resolution-test',
      run_intent_id: 'local-cycle-runtime-resolution-test',
    },
    gates: { valid: true },
  })

  assert.equal(result.classification, 'GO')
  assert.equal(result.adapter_calls, PSDEALS_DAILY_OPERATIONAL_STAGES.length)
  assert.equal(Object.keys(result.stage_results).length, PSDEALS_DAILY_OPERATIONAL_STAGES.length)
  assert.equal(observed.length, PSDEALS_DAILY_OPERATIONAL_STAGES.length)

  for (const [index, entry] of observed.entries()) {
    assert.equal(entry.stage_input, entry.state)
    assert.equal(entry.port_marker, 'runtime-bound')
    assert.deepEqual(
      entry.prior_states,
      PSDEALS_DAILY_OPERATIONAL_STAGES.slice(0, index).map((stage) => stage.state)
    )
  }
})

test('operational executor fails closed before an adapter when runtime resolution is invalid', async () => {
  let adapterCalls = 0
  const adapters = Object.fromEntries(PSDEALS_DAILY_OPERATIONAL_STAGES.map((stage) => [
    stage.adapter,
    async () => {
      adapterCalls += 1
      return {
        status: 'succeeded',
        accepted_parent_receipt_id: null,
        executed_writes: 0,
        external_action_performed: false,
        action_receipt: null,
      }
    },
  ]))
  const executor = createPsdealsDailyOperationalExecutor({
    adapters,
    resolve_stage_runtime: async () => null,
  })
  const result = await executor({
    authorization: {
      authorization_id: 'authorization-runtime-resolution-invalid',
      run_intent_id: 'local-cycle-runtime-resolution-invalid',
    },
    gates: { valid: true },
  })

  assert.equal(result.classification, 'FAILED')
  assert.deepEqual(result.blockers, ['stage_runtime_resolution_invalid'])
  assert.equal(result.adapter_calls, 0)
  assert.equal(adapterCalls, 0)
  assert.deepEqual(result.stage_results, {})
})
