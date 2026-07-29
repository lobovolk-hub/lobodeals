import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createPsdealsFixtureAdapters } from '../scripts/lib/psdeals-cycle-fixture-adapters.mjs'
import {
  executeIdempotentPsdealsCreateCycle,
  preparePsdealsCreateCycleRequest,
} from '../scripts/lib/psdeals-cycle-operational-adapters.mjs'
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
import { hashPsdealsDemotionCandidateIds } from '../scripts/lib/psdeals-cycle-migration-contract.mjs'
import { PsdealsMigratedLifecycleFixture } from './helpers/psdeals-migrated-lifecycle-fixture.mjs'

const context = {
  requested_url: 'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc',
  platforms: ['PS5', 'PS4'],
  content_types: ['games', 'bundles', 'dlc'],
  order: 'best-new-deals',
}
const remoteContract = {
  columns: ['local_cycle_id', 'run_token_sha256', 'code_revision', 'filter_fingerprint', 'manifest_hash', 'mode'],
  indexes: [
    'price_refresh_cycles_local_cycle_id_unique_idx',
    'price_refresh_cycles_run_token_sha256_unique_idx',
    'price_refresh_cycles_local_identity_unique_idx',
  ],
  create_rpc_ready: true,
}

function clock() {
  let second = 1
  return () => new Date(Date.UTC(2026, 6, 29, 21, 30, second++))
}

function createArgs(overrides = {}) {
  return {
    p_local_cycle_id: 'local-cycle-migrated-fixture',
    p_run_token_sha256: '1'.repeat(64),
    p_code_revision: '2'.repeat(40),
    p_filter_fingerprint: '3'.repeat(64),
    p_manifest_hash: '4'.repeat(64),
    p_mode: 'operational',
    p_region_code: 'us',
    p_storefront: 'playstation',
    p_cycle_date: '2026-07-29',
    p_started_at: '2026-07-29T21:30:00.000Z',
    p_idempotency_key: 'create-cycle:migrated-fixture',
    p_request_hash: '5'.repeat(64),
    ...overrides,
  }
}

function seedUpstream(fixture, candidateIds = []) {
  const created = fixture.createCycle(createArgs())[0]
  const cycleId = created.cycle_id
  const listing = fixture.recordListing(cycleId, {
    key: 'listing:migrated-fixture', requestHash: 'a'.repeat(64), listingHash: 'b'.repeat(64),
  })
  const upsert = fixture.recordStage(cycleId, 'listing_upsert_batch', listing.id, {
    batch_index: 0, attempted: 3, failed: 0, skipped: 0,
  }, { key: 'upsert:migrated-fixture', inputHash: 'b'.repeat(64) })
  const fast = fixture.recordStage(cycleId, 'fast_refresh_analysis', listing.id, {
    combined_count: 2, overlap_count: 0, combined_artifact_hash: 'c'.repeat(64),
  }, { key: 'fast:migrated-fixture', inputHash: 'b'.repeat(64) })
  const detail = fixture.recordStage(cycleId, 'detail_import', fast.id, {
    attempted: 2, succeeded: 1, pending_failures: 1,
  }, { key: 'detail:migrated-fixture', inputHash: 'c'.repeat(64) })
  const retry = fixture.recordStage(cycleId, 'detail_retry', detail.id, {
    attempted: 1, succeeded: 1, pending_failures: 0,
  }, { key: 'retry:migrated-fixture', inputHash: 'd'.repeat(64) })
  const monthly = fixture.recordMonthly(cycleId)
  const candidateHash = hashPsdealsDemotionCandidateIds(candidateIds)
  const ended = fixture.recordStage(cycleId, 'ended_deals_analysis', listing.id, {
    listing_complete: true,
    listing_artifact_hash: 'b'.repeat(64),
    analysis_evidence_hash: 'e'.repeat(64),
    candidate_set_hash: candidateHash,
    candidate_count: candidateIds.length,
  }, { key: 'ended:migrated-fixture', inputHash: 'b'.repeat(64) })
  return { cycleId, listing, upsert, fast, detail, retry, monthly, ended, candidateIds }
}

function authorizations(workspace) {
  return Object.keys(PSDEALS_OPERATIONAL_STAGE_PERMISSIONS).map((stage) =>
    buildPsdealsStageAuthorization({
      authorization_id: `auth-${stage}-migrated-rehearsal`,
      local_cycle_id: workspace.identity.local_cycle_id,
      run_token: workspace.identity.run_token,
      stage,
      approved_by: 'Johan-fixture-only',
      issued_at: '2026-07-29T21:00:00.000Z',
      expires_at: '2026-07-29T23:00:00.000Z',
    })
  )
}

test('real runner completes all 17 stages against the exact migrated fake contract', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobodeals-migrated-rehearsal-'))
  try {
    const workspace = await initializePsdealsCycleWorkspace({
      cycles_root: root,
      mode: 'operational',
      code_revision: '2'.repeat(40),
      context,
      now: () => new Date('2026-07-29T21:30:00.000Z'),
      generate_local_cycle_id: () => 'local-cycle-migrated-runner',
      generate_run_token: () => 'run_migrated_runner_token_123456789',
    })
    const fake = new PsdealsMigratedLifecycleFixture()
    const state = { receipts: [] }
    const base = createPsdealsFixtureAdapters()
    const adapters = { ...base }
    const wrap = (stage, action) => {
      adapters[stage] = async (ctx) => {
        const local = await base[stage](ctx)
        await action(ctx)
        return local
      }
    }

    wrap('create_cycle', async (ctx) => {
      const request = preparePsdealsCreateCycleRequest({
        workspace,
        authorization: ctx.authorization,
        remote_contract: remoteContract,
        cycle_date: '2026-07-29',
        started_at: workspace.identity.created_at,
      })
      const result = await executeIdempotentPsdealsCreateCycle(request, {
        find_cycles: async (identity) => fake.findCycles(identity),
        find_receipt: async (key) => fake.findReceipt(key),
        invoke_create_cycle: async (_name, args) => fake.createCycle(args),
        write_receipt: async (value) => value,
      })
      assert.equal(result.status, 'succeeded')
      state.cycleId = result.remote_cycle_id
      state.receipts.push(fake.findReceipt(request.idempotency_key))
    })
    wrap('validate_listing', async () => {
      state.listing = fake.recordListing(state.cycleId, {
        key: 'listing:runner-fixture', requestHash: 'a'.repeat(64), listingHash: 'b'.repeat(64),
      })
      state.receipts.push(state.listing)
    })
    wrap('upsert_listing', async () => {
      state.upsert = fake.recordStage(state.cycleId, 'listing_upsert_batch', state.listing.id, {
        batch_index: 0, attempted: 3, failed: 0, skipped: 0,
      }, { key: 'upsert:runner-fixture', inputHash: 'b'.repeat(64) })
      state.receipts.push(state.upsert)
    })
    wrap('analyze_detail_candidates', async () => {
      state.fast = fake.recordStage(state.cycleId, 'fast_refresh_analysis', state.listing.id, {
        combined_count: 2, overlap_count: 0, combined_artifact_hash: 'c'.repeat(64),
      }, { key: 'fast:runner-fixture', inputHash: 'b'.repeat(64) })
      state.receipts.push(state.fast)
    })
    wrap('import_details', async () => {
      state.detail = fake.recordStage(state.cycleId, 'detail_import', state.fast.id, {
        attempted: 2, succeeded: 1, pending_failures: 1,
      }, { key: 'detail:runner-fixture', inputHash: 'c'.repeat(64) })
      state.receipts.push(state.detail)
    })
    wrap('retry_details', async () => {
      state.retry = fake.recordStage(state.cycleId, 'detail_retry', state.detail.id, {
        attempted: 1, succeeded: 1, pending_failures: 0,
      }, { key: 'retry:runner-fixture', inputHash: 'd'.repeat(64) })
      state.receipts.push(state.retry)
    })
    wrap('check_monthly_games', async () => {
      state.monthly = fake.recordMonthly(state.cycleId, { key: 'monthly:runner-fixture' })
      state.receipts.push(state.monthly)
    })
    wrap('analyze_ended_deals', async () => {
      state.ended = fake.recordStage(state.cycleId, 'ended_deals_analysis', state.listing.id, {
        listing_complete: true,
        listing_artifact_hash: 'b'.repeat(64),
        analysis_evidence_hash: 'e'.repeat(64),
        candidate_set_hash: hashPsdealsDemotionCandidateIds([]),
        candidate_count: 0,
      }, { key: 'ended:runner-fixture', inputHash: 'b'.repeat(64) })
      state.receipts.push(state.ended)
    })
    wrap('apply_ended_deals', async () => {
      state.demotion = fake.demote(state.cycleId, state.ended.id, [], { key: 'demotion:runner-fixture' })
      state.receipts.push(state.demotion)
    })
    wrap('mark_succeeded', async () => {
      state.mark = fake.markSucceeded(
        state.cycleId,
        state.demotion.id,
        [state.listing, state.upsert, state.fast, state.detail, state.retry, state.monthly, state.ended, state.demotion].map((value) => value.id),
        { key: 'mark:runner-fixture' }
      )
      state.receipts.push(state.mark)
    })
    wrap('certify', async () => {
      state.certify = fake.certify(state.cycleId, state.mark.id, { key: 'certify:runner-fixture' })
      state.receipts.push(state.certify)
    })
    wrap('refresh_cache', async () => {
      state.cache = fake.refreshCache(state.cycleId, state.certify.id, { key: 'cache:runner-fixture' })
      state.receipts.push(state.cache)
    })
    wrap('validate_public', async () => {
      state.public = fake.recordStage(state.cycleId, 'public_validation', state.cache.id, { passed: true }, {
        key: 'public:runner-fixture', inputHash: 'f'.repeat(64),
      })
      state.receipts.push(state.public)
    })
    wrap('record_metrics', async () => {
      state.metrics = fake.recordStage(state.cycleId, 'metrics_record', state.public.id, { recorded: true }, {
        key: 'metrics:runner-fixture', inputHash: '0'.repeat(64),
      })
      state.receipts.push(state.metrics)
    })

    const lock = await acquirePsdealsCycleLock({ workspace })
    let result
    try {
      result = await runPsdealsCycle({
        workspace,
        owner_token: lock.owner_token,
        mode: 'operational',
        adapters,
        authorizations: authorizations(workspace),
        now: clock(),
      })
    } finally {
      await releasePsdealsCycleLock({ workspace, owner_token: lock.owner_token })
    }
    assert.equal(result.exit_code, 0)
    assert.equal(fake.readCycle(state.cycleId).status, 'certified')
    assert.equal(fake.readCycle(state.cycleId).cache_refreshed_at != null, true)
    assert.equal(state.receipts.every((value) => value.status === 'committed'), true)
    assert.equal(fake.effectCount('cache_refresh'), 1)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('lost responses after demotion, mark, certification, and cache reconcile without repeated effects', () => {
  const fake = new PsdealsMigratedLifecycleFixture()
  const state = seedUpstream(fake, [101, 202])
  let demotion
  assert.throws(() => fake.demote(state.cycleId, state.ended.id, state.candidateIds, { timeoutAfterCommit: true }), /TIMEOUT/)
  demotion = fake.demote(state.cycleId, state.ended.id, state.candidateIds)
  assert.equal(demotion.reconciled, true)
  assert.equal(fake.effectCount('demotion_apply'), 1)

  const required = [state.listing, state.upsert, state.fast, state.detail, state.retry, state.monthly, state.ended, demotion].map((value) => value.id)
  assert.throws(() => fake.markSucceeded(state.cycleId, demotion.id, required, { timeoutAfterCommit: true }), /TIMEOUT/)
  const mark = fake.markSucceeded(state.cycleId, demotion.id, required)
  assert.equal(mark.reconciled, true)
  assert.equal(fake.effectCount('mark_succeeded'), 1)

  assert.throws(() => fake.certify(state.cycleId, mark.id, { timeoutAfterCommit: true }), /TIMEOUT/)
  const certify = fake.certify(state.cycleId, mark.id)
  assert.equal(certify.reconciled, true)
  assert.equal(fake.effectCount('certify'), 1)

  assert.throws(() => fake.refreshCache(state.cycleId, certify.id, { timeoutAfterCommit: true }), /TIMEOUT/)
  const cache = fake.refreshCache(state.cycleId, certify.id)
  assert.equal(cache.reconciled, true)
  assert.equal(fake.effectCount('cache_refresh'), 1)
})

test('zero-candidate and bounded candidate demotions both leave exact receipts', () => {
  const zero = new PsdealsMigratedLifecycleFixture()
  const zeroState = seedUpstream(zero, [])
  const zeroReceipt = zero.demote(zeroState.cycleId, zeroState.ended.id, [])
  assert.equal(zeroReceipt.affected_rows, 0)
  assert.equal(zeroReceipt.result.candidate_set_hash, hashPsdealsDemotionCandidateIds([]))

  const some = new PsdealsMigratedLifecycleFixture()
  const someState = seedUpstream(some, [8, 3])
  const someReceipt = some.demote(someState.cycleId, someState.ended.id, [8, 3])
  assert.equal(someReceipt.affected_rows, 2)
  assert.equal(some.readCycle(someState.cycleId).ended_discounts_applied, 2)
  assert.throws(() => some.demote(someState.cycleId, someState.ended.id, Array.from({ length: 501 }, (_, index) => index + 1), { key: 'another-demotion:key' }), /TOO_LARGE/)
})

test('a contradictory receipt or parent from another cycle fails closed', () => {
  const fake = new PsdealsMigratedLifecycleFixture()
  const first = seedUpstream(fake, [])
  assert.throws(() => fake.recordStage(first.cycleId, 'fast_refresh_analysis', first.listing.id, {
    combined_count: 9,
  }, { key: 'fast:migrated-fixture', requestHash: '0'.repeat(64) }), /CONTRADICTION/)

  const secondCreated = fake.createCycle(createArgs({
    p_local_cycle_id: 'local-cycle-second-fixture',
    p_run_token_sha256: '6'.repeat(64),
    p_manifest_hash: '7'.repeat(64),
    p_idempotency_key: 'create-cycle:second-fixture',
    p_request_hash: '8'.repeat(64),
  }))[0]
  assert.throws(() => fake.recordStage(secondCreated.cycle_id, 'fast_refresh_analysis', first.listing.id, {}, {
    key: 'mixed-cycle:fixture', requestHash: '9'.repeat(64),
  }), /PARENT/)
})

test('cache failure after certification leaves certification intact and no cache effect', () => {
  const fake = new PsdealsMigratedLifecycleFixture()
  const state = seedUpstream(fake, [])
  const demotion = fake.demote(state.cycleId, state.ended.id, [])
  const required = [state.listing, state.upsert, state.fast, state.detail, state.retry, state.monthly, state.ended, demotion].map((value) => value.id)
  const mark = fake.markSucceeded(state.cycleId, demotion.id, required)
  const certify = fake.certify(state.cycleId, mark.id)
  assert.throws(() => fake.refreshCache(state.cycleId, certify.id, { failBeforeCommit: true }), /FAILURE/)
  assert.equal(fake.readCycle(state.cycleId).status, 'certified')
  assert.equal(fake.readCycle(state.cycleId).cache_refreshed_at, undefined)
  assert.equal(fake.effectCount('cache_refresh'), 0)
})
