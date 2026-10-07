import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { isEpicTagOnlyCampaign, isEpicSnapshotMember, scanGeneration, nullableScanGeneration } from '../supabase/functions/campaign-monitoring/_shared/epic-snapshot.ts'
import { prepareEpicPublication, parseEpicReservation, knownCampaignFromRow } from '../supabase/functions/campaign-monitoring/_shared/epic-snapshot-persistence.ts'
import { campaignKeysToEnd } from '../supabase/functions/campaign-monitoring/_shared/reconcile.ts'
import { loadModule } from './helpers/load-module.mjs'

const source = 'https://store.epicgames.com/sales-and-specials'
const row = (changes = {}) => ({
  campaign_key: 'epic-games-store-aaaaaaaaaaaaaaaaaaaaaaaa', store_slug: 'epic-games-store',
  source_uid: 'epic-storefront:example%20sale', name: 'Example Sale', market: 'US',
  state: 'live', lifecycle_basis: 'official-source', source_url: source,
  official_url: 'https://store.epicgames.com/browse?tag=Example%20Sale',
  starts_on: null, starts_at: null, ends_on: null, ends_at: null,
  artwork_url: null, epic_public_scan_generation: null, ...changes,
})
const detected = (changes = {}) => ({ storeSlug: 'epic-games-store', sourceUid: row().source_uid,
  name: 'Example Sale', state: 'live', lifecycleBasis: 'official-source',
  sourceUrl: source, officialUrl: row().official_url, ...changes })

test('Epic snapshot scope accepts US Browse tags without using campaign names', () => {
  for (const path of ['/browse', '/browse/', '/en-US/browse', '/en-US/browse/']) {
    assert.equal(isEpicTagOnlyCampaign(row({ official_url: `https://store.epicgames.com${path}?count=40&tag=Different+Label`, name: 'Unrelated Display Title' })), true)
  }
})

test('Epic snapshot scope excludes other stores, provenance, landings and ambiguous destinations', () => {
  const invalid = [
    { store_slug: 'steam' }, { market: 'PE' }, { source_uid: 'other:identity' },
    { source_uid: 'epic-storefront:' }, { source_url: 'https://store.epicgames.com/browse' },
    { source_url: 'https://store.epicgames.com/sales-and-specials/old-sale' },
    ...['http://store.epicgames.com/browse?tag=x', 'https://store.epicgames.com.evil.test/browse?tag=x',
      'https://user@store.epicgames.com/browse?tag=x', 'https://store.epicgames.com:444/browse?tag=x',
      `${source}/example`, 'https://store.epicgames.com/browse',
      'https://store.epicgames.com/browse?tag=', 'https://store.epicgames.com/browse?tag=%20',
      'https://store.epicgames.com/browse?tag=a&tag=b', 'https://store.epicgames.com/browse?tag=a%7Cb',
      'https://store.epicgames.com/browse?tag=%00', 'invalid'].map(official_url => ({ official_url })),
  ]
  for (const changes of invalid) assert.equal(isEpicTagOnlyCampaign(row(changes)), false, JSON.stringify(changes))
})

test('Epic generations preserve bigint precision and reject missing or numeric metadata', () => {
  assert.equal(scanGeneration('0009007199254740993'), '9007199254740993')
  assert.equal(scanGeneration('9223372036854775807'), '9223372036854775807')
  assert.equal(nullableScanGeneration(null), null)
  for (const value of [undefined, 1, 9007199254740992, '', '0', '-1', '1.0', ' 1', '9223372036854775808']) {
    assert.throws(() => scanGeneration(value))
  }
})

test('Epic membership uses explicit NULL bootstrap and exact generation equality', () => {
  assert.equal(isEpicSnapshotMember(row(), null), true)
  assert.equal(isEpicSnapshotMember(row({ epic_public_scan_generation: '9007199254740993' }), '9007199254740993'), true)
  assert.equal(isEpicSnapshotMember(row({ epic_public_scan_generation: '9007199254740992' }), '9007199254740993'), false)
  assert.equal(isEpicSnapshotMember(row(), '1'), false)
  assert.throws(() => isEpicSnapshotMember(row({ epic_public_scan_generation: undefined }), null))
})

test('Epic prepared rows preserve timing and stamp only positive tag-only identities', () => {
  const previous = knownCampaignFromRow(row({ starts_at: '2026-09-01T00:00:00Z', ends_at: '2027-01-01T00:00:00Z' }))
  const before = structuredClone(previous)
  const result = prepareEpicPublication([
    { key: row().campaign_key, entry: detected() },
    { key: 'epic-games-store-bbbbbbbbbbbbbbbbbbbbbbbb', entry: detected({ sourceUid: 'epic-storefront:dedicated', officialUrl: `${source}/dedicated` }) },
  ], '2', '2026-10-07T12:00:00Z', [previous])
  assert.equal(result.campaigns[0].epic_public_scan_generation, '2')
  assert.equal(result.campaigns[0].starts_at, previous.startsAt)
  assert.equal(result.campaigns[0].ends_at, previous.endsAt)
  assert.equal(result.campaigns[1].epic_public_scan_generation, null)
  assert.deepEqual(previous, before)
})

test('Epic absence produces no row mutation or END while independent timing still can END', () => {
  const previous = knownCampaignFromRow(row())
  assert.deepEqual(prepareEpicPublication([], '2', '2026-10-07T12:00:00Z', [previous]), { campaigns: [], artwork: [] })
  const input = { sourceSucceeded: true, coverage: 'partial', activeCampaigns: [previous],
    detectedCampaigns: [], explicitlyEndedSourceUids: [], now: new Date('2026-10-07T12:00:00Z') }
  assert.deepEqual(campaignKeysToEnd(input), [])
  assert.deepEqual(campaignKeysToEnd({ ...input, explicitlyEndedSourceUids: [previous.sourceUid] }), [previous.campaignKey])
  assert.deepEqual(campaignKeysToEnd({ ...input, activeCampaigns: [{ ...previous, ends_at: '2026-09-01T00:00:00Z' }] }), [previous.campaignKey])
})

test('Epic rediscovery restores membership without a name list or timing exception', () => {
  const historical = row({ epic_public_scan_generation: '1', starts_at: '2026-01-01T00:00:00Z', ends_at: '2027-01-01T00:00:00Z' })
  assert.equal(isEpicSnapshotMember(historical, '2'), false)
  const prepared = prepareEpicPublication([{ key: historical.campaign_key, entry: detected() }], '3', '2026-10-07T12:00:00Z', [knownCampaignFromRow(historical)])
  assert.equal(isEpicSnapshotMember(prepared.campaigns[0], '3'), true)
})

test('Epic reservation rejects absent pointer or malformed known data', () => {
  assert.equal(parseEpicReservation({ generation: '1', base_pointer: null, campaigns: [row()] }).known[0].sourceUid, row().source_uid)
  for (const value of [{ generation: '1', campaigns: [] }, { generation: 1, base_pointer: null, campaigns: [] },
    { generation: '1', base_pointer: null, campaigns: [{}] }]) assert.throws(() => parseEpicReservation(value))
})

async function feed(payload, status = 200) {
  const oldFetch = globalThis.fetch
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://snapshot.invalid'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key'
  const calls = []
  globalThis.fetch = async url => {
    calls.push(String(url))
    if (String(url) === 'https://snapshot.invalid/rest/v1/rpc/read_sales_public_snapshot') return new Response(JSON.stringify(payload), { status })
    if (String(url) === 'https://snapshot.invalid/functions/v1/campaign-monitoring') return Response.json([])
    throw new Error(`Unexpected mocked read: ${url}`)
  }
  try {
    const { loadSalesFeed } = await loadModule('lib/sales-source.ts')
    return { result: await loadSalesFeed(), calls }
  } finally {
    globalThis.fetch = oldFetch
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey
  }
}

test('public loader preserves NULL bootstrap and uses one snapshot read', async () => {
  const { result, calls } = await feed({ epic_public_scan_generation: null, campaigns: [row()] })
  assert.equal(result.campaigns.length, 1)
  assert.equal(result.sourceUnavailable, false)
  assert.equal(calls.filter(url => url.includes('/rest/v1/')).length, 1)
})

test('public loader filters mismatch and NULL members but keeps dedicated landings and other nine stores', async () => {
  const { STORE_SLUGS } = await import('../supabase/functions/campaign-monitoring/_shared/types.ts')
  const others = STORE_SLUGS.filter(slug => slug !== 'epic-games-store').map(slug => row({
    campaign_key: `${slug}-test`, store_slug: slug, source_uid: `${slug}:sale`,
  }))
  const { result } = await feed({ epic_public_scan_generation: '2', campaigns: [
    row(), row({ campaign_key: 'old', epic_public_scan_generation: '1' }),
    row({ campaign_key: 'current', epic_public_scan_generation: '2' }),
    row({ campaign_key: 'dedicated', official_url: `${source}/dedicated` }), ...others,
  ] })
  assert.deepEqual(result.campaigns.map(c => c.id), ['current', 'dedicated', ...others.map(c => c.campaign_key)])
})

test('public loader treats missing, invalid, numeric, or failed snapshot metadata as unavailable', async () => {
  for (const payload of [null, [], { campaigns: [row()] }, { epic_public_scan_generation: 1, campaigns: [row()] },
    { epic_public_scan_generation: null }, { epic_public_scan_generation: null, campaigns: [row({ epic_public_scan_generation: undefined })] }]) {
    const { result } = await feed(payload)
    assert.equal(result.sourceUnavailable, true)
    assert.deepEqual(result.campaigns, [])
  }
  assert.equal((await feed({}, 503)).result.sourceUnavailable, true)
})

test('public membership filtering precedes lifecycle, counts, and empty states', async () => {
  const { groupPublicCampaigns } = await loadModule('lib/public-sales-runtime.ts')
  const { result } = await feed({ epic_public_scan_generation: '2', campaigns: [row()] })
  assert.deepEqual(groupPublicCampaigns(result.campaigns, [{ slug: 'epic-games-store', name: 'Epic' }], new Date()), { live: [], upcoming: [] })
  const expired = row({ epic_public_scan_generation: '2', lifecycle_basis: 'exact-time', starts_at: '2026-01-01T00:00:00Z', ends_at: '2026-02-01T00:00:00Z' })
  const current = (await feed({ epic_public_scan_generation: '2', campaigns: [expired] })).result
  assert.deepEqual(groupPublicCampaigns(current.campaigns, [{ slug: 'epic-games-store', name: 'Epic' }], new Date('2026-10-07')), { live: [], upcoming: [] })
})

test('EN/ES Home, Sales, platforms and profiles retain the single loader and analytics contract', async () => {
  for (const file of ['home-page', 'sales-page', 'platform-page', 'store-profile-page']) {
    const text = await readFile(`components/${file}.tsx`, 'utf8')
    assert.match(text, /loadSalesFeed\(\)/)
    assert.doesNotMatch(text, /epic_public_scan_generation/)
  }
  for (const prefix of ['', 'es/']) for (const route of ['', 'sales/', 'pc/', 'playstation/', 'nintendo/', 'xbox/', 'services/[slug]/']) {
    const text = await readFile(`app/${prefix}${route}page.tsx`, 'utf8')
    assert.match(text, /HomePage|SalesPage|PlatformPage|StoreProfilePage/)
  }
  const loader = await readFile('lib/sales-source.ts', 'utf8')
  assert.doesNotMatch(loader, /dataLayer|lobodeals_outbound_click|ui_language/)
})

const migrationPath = 'supabase/migrations/20261007185448_epic_public_snapshot.sql'
test('Epic migration statically preserves additive NULL bootstrap and private writer permissions', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.equal((sql.match(/add column/g) || []).length, 3)
  assert.equal((sql.match(/bigint null default null/g) || []).length, 3)
  assert.doesNotMatch(sql, /create table|create index|\bdelete\b|\bdrop\b|\btruncate\b|\bTTL\b|interval\s*'/i)
  for (const name of ['reserve_epic_public_scan', 'finalize_epic_public_scan', 'apply_epic_scan_artwork']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, anon, authenticated;`))
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+to service_role;`))
  }
  assert.equal((sql.match(/set search_path = ''/g) || []).length, 4)
  assert.match(sql, /grant execute on function public\.read_sales_public_snapshot\(\) to anon, authenticated, service_role/)
})

test('Epic migration statically guards concurrency before writes and reads one public statement', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  const finalize = sql.slice(sql.indexOf('create function public.finalize_epic_public_scan'), sql.indexOf('create function public.apply_epic_scan_artwork'))
  for (const status of ['already-published', 'obsolete', 'baseline-conflict']) {
    assert.ok(finalize.indexOf(`return '${status}'`) < finalize.indexOf('insert into public.sales_campaigns'))
  }
  assert.match(finalize, /for update/)
  assert.match(finalize, /pointer is distinct from base_pointer/)
  assert.match(finalize, /campaign_key = any\(p_end_keys\)/)
  assert.doesNotMatch(finalize, /exception when|not in\s*\(|epic_public_scan_generation\s*<>/i)
  const reader = sql.slice(sql.indexOf('create function public.read_sales_public_snapshot'), sql.indexOf('revoke all on function'))
  assert.match(reader, /language sql\s+stable\s+security definer/)
  assert.match(reader, /where market = 'US' and state in \('live', 'upcoming'\)/)
  assert.doesNotMatch(reader, /last_error|consecutive_failures|generation_counter|vault|\bupdate\b/i)
  assert.equal((reader.match(/;\s*\$\$/g) || []).length, 1)
})
