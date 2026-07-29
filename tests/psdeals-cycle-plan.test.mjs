import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPsdealsDailyCyclePlan,
  PSDEALS_DAILY_CYCLE_STEPS,
} from '../scripts/lib/psdeals-cycle-plan.mjs'

test('pure planner preserves the exact future step order and scopes', () => {
  const result = buildPsdealsDailyCyclePlan()

  assert.equal(result.executes_commands, false)
  assert.equal(result.opens_connections, false)
  assert.deepEqual(
    result.plan.map((step) => step.name),
    PSDEALS_DAILY_CYCLE_STEPS.map((step) => step.name)
  )
  assert.equal(result.plan[0].status, 'ready')
  assert.equal(result.plan[1].status, 'blocked')
})

test('pure planner blocks later steps after a closed listing gate', () => {
  const result = buildPsdealsDailyCyclePlan({
    completed_steps: ['create_cycle', 'collect_listing'],
    gates: { listing_complete: false },
  })

  const validateListing = result.plan.find(
    (step) => step.name === 'validate_listing'
  )
  const certify = result.plan.find((step) => step.name === 'certify')
  assert.equal(validateListing.status, 'blocked')
  assert.equal(validateListing.reason_code, 'gate_listing_complete_closed')
  assert.equal(certify.status, 'blocked')
})

test('pure planner blocks certification and cache when their gates are closed', () => {
  const completedThroughMarkSucceeded = PSDEALS_DAILY_CYCLE_STEPS
    .slice(0, 12)
    .map((step) => step.name)
  const result = buildPsdealsDailyCyclePlan({
    completed_steps: completedThroughMarkSucceeded,
    gates: {
      listing_complete: true,
      can_demote: true,
      can_mark_succeeded: true,
      can_certify: false,
      can_refresh_cache: false,
    },
  })

  const certify = result.plan.find((step) => step.name === 'certify')
  const cache = result.plan.find((step) => step.name === 'refresh_cache')
  assert.equal(certify.status, 'blocked')
  assert.equal(certify.reason_code, 'gate_can_certify_closed')
  assert.equal(cache.status, 'blocked')
})
