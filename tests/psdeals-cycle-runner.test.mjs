import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { runPsdealsCycleCli } from '../scripts/run-psdeals-cycle.mjs'
import { createPsdealsFixtureAdapters } from '../scripts/lib/psdeals-cycle-fixture-adapters.mjs'
import { loadVerifiedPsdealsCycleEvidence } from '../scripts/lib/psdeals-cycle-evidence-store.mjs'
import { readPsdealsCycleLedger } from '../scripts/lib/psdeals-cycle-ledger.mjs'
import {
  acquirePsdealsCycleLock,
  releasePsdealsCycleLock,
} from '../scripts/lib/psdeals-cycle-lock.mjs'
import {
  PSDEALS_CYCLE_RUNNER_EXIT_CODES,
  runPsdealsCycle,
  verifyPsdealsCycleWorkspaceEvidence,
} from '../scripts/lib/psdeals-cycle-runner.mjs'
import { initializePsdealsCycleWorkspace } from '../scripts/lib/psdeals-cycle-workspace.mjs'

const CONTEXT = {
  requested_url: 'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc',
  platforms: ['PS5', 'PS4'],
  content_types: ['games', 'bundles', 'dlc'],
  order: 'best-new-deals',
}

let root
let counter = 0

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobodeals-runner-'))
})
after(async () => fs.rm(root, { recursive: true, force: true }))

function clock(startSecond = 0) {
  let second = startSecond
  return () => {
    const value = new Date(Date.UTC(2026, 6, 29, 18, 0, second))
    second += 1
    return value
  }
}

async function workspace(mode = 'fixture') {
  counter += 1
  return initializePsdealsCycleWorkspace({
    cycles_root: path.join(root, `cycles-${counter}`),
    mode,
    code_revision: '8ffb3c5',
    context: CONTEXT,
    now: () => new Date('2026-07-29T18:00:00.000Z'),
    generate_local_cycle_id: () => `local-cycle-runner-${String(counter).padStart(4, '0')}`,
    generate_run_token: () => `run_runner_fixture_token_${String(counter).padStart(4, '0')}`,
  })
}

async function runLocked(value, options = {}) {
  const lock = await acquirePsdealsCycleLock({
    workspace: value,
    now: () => new Date('2026-07-29T18:00:00.000Z'),
    generate_owner_token: () => `owner_runner_fixture_${String(counter).padStart(4, '0')}`,
    owner_label: 'fixture:runner',
  })
  try {
    return await runPsdealsCycle({
      workspace: value,
      owner_token: lock.owner_token,
      mode: 'fixture',
      adapters: createPsdealsFixtureAdapters(),
      now: clock(options.startSecond || 1),
      ...options,
    })
  } finally {
    await releasePsdealsCycleLock({ workspace: value, owner_token: lock.owner_token })
  }
}

test('fixture runner traverses all 16 stages with no external action performed', async () => {
  const value = await workspace()
  const result = await runLocked(value)
  assert.equal(result.exit_code, PSDEALS_CYCLE_RUNNER_EXIT_CODES.success)
  const ledger = await readPsdealsCycleLedger({ workspace: value })
  assert.equal(ledger.valid, true)
  assert.equal(Object.values(ledger.stages).filter((stage) => stage.status === 'succeeded').length, 15)
  assert.equal(ledger.stages.retry_details.status, 'skipped')
  assert.equal(ledger.entries.some((entry) => entry.external_action_performed), false)
  assert.equal(ledger.entries.some((entry) => entry.simulation_performed), true)
  assert.equal(result.CAN_DEMOTE, true)
  assert.equal(result.CAN_CERTIFY, true)
  assert.equal(result.CAN_REFRESH_CACHE, true)
})

test('complete fixture produces a linked manifest accepted before lifecycle simulation', async () => {
  const value = await workspace()
  await runLocked(value)
  const verified = await verifyPsdealsCycleWorkspaceEvidence({
    workspace: value,
    now: '2026-07-29T18:05:00.000Z',
  })
  assert.equal(verified.valid, true)
  assert.equal(verified.manifest_validation.listing_complete, true)
  assert.equal(verified.manifest_validation.detail_complete, true)
  assert.equal(verified.manifest_validation.monthly_complete, true)
  assert.equal(verified.manifest_validation.ended_deals_complete, true)
  assert.equal(verified.manifest_validation.can_mark_succeeded, true)
  assert.equal(verified.manifest_validation.can_certify, false)
  assert.equal(verified.manifest_validation.can_refresh_cache, false)
})

test('runner resumes after a controlled interruption without repeating completed stages', async () => {
  const value = await workspace()
  const first = await runLocked(value, { stop_after_stage: 'import_details' })
  assert.equal(first.stopped_after_stage, 'import_details')
  const before = await readPsdealsCycleLedger({ workspace: value })
  assert.equal(before.stages.import_details.attempts.length, 1)
  const resumed = await runLocked(value, { startSecond: 40 })
  assert.equal(resumed.exit_code, 0)
  const afterValue = await readPsdealsCycleLedger({ workspace: value })
  assert.equal(afterValue.stages.import_details.attempts.length, 1)
  assert.equal(afterValue.stages.record_metrics.status, 'succeeded')
})

test('operational mode is blocked before adapters or ledger writes', async () => {
  const value = await workspace('operational')
  const result = await runPsdealsCycle({
    workspace: value,
    mode: 'operational',
    adapters: { create_cycle: () => { throw new Error('must not execute') } },
  })
  assert.equal(result.exit_code, PSDEALS_CYCLE_RUNNER_EXIT_CODES.awaiting_authorization)
  assert.equal((await readPsdealsCycleLedger({ workspace: value })).entries.length, 0)
})

test('plan mode performs no writes and exposes closed gates', async () => {
  const value = await workspace('plan')
  const result = await runPsdealsCycle({ workspace: value, mode: 'plan' })
  assert.equal(result.executes_commands, false)
  assert.equal(result.opens_connections, false)
  assert.equal((await readPsdealsCycleLedger({ workspace: value })).entries.length, 0)
  assert.equal(result.CAN_CERTIFY, false)
})

test('adapter timeout, oversized-output, and secret failures remain failed and redacted', async () => {
  for (const message of [
    'SIMULATED_TIMEOUT',
    'SIMULATED_OUTPUT_LIMIT_EXCEEDED',
    'authorization=top-secret-token password=hunter2',
  ]) {
    const value = await workspace()
    const adapters = createPsdealsFixtureAdapters()
    adapters.create_cycle = async () => { throw new Error(message) }
    const lock = await acquirePsdealsCycleLock({ workspace: value })
    try {
      const result = await runPsdealsCycle({
        workspace: value,
        owner_token: lock.owner_token,
        mode: 'fixture',
        adapters,
        now: clock(1),
      })
      assert.equal(result.exit_code, PSDEALS_CYCLE_RUNNER_EXIT_CODES.stage_failed)
    } finally {
      await releasePsdealsCycleLock({ workspace: value, owner_token: lock.owner_token })
    }
    const ledger = await readPsdealsCycleLedger({ workspace: value })
    const durable = JSON.stringify(ledger.entries)
    assert.equal(durable.includes('top-secret-token'), false)
    assert.equal(durable.includes('hunter2'), false)
  }
})

test('tampered artifact and duplicate evidence fail closed', async () => {
  const altered = await workspace()
  await runLocked(altered)
  await fs.appendFile(path.join(altered.root_dir, 'artifacts', 'listing.json'), '\nTAMPERED\n')
  assert.equal((await verifyPsdealsCycleWorkspaceEvidence({ workspace: altered, now: '2026-07-29T18:05:00.000Z' })).valid, false)

  const duplicated = await workspace()
  await runLocked(duplicated)
  await fs.copyFile(
    path.join(duplicated.root_dir, 'evidence', 'listing-collection.json'),
    path.join(duplicated.root_dir, 'evidence', 'listing-collection-copy.json')
  )
  const store = await loadVerifiedPsdealsCycleEvidence({ workspace: duplicated, now: '2026-07-29T18:05:00.000Z' })
  assert.equal(store.valid, false)
  assert.ok(store.errors.some((entry) => entry.code === 'EVIDENCE_STORE_DUPLICATE_KIND'))
})

test('tampered action receipt is detected independently of the ledger hash chain', async () => {
  const value = await workspace()
  await runLocked(value)
  await fs.appendFile(
    path.join(value.root_dir, 'receipts', 'create-cycle-fixture.json'),
    '\nTAMPERED\n'
  )
  const verified = await verifyPsdealsCycleWorkspaceEvidence({
    workspace: value,
    now: '2026-07-29T18:05:00.000Z',
  })
  assert.equal(verified.valid, false)
  assert.equal(verified.classification, 'workspace_corrupt')
  assert.ok(verified.errors.some((entry) => entry.code === 'ACTION_RECEIPT_HASH_MISSING'))
})

test('CLI exposes all safe commands against a fixture workspace', async () => {
  const value = await workspace()
  let output = ''
  let error = ''
  const io = {
    stdout: (chunk) => { output += chunk },
    stderr: (chunk) => { error += chunk },
  }
  assert.equal(await runPsdealsCycleCli(['plan', `--workspace=${value.root_dir}`], io), 0)
  assert.equal(await runPsdealsCycleCli(['status', `--workspace=${value.root_dir}`], io), 0)
  assert.equal(await runPsdealsCycleCli(['explain-blockers', `--workspace=${value.root_dir}`], io), 0)
  assert.equal(await runPsdealsCycleCli(['run-fixture', `--workspace=${value.root_dir}`], io), 0, error)
  assert.equal(await runPsdealsCycleCli(['verify', `--workspace=${value.root_dir}`, '--now=2026-07-30T00:00:00.000Z'], io), 0, error)
  assert.equal(await runPsdealsCycleCli(['assemble', `--workspace=${value.root_dir}`, '--now=2026-07-30T00:00:00.000Z'], io), 0, error)
  assert.equal(await runPsdealsCycleCli(['resume', `--workspace=${value.root_dir}`], io), 0, error)
  assert.match(output, /CAN_CERTIFY/)
  assert.equal(output.includes(value.identity.run_token), false)
})

test('CLI init creates a safe plan workspace and help documents exit codes', async () => {
  let output = ''
  const io = { stdout: (chunk) => { output += chunk }, stderr: () => {} }
  assert.equal(await runPsdealsCycleCli(['help'], io), 0)
  assert.match(output, /awaiting authorization/)
  output = ''
  assert.equal(await runPsdealsCycleCli([
    'init',
    `--cycles-root=${path.join(root, 'cli-init')}`,
    '--code-revision=fixture',
    '--mode=plan',
  ], io), 0)
  assert.match(output, /"mode": "plan"/)
  assert.equal(/run_[A-Za-z0-9_-]{16,}/.test(output), false)
})
