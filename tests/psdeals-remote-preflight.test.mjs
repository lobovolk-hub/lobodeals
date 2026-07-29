import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { runPsdealsRemotePreflightCli } from '../scripts/preflight-psdeals-remote-readonly.mjs'
import { evaluatePsdealsRemotePreflight } from '../scripts/lib/psdeals-remote-preflight.mjs'

const factsPath = path.resolve('docs/audit/lobodeals-3-remote-readonly-facts-2026-07-29.json')

async function facts() {
  return JSON.parse(await fs.readFile(factsPath, 'utf8'))
}

test('verified remote facts remain NOT_READY for missing reconciliation contracts', async () => {
  const result = evaluatePsdealsRemotePreflight(await facts(), {
    now: '2026-07-29T21:24:00.000Z',
  })
  assert.equal(result.valid, true)
  assert.equal(result.read_only_verified, true)
  assert.equal(result.ready, false)
  assert.equal(result.classification, 'NOT_READY')
  assert.ok(result.reason_codes.includes('PREFLIGHT_CREATE_CYCLE_RECONCILIATION_CONTRACT_MISSING'))
  assert.ok(result.reason_codes.includes('PREFLIGHT_CACHE_RECONCILIATION_CONTRACT_MISSING'))
  assert.ok(result.warnings.some((entry) => entry.code === 'PREFLIGHT_LEGACY_ITEM_PRICE_SNAPSHOTS_ABSENT'))
})

test('preflight fails closed on project, function, mutation, and credential drift', async () => {
  const value = await facts()
  value.project.id = 'another-project'
  value.functions.certify_price_refresh_cycle.identity_arguments = ''
  value.mutations_executed = 1
  value.credentials.values_redacted = false
  const result = evaluatePsdealsRemotePreflight(value, {
    now: '2026-07-29T21:24:00.000Z',
  })
  assert.equal(result.valid, false)
  assert.equal(result.classification, 'INDETERMINATE')
  assert.ok(result.reason_codes.includes('PREFLIGHT_COLLECTION_MODE_NOT_READ_ONLY') === false)
  assert.ok(result.errors.some((entry) => entry.code === 'PREFLIGHT_MUTATION_REPORTED'))
  assert.ok(result.blockers.some((entry) => entry.code === 'PREFLIGHT_PROJECT_MISMATCH'))
})

test('offline preflight CLI evaluates the redacted real facts without opening connections', async () => {
  let output = ''
  let errors = ''
  const exitCode = await runPsdealsRemotePreflightCli([
    `--facts=${factsPath}`,
    '--now=2026-07-29T21:24:00.000Z',
  ], {
    stdout: (value) => { output += value },
    stderr: (value) => { errors += value },
  })
  assert.equal(exitCode, 4, errors)
  assert.match(output, /"classification": "NOT_READY"/)
  assert.equal(output.includes('SUPABASE_SECRET_KEY'), false)
})
