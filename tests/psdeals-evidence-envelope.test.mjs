import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import {
  PSDEALS_EVIDENCE_VERSION,
  buildPsdealsArtifactReference,
  buildPsdealsFilterContext,
  validatePsdealsEvidenceEnvelope,
} from '../scripts/lib/psdeals-evidence-envelope.mjs'
import {
  inspectPsdealsArtifact,
  verifyPsdealsArtifactReference,
  writePsdealsEvidenceJsonAtomic,
} from '../scripts/lib/psdeals-evidence-io.mjs'
import {
  buildDetailImportEvidence,
  buildDetailRetryEvidence,
  buildEndedDealsAnalysisEvidence,
  buildFastRefreshAnalysisEvidence,
  buildListingCollectionEvidence,
  validatePsdealsProducerEvidence,
} from '../scripts/lib/psdeals-evidence-producers.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'psdeals-evidence')
const NOW = '2026-07-29T18:00:00.000Z'
const CYCLE = 'cycle-evidence-fixture'
const TOKEN = 'opaque-run-correlation-fixture'
const URL =
  'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'

let artifacts
let temporaryDirectory

async function artifact(fileName, role, artifactKind = 'text') {
  return inspectPsdealsArtifact({
    root_dir: ROOT,
    file_path: path.join(FIXTURE_DIR, fileName),
    role,
    artifact_kind: artifactKind,
    final_state: 'final',
  })
}

before(async () => {
  artifacts = {
    listing: await artifact('listing.json', 'listing_json', 'listing_json'),
    combined: await artifact('combined.txt', 'combined_queue', 'url_queue'),
    must: await artifact('must.txt', 'must_refresh_queue', 'url_queue'),
    psPlus: await artifact('ps-plus.txt', 'ps_plus_recheck_queue', 'url_queue'),
    stale: await artifact('stale.txt', 'stale_queue', 'url_queue'),
    skipped: await artifact('skipped.txt', 'skipped_queue', 'url_queue'),
    fastSummary: await artifact(
      'fast-refresh-summary.json',
      'fast_refresh_summary',
      'fast_refresh_summary'
    ),
    importSummary: await artifact(
      'detail-import-summary.json',
      'detail_import_summary',
      'detail_import_summary'
    ),
    failures: await artifact(
      'detail-failures.txt',
      'detail_failures',
      'url_queue'
    ),
    retrySummary: await artifact(
      'detail-retry-summary.json',
      'detail_retry_summary',
      'detail_retry_summary'
    ),
    pending: await artifact(
      'pending-failures.txt',
      'pending_failures',
      'url_queue'
    ),
    ended: await artifact(
      'ended-deals.json',
      'ended_deals_analysis',
      'ended_deals_analysis'
    ),
  }
  temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'lobodeals-evidence-test-')
  )
})

after(async () => {
  if (temporaryDirectory) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  }
})

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
    code_revision: '75bc916b48a10e1fdcd5c425dfcda40df8d233f8',
  }
}

function timestamps(overrides = {}) {
  return {
    started_at: '2026-07-29T17:00:00.000Z',
    finished_at: '2026-07-29T17:05:00.000Z',
    generated_at: '2026-07-29T17:05:01.000Z',
    ...overrides,
  }
}

function context(overrides = {}) {
  return {
    requested_url: URL,
    platforms: ['PS5', 'PS4'],
    content_types: ['games', 'bundles', 'dlc'],
    order: 'best-new-deals',
    limits: { pages: 1 },
    ...overrides,
  }
}

function validListing() {
  return buildListingCollectionEvidence({
    identity: identity(),
    producer: producer('collect-psdeals-listing-edge-live-cdp'),
    timestamps: timestamps(),
    context: context(),
    outputs: [artifacts.listing],
    collection: {
      pages_requested: 1,
      pages_completed: 1,
      failed_pages: [],
      termination: 'exact_total_reached',
      stop_reason: 'unique_items_collected_reached_total_results: unique=2 total=2',
      total_results_detected: 2,
      total_collected: 2,
      unique_ids: 2,
      duplicate_ids: 0,
      partial_artifact_present: false,
    },
  })
}

function validFastRefresh() {
  return buildFastRefreshAnalysisEvidence({
    identity: identity(),
    producer: producer('analyze-psdeals-discounts-fast-refresh-v1'),
    timestamps: timestamps({
      started_at: '2026-07-29T17:06:00.000Z',
      finished_at: '2026-07-29T17:07:00.000Z',
      generated_at: '2026-07-29T17:07:01.000Z',
    }),
    context: context(),
    inputs: [artifacts.listing],
    outputs: [
      artifacts.fastSummary,
      artifacts.combined,
      artifacts.must,
      artifacts.psPlus,
      artifacts.stale,
      artifacts.skipped,
    ],
    analysis: {
      must_refresh: { count: 1, reason_counts: { new_item: 1 } },
      ps_plus_recheck: { count: 0, limit: 5, reason_counts: {} },
      stale: { count: 1, limit: 5, reason_counts: { stale_rotation: 1 } },
      skipped: { count: 0 },
      combined_count: 2,
      overlap_count: 0,
      duplicate_urls: 0,
      limits_reached: { ps_plus_recheck: false, stale: false },
    },
  })
}

function validImport() {
  return buildDetailImportEvidence({
    identity: identity(),
    producer: producer('import-psdeals-detail-local'),
    timestamps: timestamps({
      started_at: '2026-07-29T17:08:00.000Z',
      finished_at: '2026-07-29T17:10:00.000Z',
      generated_at: '2026-07-29T17:10:01.000Z',
    }),
    context: context(),
    inputs: [artifacts.combined],
    outputs: [
      artifacts.importSummary,
      { ...artifacts.pending, role: 'detail_failures' },
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
}

function evidenceReference(role = 'initial_import_evidence') {
  return buildPsdealsArtifactReference({
    role,
    path: 'tests/fixtures/psdeals-evidence/import-evidence.json',
    sha256: 'a'.repeat(64),
    size_bytes: 100,
    artifact_kind: 'evidence_envelope',
    final_state: 'final',
    local_cycle_id: CYCLE,
    run_token: TOKEN,
  })
}

test('builds and validates a valid generic envelope', () => {
  const value = validListing()
  const result = validatePsdealsEvidenceEnvelope(value, { now: NOW })
  assert.equal(value.evidence_version, PSDEALS_EVIDENCE_VERSION)
  assert.equal(result.valid, true)
})

test('rejects an unknown evidence version', () => {
  const value = validListing()
  value.evidence_version = 999
  assert.match(
    validatePsdealsEvidenceEnvelope(value, { now: NOW }).reason_codes.join(','),
    /EVIDENCE_VERSION_UNSUPPORTED/
  )
})

test('rejects an unknown evidence kind', () => {
  const value = validListing()
  value.evidence_kind = 'mystery'
  assert.equal(validatePsdealsEvidenceEnvelope(value, { now: NOW }).valid, false)
})

test('requires local_cycle_id', () => {
  const value = validListing()
  delete value.local_cycle_id
  assert.match(
    validatePsdealsEvidenceEnvelope(value, { now: NOW }).reason_codes.join(','),
    /EVIDENCE_IDENTITY_MISSING/
  )
})

test('requires run_token', () => {
  const value = validListing()
  delete value.run_token
  assert.match(
    validatePsdealsEvidenceEnvelope(value, { now: NOW }).reason_codes.join(','),
    /EVIDENCE_RUN_TOKEN_MISSING/
  )
})

test('rejects a non-US region', () => {
  const value = validListing()
  value.region_code = 'ca'
  assert.equal(validatePsdealsEvidenceEnvelope(value, { now: NOW }).valid, false)
})

test('rejects a non-PlayStation storefront', () => {
  const value = validListing()
  value.storefront = 'xbox'
  assert.equal(validatePsdealsEvidenceEnvelope(value, { now: NOW }).valid, false)
})

test('rejects inverted timestamps', () => {
  const value = validListing()
  value.finished_at = '2026-07-29T16:59:00.000Z'
  assert.match(
    validatePsdealsEvidenceEnvelope(value, { now: NOW }).reason_codes.join(','),
    /EVIDENCE_TIMESTAMPS_INVERTED/
  )
})

test('rejects a future timestamp outside tolerance', () => {
  const value = validListing()
  value.generated_at = '2026-07-30T17:05:01.000Z'
  assert.match(
    validatePsdealsEvidenceEnvelope(value, { now: NOW }).reason_codes.join(','),
    /EVIDENCE_TIMESTAMP_FUTURE/
  )
})

test('rejects a malformed artifact hash', () => {
  const value = validListing()
  value.outputs[0].sha256 = 'bad'
  assert.match(
    validatePsdealsEvidenceEnvelope(value, { now: NOW }).reason_codes.join(','),
    /EVIDENCE_ARTIFACT_HASH_INVALID/
  )
})

test('detects artifact bytes that no longer match evidence', async () => {
  const bad = { ...artifacts.listing, sha256: 'b'.repeat(64) }
  const result = await verifyPsdealsArtifactReference(bad, { root_dir: ROOT })
  assert.equal(result.valid, false)
  assert.equal(result.code, 'ARTIFACT_BYTES_MISMATCH')
})

test('permits compatible extension fields', () => {
  const value = validListing()
  value.extensions = { future_metric: 1 }
  assert.equal(validatePsdealsEvidenceEnvelope(value, { now: NOW }).valid, true)
})

test('preserves a structurally valid partial status', () => {
  const value = buildListingCollectionEvidence({
    identity: identity(),
    producer: producer('collector'),
    timestamps: timestamps(),
    context: context(),
    outputs: [artifacts.listing],
    collection: {
      pages_requested: 2,
      pages_completed: 1,
      failed_pages: [],
      termination: 'safety_cap',
      total_results_detected: 3,
      total_collected: 2,
      unique_ids: 2,
      duplicate_ids: 0,
      partial_artifact_present: false,
    },
  })
  assert.equal(value.status, 'partial')
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, true)
})

test('preserves a structurally valid failed status', () => {
  const value = buildListingCollectionEvidence({
    identity: identity(),
    producer: producer('collector'),
    timestamps: timestamps(),
    context: context(),
    outputs: [artifacts.listing],
    errors: ['page failed'],
    collection: {
      pages_requested: 2,
      pages_completed: 1,
      failed_pages: [{ page_number: 2 }],
      termination: 'failed_page',
      total_results_detected: 3,
      total_collected: 2,
      unique_ids: 2,
      duplicate_ids: 0,
      partial_artifact_present: false,
    },
  })
  assert.equal(value.status, 'failed')
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, true)
})

test('fixtures and references contain no personal absolute paths or secrets', async () => {
  const files = await fs.readdir(FIXTURE_DIR)
  for (const fileName of files) {
    const content = await fs.readFile(path.join(FIXTURE_DIR, fileName), 'utf8')
    assert.doesNotMatch(content, /[A-Z]:\\|service_role|SUPABASE_SECRET|cookie/i)
  }
  assert.doesNotMatch(artifacts.listing.path, /^[A-Z]:/i)
})

test('rejects an absolute artifact path', () => {
  const value = validListing()
  value.outputs[0].path = 'D:/private/listing.json'
  assert.match(
    validatePsdealsEvidenceEnvelope(value, { now: NOW }).reason_codes.join(','),
    /EVIDENCE_ARTIFACT_PATH_NOT_PORTABLE/
  )
})

test('rejects sensitive fields', () => {
  const value = validListing()
  value.payload.cookie = 'not-allowed'
  assert.match(
    validatePsdealsEvidenceEnvelope(value, { now: NOW }).reason_codes.join(','),
    /EVIDENCE_SENSITIVE_FIELD_PRESENT/
  )
})

test('rejects explicit undefined values instead of converting them to null', () => {
  const value = validListing()
  value.payload.accidental = undefined
  assert.match(
    validatePsdealsEvidenceEnvelope(value, { now: NOW }).reason_codes.join(','),
    /EVIDENCE_UNDEFINED_VALUE_PRESENT/
  )
})

test('normalizes filters and preserves PS5, PS4 canonical order', () => {
  const value = buildPsdealsFilterContext({
    requested_url: URL,
    platforms: ['ps4', 'PS5', 'ps4'],
    content_types: ['dlc', 'games', 'bundles'],
  })
  assert.deepEqual(value.platforms, ['PS5', 'PS4'])
  assert.deepEqual(value.content_types, ['games', 'bundles', 'dlc'])
})

test('validates a complete listing collection', () => {
  const value = validListing()
  assert.equal(value.status, 'succeeded')
  assert.equal(value.payload.collection_result, 'complete')
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, true)
})

test('a failed listing page cannot produce succeeded evidence', () => {
  const input = validListing()
  input.payload.failed_pages = [{ page_number: 1 }]
  assert.equal(validatePsdealsProducerEvidence(input, { now: NOW }).valid, false)
})

test('an indeterminate listing termination remains observable', () => {
  const value = buildListingCollectionEvidence({
    identity: identity(),
    producer: producer('collector'),
    timestamps: timestamps(),
    context: context(),
    outputs: [],
    collection: {
      pages_requested: 1,
      pages_completed: 1,
      failed_pages: [],
      termination: 'unknown',
      total_results_detected: 2,
      total_collected: 2,
      unique_ids: 2,
      duplicate_ids: 0,
      partial_artifact_present: false,
    },
  })
  assert.equal(value.status, 'indeterminate')
  assert.match(value.reason_codes.join(','), /LISTING_TERMINATION_NOT_PROVEN/)
})

test('a .partial listing artifact cannot produce complete evidence', () => {
  const partial = { ...artifacts.listing, final_state: 'partial' }
  const value = buildListingCollectionEvidence({
    identity: identity(),
    producer: producer('collector'),
    timestamps: timestamps(),
    context: context(),
    outputs: [partial],
    collection: {
      pages_requested: 1,
      pages_completed: 1,
      failed_pages: [],
      termination: 'exact_total_reached',
      total_results_detected: 2,
      total_collected: 2,
      unique_ids: 2,
      duplicate_ids: 0,
      partial_artifact_present: true,
    },
  })
  assert.equal(value.status, 'partial')
})

test('inconsistent listing totals remain partial', () => {
  const value = validListing()
  value.payload.total_results_detected = 3
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, false)
})

test('unresolved listing duplicates remain partial', () => {
  const value = buildListingCollectionEvidence({
    identity: identity(),
    producer: producer('collector'),
    timestamps: timestamps(),
    context: context(),
    outputs: [artifacts.listing],
    collection: {
      pages_requested: 1,
      pages_completed: 1,
      failed_pages: [],
      termination: 'exact_total_reached',
      total_results_detected: 2,
      total_collected: 3,
      unique_ids: 2,
      duplicate_ids: 1,
      partial_artifact_present: false,
    },
  })
  assert.equal(value.status, 'partial')
  assert.match(value.reason_codes.join(','), /LISTING_DUPLICATE_IDS_PRESENT/)
})

test('listing evidence requires a hashed final artifact', () => {
  const value = validListing()
  value.outputs = []
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, false)
})

test('validates fast refresh linked to the exact listing artifact', () => {
  const value = validFastRefresh()
  assert.equal(value.status, 'succeeded')
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, true)
})

test('fast refresh rejects inconsistent combined counts', () => {
  const value = validFastRefresh()
  value.payload.combined_count = 1
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, false)
})

test('fast refresh preserves overlap evidence', () => {
  const value = validFastRefresh()
  value.payload.overlap_count = 1
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, false)
})

test('fast refresh enforces independent queue limits', () => {
  const value = validFastRefresh()
  value.payload.stale.limit = 0
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, false)
})

test('validates a succeeded import', () => {
  const value = validImport()
  assert.equal(value.status, 'succeeded')
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, true)
})

test('partial import with exit code zero remains partial', () => {
  const value = buildDetailImportEvidence({
    identity: identity(),
    producer: producer('importer'),
    timestamps: timestamps(),
    context: context(),
    inputs: [artifacts.combined],
    outputs: [artifacts.importSummary, artifacts.failures],
    result: {
      attempted: 2,
      succeeded: 1,
      failed: 1,
      skipped: 0,
      failed_urls: ['https://psdeals.net/us-store/game/2/example-two'],
      reported_status: 'partial',
      exit_code: 0,
      import_run_id: '11111111-1111-4111-8111-111111111111',
    },
  })
  assert.equal(value.status, 'partial')
  assert.match(
    value.reason_codes.join(','),
    /DETAIL_IMPORT_NON_SUCCEEDED_WITH_ZERO_EXIT/
  )
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, true)
})

test('failed import remains failed evidence', () => {
  const value = buildDetailImportEvidence({
    identity: identity(),
    producer: producer('importer'),
    timestamps: timestamps(),
    context: context(),
    inputs: [artifacts.combined],
    outputs: [artifacts.importSummary, artifacts.failures],
    result: {
      attempted: 1,
      succeeded: 0,
      failed: 1,
      skipped: 0,
      failed_urls: ['https://psdeals.net/us-store/game/2/example-two'],
      reported_status: 'failed',
      exit_code: 1,
    },
  })
  assert.equal(value.status, 'failed')
  assert.match(value.reason_codes.join(','), /DETAIL_IMPORT_RUN_ID_NOT_EVIDENCED/)
})

test('absence of psdeals_import_runs evidence does not invent a UUID', () => {
  const value = buildDetailImportEvidence({
    identity: identity(),
    producer: producer('importer'),
    timestamps: timestamps(),
    context: context(),
    inputs: [artifacts.combined],
    outputs: [
      artifacts.importSummary,
      { ...artifacts.pending, role: 'detail_failures' },
    ],
    result: {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      failed_urls: [],
      reported_status: 'succeeded',
      exit_code: 0,
    },
  })
  assert.equal('import_run_id' in value.payload, false)
  assert.match(value.reason_codes.join(','), /DETAIL_IMPORT_RUN_ID_NOT_EVIDENCED/)
})

test('validates a retry that resolves all failures', () => {
  const value = buildDetailRetryEvidence({
    identity: identity(),
    producer: producer('importer-retry'),
    timestamps: timestamps(),
    context: context(),
    inputs: [evidenceReference(), { ...artifacts.failures, role: 'original_failures' }],
    outputs: [artifacts.retrySummary, artifacts.pending],
    result: {
      attempted: 1,
      succeeded: 1,
      pending_failed: 0,
      pending_failed_urls: [],
      reported_status: 'succeeded',
      exit_code: 0,
    },
  })
  assert.equal(value.status, 'succeeded')
  assert.equal(validatePsdealsProducerEvidence(value, { now: NOW }).valid, true)
})

test('retry with pending failures remains partial', () => {
  const value = buildDetailRetryEvidence({
    identity: identity(),
    producer: producer('importer-retry'),
    timestamps: timestamps(),
    context: context(),
    inputs: [evidenceReference(), { ...artifacts.failures, role: 'original_failures' }],
    outputs: [artifacts.retrySummary, artifacts.failures],
    result: {
      attempted: 1,
      succeeded: 0,
      pending_failed: 1,
      pending_failed_urls: ['https://psdeals.net/us-store/game/2/example-two'],
      reported_status: 'partial',
      exit_code: 0,
    },
  })
  assert.equal(value.status, 'partial')
  assert.match(value.reason_codes.join(','), /DETAIL_RETRY_FAILURES_REMAIN/)
})

test('ended-deals evidence cannot represent an applied demotion', () => {
  const value = buildEndedDealsAnalysisEvidence({
    identity: identity(),
    producer: producer('ended-analyzer'),
    timestamps: timestamps(),
    context: context(),
    inputs: [artifacts.listing],
    outputs: [artifacts.ended],
    result: {
      listing_complete_confirmed: true,
      candidates: 0,
      application_performed: true,
      blockers: [],
    },
  })
  assert.equal(value.payload.application_performed, false)
  assert.equal(value.status, 'partial')
})

test('ended-deals evidence remains partial while candidates need revalidation', () => {
  const value = buildEndedDealsAnalysisEvidence({
    identity: identity(),
    producer: producer('ended-analyzer'),
    timestamps: timestamps(),
    context: context(),
    inputs: [artifacts.listing],
    outputs: [artifacts.ended],
    result: {
      listing_complete_confirmed: true,
      candidates: 1,
      application_performed: false,
      blockers: ['ended_candidates_require_detail_revalidation'],
    },
  })
  assert.equal(value.status, 'partial')
  assert.ok(
    value.reason_codes.includes('ENDED_DEALS_BLOCKED_CANDIDATES_REQUIRE_REVALIDATION')
  )
})

test('atomic evidence writer verifies bytes and refuses overwrite', async () => {
  const outputPath = path.join(temporaryDirectory, 'evidence.json')
  const value = validListing()
  const written = await writePsdealsEvidenceJsonAtomic({
    output_path: outputPath,
    envelope: value,
  })
  assert.equal(written.sha256.length, 64)
  await assert.rejects(
    writePsdealsEvidenceJsonAtomic({ output_path: outputPath, envelope: value }),
    /EVIDENCE_OUTPUT_EXISTS/
  )
  const temporaryFiles = (await fs.readdir(temporaryDirectory)).filter((file) =>
    file.includes('.partial.tmp')
  )
  assert.deepEqual(temporaryFiles, [])
})

test('bounded writer rejects lexical traversal outside its root', async () => {
  const root = await fs.mkdtemp(path.join(temporaryDirectory, 'bounded-root-'))
  const outside = path.join(temporaryDirectory, 'outside.json')
  await assert.rejects(
    writePsdealsEvidenceJsonAtomic({
      output_path: outside,
      root_dir: root,
      envelope: validListing(),
    }),
    /ARTIFACT_OUTPUT_OUTSIDE_ROOT/
  )
})

test('realpath verification rejects an external junction or symlink', async (t) => {
  const root = await fs.mkdtemp(path.join(temporaryDirectory, 'real-root-'))
  const outside = await fs.mkdtemp(path.join(temporaryDirectory, 'real-outside-'))
  const outsideFile = path.join(outside, 'outside.txt')
  const link = path.join(root, 'linked-outside')
  await fs.writeFile(outsideFile, 'external bytes', 'utf8')

  try {
    await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip('Creating a symlink or junction is not permitted on this host.')
      return
    }
    throw error
  }

  await assert.rejects(
    inspectPsdealsArtifact({
      root_dir: root,
      file_path: path.join(link, 'outside.txt'),
      role: 'external',
      artifact_kind: 'text',
    }),
    /ARTIFACT_REALPATH_OUTSIDE_ROOT/
  )

  const verification = await verifyPsdealsArtifactReference(
    buildPsdealsArtifactReference({
      role: 'external',
      path: 'linked-outside/outside.txt',
      sha256: 'a'.repeat(64),
      size_bytes: 14,
      artifact_kind: 'text',
      final_state: 'final',
    }),
    { root_dir: root }
  )
  assert.equal(verification.valid, false)
  assert.equal(verification.code, 'ARTIFACT_REALPATH_OUTSIDE_ROOT')

  await assert.rejects(
    writePsdealsEvidenceJsonAtomic({
      output_path: path.join(link, 'should-not-exist.json'),
      root_dir: root,
      envelope: validListing(),
    }),
    /ARTIFACT_OUTPUT_REALPATH_OUTSIDE_ROOT/
  )
})
