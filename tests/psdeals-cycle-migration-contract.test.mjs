import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  canonicalizePsdealsDemotionCandidateIds,
  evaluatePsdealsCycleMigrationFacts,
  hashPsdealsDemotionCandidateIds,
  PSDEALS_CYCLE_MIGRATION_CONTRACT,
  validatePsdealsCycleMigrationSql,
  validatePsdealsRemoteActionReceipt,
} from '../scripts/lib/psdeals-cycle-migration-contract.mjs'
import {
  attachPsdealsRemoteActionReceipt,
  validatePsdealsCycleManifest,
} from '../scripts/lib/psdeals-cycle-manifest.mjs'

const factsPath = path.resolve('docs/audit/lobodeals-3-remote-readonly-facts-2026-07-29.json')
const migrationPath = path.resolve('sql/004-lobodeals-3-reconciliable-cycle-actions.sql')
const manifestPath = path.resolve('tests/fixtures/psdeals-cycle/valid-manifest.json')
const cycleId = '11111111-1111-4111-8111-111111111111'

async function remoteFacts() {
  return JSON.parse(await fs.readFile(factsPath, 'utf8'))
}

async function migratedFacts() {
  const facts = await remoteFacts()
  facts.objects.price_refresh_cycles.columns.push(...PSDEALS_CYCLE_MIGRATION_CONTRACT.cycle_columns)
  facts.objects.price_refresh_cycles.indexes.push(...PSDEALS_CYCLE_MIGRATION_CONTRACT.cycle_indexes)
  facts.objects.psdeals_cycle_action_receipts = {
    exists: true,
    object_type: 'table',
    columns: [...PSDEALS_CYCLE_MIGRATION_CONTRACT.receipt_columns],
    indexes: [...PSDEALS_CYCLE_MIGRATION_CONTRACT.receipt_indexes],
    rls_enabled: true,
    anon_write: false,
    authenticated_write: false,
    exact_rows: 0,
    can_select: true,
  }
  for (const [name, identity_arguments] of Object.entries(PSDEALS_CYCLE_MIGRATION_CONTRACT.functions)) {
    facts.functions[name] = {
      exists: true,
      identity_arguments,
      definition_verified: true,
      security_definer: true,
      search_path_empty: true,
      anon_execute: false,
      authenticated_execute: false,
      service_role_execute: name !== 'apply_psdeals_ended_deals_v1',
    }
  }
  return facts
}

function receipt(index, action_kind, parent_receipt_id = null) {
  const suffix = String(index).padStart(12, '0')
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    cycle_id: cycleId,
    parent_receipt_id,
    action_kind,
    idempotency_key: `${action_kind}:fixture:${index}`,
    request_hash: String(index % 10).repeat(64),
    input_artifact_hash: null,
    status: 'committed',
    started_at: `2026-07-29T21:${String(index).padStart(2, '0')}:00.000Z`,
  }
}

test('migration SQL passes the local fail-closed static contract', async () => {
  const sql = await fs.readFile(migrationPath, 'utf8')
  const result = validatePsdealsCycleMigrationSql(sql)
  assert.equal(result.valid, true, result.errors.join(','))
  assert.equal(result.function_count, 12)
  assert.equal(result.static_validation_only, true)
})

test('migration SQL preserves legacy lifecycle functions without destructive statements', async () => {
  const sql = await fs.readFile(migrationPath, 'utf8')
  assert.match(sql, /from public\.certify_price_refresh_cycle\(p_cycle_id\)/)
  assert.match(sql, /from public\.refresh_catalog_public_cache_v15\(\)/)
  assert.doesNotMatch(sql, /^\s*(?:drop|delete|truncate)\b/im)
  assert.doesNotMatch(sql, /\bcascade\b/i)
  assert.doesNotMatch(sql, /\bcreate\s+or\s+replace\b/i)
  assert.doesNotMatch(sql, /\bexecute\s+(?:format\s*\(|['"])/i)
})

test('every SECURITY DEFINER function fixes an empty search_path', async () => {
  const sql = await fs.readFile(migrationPath, 'utf8')
  const blocks = [...sql.matchAll(/create function\s+([^\s(]+)[\s\S]*?\$function\$;/gi)]
  for (const block of blocks) {
    if (/security definer/i.test(block[0])) assert.match(block[0], /set search_path\s*=\s*''/i, block[1])
  }
})

test('remote facts before application are classified MIGRATION_NOT_APPLIED', async () => {
  const result = evaluatePsdealsCycleMigrationFacts(await remoteFacts())
  assert.equal(result.migration_status, 'MIGRATION_NOT_APPLIED')
  assert.equal(result.ready, false)
})

test('a complete migrated catalog is MIGRATION_READY but not live by assumption', async () => {
  const facts = await migratedFacts()
  const result = evaluatePsdealsCycleMigrationFacts(facts)
  assert.equal(result.migration_status, 'MIGRATION_READY')
  assert.equal(result.ready, true)
  facts.live_cycle_prerequisites_verified = true
  assert.equal(evaluatePsdealsCycleMigrationFacts(facts).migration_status, 'LIVE_CYCLE_READY')
})

test('partial application and incompatible function contracts are distinct', async () => {
  const partial = await remoteFacts()
  partial.objects.price_refresh_cycles.columns.push('local_cycle_id')
  assert.equal(evaluatePsdealsCycleMigrationFacts(partial).migration_status, 'MIGRATION_PARTIALLY_APPLIED')

  const incompatible = await migratedFacts()
  incompatible.functions.refresh_catalog_public_cache_v16.anon_execute = true
  assert.equal(evaluatePsdealsCycleMigrationFacts(incompatible).migration_status, 'MIGRATION_CONTRACT_MISMATCH')
})

test('rows appearing before application keep the migration fail-closed', async () => {
  const facts = await remoteFacts()
  facts.measurements.price_refresh_cycles = 1
  const result = evaluatePsdealsCycleMigrationFacts(facts)
  assert.equal(result.ready, false)
  assert.ok(result.blockers.some((entry) => entry.code === 'MIGRATION_BASE_CYCLE_ROWS_PRESENT'))
})

test('candidate IDs use the same sorted newline-delimited bounded identity as SQL', () => {
  assert.deepEqual(canonicalizePsdealsDemotionCandidateIds([9, 2, 9, 4]), [2, 4, 9])
  assert.equal(hashPsdealsDemotionCandidateIds([]), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(hashPsdealsDemotionCandidateIds([2, 4, 9]), hashPsdealsDemotionCandidateIds([9, 2, 4, 9]))
  assert.throws(() => canonicalizePsdealsDemotionCandidateIds([0]), /INVALID/)
})

test('remote receipts reject malformed identity and contradictory expected fields', () => {
  const value = receipt(1, 'create_cycle')
  assert.equal(validatePsdealsRemoteActionReceipt(value, { cycle_id: cycleId }).committed, true)
  assert.equal(validatePsdealsRemoteActionReceipt({ ...value, request_hash: 'bad' }).valid, false)
  assert.equal(validatePsdealsRemoteActionReceipt(value, { cycle_id: '22222222-2222-4222-8222-222222222222' }).valid, false)
})

test('manifest receipt contract opens gates only from a complete committed chain', async () => {
  let manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const listing = receipt(1, 'listing_validation')
  const upsert = receipt(2, 'listing_upsert_batch', listing.id)
  const fast = receipt(3, 'fast_refresh_analysis', listing.id)
  const detail = receipt(4, 'detail_import', fast.id)
  const monthly = receipt(5, 'monthly_check_record')
  const ended = receipt(6, 'ended_deals_analysis', listing.id)
  const demotion = receipt(7, 'demotion_apply', ended.id)
  const mark = receipt(8, 'mark_succeeded', demotion.id)
  for (const value of [listing, upsert, fast, detail, monthly, ended, demotion, mark]) {
    manifest = attachPsdealsRemoteActionReceipt(manifest, value)
  }
  const validation = validatePsdealsCycleManifest(manifest, { now: '2026-07-29T23:00:00.000Z' })
  assert.equal(validation.remote_receipt_contract_enforced, true)
  assert.equal(validation.can_mark_succeeded, true)
  assert.equal(validation.can_certify, true)
  assert.equal(validation.can_refresh_cache, false)
})

test('manifest receipt contract rejects a missing parent and incompatible replay', async () => {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const listing = receipt(1, 'listing_validation')
  let attached = attachPsdealsRemoteActionReceipt(manifest, listing)
  assert.throws(
    () => attachPsdealsRemoteActionReceipt(attached, { ...listing, request_hash: '9'.repeat(64) }),
    /CONTRADICTION/
  )
  attached = attachPsdealsRemoteActionReceipt(attached, receipt(2, 'listing_upsert_batch', '99999999-9999-4999-8999-999999999999'))
  const validation = validatePsdealsCycleManifest(attached, { now: '2026-07-29T23:00:00.000Z' })
  assert.ok(validation.reason_codes.includes('REMOTE_RECEIPT_PARENT_MISSING'))
})
