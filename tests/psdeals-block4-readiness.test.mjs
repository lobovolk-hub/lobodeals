import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectPsdealsBlock4LocalReadiness,
  runPsdealsBlock4LocalPreflightCli,
} from '../scripts/preflight-psdeals-block4-local.mjs'
import { evaluatePsdealsBlock4LocalReadiness } from '../scripts/lib/psdeals-block4-readiness.mjs'

test('current local repository is code-ready but not operationally complete', async () => {
  const result = await collectPsdealsBlock4LocalReadiness({ test_count: 1 })
  assert.equal(result.valid, true)
  assert.equal(result.classification, 'LOCAL_CODE_READY')
  assert.equal(result.states.POST_006_READY, true)
  assert.equal(result.states.STORAGE_READY, true)
  assert.equal(result.states.HISTORY_RUNTIME_CLEAN, true)
  assert.equal(result.states.BLOCK_4_LOCAL_FOUNDATION_READY, true)
  assert.equal(result.states.BLOCK_4_CODE_READY, true)
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

test('code readiness fails closed without the integrated offline orchestrator', () => {
  const result = evaluatePsdealsBlock4LocalReadiness({
    post_006: { post_006_verified: true, storage_ready: true },
    history_audit: { runtime_violations: [] },
    block4_map: { valid: true, capability_count: 25, status_counts: { PARTIAL: 15, BLOCKED: 1, MISSING: 0 } },
    dry_run: { remote_writes_executed: 0, opens_connections: false, executes_processes: false, failure_simulation: { all_fail_closed: true } },
    execution_gates: { valid: true },
    tests: { passed: true, count: 1 },
    remote_simulation_contracts: { validated: true },
  })
  assert.ok(result.blockers.includes('offline_orchestrator_not_code_ready'))
  assert.equal(result.states.BLOCK_4_CODE_READY, false)
  assert.equal(result.states.BLOCK_4_COMPLETE, false)
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
