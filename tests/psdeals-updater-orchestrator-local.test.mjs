import assert from 'node:assert/strict'
import test from 'node:test'

import { runPsdealsUpdaterOrchestratorCli } from '../scripts/run-psdeals-updater-orchestrator-local.mjs'
import {
  PSDEALS_UPDATER_ORCHESTRATOR_INTEGRATION_MAP,
  runPsdealsUpdaterOrchestratorLocal,
} from '../scripts/lib/psdeals-updater-orchestrator-local.mjs'
import { getPsdealsUpdaterSimulationFixture } from '../scripts/lib/psdeals-updater-simulation-fixtures.mjs'

function run(name = 'happy-path', mutate = () => {}) {
  const fixture = getPsdealsUpdaterSimulationFixture(name)
  mutate(fixture)
  return runPsdealsUpdaterOrchestratorLocal(fixture)
}

test('happy path connects every offline stage with zero executed writes', () => {
  const result = run()
  assert.equal(result.overall_status, 'simulated_success')
  assert.equal(result.manifest_validation.valid, true)
  assert.deepEqual(result.blockers, [])
  assert.equal(result.executed_writes, 0)
  assert.equal(result.operation_ledger.executed_writes, 0)
  assert.equal(result.opens_connections, false)
  assert.equal(result.executes_processes, false)
  assert.equal(result.uses_supabase, false)
  assert.equal(result.pipeline_states.at(-1), 'succeeded')
  assert.equal(result.cycle_plan.plan.every((entry) => entry.status === 'completed'), true)
})

test('orchestrator imports real shared contracts instead of duplicating commercial algorithms', () => {
  const stages = new Set(PSDEALS_UPDATER_ORCHESTRATOR_INTEGRATION_MAP.map((entry) => entry[0]))
  for (const stage of ['listing', 'classification', 'commercial', 'fast_refresh', 'stage_payload', 'candidates', 'minima', 'ended_deals', 'cycle']) {
    assert.ok(stages.has(stage), stage)
  }
})

test('same fixture and logical timestamp produce an identical manifest and operation IDs', () => {
  const first = run()
  const second = run()
  assert.deepEqual(first, second)
  assert.deepEqual(
    first.operation_ledger.operations.map((entry) => entry.operation_id),
    second.operation_ledger.operations.map((entry) => entry.operation_id)
  )
})

test('listing supports multiple pages and canonical item order', () => {
  const first = run()
  const reordered = run('happy-path', (fixture) => {
    fixture.listing.pages.reverse()
    for (const page of fixture.listing.pages) page.items.reverse()
  })
  assert.equal(first.listing_summary.fingerprint, reordered.listing_summary.fingerprint)
  assert.equal(reordered.pagination_summary.complete, true)
})

test('equivalent duplicate items are deduplicated but conflicting duplicates block', () => {
  const equivalent = run('happy-path', (fixture) => {
    fixture.listing.pages[1].items.push(structuredClone(fixture.listing.pages[0].items[0]))
    fixture.configuration.expected_total = 3
  })
  assert.equal(equivalent.overall_status, 'simulated_success')
  assert.ok(equivalent.warnings.includes('listing_equivalent_duplicates_deduplicated'))

  const conflict = run('happy-path', (fixture) => {
    const duplicate = structuredClone(fixture.listing.pages[0].items[0])
    duplicate.current_price = '$1.00'
    fixture.listing.pages[1].items.push(duplicate)
  })
  assert.equal(conflict.overall_status, 'failed')
  assert.ok(conflict.blockers.includes('listing_conflicting_duplicates'))
})

test('truncated, absent and empty listing evidence fail closed', () => {
  assert.ok(run('adversarial-listing').blockers.includes('listing_page_truncated'))
  const absent = run('happy-path', (fixture) => { fixture.listing.pages.pop() })
  assert.ok(absent.blockers.includes('listing_page_count_mismatch'))
  const empty = run('happy-path', (fixture) => {
    fixture.listing.pages.forEach((page) => { page.items = [] })
    fixture.configuration.expected_total = 0
  })
  assert.ok(empty.blockers.includes('listing_empty'))
})

test('fast refresh preserves independent bounded queues without overlap', () => {
  const result = run()
  assert.ok(result.detail_queue.must_refresh > 0)
  assert.equal(new Set(result.detail_queue.ids).size, result.detail_queue.ids.length)
  assert.ok(result.detail_queue.ps_plus_recheck <= 10)
  assert.ok(result.detail_queue.stale <= 10)
})

test('one detail retry can resolve, while two failures block the cycle', () => {
  const resolved = run('retry-success')
  assert.equal(resolved.retries, 1)
  assert.equal(resolved.retry_plan.retries[0].result, 'resolved')
  const failed = run('happy-path', (fixture) => {
    fixture.details[0].attempts = [{ status: 'timeout' }, { status: 'timeout' }]
  })
  assert.ok(failed.blockers.includes('detail_failures_pending_after_retry'))
  assert.equal(failed.retry_plan.pending_failures.length, 1)
})

test('unsafe commercial states are isolated and never become candidates', () => {
  for (const tuple of [
    { current: 'FREE', original: '$19.99', discount: '-100%' },
    { current: '$0.00', original: '$19.99', discount: '-100%' },
    { current: '-1', original: '$19.99', discount: '-50%' },
    { current: '$9.99', original: '$19.99', discount: '-20%' },
  ]) {
    const result = run('happy-path', (fixture) => Object.assign(fixture.listing.pages[0].items[0], {
      current_price: tuple.current,
      original_price: tuple.original,
      discount_percent: tuple.discount,
    }))
    assert.equal(result.candidate_plan.some((entry) => entry.psdeals_id === 910001 && entry.kind === 'regular'), false)
    assert.equal(result.rejected_observations.some((entry) => entry.psdeals_id === 910001), true)
  }
})

test('regular and PS Plus candidates remain product, cycle and family bound', () => {
  const result = run('mixed-regular-plus')
  const regular = result.candidate_plan.filter((entry) => entry.kind === 'regular')
  const plus = result.candidate_plan.filter((entry) => entry.kind === 'ps_plus')
  assert.ok(regular.length >= 3)
  assert.equal(plus.length, 1)
  assert.equal(plus[0].psdeals_id, 910002)
  assert.equal(new Set(result.candidate_plan.map((entry) => entry.cycle_id)).size, 1)
})

test('cycle mismatch and missing receipt reject candidates and block certification', () => {
  const mismatch = run('happy-path', (fixture) => { fixture.faults.candidate_cycle_mismatch = true })
  assert.ok(mismatch.blockers.includes('candidate_cycle_mismatch'))
  const missing = run('happy-path', (fixture) => { fixture.faults.omit_receipt_for = ['listing'] })
  assert.ok(missing.blockers.includes('required_receipt_missing'))
  assert.equal(missing.finalization_plan.eligible, false)
})

test('prospective minima initialize or noop without backfill and keep first_seen paired', () => {
  const result = run()
  assert.equal(result.minima_initializations, 2)
  assert.equal(result.minima_reductions, 1)
  assert.equal(result.certification_plan.find((entry) => entry.psdeals_id === 910003 && entry.family === 'regular').decision, 'noop_equal')
  for (const operation of result.first_seen_plan) {
    assert.equal(typeof operation.after, 'string')
    assert.ok(Number.isFinite(Date.parse(operation.after)))
    assert.equal(operation.source_observation !== null, true)
  }
  assert.equal(JSON.stringify(result).includes('psdeals_stage_price_history'), false)
})

test('game, bundle, add-on and season pass use the real certification family contract', () => {
  const result = run('happy-path', (fixture) => {
    fixture.listing.pages[1].items[0].type_label = 'Season Pass'
    fixture.details[2].attempts[0].type_label = 'Season Pass'
  })
  const byId = new Map(result.candidate_plan.filter((entry) => entry.kind === 'regular').map((entry) => [entry.psdeals_id, entry]))
  assert.equal(byId.get(910001).content_type, 'game')
  assert.equal(byId.get(910002).content_type, 'bundle')
  assert.equal(byId.get(910003).content_type, 'dlc')
  assert.equal(byId.get(910003).item_type_label, 'addon')
})

test('lower, equal and higher minima decisions stay explicit and family-local', () => {
  const lower = run()
  assert.equal(lower.certification_plan.find((entry) => entry.psdeals_id === 910001 && entry.family === 'regular').decision, 'reduce')
  const higher = run('happy-path', (fixture) => {
    fixture.initial_minima[910001].regular = { amount: 5, observed_at: '2026-07-01T00:00:00.000Z' }
  })
  assert.equal(higher.certification_plan.find((entry) => entry.psdeals_id === 910001 && entry.family === 'regular').decision, 'noop_higher')
  assert.equal(higher.certification_plan.find((entry) => entry.psdeals_id === 910002 && entry.family === 'ps_plus').decision, 'initialize')
})

test('ended deals are planned only from complete verifiable listing absence', () => {
  const result = run('ended-deals')
  assert.deepEqual(result.ended_deals, [{ psdeals_id: 910004, decision: 'plan_demotion', restore_price: 20 }])
  const incomplete = run('adversarial-listing')
  assert.equal(incomplete.ended_deals_count, 0)
  assert.equal(incomplete.operation_ledger.operations.some((entry) => entry.operation_type === 'ended_deal_demotion' && entry.allowed), false)
})

test('cache is planned only after a certifiable cycle', () => {
  assert.ok(run().cache_changes > 0)
  const failed = run('happy-path', (fixture) => { fixture.faults.cache_before_certification = true })
  assert.ok(failed.blockers.includes('cache_before_certification_forbidden'))
  assert.equal(failed.finalization_plan.eligible, false)
})

test('monthly remains non-mutating and an incomplete contract is an operational blocker', () => {
  const supported = run()
  assert.equal(supported.monthly_plan.classification, 'supported')
  assert.equal(supported.monthly_changes, 0)
  const partial = run('happy-path', (fixture) => {
    fixture.monthly.status = 'partial'
    fixture.monthly.checked = false
  })
  assert.equal(partial.overall_status, 'simulated_success')
  assert.ok(partial.operational_blockers.includes('monthly_real_operation_not_supported'))
  assert.equal(partial.monthly_changes, 0)
})

test('ambiguous timeout requires reconciliation and never implies success', () => {
  const result = run('happy-path', (fixture) => { fixture.faults.timeout_after_receipts = true })
  assert.equal(result.overall_status, 'requires_reconciliation')
  assert.equal(result.reconciliation_required, true)
  assert.ok(result.blockers.includes('reconciliation_required'))
  assert.equal(result.executed_writes, 0)
})

test('CLI exposes human and JSON output and rejects operational arguments', async () => {
  let output = ''
  let error = ''
  assert.equal(await runPsdealsUpdaterOrchestratorCli([
    '--scenario=happy-path', '--timestamp=2026-08-01T12:00:00.000Z', '--json',
  ], { stdout: (value) => { output += value }, stderr: (value) => { error += value } }), 0)
  assert.equal(JSON.parse(output).executed_writes, 0)
  assert.equal(await runPsdealsUpdaterOrchestratorCli([
    '--scenario=happy-path', '--timestamp=2026-08-01T12:00:00.000Z', '--live',
  ], { stdout: () => {}, stderr: (value) => { error += value } }), 3)
  assert.match(error, /Forbidden operational argument/)
})

test('importing the offline entrypoint initializes no remote client or main process', () => {
  assert.equal(typeof runPsdealsUpdaterOrchestratorCli, 'function')
  assert.equal(JSON.stringify(run()).includes('SUPABASE_SECRET_KEY'), false)
})

test('offline dependency graph uses the extracted pure ended-deals selector', async () => {
  const [orchestrator, ended] = await Promise.all([
    import('node:fs/promises').then((fs) => fs.readFile('scripts/lib/psdeals-updater-orchestrator-local.mjs', 'utf8')),
    import('node:fs/promises').then((fs) => fs.readFile('scripts/lib/psdeals-ended-discounts.mjs', 'utf8')),
  ])
  assert.match(orchestrator, /psdeals-ended-discounts\.mjs/)
  for (const source of [orchestrator, ended]) {
    assert.doesNotMatch(source, /@supabase|createClient|child_process|\bfetch\s*\(/)
  }
})
