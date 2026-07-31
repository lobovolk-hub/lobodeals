import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
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
