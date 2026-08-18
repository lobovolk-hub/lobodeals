import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import {
  evaluatePsdealsListingCompleteness,
  validatePsdealsCycleManifest,
} from '../scripts/lib/psdeals-cycle-manifest.mjs'
import {
  OFFLINE_VALIDATION_EXIT_CODES,
  runOfflineValidationCli,
} from '../scripts/validate-psdeals-cycle-offline.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'psdeals-cycle')
const FIXED_NOW = '2026-07-29T15:00:00.000Z'
const VALID = JSON.parse(
  await fs.readFile(path.join(FIXTURE_DIR, 'valid-manifest.json'), 'utf8')
)

function manifest() {
  return JSON.parse(JSON.stringify(VALID))
}

function validate(value) {
  return validatePsdealsCycleManifest(value, { now: FIXED_NOW })
}

function reasonCodes(result) {
  return new Set(result.errors.map((entry) => entry.code))
}

function failedImport(value, { result = 'partial', exitCode = 0 } = {}) {
  value.detail_import.succeeded = 2
  value.detail_import.failed = 1
  value.detail_import.reported_result = result
  value.detail_import.exit_code = exitCode
  value.detail_import.failed_urls = [
    'https://psdeals.net/us-store/game/3/fixture-three',
  ]
  value.detail_import.retry = {
    attempted: false,
    attempted_count: 0,
    succeeded: 0,
    failed: 0,
    pending_failed_urls: [],
  }
}

function addSuccessfulRetry(value) {
  value.detail_import.retry = {
    attempted: true,
    attempted_count: 1,
    succeeded: 1,
    failed: 0,
    pending_failed_urls: [],
    artifact: {
      path: 'import-summary.json',
      sha256:
        'e9639b570707adc8342497753b1bfbfd327326333f3b53451cc709a65a980003',
      run_token: value.identity.local_cycle_id,
    },
  }
}

test('accepts a completely valid cycle manifest', () => {
  const result = validate(manifest())

  assert.equal(result.valid, true)
  assert.equal(result.classification, 'valid')
  assert.equal(result.listing_complete, true)
  assert.equal(result.detail_complete, true)
  assert.equal(result.monthly_complete, true)
  assert.equal(result.ended_deals_complete, true)
  assert.equal(result.can_demote, true)
  assert.equal(result.can_certify, true)
  assert.equal(result.can_refresh_cache, false)
})

test('blocks a failed listing page', () => {
  const value = manifest()
  value.listing.failed_pages = [{ page: 1, reason: 'fixture' }]

  const result = validate(value)
  assert.equal(result.listing_completeness, 'incomplete')
  assert.ok(reasonCodes(result).has('LISTING_PAGE_FAILED'))
  assert.equal(result.can_demote, false)
})

test('blocks a listing reported as partial', () => {
  const value = manifest()
  value.listing.result = 'partial'

  assert.ok(reasonCodes(validate(value)).has('LISTING_RESULT_NOT_COMPLETE'))
})

test('blocks a .partial listing artifact', () => {
  const value = manifest()
  value.listing.artifact.path = 'listing.partial.json'

  assert.ok(reasonCodes(validate(value)).has('LISTING_PARTIAL_ARTIFACT'))
})

test('blocks inconsistent listing totals', () => {
  const value = manifest()
  value.listing.total_collected = 4

  assert.ok(reasonCodes(validate(value)).has('LISTING_TOTALS_INCONSISTENT'))
})

test('blocks duplicate listing IDs', () => {
  const value = manifest()
  value.listing.total_collected = 4
  value.listing.duplicate_ids = 1

  assert.ok(reasonCodes(validate(value)).has('LISTING_DUPLICATE_IDS_PRESENT'))
})

test('blocks incorrect listing filters', () => {
  const value = manifest()
  value.listing.filters.platforms = ['PS5']

  assert.ok(reasonCodes(validate(value)).has('LISTING_PLATFORM_FILTER_MISMATCH'))
})

test('blocks a non-US region', () => {
  const value = manifest()
  value.identity.region_code = 'ca'

  assert.ok(reasonCodes(validate(value)).has('CYCLE_REGION_INVALID'))
})

test('blocks a non-PlayStation storefront', () => {
  const value = manifest()
  value.identity.storefront = 'xbox'

  assert.ok(reasonCodes(validate(value)).has('CYCLE_STOREFRONT_INVALID'))
})

test('accepts a comparable recent listing baseline', () => {
  const value = manifest()
  const result = evaluatePsdealsListingCompleteness(value.listing, value.identity, {
    now: FIXED_NOW,
  })

  assert.equal(result.status, 'complete')
})

test('distinguishes an incompatible listing baseline', () => {
  const value = manifest()
  value.listing.baseline.filters.platforms = ['PS3']

  const result = validate(value)
  assert.equal(result.listing_completeness, 'incompatible_baseline')
  assert.ok(reasonCodes(result).has('LISTING_BASELINE_INCOMPATIBLE'))
})

test('blocks an abnormal drop against a comparable baseline', () => {
  const value = manifest()
  value.listing.baseline.unique_ids = 10

  assert.ok(reasonCodes(validate(value)).has('LISTING_ABNORMAL_BASELINE_DROP'))
})

test('marks a stale baseline indeterminate', () => {
  const value = manifest()
  value.listing.baseline.observed_at = '2026-06-01T14:05:00.000Z'

  const result = validate(value)
  assert.equal(result.listing_completeness, 'indeterminate')
  assert.ok(reasonCodes(result).has('LISTING_BASELINE_TOO_OLD'))
})

test('accepts a succeeded detail import', () => {
  assert.equal(validate(manifest()).detail_complete, true)
})

test('does not accept partial import with exit code zero', () => {
  const value = manifest()
  failedImport(value)

  const result = validate(value)
  assert.ok(reasonCodes(result).has('DETAIL_PARTIAL_OR_FAILED_WITH_ZERO_EXIT'))
  assert.equal(result.detail_complete, false)
})

test('does not accept a failed detail import', () => {
  const value = manifest()
  failedImport(value, { result: 'failed', exitCode: 1 })

  assert.ok(reasonCodes(validate(value)).has('DETAIL_IMPORT_NOT_COMPLETE'))
})

test('accepts a retry that resolves every initial failure', () => {
  const value = manifest()
  failedImport(value)
  addSuccessfulRetry(value)

  const result = validate(value)
  assert.equal(result.detail_complete, true)
  assert.ok(result.reason_codes.includes('DETAIL_INITIAL_FAILURES_RECOVERED'))
})

test('blocks a retry with a pending failure', () => {
  const value = manifest()
  failedImport(value)
  addSuccessfulRetry(value)
  value.detail_import.retry.succeeded = 0
  value.detail_import.retry.failed = 1
  value.detail_import.retry.pending_failed_urls = [...value.detail_import.failed_urls]

  assert.ok(reasonCodes(validate(value)).has('DETAIL_RETRY_FAILURES_REMAIN'))
})

test('blocks overlapping fast refresh queues', () => {
  const value = manifest()
  value.fast_refresh.overlap_count = 1

  assert.ok(reasonCodes(validate(value)).has('FAST_REFRESH_QUEUE_OVERLAP'))
})

test('enforces independent fast refresh queue limits', () => {
  const value = manifest()
  value.fast_refresh.queues.ps_plus_recheck.count = 11
  value.fast_refresh.combined_count = 13

  assert.ok(reasonCodes(validate(value)).has('FAST_REFRESH_QUEUE_LIMIT_EXCEEDED'))
})

test('validates PS Plus discovery as an independent optional-v1 queue', () => {
  const value = manifest()
  value.fast_refresh.artifacts.ps_plus_discovery = {
    ...value.fast_refresh.artifacts.stale,
    path: 'ps-plus-discovery.txt',
  }
  value.fast_refresh.queues.ps_plus_discovery = {
    count: 0,
    limit: 50,
    reason_counts: {},
  }

  assert.equal(validate(value).valid, true)

  value.fast_refresh.queues.ps_plus_discovery.count = 51
  value.fast_refresh.combined_count += 51
  assert.ok(
    reasonCodes(validate(value)).has('FAST_REFRESH_QUEUE_LIMIT_EXCEEDED')
  )
})

test('blocks a missing monthly check', () => {
  const value = manifest()
  value.monthly_games = null

  assert.ok(reasonCodes(validate(value)).has('MONTHLY_GAMES_SECTION_MISSING'))
})

test('blocks a monthly timestamp without semantic evidence', () => {
  const value = manifest()
  value.monthly_games.method = ''
  value.monthly_games.source_reference = ''
  value.monthly_games.evidence = null

  const codes = reasonCodes(validate(value))
  assert.ok(codes.has('MONTHLY_EVIDENCE_SEMANTICS_MISSING'))
  assert.ok(codes.has('ARTIFACT_EVIDENCE_MISSING'))
})

test('blocks a monthly check before cycle start', () => {
  const value = manifest()
  value.monthly_games.checked_at = '2026-07-29T13:59:00.000Z'

  assert.ok(reasonCodes(validate(value)).has('STAGE_BEFORE_CYCLE_START'))
})

test('accepts a valid monthly check with no changes', () => {
  assert.equal(validate(manifest()).monthly_complete, true)
})

test('blocks ended-deal processing without a complete listing', () => {
  const value = manifest()
  value.listing.result = 'partial'

  assert.ok(reasonCodes(validate(value)).has('ENDED_DEALS_WITHOUT_COMPLETE_LISTING'))
})

test('blocks inverted cycle timestamps', () => {
  const value = manifest()
  value.cycle_state.finished_at = '2026-07-29T13:59:00.000Z'

  assert.ok(reasonCodes(validate(value)).has('CYCLE_TIMESTAMPS_INVERTED'))
})

test('blocks a future stage timestamp outside tolerance', () => {
  const value = manifest()
  value.monthly_games.checked_at = '2026-07-29T16:00:00.000Z'
  value.cycle_state.finished_at = '2026-07-29T16:01:00.000Z'
  value.cycle_state.validation_completed_at = '2026-07-29T16:00:30.000Z'

  assert.ok(reasonCodes(validate(value)).has('TIMESTAMP_TOO_FAR_IN_FUTURE'))
})

test('blocks artifacts from a different cycle run', () => {
  const value = manifest()
  value.fast_refresh.run_token = 'other-run'
  value.fast_refresh.artifacts.summary.run_token = 'other-run'

  assert.ok(reasonCodes(validate(value)).has('ARTIFACT_RUN_TOKEN_MISMATCH'))
})

test('blocks missing artifact hashes', () => {
  const value = manifest()
  value.listing.artifact.sha256 = null

  assert.ok(reasonCodes(validate(value)).has('ARTIFACT_HASH_MISSING'))
})

test('blocks a certification attempt before succeeded status', () => {
  const value = manifest()
  value.cycle_state.status = 'running'
  value.cycle_state.finished_at = null
  value.actions.certification.requested = true

  assert.ok(reasonCodes(validate(value)).has('CERTIFICATION_BEFORE_SUCCEEDED'))
})

test('blocks a cache refresh attempt before certification', () => {
  const value = manifest()
  value.actions.cache_refresh.requested = true

  assert.ok(reasonCodes(validate(value)).has('CACHE_REFRESH_BEFORE_CERTIFICATION'))
})

test('blocks an unsupported manifest version', () => {
  const value = manifest()
  value.manifest_version = 99

  assert.ok(reasonCodes(validate(value)).has('MANIFEST_VERSION_UNSUPPORTED'))
})

test('allows compatible additional manifest fields', () => {
  const value = manifest()
  value.future_extension = { observed: true }

  assert.equal(validate(value).valid, true)
})

test('offline CLI returns zero for a valid fixture', async () => {
  let output = ''
  const code = await runOfflineValidationCli(
    [
      '--manifest=tests/fixtures/psdeals-cycle/valid-manifest.json',
      `--now=${FIXED_NOW}`,
    ],
    {
      cwd: ROOT,
      stdout: (value) => {
        output += value
      },
      stderr: (value) => {
        output += value
      },
    }
  )

  assert.equal(code, OFFLINE_VALIDATION_EXIT_CODES.valid)
  assert.match(output, /OFFLINE_VALIDATION/)
  assert.match(output, /CAN_CERTIFY: YES/)
})

test('offline CLI returns nonzero for an invalid fixture', async () => {
  let output = ''
  const code = await runOfflineValidationCli(
    [
      '--manifest=tests/fixtures/psdeals-cycle/invalid-manifest.json',
      `--now=${FIXED_NOW}`,
    ],
    {
      cwd: ROOT,
      stdout: (value) => {
        output += value
      },
      stderr: (value) => {
        output += value
      },
    }
  )

  assert.equal(code, OFFLINE_VALIDATION_EXIT_CODES.invalid)
  assert.match(output, /CAN_CERTIFY: NO/)
})

test('recorded certification is required before cache eligibility', () => {
  const value = manifest()
  value.cycle_state.status = 'certified'
  value.cycle_state.certified_at = '2026-07-29T14:18:00.000Z'
  value.actions.certification.performed = true

  const result = validate(value)
  assert.equal(result.valid, true)
  assert.equal(result.can_refresh_cache, true)
})
