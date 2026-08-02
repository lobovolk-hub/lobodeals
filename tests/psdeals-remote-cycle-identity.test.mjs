import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  attachPsdealsRemoteCycleIdentity,
  bindPsdealsRemoteCycleIdentity,
  readPsdealsRemoteCycleIdentity,
  validatePsdealsRemoteCycleIdentity,
} from '../scripts/lib/psdeals-remote-cycle-identity.mjs'

const REMOTE_ID = '11111111-1111-4111-8111-111111111111'

async function fixtureWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobodeals-remote-identity-'))
  await fs.mkdir(path.join(root, 'state'))
  return {
    root_dir: root,
    identity: {
      local_cycle_id: 'local-cycle-remote-identity-fixture',
      run_token: 'run_remote_identity_fixture_token_123',
      remote_cycle_id: null,
    },
  }
}

function binding(workspace, overrides = {}) {
  return {
    identity_version: 1,
    local_cycle_id: workspace.identity.local_cycle_id,
    remote_cycle_id: REMOTE_ID,
    authorization_id: 'auth-recovery-refresh-b-fixture',
    idempotency_key: `create-cycle:${workspace.identity.local_cycle_id}`,
    remote_receipt_id: '22222222-2222-4222-8222-222222222222',
    bound_at: '2026-08-02T06:00:00.000Z',
    ...overrides,
  }
}

test('local run intent starts without a remote UUID and binds the canonical RPC UUID once', async (t) => {
  const workspace = await fixtureWorkspace()
  t.after(() => fs.rm(workspace.root_dir, { recursive: true, force: true }))
  assert.equal((await readPsdealsRemoteCycleIdentity({ workspace })).exists, false)

  const first = await bindPsdealsRemoteCycleIdentity({
    workspace,
    remote_cycle_id: REMOTE_ID,
    authorization_id: 'auth-recovery-refresh-b-fixture',
    remote_receipt_id: '22222222-2222-4222-8222-222222222222',
    bound_at: '2026-08-02T06:00:00.000Z',
  })
  assert.equal(first.created, true)
  assert.notEqual(first.binding.remote_cycle_id, workspace.identity.local_cycle_id)
  const attached = await attachPsdealsRemoteCycleIdentity(workspace)
  assert.equal(attached.remote_cycle_id, REMOTE_ID)
  assert.equal(attached.identity.remote_cycle_id, null)
})

test('an identical lost-response reconciliation is a no-op and never creates a second binding', async (t) => {
  const workspace = await fixtureWorkspace()
  t.after(() => fs.rm(workspace.root_dir, { recursive: true, force: true }))
  const args = {
    workspace,
    remote_cycle_id: REMOTE_ID,
    authorization_id: 'auth-recovery-refresh-b-fixture',
    remote_receipt_id: '22222222-2222-4222-8222-222222222222',
    bound_at: '2026-08-02T06:00:00.000Z',
  }
  await bindPsdealsRemoteCycleIdentity(args)
  const second = await bindPsdealsRemoteCycleIdentity(args)
  assert.equal(second.created, false)
  assert.equal(second.reconciled, true)
  assert.equal((await fs.readdir(path.join(workspace.root_dir, 'state'))).length, 1)
})

test('invalid, foreign, or second UUID identities fail closed', async (t) => {
  const workspace = await fixtureWorkspace()
  t.after(() => fs.rm(workspace.root_dir, { recursive: true, force: true }))
  assert.equal(validatePsdealsRemoteCycleIdentity(binding(workspace, { remote_cycle_id: 'local-cycle-wrong' }), { workspace }).valid, false)
  assert.equal(validatePsdealsRemoteCycleIdentity(binding(workspace, { local_cycle_id: 'local-cycle-foreign-intent' }), { workspace }).valid, false)
  await bindPsdealsRemoteCycleIdentity({
    workspace,
    remote_cycle_id: REMOTE_ID,
    authorization_id: 'auth-recovery-refresh-b-fixture',
    remote_receipt_id: '22222222-2222-4222-8222-222222222222',
    bound_at: '2026-08-02T06:00:00.000Z',
  })
  await assert.rejects(
    bindPsdealsRemoteCycleIdentity({
      workspace,
      remote_cycle_id: '33333333-3333-4333-8333-333333333333',
      authorization_id: 'auth-recovery-refresh-b-fixture',
      remote_receipt_id: '44444444-4444-4444-8444-444444444444',
      bound_at: '2026-08-02T06:01:00.000Z',
    }),
    /REMOTE_CYCLE_IDENTITY_ALREADY_BOUND/
  )
})
