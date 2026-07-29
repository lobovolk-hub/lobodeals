import {
  PSDEALS_CYCLE_MANIFEST_VERSION,
  validatePsdealsCycleManifest,
} from './psdeals-cycle-manifest.mjs'
import { validatePsdealsProducerEvidence } from './psdeals-evidence-producers.mjs'

export const PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES = Object.freeze({
  RECORD_INVALID: 'ASSEMBLY_RECORD_INVALID',
  EVIDENCE_INVALID: 'ASSEMBLY_EVIDENCE_INVALID',
  REQUIRED_STAGE_MISSING: 'ASSEMBLY_REQUIRED_STAGE_MISSING',
  RETRY_STAGE_MISSING: 'ASSEMBLY_RETRY_STAGE_MISSING',
  DUPLICATE_STAGE: 'ASSEMBLY_DUPLICATE_STAGE',
  LEGACY_UNTRACKED: 'ASSEMBLY_LEGACY_UNTRACKED',
  CYCLE_MISMATCH: 'ASSEMBLY_LOCAL_CYCLE_ID_MISMATCH',
  RUN_TOKEN_MISMATCH: 'ASSEMBLY_RUN_TOKEN_MISMATCH',
  REGION_MISMATCH: 'ASSEMBLY_REGION_MISMATCH',
  STOREFRONT_MISMATCH: 'ASSEMBLY_STOREFRONT_MISMATCH',
  FILTER_MISMATCH: 'ASSEMBLY_FILTER_FINGERPRINT_MISMATCH',
  TIMESTAMP_ORDER_INVALID: 'ASSEMBLY_TIMESTAMP_ORDER_INVALID',
  ARTIFACT_LINK_MISSING: 'ASSEMBLY_ARTIFACT_LINK_MISSING',
  ARTIFACT_HASH_MISMATCH: 'ASSEMBLY_ARTIFACT_HASH_MISMATCH',
  SOURCE_EVIDENCE_MISSING: 'ASSEMBLY_SOURCE_EVIDENCE_MISSING',
  SOURCE_EVIDENCE_HASH_MISMATCH: 'ASSEMBLY_SOURCE_EVIDENCE_HASH_MISMATCH',
  PRODUCER_STATUS_INCOMPLETE: 'ASSEMBLY_PRODUCER_STATUS_INCOMPLETE',
  GENERATED_AT_MISSING: 'ASSEMBLY_GENERATED_AT_MISSING',
  GENERATED_AT_INVALID: 'ASSEMBLY_GENERATED_AT_INVALID',
  MONTHLY_EVIDENCE_ABSENT: 'ASSEMBLY_MONTHLY_EVIDENCE_ABSENT',
  ENDED_DEALS_EVIDENCE_ABSENT: 'ASSEMBLY_ENDED_DEALS_EVIDENCE_ABSENT',
  REMOTE_LIFECYCLE_ABSENT: 'ASSEMBLY_REMOTE_LIFECYCLE_ABSENT',
})

const REQUIRED_KINDS = Object.freeze([
  'listing_collection',
  'fast_refresh_analysis',
  'detail_import',
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

function parseTimestamp(value) {
  if (!isNonEmptyString(value)) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function issue(code, path, message) {
  return { code, path, message }
}

function warning(code, path, message) {
  return { code, path, message }
}

function artifactByRole(references, role) {
  return (Array.isArray(references) ? references : []).find(
    (reference) => reference?.role === role
  )
}

function manifestArtifact(reference, runToken) {
  if (!reference) return null
  return {
    path: reference.path,
    sha256: reference.sha256,
    run_token: runToken,
  }
}

function sameArtifact(left, right) {
  return Boolean(
    left &&
      right &&
      left.sha256 === right.sha256 &&
      left.size_bytes === right.size_bytes &&
      left.artifact_kind === right.artifact_kind &&
      left.final_state === right.final_state
  )
}

function linkArtifacts({
  source,
  sourceRole,
  target,
  targetRole,
  fromKind,
  toKind,
  errors,
  edges,
}) {
  const output = artifactByRole(source?.outputs, sourceRole)
  const input = artifactByRole(target?.inputs, targetRole)
  const path = `${fromKind}.${sourceRole}->${toKind}.${targetRole}`

  if (!output || !input) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.ARTIFACT_LINK_MISSING,
        path,
        'Both producer output and consumer input references are required.'
      )
    )
    return false
  }
  if (!sameArtifact(output, input)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.ARTIFACT_HASH_MISMATCH,
        path,
        'Consumer input does not match the exact producer artifact.'
      )
    )
    return false
  }

  edges.push({
    from: fromKind,
    to: toKind,
    role: sourceRole,
    sha256: output.sha256,
  })
  return true
}

function normalizeRecords(input, errors) {
  if (!Array.isArray(input)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.RECORD_INVALID,
        'evidence_records',
        'Evidence records must be an array.'
      )
    )
    return []
  }

  return input.flatMap((entry, index) => {
    const record = isObject(entry?.envelope)
      ? entry
      : isObject(entry)
        ? { envelope: entry }
        : null
    if (!record) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.RECORD_INVALID,
          `evidence_records[${index}]`,
          'Each record must contain an evidence envelope.'
        )
      )
      return []
    }
    return [{
      envelope: record.envelope,
      source_artifact: record.source_artifact || null,
    }]
  })
}

function validateSharedIdentity(records, errors, incompatibleStages) {
  const anchor = records.find(
    (record) => record.envelope.evidence_kind === 'listing_collection'
  )?.envelope || records[0]?.envelope
  if (!anchor) return null

  for (const { envelope } of records) {
    const comparisons = [
      ['local_cycle_id', 'CYCLE_MISMATCH'],
      ['run_token', 'RUN_TOKEN_MISMATCH'],
      ['region_code', 'REGION_MISMATCH'],
      ['storefront', 'STOREFRONT_MISMATCH'],
    ]
    for (const [field, codeName] of comparisons) {
      if (envelope[field] !== anchor[field]) {
        errors.push(
          issue(
            PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES[codeName],
            `${envelope.evidence_kind}.${field}`,
            `${field} does not match the listing evidence.`
          )
        )
        incompatibleStages.add(envelope.evidence_kind)
      }
    }
    if (envelope.context?.fingerprint !== anchor.context?.fingerprint) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.FILTER_MISMATCH,
          `${envelope.evidence_kind}.context.fingerprint`,
          'Filter fingerprint does not match the listing evidence.'
        )
      )
      incompatibleStages.add(envelope.evidence_kind)
    }
  }
  return anchor
}

function validateTemporalOrder(stages, errors, incompatibleStages) {
  const pairs = [
    ['listing_collection', 'fast_refresh_analysis'],
    ['fast_refresh_analysis', 'detail_import'],
    ['detail_import', 'detail_retry'],
    ['listing_collection', 'ended_deals_analysis'],
  ]
  for (const [beforeKind, afterKind] of pairs) {
    const before = stages.get(beforeKind)?.envelope
    const after = stages.get(afterKind)?.envelope
    if (!before || !after) continue
    const beforeFinished = parseTimestamp(before.finished_at)
    const afterStarted = parseTimestamp(after.started_at)
    if (beforeFinished && afterStarted && afterStarted < beforeFinished) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.TIMESTAMP_ORDER_INVALID,
          `${beforeKind}->${afterKind}`,
          `${afterKind} started before ${beforeKind} finished.`
        )
      )
      incompatibleStages.add(afterKind)
    }
  }
}

function buildManifest({ stages, anchor, generatedAt }) {
  const listing = stages.get('listing_collection')?.envelope
  const fast = stages.get('fast_refresh_analysis')?.envelope
  const detail = stages.get('detail_import')?.envelope
  const retry = stages.get('detail_retry')?.envelope
  const ended = stages.get('ended_deals_analysis')?.envelope
  const runToken = anchor.run_token
  const listingArtifact = artifactByRole(listing.outputs, 'listing_json')
  const detailSummary = artifactByRole(detail.outputs, 'detail_import_summary')
  const retrySummary = artifactByRole(retry?.outputs, 'detail_retry_summary')
  const pendingFailures = retry?.payload?.pending_failed ?? detail.payload.failed
  const listingComplete =
    listing.status === 'succeeded' &&
    listing.payload.collection_result === 'complete'

  return {
    manifest_version: PSDEALS_CYCLE_MANIFEST_VERSION,
    identity: {
      local_cycle_id: anchor.local_cycle_id,
      run_token: runToken,
      remote_cycle_id: null,
      region_code: anchor.region_code,
      storefront: anchor.storefront,
      started_at: listing.started_at,
      generated_at: generatedAt,
      listing_observed_at: listing.finished_at,
      operation_mode:
        anchor.mode === 'real_recorded'
          ? 'real_recorded'
          : 'offline_validation',
      code_revision: listing.code_revision || null,
    },
    listing: {
      run_token: runToken,
      region_code: listing.region_code,
      storefront: listing.storefront,
      requested_url: listing.payload.requested_url,
      filters: {
        platforms: listing.context.platforms,
        content_types: listing.context.content_types,
      },
      pages_requested: listing.payload.pages_requested,
      pages_completed: listing.payload.pages_completed,
      failed_pages: listing.payload.failed_pages,
      pagination_final_observed: listing.payload.pagination_final_observed,
      stop_reason: listing.payload.stop_reason,
      total_results_detected: listing.payload.total_results_detected,
      total_collected: listing.payload.total_collected,
      unique_ids: listing.payload.unique_ids,
      duplicate_ids: listing.payload.duplicate_ids,
      result: listingComplete ? 'complete' : listing.payload.collection_result,
      is_partial_file:
        listing.payload.partial_artifact_present === true ||
        listingArtifact?.final_state !== 'final',
      completed_at: listing.finished_at,
      artifact: manifestArtifact(listingArtifact, runToken),
      baseline: null,
    },
    fast_refresh: {
      run_token: runToken,
      region_code: fast.region_code,
      storefront: fast.storefront,
      result: fast.payload.analysis_result === 'complete' ? 'complete' : 'partial',
      completed_at: fast.finished_at,
      artifacts: {
        summary: manifestArtifact(
          artifactByRole(fast.outputs, 'fast_refresh_summary'),
          runToken
        ),
        combined: manifestArtifact(
          artifactByRole(fast.outputs, 'combined_queue'),
          runToken
        ),
        must_refresh: manifestArtifact(
          artifactByRole(fast.outputs, 'must_refresh_queue'),
          runToken
        ),
        ps_plus_recheck: manifestArtifact(
          artifactByRole(fast.outputs, 'ps_plus_recheck_queue'),
          runToken
        ),
        stale: manifestArtifact(
          artifactByRole(fast.outputs, 'stale_queue'),
          runToken
        ),
        skipped: manifestArtifact(
          artifactByRole(fast.outputs, 'skipped_queue'),
          runToken
        ),
      },
      queues: {
        must_refresh: fast.payload.must_refresh,
        ps_plus_recheck: fast.payload.ps_plus_recheck,
        stale: fast.payload.stale,
      },
      combined_count: fast.payload.combined_count,
      overlap_count: fast.payload.overlap_count,
      duplicate_urls: fast.payload.duplicate_urls,
      skipped_count: fast.payload.skipped?.count,
    },
    detail_import: {
      run_token: runToken,
      region_code: detail.region_code,
      storefront: detail.storefront,
      attempted: detail.payload.attempted,
      succeeded: detail.payload.succeeded,
      failed: detail.payload.failed,
      skipped: detail.payload.skipped,
      reported_result: detail.payload.reported_status,
      exit_code: detail.payload.exit_code,
      failed_urls: detail.payload.failed_urls,
      ...(isNonEmptyString(detail.payload.import_run_id)
        ? { import_run_id: detail.payload.import_run_id }
        : {}),
      completed_at: retry?.finished_at || detail.finished_at,
      artifact: manifestArtifact(detailSummary, runToken),
      retry: retry
        ? {
            attempted: true,
            attempted_count: retry.payload.attempted,
            succeeded: retry.payload.succeeded,
            failed: retry.payload.pending_failed,
            pending_failed_urls: retry.payload.pending_failed_urls,
            artifact: manifestArtifact(retrySummary, runToken),
          }
        : {
            attempted: false,
            attempted_count: 0,
            succeeded: 0,
            failed: 0,
            pending_failed_urls: [],
          },
    },
    monthly_games: null,
    ended_deals: ended
      ? {
          run_token: runToken,
          region_code: ended.region_code,
          storefront: ended.storefront,
          checked: true,
          checked_at: ended.finished_at,
          listing_complete_confirmed:
            ended.payload.listing_complete_confirmed === true && listingComplete,
          candidates: ended.payload.candidates,
          applied: 0,
          failed: 0,
          result:
            ended.payload.candidates === 0
              ? 'no_candidates'
              : 'candidates_found',
          evidence: manifestArtifact(
            artifactByRole(ended.outputs, 'ended_deals_analysis'),
            runToken
          ),
        }
      : null,
    cycle_state: {
      status: 'running',
      items_seen: listing.payload.unique_ids,
      items_failed: isNonNegativeInteger(pendingFailures)
        ? pendingFailures
        : detail.payload.failed,
      failure_reason:
        isNonNegativeInteger(pendingFailures) && pendingFailures > 0
          ? 'detail_failures_pending'
          : null,
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

export function assemblePsdealsCycleManifest(evidenceRecordsInput, options = {}) {
  const errors = []
  const warnings = []
  const incompatibleStages = new Set()
  const missingStages = new Set()
  const records = normalizeRecords(evidenceRecordsInput, errors)
  const stages = new Map()

  for (const record of records) {
    const envelope = record.envelope
    const validation = validatePsdealsProducerEvidence(envelope, {
      now: options.now,
      futureToleranceMs: options.futureToleranceMs,
    })
    if (!validation.valid) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.EVIDENCE_INVALID,
          envelope?.evidence_kind || 'unknown',
          validation.reason_codes.join(', ') || 'Evidence is invalid.'
        )
      )
      incompatibleStages.add(envelope?.evidence_kind || 'unknown')
      continue
    }
    if (envelope.mode === 'legacy_untracked' || envelope.status === 'untracked') {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.LEGACY_UNTRACKED,
          envelope.evidence_kind,
          'Legacy or untracked evidence cannot be assembled into a linked cycle.'
        )
      )
      incompatibleStages.add(envelope.evidence_kind)
      continue
    }
    if (stages.has(envelope.evidence_kind)) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.DUPLICATE_STAGE,
          envelope.evidence_kind,
          'More than one evidence envelope claims the same stage.'
        )
      )
      incompatibleStages.add(envelope.evidence_kind)
      continue
    }
    stages.set(envelope.evidence_kind, record)
  }

  for (const kind of REQUIRED_KINDS) {
    if (!stages.has(kind)) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.REQUIRED_STAGE_MISSING,
          kind,
          `${kind} evidence is required to assemble the producer chain.`
        )
      )
      missingStages.add(kind)
    }
  }

  const anchor = validateSharedIdentity(
    [...stages.values()],
    errors,
    incompatibleStages
  )
  validateTemporalOrder(stages, errors, incompatibleStages)

  const edges = []
  const listing = stages.get('listing_collection')?.envelope
  const fast = stages.get('fast_refresh_analysis')?.envelope
  const detail = stages.get('detail_import')?.envelope
  const retry = stages.get('detail_retry')?.envelope
  const ended = stages.get('ended_deals_analysis')?.envelope

  if (listing && fast) {
    linkArtifacts({
      source: listing,
      sourceRole: 'listing_json',
      target: fast,
      targetRole: 'listing_json',
      fromKind: 'listing_collection',
      toKind: 'fast_refresh_analysis',
      errors,
      edges,
    })
  }
  if (fast && detail) {
    linkArtifacts({
      source: fast,
      sourceRole: 'combined_queue',
      target: detail,
      targetRole: 'combined_queue',
      fromKind: 'fast_refresh_analysis',
      toKind: 'detail_import',
      errors,
      edges,
    })
  }
  if (listing && ended) {
    linkArtifacts({
      source: listing,
      sourceRole: 'listing_json',
      target: ended,
      targetRole: 'listing_json',
      fromKind: 'listing_collection',
      toKind: 'ended_deals_analysis',
      errors,
      edges,
    })
  }

  const initialFailed = detail?.payload?.failed
  if (isNonNegativeInteger(initialFailed) && initialFailed > 0 && !retry) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.RETRY_STAGE_MISSING,
        'detail_retry',
        'Initial detail failures require linked retry evidence.'
      )
    )
    missingStages.add('detail_retry')
  }
  if (detail && retry) {
    linkArtifacts({
      source: detail,
      sourceRole: 'detail_failures',
      target: retry,
      targetRole: 'original_failures',
      fromKind: 'detail_import',
      toKind: 'detail_retry',
      errors,
      edges,
    })
    const detailSource = stages.get('detail_import')?.source_artifact
    const retrySource = artifactByRole(retry.inputs, 'initial_import_evidence')
    if (!detailSource || !retrySource) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.SOURCE_EVIDENCE_MISSING,
          'detail_import->detail_retry',
          'Retry requires the hashed source envelope of the initial import.'
        )
      )
    } else if (
      !sameArtifact(detailSource, retrySource) ||
      retrySource.local_cycle_id !== detail.local_cycle_id ||
      retrySource.run_token !== detail.run_token
    ) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.SOURCE_EVIDENCE_HASH_MISMATCH,
          'detail_import->detail_retry',
          'Retry does not reference the exact initial import evidence envelope.'
        )
      )
    } else {
      edges.push({
        from: 'detail_import_evidence',
        to: 'detail_retry',
        role: 'initial_import_evidence',
        sha256: detailSource.sha256,
      })
    }
  }

  if (listing?.status !== 'succeeded') {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.PRODUCER_STATUS_INCOMPLETE,
        'listing_collection.status',
        'Listing evidence must report succeeded.'
      )
    )
  }
  if (fast?.status !== 'succeeded') {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.PRODUCER_STATUS_INCOMPLETE,
        'fast_refresh_analysis.status',
        'Fast-refresh evidence must report succeeded.'
      )
    )
  }
  if (retry && retry.status !== 'succeeded') {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.PRODUCER_STATUS_INCOMPLETE,
        'detail_retry.status',
        'Retry evidence must resolve every pending failure.'
      )
    )
  }

  const generatedAt = parseTimestamp(options.generated_at)
  if (!isNonEmptyString(options.generated_at)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.GENERATED_AT_MISSING,
        'generated_at',
        'Manifest generation timestamp must be supplied explicitly.'
      )
    )
  } else if (!generatedAt) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.GENERATED_AT_INVALID,
        'generated_at',
        'Manifest generation timestamp must be a valid ISO timestamp.'
      )
    )
  } else {
    const latestEvidenceTime = [...stages.values()]
      .map(({ envelope }) => parseTimestamp(envelope.finished_at))
      .filter(Boolean)
      .sort((left, right) => right.getTime() - left.getTime())[0]
    const now = parseTimestamp(options.now)
    const tolerance = Number.isFinite(options.futureToleranceMs)
      ? options.futureToleranceMs
      : 5 * 60 * 1000
    if (
      (latestEvidenceTime && generatedAt < latestEvidenceTime) ||
      (now && generatedAt.getTime() > now.getTime() + tolerance)
    ) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.GENERATED_AT_INVALID,
          'generated_at',
          'Manifest generation timestamp is before evidence completion or beyond future tolerance.'
        )
      )
    }
  }

  missingStages.add('monthly_games')
  warnings.push(
    warning(
      PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.MONTHLY_EVIDENCE_ABSENT,
      'monthly_games',
      'Monthly PS Plus evidence is outside the implemented producer chain.'
    )
  )
  if (!ended) {
    missingStages.add('ended_deals_analysis')
    warnings.push(
      warning(
        PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.ENDED_DEALS_EVIDENCE_ABSENT,
        'ended_deals_analysis',
        'Ended-deals analysis evidence is absent.'
      )
    )
  }
  missingStages.add('remote_lifecycle')
  warnings.push(
    warning(
      PSDEALS_EVIDENCE_ASSEMBLY_REASON_CODES.REMOTE_LIFECYCLE_ABSENT,
      'identity.remote_cycle_id',
      'No remote cycle lifecycle or certification evidence was created.'
    )
  )

  const assembled = errors.length === 0
  const manifest = assembled
    ? buildManifest({ stages, anchor, generatedAt: options.generated_at })
    : null
  const manifestValidation = manifest
    ? validatePsdealsCycleManifest(manifest, {
        now: options.now,
        futureToleranceMs: options.futureToleranceMs,
      })
    : null

  return {
    assembled,
    errors,
    warnings,
    reason_codes: [
      ...new Set([...errors, ...warnings].map((entry) => entry.code)),
    ],
    evidence_graph: {
      local_cycle_id: anchor?.local_cycle_id || null,
      run_token: anchor?.run_token || null,
      nodes: [...stages.values()].map(({ envelope, source_artifact }) => ({
        evidence_kind: envelope.evidence_kind,
        producer: envelope.producer,
        status: envelope.status,
        source_sha256: source_artifact?.sha256 || null,
      })),
      edges,
    },
    manifest,
    manifest_validation: manifestValidation,
    missing_stages: [...missingStages],
    incompatible_stages: [...incompatibleStages],
  }
}
