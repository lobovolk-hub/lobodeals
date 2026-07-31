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
