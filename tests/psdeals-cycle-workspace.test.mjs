import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import {
  PSDEALS_STALE_LOCK_CONFIRMATION,
  acquirePsdealsCycleLock,
  inspectPsdealsCycleLock,
  releasePsdealsCycleLock,
  takeOverStalePsdealsCycleLock,
} from '../scripts/lib/psdeals-cycle-lock.mjs'
import {
  finalizePsdealsCycleWorkspace,
  initializePsdealsCycleWorkspace,
  inspectPsdealsCycleWorkspace,
  openPsdealsCycleWorkspace,
  resolvePsdealsCycleWorkspacePath,
  validatePsdealsCycleWorkspaceIdentity,
} from '../scripts/lib/psdeals-cycle-workspace.mjs'

const CREATED_AT = '2026-07-29T18:00:00.000Z'
const CONTEXT = {
  requested_url:
    'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc',
  platforms: ['PS5', 'PS4'],
  content_types: ['games', 'bundles', 'dlc'],
  order: 'best-new-deals',
}

let temporaryRoot

before(async () => {
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lobodeals-cycle-workspace-'))
})

after(async () => {
  await fs.rm(temporaryRoot, { recursive: true, force: true })
})

async function workspace(name = 'local-cycle-fixture-0001') {
  return initializePsdealsCycleWorkspace({
    cycles_root: path.join(temporaryRoot, `cycles-${name}`),
    mode: 'fixture',
    code_revision: '4c2b9fd553c70fc31dfc04f9cdbe4b5b5213d7d7',
    context: CONTEXT,
    now: () => new Date(CREATED_AT),
    generate_local_cycle_id: () => name,
    generate_run_token: () => 'run_deterministic_fixture_token_0001',
  })
}

test('initializes one deterministic identity and canonical structure', async () => {
  const value = await workspace('local-cycle-fixture-init')
  assert.equal(value.identity.local_cycle_id, 'local-cycle-fixture-init')
  assert.equal(value.identity.run_token, 'run_deterministic_fixture_token_0001')
  assert.equal(value.identity.remote_cycle_id, null)
  assert.equal(validatePsdealsCycleWorkspaceIdentity(value.identity).valid, true)
  assert.equal((await inspectPsdealsCycleWorkspace(value)).artifact_count, 0)
})

test('reopens the exact identity and refuses silent overwrite', async () => {
  const value = await workspace('local-cycle-fixture-reopen')
  const reopened = await openPsdealsCycleWorkspace({ workspace_dir: value.root_dir })
  assert.deepEqual(reopened.identity, value.identity)
  await assert.rejects(
    workspace('local-cycle-fixture-reopen'),
    (error) => error?.code === 'EEXIST'
  )
})

test('rejects traversal and identity corruption', async () => {
  const value = await workspace('local-cycle-fixture-paths')
  await assert.rejects(
    resolvePsdealsCycleWorkspacePath(value, '../outside'),
    /WORKSPACE_PATH_NOT_PORTABLE/
  )
  const identityPath = path.join(value.root_dir, 'identity.json')
  const identity = JSON.parse(await fs.readFile(identityPath, 'utf8'))
  identity.run_token = 'different'
  await fs.writeFile(identityPath, JSON.stringify(identity), 'utf8')
  await assert.rejects(
    openPsdealsCycleWorkspace({ workspace_dir: value.root_dir }),
    /WORKSPACE_IDENTITY_CORRUPT/
  )
})

test('finalization is atomic and cannot overwrite an existing receipt', async () => {
  const value = await workspace('local-cycle-fixture-finalize')
  await finalizePsdealsCycleWorkspace({
    workspace: value,
    status: 'fixture_complete',
    finished_at: '2026-07-29T18:10:00.000Z',
  })
  await assert.rejects(
    finalizePsdealsCycleWorkspace({
      workspace: value,
      status: 'fixture_complete',
      finished_at: '2026-07-29T18:11:00.000Z',
    }),
    /EVIDENCE_OUTPUT_EXISTS/
  )
})

test('prevents concurrent acquisition and releases only its own lock', async () => {
  const value = await workspace('local-cycle-fixture-lock')
  const lock = await acquirePsdealsCycleLock({
    workspace: value,
    now: () => new Date(CREATED_AT),
    generate_owner_token: () => 'owner_fixture_lock_0001',
    owner_label: 'fixture:1',
  })
  assert.equal(
    (
      await inspectPsdealsCycleLock({
        workspace: value,
        now: () => new Date('2026-07-29T18:01:00.000Z'),
      })
    ).status,
    'active'
  )
  await assert.rejects(acquirePsdealsCycleLock({ workspace: value }), /CYCLE_LOCK_ACTIVE/)
  await assert.rejects(
    releasePsdealsCycleLock({ workspace: value, owner_token: 'owner_foreign_0001' }),
    /CYCLE_LOCK_NOT_OWNED/
  )
  assert.equal(
    (await releasePsdealsCycleLock({
      workspace: value,
      owner_token: lock.owner_token,
    })).released,
    true
  )
})

test('detects corrupt and stale locks without automatic deletion', async () => {
  const corruptWorkspace = await workspace('local-cycle-fixture-corrupt-lock')
  await fs.writeFile(
    path.join(corruptWorkspace.root_dir, 'locks', 'active.json'),
    '{broken',
    'utf8'
  )
  assert.equal(
    (await inspectPsdealsCycleLock({ workspace: corruptWorkspace })).status,
    'corrupt'
  )

  const staleWorkspace = await workspace('local-cycle-fixture-stale-lock')
  const old = await acquirePsdealsCycleLock({
    workspace: staleWorkspace,
    now: () => new Date('2026-07-29T17:00:00.000Z'),
    generate_owner_token: () => 'owner_fixture_stale_0001',
    owner_label: 'fixture:old',
  })
  const inspected = await inspectPsdealsCycleLock({
    workspace: staleWorkspace,
    now: () => new Date(CREATED_AT),
    stale_after_ms: 1_000,
  })
  assert.equal(inspected.status, 'stale')
  assert.equal((await fs.stat(path.join(staleWorkspace.root_dir, 'locks', 'active.json'))).isFile(), true)
  await assert.rejects(
    takeOverStalePsdealsCycleLock({
      workspace: staleWorkspace,
      expected_owner_token: old.owner_token,
      now: () => new Date(CREATED_AT),
      stale_after_ms: 1_000,
    }),
    /STALE_LOCK_CONFIRMATION_REQUIRED/
  )
})

test('takes over only a verified stale lock with explicit confirmation', async () => {
  const value = await workspace('local-cycle-fixture-takeover')
  const old = await acquirePsdealsCycleLock({
    workspace: value,
    now: () => new Date('2026-07-29T17:00:00.000Z'),
    generate_owner_token: () => 'owner_fixture_takeover_old',
    owner_label: 'fixture:old',
  })
  const replacement = await takeOverStalePsdealsCycleLock({
    workspace: value,
    expected_owner_token: old.owner_token,
    confirmation: PSDEALS_STALE_LOCK_CONFIRMATION,
    now: () => new Date(CREATED_AT),
    stale_after_ms: 1_000,
    generate_owner_token: () => 'owner_fixture_takeover_new',
    owner_label: 'fixture:new',
  })
  assert.equal(replacement.owner_token, 'owner_fixture_takeover_new')
  assert.equal(
    (
      await inspectPsdealsCycleLock({
        workspace: value,
        now: () => new Date('2026-07-29T18:01:00.000Z'),
      })
    ).lock.owner_token,
    replacement.owner_token
  )
  assert.equal((await fs.readdir(path.join(value.root_dir, 'receipts'))).length, 1)
})
