import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8')
}

test('public deals use cycle-bound verified flags while commercial flags remain preserved', async () => {
  const migration = await read('sql/009-lobodeals-3-public-offer-verification.sql')
  const deals = await read('app/deals/page.tsx')
  const home = await read('app/page.tsx')
  const card = await read('components/item-card.tsx')

  assert.match(migration, /has_verified_deal boolean not null default false/i)
  assert.match(migration, /public_offer_verification_cycle_id=p_cycle_id/i)
  assert.match(migration, /listing_receipt\.result ->> 'complete'='true'/i)
  assert.match(migration, /detail_receipt\.status='committed'/i)
  assert.match(migration, /has_verified_deal is distinct from true or has_deal=true/i)
  assert.match(
    migration,
    /'preserved_commercial_regular_deals',commercial_regular_count/i
  )
  assert.match(
    migration,
    /'preserved_commercial_ps_plus_deals',commercial_ps_plus_count/i
  )
  assert.match(deals, /has_verified_deal\.eq\.true,has_verified_ps_plus_deal\.eq\.true/)
  assert.doesNotMatch(deals, /\.or\('has_deal\.eq\.true,has_ps_plus_deal\.eq\.true'\)/)
  assert.match(home, /has_verified_deal\.eq\.true,has_verified_ps_plus_deal\.eq\.true/g)
  assert.match(card, /item\.has_verified_deal/)
  assert.match(card, /item\.has_verified_ps_plus_deal/)
})

test('Monthly regular-price contract excludes the free entitlement from commercial and PS Plus lows', async () => {
  const migration = await read('sql/009-lobodeals-3-public-offer-verification.sql')
  const payload = await read('scripts/lib/psdeals-stage-payload.mjs')
  const monthlyBlock = migration.slice(
    migration.indexOf("with eligible as ("),
    migration.indexOf('create function public.refresh_catalog_public_cache_v19')
  )

  assert.match(payload, /detail_monthly_entitlement_separated_from_commercial_state/)
  assert.match(payload, /buildPsdealsMonthlyRegularCertificationEvidence/)
  assert.match(monthlyBlock, /monthly_regular_certification_candidate/)
  assert.match(monthlyBlock, /lobodeals_lowest_regular_price_amount/)
  assert.match(monthlyBlock, /current_price_amount=eligible\.regular_amount/)
  assert.match(monthlyBlock, /discount_percent=0/)
  assert.doesNotMatch(monthlyBlock, /lobodeals_lowest_ps_plus_price_amount/)
  assert.match(migration, /monthly_entitlement_excluded_from_ps_plus_low',true/)
  assert.doesNotMatch(migration, /Big Walk|3781017/)
})

test('certification replaces the global Monthly veto with positive commercial PS Plus source guards', async () => {
  const [migration, deployedV3] = await Promise.all([
    read('sql/009-lobodeals-3-public-offer-verification.sql'),
    read('sql/005-lobodeals-3-cycle-bound-price-certification.sql'),
  ])

  function dollarLiteral(variable, tag) {
    const declaration = `${variable} constant text :=`
    const declarationStart = migration.indexOf(declaration)
    const literalTag = `$${tag}$`
    const start = migration.indexOf(literalTag, declarationStart + declaration.length)
    const end = migration.indexOf(literalTag, start + literalTag.length)
    assert.notEqual(declarationStart, -1, variable)
    assert.notEqual(start, -1, tag)
    assert.notEqual(end, -1, tag)
    return migration.slice(start + literalTag.length, end)
  }

  const sourceAnchor = dollarLiteral('v_source_anchor', 'source_anchor')
  const sourceWithRaw = dollarLiteral('v_source_with_raw', 'source_with_raw')
  const monthlyGuard = dollarLiteral('v_monthly_guard', 'monthly_guard')
  const commercialGuard = dollarLiteral(
    'v_commercial_source_guard',
    'commercial_source_guard'
  )

  assert.ok(deployedV3.includes(sourceAnchor))
  assert.ok(deployedV3.includes(monthlyGuard))
  const patchedV3 = deployedV3
    .replace(sourceAnchor, () => sourceWithRaw)
    .replace(monthlyGuard, () => commercialGuard)
  assert.equal(patchedV3.includes(monthlyGuard), false)
  assert.ok(patchedV3.includes(sourceWithRaw))
  assert.ok(patchedV3.includes(commercialGuard))

  assert.match(
    migration,
    /replace\(v_def,v_monthly_guard,v_commercial_source_guard\)/
  )
  assert.match(
    migration,
    /current_ps_plus_buy_box_price_amount[\s\S]*::numeric > 0/
  )
  assert.match(
    migration,
    /current_ps_plus_buy_box_price_amount[\s\S]*::numeric = source\.candidate_amount/
  )
  assert.match(
    migration,
    /commercial_state,classification}'[\s\S]*is distinct from 'temporary_free_promotion_candidate'/
  )
  assert.match(migration, /LOBODEALS_009_CERTIFY_V3_SEMANTIC_DRIFT/)
  assert.match(migration, /LOBODEALS_009_CERTIFY_V3_PATCH_ASSERTION_FAILED/)
})

test('Monthly regular recovery cannot overwrite a concurrent same-cycle regular sale', async () => {
  const migration = await read('sql/009-lobodeals-3-public-offer-verification.sql')
  const monthlyBlock = migration.slice(
    migration.indexOf('with eligible as ('),
    migration.indexOf('create function public.refresh_catalog_public_cache_v19')
  )

  assert.equal(
    (monthlyBlock.match(/where item\.regular_certification_cycle_id=p_cycle_id/g) || []).length,
    2
  )
  assert.equal(
    (monthlyBlock.match(/public_offer_verification_source='complete_listing'/g) || []).length,
    2
  )
  assert.equal(
    (monthlyBlock.match(/discount_percent between 1 and 99/g) || []).length,
    2
  )
  assert.match(monthlyBlock, /regular_listing_receipt\.result ->> 'complete'='true'/)
})

test('Monthly postcheck distinguishes contamination from an independent commercial deal', async () => {
  const postcheck = await read(
    'sql/validation/009-public-offer-verification-postcheck-readonly.sql'
  )

  assert.match(postcheck, /'monthly_commercial_leaks'/)
  assert.match(postcheck, /'monthly_independent_commercial_deals'/)
  assert.match(postcheck, /cache\.current_price_amount > 0/)
  assert.match(postcheck, /cache\.discount_percent between 1 and 99/)
  assert.match(postcheck, /'ps_plus_minimum_semantics'/)
  assert.match(postcheck, /'monthly_membership_not_globally_excluded'/)
  assert.match(postcheck, /'current_cycle_ps_plus_low_source_leaks'/)
  assert.doesNotMatch(
    postcheck,
    /is_ps_plus_monthly_game=true[\s\S]{0,300}has_deal=true\s*or cache\.has_ps_plus_deal=true/
  )
})

test('Big Walk recovery is separate, exact-evidence bound, and never automatic', async () => {
  const recovery = await read(
    'sql/recovery/009-lobodeals-3-big-walk-monthly-regular-price-before-use.sql'
  )

  assert.match(recovery, /psdeals_id=3781017/)
  assert.match(recovery, /original_price}'='\$19\.99'/)
  assert.match(recovery, /lobodeals_lowest_regular_price_amount=19\.99/)
  assert.match(recovery, /lobodeals_lowest_ps_plus_price_amount is null/)
  assert.match(recovery, /has_verified_deal=false/)
  assert.match(recovery, /has_verified_ps_plus_deal=false/)
  assert.doesNotMatch(recovery, /\bcascade\b/i)
})

test('Home has no featured carousel query or rendering', async () => {
  const home = await read('app/page.tsx')
  assert.doesNotMatch(home, /HomeFeaturedCarousel/)
  assert.doesNotMatch(home, /featuredCarouselSlugs/)
  assert.doesNotMatch(home, /featuredResult/)
  assert.match(home, /This month’s PS Plus games/)
  assert.match(home, /Upcoming games/)
  assert.match(home, /Latest releases/)
})

test('public source contains no mojibake literals', async () => {
  const roots = ['app', 'components']
  const mojibake = /\u00e2|\u00c3|\u00c2|\u00f0\u0178|\ufffd/u
  const violations = []

  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
      } else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
        const value = await fs.readFile(absolute, 'utf8')
        if (mojibake.test(value)) violations.push(path.relative(root, absolute))
      }
    }
  }

  for (const directory of roots) await walk(path.join(root, directory))
  assert.deepEqual(violations, [])
})

test('Daily Runner canonical migration excludes historical one-off repairs', async () => {
  const migration = await read(
    'sql/008-lobodeals-3-daily-runner-v2-canonical-contracts.sql'
  )
  const operator = await read('scripts/lobodeals-daily-operator-v1.mjs')

  assert.match(migration, /certify_price_refresh_cycle_v4/)
  assert.match(migration, /refresh_catalog_public_cache_v17/)
  assert.match(migration, /run_lobodeals_catalog_cache_refresh_v18/)
  assert.match(migration, /apply_psdeals_ended_deals_v4/)
  assert.match(migration, /run_lobodeals_ended_demotion_v5/)
  assert.match(migration, /public\.unaccent/)
  assert.doesNotMatch(migration, /214ea444-c3ec-4e75-b8ac-8fe3620faed5/)
  assert.doesNotMatch(migration, /b76f201f-a686-4293-99e4-517031c5b216/)
  assert.match(operator, /lobodeals_daily_runner_v24_preflight/)
  assert.match(operator, /cache-v19:/)
})
