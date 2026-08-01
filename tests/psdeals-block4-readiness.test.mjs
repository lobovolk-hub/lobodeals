import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectPsdealsBlock4LocalReadiness,
  runPsdealsBlock4LocalPreflightCli,
} from '../scripts/preflight-psdeals-block4-local.mjs'
import { evaluatePsdealsBlock4LocalReadiness } from '../scripts/lib/psdeals-block4-readiness.mjs'

test('current local repository is simulation-ready but not operationally complete', async () => {
  const result = await collectPsdealsBlock4LocalReadiness({ test_count: 1 })
  assert.equal(result.valid, true)
  assert.equal(result.classification, 'LOCAL_SIMULATION_READY')
  assert.equal(result.states.POST_006_READY, true)
  assert.equal(result.states.STORAGE_READY, true)
  assert.equal(result.states.HISTORY_RUNTIME_CLEAN, true)
  assert.equal(result.states.BLOCK_4_LOCAL_FOUNDATION_READY, true)
  assert.equal(result.states.BLOCK_4_CODE_READY, false)
  assert.equal(result.states.BLOCK_4_DRY_RUN_READY, true)
  assert.equal(result.states.BLOCK_4_REMOTE_SIMULATION_READY, true)
  assert.equal(result.states.BLOCK_4_COMPLETE, false)
  assert.equal(result.states.COMPACT_MINIMA_READY, false)
  assert.equal(result.states.LIVE_CYCLE_READY, false)
  assert.equal(result.states.THIRTY_DAY_TRIAL_READY, false)
  assert.equal(result.remote_operations_authorized, false)
  assert.equal(result.remote_writes_executed, 0)
})

test('preflight fails closed without an explicit local test attestation', async () => {
  const result = await collectPsdealsBlock4LocalReadiness({ test_count: 0 })
  assert.equal(result.valid, false)
  assert.ok(result.blockers.includes('local_test_attestation_missing'))
  assert.equal(result.states.BLOCK_4_DRY_RUN_READY, false)
  assert.equal(result.states.LIVE_CYCLE_READY, false)
})

test('pure readiness evaluator never opens live or trial gates', () => {
  const result = evaluatePsdealsBlock4LocalReadiness({})
  assert.equal(result.states.BLOCK_4_COMPLETE, false)
  assert.equal(result.states.COMPACT_MINIMA_READY, false)
  assert.equal(result.states.LIVE_CYCLE_READY, false)
  assert.equal(result.states.THIRTY_DAY_TRIAL_READY, false)
  assert.equal(result.remote_operations_authorized, false)
})

test('CLI reports JSON and uses nonzero status when tests are not attested', async () => {
  let output = ''
  assert.equal(await runPsdealsBlock4LocalPreflightCli(['--tests-passed=1'], {
    stdout: (value) => { output += value },
    stderr: () => {},
  }), 0)
  assert.equal(JSON.parse(output).states.LIVE_CYCLE_READY, false)
  output = ''
  assert.equal(await runPsdealsBlock4LocalPreflightCli([], {
    stdout: (value) => { output += value },
    stderr: () => {},
  }), 2)
  assert.ok(JSON.parse(output).blockers.includes('local_test_attestation_missing'))
})
