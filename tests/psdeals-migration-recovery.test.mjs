import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  buildPsdealsMigration004MutationMap,
  findPsdealsRecoveryBundleSecretSignals,
  isPsdealsMigration004RecoveryPathSafe,
  PSDEALS_MIGRATION_004_CONTROL_PLANE_MUTATION,
  PSDEALS_MIGRATION_004_CYCLE_COLUMNS,
  PSDEALS_MIGRATION_004_CYCLE_CONSTRAINTS,
  PSDEALS_MIGRATION_004_CYCLE_INDEXES,
  PSDEALS_MIGRATION_004_RECEIPT_COLUMNS,
  PSDEALS_MIGRATION_004_RECEIPT_CONSTRAINTS,
  PSDEALS_MIGRATION_004_RECEIPT_INDEXES,
  PSDEALS_MIGRATION_004_RECOVERY_FUNCTIONS,
  PSDEALS_MIGRATION_004_RECOVERY_PATH,
  PSDEALS_MIGRATION_004_SHA256,
  PSDEALS_MIGRATION_004_TRIGGERS,
  splitPsdealsSqlStatements,
  validatePsdealsMigration004RecoveryBundle,
  validatePsdealsMigration004RecoverySql,
  verifyPsdealsMigration004RecoveryBundleChecksums,
} from '../scripts/lib/psdeals-migration-recovery.mjs'

const bundleDirectory = path.resolve(
  'docs/audit/lobodeals-3-migration-004-scoped-recovery-2026-07-30'
)
const migrationPath = path.resolve('sql/004-lobodeals-3-reconciliable-cycle-actions.sql')
const recoveryPath = path.resolve(PSDEALS_MIGRATION_004_RECOVERY_PATH)
const migrationSql = await fs.readFile(migrationPath, 'utf8')
const recoverySql = await fs.readFile(recoveryPath, 'utf8')
const mutationMap = buildPsdealsMigration004MutationMap(migrationSql)
const manifest = JSON.parse(await fs.readFile(path.join(bundleDirectory, 'recovery-manifest.json'), 'utf8'))
const storedMap = JSON.parse(await fs.readFile(path.join(bundleDirectory, 'mutation-map.json'), 'utf8'))
const emptyData = JSON.parse(await fs.readFile(path.join(bundleDirectory, 'empty-operational-data.json'), 'utf8'))
const checksums = JSON.parse(await fs.readFile(path.join(bundleDirectory, 'checksums.json'), 'utf8'))

async function checksumFiles() {
  return Object.fromEntries(await Promise.all(
    checksums.files.map(async (entry) => [entry.path, await fs.readFile(path.resolve(entry.path))])
  ))
}

test('migration map covers the exact 2,205-line authorized source', () => {
  assert.equal(mutationMap.migration_sha256, PSDEALS_MIGRATION_004_SHA256)
  assert.equal(mutationMap.source_line_count, 2205)
  assert.equal(mutationMap.coverage.first_line, 1)
  assert.equal(mutationMap.coverage.last_line, 2205)
})

test('all 78 statements classify and all 68 persistent mutations map', () => {
  assert.equal(mutationMap.statement_count, 78)
  assert.equal(mutationMap.mutation_count, 68)
  assert.deepEqual(mutationMap.coverage.unknown_statement_indexes, [])
  assert.deepEqual(mutationMap.coverage.unmapped_mutation_indexes, [])
  assert.equal(mutationMap.coverage.all_persistent_mutations_mapped, true)
})

test('every mapped mutation records an object, inverse, precondition, risk, and order', () => {
  for (const mutation of mutationMap.mutations) {
    assert.equal(mutation.mapped, true)
    assert.ok(mutation.objects.length > 0, `statement ${mutation.statement_index}`)
    assert.ok(mutation.inverse, `statement ${mutation.statement_index}`)
    assert.ok(mutation.inverse_preconditions.length > 0, `statement ${mutation.statement_index}`)
    assert.ok(mutation.risk, `statement ${mutation.statement_index}`)
    assert.ok(Number.isInteger(mutation.recovery_order), `statement ${mutation.statement_index}`)
  }
})

test('all ten cycle columns and their explicit inverses are present', () => {
  const additions = mutationMap.mutations.filter((entry) => entry.operation === 'add_columns')
  assert.deepEqual(additions.flatMap((entry) => entry.objects), PSDEALS_MIGRATION_004_CYCLE_COLUMNS)
  for (const column of PSDEALS_MIGRATION_004_CYCLE_COLUMNS) assert.match(recoverySql, new RegExp(`drop column ${column}\\b`, 'i'))
})

test('all nine cycle constraints and their explicit inverses are present', () => {
  const additions = mutationMap.mutations.filter((entry) => entry.operation === 'add_constraints')
  assert.deepEqual(additions.flatMap((entry) => entry.objects), PSDEALS_MIGRATION_004_CYCLE_CONSTRAINTS)
  for (const constraint of PSDEALS_MIGRATION_004_CYCLE_CONSTRAINTS) assert.match(recoverySql, new RegExp(`drop constraint ${constraint}\\b`, 'i'))
})

test('all three cycle indexes and their explicit inverses are present', () => {
  const indexes = mutationMap.mutations.filter((entry) => entry.operation === 'create_index')
  const cycleIndexes = indexes.flatMap((entry) => entry.objects).filter((name) => name.startsWith('price_refresh_cycles_'))
  assert.deepEqual(cycleIndexes, PSDEALS_MIGRATION_004_CYCLE_INDEXES)
  for (const index of PSDEALS_MIGRATION_004_CYCLE_INDEXES) assert.match(recoverySql, new RegExp(`drop index public\\.${index}\\b`, 'i'))
})

test('receipt table maps its 16 columns, 14 constraints, and four resulting indexes', () => {
  const table = mutationMap.mutations.find((entry) => entry.objects.includes('public.psdeals_cycle_action_receipts'))
  assert.ok(table)
  assert.deepEqual(table.created_subobjects.columns, PSDEALS_MIGRATION_004_RECEIPT_COLUMNS)
  assert.deepEqual(table.created_subobjects.constraints, PSDEALS_MIGRATION_004_RECEIPT_CONSTRAINTS)
  assert.deepEqual(table.created_subobjects.indexes, PSDEALS_MIGRATION_004_RECEIPT_INDEXES)
})

test('all twelve functions and both triggers have exact inverses', () => {
  const functions = mutationMap.mutations.filter((entry) => entry.operation === 'create_function')
  assert.equal(functions.length, Object.keys(PSDEALS_MIGRATION_004_RECOVERY_FUNCTIONS).length)
  const triggers = mutationMap.mutations.filter((entry) => entry.operation === 'create_trigger')
  assert.deepEqual(triggers.flatMap((entry) => entry.objects), PSDEALS_MIGRATION_004_TRIGGERS)
  assert.equal(validatePsdealsMigration004RecoverySql(recoverySql, migrationSql).valid, true)
})

test('migration creates RLS but no policy whose inverse could be omitted', () => {
  assert.equal(mutationMap.mutations.filter((entry) => entry.operation === 'enable_rls').length, 1)
  assert.doesNotMatch(migrationSql, /\bcreate\s+policy\b/i)
})

test('control-plane migration history is mapped separately and direct SQL is forbidden', () => {
  assert.deepEqual(mutationMap.control_plane_mutations, [PSDEALS_MIGRATION_004_CONTROL_PLANE_MUTATION])
  assert.equal(PSDEALS_MIGRATION_004_CONTROL_PLANE_MUTATION.included_in_recovery_sql, false)
  assert.equal(PSDEALS_MIGRATION_004_CONTROL_PLANE_MUTATION.direct_history_sql_forbidden, true)
  assert.doesNotMatch(recoverySql, /supabase_migrations|schema_migrations/i)
})

test('recovery runs in a transaction and locks both affected tables', () => {
  assert.match(recoverySql, /^begin;/im)
  assert.match(recoverySql, /lock table public\.price_refresh_cycles in access exclusive mode;/i)
  assert.match(recoverySql, /lock table public\.psdeals_cycle_action_receipts in access exclusive mode;/i)
  assert.match(recoverySql, /commit;\s*$/i)
})

test('recovery refuses nonzero cycles and nonzero receipts', () => {
  assert.match(recoverySql, /if cycle_count <> 0 then[\s\S]*PSDEALS_004_RECOVERY_CYCLES_PRESENT/i)
  assert.match(recoverySql, /if receipt_count <> 0 then[\s\S]*PSDEALS_004_RECOVERY_RECEIPTS_PRESENT/i)
  assert.doesNotMatch(recoverySql, /^\s*(?:delete|truncate)\b/im)
})

test('recovery requires the exact applied footprint before dropping anything', () => {
  for (const code of [
    'RECOVERY_CYCLE_COLUMNS_INCOMPATIBLE',
    'RECOVERY_CYCLE_CONSTRAINTS_INCOMPATIBLE',
    'RECOVERY_CYCLE_INDEXES_INCOMPATIBLE',
    'RECOVERY_RECEIPT_COLUMNS_INCOMPATIBLE',
    'RECOVERY_RECEIPT_CONSTRAINTS_INCOMPATIBLE',
    'RECOVERY_RECEIPT_INDEXES_INCOMPATIBLE',
    'RECOVERY_FUNCTION_SECURITY_INCOMPATIBLE',
    'RECOVERY_TRIGGER_INCOMPATIBLE',
  ]) assert.match(recoverySql, new RegExp(code))
})

test('an incompatible function signature fails static recovery validation', () => {
  const incompatible = recoverySql.replace(
    /drop function public\.refresh_catalog_public_cache_v16\([\s\S]*?\);/i,
    'drop function public.refresh_catalog_public_cache_v16(uuid);'
  )
  const result = validatePsdealsMigration004RecoverySql(incompatible, migrationSql)
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('recovery_function_inverse_missing:refresh_catalog_public_cache_v16'))
})

test('recovery contains neither CASCADE nor detailed price-history access', () => {
  assert.doesNotMatch(recoverySql, /\bcascade\b/i)
  assert.doesNotMatch(recoverySql, /psdeals_stage_price_history/i)
})

test('recovery does not mutate commercial tables or legacy objects', () => {
  assert.doesNotMatch(recoverySql, /(?:insert|update|delete|truncate)\s+(?:into\s+)?public\./i)
  assert.doesNotMatch(recoverySql, /drop\s+(?:table|function)\s+public\.(?:price_refresh_cycles|psdeals_stage_items|ps_plus_monthly_games|catalog_public_cache|certify_price_refresh_cycle|refresh_catalog_public_cache_v15)\b/i)
})

test('triggers and functions are removed before their dependent tables', () => {
  const dropReceiptTrigger = recoverySql.search(/drop trigger trg_psdeals_cycle_action_receipts_set_updated_at/i)
  const dropReceiptTable = recoverySql.search(/drop table public\.psdeals_cycle_action_receipts/i)
  const lastFunction = Math.max(...[...recoverySql.matchAll(/drop function public\./gi)].map((match) => match.index))
  assert.ok(dropReceiptTrigger < dropReceiptTable)
  assert.ok(lastFunction < dropReceiptTable)
})

test('legacy certify v1 and cache v15 hashes and grants are preserved explicitly', () => {
  assert.match(recoverySql, /3dfa2232903c014039f070f48d4044ffe0b329e38cb86615b9bdbc20c4f9aa88/)
  assert.match(recoverySql, /1c6e71d26e6554e6f8fdf2e6ed0388db959419db4ee64132d8ddd5761b3996dc/)
  assert.match(recoverySql, /grant execute on function public\.certify_price_refresh_cycle\(uuid\)[\s\S]*to service_role, postgres;/i)
  assert.match(recoverySql, /grant execute on function public\.refresh_catalog_public_cache_v15\(\)[\s\S]*to public, anon, authenticated, service_role, postgres;/i)
})

test('recovery is outside automatic migration paths and absent from the operational runner', async () => {
  assert.equal(isPsdealsMigration004RecoveryPathSafe(PSDEALS_MIGRATION_004_RECOVERY_PATH), true)
  assert.equal(isPsdealsMigration004RecoveryPathSafe('supabase/migrations/004.sql'), false)
  const runner = await fs.readFile('scripts/run-psdeals-edge-live-discounts-fast-refresh.ps1', 'utf8')
  assert.doesNotMatch(runner, /sql[\\/]recovery|reconciliable-cycle-actions-before-use/i)
})

test('bundle records an explicit empty cycle export and absent receipt table', () => {
  assert.deepEqual(emptyData.price_refresh_cycles, { row_count: 0, rows: [] })
  assert.deepEqual(emptyData.psdeals_cycle_action_receipts, { exists: false, row_count: null, rows: null })
  assert.equal(emptyData.price_history.exported, false)
})

test('bundle manifest proves scoped recovery but never authorizes its execution', () => {
  const result = validatePsdealsMigration004RecoveryBundle({
    manifest,
    mutation_map: storedMap,
    empty_operational_data: emptyData,
    checksums,
  })
  assert.equal(result.valid, true, result.errors.join(','))
  assert.equal(manifest.classification, 'SCOPED_RECOVERY_PROVEN')
  assert.equal(manifest.gates.recovery_sql_authorized_for_execution, false)
  assert.equal(manifest.gates.rollback_after_operational_use_forbidden, true)
})

test('all recorded bundle checksums and byte sizes match actual files', async () => {
  const result = verifyPsdealsMigration004RecoveryBundleChecksums(await checksumFiles(), checksums)
  assert.equal(result.valid, true, result.errors.join(','))
  assert.equal(result.verified_files, checksums.files.length)
})

test('bundle checksum verification detects altered evidence', async () => {
  const files = await checksumFiles()
  const first = checksums.files[0].path
  files[first] = Buffer.concat([files[first], Buffer.from('tampered')])
  const result = verifyPsdealsMigration004RecoveryBundleChecksums(files, checksums)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((code) => code === `bundle_checksum_mismatch:${first}`))
})

test('bundle members contain no recognized secret or personal absolute path', async () => {
  const files = await checksumFiles()
  assert.deepEqual(findPsdealsRecoveryBundleSecretSignals(files), [])
  for (const bytes of Object.values(files)) {
    assert.doesNotMatch(bytes.toString('utf8'), /C:\\Users\\johan|C:\/Users\/johan/i)
  }
})

test('migration itself performs no top-level data mutation or operational function invocation', () => {
  const statements = splitPsdealsSqlStatements(migrationSql)
  assert.equal(statements.some((entry) => /^(?:insert|update|delete|truncate)\b/i.test(entry.sql)), false)
  assert.equal(statements.some((entry) => /^(?:select|call)\s+.*(?:certify_price_refresh_cycle|refresh_catalog_public_cache_v15)/i.test(entry.sql)), false)
  assert.doesNotMatch(migrationSql, /psdeals_stage_price_history/i)
})
