import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPsdealsUpdaterSimulationIdentity,
  createPsdealsUpdaterSimulationLedger,
  createPsdealsUpdaterSimulationStateMachine,
  hashPsdealsUpdaterSimulationValue,
  validatePsdealsUpdaterSimulationInput,
  validatePsdealsUpdaterSimulationManifest,
} from '../scripts/lib/psdeals-updater-orchestration-core.mjs'

function validInput() {
  return {
    fixture_id: 'core-valid',
    mode: 'simulation',
    logical_timestamp: '2026-08-01T12:00:00.000Z',
    project_ref: 'fixture-lobodeals',
    seed: 'fixed-seed',
    listing: { pages: [] },
    initial_stage: [],
    initial_minima: {},
    details: [],
  }
}

test('simulation input accepts deterministic local-only data', () => {
  const result = validatePsdealsUpdaterSimulationInput(validInput())
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
  const first = buildPsdealsUpdaterSimulationIdentity(result.normalized_input)
  const second = buildPsdealsUpdaterSimulationIdentity(result.normalized_input)
  assert.deepEqual(first, second)
  assert.match(first.run_id, /^simulation-[a-f0-9]{24}$/)
})

test('simulation input rejects operational identity and sensitive fields', () => {
  const result = validatePsdealsUpdaterSimulationInput({
    ...validInput(),
    mode: 'operational',
    project_ref: 'vlxkoprpobfevxefizwr',
    credentials: { service_role: 'forbidden' },
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('simulation_mode_required'))
  assert.ok(result.errors.includes('non_product_fixture_project_ref_required'))
  assert.ok(result.errors.includes('sensitive_input_field_forbidden'))
})

test('stable hash ignores object key order but preserves array order', () => {
  assert.equal(
    hashPsdealsUpdaterSimulationValue({ b: 2, a: 1 }),
    hashPsdealsUpdaterSimulationValue({ a: 1, b: 2 })
  )
  assert.notEqual(
    hashPsdealsUpdaterSimulationValue([1, 2]),
    hashPsdealsUpdaterSimulationValue([2, 1])
  )
})

test('in-memory ledger plans stable idempotent operations and executes nothing', () => {
  const identity = buildPsdealsUpdaterSimulationIdentity(validInput())
  const ledger = createPsdealsUpdaterSimulationLedger({
    run_id: identity.run_id,
    cycle_id: identity.simulation_cycle_id,
  })
  const operation = {
    operation_type: 'stage_upsert',
    target: 'psdeals_stage_items',
    key: 'us:playstation:1',
    reason: 'safe_listing_payload',
  }
  const first = ledger.plan(operation)
  const second = ledger.plan(operation)
  assert.equal(first.operation_id, second.operation_id)
  assert.equal(ledger.snapshot().operations.length, 1)
  assert.equal(ledger.snapshot().executed_writes, 0)
})

test('state machine accepts only the canonical next state or fail-closed terminals', () => {
  const machine = createPsdealsUpdaterSimulationStateMachine()
  machine.transition('preflight_passed')
  machine.transition('listing_collected')
  assert.throws(
    () => machine.transition('details_processed'),
    /SIMULATION_STATE_TRANSITION_INVALID/
  )
  machine.transition('listing_validated')
  machine.transition('failed', 'fixture_failure')
  assert.equal(machine.state, 'failed')
})

test('manifest validation requires explicit zero-effect guarantees', () => {
  const identity = buildPsdealsUpdaterSimulationIdentity(validInput())
  const base = {
    schema_version: 1,
    run_id: identity.run_id,
    mode: 'simulation',
    generated_at: '2026-08-01T12:00:00.000Z',
    input_hashes: { input: identity.input_sha256 },
    pipeline_states: ['initialized'],
    operation_ledger: { executed_writes: 0 },
    blockers: [],
    warnings: [],
    executed_writes: 0,
    opens_connections: false,
    executes_processes: false,
    uses_supabase: false,
  }
  assert.equal(validatePsdealsUpdaterSimulationManifest(base).valid, true)
  assert.ok(validatePsdealsUpdaterSimulationManifest({
    ...base,
    executed_writes: 1,
  }).errors.includes('manifest_executed_writes_nonzero'))
})
