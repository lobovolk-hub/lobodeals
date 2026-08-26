import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  sha256Hex,
  verifyMonitorToken,
} from '../supabase/functions/campaign-monitoring/_shared/auth.ts'
import { toPublicAvailability } from '../supabase/functions/campaign-monitoring/_shared/availability.ts'

const root = process.cwd()
const approvedSlugs = [
  'playstation-store',
  'nintendo-eshop',
  'microsoft-store',
  'steam',
  'epic-games-store',
  'gog',
  'ea-app',
  'ubisoft-store',
  'battle-net',
  'rockstar-store',
]

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

async function adapterSource() {
  return (
    await Promise.all(
      approvedSlugs.map((slug) =>
        source(`supabase/functions/campaign-monitoring/adapters/${slug}.ts`)
      )
    )
  ).join('\n')
}

test('Sales migration creates only the two minimal new tables with RLS', async () => {
  const migration = await source(
    'supabase/migrations/20260826034405_create_sales_backend.sql'
  )
  const createdTables = [
    ...migration.matchAll(/create table public\.([a-z_]+)/gi),
  ].map((match) => match[1])

  assert.deepEqual(createdTables, ['sales_campaigns', 'sales_source_health'])
  assert.match(migration, /alter table public\.sales_campaigns enable row level security/i)
  assert.match(migration, /alter table public\.sales_source_health enable row level security/i)
  assert.match(migration, /state in \('live', 'upcoming'\)/i)
  assert.match(migration, /starts_on date/i)
  assert.match(migration, /starts_at timestamptz/i)
  assert.match(migration, /ends_on date/i)
  assert.match(migration, /ends_at timestamptz/i)
  assert.equal((migration.match(/insert into public\.sales_source_health/gi) || []).length, 1)

  for (const slug of approvedSlugs) {
    assert.match(migration, new RegExp(`'${slug.replaceAll('-', '\\-')}'`))
  }

  assert.doesNotMatch(
    migration,
    /\b(?:drop|truncate|delete\s+from|alter\s+table\s+(?:auth\.|public\.(?:profiles|user_tracked_items|official_ps_store_deals|automation_runs|ps_ingest_queue)))\b/i
  )
})

test('campaign-monitoring has exactly one independent adapter per canonical store', async () => {
  const directory = path.join(
    root,
    'supabase/functions/campaign-monitoring/adapters'
  )
  const files = (await readdir(directory))
    .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
    .map((name) => name.replace(/\.ts$/, ''))
    .sort()

  assert.deepEqual(files, [...approvedSlugs].sort())

  const registry = await source(
    'supabase/functions/campaign-monitoring/adapters/index.ts'
  )
  for (const slug of approvedSlugs) {
    assert.match(registry, new RegExp(`['"]?${slug}['"]?\\s*:`))
  }
})

test('all adapter authorities are official and US-first where a region exists', async () => {
  const types = await source(
    'supabase/functions/campaign-monitoring/_shared/types.ts'
  )
  const adapters = await adapterSource()
  const authority = `${types}\n${adapters}`
  const expectedOfficialHosts = [
    'store.playstation.com/en-us/pages/latest',
    'blog.playstation.com',
    'www.nintendo.com/us/store/sales-and-deals/',
    'www.xbox.com/en-US/',
    'partner.steamgames.com',
    'store.steampowered.com',
    'store.epicgames.com',
    'www.gog.com/en/',
    'www.ea.com',
    'store.ubisoft.com/us/',
    'news.blizzard.com/en-us/',
    'www.rockstargames.com/newswire',
  ]

  for (const host of expectedOfficialHosts) {
    assert.match(authority, new RegExp(host.replaceAll('.', '\\.')))
  }
  assert.doesNotMatch(
    authority,
    /isthereanydeal|psdeals|psprices|dekudeals|xbdeals|cheapshark|gg\.deals/i
  )
  assert.doesNotMatch(adapters, /\/summer-sale/i)
})

test('orchestrator isolates adapters and writes only Sales and health tables', async () => {
  const monitor = await source(
    'supabase/functions/campaign-monitoring/index.ts'
  )

  assert.match(monitor, /Promise\.all\(/)
  assert.match(monitor, /simulateFailure is permitted only in probe mode/)
  assert.match(monitor, /sales_campaigns\?on_conflict=campaign_key/)
  assert.match(monitor, /sales_source_health\?on_conflict=store_slug/)
  assert.match(monitor, /CAMPAIGN_MONITOR_TOKEN/)
  assert.match(monitor, /x-campaign-monitor-token/)
  assert.match(monitor, /verifyMonitorToken/)
  assert.match(monitor, /campaignKeysToEnd\(/)
  assert.doesNotMatch(
    monitor,
    /official_ps_store_deals|automation_runs|ps_ingest_queue|user_tracked_items|profiles|\/auth\//i
  )

  const catchIndex = monitor.indexOf('} catch (error) {')
  const failureBranch = monitor.slice(catchIndex)
  assert.doesNotMatch(failureBranch, /upsertCampaigns\(/)
  assert.doesNotMatch(failureBranch, /endCampaigns\(/)
  assert.match(failureBranch, /campaign-monitoring\.health-write-failed/)
})

test('dedicated monitor token uses a one-way verifier and is not an admin credential', async () => {
  const rawToken = 'controlled-test-token-never-used-remotely'
  const expectedHash = await sha256Hex(rawToken)

  assert.notEqual(rawToken, expectedHash)
  assert.equal(await verifyMonitorToken(rawToken, expectedHash), true)
  assert.equal(await verifyMonitorToken('wrong-token', expectedHash), false)

  const monitor = await source('supabase/functions/campaign-monitoring/index.ts')
  const configuredBranch = monitor.slice(
    monitor.indexOf('async function isAuthorized'),
    monitor.indexOf('function parseRequest')
  )
  assert.match(configuredBranch, /x-campaign-monitor-token/)
  assert.match(configuredBranch, /monitorTokenVerifier/)
  assert.doesNotMatch(configuredBranch, /adminKeyCandidates/)
  assert.doesNotMatch(configuredBranch, /SUPABASE_SERVICE_ROLE_KEY/)
})

test('public availability exposes only canonical slug and coarse availability', () => {
  const availability = toPublicAvailability(approvedSlugs, [
    { store_slug: 'steam', status: 'healthy' },
    { store_slug: 'epic-games-store', status: 'blocked' },
    { store_slug: 'ea-app', status: 'error' },
  ])

  assert.equal(availability.length, 10)
  assert.deepEqual(availability.find((row) => row.store_slug === 'steam'), {
    store_slug: 'steam',
    availability: 'available',
  })
  assert.equal(
    availability.find((row) => row.store_slug === 'epic-games-store')
      ?.availability,
    'temporarily_unavailable'
  )
  assert.equal(
    availability.find((row) => row.store_slug === 'playstation-store')
      ?.availability,
    'temporarily_unavailable'
  )
  assert.deepEqual(
    Object.keys(availability[0]).sort(),
    ['availability', 'store_slug']
  )
})

test('lifecycle defaults to partial and absence reconciliation is explicit opt-in only', async () => {
  const reconciliation = await source(
    'supabase/functions/campaign-monitoring/_shared/reconcile.ts'
  )
  const adapters = await adapterSource()

  assert.match(reconciliation, /sourceSucceeded/)
  assert.match(reconciliation, /authoritative-complete-current-set/)
  assert.match(reconciliation, /explicitlyEndedSourceUids/)
  assert.match(reconciliation, /active\.ends_at/)
  assert.doesNotMatch(adapters, /coverage:\s*'authoritative-complete-current-set'/)
})

test('adapters do not reconstruct campaigns from product catalogs', async () => {
  const adapters = await adapterSource()

  assert.doesNotMatch(
    adapters,
    /categoryGridRetrieve|searchStore|productPrice|discountPrice|catalog_public_cache/i
  )
  assert.match(adapters, /OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE/)
})

test('one scheduler retries all ten adapters every four hours through Vault', async () => {
  const files = await readdir(path.join(root, 'supabase/migrations'))
  const migrations = await Promise.all(
    files.map((name) => source(path.join('supabase/migrations', name)))
  )
  const migration = migrations.join('\n')
  assert.equal((migration.match(/cron\.schedule\s*\(/gi) || []).length, 1)
  assert.match(migration, /campaign-monitoring-every-4-hours/)
  assert.match(migration, /'0 \*\/4 \* \* \*'/)
  assert.match(migration, /functions\/v1\/campaign-monitoring/)
  assert.match(migration, /x-campaign-monitor-token/)
  assert.match(migration, /vault\.decrypted_secrets/)
  assert.match(migration, /name = 'campaign_monitor_token'/)
  assert.match(migration, /'\{"mode":"persist"\}'::jsonb/)
  assert.doesNotMatch(migration, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_/)
  assert.doesNotMatch(migration, /vault\.create_secret\s*\(/i)

  const monitor = await source('supabase/functions/campaign-monitoring/index.ts')
  assert.match(monitor, /body\.stores \?\? STORE_SLUGS/)
  assert.doesNotMatch(monitor, /STORE_SLUGS\.filter/)
})

test('Vault verifier RPC is service-role only and never returns the raw token', async () => {
  const migration = await source(
    'supabase/migrations/20260826194947_configure_campaign_monitor_auth.sql'
  )

  assert.match(migration, /security definer/i)
  assert.match(migration, /set search_path = ''/i)
  assert.match(migration, /extensions\.digest\(decrypted_secret, 'sha256'\)/i)
  assert.match(migration, /revoke all[\s\S]+from public, anon, authenticated/i)
  assert.match(migration, /grant execute[\s\S]+to service_role/i)
  assert.doesNotMatch(migration, /vault\.create_secret/)
})

test('sales health stays private while the Edge GET selects only status inputs', async () => {
  const schema = await source(
    'supabase/migrations/20260826034405_create_sales_backend.sql'
  )
  const monitor = await source('supabase/functions/campaign-monitoring/index.ts')

  assert.match(schema, /revoke all on table public\.sales_source_health from anon, authenticated/i)
  assert.doesNotMatch(schema, /grant select on table public\.sales_source_health to anon/i)
  assert.match(monitor, /sales_source_health\?select=store_slug,status/)
  assert.doesNotMatch(monitor, /select=store_slug,status,last_error/)
})
