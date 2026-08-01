import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const retirement = fs.readFileSync(
  path.join(
    root,
    'sql',
    '006-lobodeals-3-restrictive-price-history-retirement.sql'
  ),
  'utf8'
)
const precheck = fs.readFileSync(
  path.join(
    root,
    'sql',
    'validation',
    '006-price-history-retirement-precheck-readonly.sql'
  ),
  'utf8'
)
const postcheck = fs.readFileSync(
  path.join(
    root,
    'sql',
    'validation',
    '006-price-history-retirement-postcheck-readonly.sql'
  ),
  'utf8'
)
const certificate = fs.readFileSync(
  path.join(
    root,
    'sql',
    'validation',
    '006-price-history-retirement-precheck-certificate-readonly.sql'
  ),
  'utf8'
)

function splitSqlStatements(source) {
  return source
    .replace(/^\s*--.*$/gm, '')
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function parseExpectedHistoryAcl(source) {
  const contract = source.match(
    /with expected_acl\([\s\S]*?\),\s*actual_acl as \(/i
  )?.[0]
  assert.ok(contract, 'expected ACL contract must be present')

  const roleValues = contract.match(
    /from\s*\(\s*values([\s\S]*?)\)\s*as expected_role/i
  )?.[1]
  const privilegeValues = contract.match(
    /cross join\s*\(\s*values([\s\S]*?)\)\s*as expected_privilege/i
  )?.[1]
  assert.ok(roleValues)
  assert.ok(privilegeValues)

  const roles = [...roleValues.matchAll(/\('([^']+)'\)/g)].map(
    (match) => match[1]
  )
  const privileges = [
    ...privilegeValues.matchAll(/\('([^']+)'\)/g),
  ].map((match) => match[1])

  return roles.flatMap((grantee) =>
    privileges.map((privilegeType) => ({
      grantee,
      privilegeType,
      isGrantable: false,
      grantor: 'postgres',
    }))
  )
}

function aclEntryKey(entry) {
  return [
    entry.grantee,
    entry.privilegeType,
    String(entry.isGrantable),
    entry.grantor,
  ].join(':')
}

function exactAclMatches(expected, actual) {
  const expectedKeys = new Set(expected.map(aclEntryKey))
  const actualKeys = new Set(actual.map(aclEntryKey))
  return (
    expected.length === 32 &&
    actual.length === 32 &&
    expectedKeys.size === 32 &&
    actualKeys.size === 32 &&
    [...expectedKeys].every((entry) => actualKeys.has(entry))
  )
}

const expectedHistoryIndexes = [
  {
    name: 'psdeals_stage_price_history_pkey',
    primary: true,
    unique: true,
    keys: ['id'],
    directions: ['ASC'],
    nulls: ['NULLS LAST'],
  },
  {
    name: 'psdeals_stage_price_history_unique_point',
    primary: false,
    unique: true,
    keys: ['item_id', 'price_kind', 'observed_at', 'price_amount'],
    directions: ['ASC', 'ASC', 'ASC', 'ASC'],
    nulls: ['NULLS LAST', 'NULLS LAST', 'NULLS LAST', 'NULLS LAST'],
  },
  {
    name: 'psdeals_stage_price_history_item_idx',
    primary: false,
    unique: false,
    keys: ['item_id', 'observed_at'],
    directions: ['ASC', 'DESC'],
    nulls: ['NULLS LAST', 'NULLS FIRST'],
  },
  {
    name: 'psdeals_stage_price_history_kind_idx',
    primary: false,
    unique: false,
    keys: ['price_kind', 'observed_at'],
    directions: ['ASC', 'DESC'],
    nulls: ['NULLS LAST', 'NULLS FIRST'],
  },
]

function indexContractKey(index) {
  return JSON.stringify({
    name: index.name,
    method: index.method,
    primary: index.primary,
    unique: index.unique,
    valid: index.valid,
    ready: index.ready,
    keys: index.keys,
    directions: index.directions,
    nulls: index.nulls,
    include: index.include,
    expression: index.expression,
    predicate: index.predicate,
  })
}

function exactHistoryIndexesMatch(actual) {
  const expected = expectedHistoryIndexes.map((index) => ({
    ...index,
    method: 'btree',
    valid: true,
    ready: true,
    include: [],
    expression: null,
    predicate: null,
  }))
  return (
    actual.length === expected.length &&
    new Set(actual.map(indexContractKey)).size === expected.length &&
    expected.every((index) =>
      actual.some((candidate) => indexContractKey(candidate) === indexContractKey(index))
    )
  )
}

test('migration 006 is transactional, locked, fail-closed and restrictive', () => {
  assert.match(retirement, /^begin;/m)
  assert.match(retirement, /^commit;/m)
  assert.match(
    retirement,
    /lock table public\.psdeals_stage_price_history\s+in access exclusive mode/
  )
  assert.match(
    retirement,
    /drop table public\.psdeals_stage_price_history restrict;/
  )
  assert.doesNotMatch(retirement, /\bcascade\b/i)
  assert.match(retirement, /PSDEALS_006_POSTGRES_OWNER_REQUIRED/)
})

test('migration 006 asserts the exact verified object surface', () => {
  for (const evidence of [
    /relation\.relkind = 'r'/,
    /relation\.relpersistence = 'p'/,
    /PSDEALS_006_HISTORY_OWNER_MISMATCH/,
    /expected_columns <> 8/,
    /expected_constraints <> 4/,
    /expected_indexes <> 4/,
    /INCOMING_FOREIGN_KEY_PRESENT/,
    /USER_TRIGGER_PRESENT/,
    /VIEW_CONSUMER_PRESENT/,
    /STORED_ROUTINE_REFERENCE_PRESENT/,
    /PUBLICATION_PRESENT/,
    /EXTERNAL_DEPENDENCY_PRESENT/,
    /POLICY_SURFACE_MISMATCH/,
    /EXPECTED_GRANT_MISSING/,
    /GRANT_SURFACE_MISMATCH/,
    /indkey\[0\]/,
    /indkey\[3\]/,
  ]) {
    assert.match(retirement, evidence)
  }
})

test('migration 006 requires the exact four PostgreSQL index contracts', () => {
  for (const evidence of [
    /join pg_catalog\.pg_am as access_method/,
    /access_method\.amname = 'btree'/,
    /index_row\.indnatts = 4/,
    /index_row\.indnkeyatts = 4/,
    /index_row\.indnatts = 2/g,
    /index_row\.indnkeyatts = 2/g,
    /attname = 'observed_at'/g,
    /index_row\.indoption\[0\] = 0/,
    /index_row\.indoption\[1\] = 3/g,
    /index_row\.indexprs is null/,
    /index_row\.indpred is null/,
  ]) {
    assert.match(retirement, evidence)
  }
  assert.equal((retirement.match(/index_row\.indnatts = 2/g) ?? []).length, 2)
  assert.equal((retirement.match(/index_row\.indnkeyatts = 2/g) ?? []).length, 2)
  assert.equal((retirement.match(/index_row\.indoption\[1\] = 3/g) ?? []).length, 2)
})

test('exact index fixtures fail closed on missing, extra and structural drift', () => {
  const valid = expectedHistoryIndexes.map((index) => ({
    ...index,
    method: 'btree',
    valid: true,
    ready: true,
    include: [],
    expression: null,
    predicate: null,
  }))
  assert.equal(exactHistoryIndexesMatch(valid), true)
  assert.equal(exactHistoryIndexesMatch(valid.slice(0, 3)), false)
  assert.equal(
    exactHistoryIndexesMatch([
      ...valid,
      { ...valid[0], name: 'psdeals_stage_price_history_extra_idx' },
    ]),
    false
  )
  for (const mutation of [
    { method: 'hash' },
    { primary: true },
    { unique: true },
    { valid: false },
    { ready: false },
    { keys: ['item_id'] },
    { keys: ['item_id', 'observed_at', 'price_amount'] },
    { directions: ['ASC', 'ASC'] },
    { nulls: ['NULLS LAST', 'NULLS LAST'] },
    { include: ['price_amount'] },
    { expression: 'lower(price_kind)' },
    { predicate: 'price_amount > 0' },
  ]) {
    const drifted = valid.map((index, position) =>
      position === 2 ? { ...index, ...mutation } : index
    )
    assert.equal(exactHistoryIndexesMatch(drifted), false)
  }
})

test('migration 006 validates the drop before committing', () => {
  const drop = retirement.indexOf(
    'drop table public.psdeals_stage_price_history restrict'
  )
  const postcondition = retirement.indexOf('do $postcondition$')
  const commit = retirement.lastIndexOf('commit;')
  assert.ok(drop > 0)
  assert.ok(postcondition > drop)
  assert.ok(commit > postcondition)
  assert.match(retirement, /PSDEALS_006_POSTCONDITION_FAILED/)
})

test('migration 006 intentionally removes the verified access surface first', () => {
  const policy = retirement.indexOf(
    'drop policy "Public read psdeals price history"'
  )
  const grants = retirement.indexOf('revoke all privileges')
  const table = retirement.indexOf(
    'drop table public.psdeals_stage_price_history restrict'
  )
  assert.ok(policy > 0)
  assert.ok(grants > policy)
  assert.ok(table > grants)
})

test('migration 006 contains no row-wise bulk mutation or storage copy', () => {
  assert.doesNotMatch(retirement, /^\s*delete\s+from\b/im)
  assert.doesNotMatch(retirement, /^\s*truncate\b/im)
  assert.doesNotMatch(retirement, /^\s*vacuum\b/im)
  assert.doesNotMatch(retirement, /\bcopy\s+public\./i)
  assert.doesNotMatch(
    retirement,
    /\bcreate\s+table\s+\S+\s+as\s+select\b/i
  )
  assert.doesNotMatch(retirement, /\bbackfill\b/i)
})

test('migration 006 mutates no unrelated table', () => {
  const mutatingStatements = retirement
    .split(/\r?\n/)
    .filter((line) =>
      /^\s*(?:alter|update|insert|drop|revoke|grant|lock)\b/i.test(line)
    )
    .join('\n')
  assert.doesNotMatch(mutatingStatements, /psdeals_stage_items/i)
  assert.doesNotMatch(mutatingStatements, /price_refresh_cycles/i)
  assert.doesNotMatch(
    mutatingStatements,
    /psdeals_cycle_action_receipts/i
  )
  assert.doesNotMatch(mutatingStatements, /ps_plus_monthly_games/i)
  assert.doesNotMatch(mutatingStatements, /catalog_public_cache/i)
  assert.doesNotMatch(mutatingStatements, /profiles|tracked/i)
})

test('future precheck and postcheck files are strictly read-only', () => {
  for (const source of [precheck, postcheck]) {
    assert.doesNotMatch(
      source,
      /^\s*(?:insert|update|delete|alter|drop|truncate|vacuum|grant|revoke|create|call|do)\b/im
    )
  }
  assert.match(precheck, /pg_total_relation_size/)
  assert.match(precheck, /pg_locks/)
  assert.match(precheck, /pg_depend/)
  assert.match(precheck, /pg_stat_activity/)
  assert.match(precheck, /price_refresh_cycles/)
  assert.match(
    postcheck,
    /to_regclass\('public\.psdeals_stage_price_history'\)/
  )
  assert.match(postcheck, /catalog_public_cache/)
})

test('diagnostic precheck exposes exact index structure and aggregate gates', () => {
  for (const evidence of [
    /pg_catalog\.pg_index/,
    /pg_catalog\.pg_attribute/,
    /pg_catalog\.pg_am/,
    /pg_catalog\.pg_get_indexdef/,
    /indnatts/,
    /indnkeyatts/,
    /key_columns/,
    /sort_directions/,
    /null_ordering/,
    /include_columns/,
    /expressions/,
    /predicate/,
    /contract_matches/,
    /"HISTORY_INDEXES_EXPECTED_COUNT"/,
    /"HISTORY_INDEXES_ACTUAL_COUNT"/,
    /"HISTORY_INDEX_DEFINITIONS_MATCH"/,
    /"HISTORY_UNEXPECTED_INDEXES_COUNT"/,
    /"HISTORY_MISSING_INDEXES_COUNT"/,
  ]) {
    assert.match(precheck, evidence)
  }
})

test('index column arrays normalize PostgreSQL name values to text at construction', () => {
  const unsafeNameArray = /array_agg\(\s*attribute\.attname(?!::text)/gi
  const normalizedNameArray =
    /array_agg\(\s*attribute\.attname::text\s+order by ordinal\.position\s*\)/gi

  for (const source of [precheck, certificate]) {
    assert.doesNotMatch(source, unsafeNameArray)
    assert.equal((source.match(normalizedNameArray) ?? []).length, 2)
    assert.match(
      source,
      /\),\s*array\[\]::text\[\]\) as key_columns/i
    )
    assert.match(
      source,
      /\),\s*array\[\]::text\[\]\) as include_columns/i
    )
  }
})

test('index contracts compare only explicitly typed text arrays', () => {
  for (const source of [precheck, certificate]) {
    assert.match(source, /actual\.key_columns = expected\.key_columns/)
    assert.match(source, /actual\.sort_directions = expected\.sort_directions/)
    assert.match(source, /actual\.null_ordering = expected\.null_ordering/)
    assert.match(source, /actual\.include_columns = array\[\]::text\[\]/)
    assert.doesNotMatch(source, /::name\[\]/i)

    const emptyTextArrays = source.match(/array\[\]::text\[\]/gi) ?? []
    assert.equal(emptyTextArrays.length, 5)
  }
})

test('precheck dependency queries are deterministic and PostgreSQL 17 safe', () => {
  assert.doesNotMatch(
    precheck,
    /order\s+by\s+dependent_catalog::text/i
  )
  assert.match(
    precheck,
    /history_dependencies\.dependent_catalog::text/
  )
  assert.match(precheck, /external_dependencies as \(/)
  assert.match(
    precheck,
    /dependency\.classid::regclass::text/
  )
  assert.match(
    precheck,
    /dependency\.objid,\s*dependency\.objsubid/
  )
})

test('migration 006 models the complete PostgreSQL 17 ACL', () => {
  const expectedAcl = parseExpectedHistoryAcl(retirement)
  assert.equal(expectedAcl.length, 32)
  assert.deepEqual(
    new Set(expectedAcl.map((entry) => entry.grantee)),
    new Set(['anon', 'authenticated', 'service_role', 'postgres'])
  )
  assert.deepEqual(
    new Set(expectedAcl.map((entry) => entry.privilegeType)),
    new Set([
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
      'MAINTAIN',
    ])
  )
  assert.ok(expectedAcl.every((entry) => !entry.isGrantable))
  assert.ok(
    expectedAcl.every((entry) => entry.grantor === 'postgres')
  )
  assert.match(retirement, /aclexplode/)
  assert.match(retirement, /select \* from expected_acl\s+except/)
  assert.match(retirement, /select \* from actual_acl\s+except/)
  assert.match(retirement, /\) <> 32 then/)
})

test('migration 006 rejects incomplete or expanded ACL cardinalities', () => {
  const expectedAcl = parseExpectedHistoryAcl(retirement)
  const withoutMaintain = expectedAcl.filter(
    (entry) => entry.privilegeType !== 'MAINTAIN'
  )
  assert.equal(withoutMaintain.length, 28)
  assert.equal(exactAclMatches(expectedAcl, withoutMaintain), false)
  assert.equal(exactAclMatches(expectedAcl, expectedAcl.slice(0, 31)), false)
  assert.equal(exactAclMatches(expectedAcl, expectedAcl), true)
  assert.equal(
    exactAclMatches(expectedAcl, [
      ...expectedAcl,
      {
        grantee: 'anon',
        privilegeType: 'UNKNOWN',
        isGrantable: false,
        grantor: 'postgres',
      },
    ]),
    false
  )
})

test('migration 006 rejects ACL identity and option drift', () => {
  const expectedAcl = parseExpectedHistoryAcl(retirement)
  for (const replacement of [
    { grantee: 'PUBLIC' },
    { grantee: 'unexpected_role' },
    { privilegeType: 'UNKNOWN' },
    { isGrantable: true },
    { grantor: 'unexpected_grantor' },
  ]) {
    const drifted = expectedAcl.map((entry, index) =>
      index === 0 ? { ...entry, ...replacement } : entry
    )
    assert.equal(exactAclMatches(expectedAcl, drifted), false)
  }
})

test('precheck exposes the full effective ACL and unambiguous gates', () => {
  for (const evidence of [
    /history_information_schema_grants_count/,
    /history_effective_acl_entries_count/,
    /history_maintain_grants_count/,
    /history_public_grants_count/,
    /history_unexpected_grantees_count/,
    /history_unexpected_privileges_count/,
    /history_unexpected_grant_options_count/,
    /history_grants_match_006/,
    /count\(\*\) = 32/,
  ]) {
    assert.match(precheck, evidence)
  }
  assert.match(precheck, /aclexplode/)
  assert.match(precheck, /grantor_role\.rolname/)
})

test('precheck materializes ACL identity before grouping by grantee', () => {
  const statements = splitSqlStatements(precheck)
  assert.equal(statements.length, 20)

  const granteeCounts = statements[13]
  assert.match(granteeCounts, /^with effective_acl as \(/i)
  assert.match(
    granteeCounts,
    /when acl\.grantee = 0 then 'PUBLIC'/
  )
  assert.match(granteeCounts, /else grantee_role\.rolname/)
  assert.match(granteeCounts, /grantor_role\.rolname as grantor/)
  assert.match(granteeCounts, /acl\.is_grantable/)
  assert.match(granteeCounts, /acl\.privilege_type/)
  assert.match(
    granteeCounts,
    /group by effective_acl\.grantee\s+order by effective_acl\.grantee/i
  )
  assert.doesNotMatch(granteeCounts, /group by grantee\b/i)
})

test('precheck grantee counts preserve deterministic ACL evidence', () => {
  const granteeCounts = splitSqlStatements(precheck)[13]
  assert.match(
    granteeCounts,
    /count\(\*\)::integer as effective_acl_entries/
  )
  assert.match(
    granteeCounts,
    /array_agg\(\s*effective_acl\.privilege_type\s+order by effective_acl\.privilege_type\s*\) as privilege_types/
  )
  assert.match(
    granteeCounts,
    /array_agg\(\s*effective_acl\.grantor\s+order by effective_acl\.privilege_type\s*\) as grantors/
  )
  assert.match(
    granteeCounts,
    /array_agg\(\s*effective_acl\.is_grantable\s+order by effective_acl\.privilege_type\s*\) as grant_options/
  )
})

test('postcheck proves retirement and migration 006 registration', () => {
  for (const evidence of [
    /remaining_history_relations/,
    /remaining_history_columns/,
    /remaining_history_constraints/,
    /remaining_history_indexes/,
    /remaining_named_history_indexes/,
    /remaining_history_index_definitions/,
    /remaining_history_triggers/,
    /remaining_history_policies/,
    /remaining_history_acl_entries/,
    /remaining_history_dependencies/,
    /history_retirement_postcheck_passed/,
    /lobodeals_3_restrictive_price_history_retirement/,
    /migration_006_registered/,
  ]) {
    assert.match(postcheck, evidence)
  }
})

test('postcheck proves all migration 005 objects remain exact', () => {
  for (const column of [
    'regular_certification_cycle_id',
    'regular_certification_observed_at',
    'regular_certification_evidence_sha256',
    'regular_certification_candidate',
    'ps_plus_certification_cycle_id',
    'ps_plus_certification_observed_at',
    'ps_plus_certification_evidence_sha256',
    'ps_plus_certification_candidate',
  ]) {
    assert.match(postcheck, new RegExp(column))
  }
  for (const evidence of [
    /migration_005_columns_match/,
    /migration_005_constraints_present/,
    /migration_005_restrictive_fks_present/,
    /migration_005_partial_indexes_present/,
    /_psdeals_certification_candidate_sha256_v1/,
    /candidate_hash_helper_definition_matches/,
    /certify_price_refresh_cycle_v3/,
    /certification_v3_definition_matches/,
    /certification_function_acl_matches/,
    /array\['search_path='\]/,
  ]) {
    assert.match(postcheck, evidence)
  }
})

test('postcheck compares every preserved data invariant to baseline', () => {
  for (const evidence of [
    /lobodeals_lowest_regular_price_amount/,
    /lobodeals_lowest_regular_price_first_seen_at/,
    /lobodeals_lowest_ps_plus_price_amount/,
    /lobodeals_lowest_ps_plus_price_first_seen_at/,
    /regular_candidates/,
    /ps_plus_candidates/,
    /monthly_active_rows/,
    /cache_max_updated_at/,
    /preserved_data_matches_authorized_baseline/,
    /database_bytes_difference/,
    /public_relations_total_bytes_after/,
    /history_relation_size_absent/,
  ]) {
    assert.match(postcheck, evidence)
  }
})

test('migration 006 still revokes all ACL entries and drops restrictively', () => {
  assert.match(
    retirement,
    /revoke all privileges\s+on table public\.psdeals_stage_price_history/
  )
  assert.match(
    retirement,
    /drop table public\.psdeals_stage_price_history restrict/
  )
  assert.doesNotMatch(retirement, /\bcascade\b/i)
})

test('migration 006 never writes detailed history rows', () => {
  assert.doesNotMatch(
    retirement,
    /insert\s+into\s+public\.psdeals_stage_price_history/i
  )
  assert.doesNotMatch(
    retirement,
    /update\s+public\.psdeals_stage_price_history/i
  )
})

test('single-result-set certificate is one strictly read-only statement', () => {
  const statements = splitSqlStatements(certificate)
  assert.equal(statements.length, 1)
  assert.match(statements[0], /^with\b/i)
  assert.match(statements[0], /\bselect\b/i)
  assert.doesNotMatch(
    certificate,
    /^\s*(?:begin|commit|insert|update|delete|alter|drop|truncate|vacuum|grant|revoke|create|call|do|lock)\b/im
  )
  assert.doesNotMatch(certificate, /\bpg_advisory_|\bpg_terminate_backend\b/i)
})

test('certificate returns exactly the required machine-readable columns', () => {
  const finalProjection = certificate.match(
    /select\s+checks\.check_id::integer[\s\S]*?order by checks\.check_id;/i
  )?.[0]
  assert.ok(finalProjection)
  for (const column of [
    'checks.check_id::integer',
    'checks.check_name::text',
    'checks.passed::boolean',
    'checks.severity::text',
    'checks.observed::jsonb',
    'checks.expected::jsonb',
    'context.backend_pid::integer',
    'context.snapshot_id::text',
    'context.checked_at::timestamptz',
  ]) {
    assert.match(finalProjection, new RegExp(column.replaceAll('.', '\\.')))
  }
})

test('certificate defines unique consecutive check IDs 1 through 20', () => {
  const ids = [
    ...certificate.matchAll(/(?:select|union all\s+select)\s+(\d+),\s*'[^']+'/gi),
  ].map((match) => Number(match[1]))
  assert.deepEqual(ids, Array.from({ length: 20 }, (_, index) => index + 1))
  assert.equal(new Set(ids).size, 20)
})

test('certificate shares one backend snapshot and statement timestamp', () => {
  assert.match(certificate, /certificate_context as materialized/)
  assert.match(certificate, /pg_catalog\.pg_backend_pid\(\)/)
  assert.match(certificate, /pg_catalog\.pg_current_snapshot\(\)::text/)
  assert.match(certificate, /statement_timestamp\(\) as checked_at/)
  assert.match(certificate, /cross join certificate_context as context/)
  assert.equal((certificate.match(/pg_current_snapshot\(\)/g) ?? []).length, 1)
  assert.equal((certificate.match(/as checked_at/g) ?? []).length, 1)
})

test('certificate pass values derive from current catalog observations', () => {
  assert.doesNotMatch(
    certificate,
    /(?:select|union all\s+select)\s+\d+,\s*'[^']+',\s*true\s*,/i
  )
  assert.match(certificate, /checks\(check_id, check_name, passed, severity, observed, expected\)/)
  assert.match(certificate, /jsonb_build_object\(/)
  assert.match(certificate, /to_jsonb\(/)
  assert.doesNotMatch(certificate, /Texto\s+3\.2|3\.2-0013|3\.2-0014/i)
})

test('certificate covers exact history columns, constraints and indexes', () => {
  for (const column of [
    'id',
    'item_id',
    'price_kind',
    'observed_at',
    'price_amount',
    'currency_code',
    'source_name',
    'created_at',
  ]) {
    assert.match(certificate, new RegExp(`'${column}'`))
  }
  assert.match(certificate, /column_drift/)
  assert.match(certificate, /primary_key_matches/)
  assert.match(certificate, /unique_matches/)
  assert.match(certificate, /foreign_key_matches/)
  assert.match(certificate, /incoming_count = 0/)
  for (const indexName of [
    'psdeals_stage_price_history_pkey',
    'psdeals_stage_price_history_unique_point',
    'psdeals_stage_price_history_item_idx',
    'psdeals_stage_price_history_kind_idx',
  ]) {
    assert.match(certificate, new RegExp(indexName))
  }
  for (const evidence of [
    /expected_history_indexes/,
    /evaluated_history_indexes/,
    /history_index_summary/,
    /access_method/,
    /indnatts/,
    /indnkeyatts/,
    /key_columns/,
    /sort_directions/,
    /null_ordering/,
    /include_columns/,
    /expressions/,
    /predicate/,
    /definition_mismatch_count/,
    /matching_count = 4/,
    /missing_count = 0/,
    /unexpected_count = 0/,
  ]) {
    assert.match(certificate, evidence)
  }
})

test('certificate covers dependency, trigger, routine and view blockers', () => {
  for (const evidence of [
    /all_history_dependencies as materialized/,
    /external_dependencies as materialized/,
    /external_dependencies_and_blockers/,
    /history_triggers as materialized/,
    /history_routines as materialized/,
    /history_views as materialized/,
    /history_rules as materialized/,
    /stored_writers/,
    /stored_consumers/,
  ]) {
    assert.match(certificate, evidence)
  }
})

test('certificate covers exact RLS, policy and PostgreSQL 17 ACL', () => {
  assert.match(certificate, /Public read psdeals price history/)
  assert.match(certificate, /relrowsecurity/)
  assert.match(certificate, /relforcerowsecurity/)
  assert.match(certificate, /information_schema_acl/)
  assert.match(certificate, /effective_acl as materialized/)
  assert.match(certificate, /aclexplode/)
  assert.match(certificate, /acldefault/)
  assert.match(certificate, /expected_acl\(grantee, privilege_type, is_grantable, grantor\)/)
  assert.match(certificate, /acl_by_grantee as materialized/)
  assert.match(certificate, /acl_by_privilege as materialized/)
  assert.match(certificate, /acl_drift/)
  assert.match(certificate, /privilege_type = 'MAINTAIN'/)
  assert.match(certificate, /actual_count', 32/)
})

test('certificate uses bounded lock and activity aggregates', () => {
  assert.match(certificate, /lock_summary as materialized/)
  assert.match(certificate, /activity_summary as materialized/)
  assert.match(certificate, /activity\.pid <> pg_catalog\.pg_backend_pid\(\)/)
  assert.match(certificate, /activity\.backend_type = 'client backend'/)
  assert.match(certificate, /interval '5 minutes'/)
  assert.match(certificate, /interval '2 minutes'/)
  assert.match(certificate, /active_history_mentions/)
  assert.doesNotMatch(certificate, /select\s+activity\.pid[\s\S]*from pg_catalog\.pg_stat_activity/i)
})

test('certificate covers migration 005, minima and operational state', () => {
  for (const evidence of [
    /required_005_columns/,
    /required_005_constraints/,
    /required_005_indexes/,
    /restrictive_fks_present/,
    /_psdeals_certification_candidate_sha256_v1/,
    /certify_price_refresh_cycle_v3/,
    /regular_minimum_amount_rows/,
    /regular_first_seen_rows/,
    /plus_minimum_amount_rows/,
    /plus_first_seen_rows/,
    /price_refresh_cycles/,
    /psdeals_cycle_action_receipts/,
    /regular_candidate_rows/,
    /plus_candidate_rows/,
    /monthly_active_rows/,
    /cache_max_updated_at/,
    /lobodeals_3_cycle_bound_price_certification/,
    /lobodeals_3_restrictive_price_history_retirement/,
  ]) {
    assert.match(certificate, evidence)
  }
})

test('certificate severity values are closed and every blocker is observable', () => {
  const severities = [...certificate.matchAll(/\n\s*'(blocker|informational)',/g)].map(
    (match) => match[1]
  )
  assert.equal(severities.length, 20)
  assert.equal(severities.filter((value) => value === 'informational').length, 1)
  assert.equal(severities.filter((value) => value === 'blocker').length, 19)
  assert.equal((certificate.match(/observed/g) ?? []).length >= 2, true)
  assert.equal((certificate.match(/expected/g) ?? []).length >= 2, true)
})

test('migration 006 has a pinned reviewed SHA-256', () => {
  assert.equal(
    crypto.createHash('sha256').update(retirement).digest('hex'),
    'e825a88ef811873f16cc48da5685d8e87eb699b5d903bd29ad34025a9630f5e4'
  )
})
