import {
  sha256PsdealsBytes,
  stablePsdealsEvidenceJson,
} from './psdeals-evidence-envelope.mjs'

export const PSDEALS_CYCLE_MIGRATION_VERSION = 4

export const PSDEALS_CYCLE_MIGRATION_STATES = Object.freeze([
  'MIGRATION_NOT_APPLIED',
  'MIGRATION_PARTIALLY_APPLIED',
  'MIGRATION_CONTRACT_MISMATCH',
  'MIGRATION_READY',
  'LIVE_CYCLE_READY',
  'NOT_READY',
])

export const PSDEALS_CYCLE_RECEIPT_KINDS = Object.freeze([
  'create_cycle',
  'listing_validation',
  'listing_upsert_batch',
  'fast_refresh_analysis',
  'detail_import',
  'detail_retry',
  'monthly_check_record',
  'ended_deals_analysis',
  'demotion_apply',
  'mark_succeeded',
  'certify',
  'cache_refresh',
  'public_validation',
  'metrics_record',
])

export const PSDEALS_CYCLE_MIGRATION_CONTRACT = Object.freeze({
  migration_file: 'sql/004-lobodeals-3-reconciliable-cycle-actions.sql',
  audited_function_sha256: Object.freeze({
    certify_price_refresh_cycle: '3dfa2232903c014039f070f48d4044ffe0b329e38cb86615b9bdbc20c4f9aa88',
    refresh_catalog_public_cache_v15: '1c6e71d26e6554e6f8fdf2e6ed0388db959419db4ee64132d8ddd5761b3996dc',
  }),
  cycle_columns: Object.freeze([
    'local_cycle_id',
    'run_token_sha256',
    'code_revision',
    'filter_fingerprint',
    'manifest_hash',
    'mode',
    'listing_complete',
    'cache_refreshed_at',
    'public_validation_completed_at',
    'metrics_recorded_at',
  ]),
  cycle_indexes: Object.freeze([
    'price_refresh_cycles_local_cycle_id_unique_idx',
    'price_refresh_cycles_run_token_sha256_unique_idx',
    'price_refresh_cycles_local_identity_unique_idx',
  ]),
  receipt_columns: Object.freeze([
    'id',
    'cycle_id',
    'parent_receipt_id',
    'action_kind',
    'idempotency_key',
    'attempt',
    'request_hash',
    'input_artifact_hash',
    'status',
    'started_at',
    'finished_at',
    'affected_rows',
    'result',
    'error_code',
    'created_at',
    'updated_at',
  ]),
  receipt_indexes: Object.freeze([
    'psdeals_cycle_action_receipts_pkey',
    'psdeals_cycle_action_receipts_idempotency_unique',
    'psdeals_cycle_action_receipts_cycle_kind_status_idx',
    'psdeals_cycle_action_receipts_parent_idx',
  ]),
  functions: Object.freeze({
    begin_psdeals_cycle_action_v1:
      'p_cycle_id uuid, p_parent_receipt_id uuid, p_action_kind text, p_idempotency_key text, p_attempt integer, p_request_hash text, p_input_artifact_hash text, p_started_at timestamp with time zone',
    finish_psdeals_cycle_action_v1:
      'p_receipt_id uuid, p_cycle_id uuid, p_idempotency_key text, p_request_hash text, p_status text, p_finished_at timestamp with time zone, p_affected_rows integer, p_result jsonb, p_error_code text',
    create_or_reconcile_price_refresh_cycle_v1:
      'p_local_cycle_id text, p_run_token_sha256 text, p_code_revision text, p_filter_fingerprint text, p_manifest_hash text, p_mode text, p_region_code text, p_storefront text, p_cycle_date date, p_started_at timestamp with time zone, p_idempotency_key text, p_request_hash text',
    record_psdeals_listing_completion_v1:
      'p_cycle_id uuid, p_idempotency_key text, p_request_hash text, p_listing_artifact_hash text, p_filter_fingerprint text, p_listing_observed_at timestamp with time zone, p_items_seen integer, p_pages_failed integer, p_duplicate_ids integer, p_is_partial boolean, p_termination_observed boolean, p_started_at timestamp with time zone, p_finished_at timestamp with time zone',
    record_psdeals_monthly_check_v1:
      'p_cycle_id uuid, p_idempotency_key text, p_request_hash text, p_checked_at timestamp with time zone, p_source_type text, p_source_reference text, p_procedure text, p_procedure_version text, p_evidence_hash text, p_result text, p_proposed_changes_count integer, p_application_performed boolean, p_started_at timestamp with time zone, p_finished_at timestamp with time zone',
    apply_psdeals_ended_deals_v1:
      'p_cycle_id uuid, p_ended_analysis_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_listing_artifact_hash text, p_analysis_evidence_hash text, p_candidate_set_hash text, p_candidate_psdeals_ids bigint[], p_expected_count integer, p_applied_at timestamp with time zone',
    mark_psdeals_price_refresh_cycle_succeeded_v1:
      'p_cycle_id uuid, p_demotion_receipt_id uuid, p_required_receipt_ids uuid[], p_idempotency_key text, p_request_hash text, p_manifest_hash text, p_details_completed_at timestamp with time zone, p_validation_completed_at timestamp with time zone, p_finished_at timestamp with time zone, p_items_updated integer, p_items_failed integer, p_new_items_detected integer, p_metrics jsonb',
    certify_price_refresh_cycle_v2:
      'p_cycle_id uuid, p_mark_succeeded_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_started_at timestamp with time zone',
    refresh_catalog_public_cache_v16:
      'p_cycle_id uuid, p_certification_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_started_at timestamp with time zone',
  }),
})

const HASH_PATTERN = /^[a-f0-9]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function set(values) {
  return new Set(Array.isArray(values) ? values : [])
}

function missing(required, actual) {
  const available = set(actual)
  return required.filter((value) => !available.has(value))
}

function issue(code, path, detail = null) {
  return { code, path, detail }
}

export function canonicalizePsdealsDemotionCandidateIds(values) {
  if (!Array.isArray(values)) throw new Error('DEMOTION_CANDIDATE_IDS_REQUIRED')
  const normalized = values.map((value) => Number(value))
  if (normalized.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error('DEMOTION_CANDIDATE_ID_INVALID')
  }
  return [...new Set(normalized)].sort((left, right) => left - right)
}

export function hashPsdealsDemotionCandidateIds(values) {
  return sha256PsdealsBytes(
    canonicalizePsdealsDemotionCandidateIds(values).join('\n')
  )
}

export function hashPsdealsOperationalRequest(value) {
  return sha256PsdealsBytes(stablePsdealsEvidenceJson(value))
}

export function validatePsdealsRemoteActionReceipt(receipt, expected = {}) {
  const errors = []
  if (!UUID_PATTERN.test(String(receipt?.id || ''))) errors.push('receipt_id_invalid')
  if (!UUID_PATTERN.test(String(receipt?.cycle_id || ''))) errors.push('receipt_cycle_id_invalid')
  if (!PSDEALS_CYCLE_RECEIPT_KINDS.includes(receipt?.action_kind)) errors.push('receipt_action_kind_invalid')
  if (!['intent', 'running', 'committed', 'failed', 'indeterminate'].includes(receipt?.status)) {
    errors.push('receipt_status_invalid')
  }
  if (!HASH_PATTERN.test(String(receipt?.request_hash || ''))) errors.push('receipt_request_hash_invalid')
  if (receipt?.input_artifact_hash != null && !HASH_PATTERN.test(String(receipt.input_artifact_hash))) {
    errors.push('receipt_input_hash_invalid')
  }
  for (const [field, value] of Object.entries({
    cycle_id: expected.cycle_id,
    action_kind: expected.action_kind,
    idempotency_key: expected.idempotency_key,
    request_hash: expected.request_hash,
    input_artifact_hash: expected.input_artifact_hash,
    parent_receipt_id: expected.parent_receipt_id,
  })) {
    if (value !== undefined && receipt?.[field] !== value) errors.push(`receipt_${field}_mismatch`)
  }
  return {
    valid: errors.length === 0,
    errors,
    terminal: ['committed', 'failed', 'indeterminate'].includes(receipt?.status),
    committed: receipt?.status === 'committed' && errors.length === 0,
  }
}

function migrationFootprint(facts) {
  const cycleColumns = set(facts?.objects?.price_refresh_cycles?.columns)
  const functionNames = Object.keys(PSDEALS_CYCLE_MIGRATION_CONTRACT.functions)
  return {
    cycle_columns: PSDEALS_CYCLE_MIGRATION_CONTRACT.cycle_columns.filter((value) => cycleColumns.has(value)),
    receipt_table: facts?.objects?.psdeals_cycle_action_receipts?.exists === true,
    functions: functionNames.filter((name) => facts?.functions?.[name]?.exists === true),
  }
}

export function evaluatePsdealsCycleMigrationFacts(facts = {}) {
  const errors = []
  const blockers = []
  const footprint = migrationFootprint(facts)
  const footprintCount = footprint.cycle_columns.length + footprint.functions.length + Number(footprint.receipt_table)
  const expectedFootprintCount =
    PSDEALS_CYCLE_MIGRATION_CONTRACT.cycle_columns.length +
    Object.keys(PSDEALS_CYCLE_MIGRATION_CONTRACT.functions).length + 1

  if (facts?.objects?.price_refresh_cycles?.exists !== true) {
    blockers.push(issue('MIGRATION_BASE_CYCLE_TABLE_MISSING', 'objects.price_refresh_cycles'))
  }
  if (
    footprintCount < expectedFootprintCount &&
    (facts?.measurements?.price_refresh_cycles ?? facts?.objects?.price_refresh_cycles?.exact_rows) !== 0
  ) {
    blockers.push(issue('MIGRATION_BASE_CYCLE_ROWS_PRESENT', 'measurements.price_refresh_cycles'))
  }

  const cycleObject = facts?.objects?.price_refresh_cycles || {}
  const receiptObject = facts?.objects?.psdeals_cycle_action_receipts || {}
  const missingCycleColumns = missing(
    PSDEALS_CYCLE_MIGRATION_CONTRACT.cycle_columns,
    cycleObject.columns
  )
  const missingCycleIndexes = missing(
    PSDEALS_CYCLE_MIGRATION_CONTRACT.cycle_indexes,
    cycleObject.indexes
  )
  const missingReceiptColumns = missing(
    PSDEALS_CYCLE_MIGRATION_CONTRACT.receipt_columns,
    receiptObject.columns
  )
  const missingReceiptIndexes = missing(
    PSDEALS_CYCLE_MIGRATION_CONTRACT.receipt_indexes,
    receiptObject.indexes
  )

  let incompatible = false
  if (receiptObject.exists === true && receiptObject.object_type !== 'table') {
    incompatible = true
    errors.push(issue('MIGRATION_RECEIPT_OBJECT_TYPE_MISMATCH', 'objects.psdeals_cycle_action_receipts'))
  }
  if (receiptObject.exists === true && (
    missingReceiptColumns.length > 0 ||
    missingReceiptIndexes.length > 0 ||
    receiptObject.rls_enabled !== true ||
    receiptObject.anon_write === true ||
    receiptObject.authenticated_write === true
  )) {
    incompatible = true
    errors.push(issue('MIGRATION_RECEIPT_CONTRACT_MISMATCH', 'objects.psdeals_cycle_action_receipts', {
      missing_columns: missingReceiptColumns,
      missing_indexes: missingReceiptIndexes,
    }))
  }

  for (const [name, identityArguments] of Object.entries(PSDEALS_CYCLE_MIGRATION_CONTRACT.functions)) {
    const fn = facts?.functions?.[name]
    if (!fn?.exists) continue
    if (
      fn.identity_arguments !== identityArguments ||
      fn.security_definer !== true ||
      fn.search_path_empty !== true ||
      fn.anon_execute !== false ||
      fn.authenticated_execute !== false ||
      fn.service_role_execute !== true ||
      fn.definition_verified !== true
    ) {
      incompatible = true
      errors.push(issue('MIGRATION_FUNCTION_CONTRACT_MISMATCH', `functions.${name}`))
    }
  }

  let migrationStatus
  if (blockers.some((entry) => entry.code === 'MIGRATION_BASE_CYCLE_TABLE_MISSING')) {
    migrationStatus = 'NOT_READY'
  } else if (footprintCount === 0) {
    migrationStatus = 'MIGRATION_NOT_APPLIED'
  } else if (incompatible) {
    migrationStatus = 'MIGRATION_CONTRACT_MISMATCH'
  } else if (
    footprintCount < expectedFootprintCount ||
    missingCycleColumns.length > 0 ||
    missingCycleIndexes.length > 0 ||
    missingReceiptColumns.length > 0 ||
    missingReceiptIndexes.length > 0
  ) {
    migrationStatus = 'MIGRATION_PARTIALLY_APPLIED'
  } else {
    migrationStatus = facts.live_cycle_prerequisites_verified === true
      ? 'LIVE_CYCLE_READY'
      : 'MIGRATION_READY'
  }

  const ready = migrationStatus === 'MIGRATION_READY' || migrationStatus === 'LIVE_CYCLE_READY'
  return {
    migration_version: PSDEALS_CYCLE_MIGRATION_VERSION,
    migration_status: migrationStatus,
    ready,
    valid: errors.length === 0,
    errors,
    blockers,
    reason_codes: [...new Set([...errors, ...blockers].map((entry) => entry.code))],
    footprint,
    missing: {
      cycle_columns: missingCycleColumns,
      cycle_indexes: missingCycleIndexes,
      receipt_columns: missingReceiptColumns,
      receipt_indexes: missingReceiptIndexes,
      functions: Object.keys(PSDEALS_CYCLE_MIGRATION_CONTRACT.functions)
        .filter((name) => facts?.functions?.[name]?.exists !== true),
    },
  }
}

function functionBlocks(sql) {
  return [...sql.matchAll(/create function\s+([^\s(]+)[\s\S]*?\$function\$;/gi)]
    .map((match) => ({ name: match[1], sql: match[0] }))
}

export function validatePsdealsCycleMigrationSql(sqlInput) {
  const sql = String(sqlInput || '')
  const errors = []
  const requireText = (text, code) => {
    if (!sql.includes(text)) errors.push(code)
  }

  requireText('begin;', 'migration_transaction_begin_missing')
  requireText('commit;', 'migration_transaction_commit_missing')
  requireText('lock table public.price_refresh_cycles in access exclusive mode;', 'migration_cycle_lock_missing')
  requireText("cycle_count <> 0", 'migration_zero_cycle_precondition_missing')
  requireText(PSDEALS_CYCLE_MIGRATION_CONTRACT.audited_function_sha256.certify_price_refresh_cycle, 'migration_certify_sha_missing')
  requireText(PSDEALS_CYCLE_MIGRATION_CONTRACT.audited_function_sha256.refresh_catalog_public_cache_v15, 'migration_cache_sha_missing')
  requireText('on delete restrict', 'migration_receipt_retention_missing')
  requireText('pg_column_size(result) <= 16384', 'migration_receipt_result_bound_missing')
  requireText('price_refresh_cycles_local_cycle_id_unique_idx', 'migration_local_cycle_unique_missing')
  requireText('price_refresh_cycles_run_token_sha256_unique_idx', 'migration_run_token_unique_missing')
  requireText("set search_path = ''", 'migration_empty_search_path_missing')

  if (/\b(?:create\s+(?:table|index|function)|add\s+(?:column|constraint))\s+if\s+not\s+exists\b/i.test(sql)) {
    errors.push('migration_if_not_exists_forbidden')
  }
  if (/\bcreate\s+or\s+replace\b/i.test(sql)) errors.push('migration_create_or_replace_forbidden')
  if (/\bcascade\b/i.test(sql)) errors.push('migration_cascade_forbidden')
  if (/^\s*(drop|delete|truncate)\b/im.test(sql)) errors.push('migration_destructive_statement_forbidden')
  if (/\bexecute\s+(?:format\s*\(|['"])/i.test(sql)) errors.push('migration_dynamic_sql_forbidden')
  if (/psdeals_stage_price_history\s*(?:set|where|values|\()/i.test(sql)) {
    errors.push('migration_price_history_mutation_suspected')
  }

  const blocks = functionBlocks(sql)
  if (blocks.length !== 12) errors.push('migration_function_count_mismatch')
  for (const block of blocks) {
    if (/security definer/i.test(block.sql) && !/set search_path\s*=\s*''/i.test(block.sql)) {
      errors.push(`migration_security_definer_search_path_missing:${block.name}`)
    }
  }
  for (const functionName of Object.keys(PSDEALS_CYCLE_MIGRATION_CONTRACT.functions)) {
    requireText(`create function public.${functionName}(`, `migration_function_missing:${functionName}`)
    requireText(`grant execute on function public.${functionName}(`, `migration_function_service_grant_missing:${functionName}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    function_count: blocks.length,
    uses_postgres_execution: false,
    static_validation_only: true,
  }
}
