import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { buildAnalyzerFastRefreshEvidence } from '../scripts/analyze-psdeals-discounts-fast-refresh-v1.mjs'
import { buildEndedDealsEvidenceForAnalyzer } from '../scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs'
import { buildCollectorListingEvidence } from '../scripts/collect-psdeals-listing-edge-live-cdp.mjs'
import { buildImporterDetailEvidence } from '../scripts/import-psdeals-detail-local.mjs'
import { buildPsdealsArtifactReference } from '../scripts/lib/psdeals-evidence-envelope.mjs'
import {
  getPsdealsEvidenceCliOptions,
} from '../scripts/lib/psdeals-evidence-runtime.mjs'
import { validatePsdealsProducerEvidence } from '../scripts/lib/psdeals-evidence-producers.mjs'

const NOW = '2026-07-29T18:00:00.000Z'
const CYCLE = 'cycle-integration-fixture'
const TOKEN = 'shared-opaque-run-token'
const URL =
  'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'

function ref(role, path, artifactKind = 'json', options = {}) {
  return buildPsdealsArtifactReference({
    role,
    path,
    sha256: options.sha256 || 'a'.repeat(64),
    size_bytes: options.size_bytes ?? 10,
    artifact_kind: artifactKind,
    final_state: options.final_state || 'final',
    local_cycle_id: options.local_cycle_id,
    run_token: options.run_token,
  })
}

function identity(overrides = {}) {
  return {
    local_cycle_id: CYCLE,
    run_token: TOKEN,
    region_code: 'us',
    storefront: 'playstation',
    mode: 'offline_fixture',
    ...overrides,
  }
}

function producer(name) {
  return { name, version: '1', code_revision: 'a'.repeat(40) }
}

function times(offset = 0) {
  const start = new Date(Date.parse('2026-07-29T17:00:00.000Z') + offset)
  const finish = new Date(start.getTime() + 60_000)
  return {
    started_at: start.toISOString(),
    finished_at: finish.toISOString(),
    generated_at: new Date(finish.getTime() + 1_000).toISOString(),
  }
}

function context() {
  return {
    requested_url: URL,
    platforms: ['PS5', 'PS4'],
    content_types: ['games', 'bundles', 'dlc'],
    order: 'best-new-deals',
    limits: {},
  }
}

test('collector uses the real listing evidence builder', () => {
  const evidence = buildCollectorListingEvidence({
    identity: identity(),
    producer: producer('collector'),
    timestamps: times(),
    context: context(),
    outputs: [ref('listing_json', 'data/listing.json', 'listing_json')],
    listing_payload: {
      pages_requested: 1,
      pages_processed: 1,
      pages_failed: 0,
      failed_pages: [],
      stop_reason:
        'unique_items_collected_reached_total_results: unique=2 total=2',
      total_results_detected: 2,
      unique_items_collected: 2,
      page_summaries: [
        { raw_item_count: 2, new_unique_count: 2, duplicate_count: 0 },
      ],
    },
  })
  assert.equal(evidence.status, 'succeeded')
  assert.equal(evidence.payload.total_collected, 2)
  assert.equal(validatePsdealsProducerEvidence(evidence, { now: NOW }).valid, true)
})

test('collector keeps a failed page as failed evidence', () => {
  const evidence = buildCollectorListingEvidence({
    identity: identity(),
    producer: producer('collector'),
    timestamps: times(),
    context: context(),
    outputs: [ref('listing_json', 'data/listing.json', 'listing_json')],
    listing_payload: {
      pages_requested: 2,
      pages_processed: 1,
      pages_failed: 1,
      failed_pages: [{ page_number: 2, error: 'timeout' }],
      stop_reason: 'failed_page: page=2',
      total_results_detected: 2,
      unique_items_collected: 2,
      page_summaries: [
        { raw_item_count: 2, new_unique_count: 2, duplicate_count: 0 },
      ],
    },
  })
  assert.equal(evidence.status, 'failed')
})

test('analyzer uses the real fast-refresh evidence builder', () => {
  const listingInput = ref(
    'listing_json',
    'data/listing.json',
    'listing_json'
  )
  const row = (id, reason) => ({
    listing: {
      psdeals_id: id,
      psdeals_url: `https://psdeals.net/us-store/game/${id}/fixture`,
    },
    reasons: [reason],
  })
  const evidence = buildAnalyzerFastRefreshEvidence({
    identity: identity(),
    producer: producer('analyzer'),
    timestamps: times(120_000),
    context: context(),
    listing_input: listingInput,
    outputs: [
      ref('fast_refresh_summary', 'data/summary.json'),
      ref('combined_queue', 'data/combined.txt', 'url_queue'),
      ref('must_refresh_queue', 'data/must.txt', 'url_queue'),
      ref('ps_plus_recheck_queue', 'data/plus.txt', 'url_queue'),
      ref('stale_queue', 'data/stale.txt', 'url_queue'),
      ref('skipped_queue', 'data/skipped.txt', 'url_queue'),
    ],
    queues: {
      must_refresh: [row(1, 'new_item')],
      ps_plus_recheck: [],
      stale: [row(2, 'stale_rotation')],
      skipped: [],
      combined: [row(1, 'new_item'), row(2, 'stale_rotation')],
      ps_plus_recheck_limit: 5,
      stale_limit: 5,
    },
  })
  assert.equal(evidence.status, 'succeeded')
  assert.equal(evidence.payload.combined_count, 2)
  assert.deepEqual(evidence.payload.must_refresh.reason_counts, { new_item: 1 })
})

test('analyzer records overlap instead of hiding it', () => {
  const row = {
    listing: {
      psdeals_id: 1,
      psdeals_url: 'https://psdeals.net/us-store/game/1/fixture',
    },
    reasons: ['new_item'],
  }
  const evidence = buildAnalyzerFastRefreshEvidence({
    identity: identity(),
    producer: producer('analyzer'),
    timestamps: times(),
    context: context(),
    listing_input: ref('listing_json', 'data/listing.json'),
    outputs: [
      ref('fast_refresh_summary', 'data/summary.json'),
      ref('combined_queue', 'data/combined.txt'),
      ref('must_refresh_queue', 'data/must.txt'),
      ref('ps_plus_recheck_queue', 'data/plus.txt'),
      ref('stale_queue', 'data/stale.txt'),
      ref('skipped_queue', 'data/skipped.txt'),
    ],
    queues: {
      must_refresh: [row],
      ps_plus_recheck: [row],
      stale: [],
      skipped: [],
      combined: [row],
      ps_plus_recheck_limit: 5,
      stale_limit: 5,
    },
  })
  assert.equal(evidence.status, 'partial')
  assert.equal(evidence.payload.overlap_count, 1)
})

test('importer uses the real detail-import evidence builder', () => {
  const evidence = buildImporterDetailEvidence({
    evidence_kind: 'detail_import',
    identity: identity(),
    producer: producer('importer'),
    timestamps: times(),
    context: context(),
    inputs: [ref('combined_queue', 'data/combined.txt', 'url_queue')],
    outputs: [
      ref('detail_import_summary', 'data/import-summary.json'),
      ref('detail_failures', 'data/failures.txt', 'url_queue'),
    ],
    result: {
      attempted: 2,
      succeeded: 2,
      failed: 0,
      skipped: 0,
      failed_urls: [],
      reported_status: 'succeeded',
      exit_code: 0,
      import_run_id: '11111111-1111-4111-8111-111111111111',
    },
  })
  assert.equal(evidence.evidence_kind, 'detail_import')
  assert.equal(evidence.status, 'succeeded')
})

test('importer uses the same real adapter for retry evidence', () => {
  const evidence = buildImporterDetailEvidence({
    evidence_kind: 'detail_retry',
    identity: identity(),
    producer: producer('retry'),
    timestamps: times(),
    context: context(),
    inputs: [
      ref('initial_import_evidence', 'data/import-evidence.json', 'evidence_envelope', {
        local_cycle_id: CYCLE,
        run_token: TOKEN,
      }),
      ref('original_failures', 'data/failures.txt', 'url_queue'),
    ],
    outputs: [
      ref('detail_retry_summary', 'data/retry-summary.json'),
      ref('pending_failures', 'data/pending.txt', 'url_queue'),
    ],
    result: {
      attempted: 1,
      succeeded: 1,
      pending_failed: 0,
      pending_failed_urls: [],
      reported_status: 'succeeded',
      exit_code: 0,
    },
  })
  assert.equal(evidence.evidence_kind, 'detail_retry')
  assert.equal(evidence.status, 'succeeded')
})

test('ended-deals adapter always records application_performed false', () => {
  const evidence = buildEndedDealsEvidenceForAnalyzer({
    identity: identity(),
    producer: producer('ended'),
    timestamps: times(),
    context: context(),
    inputs: [ref('listing_json', 'data/listing.json')],
    outputs: [ref('ended_deals_analysis', 'data/ended.json')],
    listing_complete_confirmed: true,
    candidates: 3,
  })
  assert.equal(evidence.payload.application_performed, false)
  assert.equal(evidence.status, 'succeeded')
})

test('tracked producer CLI identity must be supplied as one unit', () => {
  assert.throws(
    () => getPsdealsEvidenceCliOptions(['--local-cycle-id=cycle-only']),
    /EVIDENCE_IDENTITY_INCOMPLETE/
  )
  assert.deepEqual(
    getPsdealsEvidenceCliOptions([]),
    {
      tracked: false,
      local_cycle_id: null,
      run_token: null,
      evidence_output: null,
      code_revision: null,
      producer_version: '1',
      mode: 'real_recorded',
    }
  )
})

test('tracked producer CLI preserves explicit opaque identity', () => {
  const value = getPsdealsEvidenceCliOptions([
    `--local-cycle-id=${CYCLE}`,
    `--run-token=${TOKEN}`,
    '--evidence-output=data/evidence.json',
  ])
  assert.equal(value.tracked, true)
  assert.equal(value.local_cycle_id, CYCLE)
  assert.equal(value.run_token, TOKEN)
})

test('collector source exposes explicit tracked artifact paths for operational specs', async () => {
  const source = await fs.readFile(
    path.resolve('scripts/collect-psdeals-listing-edge-live-cdp.mjs'),
    'utf8'
  )
  assert.match(source, /getArgValue\('output-json'\)/)
  assert.match(source, /tracked collection requires explicit --output-json and --output-txt/)
})

test('importing producer modules exposes adapters without executing main', () => {
  assert.equal(typeof buildCollectorListingEvidence, 'function')
  assert.equal(typeof buildAnalyzerFastRefreshEvidence, 'function')
  assert.equal(typeof buildImporterDetailEvidence, 'function')
  assert.equal(typeof buildEndedDealsEvidenceForAnalyzer, 'function')
})
