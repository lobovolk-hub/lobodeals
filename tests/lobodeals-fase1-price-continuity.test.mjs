import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8')
}

function functionBody(sql, declaration) {
  const declarationStart = sql.indexOf(declaration)
  assert.notEqual(declarationStart, -1)
  const delimiter = '$function$'
  const start = sql.indexOf(delimiter, declarationStart)
  const end = sql.indexOf(delimiter, start + delimiter.length)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  return sql.slice(start + delimiter.length, end)
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

test('011 adds a cycle-bound Monthly positive regular low without promoting legacy history', async () => {
  const migration = await read('sql/011-lobodeals-3-monthly-regular-continuity.sql')
  const applied = migration.slice(
    migration.indexOf('applied as ('),
    migration.indexOf(
      '    update public.price_refresh_cycles',
      migration.indexOf('applied as (')
    )
  )

  assert.match(migration, /create or replace function public\.certify_price_refresh_cycle_v5/)
  assert.match(migration, /public\.certify_price_refresh_cycle_v4\(/)
  assert.match(migration, /classification'='no_discount'/)
  assert.match(migration, /monthly_regular_certification_input_artifact_sha256/)
  assert.match(migration, /detail_receipt\.action_kind in \('detail_import','detail_retry'\)/)
  assert.match(migration, /monthly_game\.is_active=true/)
  assert.match(migration, /item\.current_price_amount > 0/)
  assert.match(migration, /monthly_regular_certification_candidate ->> 'classification'='no_discount'/)
  assert.match(migration, /monthly_entitlement_excluded_from_ps_plus_low',true/)
  assert.match(migration, /legacy_lows_promoted_to_certified',false/)
  assert.match(applied, /lobodeals_lowest_regular_price_amount=least/)
  assert.doesNotMatch(applied, /lowest_price_amount=/)
  assert.doesNotMatch(applied, /lobodeals_lowest_ps_plus_price_amount=/)
  assert.doesNotMatch(migration, /Big Walk|3781017|Dying Light|SIGNALIS/i)
  assert.doesNotMatch(migration, /\bcascade\b/i)
})

test('011 remains fail-closed, service-role only, and exposes preflight v25', async () => {
  const migration = await read('sql/011-lobodeals-3-monthly-regular-continuity.sql')
  const postcheck = await read(
    'sql/validation/011-monthly-regular-continuity-postcheck-readonly.sql'
  )

  assert.match(migration, /LOBODEALS_011_CERTIFY_V4_SEMANTIC_DRIFT/)
  assert.match(migration, /LOBODEALS_011_PREEXISTING_CONTRACT_PARTIAL/)
  assert.match(migration, /LOBODEALS_011_PREEXISTING_V5_DRIFT/)
  assert.match(migration, /LOBODEALS_011_PREEXISTING_V25_DRIFT/)
  assert.match(migration, /procedure\.prosecdef/)
  assert.match(migration, /array\['search_path=""'\]::text\[\]/)
  assert.match(migration, /procedure\.prosrc/)
  assert.match(migration, /privilege\.grantee not in/)
  assert.match(migration, /PSDEALS_CERTIFY_V5_IDEMPOTENCY_MISMATCH/)
  assert.match(migration, /PSDEALS_CERTIFY_V5_EXISTING_RECEIPT_NOT_TERMINAL/)
  assert.match(migration, /create or replace function public\.lobodeals_daily_runner_v25_preflight/)
  assert.match(migration, /revoke all on function public\.certify_price_refresh_cycle_v5[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.certify_price_refresh_cycle_v5[\s\S]*to service_role/)
  assert.match(postcheck, /begin transaction read only/i)
  assert.match(postcheck, /monthly_zero_verified_ps_plus_leaks/)
  assert.match(postcheck, /monthly_positive_regular_lows_pending_future_cycle/)
  assert.match(postcheck, /LOBODEALS_011_POSTCHECK_V5_FUNCTION_CONTRACT_INVALID/)
  assert.match(postcheck, /LOBODEALS_011_POSTCHECK_V25_FUNCTION_CONTRACT_INVALID/)
  assert.match(postcheck, /LOBODEALS_011_POSTCHECK_V25_PREFLIGHT_FALSE/)
  assert.match(postcheck, /lowest_price_amount\[\[:space:\]\]\*=/)
  assert.match(postcheck, /rollback/i)
})

test('011 pins exact v5/v25 function sources and the strong preflight verifies v5', async () => {
  const migration = await read('sql/011-lobodeals-3-monthly-regular-continuity.sql')
  const v5 = functionBody(
    migration,
    'create or replace function public.certify_price_refresh_cycle_v5('
  )
  const v25 = functionBody(
    migration,
    'create or replace function public.lobodeals_daily_runner_v25_preflight()'
  )
  const v5Hash = sha256(v5)
  const v25Hash = sha256(v25)

  assert.equal(v5Hash, 'a5a285b6b181cf265ec2401bed9e4886e396e660cd159d013ba875e6bc099548')
  assert.equal(v25Hash, '8081c9f1a695f2b5bcfcb2a03d8f2c3e166631941731e86ac0925892da9562cf')
  assert.ok(migration.split(v5Hash).length >= 3)
  assert.ok(migration.includes(v25Hash))
  assert.match(v25, /pg_catalog\.pg_get_userbyid\(procedure\.proowner\)='postgres'/)
  assert.match(v25, /procedure\.prosecdef/)
  assert.match(v25, /procedure\.proconfig/)
  assert.match(v25, /procedure\.prosrc/)
  assert.match(v25, /has_function_privilege\([\s\S]*service_role/)
  assert.match(v25, /select count\(\*\)=13/)
})

test('011 v25 preflight preserves the varchar(64) hash-column contract installed by 009', async () => {
  const [migration009, migration011, postcheck011] = await Promise.all([
    read('sql/009-lobodeals-3-public-offer-verification.sql'),
    read('sql/011-lobodeals-3-monthly-regular-continuity.sql'),
    read('sql/validation/011-monthly-regular-continuity-postcheck-readonly.sql'),
  ])
  const v25 = functionBody(
    migration011,
    'create or replace function public.lobodeals_daily_runner_v25_preflight()'
  )
  const columns = [
    'monthly_regular_certification_evidence_sha256',
    'monthly_regular_certification_input_artifact_sha256',
  ]

  for (const column of columns) {
    assert.match(
      migration009,
      new RegExp(`add column ${column} varchar\\(64\\) null`)
    )
  }

  const v25Varchar64Contract = /column_name in \(\s*'monthly_regular_certification_evidence_sha256',\s*'monthly_regular_certification_input_artifact_sha256'\s*\)\s*and data_type='character varying'\s*and udt_name='varchar'\s*and character_maximum_length=64/g
  assert.equal([...v25.matchAll(v25Varchar64Contract)].length, 2)
  assert.doesNotMatch(
    v25,
    /column_name in \(\s*'monthly_regular_certification_evidence_sha256',\s*'monthly_regular_certification_input_artifact_sha256'\s*\)\s*and data_type='text'/
  )
  assert.match(
    postcheck011,
    /column_name in \(\s*'monthly_regular_certification_evidence_sha256',\s*'monthly_regular_certification_input_artifact_sha256'\s*\)\s*and data_type='character varying'\s*and udt_name='varchar'\s*and character_maximum_length=64/
  )
})

test('operator requires v5 and persists official Monthly candidates in the read-only plan', async () => {
  const [operator, core] = await Promise.all([
    read('scripts/lobodeals-daily-operator-v1.mjs'),
    read('scripts/lib/lobodeals-daily-core-v1.mjs'),
  ])

  assert.match(core, /'certify_price_refresh_cycle_v5'/)
  assert.match(operator, /certification_rpc: 'certify_price_refresh_cycle_v5'/)
  assert.match(operator, /rpc\('certify_price_refresh_cycle_v5'/)
  assert.match(operator, /p_idempotency_key: `certify-v5:\$\{runId\}`/)
  assert.match(operator, /lobodeals_daily_runner_v25_preflight/)
  assert.match(operator, /monthly_continuity: monthlyContinuityItems\.length/)
  assert.match(operator, /detail_items: detailItems/)
})

test('public pages receive Monthly fields and slugs distinguish legacy from certified lows', async () => {
  const [home, catalog, deals, tracked, card, slug] = await Promise.all([
    read('app/page.tsx'),
    read('app/catalog/page.tsx'),
    read('app/deals/page.tsx'),
    read('app/tracked/page.tsx'),
    read('components/item-card.tsx'),
    read('app/us/playstation/[slug]/page.tsx'),
  ])

  for (const page of [home, catalog, deals, tracked]) {
    assert.match(page, /ItemCard/)
  }
  assert.match(catalog, /type CatalogItem = ItemCardData/)
  for (const page of [home, deals, tracked]) {
    assert.match(page, /is_ps_plus_monthly_game/)
    assert.match(page, /ps_plus_monthly_label/)
  }
  assert.match(card, /derivePublicPricePresentation/)
  assert.match(card, /text-emerald-300/)
  assert.match(card, /text-yellow-300/)
  assert.match(card, /showBuyPrice = pricePresentation\.show_buy_price/)
  assert.match(card, /Buy price/)
  assert.match(slug, /lowest_price_amount, lowest_ps_plus_price_amount/)
  assert.match(slug, /Historical lowest regular price/)
  assert.match(slug, /Historical lowest PS\+ price/)
  assert.match(slug, /Lowest certified regular price/)
  assert.match(slug, /Lowest certified PS\+ price/)
  assert.match(slug, /derivePublicPricePresentation/)
  assert.match(slug, /showBuyPrice = pricePresentation\.show_buy_price/)
  assert.match(slug, />\s*Buy price\s*</)
  assert.match(slug, /function buildSlugSeoTitle[\s\S]*derivePublicPricePresentation\(item\)/)
  assert.match(slug, /function buildSlugSeoDescription[\s\S]*derivePublicPricePresentation\(item\)/)
  assert.doesNotMatch(slug, /item\.discount_percent[\s\S]{0,120}PS\+/)
})

test('historical 008, 009, and 010 remain outside the FASE 1 migration', async () => {
  const migration = await read('sql/011-lobodeals-3-monthly-regular-continuity.sql')
  assert.doesNotMatch(migration, /create or replace function public\.search_catalog_public_cache_v2/)
  assert.doesNotMatch(migration, /create or replace function public\.refresh_catalog_public_cache_v19/)
  assert.doesNotMatch(migration, /create or replace function public\.apply_psdeals_ended_deals/)
})
