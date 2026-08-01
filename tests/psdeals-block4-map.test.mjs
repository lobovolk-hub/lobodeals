import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

import {
  PSDEALS_BLOCK4_CAPABILITIES,
  validatePsdealsBlock4Map,
} from '../scripts/lib/psdeals-block4-map.mjs'

async function existingPaths() {
  const paths = [...new Set(PSDEALS_BLOCK4_CAPABILITIES.flatMap((entry) => [
    ...entry.files,
    ...entry.tests,
  ]))]
  await Promise.all(paths.map((file) => fs.access(file)))
  return paths
}

test('Block 4 executable map links all 25 capabilities to existing code and tests', async () => {
  const result = validatePsdealsBlock4Map({ existing_paths: await existingPaths() })
  assert.equal(result.valid, true)
  assert.equal(result.capability_count, 25)
  assert.deepEqual(result.status_counts, {
    READY: 9,
    PARTIAL: 15,
    MISSING: 0,
    BLOCKED: 1,
    NOT_REQUIRED: 0,
  })
  assert.equal(result.executes_commands, false)
  assert.equal(result.opens_connections, false)
  assert.equal(result.authorizes_operations, false)
})

test('map distinguishes local readiness from real operational completion', () => {
  const byId = Object.fromEntries(PSDEALS_BLOCK4_CAPABILITIES.map((entry) => [entry.id, entry]))
  assert.equal(byId.commercial_normalization.status, 'READY')
  assert.equal(byId.fast_refresh_queue.status, 'READY')
  assert.equal(byId.certification_v3.status, 'PARTIAL')
  assert.equal(byId.compact_minima.status, 'PARTIAL')
  assert.equal(byId.daily_runner.status, 'BLOCKED')
  assert.match(byId.daily_runner.safety_gate, /blocked by default/)
})

test('map validation fails closed when a linked implementation is absent', async () => {
  const paths = await existingPaths()
  const result = validatePsdealsBlock4Map({ existing_paths: paths.slice(1) })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((entry) => entry.startsWith('block4_capability_file_missing:')))
})
