import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assemblePsdealsCycleManifest,
} from '../scripts/lib/psdeals-evidence-assembly.mjs'
import {
  buildPsdealsArtifactReference,
  buildPsdealsFilterContext,
  sha256PsdealsBytes,
  stablePsdealsEvidenceJson,
} from '../scripts/lib/psdeals-evidence-envelope.mjs'
import {
  buildDetailImportEvidence,
  buildDetailRetryEvidence,
  buildEndedDealsAnalysisEvidence,
  buildFastRefreshAnalysisEvidence,
  buildListingCollectionEvidence,
  buildMonthlyGamesCheckEvidence,
} from '../scripts/lib/psdeals-evidence-producers.mjs'

const CYCLE = 'cycle-evidence-chain-001'
const TOKEN = 'opaque-run-token-7f4a'
const NOW = '2026-07-29T18:00:00.000Z'
const GENERATED_AT = '2026-07-29T17:15:00.000Z'
const URL =
  'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function ref(role, hex, artifactKind = role, overrides = {}) {
  return buildPsdealsArtifactReference({
    role,
    path: `tests/fixtures/psdeals-evidence/${role}.fixture`,
    sha256: hex.repeat(64),
    size_bytes: 10,
    artifact_kind: artifactKind,
    final_state: 'final',
    ...overrides,
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
  return {
    name,
    version: '1',
    code_revision: 'da7938b63506a240374c4f2ad3cfac1b8fca13d0',
  }
}

function context(overrides = {}) {
  return {
    requested_url: URL,
    platforms: ['PS5', 'PS4'],
    content_types: ['games', 'bundles', 'dlc'],
    order: 'best-new-deals',
    ...overrides,
  }
}

function time(startedAt, finishedAt) {
  return {
    started_at: startedAt,
    finished_at: finishedAt,
    generated_at: finishedAt,
  }
}

function evidenceSource(envelope, name) {
  const serialized = stablePsdealsEvidenceJson(envelope)
  return buildPsdealsArtifactReference({
    role: `${name}_evidence`,
    path: `evidence/${name}.json`,
    sha256: sha256PsdealsBytes(serialized),
    size_bytes: Buffer.byteLength(serialized),
    artifact_kind: 'evidence_envelope',
    final_state: 'final',
    local_cycle_id: envelope.local_cycle_id,
    run_token: envelope.run_token,
  })
}

function chain({ includeEnded = false, includeMonthly = false, importFailures = 1 } = {}) {
  const listingJson = ref('listing_json', '1', 'psdeals_listing_json')
  const combined = ref('combined_queue', '2', 'url_queue')
  const failures = ref('detail_failures', '3', 'url_queue')

  const listing = buildListingCollectionEvidence({
    identity: identity(),
    producer: producer('collector'),
    timestamps: time(
      '2026-07-29T17:00:00.000Z',
      '2026-07-29T17:05:00.000Z'
    ),
    context: context(),
    outputs: [listingJson],
    collection: {
      pages_requested: 1,
      pages_completed: 1,
      failed_pages: [],
      termination: 'exact_total_reached',
      stop_reason:
        'unique_items_collected_reached_total_results: unique=2 total=2',
      total_results_detected: 2,
      total_collected: 2,
      unique_ids: 2,
      duplicate_ids: 0,
      partial_artifact_present: false,
    },
  })
  const fast = buildFastRefreshAnalysisEvidence({
    identity: identity(),
    producer: producer('analyzer'),
    timestamps: time(
      '2026-07-29T17:06:00.000Z',
      '2026-07-29T17:07:00.000Z'
    ),
    context: context(),
    inputs: [listingJson],
    outputs: [
      ref('fast_refresh_summary', '4'),
      combined,
      ref('must_refresh_queue', '5', 'url_queue'),
      ref('ps_plus_recheck_queue', '6', 'url_queue'),
      ref('ps_plus_discovery_queue', 'd', 'url_queue'),
      ref('stale_queue', '7', 'url_queue'),
      ref('skipped_queue', '8', 'url_queue'),
    ],
    analysis: {
      must_refresh: { count: 1, reason_counts: { price_mismatch: 1 } },
      ps_plus_recheck: { count: 0, limit: 5, reason_counts: {} },
      ps_plus_discovery: { count: 0, limit: 50, reason_counts: {} },
      stale: { count: 1, limit: 5, reason_counts: { stale_rotation: 1 } },
      skipped: { count: 0 },
      combined_count: 2,
      overlap_count: 0,
      duplicate_urls: 0,
      limits_reached: {
        ps_plus_recheck: false,
        ps_plus_discovery: false,
        stale: false,
      },
    },
  })
  const failedUrls = importFailures
    ? ['https://psdeals.net/us-store/game/2/example-two']
    : []
  const detail = buildDetailImportEvidence({
    identity: identity(),
    producer: producer('importer'),
    timestamps: time(
      '2026-07-29T17:08:00.000Z',
      '2026-07-29T17:10:00.000Z'
    ),
    context: context(),
    inputs: [combined],
    outputs: [ref('detail_import_summary', '9'), failures],
    result: {
      attempted: 2,
      succeeded: 2 - importFailures,
      failed: importFailures,
      skipped: 0,
      failed_urls: failedUrls,
      reported_status: importFailures ? 'partial' : 'succeeded',
      exit_code: 0,
      import_run_id: '11111111-1111-4111-8111-111111111111',
    },
  })
  const detailSource = evidenceSource(detail, 'detail-import')
  const retry = importFailures
    ? buildDetailRetryEvidence({
        identity: identity(),
        producer: producer('retry'),
        timestamps: time(
          '2026-07-29T17:11:00.000Z',
          '2026-07-29T17:12:00.000Z'
        ),
        context: context(),
        inputs: [
          { ...detailSource, role: 'initial_import_evidence' },
          { ...failures, role: 'original_failures' },
        ],
        outputs: [
          ref('detail_retry_summary', 'a'),
          ref('pending_failures', 'b', 'url_queue'),
        ],
        result: {
          attempted: 1,
          succeeded: 1,
          pending_failed: 0,
          pending_failed_urls: [],
          reported_status: 'succeeded',
          exit_code: 0,
          import_run_id: '22222222-2222-4222-8222-222222222222',
        },
      })
    : null
  const ended = includeEnded
    ? buildEndedDealsAnalysisEvidence({
        identity: identity(),
        producer: producer('ended-analyzer'),
        timestamps: time(
          '2026-07-29T17:13:00.000Z',
          '2026-07-29T17:14:00.000Z'
        ),
        context: context(),
        inputs: [listingJson],
        outputs: [ref('ended_deals_analysis', 'c')],
        result: {
          listing_complete_confirmed: true,
          candidates: 0,
          application_performed: false,
          blockers: [],
        },
      })
    : null
  const monthly = includeMonthly
    ? buildMonthlyGamesCheckEvidence({
        identity: identity(),
        producer: producer('monthly-review'),
        timestamps: time(
          '2026-07-29T17:12:30.000Z',
          '2026-07-29T17:13:00.000Z'
        ),
        context: context(),
        outputs: [ref('monthly_games_review', 'd')],
        review: {
          source_type: 'manual_official_source_review',
          source_reference: 'fixture://official-monthly-review',
          procedure: 'compare-active-monthly-allowlist',
          procedure_version: '1',
          result: 'no_changes',
          proposed_changes: [],
          application_performed: false,
        },
      })
    : null

  return [
    { envelope: listing, source_artifact: evidenceSource(listing, 'listing') },
    { envelope: fast, source_artifact: evidenceSource(fast, 'fast') },
    { envelope: detail, source_artifact: detailSource },
    ...(retry
      ? [{ envelope: retry, source_artifact: evidenceSource(retry, 'retry') }]
      : []),
    ...(ended
      ? [{ envelope: ended, source_artifact: evidenceSource(ended, 'ended') }]
      : []),
    ...(monthly
      ? [{ envelope: monthly, source_artifact: evidenceSource(monthly, 'monthly') }]
      : []),
  ]
}

function assemble(records, overrides = {}) {
  return assemblePsdealsCycleManifest(records, {
    now: NOW,
    generated_at: GENERATED_AT,
    ...overrides,
  })
}

function codes(result) {
  return new Set(result.reason_codes)
}

test('assembles a valid listing to analyzer to importer to retry chain', () => {
  const result = assemble(chain())
  assert.equal(result.assembled, true)
  assert.equal(result.manifest.manifest_version, 1)
  assert.equal(result.manifest.identity.local_cycle_id, CYCLE)
  assert.equal(result.manifest.identity.run_token, TOKEN)
  assert.equal(result.manifest.fast_refresh.queues.ps_plus_discovery.limit, 50)
  assert.equal(
    result.manifest.fast_refresh.artifacts.ps_plus_discovery.path,
    'tests/fixtures/psdeals-evidence/ps_plus_discovery_queue.fixture'
  )
  assert.equal(result.evidence_graph.edges.length, 4)
  assert.equal(result.manifest_validation.listing_complete, true)
  assert.equal(result.manifest_validation.detail_complete, true)
})

test('the current manifest validator recognizes the assembled v1 contract', () => {
  const result = assemble(chain({ includeEnded: true }))
  assert.equal(result.manifest_validation.listing_completeness, 'complete')
  assert.equal(result.manifest_validation.monthly_complete, false)
  assert.doesNotMatch(
    result.manifest_validation.reason_codes.join(','),
    /MANIFEST_VERSION_UNSUPPORTED|ARTIFACT_RUN_TOKEN_MISMATCH/
  )
})

test('monthly semantic evidence opens the monthly manifest gate without applying changes', () => {
  const result = assemble(chain({ includeMonthly: true, includeEnded: true }))
  assert.equal(result.assembled, true)
  assert.equal(result.manifest.monthly_games.result, 'no_changes')
  assert.equal(result.manifest.monthly_games.application_performed, false)
  assert.equal(result.manifest_validation.monthly_complete, true)
  assert.equal(result.missing_stages.includes('monthly_games_check'), false)
})

test('missing monthly evidence keeps certification closed', () => {
  const result = assemble(chain())
  assert.equal(result.manifest.monthly_games, null)
  assert.equal(result.manifest_validation.can_certify, false)
  assert.ok(codes(result).has('ASSEMBLY_MONTHLY_EVIDENCE_ABSENT'))
})

test('missing ended-deals evidence keeps demotion closed', () => {
  const result = assemble(chain())
  assert.equal(result.manifest.ended_deals, null)
  assert.equal(result.manifest_validation.can_demote, false)
})

test('missing certification keeps cache refresh closed', () => {
  const result = assemble(chain({ includeEnded: true }))
  assert.equal(result.manifest.identity.remote_cycle_id, null)
  assert.equal(result.manifest.actions.certification.performed, false)
  assert.equal(result.manifest_validation.can_refresh_cache, false)
})

test('rejects a missing required stage', () => {
  const records = chain().filter(
    ({ envelope }) => envelope.evidence_kind !== 'fast_refresh_analysis'
  )
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(result.missing_stages.includes('fast_refresh_analysis'))
})

test('requires retry evidence when initial detail failures exist', () => {
  const records = chain().filter(
    ({ envelope }) => envelope.evidence_kind !== 'detail_retry'
  )
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_RETRY_STAGE_MISSING'))
})

test('rejects evidence from different local cycles', () => {
  const records = chain()
  records[1].envelope.local_cycle_id = 'other-cycle'
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_LOCAL_CYCLE_ID_MISMATCH'))
})

test('rejects evidence from different run tokens', () => {
  const records = chain()
  records[1].envelope.run_token = 'another-token'
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_RUN_TOKEN_MISMATCH'))
})

test('rejects evidence with different filter fingerprints', () => {
  const records = chain()
  records[1].envelope.context = buildPsdealsFilterContext({
    ...context(),
    order: 'most-popular',
  })
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_FILTER_FINGERPRINT_MISMATCH'))
})

test('rejects incompatible stage timestamps', () => {
  const records = chain()
  records[1].envelope.started_at = '2026-07-29T17:04:00.000Z'
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_TIMESTAMP_ORDER_INVALID'))
})

test('rejects duplicate evidence for the same stage', () => {
  const records = chain()
  records.push(clone(records[0]))
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_DUPLICATE_STAGE'))
})

test('rejects a changed listing hash even when filenames are unchanged', () => {
  const records = chain()
  records[1].envelope.inputs.find(
    (artifact) => artifact.role === 'listing_json'
  ).sha256 = 'e'.repeat(64)
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_ARTIFACT_HASH_MISMATCH'))
})

test('rejects a changed combined queue hash', () => {
  const records = chain()
  records[2].envelope.inputs.find(
    (artifact) => artifact.role === 'combined_queue'
  ).sha256 = 'e'.repeat(64)
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_ARTIFACT_HASH_MISMATCH'))
})

test('rejects retry based on another failure-list hash', () => {
  const records = chain()
  records[3].envelope.inputs.find(
    (artifact) => artifact.role === 'original_failures'
  ).sha256 = 'e'.repeat(64)
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_ARTIFACT_HASH_MISMATCH'))
})

test('rejects retry based on another import evidence envelope', () => {
  const records = chain()
  records[3].envelope.inputs.find(
    (artifact) => artifact.role === 'initial_import_evidence'
  ).sha256 = 'e'.repeat(64)
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_SOURCE_EVIDENCE_HASH_MISMATCH'))
})

test('requires the source hash of initial import evidence', () => {
  const records = chain()
  records[2].source_artifact = null
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_SOURCE_EVIDENCE_MISSING'))
})

test('a retry with pending failures cannot assemble as complete', () => {
  const records = chain()
  const retry = records[3].envelope
  retry.payload.pending_failed = 1
  retry.payload.pending_failed_urls = [
    'https://psdeals.net/us-store/game/2/example-two',
  ]
  retry.payload.succeeded = 0
  retry.payload.reported_status = 'partial'
  retry.status = 'partial'
  retry.reason_codes = ['DETAIL_RETRY_FAILURES_REMAIN']
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_PRODUCER_STATUS_INCOMPLETE'))
})

test('legacy untracked evidence stays indeterminate and cannot join by date', () => {
  const records = chain()
  records[0].envelope.mode = 'legacy_untracked'
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_LEGACY_UNTRACKED'))
})

test('nearby timestamps never replace an explicit artifact hash link', () => {
  const records = chain()
  const input = records[1].envelope.inputs.find(
    (artifact) => artifact.role === 'listing_json'
  )
  input.path = records[0].envelope.outputs[0].path
  input.sha256 = 'd'.repeat(64)
  const result = assemble(records)
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_ARTIFACT_HASH_MISMATCH'))
})

test('requires an explicit manifest generation timestamp', () => {
  const result = assemblePsdealsCycleManifest(chain(), { now: NOW })
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_GENERATED_AT_MISSING'))
})

test('rejects a manifest generation timestamp before the evidence chain', () => {
  const result = assemble(chain(), {
    generated_at: '2026-07-29T17:09:00.000Z',
  })
  assert.equal(result.assembled, false)
  assert.ok(codes(result).has('ASSEMBLY_GENERATED_AT_INVALID'))
})

test('a no-failure import does not require retry evidence', () => {
  const result = assemble(chain({ importFailures: 0 }))
  assert.equal(result.assembled, true)
  assert.equal(result.manifest.detail_import.retry.attempted, false)
  assert.equal(result.manifest_validation.detail_complete, true)
})

test('ended-deals analysis remains evidence only and applies no demotion', () => {
  const result = assemble(chain({ includeEnded: true }))
  assert.equal(result.assembled, true)
  assert.equal(result.manifest.ended_deals.applied, 0)
  assert.equal(result.manifest.actions.demotion.performed, false)
})
