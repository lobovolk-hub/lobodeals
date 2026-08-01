import assert from 'node:assert/strict'
import test from 'node:test'

import { runPsdealsUpdaterDryRunCli } from '../scripts/dry-run-psdeals-updater-local.mjs'
import { runPsdealsUpdaterDryRun } from '../scripts/lib/psdeals-updater-dry-run.mjs'

test('integrated updater dry-run is deterministic and performs no external effect', () => {
  const first = runPsdealsUpdaterDryRun()
  const second = runPsdealsUpdaterDryRun()
  assert.deepEqual(first, second)
  assert.equal(first.mode, 'OFFLINE_DETERMINISTIC_DRY_RUN')
  assert.equal(first.remote_writes_executed, 0)
  assert.equal(first.opens_connections, false)
  assert.equal(first.executes_processes, false)
  assert.equal(first.monthly.applied, false)
  assert.equal(first.cache.applied, false)
  assert.equal(first.ended_discounts.applied, false)
})

test('dry-run covers product families and preserves canonical PS5, PS4 order', () => {
  const report = runPsdealsUpdaterDryRun()
  const types = Object.fromEntries(report.type_fixtures.map((entry) => [entry.fixture, entry]))
  assert.equal(types['type-game'].writable, true)
  assert.equal(types['type-bundle'].writable, true)
  assert.equal(types['type-addon'].item_type_label, 'addon')
  assert.equal(types['type-dlc'].content_type, 'dlc')
  assert.equal(types['type-season-pass'].content_type, 'dlc')
  assert.equal(types['type-game-content'].content_type, 'game')
  assert.equal(types['type-ambiguous'].writable, false)
  for (const candidate of report.candidates.regular) {
    assert.deepEqual(candidate.platforms, ['PS5', 'PS4'])
  }
})

test('only coherent 1, 50 and 99 percent regular discounts become candidates', () => {
  const report = runPsdealsUpdaterDryRun()
  const accepted = report.price_fixtures.filter((entry) => entry.accepted).map((entry) => entry.fixture)
  assert.deepEqual(accepted, ['discount-1', 'discount-50', 'discount-99'])
  for (const rejected of ['discount-0', 'discount-100', 'free', 'zero', 'negative', 'original-missing', 'current-missing', 'formula-mismatch', 'monthly', 'ambiguous-signal']) {
    assert.equal(report.price_fixtures.find((entry) => entry.fixture === rejected).accepted, false)
  }
})

test('PS Plus separates valid, ambiguous and monthly observations', () => {
  const report = runPsdealsUpdaterDryRun()
  const plus = Object.fromEntries(report.ps_plus_fixtures.map((entry) => [entry.fixture, entry]))
  assert.equal(plus['ps-plus-valid'].accepted, true)
  assert.equal(plus['ps-plus-ambiguous'].accepted, false)
  assert.ok(plus['ps-plus-ambiguous'].reason_codes.includes('ps_plus_parser_state_unsafe'))
  assert.equal(plus['ps-plus-monthly'].accepted, false)
  assert.deepEqual(plus['ps-plus-monthly'].reason_codes, ['monthly_game_excluded'])
})

test('minima initialize, lower and preserve higher observations independently', () => {
  const report = runPsdealsUpdaterDryRun()
  const minima = Object.fromEntries(report.minima.map((entry) => [entry.scenario, entry]))
  assert.equal(minima['discount-1-new'].reason_code, 'certified_low_initialized')
  assert.equal(minima['discount-50-lower'].reason_code, 'certified_low_lowered')
  assert.equal(minima['discount-50-equal'].reason_code, 'certified_low_equal')
  assert.equal(minima['discount-99-higher'].reason_code, 'certified_low_higher')
  assert.equal(minima['discount-99-higher'].changed, false)
})

test('fast refresh distinguishes new, same, lower and higher observations', () => {
  const report = runPsdealsUpdaterDryRun()
  const decisions = Object.fromEntries(report.fast_refresh.decisions.map((entry) => [entry.scenario, entry]))
  assert.equal(decisions.new.should_refresh, true)
  assert.ok(decisions.new.reasons.includes('new_item'))
  assert.equal(decisions.same.should_refresh, false)
  assert.ok(decisions.lower.reasons.includes('current_price_mismatch'))
  assert.ok(decisions.higher.reasons.includes('current_price_mismatch'))
})

test('ended-deal simulation restores only verifiable missing discounts', () => {
  const report = runPsdealsUpdaterDryRun()
  assert.deepEqual(report.ended_discounts.active_ids, [7002])
  assert.deepEqual(report.ended_discounts.decisions, [
    { psdeals_id: 7001, decision: 'would_restore_original_price', simulated_price: 10 },
    { psdeals_id: 7003, decision: 'blocked_unverifiable', simulated_price: null },
  ])
})

test('CLI emits machine-readable JSON and rejects operational arguments', () => {
  let output = ''
  let error = ''
  assert.equal(runPsdealsUpdaterDryRunCli([], {
    stdout: (value) => { output += value },
    stderr: (value) => { error += value },
  }), 0)
  assert.equal(JSON.parse(output).remote_writes_executed, 0)
  assert.equal(runPsdealsUpdaterDryRunCli(['--real'], {
    stdout: () => {},
    stderr: (value) => { error += value },
  }), 1)
  assert.match(error, /does not accept operational arguments/)
})
