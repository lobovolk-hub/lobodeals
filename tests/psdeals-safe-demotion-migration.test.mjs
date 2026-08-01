import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const migration = await fs.readFile(
  path.resolve('sql/007-lobodeals-3-safe-demotion-hardening.sql'),
  'utf8'
)
const recovery = await fs.readFile(
  path.resolve('sql/recovery/007-lobodeals-3-safe-demotion-hardening-before-use.sql'),
  'utf8'
)

function v2Sql() {
  const match = migration.match(
    /create function public\.apply_psdeals_ended_deals_v2\([\s\S]*?\$function\$;/i
  )
  assert.ok(match, 'missing apply_psdeals_ended_deals_v2')
  return match[0]
}

test('migration 007 is additive, hash-pinned and forbidden after a cycle exists', () => {
  assert.match(migration, /begin;/i)
  assert.match(migration, /commit;/i)
  assert.match(
    migration,
    /e2809e095b09088af405416151f39c6081ac0dd34b981d619e74db5377f6863e/
  )
  assert.match(migration, /if cycle_count <> 0 then/i)
  assert.doesNotMatch(migration, /\bcascade\b/i)
  assert.doesNotMatch(migration, /^\s*(?:delete|truncate)\b/im)
})

test('v2 blocks PS Plus, active Monthly, future deals and invalid product family', () => {
  const value = v2Sql()
  assert.match(value, /item\.is_ps_plus_discount is distinct from false/i)
  assert.match(value, /from public\.ps_plus_monthly_games as monthly_game/i)
  assert.match(value, /monthly_game\.is_active = true/i)
  assert.match(value, /item\.deal_ends_at > p_applied_at/i)
  assert.match(value, /item\.content_type = 'game' and item\.item_type_label = 'game'/i)
  assert.match(value, /item\.content_type = 'bundle' and item\.item_type_label = 'bundle'/i)
  assert.match(value, /item\.content_type = 'dlc' and item\.item_type_label = 'addon'/i)
})

test('v2 blocks unsafe price and identity tuples before delegating atomically to v1', () => {
  const value = v2Sql()
  assert.match(value, /item\.original_price_amount <= item\.current_price_amount/i)
  assert.match(value, /item\.discount_percent not between 1 and 99/i)
  assert.match(value, /item\.discount_percent <> round\(/i)
  assert.match(value, /item\.psdeals_slug is null/i)
  assert.match(value, /item\.psdeals_url not like/i)
  assert.match(value, /rows_found <> p_expected_count or ineligible_rows <> 0/i)
  assert.match(value, /return public\.apply_psdeals_ended_deals_v1\(/i)
})

test('only hardened v2 remains executable by service_role', () => {
  assert.match(
    migration,
    /revoke all on function public\.apply_psdeals_ended_deals_v1\([\s\S]*?from service_role;/i
  )
  assert.match(
    migration,
    /revoke all on function public\.apply_psdeals_ended_deals_v2\([\s\S]*?from public, anon, authenticated;/i
  )
  assert.match(
    migration,
    /grant execute on function public\.apply_psdeals_ended_deals_v2\([\s\S]*?to service_role;/i
  )
})

test('before-use recovery is bounded, non-cascading and refuses used cycles', () => {
  assert.match(recovery, /PSDEALS_007_RECOVERY_FORBIDDEN_AFTER_USE/)
  assert.match(recovery, /drop function public\.apply_psdeals_ended_deals_v2\(/i)
  assert.match(recovery, /grant execute on function public\.apply_psdeals_ended_deals_v1\(/i)
  assert.doesNotMatch(recovery, /\bcascade\b/i)
  assert.doesNotMatch(recovery, /^\s*(?:delete|truncate)\b/im)
})

