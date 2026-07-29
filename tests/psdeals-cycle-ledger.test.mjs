import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import {
  appendPsdealsCycleLedgerEntry,
  beginPsdealsCycleStage,
  finishPsdealsCycleStage,
  readPsdealsCycleLedger,
  recoverInterruptedPsdealsCycleStage,
  redactPsdealsCycleDiagnostic,
} from '../scripts/lib/psdeals-cycle-ledger.mjs'
import {
  acquirePsdealsCycleLock,
  releasePsdealsCycleLock,
} from '../scripts/lib/psdeals-cycle-lock.mjs'
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
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobodeals-ledger-'))
})
after(async () => fs.rm(root, { recursive: true, force: true }))

async function setup() {
  counter += 1
  const workspace = await initializePsdealsCycleWorkspace({
    cycles_root: path.join(root, `cycles-${counter}`),
    mode: 'fixture',
    code_revision: '543842b',
    context: CONTEXT,
    now: () => new Date('2026-07-29T18:00:00.000Z'),
    generate_local_cycle_id: () => `local-cycle-ledger-${String(counter).padStart(4, '0')}`,
    generate_run_token: () => `run_ledger_fixture_token_${String(counter).padStart(4, '0')}`,
  })
  const lock = await acquirePsdealsCycleLock({
    workspace,
    now: () => new Date('2026-07-29T18:00:00.000Z'),
    generate_owner_token: () => `owner_ledger_fixture_${String(counter).padStart(4, '0')}`,
    owner_label: 'fixture:ledger',
  })
  return { workspace, lock }
}

async function completeStage(context, stage, minute) {
  const started = `2026-07-29T18:${String(minute).padStart(2, '0')}:00.000Z`
  const finished = `2026-07-29T18:${String(minute).padStart(2, '0')}:30.000Z`
  await beginPsdealsCycleStage({
    workspace: context.workspace,
    owner_token: context.lock.owner_token,
    stage,
    started_at: started,
  })
  return finishPsdealsCycleStage({
    workspace: context.workspace,
    owner_token: context.lock.owner_token,
    stage,
    status: 'succeeded',
    finished_at: finished,
  })
}

test('records valid transitions in a hash-chained append-only journal', async () => {
  const context = await setup()
  await completeStage(context, 'create_cycle', 0)
  await completeStage(context, 'collect_listing', 1)
  const ledger = await readPsdealsCycleLedger({ workspace: context.workspace })
  assert.equal(ledger.valid, true)
  assert.equal(ledger.entries.length, 4)
  assert.equal(ledger.entries[1].previous_entry_sha256, ledger.entries[0].entry_sha256)
  assert.equal(ledger.last_succeeded_stage, 'collect_listing')
  assert.equal(ledger.next_stage, 'validate_listing')
})

test('rejects invalid order, concurrent running stages, and unowned writes', async () => {
  const context = await setup()
  await assert.rejects(
    beginPsdealsCycleStage({
      workspace: context.workspace,
      owner_token: context.lock.owner_token,
      stage: 'collect_listing',
      started_at: '2026-07-29T18:00:00.000Z',
    }),
    /LEDGER_DEPENDENCY_UNSATISFIED/
  )
  await beginPsdealsCycleStage({
    workspace: context.workspace,
    owner_token: context.lock.owner_token,
    stage: 'create_cycle',
    started_at: '2026-07-29T18:00:00.000Z',
  })
  await assert.rejects(
    beginPsdealsCycleStage({
      workspace: context.workspace,
      owner_token: context.lock.owner_token,
      stage: 'create_cycle',
      started_at: '2026-07-29T18:00:01.000Z',
    }),
    /LEDGER_MULTIPLE_RUNNING|LEDGER_ATTEMPT_REUSED/
  )
  await assert.rejects(
    appendPsdealsCycleLedgerEntry({
      workspace: context.workspace,
      owner_token: 'owner_not_ours_0000',
      entry: {},
    }),
    /LEDGER_LOCK_NOT_OWNED/
  )
})

test('recovers an interrupted running stage as failed and preserves attempts', async () => {
  const context = await setup()
  await beginPsdealsCycleStage({
    workspace: context.workspace,
    owner_token: context.lock.owner_token,
    stage: 'create_cycle',
    started_at: '2026-07-29T18:00:00.000Z',
  })
  const recovered = await recoverInterruptedPsdealsCycleStage({
    workspace: context.workspace,
    owner_token: context.lock.owner_token,
    recovered_at: '2026-07-29T18:01:00.000Z',
  })
  assert.equal(recovered.recovered, true)
  assert.equal(recovered.state.stages.create_cycle.status, 'failed')
  await completeStage(context, 'create_cycle', 2)
  const ledger = await readPsdealsCycleLedger({ workspace: context.workspace })
  assert.equal(ledger.stages.create_cycle.attempts.length, 2)
  assert.equal(ledger.stages.create_cycle.status, 'succeeded')
})

test('detects tampering and refuses to append after corruption', async () => {
  const context = await setup()
  await completeStage(context, 'create_cycle', 0)
  const file = path.join(context.workspace.root_dir, 'state', 'ledger-000001.json')
  const entry = JSON.parse(await fs.readFile(file, 'utf8'))
  entry.stage = 'collect_listing'
  await fs.writeFile(file, JSON.stringify(entry), 'utf8')
  const ledger = await readPsdealsCycleLedger({ workspace: context.workspace })
  assert.equal(ledger.valid, false)
  assert.ok(ledger.errors.some((value) => value.code === 'LEDGER_ENTRY_HASH_MISMATCH'))
  await assert.rejects(
    beginPsdealsCycleStage({
      workspace: context.workspace,
      owner_token: context.lock.owner_token,
      stage: 'collect_listing',
      started_at: '2026-07-29T18:02:00.000Z',
    }),
    /LEDGER_CORRUPT/
  )
})

test('requires an allowed skip reason and records simulated action separately', async () => {
  const context = await setup()
  const stages = ['create_cycle', 'collect_listing', 'validate_listing', 'build_partial_payload', 'upsert_listing', 'analyze_detail_candidates', 'import_details']
  for (const [index, stage] of stages.entries()) await completeStage(context, stage, index)
  await beginPsdealsCycleStage({
    workspace: context.workspace,
    owner_token: context.lock.owner_token,
    stage: 'retry_details',
    started_at: '2026-07-29T18:08:00.000Z',
  })
  const result = await finishPsdealsCycleStage({
    workspace: context.workspace,
    owner_token: context.lock.owner_token,
    stage: 'retry_details',
    status: 'skipped',
    finished_at: '2026-07-29T18:08:30.000Z',
    reason_codes: ['no_initial_failures'],
    authorization_required: true,
    external_action_requested: 'detail_retry',
    external_action_performed: false,
    simulation_performed: true,
  })
  assert.equal(result.state.stages.retry_details.status, 'skipped')
  assert.equal(result.entry.external_action_performed, false)
  assert.equal(result.entry.simulation_performed, true)
})

test('redacts secrets from durable diagnostics', () => {
  const secret = 'super-secret-value'
  const output = redactPsdealsCycleDiagnostic(
    `authorization=abc ${secret} password=hunter2`,
    [secret]
  )
  assert.equal(output.includes(secret), false)
  assert.equal(output.includes('hunter2'), false)
  assert.match(output, /\[REDACTED\]/)
})

test('release remains explicit after ledger work', async () => {
  const context = await setup()
  assert.equal(
    (await releasePsdealsCycleLock({
      workspace: context.workspace,
      owner_token: context.lock.owner_token,
    })).released,
    true
  )
})
