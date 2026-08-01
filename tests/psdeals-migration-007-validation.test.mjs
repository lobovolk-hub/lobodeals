import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const files = {
  migration: 'sql/007-lobodeals-3-safe-demotion-hardening.sql',
  recovery: 'sql/recovery/007-lobodeals-3-safe-demotion-hardening-before-use.sql',
  precheck: 'sql/validation/007-safe-demotion-precheck-readonly.sql',
  certificate: 'sql/validation/007-safe-demotion-precheck-certificate-readonly.sql',
  postcheck: 'sql/validation/007-safe-demotion-postcheck-readonly.sql',
  postCertificate: 'sql/validation/007-safe-demotion-postcheck-certificate-readonly.sql',
}
const loaded = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [
  key,
  await fs.readFile(path.resolve(file), 'utf8'),
])))

function splitSqlStatements(sql) {
  return sql
    .split(';')
    .map((value) => value.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean)
}

test('migration 007 serializes zero-cycle approval and pins the inherited v1 security contract', () => {
  assert.match(loaded.migration, /lock table public\.price_refresh_cycles in access exclusive mode/i)
  assert.match(loaded.migration, /PSDEALS_007_REQUIRES_ZERO_RECEIPTS/)
  assert.match(loaded.migration, /PSDEALS_007_V1_SECURITY_CONTRACT_MISMATCH/)
  assert.match(loaded.migration, /array\['search_path=""'\]::text\[\]/)
  assert.match(loaded.migration, /has_function_privilege\('service_role'/)
  assert.doesNotMatch(loaded.migration, /\bcascade\b/i)
})

test('recovery locks identity tables and refuses drift or any prior use', () => {
  assert.match(loaded.recovery, /lock table public\.price_refresh_cycles in access exclusive mode/i)
  assert.match(loaded.recovery, /lock table public\.psdeals_cycle_action_receipts in access exclusive mode/i)
  assert.match(loaded.recovery, /PSDEALS_007_RECOVERY_V2_CONTRACT_MISMATCH/)
  assert.match(loaded.recovery, /PSDEALS_007_RECOVERY_FORBIDDEN_AFTER_USE/)
  assert.doesNotMatch(loaded.recovery, /\bcascade\b/i)
})

test('diagnostic checks and certificates contain no top-level mutation', () => {
  for (const value of [loaded.precheck, loaded.postcheck, loaded.certificate, loaded.postCertificate]) {
    assert.doesNotMatch(value, /^\s*(?:begin|commit|insert|update|delete|alter|drop|truncate|vacuum|grant|revoke|create|call|do|lock)\b/im)
    assert.doesNotMatch(value, /\bpg_advisory_|\bpg_terminate_backend\b/i)
  }
})

test('certificate is one read-only statement with consecutive checks and one snapshot', () => {
  assert.equal(splitSqlStatements(loaded.certificate).length, 1)
  assert.match(loaded.certificate, /^--[\s\S]*?\nwith\b/i)
  assert.doesNotMatch(loaded.certificate, /^\s*(?:begin|commit|insert|update|delete|alter|drop|truncate|vacuum|grant|revoke|create|call|do|lock)\b/im)
  const ids = [...loaded.certificate.matchAll(/(?:select|union all select)\s+(\d+),\s*'[^']+'/gi)].map((match) => Number(match[1]))
  assert.deepEqual(ids, Array.from({ length: 23 }, (_, index) => index + 1))
  assert.equal((loaded.certificate.match(/pg_current_snapshot\(\)/g) || []).length, 1)
  assert.equal((loaded.certificate.match(/statement_timestamp\(\)/g) || []).length, 1)
})

test('certificate emits the full machine-readable contract and covers required surfaces', () => {
  for (const token of [
    'check_id::integer', 'check_name::text', 'severity::text', 'passed::boolean',
    'observed::jsonb', 'expected::jsonb', 'as blocker', 'checked_at::timestamptz',
    'backend_pid::integer', 'snapshot::text', 'migrations_004_005_006_registered',
    'migration_007_absent', 'detailed_history_absent', 'v1_exact_definition',
    'v1_security_and_acl', 'v2_absent', 'candidates_and_minima_empty',
    'monthly_and_cache_observable', 'no_target_lock_waiters',
    'no_relevant_active_clients', 'migration_007_compatibility',
  ]) assert.match(loaded.certificate, new RegExp(token))
})

test('post-application certificate pins the exact 007 footprint in one snapshot', () => {
  assert.equal(splitSqlStatements(loaded.postCertificate).length, 1)
  const ids = [...loaded.postCertificate.matchAll(/(?:select|union all select)\s+(\d+),\s*'[^']+'/gi)].map((match) => Number(match[1]))
  assert.deepEqual(ids, Array.from({ length: 23 }, (_, index) => index + 1))
  assert.equal((loaded.postCertificate.match(/pg_current_snapshot\(\)/g) || []).length, 1)
  assert.equal((loaded.postCertificate.match(/statement_timestamp\(\)/g) || []).length, 1)
  for (const token of [
    'migration_007_registered_once', 'v1_revoked_security_contract',
    'v2_exact_definition', '6d1c5266784bc309eb3f06e49648875e668a89bef5c9c500cc61349a002cf07a',
    'v2_security_acl_and_comment', '\\{postgres=X/postgres,service_role=X/postgres\\}',
    'migration_007_post_application_contract',
  ]) assert.match(loaded.postCertificate, new RegExp(token))
})

test('migration 007 exposes an immutable local SHA for authorization packaging', () => {
  const hash = crypto.createHash('sha256').update(loaded.migration).digest('hex')
  assert.match(hash, /^[a-f0-9]{64}$/)
  assert.notEqual(hash, '3ebd7366b1cf26e71f494389d63d4e7759f404c23f468e1fba8153829646f00a')
})
