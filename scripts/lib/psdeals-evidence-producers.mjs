import {
  buildPsdealsEvidenceEnvelope,
  buildPsdealsFilterContext,
  validatePsdealsEvidenceEnvelope,
} from './psdeals-evidence-envelope.mjs'

const LISTING_TERMINATIONS = new Set([
  'exact_total_reached',
  'pagination_final_observed',
])

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter(isNonEmptyString).map((value) => value.trim()))]
}

function issue(code, path, message, kind = 'invalid') {
  return { code, path, message, kind }
}

function hasArtifact(references, role, finalState = null) {
  return (Array.isArray(references) ? references : []).some(
    (reference) =>
      reference?.role === role &&
      (finalState === null || reference?.final_state === finalState)
  )
}

function normalizeErrors(values) {
  if (!Array.isArray(values)) return []
  return values.map((entry) =>
    isObject(entry)
      ? entry
      : { code: 'PRODUCER_REPORTED_ERROR', message: String(entry) }
  )
}

function normalizeWarnings(values) {
  if (!Array.isArray(values)) return []
  return values.map((entry) =>
    isObject(entry)
      ? entry
      : { code: 'PRODUCER_REPORTED_WARNING', message: String(entry) }
  )
}

function baseEnvelope(kind, input, assessment) {
  return buildPsdealsEvidenceEnvelope({
    evidence_kind: kind,
    local_cycle_id: input.identity?.local_cycle_id,
    run_token: input.identity?.run_token,
    remote_cycle_id: input.identity?.remote_cycle_id,
    producer: input.producer?.name,
    producer_version: input.producer?.version,
    code_revision: input.producer?.code_revision,
    region_code: input.identity?.region_code,
    storefront: input.identity?.storefront,
    mode: input.identity?.mode,
    started_at: input.timestamps?.started_at,
    finished_at: input.timestamps?.finished_at,
    generated_at: input.timestamps?.generated_at,
    context: buildPsdealsFilterContext(input.context),
    inputs: input.inputs || [],
    outputs: input.outputs || [],
    status: assessment.status,
    payload: assessment.payload,
    errors: normalizeErrors(input.errors),
    warnings: normalizeWarnings(input.warnings),
    reason_codes: assessment.reason_codes,
    extensions: input.extensions,
  })
}

function assessListing(input) {
  const collection = input.collection || {}
  const outputs = input.outputs || []
  const failedPages = Array.isArray(collection.failed_pages)
    ? collection.failed_pages
    : null
  const pagesRequested = collection.pages_requested
  const pagesCompleted = collection.pages_completed
  const totalDetected = collection.total_results_detected
  const totalCollected = collection.total_collected
  const uniqueIds = collection.unique_ids
  const duplicateIds = collection.duplicate_ids
  const partialPresent = collection.partial_artifact_present === true
  const terminationAccepted = LISTING_TERMINATIONS.has(
    collection.termination
  )
  const finalJsonPresent = hasArtifact(outputs, 'listing_json', 'final')
  const numericFieldsValid = [
    pagesRequested,
    pagesCompleted,
    totalDetected,
    totalCollected,
    uniqueIds,
    duplicateIds,
  ].every(isNonNegativeInteger)
  const totalsReconcile =
    numericFieldsValid &&
    uniqueIds + duplicateIds === totalCollected &&
    uniqueIds === totalDetected
  const complete =
    numericFieldsValid &&
    pagesRequested > 0 &&
    pagesCompleted > 0 &&
    pagesCompleted <= pagesRequested &&
    failedPages?.length === 0 &&
    terminationAccepted &&
    totalsReconcile &&
    duplicateIds === 0 &&
    !partialPresent &&
    finalJsonPresent &&
    normalizeErrors(input.errors).length === 0

  let status = 'indeterminate'
  if ((failedPages?.length || 0) > 0 || normalizeErrors(input.errors).length > 0) {
    status = 'failed'
  } else if (complete) {
    status = 'succeeded'
  } else if (finalJsonPresent || partialPresent) {
    status = 'partial'
  }

  const reasonCodes = []
  if (!finalJsonPresent) reasonCodes.push('LISTING_FINAL_ARTIFACT_MISSING')
  if (partialPresent) reasonCodes.push('LISTING_PARTIAL_ARTIFACT_PRESENT')
  if (failedPages === null) reasonCodes.push('LISTING_FAILED_PAGES_UNKNOWN')
  else if (failedPages.length > 0) reasonCodes.push('LISTING_PAGES_FAILED')
  if (!terminationAccepted) reasonCodes.push('LISTING_TERMINATION_NOT_PROVEN')
  if (!numericFieldsValid) reasonCodes.push('LISTING_TOTALS_MISSING')
  else if (!totalsReconcile) reasonCodes.push('LISTING_TOTALS_INCONSISTENT')
  if (isNonNegativeInteger(duplicateIds) && duplicateIds > 0) {
    reasonCodes.push('LISTING_DUPLICATE_IDS_PRESENT')
  }

  return {
    status,
    reason_codes: reasonCodes,
    payload: {
      requested_url: input.context?.requested_url,
      pages_requested: pagesRequested,
      pages_completed: pagesCompleted,
      failed_pages: failedPages,
      termination: collection.termination,
      termination_observed: terminationAccepted,
      stop_reason: collection.stop_reason,
      pagination_final_observed:
        collection.termination === 'pagination_final_observed',
      total_results_detected: totalDetected,
      total_collected: totalCollected,
      unique_ids: uniqueIds,
      duplicate_ids: duplicateIds,
      collection_result: complete
        ? 'complete'
        : status === 'indeterminate'
          ? 'indeterminate'
          : 'incomplete',
      partial_artifact_present: partialPresent,
    },
  }
}

export function buildListingCollectionEvidence(input = {}) {
  return baseEnvelope('listing_collection', input, assessListing(input))
}

function assessFastRefresh(input) {
  const analysis = input.analysis || {}
  const outputs = input.outputs || []
  const requiredOutputs = [
    'fast_refresh_summary',
    'combined_queue',
    'must_refresh_queue',
    'ps_plus_recheck_queue',
    'stale_queue',
    'skipped_queue',
  ]
  const requiredArtifactsPresent = requiredOutputs.every((role) =>
    hasArtifact(outputs, role, 'final')
  )
  const listingLinked = hasArtifact(input.inputs, 'listing_json', 'final')
  const mustCount = analysis.must_refresh?.count
  const psPlusCount = analysis.ps_plus_recheck?.count
  const staleCount = analysis.stale?.count
  const skippedCount = analysis.skipped?.count
  const combinedCount = analysis.combined_count
  const overlapCount = analysis.overlap_count
  const duplicateUrls = analysis.duplicate_urls
  const countsValid = [
    mustCount,
    psPlusCount,
    staleCount,
    skippedCount,
    combinedCount,
    overlapCount,
    duplicateUrls,
  ].every(isNonNegativeInteger)
  const countsReconcile =
    countsValid && combinedCount === mustCount + psPlusCount + staleCount
  const limitsValid =
    isNonNegativeInteger(analysis.ps_plus_recheck?.limit) &&
    psPlusCount <= analysis.ps_plus_recheck.limit &&
    isNonNegativeInteger(analysis.stale?.limit) &&
    staleCount <= analysis.stale.limit
  const reasonsPresent = [
    analysis.must_refresh,
    analysis.ps_plus_recheck,
    analysis.stale,
  ].every((queue) => isObject(queue?.reason_counts))
  const complete =
    listingLinked &&
    requiredArtifactsPresent &&
    countsReconcile &&
    limitsValid &&
    reasonsPresent &&
    overlapCount === 0 &&
    duplicateUrls === 0 &&
    normalizeErrors(input.errors).length === 0
  const status = complete
    ? 'succeeded'
    : normalizeErrors(input.errors).length > 0
      ? 'failed'
      : listingLinked || outputs.length > 0
        ? 'partial'
        : 'indeterminate'
  const reasonCodes = []
  if (!listingLinked) reasonCodes.push('FAST_REFRESH_LISTING_LINK_MISSING')
  if (!requiredArtifactsPresent) reasonCodes.push('FAST_REFRESH_ARTIFACTS_MISSING')
  if (!countsReconcile) reasonCodes.push('FAST_REFRESH_COUNTS_INCONSISTENT')
  if (!limitsValid) reasonCodes.push('FAST_REFRESH_LIMIT_EXCEEDED')
  if (overlapCount > 0) reasonCodes.push('FAST_REFRESH_QUEUE_OVERLAP')
  if (duplicateUrls > 0) reasonCodes.push('FAST_REFRESH_DUPLICATE_URLS')
  if (!reasonsPresent) reasonCodes.push('FAST_REFRESH_REASONS_MISSING')

  return {
    status,
    reason_codes: reasonCodes,
    payload: {
      must_refresh: analysis.must_refresh,
      ps_plus_recheck: analysis.ps_plus_recheck,
      stale: analysis.stale,
      skipped: analysis.skipped,
      combined_count: combinedCount,
      overlap_count: overlapCount,
      duplicate_urls: duplicateUrls,
      limits_reached: analysis.limits_reached || {},
      analysis_result: complete ? 'complete' : 'incomplete',
    },
  }
}

export function buildFastRefreshAnalysisEvidence(input = {}) {
  return baseEnvelope('fast_refresh_analysis', input, assessFastRefresh(input))
}

function assessDetailImport(input) {
  const result = input.result || {}
  const attempted = result.attempted
  const succeeded = result.succeeded
  const failed = result.failed
  const skipped = result.skipped
  const failedUrls = uniqueStrings(result.failed_urls)
  const countsValid = [attempted, succeeded, failed, skipped].every(
    isNonNegativeInteger
  )
  const countsReconcile =
    countsValid && succeeded + failed + skipped === attempted
  const combinedLinked = hasArtifact(input.inputs, 'combined_queue', 'final')
  const summaryPresent = hasArtifact(
    input.outputs,
    'detail_import_summary',
    'final'
  )
  const failuresPresent = hasArtifact(
    input.outputs,
    'detail_failures',
    'final'
  )
  const failedUrlsMatch =
    Array.isArray(result.failed_urls) &&
    failedUrls.length === result.failed_urls.length &&
    failedUrls.length === failed
  const reportedStatus = result.reported_status
  const succeededState =
    reportedStatus === 'succeeded' && failed === 0 && result.exit_code === 0
  const complete =
    combinedLinked &&
    summaryPresent &&
    failuresPresent &&
    countsReconcile &&
    failedUrlsMatch &&
    succeededState &&
    normalizeErrors(input.errors).length === 0
  let status = 'indeterminate'
  if (reportedStatus === 'failed' || normalizeErrors(input.errors).length > 0) {
    status = 'failed'
  } else if (complete) {
    status = 'succeeded'
  } else if (
    reportedStatus === 'partial' ||
    failed > 0 ||
    summaryPresent ||
    combinedLinked
  ) {
    status = 'partial'
  }
  const reasonCodes = []
  if (!combinedLinked) reasonCodes.push('DETAIL_IMPORT_QUEUE_LINK_MISSING')
  if (!summaryPresent) reasonCodes.push('DETAIL_IMPORT_SUMMARY_MISSING')
  if (!failuresPresent) reasonCodes.push('DETAIL_IMPORT_FAILURE_ARTIFACT_MISSING')
  if (!countsReconcile) reasonCodes.push('DETAIL_IMPORT_COUNTS_INCONSISTENT')
  if (!failedUrlsMatch) reasonCodes.push('DETAIL_IMPORT_FAILED_URLS_INCONSISTENT')
  if (reportedStatus === 'partial' && result.exit_code === 0) {
    reasonCodes.push('DETAIL_IMPORT_PARTIAL_WITH_ZERO_EXIT')
  }
  if (!isNonEmptyString(result.import_run_id)) {
    reasonCodes.push('DETAIL_IMPORT_RUN_ID_NOT_EVIDENCED')
  }

  return {
    status,
    reason_codes: reasonCodes,
    payload: {
      attempted,
      succeeded,
      failed,
      skipped,
      failed_urls: failedUrls,
      reported_status: reportedStatus,
      exit_code: result.exit_code,
      import_run_id: result.import_run_id,
      import_result: complete ? 'complete' : 'incomplete',
    },
  }
}

export function buildDetailImportEvidence(input = {}) {
  return baseEnvelope('detail_import', input, assessDetailImport(input))
}

function assessDetailRetry(input) {
  const result = input.result || {}
  const attempted = result.attempted
  const succeeded = result.succeeded
  const pending = result.pending_failed
  const pendingUrls = uniqueStrings(result.pending_failed_urls)
  const countsValid = [attempted, succeeded, pending].every(isNonNegativeInteger)
  const countsReconcile = countsValid && succeeded + pending === attempted
  const importLinked = hasArtifact(
    input.inputs,
    'initial_import_evidence',
    'final'
  )
  const failuresLinked = hasArtifact(
    input.inputs,
    'original_failures',
    'final'
  )
  const summaryPresent = hasArtifact(
    input.outputs,
    'detail_retry_summary',
    'final'
  )
  const pendingPresent = hasArtifact(
    input.outputs,
    'pending_failures',
    'final'
  )
  const pendingMatch =
    Array.isArray(result.pending_failed_urls) &&
    pendingUrls.length === result.pending_failed_urls.length &&
    pendingUrls.length === pending
  const complete =
    importLinked &&
    failuresLinked &&
    summaryPresent &&
    pendingPresent &&
    countsReconcile &&
    pendingMatch &&
    result.reported_status === 'succeeded' &&
    result.exit_code === 0 &&
    pending === 0 &&
    normalizeErrors(input.errors).length === 0
  let status = 'indeterminate'
  if (result.reported_status === 'failed' || normalizeErrors(input.errors).length) {
    status = 'failed'
  } else if (complete) {
    status = 'succeeded'
  } else if (attempted > 0 || summaryPresent || importLinked) {
    status = 'partial'
  }
  const reasonCodes = []
  if (!importLinked) reasonCodes.push('DETAIL_RETRY_IMPORT_LINK_MISSING')
  if (!failuresLinked) reasonCodes.push('DETAIL_RETRY_FAILURE_LIST_LINK_MISSING')
  if (!summaryPresent) reasonCodes.push('DETAIL_RETRY_SUMMARY_MISSING')
  if (!pendingPresent) reasonCodes.push('DETAIL_RETRY_PENDING_ARTIFACT_MISSING')
  if (!countsReconcile) reasonCodes.push('DETAIL_RETRY_COUNTS_INCONSISTENT')
  if (!pendingMatch) reasonCodes.push('DETAIL_RETRY_PENDING_URLS_INCONSISTENT')
  if (pending > 0) reasonCodes.push('DETAIL_RETRY_FAILURES_REMAIN')

  return {
    status,
    reason_codes: reasonCodes,
    payload: {
      attempted,
      succeeded,
      pending_failed: pending,
      pending_failed_urls: pendingUrls,
      reported_status: result.reported_status,
      exit_code: result.exit_code,
      import_run_id: result.import_run_id,
      retry_result: complete ? 'complete' : 'incomplete',
    },
  }
}

export function buildDetailRetryEvidence(input = {}) {
  return baseEnvelope('detail_retry', input, assessDetailRetry(input))
}

function assessEndedDeals(input) {
  const result = input.result || {}
  const listingLinked = hasArtifact(input.inputs, 'listing_json', 'final')
  const analysisPresent = hasArtifact(
    input.outputs,
    'ended_deals_analysis',
    'final'
  )
  const safe =
    listingLinked &&
    analysisPresent &&
    result.listing_complete_confirmed === true &&
    isNonNegativeInteger(result.candidates) &&
    result.application_performed === false &&
    normalizeErrors(input.errors).length === 0
  const status = safe
    ? 'succeeded'
    : normalizeErrors(input.errors).length > 0
      ? 'failed'
      : listingLinked || analysisPresent
        ? 'partial'
        : 'indeterminate'
  const reasonCodes = []
  if (!listingLinked) reasonCodes.push('ENDED_DEALS_LISTING_LINK_MISSING')
  if (!analysisPresent) reasonCodes.push('ENDED_DEALS_ARTIFACT_MISSING')
  if (result.listing_complete_confirmed !== true) {
    reasonCodes.push('ENDED_DEALS_LISTING_NOT_COMPLETE')
  }
  if (result.application_performed !== false) {
    reasonCodes.push('ENDED_DEALS_APPLICATION_NOT_ALLOWED')
  }

  return {
    status,
    reason_codes: reasonCodes,
    payload: {
      listing_complete_confirmed: result.listing_complete_confirmed,
      candidates: result.candidates,
      application_performed: false,
      blockers: uniqueStrings(result.blockers),
      analysis_result: safe ? 'complete' : 'incomplete',
    },
  }
}

export function buildEndedDealsAnalysisEvidence(input = {}) {
  return baseEnvelope('ended_deals_analysis', input, assessEndedDeals(input))
}

function reassessEnvelope(envelope) {
  const common = {
    identity: {
      local_cycle_id: envelope.local_cycle_id,
      run_token: envelope.run_token,
      remote_cycle_id: envelope.remote_cycle_id,
      region_code: envelope.region_code,
      storefront: envelope.storefront,
      mode: envelope.mode,
    },
    producer: {
      name: envelope.producer,
      version: envelope.producer_version,
      code_revision: envelope.code_revision,
    },
    timestamps: {
      started_at: envelope.started_at,
      finished_at: envelope.finished_at,
      generated_at: envelope.generated_at,
    },
    context: envelope.context,
    inputs: envelope.inputs,
    outputs: envelope.outputs,
    errors: envelope.errors,
    warnings: envelope.warnings,
  }

  switch (envelope.evidence_kind) {
    case 'listing_collection':
      return assessListing({
        ...common,
        collection: {
          ...envelope.payload,
          partial_artifact_present: envelope.payload?.partial_artifact_present,
        },
      })
    case 'fast_refresh_analysis':
      return assessFastRefresh({ ...common, analysis: envelope.payload })
    case 'detail_import':
      return assessDetailImport({ ...common, result: envelope.payload })
    case 'detail_retry':
      return assessDetailRetry({ ...common, result: envelope.payload })
    case 'ended_deals_analysis':
      return assessEndedDeals({ ...common, result: envelope.payload })
    default:
      return null
  }
}

export function validatePsdealsProducerEvidence(envelope, options = {}) {
  const generic = validatePsdealsEvidenceEnvelope(envelope, options)
  const errors = [...generic.errors]
  const warnings = [...generic.warnings]
  const assessment = envelope && isObject(envelope)
    ? reassessEnvelope(envelope)
    : null

  if (assessment && envelope.status !== assessment.status) {
    errors.push(
      issue(
        'EVIDENCE_PRODUCER_STATUS_INCONSISTENT',
        'status',
        `Declared status ${envelope.status} does not match ${assessment.status}.`
      )
    )
  }
  if (
    assessment &&
    JSON.stringify(uniqueStrings(envelope.reason_codes).sort()) !==
      JSON.stringify(uniqueStrings(assessment.reason_codes).sort())
  ) {
    errors.push(
      issue(
        'EVIDENCE_REASON_CODES_INCONSISTENT',
        'reason_codes',
        'Declared reason codes do not match the typed payload.'
      )
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    reason_codes: [...new Set([...errors, ...warnings].map((entry) => entry.code))],
    normalized_envelope: generic.normalized_envelope,
    is_success_evidence:
      errors.length === 0 && envelope?.status === 'succeeded',
  }
}
