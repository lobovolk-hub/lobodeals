import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  PSDEALS_APPLIED_006_SHA256,
  evaluatePsdealsPost006Checkpoint,
} from '../scripts/lib/psdeals-post-006-state.mjs'

const checkpointPath = path.resolve('config/psdeals-post-006-checkpoint.json')

async function checkpoint() {
  return JSON.parse(await fs.readFile(checkpointPath, 'utf8'))
}

test('canonical post-006 checkpoint proves retirement and storage readiness only', async () => {
  const result = evaluatePsdealsPost006Checkpoint(await checkpoint())
  assert.equal(result.valid, true)
  assert.equal(result.post_006_verified, true)
  assert.equal(result.history_retired, true)
  assert.equal(result.storage_ready, true)
  assert.equal(result.compact_minima_schema_ready, true)
  assert.equal(result.compact_minima_ready, false)
  assert.equal(result.block_4_complete, false)
  assert.equal(result.live_cycle_ready, false)
  assert.equal(result.thirty_day_trial_ready, false)
  assert.deepEqual(result.reason_codes, [])
})

test('canonical checkpoint hash matches the immutable applied migration bytes', async () => {
  const bytes = await fs.readFile('sql/006-lobodeals-3-restrictive-price-history-retirement.sql')
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), PSDEALS_APPLIED_006_SHA256)
})

test('checkpoint fails closed on history, storage, or operational state drift', async () => {
  const value = await checkpoint()
  value.history.retired = false
  value.storage.database_size_after_bytes = value.storage.capacity_limit_bytes
  value.operational_state.live_cycle_ready = true
  const result = evaluatePsdealsPost006Checkpoint(value)
  assert.equal(result.post_006_verified, false)
  assert.equal(result.storage_ready, false)
  assert.equal(result.live_cycle_ready, false)
  assert.ok(result.reason_codes.includes('POST_006_HISTORY_NOT_CLEANLY_RETIRED'))
  assert.ok(result.reason_codes.includes('POST_006_STORAGE_DELTA_MISMATCH'))
  assert.ok(result.reason_codes.includes('POST_006_STORAGE_CAPACITY_EXCEEDED'))
  assert.ok(result.reason_codes.includes('POST_006_UNSUPPORTED_OPERATIONAL_STATE'))
})
