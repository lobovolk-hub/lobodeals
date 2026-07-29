import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createPsdealsFixtureAdapters } from '../scripts/lib/psdeals-cycle-fixture-adapters.mjs'
import { readPsdealsCycleLedger } from '../scripts/lib/psdeals-cycle-ledger.mjs'
import {
  acquirePsdealsCycleLock,
  releasePsdealsCycleLock,
} from '../scripts/lib/psdeals-cycle-lock.mjs'
import { runPsdealsCycle } from '../scripts/lib/psdeals-cycle-runner.mjs'
import { initializePsdealsCycleWorkspace } from '../scripts/lib/psdeals-cycle-workspace.mjs'
import {
  buildPsdealsStageAuthorization,
  PSDEALS_OPERATIONAL_STAGE_PERMISSIONS,
} from '../scripts/lib/psdeals-operational-authorization.mjs'

const context = {
  requested_url: 'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc',
  platforms: ['PS5', 'PS4'],
  content_types: ['games', 'bundles', 'dlc'],
  order: 'best-new-deals',
}

function clock() {
  let second = 1
  return () => new Date(Date.UTC(2026, 6, 29, 21, 30, second++))
}

test('real runner completes an operational-mode rehearsal using only fake adapters', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobodeals-controlled-rehearsal-'))
  try {
    const workspace = await initializePsdealsCycleWorkspace({
      cycles_root: root,
      mode: 'operational',
      code_revision: 'controlled-rehearsal-fixture',
      context,
      now: () => new Date('2026-07-29T21:30:00.000Z'),
      generate_local_cycle_id: () => 'local-cycle-controlled-rehearsal',
      generate_run_token: () => 'run_controlled_rehearsal_token_123456',
    })
    const authorizations = Object.entries(PSDEALS_OPERATIONAL_STAGE_PERMISSIONS)
      .map(([stage]) => buildPsdealsStageAuthorization({
        authorization_id: `auth-${stage}-controlled-rehearsal`,
        local_cycle_id: workspace.identity.local_cycle_id,
        run_token: workspace.identity.run_token,
        stage,
        approved_by: 'Johan-fixture-only',
        issued_at: '2026-07-29T21:00:00.000Z',
        expires_at: '2026-07-29T23:00:00.000Z',
      }))
    const lock = await acquirePsdealsCycleLock({ workspace })
    try {
      const result = await runPsdealsCycle({
        workspace,
        owner_token: lock.owner_token,
        mode: 'operational',
        adapters: createPsdealsFixtureAdapters(),
        authorizations,
        now: clock(),
      })
      assert.equal(result.exit_code, 0)
    } finally {
      await releasePsdealsCycleLock({ workspace, owner_token: lock.owner_token })
    }
    const ledger = await readPsdealsCycleLedger({ workspace })
    assert.equal(ledger.valid, true)
    assert.equal(ledger.entries.some((entry) => entry.external_action_performed), false)
    assert.equal(ledger.entries.some((entry) => entry.simulation_performed), true)
    assert.equal(ledger.stages.apply_ended_deals.status, 'skipped')
    const finalization = JSON.parse(await fs.readFile(path.join(workspace.root_dir, 'state', 'finalization.json'), 'utf8'))
    assert.equal(finalization.status, 'operational_complete')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('authorization from another cycle stops before the first adapter or ledger write', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobodeals-controlled-rehearsal-blocked-'))
  try {
    const workspace = await initializePsdealsCycleWorkspace({
      cycles_root: root,
      mode: 'operational',
      code_revision: 'controlled-rehearsal-fixture',
      context,
      now: () => new Date('2026-07-29T21:30:00.000Z'),
      generate_local_cycle_id: () => 'local-cycle-controlled-blocked',
      generate_run_token: () => 'run_controlled_blocked_token_12345678',
    })
    const wrong = buildPsdealsStageAuthorization({
      authorization_id: 'auth-wrong-cycle',
      local_cycle_id: 'local-cycle-another-cycle',
      run_token: workspace.identity.run_token,
      stage: 'create_cycle',
      approved_by: 'Johan-fixture-only',
      issued_at: '2026-07-29T21:00:00.000Z',
      expires_at: '2026-07-29T23:00:00.000Z',
    })
    const result = await runPsdealsCycle({
      workspace,
      mode: 'operational',
      adapters: { create_cycle: async () => { throw new Error('must not run') } },
      authorizations: [wrong],
      now: () => new Date('2026-07-29T21:30:01.000Z'),
    })
    assert.equal(result.exit_code, 5)
    assert.equal((await readPsdealsCycleLedger({ workspace })).entries.length, 0)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
