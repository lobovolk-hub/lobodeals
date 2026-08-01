import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

import { runPsdealsDailyRefreshCli } from '../scripts/run-psdeals-daily-refresh-v3.mjs'
import {
  createPsdealsDailyOperationalExecutor,
  evaluatePsdealsDailyLiveGates,
  inspectPsdealsDailyRefreshCode,
  PSDEALS_DAILY_LIVE_ACTION,
  PSDEALS_DAILY_OPERATIONAL_STAGES,
  PSDEALS_DAILY_PROJECT_REF,
  PSDEALS_DAILY_REFRESH_STATES,
  PSDEALS_DAILY_REPLAY_SCENARIOS,
  runPsdealsDailyLiveGate,
  runPsdealsDailyReplay,
  validatePsdealsDailyOperationalAdapters,
} from '../scripts/lib/psdeals-daily-refresh-v3.mjs'

const TIMESTAMP = '2026-08-01T12:00:00.000Z'

async function inspection() {
  return inspectPsdealsDailyRefreshCode({ project_root: process.cwd() })
}

async function replay(scenario) {
  const value = await inspection()
  return runPsdealsDailyReplay({
    scenario,
    logical_timestamp: TIMESTAMP,
    code_head: 'fixture-head',
    migration_007_sha256: value.migration_007_sha256,
  })
}

test('validate proves one canonical command, three modes and no legacy cache path', async () => {
  const value = await inspection()
  assert.equal(value.DAILY_RUNNER_CODE_READY, true)
  assert.equal(value.RECOVERY_REFRESH_COMMAND_READY, true)
  assert.equal(value.SAFE_DEMOTION_RUNNER_INTEGRATED, true)
  assert.deepEqual(value.modes, ['validate', 'replay', 'live'])
  assert.equal(value.legacy_cache_v15_blocked, true)
  assert.deepEqual(value.blockers, [])
})

test('operational blueprint contains every mandatory state and hardened sequence', () => {
  const actual = new Set(PSDEALS_DAILY_OPERATIONAL_STAGES.map((value) => value.state))
  for (const state of PSDEALS_DAILY_REFRESH_STATES.filter((value) => !['initialized', 'failed', 'requires_reconciliation'].includes(value))) {
    assert.ok(actual.has(state), state)
  }
  const names = PSDEALS_DAILY_OPERATIONAL_STAGES.map((value) => value.state)
  assert.ok(names.indexOf('ended_analyzed') < names.indexOf('ambiguous_revalidated'))
  assert.ok(names.indexOf('ambiguous_revalidated') < names.indexOf('ended_reanalyzed'))
  assert.ok(names.indexOf('ended_reanalyzed') < names.indexOf('demotions_planned'))
  assert.equal(PSDEALS_DAILY_OPERATIONAL_STAGES.find((value) => value.state === 'demotions_reconciled').component, 'apply_psdeals_ended_deals_v2')
  assert.equal(PSDEALS_DAILY_OPERATIONAL_STAGES.find((value) => value.state === 'cache_reconciled').component, 'refresh_catalog_public_cache_v16')
})

function completeOperationalAdapters(overrides = {}) {
  return Object.fromEntries(PSDEALS_DAILY_OPERATIONAL_STAGES.map((stage) => [
    stage.adapter,
    overrides[stage.adapter] || (async ({ authorization, previous_stage_receipt_id }) => ({
      status: 'succeeded',
      accepted_parent_receipt_id: previous_stage_receipt_id,
      executed_writes: 0,
      external_action_performed: false,
      action_receipt: null,
      cycle_id: authorization.cycle_id,
    })),
  ]))
}

test('operational executor validates all adapters before the first side effect', async () => {
  const adapters = completeOperationalAdapters()
  delete adapters.collect_discounts
  assert.deepEqual(validatePsdealsDailyOperationalAdapters(adapters).missing, ['collect_discounts'])
  let calls = 0
  for (const name of Object.keys(adapters)) {
    adapters[name] = async () => { calls += 1; return { status: 'succeeded' } }
  }
  const result = await createPsdealsDailyOperationalExecutor({ adapters })({
    authorization: completeLiveInput('a'.repeat(64)).authorization,
    gates: { valid: true },
  })
  assert.equal(result.classification, 'FAILED')
  assert.deepEqual(result.blockers, ['operational_adapter_set_incomplete'])
  assert.equal(calls, 0)
})

test('operational executor traverses all real bindings with a strict receipt chain', async () => {
  const calls = []
  const adapters = completeOperationalAdapters()
  for (const [name, adapter] of Object.entries(adapters)) {
    adapters[name] = async (context) => {
      calls.push({ name, parent: context.previous_stage_receipt_id })
      return adapter(context)
    }
  }
  const result = await createPsdealsDailyOperationalExecutor({ adapters })({
    authorization: completeLiveInput('a'.repeat(64)).authorization,
    gates: { valid: true },
  })
  assert.equal(result.classification, 'GO')
  assert.equal(result.adapter_calls, PSDEALS_DAILY_OPERATIONAL_STAGES.length)
  assert.equal(result.receipts.length, PSDEALS_DAILY_OPERATIONAL_STAGES.length)
  assert.equal(calls[0].parent, null)
  for (let index = 1; index < calls.length; index += 1) {
    assert.equal(calls[index].parent, result.receipts[index - 1].receipt_id)
    assert.equal(result.receipts[index].parent_receipt_id, result.receipts[index - 1].receipt_id)
  }
})

test('operational executor fails closed on parent mismatch and ambiguous external receipt', async () => {
  const badParent = completeOperationalAdapters({
    collect_discounts: async () => ({
      status: 'succeeded', accepted_parent_receipt_id: 'wrong', executed_writes: 0,
    }),
  })
  const authorization = completeLiveInput('a'.repeat(64)).authorization
  const parentResult = await createPsdealsDailyOperationalExecutor({ adapters: badParent })({
    authorization, gates: { valid: true },
  })
  assert.equal(parentResult.classification, 'FAILED')
  assert.deepEqual(parentResult.blockers, ['stage_receipt_parent_mismatch'])

  const invalidExternal = completeOperationalAdapters({
    apply_safe_demotions_v2: async ({ previous_stage_receipt_id }) => ({
      status: 'succeeded', accepted_parent_receipt_id: previous_stage_receipt_id,
      executed_writes: 1, external_action_performed: true,
      action_receipt: { receipt_id: 'remote-receipt', cycle_id: 'wrong-cycle' },
    }),
  })
  const externalResult = await createPsdealsDailyOperationalExecutor({ adapters: invalidExternal })({
    authorization, gates: { valid: true },
  })
  assert.equal(externalResult.classification, 'REQUIRES_RECONCILIATION')
  assert.deepEqual(externalResult.blockers, ['external_action_receipt_invalid'])
})

test('all fifteen replays pass their expected safety outcome with zero effects', async () => {
  assert.equal(PSDEALS_DAILY_REPLAY_SCENARIOS.length, 15)
  for (const scenario of PSDEALS_DAILY_REPLAY_SCENARIOS) {
    const value = await replay(scenario)
    assert.equal(value.passed, true, `${scenario}: ${value.blockers}`)
    assert.equal(value.executed_writes, 0)
    assert.equal(value.opens_connections, false)
    assert.equal(value.executes_processes, false)
    assert.equal(value.uses_supabase, false)
  }
})

test('May 18 is complete and May 20 reconciles exactly one retry', async () => {
  const may18 = await replay('may-18-healthy')
  assert.deepEqual(may18.counts.historical, { collected: 7593, declared: 7593 })
  assert.equal(may18.final_state, 'succeeded')
  const may20 = await replay('may-20-retry')
  assert.equal(may20.counts.retries, 1)
  assert.equal(may20.final_state, 'succeeded')
})

test('June incomplete and an empty listing fail before demotion or cache', async () => {
  const june = await replay('june-incomplete')
  assert.deepEqual(june.counts.historical, { collected: 5531, declared: 5552 })
  assert.equal(june.final_state, 'failed')
  assert.equal(june.pipeline_states.includes('demotions_reconciled'), false)
  const empty = await replay('empty-listing')
  assert.equal(empty.final_state, 'failed')
  assert.equal(empty.pipeline_states.includes('cache_reconciled'), false)
})

test('Hollow Knight and ambiguous PS Plus never enter the demotion set', async () => {
  for (const scenario of ['hollow-knight', 'ps-plus-ambiguous']) {
    const value = await replay(scenario)
    assert.equal(value.evidence.hollow_knight.unsafe_candidate_absent, true)
    assert.equal(value.evidence.hollow_knight.candidates.includes(910004), false)
    assert.ok(value.evidence.hollow_knight.blocked.some((entry) => entry.psdeals_id === 910004))
  }
})

test('timeout requires reconciliation while duplicate and restart are deterministic', async () => {
  const timeout = await replay('timeout')
  assert.equal(timeout.final_state, 'requires_reconciliation')
  const duplicateA = await replay('duplication')
  const duplicateB = await replay('duplication')
  assert.deepEqual(duplicateA, duplicateB)
  assert.equal(duplicateA.evidence.duplicate_replay_noop, true)
  assert.equal((await replay('restart')).evidence.resumed, true)
})

test('monthly not due is isolated and cache postcheck failure blocks finalization', async () => {
  const monthly = await replay('monthly-not-due')
  assert.equal(monthly.evidence.monthly_branch, 'not_due')
  assert.equal(monthly.final_state, 'succeeded')
  const cache = await replay('cache-postcheck-failed')
  assert.equal(cache.final_state, 'failed')
  assert.equal(cache.pipeline_states.includes('succeeded'), false)
})

function completeLiveInput(migrationSha) {
  return {
    authorization: {
      action: PSDEALS_DAILY_LIVE_ACTION,
      project_ref: PSDEALS_DAILY_PROJECT_REF,
      authorization_id: 'authorization-visible-0024-b',
      approved_by: 'Johan',
      cycle_id: 'local-cycle-recovery-20260801',
      dry_run: false,
      migration_007_sha256: migrationSha,
      code_head: 'abc1234',
      issued_at: TIMESTAMP,
    },
    remote_preflight: {
      project_ref: PSDEALS_DAILY_PROJECT_REF,
      checked_at: TIMESTAMP,
      migration_007_applied: true,
      certificate_passed: true,
      certificate_sha256: 'a'.repeat(64),
      blocker_failures: 0,
      blockers: [],
    },
    vercel: { safe_margin: true, approved_capacity: true, checked_at: TIMESTAMP },
    edge_cdp: { ready: true, region: 'us', storefront: 'playstation' },
    captcha: { resolved: true, confirmed_by: 'Johan', checked_at: TIMESTAMP },
    migration_007_sha256: migrationSha,
    code_head: 'abc1234',
    env: { LOBODEALS_REMOTE_EXECUTION: 'EXPLICITLY_AUTHORIZED', NODE_ENV: 'production' },
    now: TIMESTAMP,
  }
}

test('live fails before executor on every missing critical gate', async () => {
  const migrationSha = (await inspection()).migration_007_sha256
  const base = completeLiveInput(migrationSha)
  const cases = [
    ['project', (value) => { value.authorization.project_ref = 'wrong' }, 'live_project_mismatch'],
    ['sha', (value) => { value.authorization.migration_007_sha256 = 'b'.repeat(64) }, 'authorized_migration_007_sha_mismatch'],
    ['migration', (value) => { value.remote_preflight.migration_007_applied = false }, 'migration_007_not_applied'],
    ['vercel', (value) => { value.vercel.safe_margin = false }, 'vercel_margin_not_approved'],
    ['edge', (value) => { value.edge_cdp.ready = false }, 'edge_cdp_not_ready'],
    ['captcha', (value) => { value.captcha.resolved = false }, 'captcha_not_visibly_resolved'],
    ['env', (value) => { delete value.env.LOBODEALS_REMOTE_EXECUTION }, 'remote_execution_environment_confirmation_missing'],
  ]
  for (const [name, mutate, expected] of cases) {
    const input = structuredClone(base)
    mutate(input)
    let called = false
    const result = await runPsdealsDailyLiveGate({ ...input, live_executor: async () => { called = true } })
    assert.equal(called, false, name)
    assert.ok(result.gates.blockers.includes(expected), name)
    assert.equal(result.executed_writes, 0)
  }
})

test('live binds an injected executor only after every gate passes', async () => {
  const migrationSha = (await inspection()).migration_007_sha256
  const input = completeLiveInput(migrationSha)
  assert.equal(evaluatePsdealsDailyLiveGates(input).valid, true)
  let called = 0
  const result = await runPsdealsDailyLiveGate({
    ...input,
    live_executor: async ({ gates }) => {
      called += 1
      assert.equal(gates.valid, true)
      return { classification: 'GO', executed_writes: 0, fixture_executor: true }
    },
  })
  assert.equal(called, 1)
  assert.equal(result.classification, 'GO')
})

test('CLI validate and replay all expose machine-readable zero-effect output', async () => {
  let output = ''
  let error = ''
  const io = { stdout: (value) => { output += value }, stderr: (value) => { error += value } }
  assert.equal(await runPsdealsDailyRefreshCli(['validate', '--json'], io), 0, error)
  assert.equal(JSON.parse(output).DAILY_RUNNER_CODE_READY, true)
  output = ''
  assert.equal(await runPsdealsDailyRefreshCli(['replay', '--scenario=all', `--timestamp=${TIMESTAMP}`, '--json'], io, { code_head: 'fixture-head' }), 0, error)
  const replayAll = JSON.parse(output)
  assert.equal(replayAll.scenarios.length, 15)
  assert.equal(replayAll.executed_writes, 0)
})

test('replay dependency graph cannot open network, Supabase or child processes', async () => {
  const files = [
    'scripts/lib/psdeals-daily-refresh-v3.mjs',
    'scripts/lib/psdeals-updater-orchestrator-local.mjs',
    'scripts/lib/psdeals-updater-orchestration-core.mjs',
    'scripts/lib/psdeals-ended-discounts.mjs',
  ]
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8')
    assert.doesNotMatch(source, /@supabase|createClient|child_process|\bfetch\s*\(|\bspawn\s*\(|\bexec\s*\(/, file)
  }
})
