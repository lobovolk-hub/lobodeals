import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const sql = await fs.readFile(
  path.resolve('sql/004-lobodeals-3-reconciliable-cycle-actions.sql'),
  'utf8'
)

function functionSql(name) {
  const match = sql.match(new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$function\\$;`, 'i'))
  assert.ok(match, `missing ${name}`)
  return match[0]
}

test('application preflight locks cycles and refuses legacy rows or changed function hashes', () => {
  assert.match(sql, /lock table public\.price_refresh_cycles in access exclusive mode/i)
  assert.match(sql, /if cycle_count <> 0 then/i)
  assert.match(sql, /certify_sha256 <> '[a-f0-9]{64}'/i)
  assert.match(sql, /cache_sha256 <> '[a-f0-9]{64}'/i)
})

test('identity has separate unique guards for local_cycle_id and run_token hash', () => {
  assert.match(sql, /create unique index price_refresh_cycles_local_cycle_id_unique_idx/i)
  assert.match(sql, /create unique index price_refresh_cycles_run_token_sha256_unique_idx/i)
  assert.match(sql, /PSDEALS_CYCLE_IDENTITY_IMMUTABLE/)
  assert.match(sql, /run_token_sha256 ~ '\^\[a-f0-9\]\{64\}\$'/)
})

test('create-cycle uses deterministic advisory locks and exact contradiction checks', () => {
  const value = functionSql('create_or_reconcile_price_refresh_cycle_v1')
  assert.match(value, /pg_advisory_xact_lock/g)
  assert.match(value, /PSDEALS_CREATE_CYCLE_IDENTITY_SPLIT/)
  assert.match(value, /PSDEALS_CREATE_CYCLE_IDENTITY_CONTRADICTION/)
  assert.match(value, /p_started_at at time zone 'America\/Lima'/)
  assert.doesNotMatch(value, /status\s*=\s*'succeeded'/i)
})

test('receipt storage is bounded, globally idempotent, and retained without cascading deletion', () => {
  assert.match(sql, /constraint psdeals_cycle_action_receipts_idempotency_unique\s+unique \(idempotency_key\)/i)
  assert.match(sql, /pg_column_size\(result\) <= 16384/i)
  assert.match(sql, /on delete restrict/gi)
  assert.doesNotMatch(sql, /on delete cascade/i)
  assert.match(sql, /attempt between 1 and 100/i)
})

test('receipt terminal transitions reject contradictions and committed error codes', () => {
  const value = functionSql('_finish_psdeals_cycle_action_v1')
  assert.match(value, /PSDEALS_ACTION_TERMINAL_REPLAY_CONTRADICTION/)
  assert.match(value, /PSDEALS_ACTION_COMMITTED_ERROR_CONTRADICTION/)
  assert.match(value, /PSDEALS_ACTION_FAILURE_CODE_REQUIRED/)
})

test('listing completion cannot pass with a page failure, duplicate, partial file, or weak termination', () => {
  const value = functionSql('record_psdeals_listing_completion_v1')
  assert.match(value, /p_pages_failed <> 0/)
  assert.match(value, /p_duplicate_ids <> 0/)
  assert.match(value, /p_is_partial is distinct from false/)
  assert.match(value, /p_termination_observed is distinct from true/)
})

test('monthly evidence requires semantics and never updates monthly-game rows', () => {
  const value = functionSql('record_psdeals_monthly_check_v1')
  assert.match(value, /p_evidence_hash !~ '\^\[a-f0-9\]\{64\}\$'/)
  assert.match(value, /p_application_performed is distinct from false/)
  assert.match(value, /'no_changes', 'proposed_changes', 'indeterminate', 'failed'/)
  assert.doesNotMatch(value, /update public\.ps_plus_monthly_games/i)
})

test('proposed monthly changes cannot complete the cycle timestamp gate', () => {
  const value = functionSql('record_psdeals_monthly_check_v1')
  assert.match(value, /if p_result = 'no_changes' then[\s\S]*monthly_games_checked_at/i)
  assert.doesNotMatch(value, /if p_result = 'proposed_changes' then[\s\S]*monthly_games_checked_at/i)
})

test('demotion requires complete listing evidence and a canonical set of at most 500 IDs', () => {
  const value = functionSql('apply_psdeals_ended_deals_v1')
  assert.match(value, /cycle_row\.listing_complete is distinct from true/)
  assert.match(value, /p_expected_count > 500/)
  assert.match(value, /canonical_ids <> p_candidate_psdeals_ids/)
  assert.match(value, /PSDEALS_DEMOTION_CANDIDATE_HASH_MISMATCH/)
})

test('demotion updates only exact scoped candidates and checks the affected count', () => {
  const value = functionSql('apply_psdeals_ended_deals_v1')
  assert.match(value, /item\.region_code = cycle_row\.region_code/)
  assert.match(value, /item\.storefront = cycle_row\.storefront/)
  assert.match(value, /item\.psdeals_id = any\(canonical_ids\)/)
  assert.match(value, /item\.current_price_amount <= 0/)
  assert.match(value, /item\.original_price_amount <= 0/)
  assert.match(value, /item\.discount_percent <> round\(/)
  assert.match(value, /item\.original_price_amount - item\.current_price_amount/)
  assert.match(value, /if updated_rows <> p_expected_count/)
})

test('non-terminal receipts cannot carry an error code', () => {
  assert.match(sql, /status in \('intent', 'running'\) and error_code is null/)
})

test('mark-succeeded requires receipts, no pending detail failures, monthly no_changes, and demotion', () => {
  const value = functionSql('mark_psdeals_price_refresh_cycle_succeeded_v1')
  for (const kind of [
    'listing_validation', 'listing_upsert_batch', 'fast_refresh_analysis',
    'monthly_check_record', 'ended_deals_analysis', 'demotion_apply',
  ]) assert.match(value, new RegExp(`action_kind = '${kind}'`))
  assert.match(value, /pending_failures/)
  assert.match(value, /result ->> 'result' = 'no_changes'/)
  assert.match(value, /status in \('intent', 'running', 'indeterminate'\)/)
})

test('certification v2 requires the mark receipt and wraps the unchanged v1 function', () => {
  const value = functionSql('certify_price_refresh_cycle_v2')
  assert.match(value, /mark_row\.action_kind <> 'mark_succeeded'/)
  assert.match(value, /cycle_row\.status <> 'succeeded'/)
  assert.match(value, /from public\.certify_price_refresh_cycle\(p_cycle_id\)/)
  assert.match(value, /'certify'/)
})

test('cache v16 requires certification, wraps v15 transactionally, and records postconditions', () => {
  const value = functionSql('refresh_catalog_public_cache_v16')
  assert.match(value, /certify_row\.action_kind <> 'certify'/)
  assert.match(value, /cycle_row\.status <> 'certified'/)
  assert.match(value, /from public\.refresh_catalog_public_cache_v15\(\)/)
  assert.match(value, /expired_deals_value <> 0/)
  assert.match(value, /cache_refreshed_at = finished_at_value/)
})

test('public validation and metrics receipts require the correct committed parents', () => {
  const value = functionSql('_finish_psdeals_cycle_action_v1')
  assert.match(value, /parent_row\.action_kind <> 'cache_refresh'/)
  assert.match(value, /parent_row\.action_kind <> 'public_validation'/)
  assert.match(value, /public_validation_completed_at/)
  assert.match(value, /metrics_recorded_at/)
})

test('critical RPCs are not executable by anon or authenticated and legacy RPCs become internal', () => {
  for (const name of Object.keys({
    create_or_reconcile_price_refresh_cycle_v1: true,
    apply_psdeals_ended_deals_v1: true,
    mark_psdeals_price_refresh_cycle_succeeded_v1: true,
    certify_price_refresh_cycle_v2: true,
    refresh_catalog_public_cache_v16: true,
  })) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated;`, 'i'))
  }
  assert.match(sql, /revoke all on function public\.certify_price_refresh_cycle\(uuid\)[\s\S]*from public, anon, authenticated, service_role;/i)
  assert.match(sql, /revoke all on function public\.refresh_catalog_public_cache_v15\(\)[\s\S]*from public, anon, authenticated, service_role;/i)
})
