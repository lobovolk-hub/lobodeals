import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createPsdealsDailyProductionAdapters,
} from '../scripts/lib/psdeals-daily-production-adapters.mjs'

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobodeals-adopt-recently-added-'))
  const workspace = { root_dir: root }
  const listingPath = path.join(root, 'recently-added-listing.json')
  const queuePath = path.join(root, 'recently-added-new-urls.txt')
  const listing = {
    items: [
      { psdeals_id: 101, psdeals_url: 'https://psdeals.net/us-store/game-a' },
      { psdeals_id: 102, psdeals_url: 'https://psdeals.net/us-store/game-b' },
    ],
    page_summaries: [{ page_number: 1 }],
    pages_processed: 1,
    pages_failed: 0,
    failed_pages: [],
    stop_reason: 'final_short_page',
    auto_stop_reason: 'final_short_page',
    total_results_detected: 3,
    reconstruction: {
      pages_reconstructed: 1,
      raw_items_before_deduplication: 3,
      unique_items_after_deduplication: 2,
      duplicate_occurrences_removed: 1,
    },
  }
  const listingBytes = Buffer.from(`${JSON.stringify(listing, null, 2)}\n`)
  const queueBytes = Buffer.from(
    'https://psdeals.net/us-store/game-a\nhttps://psdeals.net/us-store/game-b\n'
  )
  await fs.writeFile(listingPath, listingBytes)
  await fs.writeFile(queuePath, queueBytes)
  return {
    root,
    workspace,
    listingPath,
    queuePath,
    listingHash: sha256(listingBytes),
    queueHash: sha256(queueBytes),
  }
}

test('recently-added collection and analysis adopt verified workspace artifacts without processes', async () => {
  const value = await fixture()
  const adapters = createPsdealsDailyProductionAdapters()
  let processCalls = 0
  const ports = {
    run_process: async () => {
      processCalls += 1
      throw new Error('process must not run')
    },
  }

  const collected = await adapters.collect_recently_added({
    previous_stage_receipt_id: null,
    run_identity: { run_intent_id: 'local-cycle-adopt-recently-added' },
    production_inputs: {
      collect_recently_added: {
        adopt_existing: true,
        workspace: value.workspace,
        authorization: {
          permission: 'allow_collect_listing',
          authorization_id: 'authorization-adopt-listing',
        },
        adopted_listing: {
          workspace_path: value.listingPath,
          sha256: value.listingHash,
          counts: {
            pages: 1,
            raw_positions: 3,
            unique_items: 2,
            duplicates_removed: 1,
          },
        },
      },
    },
    production_ports: ports,
  })

  assert.equal(collected.status, 'succeeded')
  assert.equal(collected.evidence.adopted, true)
  assert.equal(collected.evidence.collection_repeated, false)
  assert.equal(collected.evidence.unique_items, 2)
  assert.equal(collected.external_action_performed, false)

  const analyzed = await adapters.analyze_recently_added({
    previous_stage_receipt_id: collected.accepted_parent_receipt_id,
    run_identity: { run_intent_id: 'local-cycle-adopt-recently-added' },
    production_inputs: {
      analyze_recently_added: {
        adopt_existing: true,
        workspace: value.workspace,
        authorization: {
          permission: 'allow_analyze_detail_candidates',
          authorization_id: 'authorization-adopt-queue',
        },
        adopted_queue: {
          workspace_path: value.queuePath,
          sha256: value.queueHash,
          count: 2,
        },
      },
    },
    production_ports: ports,
  })

  assert.equal(analyzed.status, 'succeeded')
  assert.equal(analyzed.evidence.adopted, true)
  assert.equal(analyzed.evidence.analysis_repeated, false)
  assert.equal(analyzed.evidence.count, 2)
  assert.equal(analyzed.external_action_performed, false)
  assert.equal(processCalls, 0)

  await fs.rm(value.root, { recursive: true, force: true })
})

test('adoption fails closed on a changed artifact and never starts a process', async () => {
  const value = await fixture()
  const adapters = createPsdealsDailyProductionAdapters()
  let processCalls = 0

  const result = await adapters.collect_recently_added({
    previous_stage_receipt_id: null,
    run_identity: { run_intent_id: 'local-cycle-adopt-hash-mismatch' },
    production_inputs: {
      collect_recently_added: {
        adopt_existing: true,
        workspace: value.workspace,
        authorization: {
          permission: 'allow_collect_listing',
          authorization_id: 'authorization-adopt-hash-mismatch',
        },
        adopted_listing: {
          workspace_path: value.listingPath,
          sha256: '0'.repeat(64),
          counts: {
            pages: 1,
            raw_positions: 3,
            unique_items: 2,
            duplicates_removed: 1,
          },
        },
      },
    },
    production_ports: {
      run_process: async () => {
        processCalls += 1
        throw new Error('process must not run')
      },
    },
  })

  assert.equal(result.status, 'failed')
  assert.deepEqual(result.blockers, ['adopted_recently_added_listing_hash_mismatch'])
  assert.equal(result.external_action_performed, false)
  assert.equal(processCalls, 0)

  await fs.rm(value.root, { recursive: true, force: true })
})
