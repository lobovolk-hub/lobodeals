import {
  sha256PsdealsBytes,
  stablePsdealsEvidenceJson,
} from './psdeals-evidence-envelope.mjs'

export const PSDEALS_MIGRATION_004_SHA256 =
  '712af68ff12934f7f3f7648b6e629e84610e576fbc4d044ccf74a8bd18630dbf'

export const PSDEALS_MIGRATION_004_PATH =
  'sql/004-lobodeals-3-reconciliable-cycle-actions.sql'

export const PSDEALS_MIGRATION_004_RECOVERY_PATH =
  'sql/recovery/004-lobodeals-3-reconciliable-cycle-actions-before-use.sql'

export const PSDEALS_MIGRATION_004_RECOVERY_FUNCTIONS = Object.freeze({
  _begin_psdeals_cycle_action_v1:
    'uuid, uuid, text, text, integer, text, text, timestamptz',
  _finish_psdeals_cycle_action_v1:
    'uuid, uuid, text, text, text, timestamptz, integer, jsonb, text',
  begin_psdeals_cycle_action_v1:
    'uuid, uuid, text, text, integer, text, text, timestamptz',
  finish_psdeals_cycle_action_v1:
    'uuid, uuid, text, text, text, timestamptz, integer, jsonb, text',
  protect_price_refresh_cycle_identity_v1: '',
  create_or_reconcile_price_refresh_cycle_v1:
    'text, text, text, text, text, text, text, text, date, timestamptz, text, text',
  record_psdeals_listing_completion_v1:
    'uuid, text, text, text, text, timestamptz, integer, integer, integer, boolean, boolean, timestamptz, timestamptz',
  record_psdeals_monthly_check_v1:
    'uuid, text, text, timestamptz, text, text, text, text, text, text, integer, boolean, timestamptz, timestamptz',
  apply_psdeals_ended_deals_v1:
    'uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz',
  mark_psdeals_price_refresh_cycle_succeeded_v1:
    'uuid, uuid, uuid[], text, text, text, timestamptz, timestamptz, timestamptz, integer, integer, integer, jsonb',
  certify_price_refresh_cycle_v2:
    'uuid, uuid, text, text, timestamptz',
  refresh_catalog_public_cache_v16:
    'uuid, uuid, text, text, timestamptz',
})

export const PSDEALS_MIGRATION_004_CYCLE_COLUMNS = Object.freeze([
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
])

export const PSDEALS_MIGRATION_004_CYCLE_CONSTRAINTS = Object.freeze([
  'price_refresh_cycles_local_cycle_id_check',
  'price_refresh_cycles_run_token_sha256_check',
  'price_refresh_cycles_code_revision_check',
  'price_refresh_cycles_filter_fingerprint_check',
  'price_refresh_cycles_manifest_hash_check',
  'price_refresh_cycles_mode_check',
  'price_refresh_cycles_scope_check',
  'price_refresh_cycles_listing_complete_check',
  'price_refresh_cycles_operational_timestamps_check',
])

export const PSDEALS_MIGRATION_004_CYCLE_INDEXES = Object.freeze([
  'price_refresh_cycles_local_cycle_id_unique_idx',
  'price_refresh_cycles_run_token_sha256_unique_idx',
  'price_refresh_cycles_local_identity_unique_idx',
])

export const PSDEALS_MIGRATION_004_RECEIPT_COLUMNS = Object.freeze([
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
])

export const PSDEALS_MIGRATION_004_RECEIPT_CONSTRAINTS = Object.freeze([
  'psdeals_cycle_action_receipts_pkey',
  'psdeals_cycle_action_receipts_cycle_fkey',
  'psdeals_cycle_action_receipts_parent_fkey',
  'psdeals_cycle_action_receipts_kind_check',
  'psdeals_cycle_action_receipts_key_check',
  'psdeals_cycle_action_receipts_attempt_check',
  'psdeals_cycle_action_receipts_request_hash_check',
  'psdeals_cycle_action_receipts_input_hash_check',
  'psdeals_cycle_action_receipts_status_check',
  'psdeals_cycle_action_receipts_timestamps_check',
  'psdeals_cycle_action_receipts_counts_check',
  'psdeals_cycle_action_receipts_result_check',
  'psdeals_cycle_action_receipts_error_check',
  'psdeals_cycle_action_receipts_idempotency_unique',
])

export const PSDEALS_MIGRATION_004_RECEIPT_INDEXES = Object.freeze([
  'psdeals_cycle_action_receipts_pkey',
  'psdeals_cycle_action_receipts_idempotency_unique',
  'psdeals_cycle_action_receipts_cycle_kind_status_idx',
  'psdeals_cycle_action_receipts_parent_idx',
])

export const PSDEALS_MIGRATION_004_TRIGGERS = Object.freeze([
  'trg_price_refresh_cycles_protect_identity_v1',
  'trg_psdeals_cycle_action_receipts_set_updated_at',
])

export const PSDEALS_MIGRATION_004_CONTROL_PLANE_MUTATION = Object.freeze({
  operation: 'record_migration_application',
  object_type: 'supabase_migration_history',
  object: 'supabase_migrations.schema_migrations',
  performed_by: 'Supabase apply_migration control plane',
  existed_before: false,
  existing_data_affected: 'one migration-history record may be added outside the SQL transaction text',
  inverse: 'after the recovery transaction succeeds, reconcile the exact version separately with the documented Supabase migration repair workflow',
  inverse_preconditions: [
    'exact applied migration version identified with the migration-history API',
    'recovery transaction committed and postcheck passed',
    'separate explicit authorization',
  ],
  direct_history_sql_forbidden: true,
  included_in_recovery_sql: false,
  risk: 'high',
})

function firstCodeLine(raw, initialLine) {
  const lines = raw.split(/\r?\n/)
  let insideBlockComment = false
  for (let index = 0; index < lines.length; index += 1) {
    let value = lines[index].trim()
    if (!value) continue
    if (insideBlockComment) {
      const end = value.indexOf('*/')
      if (end < 0) continue
      insideBlockComment = false
      value = value.slice(end + 2).trim()
      if (!value) continue
    }
    if (value.startsWith('/*')) {
      const end = value.indexOf('*/', 2)
      if (end < 0) {
        insideBlockComment = true
        continue
      }
      value = value.slice(end + 2).trim()
      if (!value) continue
    }
    if (value.startsWith('--')) continue
    return initialLine + index
  }
  return initialLine
}

function stripLeadingComments(raw) {
  return raw
    .replace(/^(?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)+/, '')
    .trim()
}

export function splitPsdealsSqlStatements(sqlInput) {
  const sql = String(sqlInput || '')
  const statements = []
  let state = 'default'
  let dollarTag = null
  let blockDepth = 0
  let startOffset = 0
  let startLine = 1
  let line = 1

  const pushStatement = (endOffset, endLine) => {
    const raw = sql.slice(startOffset, endOffset + 1)
    const executable = stripLeadingComments(raw)
    if (executable) {
      statements.push({
        statement_index: statements.length + 1,
        line_start: firstCodeLine(raw, startLine),
        line_end: endLine,
        sql: executable,
      })
    }
    startOffset = endOffset + 1
    startLine = endLine
  }

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (char === '\n') line += 1

    if (state === 'line_comment') {
      if (char === '\n') state = 'default'
      continue
    }
    if (state === 'block_comment') {
      if (char === '/' && next === '*') {
        blockDepth += 1
        index += 1
      } else if (char === '*' && next === '/') {
        blockDepth -= 1
        index += 1
        if (blockDepth === 0) state = 'default'
      }
      continue
    }
    if (state === 'single_quote') {
      if (char === "'" && next === "'") index += 1
      else if (char === "'") state = 'default'
      continue
    }
    if (state === 'double_quote') {
      if (char === '"' && next === '"') index += 1
      else if (char === '"') state = 'default'
      continue
    }
    if (state === 'dollar_quote') {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1
        state = 'default'
        dollarTag = null
      }
      continue
    }

    if (char === '-' && next === '-') {
      state = 'line_comment'
      index += 1
    } else if (char === '/' && next === '*') {
      state = 'block_comment'
      blockDepth = 1
      index += 1
    } else if (char === "'") {
      state = 'single_quote'
    } else if (char === '"') {
      state = 'double_quote'
    } else if (char === '$') {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
      if (match) {
        dollarTag = match[0]
        state = 'dollar_quote'
        index += dollarTag.length - 1
      }
    } else if (char === ';') {
      pushStatement(index, line)
    }
  }

  const remainder = sql.slice(startOffset)
  if (stripLeadingComments(remainder)) {
    statements.push({
      statement_index: statements.length + 1,
      line_start: firstCodeLine(remainder, startLine),
      line_end: line,
      sql: stripLeadingComments(remainder),
    })
  }
  return statements
}

export function classifyPsdealsSqlStatement(sqlInput) {
  const sql = stripLeadingComments(String(sqlInput || ''))
  if (/^begin\s*;/i.test(sql) || /^commit\s*;/i.test(sql)) return 'transaction_control'
  if (/^set\s+local\b/i.test(sql)) return 'session_control'
  if (/^lock\s+table\b/i.test(sql)) return 'lock'
  if (/^do\s+\$/i.test(sql)) return 'precondition_guard'
  if (/^select\b/i.test(sql)) return 'readonly_postcheck'
  if (/^(?:alter\s+table|create\s+(?:table|(?:unique\s+)?index|function|trigger)|comment\s+on|revoke\b|grant\b)/i.test(sql)) {
    return 'persistent_mutation'
  }
  return 'unknown'
}

function namesFrom(sql, expression) {
  return [...sql.matchAll(expression)].map((match) => match[1])
}

function sourceLineCount(sql) {
  if (!sql) return 0
  const count = sql.split(/\r?\n/).length
  return /(?:\r?\n)$/.test(sql) ? count - 1 : count
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function functionSignatureExpression(signature) {
  if (!signature) return ''
  return signature
    .split(',')
    .map((value) => escapeRegularExpression(value.trim()))
    .join('\\s*,\\s*')
}

function mutationDescriptor(statement) {
  const sql = statement.sql
  const normalized = sql.replace(/\s+/g, ' ').trim()
  const common = {
    statement_index: statement.statement_index,
    line_start: statement.line_start,
    line_end: statement.line_end,
    mapped: true,
  }
  let match

  if (/^alter table public\.price_refresh_cycles\s+add column/i.test(sql)) {
    const objects = namesFrom(sql, /add column\s+([a-z0-9_]+)/gi)
    return {
      ...common,
      operation: 'add_columns', object_type: 'column', objects,
      existed_before: false,
      dependency: 'public.price_refresh_cycles must exist and contain zero rows',
      existing_data_affected: 'none; the base table is locked and required to contain zero rows',
      inverse: `alter table public.price_refresh_cycles ${objects.map((name) => `drop column ${name}`).join(', ')}`,
      inverse_preconditions: ['migration 004 footprint exact', 'price_refresh_cycles row count = 0', 'receipt row count = 0'],
      risk: 'high', recovery_order: 70,
    }
  }
  if (/^alter table public\.price_refresh_cycles\s+add constraint/i.test(sql)) {
    const objects = namesFrom(sql, /add constraint\s+([a-z0-9_]+)/gi)
    return {
      ...common,
      operation: 'add_constraints', object_type: 'constraint', objects,
      existed_before: false,
      dependency: `columns: ${PSDEALS_MIGRATION_004_CYCLE_COLUMNS.join(', ')}`,
      existing_data_affected: 'none; constraints are added to an empty base table',
      inverse: `alter table public.price_refresh_cycles ${objects.map((name) => `drop constraint ${name}`).join(', ')}`,
      inverse_preconditions: ['all migration 004 functions removed', 'price_refresh_cycles row count = 0'],
      risk: 'medium', recovery_order: 60,
    }
  }
  if ((match = normalized.match(/^create (?:unique )?index ([a-z0-9_]+) on public\.([a-z0-9_]+)/i))) {
    const object = match[1]
    return {
      ...common,
      operation: 'create_index', object_type: 'index', objects: [object],
      existed_before: false,
      dependency: `public.${match[2]}`,
      existing_data_affected: 'none',
      inverse: `drop index public.${object}`,
      inverse_preconditions: ['index definition matches migration 004', 'no operational use'],
      risk: 'low', recovery_order: match[2] === 'price_refresh_cycles' ? 50 : 40,
    }
  }
  if ((match = normalized.match(/^create table public\.([a-z0-9_]+)/i))) {
    const isReceiptTable = match[1] === 'psdeals_cycle_action_receipts'
    return {
      ...common,
      operation: 'create_table', object_type: 'table', objects: [`public.${match[1]}`],
      existed_before: false,
      dependency: 'public.price_refresh_cycles and gen_random_uuid()',
      existing_data_affected: 'none; a new empty table is created',
      inverse: `drop table public.${match[1]}`,
      inverse_preconditions: ['table row count = 0', 'all dependent functions and triggers removed'],
      created_subobjects: isReceiptTable
        ? {
            columns: [...PSDEALS_MIGRATION_004_RECEIPT_COLUMNS],
            constraints: [...PSDEALS_MIGRATION_004_RECEIPT_CONSTRAINTS],
            indexes: [...PSDEALS_MIGRATION_004_RECEIPT_INDEXES],
          }
        : null,
      risk: 'high', recovery_order: 40,
    }
  }
  if ((match = normalized.match(/^alter table public\.([a-z0-9_]+) enable row level security/i))) {
    return {
      ...common,
      operation: 'enable_rls', object_type: 'table_security', objects: [`public.${match[1]}`],
      existed_before: false,
      dependency: `public.${match[1]}`,
      existing_data_affected: 'none',
      inverse: `removed with public.${match[1]}`,
      inverse_preconditions: ['new table remains empty'],
      risk: 'low', recovery_order: 40,
    }
  }
  if ((match = normalized.match(/^create function public\.([a-z0-9_]+)/i))) {
    const name = match[1]
    const signature = PSDEALS_MIGRATION_004_RECOVERY_FUNCTIONS[name]
    return {
      ...common,
      mapped: signature !== undefined,
      operation: 'create_function', object_type: 'function', objects: [`public.${name}(${signature ?? '?'})`],
      existed_before: false,
      dependency: name.startsWith('_') ? 'receipt and cycle tables' : 'migration 004 helpers, tables, or preserved legacy RPCs',
      existing_data_affected: 'none at CREATE FUNCTION time; bodies are not invoked by the migration',
      inverse: signature === undefined ? null : `drop function public.${name}(${signature})`,
      inverse_preconditions: ['exact signature exists', 'zero cycles and receipts', 'function has not been used operationally'],
      risk: 'high', recovery_order: 30,
    }
  }
  if ((match = normalized.match(/^create trigger ([a-z0-9_]+)[\s\S]*? on public\.([a-z0-9_]+)/i))) {
    return {
      ...common,
      operation: 'create_trigger', object_type: 'trigger', objects: [match[1]],
      existed_before: false,
      dependency: `public.${match[2]} and its trigger function`,
      existing_data_affected: 'none; no row is inserted or updated during migration',
      inverse: `drop trigger ${match[1]} on public.${match[2]}`,
      inverse_preconditions: ['exact trigger definition exists', 'zero cycles and receipts'],
      risk: 'medium', recovery_order: 20,
    }
  }
  if (/^comment on\b/i.test(sql)) {
    match = normalized.match(/^comment on (column|table|function) ([^ ]+(?:\([^)]*\))?)/i)
    return {
      ...common,
      mapped: Boolean(match),
      operation: 'add_comment', object_type: match?.[1]?.toLowerCase() || 'comment', objects: [match?.[2] || 'unknown'],
      existed_before: false,
      dependency: 'new migration 004 object',
      existing_data_affected: 'none',
      inverse: 'comment is removed with its new object or column',
      inverse_preconditions: ['owning object is removed by its explicit inverse'],
      risk: 'low', recovery_order: 90,
    }
  }
  if (/^(?:revoke|grant)\b/i.test(sql)) {
    const legacy = /public\.(certify_price_refresh_cycle|refresh_catalog_public_cache_v15)\s*\(/i.exec(sql)
    const receiptTable = /on table public\.psdeals_cycle_action_receipts/i.test(sql)
    const functionName = /on function public\.([a-z0-9_]+)/i.exec(sql)?.[1]
    const objects = legacy
      ? [`public.${legacy[1]}`]
      : receiptTable
        ? ['public.psdeals_cycle_action_receipts']
        : functionName
          ? [`public.${functionName}`]
          : []
    return {
      ...common,
      mapped: objects.length > 0,
      operation: normalized.toLowerCase().startsWith('revoke') ? 'revoke_privilege' : 'grant_privilege',
      object_type: 'privilege', objects,
      existed_before: Boolean(legacy),
      dependency: legacy ? 'captured pre-004 function grants' : 'new migration 004 object',
      existing_data_affected: 'none',
      inverse: legacy
        ? 'restore the exact captured pre-004 execute grants'
        : 'revoke new grants before dropping the new object',
      inverse_preconditions: ['baseline grants snapshot hash matches', 'zero operational use'],
      risk: legacy ? 'high' : 'medium', recovery_order: legacy ? 80 : 10,
    }
  }

  return {
    ...common,
    mapped: false,
    operation: 'unknown_mutation', object_type: 'unknown', objects: [],
    existed_before: null,
    dependency: null,
    existing_data_affected: 'unknown',
    inverse: null,
    inverse_preconditions: [],
    risk: 'unknown', recovery_order: null,
  }
}

export function buildPsdealsMigration004MutationMap(sqlInput) {
  const sql = String(sqlInput || '')
  const lineCount = sourceLineCount(sql)
  const statements = splitPsdealsSqlStatements(sql)
  const classified = statements.map((statement) => ({
    ...statement,
    classification: classifyPsdealsSqlStatement(statement.sql),
  }))
  const mutations = classified
    .filter((statement) => statement.classification === 'persistent_mutation')
    .map(mutationDescriptor)
  const classificationCounts = Object.fromEntries(
    [...new Set(classified.map((statement) => statement.classification))]
      .sort()
      .map((classification) => [
        classification,
        classified.filter((statement) => statement.classification === classification).length,
      ])
  )
  const unknownStatements = classified.filter((statement) => statement.classification === 'unknown')
  const unmappedMutations = mutations.filter((mutation) => !mutation.mapped)
  return {
    map_version: 1,
    migration_path: PSDEALS_MIGRATION_004_PATH,
    migration_sha256: sha256PsdealsBytes(sql),
    source_line_count: lineCount,
    statement_count: statements.length,
    mutation_count: mutations.length,
    classification_counts: classificationCounts,
    coverage: {
      first_line: 1,
      last_line: lineCount,
      unknown_statement_indexes: unknownStatements.map((statement) => statement.statement_index),
      unmapped_mutation_indexes: unmappedMutations.map((mutation) => mutation.statement_index),
      all_persistent_mutations_mapped: unknownStatements.length === 0 && unmappedMutations.length === 0,
    },
    control_plane_mutations: [PSDEALS_MIGRATION_004_CONTROL_PLANE_MUTATION],
    mutations,
  }
}

export function validatePsdealsMigration004RecoverySql(recoverySqlInput, migrationSqlInput) {
  const sql = String(recoverySqlInput || '')
  const migrationSql = String(migrationSqlInput || '')
  const errors = []
  const requiredText = (value, code) => {
    if (!sql.includes(value)) errors.push(code)
  }

  requiredText('begin;', 'recovery_transaction_begin_missing')
  requiredText('commit;', 'recovery_transaction_commit_missing')
  requiredText('lock table public.price_refresh_cycles in access exclusive mode;', 'recovery_cycle_lock_missing')
  requiredText("raise exception 'PSDEALS_004_RECOVERY_CYCLES_PRESENT'", 'recovery_zero_cycle_guard_missing')
  requiredText("raise exception 'PSDEALS_004_RECOVERY_RECEIPTS_PRESENT'", 'recovery_zero_receipt_guard_missing')
  requiredText(PSDEALS_MIGRATION_004_SHA256, 'recovery_migration_fingerprint_missing')
  requiredText('3dfa2232903c014039f070f48d4044ffe0b329e38cb86615b9bdbc20c4f9aa88', 'recovery_certify_hash_missing')
  requiredText('1c6e71d26e6554e6f8fdf2e6ed0388db959419db4ee64132d8ddd5761b3996dc', 'recovery_cache_hash_missing')
  requiredText('drop table public.psdeals_cycle_action_receipts;', 'recovery_receipt_table_inverse_missing')

  if (/\bcascade\b/i.test(sql)) errors.push('recovery_cascade_forbidden')
  if (/psdeals_stage_price_history/i.test(sql)) errors.push('recovery_price_history_reference_forbidden')
  if (/\b(?:delete|truncate|insert|update)\s+(?:into\s+)?public\./i.test(sql)) {
    errors.push('recovery_data_mutation_forbidden')
  }
  if (/supabase_migrations|schema_migrations/i.test(sql)) errors.push('recovery_migration_history_mutation_forbidden')
  if (/drop\s+(?:table|function)\s+public\.(?:price_refresh_cycles|psdeals_stage_items|certify_price_refresh_cycle|refresh_catalog_public_cache_v15)\b/i.test(sql)) {
    errors.push('recovery_legacy_object_drop_forbidden')
  }

  for (const column of PSDEALS_MIGRATION_004_CYCLE_COLUMNS) {
    if (!new RegExp(`drop column ${column}\\b`, 'i').test(sql)) errors.push(`recovery_column_inverse_missing:${column}`)
  }
  for (const constraint of PSDEALS_MIGRATION_004_CYCLE_CONSTRAINTS) {
    if (!new RegExp(`drop constraint ${constraint}\\b`, 'i').test(sql)) errors.push(`recovery_constraint_inverse_missing:${constraint}`)
  }
  for (const index of PSDEALS_MIGRATION_004_CYCLE_INDEXES) {
    if (!new RegExp(`drop index public\\.${index}\\b`, 'i').test(sql)) errors.push(`recovery_index_inverse_missing:${index}`)
  }
  for (const trigger of PSDEALS_MIGRATION_004_TRIGGERS) {
    if (!new RegExp(`drop trigger ${trigger}\\b`, 'i').test(sql)) errors.push(`recovery_trigger_inverse_missing:${trigger}`)
  }
  for (const [name, signature] of Object.entries(PSDEALS_MIGRATION_004_RECOVERY_FUNCTIONS)) {
    const escaped = functionSignatureExpression(signature)
    if (!new RegExp(`drop function public\\.${name}\\(\\s*${escaped}\\s*\\)`, 'i').test(sql)) {
      errors.push(`recovery_function_inverse_missing:${name}`)
    }
  }

  const migrationMap = buildPsdealsMigration004MutationMap(migrationSql)
  if (migrationMap.migration_sha256 !== PSDEALS_MIGRATION_004_SHA256) errors.push('recovery_source_migration_hash_mismatch')
  if (migrationMap.source_line_count !== 2205) errors.push('recovery_source_line_count_mismatch')
  if (!migrationMap.coverage.all_persistent_mutations_mapped) errors.push('recovery_mutation_map_incomplete')

  const dropTriggerIdentity = sql.search(/drop trigger trg_price_refresh_cycles_protect_identity_v1/i)
  const dropProtectFunction = sql.search(/drop function public\.protect_price_refresh_cycle_identity_v1/i)
  const dropReceiptTrigger = sql.search(/drop trigger trg_psdeals_cycle_action_receipts_set_updated_at/i)
  const dropReceiptTable = sql.search(/drop table public\.psdeals_cycle_action_receipts/i)
  const dropFunctions = [...sql.matchAll(/drop function public\./gi)].map((match) => match.index)
  if (dropTriggerIdentity < 0 || dropProtectFunction < 0 || dropTriggerIdentity > dropProtectFunction) {
    errors.push('recovery_identity_trigger_dependency_order_invalid')
  }
  if (dropReceiptTrigger < 0 || dropReceiptTable < 0 || dropReceiptTrigger > dropReceiptTable) {
    errors.push('recovery_receipt_trigger_dependency_order_invalid')
  }
  if (dropFunctions.some((index) => index > dropReceiptTable)) errors.push('recovery_function_table_dependency_order_invalid')

  return {
    valid: errors.length === 0,
    errors,
    migration_map: migrationMap,
    destructive_scope: 'migration_004_created_objects_only',
    executes_recovery: false,
  }
}

export function buildPsdealsMigration004RecoveryManifest(input = {}) {
  const mutationMap = input.mutation_map
  const memberArtifacts = Array.isArray(input.member_artifacts) ? input.member_artifacts : []
  return {
    recovery_bundle_version: 1,
    authorization: 'Texto 0006',
    classification: input.classification,
    prepared_at: input.prepared_at,
    initial_head: input.initial_head,
    migration: {
      path: PSDEALS_MIGRATION_004_PATH,
      commit: input.migration_commit,
      sha256: mutationMap?.migration_sha256,
      source_line_count: mutationMap?.source_line_count,
      statement_count: mutationMap?.statement_count,
      mutation_count: mutationMap?.mutations?.length,
    },
    remote_baseline: input.remote_baseline,
    recovery_scope: {
      includes: [
        'price_refresh_cycles migration 004 columns, constraints, indexes, and identity trigger',
        'psdeals_cycle_action_receipts empty table and metadata',
        'migration 004 functions and grants',
        'captured legacy function grants',
      ],
      excludes: [
        'all operational rows',
        'all catalog and stage item data',
        'all monthly game data',
        'all cache data',
        'all detailed price history data',
      ],
      price_history_export_required: false,
      reason: 'Migration 004 neither references nor mutates detailed price history; recovery removes only unused additive schema objects while cycles and receipts remain empty.',
    },
    gates: {
      scoped_recovery: input.classification,
      requires_zero_cycles: true,
      requires_zero_receipts: true,
      requires_exact_004_footprint: true,
      requires_legacy_function_hashes: true,
      recovery_sql_authorized_for_execution: false,
      rollback_after_operational_use_forbidden: true,
      migration_history_reconciliation_separate: true,
    },
    artifacts: memberArtifacts,
    fingerprint: sha256PsdealsBytes(stablePsdealsEvidenceJson({
      migration_sha256: mutationMap?.migration_sha256,
      remote_baseline: input.remote_baseline,
      member_artifacts: memberArtifacts,
    })),
  }
}

export function validatePsdealsMigration004RecoveryBundle({
  manifest,
  mutation_map: mutationMap,
  empty_operational_data: emptyData,
  checksums,
} = {}) {
  const errors = []
  if (manifest?.classification !== 'SCOPED_RECOVERY_PROVEN') errors.push('bundle_recovery_gate_not_proven')
  if (manifest?.migration?.sha256 !== PSDEALS_MIGRATION_004_SHA256) errors.push('bundle_migration_hash_mismatch')
  if (mutationMap?.source_line_count !== 2205) errors.push('bundle_line_coverage_mismatch')
  if (mutationMap?.coverage?.all_persistent_mutations_mapped !== true) errors.push('bundle_mutation_coverage_incomplete')
  if (emptyData?.price_refresh_cycles?.row_count !== 0 || !Array.isArray(emptyData?.price_refresh_cycles?.rows) || emptyData.price_refresh_cycles.rows.length !== 0) {
    errors.push('bundle_cycle_export_not_empty')
  }
  if (emptyData?.psdeals_cycle_action_receipts?.exists !== false) errors.push('bundle_receipt_baseline_not_absent')
  if (manifest?.recovery_scope?.price_history_export_required !== false) errors.push('bundle_price_history_scope_invalid')
  if (manifest?.gates?.recovery_sql_authorized_for_execution !== false) errors.push('bundle_recovery_execution_authorized')
  if (manifest?.gates?.rollback_after_operational_use_forbidden !== true) errors.push('bundle_post_use_rollback_not_forbidden')
  if (checksums?.self_hash_excluded !== true) errors.push('bundle_checksum_self_hash_policy_missing')
  if (!Array.isArray(checksums?.files) || checksums.files.length === 0) errors.push('bundle_checksums_missing')
  return { valid: errors.length === 0, errors }
}

export function verifyPsdealsMigration004RecoveryBundleChecksums(filesByPath, checksums) {
  const errors = []
  const files = filesByPath && typeof filesByPath === 'object' ? filesByPath : {}
  const entries = Array.isArray(checksums?.files) ? checksums.files : []
  for (const entry of entries) {
    const bytes = files[entry.path]
    if (bytes === undefined) {
      errors.push(`bundle_checksum_file_missing:${entry.path}`)
      continue
    }
    const actual = sha256PsdealsBytes(bytes)
    if (actual !== entry.sha256) errors.push(`bundle_checksum_mismatch:${entry.path}`)
    const size = Buffer.byteLength(bytes)
    if (entry.bytes !== size) errors.push(`bundle_size_mismatch:${entry.path}`)
  }
  return { valid: errors.length === 0, errors, verified_files: entries.length }
}

export function findPsdealsRecoveryBundleSecretSignals(filesByPath) {
  const matches = []
  const files = filesByPath && typeof filesByPath === 'object' ? filesByPath : {}
  const forbidden = [
    ['jwt', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g],
    ['postgres_connection_string', /postgres(?:ql)?:\/\/[^\s"']+/gi],
    ['supabase_project_url', /https:\/\/[a-z0-9-]+\.supabase\.co/gi],
    ['authorization_header', /authorization\s*[:=]\s*["']?bearer\s+[A-Za-z0-9._-]+/gi],
    ['secret_assignment', /(?:service_role(?:[_-]?key)?|secret(?:[_-]?key)?|password|access[_-]?token|refresh[_-]?token|auth[_-]?token|cookie|api[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/gi],
  ]
  for (const [filePath, bytes] of Object.entries(files)) {
    const value = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes)
    for (const [kind, expression] of forbidden) {
      if (expression.test(value)) matches.push({ path: filePath, kind })
      expression.lastIndex = 0
    }
  }
  return matches
}

export function isPsdealsMigration004RecoveryPathSafe(pathInput) {
  const value = String(pathInput || '').replaceAll('\\', '/')
  return value === PSDEALS_MIGRATION_004_RECOVERY_PATH && !value.startsWith('supabase/migrations/')
}
