export const PSDEALS_CYCLE_MANIFEST_VERSION = 1

export const PSDEALS_CYCLE_REASON_CODES = Object.freeze({
  MANIFEST_VERSION_UNSUPPORTED: 'manifest_version_unsupported',
  LISTING_INCOMPLETE: 'listing_incomplete',
  LISTING_INDETERMINATE: 'listing_indeterminate',
  LISTING_BASELINE_INCOMPATIBLE: 'listing_baseline_incompatible',
  DETAIL_INCOMPLETE: 'detail_incomplete',
  MONTHLY_INCOMPLETE: 'monthly_incomplete',
  ENDED_DEALS_INCOMPLETE: 'ended_deals_incomplete',
  CERTIFICATION_BLOCKED: 'certification_blocked',
  CACHE_REFRESH_BLOCKED: 'cache_refresh_blocked',
})

const EXPECTED_REGION = 'us'
const EXPECTED_STOREFRONT = 'playstation'
const EXPECTED_PLATFORMS = ['PS5', 'PS4']
const EXPECTED_CONTENT_TYPES = ['games', 'bundles', 'dlc']
const OPERATION_MODES = new Set([
  'offline_validation',
  'simulated_no_external_io',
  'real_recorded',
])
const CYCLE_STATUSES = new Set([
  'running',
  'succeeded',
  'failed',
  'partial',
  'cancelled',
  'certified',
])
const IMPORT_RESULTS = new Set(['succeeded', 'partial', 'failed'])
const HASH_PATTERN = /^[a-f0-9]{64}$/i
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000
const DEFAULT_BASELINE_MAX_AGE_DAYS = 14
const DEFAULT_BASELINE_MAX_DROP_PERCENT = 20

function cloneValue(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function parseTimestamp(value) {
  if (!isNonEmptyString(value)) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function canonicalPlatforms(values) {
  if (!Array.isArray(values)) return []
  const normalized = new Set(
    values
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  )
  return EXPECTED_PLATFORMS.filter((value) => normalized.has(value))
}

function canonicalContentTypes(values) {
  if (!Array.isArray(values)) return []
  const normalized = new Set(
    values
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  )
  return EXPECTED_CONTENT_TYPES.filter((value) => normalized.has(value))
}

function sameOrderedValues(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter(isNonEmptyString).map((value) => value.trim()))]
}

function issue(code, path, message, kind = 'invalid') {
  return { code, path, message, kind }
}

function warning(code, path, message) {
  return { code, path, message }
}

function pushMissing(errors, path, label) {
  errors.push(
    issue(
      `${label.toUpperCase()}_MISSING`,
      path,
      `${label.replaceAll('_', ' ')} is required.`,
      'indeterminate'
    )
  )
}

function validateScope(section, path, identity, errors) {
  if (!isObject(section)) return

  if (section.region_code !== identity.region_code) {
    errors.push(
      issue(
        'ARTIFACT_REGION_MISMATCH',
        `${path}.region_code`,
        `Expected region ${identity.region_code || EXPECTED_REGION}.`
      )
    )
  }

  if (section.storefront !== identity.storefront) {
    errors.push(
      issue(
        'ARTIFACT_STOREFRONT_MISMATCH',
        `${path}.storefront`,
        `Expected storefront ${identity.storefront || EXPECTED_STOREFRONT}.`
      )
    )
  }

  if (!isNonEmptyString(section.run_token)) {
    errors.push(
      issue(
        'ARTIFACT_RUN_TOKEN_MISSING',
        `${path}.run_token`,
        'The artifact cannot be tied to one cycle run.',
        'indeterminate'
      )
    )
  } else if (section.run_token !== identity.local_cycle_id) {
    errors.push(
      issue(
        'ARTIFACT_RUN_TOKEN_MISMATCH',
        `${path}.run_token`,
        'The artifact belongs to a different local cycle.'
      )
    )
  }
}

function validateArtifact(artifact, path, identity, errors) {
  if (!isObject(artifact)) {
    pushMissing(errors, path, 'artifact_evidence')
    return false
  }

  let valid = true

  if (!isNonEmptyString(artifact.path)) {
    errors.push(
      issue('ARTIFACT_PATH_MISSING', `${path}.path`, 'Artifact path is required.')
    )
    valid = false
  }

  if (!isNonEmptyString(artifact.sha256)) {
    errors.push(
      issue('ARTIFACT_HASH_MISSING', `${path}.sha256`, 'Artifact SHA-256 is required.')
    )
    valid = false
  } else if (!HASH_PATTERN.test(artifact.sha256.trim())) {
    errors.push(
      issue('ARTIFACT_HASH_INVALID', `${path}.sha256`, 'Artifact SHA-256 is invalid.')
    )
    valid = false
  }

  if (!isNonEmptyString(artifact.run_token)) {
    errors.push(
      issue(
        'ARTIFACT_RUN_TOKEN_MISSING',
        `${path}.run_token`,
        'Artifact run token is required.',
        'indeterminate'
      )
    )
    valid = false
  } else if (artifact.run_token !== identity.local_cycle_id) {
    errors.push(
      issue(
        'ARTIFACT_RUN_TOKEN_MISMATCH',
        `${path}.run_token`,
        'Artifact run token does not match the manifest.'
      )
    )
    valid = false
  }

  return valid
}

function checkTimestamp({
  value,
  path,
  errors,
  now,
  futureToleranceMs,
  required = true,
}) {
  const parsed = parseTimestamp(value)

  if (!parsed) {
    if (required) {
      errors.push(issue('TIMESTAMP_INVALID', path, 'A valid timestamp is required.'))
    }
    return null
  }

  if (parsed.getTime() > now.getTime() + futureToleranceMs) {
    errors.push(
      issue('TIMESTAMP_TOO_FAR_IN_FUTURE', path, 'Timestamp is beyond the allowed future tolerance.')
    )
  }

  return parsed
}

function findSensitiveFields(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findSensitiveFields(entry, `${path}[${index}]`, findings))
    return findings
  }

  if (!isObject(value)) return findings

  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`
    if (
      /(?:secret|password|api[_-]?key|service[_-]?role|access[_-]?token|bearer)/i.test(key)
    ) {
      findings.push(nextPath)
    }
    findSensitiveFields(entry, nextPath, findings)
  }

  return findings
}

function listingStatusFromIssues({ incomplete, indeterminate, incompatibleBaseline }) {
  if (incompatibleBaseline) return 'incompatible_baseline'
  if (incomplete) return 'incomplete'
  if (indeterminate) return 'indeterminate'
  return 'complete'
}

export function evaluatePsdealsListingCompleteness(listingInput, identityInput, options = {}) {
  const listing = cloneValue(listingInput)
  const identity = cloneValue(identityInput) || {}
  const errors = []
  const warnings = []
  const now = parseTimestamp(options.now) || new Date()
  const futureToleranceMs = Number.isFinite(options.futureToleranceMs)
    ? options.futureToleranceMs
    : DEFAULT_FUTURE_TOLERANCE_MS
  let incomplete = false
  let indeterminate = false
  let incompatibleBaseline = false

  if (!isObject(listing)) {
    pushMissing(errors, 'listing', 'listing_section')
    return {
      status: 'indeterminate',
      errors,
      warnings,
      normalized_listing: listing,
    }
  }

  validateScope(listing, 'listing', identity, errors)
  validateArtifact(listing.artifact, 'listing.artifact', identity, errors)

  if (!isNonEmptyString(listing.requested_url)) {
    errors.push(
      issue(
        'LISTING_REQUESTED_URL_MISSING',
        'listing.requested_url',
        'Listing scope URL is required.',
        'indeterminate'
      )
    )
    indeterminate = true
  } else {
    try {
      const parsed = new URL(listing.requested_url)
      if (parsed.hostname !== 'psdeals.net' || parsed.protocol !== 'https:') {
        throw new Error('unexpected listing origin')
      }
    } catch {
      errors.push(
        issue('LISTING_REQUESTED_URL_INVALID', 'listing.requested_url', 'Listing URL must be HTTPS on psdeals.net.')
      )
      incomplete = true
    }
  }

  const filters = isObject(listing.filters) ? listing.filters : {}
  const platforms = canonicalPlatforms(filters.platforms)
  const contentTypes = canonicalContentTypes(filters.content_types)
  if (!sameOrderedValues(platforms, EXPECTED_PLATFORMS)) {
    errors.push(
      issue(
        'LISTING_PLATFORM_FILTER_MISMATCH',
        'listing.filters.platforms',
        'Listing must be filtered to exactly PS5 and PS4.'
      )
    )
    incomplete = true
  }
  if (!sameOrderedValues(contentTypes, EXPECTED_CONTENT_TYPES)) {
    errors.push(
      issue(
        'LISTING_CONTENT_FILTER_MISMATCH',
        'listing.filters.content_types',
        'Listing must include exactly games, bundles, and dlc.'
      )
    )
    incomplete = true
  }

  if (!isNonNegativeInteger(listing.pages_requested) || listing.pages_requested === 0) {
    errors.push(
      issue('LISTING_PAGES_REQUESTED_INVALID', 'listing.pages_requested', 'Requested page count must be positive.')
    )
    indeterminate = true
  }
  if (!isNonNegativeInteger(listing.pages_completed)) {
    errors.push(
      issue('LISTING_PAGES_COMPLETED_INVALID', 'listing.pages_completed', 'Completed page count is required.')
    )
    indeterminate = true
  } else if (
    isNonNegativeInteger(listing.pages_requested) &&
    listing.pages_completed > listing.pages_requested
  ) {
    errors.push(
      issue('LISTING_PAGE_COUNT_INCONSISTENT', 'listing.pages_completed', 'Completed pages exceed requested pages.')
    )
    incomplete = true
  }

  if (!Array.isArray(listing.failed_pages)) {
    errors.push(
      issue(
        'LISTING_FAILED_PAGES_UNKNOWN',
        'listing.failed_pages',
        'Failed pages must be represented as an array.',
        'indeterminate'
      )
    )
    indeterminate = true
  } else if (listing.failed_pages.length > 0) {
    errors.push(
      issue('LISTING_PAGE_FAILED', 'listing.failed_pages', 'At least one requested page failed.')
    )
    incomplete = true
  }

  for (const [field, label] of [
    ['total_results_detected', 'detected total'],
    ['total_collected', 'collected total'],
    ['unique_ids', 'unique ID total'],
    ['duplicate_ids', 'duplicate ID total'],
  ]) {
    if (!isNonNegativeInteger(listing[field])) {
      errors.push(
        issue('LISTING_TOTAL_MISSING_OR_INVALID', `listing.${field}`, `${label} must be a non-negative integer.`)
      )
      indeterminate = true
    }
  }

  if (
    isNonNegativeInteger(listing.total_collected) &&
    isNonNegativeInteger(listing.unique_ids) &&
    isNonNegativeInteger(listing.duplicate_ids)
  ) {
    if (listing.unique_ids + listing.duplicate_ids !== listing.total_collected) {
      errors.push(
        issue('LISTING_TOTALS_INCONSISTENT', 'listing', 'Collected, unique, and duplicate counts do not reconcile.')
      )
      incomplete = true
    }
    if (listing.duplicate_ids > 0) {
      errors.push(
        issue('LISTING_DUPLICATE_IDS_PRESENT', 'listing.duplicate_ids', 'Duplicate listing IDs require resolution.')
      )
      incomplete = true
    }
  }

  if (
    isNonNegativeInteger(listing.total_results_detected) &&
    isNonNegativeInteger(listing.unique_ids) &&
    listing.total_results_detected !== listing.unique_ids
  ) {
    errors.push(
      issue('LISTING_DETECTED_TOTAL_MISMATCH', 'listing.total_results_detected', 'Unique IDs do not equal the detected total.')
    )
    incomplete = true
  }

  if (listing.result !== 'complete') {
    errors.push(
      issue('LISTING_RESULT_NOT_COMPLETE', 'listing.result', 'Listing producer did not report a complete result.')
    )
    incomplete = true
  }

  if (listing.is_partial_file === true || /\.partial(?:\.json)?$/i.test(listing.artifact?.path || '')) {
    errors.push(
      issue('LISTING_PARTIAL_ARTIFACT', 'listing.artifact.path', 'A .partial artifact cannot prove completeness.')
    )
    incomplete = true
  }

  const strongStop =
    listing.pagination_final_observed === true ||
    (isNonEmptyString(listing.stop_reason) &&
      listing.stop_reason.startsWith('unique_items_collected_reached_total_results'))
  if (!strongStop) {
    errors.push(
      issue(
        'LISTING_FINAL_PAGE_NOT_PROVEN',
        'listing.pagination_final_observed',
        'Neither final pagination nor exact-total auto-stop was proven.',
        listing.stop_reason ? 'invalid' : 'indeterminate'
      )
    )
    if (listing.stop_reason) incomplete = true
    else indeterminate = true
  }

  const completedAt = checkTimestamp({
    value: listing.completed_at,
    path: 'listing.completed_at',
    errors,
    now,
    futureToleranceMs,
  })
  const identityStart = parseTimestamp(identity.started_at)
  if (completedAt && identityStart && completedAt < identityStart) {
    errors.push(
      issue('LISTING_BEFORE_CYCLE_START', 'listing.completed_at', 'Listing completed before the cycle started.')
    )
    incomplete = true
  }

  const baseline = listing.baseline
  if (baseline == null) {
    warnings.push(
      warning(
        'LISTING_BASELINE_NOT_PROVIDED',
        'listing.baseline',
        'No equivalent historical baseline supplements the primary pagination evidence.'
      )
    )
  } else if (!isObject(baseline)) {
    errors.push(
      issue('LISTING_BASELINE_INVALID', 'listing.baseline', 'Baseline must be an object.', 'indeterminate')
    )
    indeterminate = true
  } else {
    if (!isNonEmptyString(baseline.run_token)) {
      errors.push(
        issue(
          'LISTING_BASELINE_RUN_TOKEN_MISSING',
          'listing.baseline.run_token',
          'Baseline must identify its own collection run.',
          'indeterminate'
        )
      )
      indeterminate = true
    }
    validateArtifact(
      baseline.artifact,
      'listing.baseline.artifact',
      { ...identity, local_cycle_id: baseline.run_token },
      errors
    )
    const baselinePlatforms = canonicalPlatforms(baseline.filters?.platforms)
    const baselineContentTypes = canonicalContentTypes(baseline.filters?.content_types)
    const scopeMatches =
      baseline.region_code === listing.region_code &&
      baseline.storefront === listing.storefront &&
      sameOrderedValues(baselinePlatforms, platforms) &&
      sameOrderedValues(baselineContentTypes, contentTypes)

    if (!scopeMatches) {
      errors.push(
        issue(
          'LISTING_BASELINE_INCOMPATIBLE',
          'listing.baseline',
          'Baseline region, storefront, or filters are not comparable.'
        )
      )
      incompatibleBaseline = true
    }

    const observedAt = checkTimestamp({
      value: baseline.observed_at,
      path: 'listing.baseline.observed_at',
      errors,
      now,
      futureToleranceMs,
    })
    const maxAgeDays = Number.isFinite(baseline.max_age_days)
      ? baseline.max_age_days
      : DEFAULT_BASELINE_MAX_AGE_DAYS
    if (observedAt && completedAt) {
      const ageDays = (completedAt.getTime() - observedAt.getTime()) / 86_400_000
      if (ageDays < 0 || ageDays > maxAgeDays) {
        errors.push(
          issue(
            'LISTING_BASELINE_TOO_OLD',
            'listing.baseline.observed_at',
            'Baseline is newer than the listing or older than the configured age.',
            'indeterminate'
          )
        )
        indeterminate = true
      }
    }

    if (!isNonNegativeInteger(baseline.unique_ids) || baseline.unique_ids === 0) {
      errors.push(
        issue('LISTING_BASELINE_TOTAL_INVALID', 'listing.baseline.unique_ids', 'Baseline unique ID count must be positive.')
      )
      indeterminate = true
    } else if (isNonNegativeInteger(listing.unique_ids)) {
      const dropPercent = ((baseline.unique_ids - listing.unique_ids) / baseline.unique_ids) * 100
      const maxDropPercent = Number.isFinite(baseline.max_drop_percent)
        ? baseline.max_drop_percent
        : DEFAULT_BASELINE_MAX_DROP_PERCENT
      if (dropPercent > maxDropPercent) {
        errors.push(
          issue('LISTING_ABNORMAL_BASELINE_DROP', 'listing.unique_ids', 'Listing fell beyond the declared comparable-baseline tolerance.')
        )
        incomplete = true
      }
    }
  }

  if (errors.some((entry) => entry.kind === 'indeterminate')) indeterminate = true

  if (isObject(listing.filters)) {
    listing.filters.platforms = platforms
    listing.filters.content_types = contentTypes
  }

  return {
    status: listingStatusFromIssues({ incomplete, indeterminate, incompatibleBaseline }),
    errors,
    warnings,
    normalized_listing: listing,
  }
}

function validateFastRefresh(section, identity, errors) {
  if (!isObject(section)) {
    pushMissing(errors, 'fast_refresh', 'fast_refresh_section')
    return false
  }

  validateScope(section, 'fast_refresh', identity, errors)
  let complete = validateArtifact(
    section.artifacts?.summary,
    'fast_refresh.artifacts.summary',
    identity,
    errors
  )

  for (const name of ['combined', 'must_refresh', 'ps_plus_recheck', 'stale', 'skipped']) {
    complete =
      validateArtifact(
        section.artifacts?.[name],
        `fast_refresh.artifacts.${name}`,
        identity,
        errors
      ) && complete
  }

  if (section.result !== 'complete') {
    errors.push(issue('FAST_REFRESH_RESULT_NOT_COMPLETE', 'fast_refresh.result', 'Fast refresh analysis is incomplete.'))
    complete = false
  }

  const queues = isObject(section.queues) ? section.queues : {}
  let queueTotal = 0
  for (const name of ['must_refresh', 'ps_plus_recheck', 'stale']) {
    const queue = queues[name]
    if (!isObject(queue) || !isNonNegativeInteger(queue.count)) {
      errors.push(
        issue('FAST_REFRESH_QUEUE_COUNT_INVALID', `fast_refresh.queues.${name}.count`, 'Queue count is required.')
      )
      complete = false
      continue
    }
    queueTotal += queue.count
    if (!isObject(queue.reason_counts)) {
      errors.push(
        issue('FAST_REFRESH_QUEUE_REASONS_MISSING', `fast_refresh.queues.${name}.reason_counts`, 'Queue reason counts are required.')
      )
      complete = false
    }
    if (name !== 'must_refresh') {
      if (!isNonNegativeInteger(queue.limit) || queue.count > queue.limit) {
        errors.push(
          issue('FAST_REFRESH_QUEUE_LIMIT_EXCEEDED', `fast_refresh.queues.${name}`, 'Queue exceeds its independent limit.')
        )
        complete = false
      }
    }
  }

  if (!isNonNegativeInteger(section.combined_count) || section.combined_count !== queueTotal) {
    errors.push(
      issue('FAST_REFRESH_COMBINED_TOTAL_MISMATCH', 'fast_refresh.combined_count', 'Combined queue count does not equal independent queue counts.')
    )
    complete = false
  }
  if (!isNonNegativeInteger(section.overlap_count) || section.overlap_count !== 0) {
    errors.push(
      issue('FAST_REFRESH_QUEUE_OVERLAP', 'fast_refresh.overlap_count', 'Queue URLs overlap.')
    )
    complete = false
  }
  if (!isNonNegativeInteger(section.duplicate_urls) || section.duplicate_urls !== 0) {
    errors.push(
      issue('FAST_REFRESH_DUPLICATE_URLS', 'fast_refresh.duplicate_urls', 'Duplicate detail URLs are present.')
    )
    complete = false
  }
  if (!isNonNegativeInteger(section.skipped_count)) {
    errors.push(
      issue('FAST_REFRESH_SKIPPED_COUNT_INVALID', 'fast_refresh.skipped_count', 'Skipped count is required.')
    )
    complete = false
  }

  return complete
}

function validateDetailImport(section, identity, errors, warnings) {
  if (!isObject(section)) {
    pushMissing(errors, 'detail_import', 'detail_import_section')
    return false
  }

  validateScope(section, 'detail_import', identity, errors)
  let complete = validateArtifact(section.artifact, 'detail_import.artifact', identity, errors)

  for (const field of ['attempted', 'succeeded', 'failed', 'skipped']) {
    if (!isNonNegativeInteger(section[field])) {
      errors.push(issue('DETAIL_COUNT_INVALID', `detail_import.${field}`, 'Detail import count must be a non-negative integer.'))
      complete = false
    }
  }

  if (
    ['attempted', 'succeeded', 'failed', 'skipped'].every((field) =>
      isNonNegativeInteger(section[field])
    ) &&
    section.succeeded + section.failed + section.skipped !== section.attempted
  ) {
    errors.push(issue('DETAIL_TOTALS_INCONSISTENT', 'detail_import', 'Detail import counts do not reconcile.'))
    complete = false
  }

  if (!IMPORT_RESULTS.has(section.reported_result)) {
    errors.push(issue('DETAIL_RESULT_INVALID', 'detail_import.reported_result', 'Importer result is missing or invalid.'))
    complete = false
  }
  if (!Number.isInteger(section.exit_code)) {
    errors.push(issue('DETAIL_EXIT_CODE_MISSING', 'detail_import.exit_code', 'Importer exit code is required.'))
    complete = false
  }
  if (!isNonEmptyString(section.import_run_id)) {
    errors.push(
      issue(
        'DETAIL_IMPORT_RUN_ID_MISSING',
        'detail_import.import_run_id',
        'psdeals_import_runs evidence is missing.',
        'indeterminate'
      )
    )
    complete = false
  }

  const failedUrls = uniqueStrings(section.failed_urls)
  if (!Array.isArray(section.failed_urls) || failedUrls.length !== section.failed_urls.length) {
    errors.push(issue('DETAIL_FAILED_URLS_INVALID', 'detail_import.failed_urls', 'Failed URLs must be a unique array.'))
    complete = false
  }
  if (isNonNegativeInteger(section.failed) && failedUrls.length !== section.failed) {
    errors.push(issue('DETAIL_FAILED_URL_COUNT_MISMATCH', 'detail_import.failed_urls', 'Failed URL evidence does not match failed count.'))
    complete = false
  }
  if (section.skipped > 0) {
    errors.push(issue('DETAIL_SKIPPED_ITEMS_PRESENT', 'detail_import.skipped', 'Skipped detail items remain unresolved.'))
    complete = false
  }

  let retryResolved = section.failed === 0
  const retry = section.retry
  if (section.failed > 0) {
    if (!isObject(retry) || retry.attempted !== true) {
      errors.push(issue('DETAIL_RETRY_REQUIRED', 'detail_import.retry', 'Failed detail URLs were not retried.'))
      complete = false
      retryResolved = false
    } else {
      validateArtifact(retry.artifact, 'detail_import.retry.artifact', identity, errors)
      for (const field of ['attempted_count', 'succeeded', 'failed']) {
        if (!isNonNegativeInteger(retry[field])) {
          errors.push(issue('DETAIL_RETRY_COUNT_INVALID', `detail_import.retry.${field}`, 'Retry count is invalid.'))
          complete = false
        }
      }
      if (
        isNonNegativeInteger(retry.attempted_count) &&
        retry.attempted_count !== failedUrls.length
      ) {
        errors.push(issue('DETAIL_RETRY_TOTAL_MISMATCH', 'detail_import.retry.attempted_count', 'Retry did not cover every failed URL.'))
        complete = false
      }
      if (
        isNonNegativeInteger(retry.attempted_count) &&
        isNonNegativeInteger(retry.succeeded) &&
        isNonNegativeInteger(retry.failed) &&
        retry.succeeded + retry.failed !== retry.attempted_count
      ) {
        errors.push(issue('DETAIL_RETRY_COUNTS_INCONSISTENT', 'detail_import.retry', 'Retry counts do not reconcile.'))
        complete = false
      }
      const pending = uniqueStrings(retry.pending_failed_urls)
      if (!Array.isArray(retry.pending_failed_urls) || pending.length !== retry.pending_failed_urls.length) {
        errors.push(issue('DETAIL_RETRY_PENDING_URLS_INVALID', 'detail_import.retry.pending_failed_urls', 'Pending retry URLs must be unique.'))
        complete = false
      }
      if (isNonNegativeInteger(retry.failed) && pending.length !== retry.failed) {
        errors.push(issue('DETAIL_RETRY_PENDING_COUNT_MISMATCH', 'detail_import.retry.pending_failed_urls', 'Pending retry URLs do not match retry failures.'))
        complete = false
      }
      retryResolved = retry.failed === 0 && pending.length === 0
      if (!retryResolved) {
        errors.push(issue('DETAIL_RETRY_FAILURES_REMAIN', 'detail_import.retry', 'Detail failures remain after retry.'))
        complete = false
      } else {
        warnings.push(
          warning('DETAIL_INITIAL_FAILURES_RECOVERED', 'detail_import.retry', 'Initial detail failures were fully recovered by retry.')
        )
      }
    }
  }

  if (section.reported_result === 'succeeded') {
    if (section.failed !== 0 || section.exit_code !== 0) {
      errors.push(issue('DETAIL_SUCCEEDED_RESULT_INCONSISTENT', 'detail_import', 'Succeeded result conflicts with failures or exit code.'))
      complete = false
    }
  } else if (!retryResolved) {
    errors.push(
      issue(
        section.exit_code === 0
          ? 'DETAIL_PARTIAL_OR_FAILED_WITH_ZERO_EXIT'
          : 'DETAIL_IMPORT_NOT_COMPLETE',
        'detail_import.reported_result',
        'A partial or failed importer result is not complete without a clean retry.'
      )
    )
    complete = false
  }

  return complete && retryResolved
}

function validateMonthly(section, identity, errors, warnings, timestamps) {
  if (!isObject(section)) {
    pushMissing(errors, 'monthly_games', 'monthly_games_section')
    return false
  }

  validateScope(section, 'monthly_games', identity, errors)
  let complete = validateArtifact(section.evidence, 'monthly_games.evidence', identity, errors)

  if (section.checked !== true) {
    errors.push(issue('MONTHLY_CHECK_NOT_PERFORMED', 'monthly_games.checked', 'Monthly games were not checked.'))
    complete = false
  }
  const checkedAt = parseTimestamp(section.checked_at)
  if (!checkedAt) {
    errors.push(issue('MONTHLY_CHECK_TIMESTAMP_INVALID', 'monthly_games.checked_at', 'Monthly check timestamp is invalid.'))
    complete = false
  } else {
    timestamps.monthly = checkedAt
  }
  if (!isNonEmptyString(section.method) || !isNonEmptyString(section.source_reference)) {
    errors.push(issue('MONTHLY_EVIDENCE_SEMANTICS_MISSING', 'monthly_games', 'Monthly check needs a source and procedure.'))
    complete = false
  }
  if (!['no_changes', 'changes_applied'].includes(section.result)) {
    errors.push(issue('MONTHLY_RESULT_INVALID', 'monthly_games.result', 'Monthly result must be no_changes or changes_applied.'))
    complete = false
  }
  for (const field of ['proposed_changes', 'applied_changes', 'pending_changes']) {
    if (!isNonNegativeInteger(section[field])) {
      errors.push(issue('MONTHLY_CHANGE_COUNT_INVALID', `monthly_games.${field}`, 'Monthly change count is invalid.'))
      complete = false
    }
  }
  if (section.pending_changes > 0 || section.applied_changes !== section.proposed_changes) {
    errors.push(issue('MONTHLY_CHANGES_PENDING', 'monthly_games', 'Monthly reconciliation still has unapplied changes.'))
    complete = false
  }

  return complete
}

function validateEndedDeals(section, identity, listingComplete, errors, warnings, timestamps) {
  if (!isObject(section)) {
    pushMissing(errors, 'ended_deals', 'ended_deals_section')
    return { complete: false, eligible: false }
  }

  validateScope(section, 'ended_deals', identity, errors)
  let complete = validateArtifact(section.evidence, 'ended_deals.evidence', identity, errors)
  let eligible = complete

  if (section.checked !== true) {
    errors.push(issue('ENDED_DEALS_NOT_CHECKED', 'ended_deals.checked', 'Ended deals were not checked.'))
    complete = false
    eligible = false
  }
  const checkedAt = parseTimestamp(section.checked_at)
  if (!checkedAt) {
    errors.push(issue('ENDED_DEALS_TIMESTAMP_INVALID', 'ended_deals.checked_at', 'Ended-deals timestamp is invalid.'))
    complete = false
    eligible = false
  } else {
    timestamps.ended = checkedAt
  }
  if (section.listing_complete_confirmed !== true || !listingComplete) {
    errors.push(issue('ENDED_DEALS_WITHOUT_COMPLETE_LISTING', 'ended_deals.listing_complete_confirmed', 'Ended deals cannot proceed without strong listing completeness.'))
    complete = false
    eligible = false
  }
  for (const field of ['candidates', 'applied', 'failed']) {
    if (!isNonNegativeInteger(section[field])) {
      errors.push(issue('ENDED_DEALS_COUNT_INVALID', `ended_deals.${field}`, 'Ended-deals count is invalid.'))
      complete = false
      eligible = false
    }
  }
  if (isNonNegativeInteger(section.failed) && section.failed > 0) {
    errors.push(issue('ENDED_DEALS_FAILURES_PRESENT', 'ended_deals.failed', 'Ended-deals failures remain.'))
    complete = false
  }
  if (
    isNonNegativeInteger(section.candidates) &&
    isNonNegativeInteger(section.applied) &&
    section.applied !== section.candidates
  ) {
    errors.push(issue('ENDED_DEALS_CANDIDATES_PENDING', 'ended_deals', 'Ended-deal candidates remain unapplied.'))
    complete = false
  }
  if (!['no_candidates', 'candidates_found', 'applied_recorded'].includes(section.result)) {
    errors.push(issue('ENDED_DEALS_RESULT_INVALID', 'ended_deals.result', 'Ended-deals result is invalid.'))
    complete = false
    eligible = false
  }

  return { complete, eligible }
}

function validateCycleState(manifest, stageComplete, timestamps, errors, warnings, options) {
  const identity = manifest.identity
  const state = manifest.cycle_state
  const now = parseTimestamp(options.now) || new Date()
  const futureToleranceMs = Number.isFinite(options.futureToleranceMs)
    ? options.futureToleranceMs
    : DEFAULT_FUTURE_TOLERANCE_MS

  if (!isObject(state)) {
    pushMissing(errors, 'cycle_state', 'cycle_state_section')
    return {
      canMarkSucceeded: false,
      canCertify: false,
      certifiedRecorded: false,
      canRefreshCache: false,
    }
  }

  if (!CYCLE_STATUSES.has(state.status)) {
    errors.push(issue('CYCLE_STATUS_INVALID', 'cycle_state.status', 'Cycle status is invalid.'))
  }
  if (!isNonNegativeInteger(state.items_seen)) {
    errors.push(issue('CYCLE_ITEMS_SEEN_INVALID', 'cycle_state.items_seen', 'items_seen is invalid.'))
  } else if (
    isNonNegativeInteger(manifest.listing?.unique_ids) &&
    state.items_seen !== manifest.listing.unique_ids
  ) {
    errors.push(issue('CYCLE_ITEMS_SEEN_MISMATCH', 'cycle_state.items_seen', 'items_seen does not match listing unique IDs.'))
  }
  if (!isNonNegativeInteger(state.items_failed) || state.items_failed !== 0) {
    errors.push(issue('CYCLE_ITEMS_FAILED_NONZERO', 'cycle_state.items_failed', 'A successful cycle must have zero failed items.'))
  }
  if (state.failure_reason != null) {
    errors.push(issue('CYCLE_FAILURE_REASON_PRESENT', 'cycle_state.failure_reason', 'Cycle still has a failure reason.'))
  }

  const startedAt = checkTimestamp({
    value: identity.started_at,
    path: 'identity.started_at',
    errors,
    now,
    futureToleranceMs,
  })
  const generatedAt = checkTimestamp({
    value: identity.generated_at,
    path: 'identity.generated_at',
    errors,
    now,
    futureToleranceMs,
  })
  const listingObservedAt = checkTimestamp({
    value: identity.listing_observed_at,
    path: 'identity.listing_observed_at',
    errors,
    now,
    futureToleranceMs,
  })
  const listingCompletedAt = parseTimestamp(manifest.listing?.completed_at)
  if (
    listingObservedAt &&
    listingCompletedAt &&
    listingObservedAt.getTime() !== listingCompletedAt.getTime()
  ) {
    errors.push(issue('LISTING_TIMESTAMP_NOT_UNIQUE', 'identity.listing_observed_at', 'Listing observation timestamp must equal listing completion timestamp.'))
  }
  if (generatedAt && startedAt && generatedAt < startedAt) {
    errors.push(issue('MANIFEST_GENERATED_BEFORE_START', 'identity.generated_at', 'Manifest was generated before cycle start.'))
  }

  const finishedAt = checkTimestamp({
    value: state.finished_at,
    path: 'cycle_state.finished_at',
    errors,
    now,
    futureToleranceMs,
    required: ['succeeded', 'failed', 'partial', 'cancelled', 'certified'].includes(state.status),
  })
  if (startedAt && finishedAt && finishedAt < startedAt) {
    errors.push(issue('CYCLE_TIMESTAMPS_INVERTED', 'cycle_state.finished_at', 'Cycle finished before it started.'))
  }

  const validationAt = checkTimestamp({
    value: state.validation_completed_at,
    path: 'cycle_state.validation_completed_at',
    errors,
    now,
    futureToleranceMs,
    required: state.validation_passed === true || ['succeeded', 'certified'].includes(state.status),
  })

  const stageTimes = [listingCompletedAt, timestamps.details, timestamps.monthly, timestamps.ended].filter(Boolean)
  if (startedAt) {
    for (const stageTime of stageTimes) {
      if (stageTime < startedAt) {
        errors.push(issue('STAGE_BEFORE_CYCLE_START', 'cycle_state', 'A required stage occurred before cycle start.'))
        break
      }
    }
  }
  for (const stageTime of stageTimes) {
    if (stageTime.getTime() > now.getTime() + futureToleranceMs) {
      errors.push(issue('TIMESTAMP_TOO_FAR_IN_FUTURE', 'cycle_state', 'A required stage timestamp is too far in the future.'))
      break
    }
  }
  if (finishedAt) {
    for (const stageTime of stageTimes) {
      if (stageTime > finishedAt) {
        errors.push(issue('STAGE_AFTER_CYCLE_FINISH', 'cycle_state', 'A required stage occurred after cycle finish.'))
        break
      }
    }
  }
  if (validationAt && stageTimes.some((stageTime) => validationAt < stageTime)) {
    errors.push(issue('VALIDATION_BEFORE_REQUIRED_STAGE', 'cycle_state.validation_completed_at', 'Final validation occurred before a required stage.'))
  }

  const allStagesComplete = Object.values(stageComplete).every(Boolean)
  if (['succeeded', 'certified'].includes(state.status) && !allStagesComplete) {
    errors.push(issue('CYCLE_SUCCEEDED_WITH_INCOMPLETE_EVIDENCE', 'cycle_state.status', 'Cycle status is ahead of its evidence.'))
  }

  const temporalErrors = errors.some((entry) =>
    [
      'CYCLE_TIMESTAMPS_INVERTED',
      'TIMESTAMP_TOO_FAR_IN_FUTURE',
      'STAGE_BEFORE_CYCLE_START',
      'STAGE_AFTER_CYCLE_FINISH',
      'VALIDATION_BEFORE_REQUIRED_STAGE',
      'LISTING_TIMESTAMP_NOT_UNIQUE',
    ].includes(entry.code)
  )
  const canMarkSucceeded =
    allStagesComplete &&
    state.validation_passed === true &&
    Boolean(validationAt) &&
    !temporalErrors &&
    state.items_failed === 0 &&
    state.failure_reason == null

  const remoteCycleIdValid =
    isNonEmptyString(identity.remote_cycle_id) && UUID_PATTERN.test(identity.remote_cycle_id)
  if (identity.remote_cycle_id != null && !remoteCycleIdValid) {
    errors.push(issue('REMOTE_CYCLE_ID_INVALID', 'identity.remote_cycle_id', 'Remote cycle ID must be a UUID or null.'))
  }

  const canCertify =
    canMarkSucceeded &&
    state.status === 'succeeded' &&
    Boolean(finishedAt) &&
    remoteCycleIdValid

  const actions = isObject(manifest.actions) ? manifest.actions : {}
  const certification = isObject(actions.certification) ? actions.certification : {}
  const cacheRefresh = isObject(actions.cache_refresh) ? actions.cache_refresh : {}
  const certifiedAt = checkTimestamp({
    value: state.certified_at,
    path: 'cycle_state.certified_at',
    errors,
    now,
    futureToleranceMs,
    required: certification.performed === true || state.status === 'certified',
  })
  const certifiedRecorded =
    state.status === 'certified' &&
    certification.performed === true &&
    remoteCycleIdValid &&
    Boolean(certifiedAt) &&
    (!finishedAt || certifiedAt >= finishedAt)
  const canRefreshCache = canMarkSucceeded && certifiedRecorded

  if (
    (certification.requested === true || certification.performed === true) &&
    state.status !== 'succeeded' &&
    state.status !== 'certified'
  ) {
    errors.push(issue('CERTIFICATION_BEFORE_SUCCEEDED', 'actions.certification', 'Certification was requested before succeeded status.'))
  } else if (certification.requested === true && !canCertify && !certifiedRecorded) {
    errors.push(issue('CERTIFICATION_GATE_BLOCKED', 'actions.certification', 'Certification gate is closed.'))
  }
  if (certification.performed === true && !certifiedRecorded) {
    errors.push(issue('CERTIFICATION_RECORD_INCONSISTENT', 'actions.certification', 'Recorded certification evidence is inconsistent.'))
  }
  if ((cacheRefresh.requested === true || cacheRefresh.performed === true) && !certifiedRecorded) {
    errors.push(issue('CACHE_REFRESH_BEFORE_CERTIFICATION', 'actions.cache_refresh', 'Cache refresh cannot precede recorded certification.'))
  }

  return {
    canMarkSucceeded,
    canCertify,
    certifiedRecorded,
    canRefreshCache,
  }
}

function classificationFromErrors(errors) {
  if (errors.some((entry) => entry.kind !== 'indeterminate')) return 'invalid'
  if (errors.length > 0) return 'indeterminate'
  return 'valid'
}

export function validatePsdealsCycleManifest(manifestInput, options = {}) {
  const normalized = cloneValue(manifestInput)
  const errors = []
  const warnings = []

  if (!isObject(normalized)) {
    errors.push(issue('MANIFEST_NOT_OBJECT', '$', 'Manifest must be a JSON object.'))
    return {
      valid: false,
      classification: 'invalid',
      errors,
      warnings,
      normalized_manifest: normalized,
      listing_complete: false,
      detail_complete: false,
      monthly_complete: false,
      ended_deals_complete: false,
      can_demote: false,
      can_mark_succeeded: false,
      can_certify: false,
      can_refresh_cache: false,
      reason_codes: errors.map((entry) => entry.code),
    }
  }

  if (normalized.manifest_version !== PSDEALS_CYCLE_MANIFEST_VERSION) {
    errors.push(issue('MANIFEST_VERSION_UNSUPPORTED', 'manifest_version', 'Only manifest version 1 is supported.'))
  }

  const identity = isObject(normalized.identity) ? normalized.identity : {}
  if (!isObject(normalized.identity)) pushMissing(errors, 'identity', 'identity_section')
  if (!isNonEmptyString(identity.local_cycle_id)) {
    errors.push(issue('LOCAL_CYCLE_ID_MISSING', 'identity.local_cycle_id', 'Local cycle identifier is required.'))
  }
  if (identity.region_code !== EXPECTED_REGION) {
    errors.push(issue('CYCLE_REGION_INVALID', 'identity.region_code', 'Only US cycles are supported.'))
  }
  if (identity.storefront !== EXPECTED_STOREFRONT) {
    errors.push(issue('CYCLE_STOREFRONT_INVALID', 'identity.storefront', 'Only PlayStation cycles are supported.'))
  }
  if (!OPERATION_MODES.has(identity.operation_mode)) {
    errors.push(issue('CYCLE_OPERATION_MODE_INVALID', 'identity.operation_mode', 'Operation mode is invalid.'))
  }

  for (const path of findSensitiveFields(normalized)) {
    errors.push(issue('SENSITIVE_FIELD_NAME_PRESENT', path, 'Manifest contains a sensitive field name.'))
  }

  const listingEvaluation = evaluatePsdealsListingCompleteness(
    normalized.listing,
    identity,
    options
  )
  errors.push(...listingEvaluation.errors)
  warnings.push(...listingEvaluation.warnings)
  normalized.listing = listingEvaluation.normalized_listing
  const listingComplete = listingEvaluation.status === 'complete'

  const fastRefreshComplete = validateFastRefresh(
    normalized.fast_refresh,
    identity,
    errors
  )
  const detailComplete = validateDetailImport(
    normalized.detail_import,
    identity,
    errors,
    warnings
  )
  const timestamps = {
    details: parseTimestamp(normalized.detail_import?.completed_at),
    monthly: null,
    ended: null,
  }
  if (!timestamps.details) {
    errors.push(issue('DETAIL_COMPLETED_AT_INVALID', 'detail_import.completed_at', 'Detail completion timestamp is required.'))
  }
  const monthlyComplete = validateMonthly(
    normalized.monthly_games,
    identity,
    errors,
    warnings,
    timestamps
  )
  const endedDealsValidation = validateEndedDeals(
    normalized.ended_deals,
    identity,
    listingComplete,
    errors,
    warnings,
    timestamps
  )
  const endedDealsComplete = endedDealsValidation.complete

  const stageComplete = {
    listing: listingComplete,
    fast_refresh: fastRefreshComplete,
    details: detailComplete,
    monthly: monthlyComplete,
    ended_deals: endedDealsComplete,
  }
  const cycleGates = validateCycleState(
    normalized,
    stageComplete,
    timestamps,
    errors,
    warnings,
    options
  )

  const actions = isObject(normalized.actions) ? normalized.actions : {}
  const demotion = isObject(actions.demotion) ? actions.demotion : {}
  const listingBlockingErrors = errors.some(
    (entry) => entry.path.startsWith('listing')
  )
  const canDemote =
    listingComplete && endedDealsValidation.eligible && !listingBlockingErrors
  if ((demotion.requested === true || demotion.performed === true) && !canDemote) {
    errors.push(issue('DEMOTION_GATE_BLOCKED', 'actions.demotion', 'Demotion gate is closed.'))
  }

  const classification = classificationFromErrors(errors)
  const valid = errors.length === 0
  const criticalEvidenceValid = valid && Object.values(stageComplete).every(Boolean)

  return {
    valid,
    classification,
    errors,
    warnings,
    normalized_manifest: normalized,
    listing_completeness: listingEvaluation.status,
    listing_complete: listingComplete,
    detail_complete: detailComplete,
    monthly_complete: monthlyComplete,
    ended_deals_complete: endedDealsComplete,
    can_demote: canDemote,
    can_mark_succeeded: criticalEvidenceValid && cycleGates.canMarkSucceeded,
    can_certify: criticalEvidenceValid && cycleGates.canCertify,
    can_refresh_cache: criticalEvidenceValid && cycleGates.canRefreshCache,
    reason_codes: [...new Set([...errors, ...warnings].map((entry) => entry.code))],
  }
}

function inferListingFilters(baseUrl) {
  const result = {
    platforms: [],
    content_types: [],
  }

  try {
    const parsed = new URL(baseUrl)
    result.platforms = String(parsed.searchParams.get('platforms') || '')
      .split(',')
      .filter(Boolean)
      .map((value) => value.toUpperCase())
    result.content_types = parsed.searchParams.getAll('contentType[]')
  } catch {
    // Invalid source URLs remain observable through empty filters.
  }

  return result
}

export function buildPsdealsCycleManifestFromListingArtifact(
  listingArtifactInput,
  metadata = {}
) {
  const artifact = cloneValue(listingArtifactInput) || {}
  const items = Array.isArray(artifact.items) ? artifact.items : []
  const ids = items
    .map((item) => Number(item?.psdeals_id))
    .filter((value) => Number.isSafeInteger(value) && value > 0)
  const uniqueIds = new Set(ids)
  const filters = inferListingFilters(artifact.base_url)
  const stopReason = artifact.stop_reason || artifact.auto_stop_reason || null
  const exactTotal =
    Number.isSafeInteger(artifact.total_results_detected) &&
    uniqueIds.size === artifact.total_results_detected
  const strongStop =
    typeof stopReason === 'string' &&
    stopReason.startsWith('unique_items_collected_reached_total_results')
  const failedPages = Array.isArray(artifact.failed_pages)
    ? artifact.failed_pages
    : null
  const explicitFailure =
    (Number.isSafeInteger(artifact.pages_failed) && artifact.pages_failed > 0) ||
    (failedPages && failedPages.length > 0)
  const result = explicitFailure
    ? 'failed'
    : exactTotal && strongStop
      ? 'complete'
      : 'partial'
  const runToken = metadata.runToken || null
  const collectedAt = artifact.collected_at || null

  return {
    manifest_version: PSDEALS_CYCLE_MANIFEST_VERSION,
    identity: {
      local_cycle_id:
        metadata.localCycleId ||
        `historical-${String(metadata.artifactName || 'listing').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`,
      remote_cycle_id: null,
      region_code: artifact.base_url?.includes('/us-store/') ? 'us' : null,
      storefront: artifact.base_url?.includes('psdeals.net') ? 'playstation' : null,
      started_at: null,
      generated_at: metadata.generatedAt || new Date().toISOString(),
      listing_observed_at: collectedAt,
      operation_mode: 'offline_validation',
      code_revision: metadata.codeRevision || null,
    },
    listing: {
      run_token: runToken,
      region_code: artifact.base_url?.includes('/us-store/') ? 'us' : null,
      storefront: artifact.base_url?.includes('psdeals.net') ? 'playstation' : null,
      requested_url: artifact.base_url || null,
      filters,
      pages_requested: Number.isSafeInteger(artifact.pages_requested)
        ? artifact.pages_requested
        : null,
      pages_completed: Number.isSafeInteger(artifact.pages_processed)
        ? artifact.pages_processed
        : null,
      failed_pages: failedPages,
      pagination_final_observed: strongStop,
      stop_reason: stopReason,
      total_results_detected: Number.isSafeInteger(artifact.total_results_detected)
        ? artifact.total_results_detected
        : null,
      total_collected: items.length,
      unique_ids: uniqueIds.size,
      duplicate_ids: ids.length - uniqueIds.size,
      result,
      is_partial_file: /\.partial(?:\.json)?$/i.test(metadata.artifactPath || ''),
      completed_at: collectedAt,
      artifact: {
        path: metadata.artifactPath || null,
        sha256: metadata.artifactSha256 || null,
        run_token: runToken,
      },
      baseline: null,
    },
    fast_refresh: null,
    detail_import: null,
    monthly_games: null,
    ended_deals: null,
    cycle_state: {
      status: 'running',
      items_seen: uniqueIds.size,
      items_failed: 0,
      failure_reason: null,
      validation_passed: false,
      validation_completed_at: null,
      finished_at: null,
      certified_at: null,
    },
    actions: {
      demotion: { requested: false, performed: false },
      certification: { requested: false, performed: false },
      cache_refresh: { requested: false, performed: false },
    },
  }
}
