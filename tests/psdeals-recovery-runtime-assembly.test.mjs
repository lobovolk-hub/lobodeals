import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  assemblePsdealsRecoveryRuntimeLocal,
} from '../scripts/lib/psdeals-recovery-runtime-assembly.mjs'
import {
  initializePsdealsCycleWorkspace,
} from '../scripts/lib/psdeals-cycle-workspace.mjs'
import {
  requireLinkedPsdealsEvidence,
} from '../scripts/lib/psdeals-evidence-runtime.mjs'

const HEAD = '930ea6e688641e03d776896789939addf142b15c'
const EXPECTED = {
  pages: 2,
  raw_positions: 4,
  unique_items: 3,
  duplicates_removed: 1,
  new_urls: 2,
}
const RECENTLY_ADDED =
  'https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'
const DISCOUNTS =
  'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function fixture() {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'lobodeals-recovery-runtime-assembly-')
  )
  const workspace = await initializePsdealsCycleWorkspace({
    cycles_root: path.join(projectRoot, 'data', 'cycles'),
    mode: 'operational',
    code_revision: HEAD,
    context: {
      requested_url: DISCOUNTS,
      platforms: ['PS5', 'PS4'],
      content_types: ['games', 'bundles', 'dlc'],
      order: 'best-new-deals',
    },
    now: () => new Date('2026-08-04T18:00:00.000Z'),
    generate_local_cycle_id: () => 'local-cycle-recovery-runtime-fixture',
    generate_run_token: () => 'run_recovery_runtime_fixture_token_0001',
  })
  const listing = {
    items: [
      {
        psdeals_id: 101,
        psdeals_url: 'https://psdeals.net/us-store/game/101/a',
        first_seen_page: 1,
      },
      {
        psdeals_id: 102,
        psdeals_url: 'https://psdeals.net/us-store/game/102/b',
        first_seen_page: 1,
      },
      {
        psdeals_id: 103,
        psdeals_url: 'https://psdeals.net/us-store/game/103/c',
        first_seen_page: 2,
      },
    ],
    page_summaries: [
      { page_number: 1 },
      { page_number: 2 },
    ],
    pages_processed: 2,
    pages_failed: 0,
    failed_pages: [],
    stop_reason: 'final_short_page',
    auto_stop_reason: 'final_short_page',
    total_results_detected: 4,
    reconstruction: {
      pages_reconstructed: 2,
      raw_items_before_deduplication: 4,
      unique_items_after_deduplication: 3,
      duplicate_occurrences_removed: 1,
    },
  }
  const listingBytes = Buffer.from(`${JSON.stringify(listing, null, 2)}\n`)
  const queueBytes = Buffer.from(
    'https://psdeals.net/us-store/game/101/a\n' +
    'https://psdeals.net/us-store/game/102/b\n'
  )
  const listingPath = path.join(
    workspace.root_dir,
    'artifacts',
    'recently-added-listing.json'
  )
  const queuePath = path.join(
    workspace.root_dir,
    'artifacts',
    'recently-added-new-urls.txt'
  )
  await fs.writeFile(listingPath, listingBytes)
  await fs.writeFile(queuePath, queueBytes)
  const config = {
    recovery_config_version: 1,
    classification: 'RECOVERY_INPUTS_PREPARED_LOCAL_ONLY',
    prepared_at: '2026-08-04T18:00:00.000Z',
    project_root: projectRoot,
    project_ref: 'vlxkoprpobfevxefizwr',
    code_head: HEAD,
    run_intent_id: workspace.identity.local_cycle_id,
    workspace_dir: workspace.root_dir,
    source_urls: {
      recently_added: RECENTLY_ADDED,
      discounts: DISCOUNTS,
    },
    adopted_artifacts: {
      recently_added_listing: {
        workspace_path: listingPath,
        sha256: hash(listingBytes),
        pages: 2,
        raw_positions: 4,
        unique_items: 3,
        duplicates_removed: 1,
      },
      recently_added_new_urls: {
        workspace_path: queuePath,
        sha256: hash(queueBytes),
        count: 2,
      },
    },
    execution_limits: {
      detail_retry_max_attempts: 1,
      use_safe_demotion_rpc: 'apply_psdeals_ended_deals_v2',
      use_cache_rpc: 'refresh_catalog_public_cache_v16',
      deploy_allowed: false,
      scheduler_allowed: false,
      second_cycle_allowed: false,
    },
    remote_writes_executed: 0,
    edge_opened: false,
    ready_for_runtime_assembly: true,
  }
  const configPath = path.join(workspace.root_dir, 'state', 'recovery-inputs.json')
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
  return { projectRoot, workspace, configPath, queuePath }
}

test('local recovery assembly builds a valid adopted parent chain and gated 23-stage plan', async () => {
  const value = await fixture()
  const result = await assemblePsdealsRecoveryRuntimeLocal({
    project_root: value.projectRoot,
    recovery_config: value.configPath,
    expected_counts: EXPECTED,
  })

  assert.equal(result.assembled, true)
  assert.equal(result.classification, 'LOCAL_ASSEMBLY_COMPLETE_LIVE_GATES_CLOSED')
  assert.equal(result.combined_queue_count, 2)
  assert.equal(result.skipped_count, 1)
  assert.equal(result.stage_count, 23)
  assert.equal(result.live_execution_enabled, false)
  assert.equal(result.remote_reads_executed, 0)
  assert.equal(result.remote_writes_executed, 0)
  assert.equal(result.edge_opened, false)

  const linked = await requireLinkedPsdealsEvidence({
    evidence_path: result.fast_refresh_evidence,
    expected_kind: 'fast_refresh_analysis',
    local_cycle_id: value.workspace.identity.local_cycle_id,
    run_token: value.workspace.identity.run_token,
    now: '2026-08-04T18:00:00.000Z',
    root_dir: value.projectRoot,
  })
  assert.equal(linked.validation.valid, true)
  assert.equal(linked.envelope.status, 'succeeded')
  assert.equal(linked.envelope.payload.combined_count, 2)

  const plan = JSON.parse(await fs.readFile(result.plan_file, 'utf8'))
  const importArgs = plan.process_templates.import_recently_added.args
  assert.ok(importArgs.includes('--execution-mode=operational'))
  assert.ok(importArgs.includes('--project-ref=vlxkoprpobfevxefizwr'))
  assert.ok(importArgs.includes('--confirm-remote-action=EXECUTE_IMPORT_DETAILS'))
  assert.ok(importArgs.includes('--authorization-id=<IMPORT_AUTHORIZATION_ID>'))
  assert.ok(
    plan.process_templates.import_recently_added.allowed_env.includes(
      'LOBODEALS_REMOTE_EXECUTION'
    )
  )
  assert.equal(plan.restrictions.detail_retry_max_attempts, 1)
  assert.equal(plan.restrictions.legacy_demotion_v1_forbidden, true)
  assert.equal(plan.restrictions.cache_v15_forbidden, true)

  const repeated = await assemblePsdealsRecoveryRuntimeLocal({
    project_root: value.projectRoot,
    recovery_config: value.configPath,
    expected_counts: EXPECTED,
  })
  assert.equal(repeated.plan_file, result.plan_file)

  await fs.rm(value.projectRoot, { recursive: true, force: true })
})

test('local recovery assembly rejects a changed adopted queue before writing a plan', async () => {
  const value = await fixture()
  await fs.appendFile(
    value.queuePath,
    'https://psdeals.net/us-store/game/103/c\n'
  )

  await assert.rejects(
    assemblePsdealsRecoveryRuntimeLocal({
      project_root: value.projectRoot,
      recovery_config: value.configPath,
      expected_counts: EXPECTED,
    }),
    /RECENTLY_ADDED_QUEUE_HASH_MISMATCH/
  )

  await fs.rm(value.projectRoot, { recursive: true, force: true })
})
