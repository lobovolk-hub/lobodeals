// Explicit local-only integration runner. Never reads application credentials.
// LOBO_QA_PG_MODULE points to an externally installed pg module; no app dependency.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

const { default: pg } = await import(pathToFileURL(process.env.LOBO_QA_PG_MODULE).href)
pg.types.setTypeParser(1082, value => value) // Date-only stays a calendar string.
const config = { host: '127.0.0.1', port: 55439, user: 'postgres', database: 'postgres' }
const admin = new pg.Client(config)
await admin.connect()
const database = `lobodeals_visibility_qa_${randomUUID().replaceAll('-', '')}`
await admin.query(`create database ${database}`)
for (const role of ['anon', 'authenticated', 'service_role']) {
  if (!(await admin.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) {
    await admin.query(`create role ${role} ${role === 'service_role' ? 'bypassrls' : ''}`)
  }
}
await admin.end()
const client = new pg.Client({ ...config, database })
await client.connect()
for (const file of ['20260826034405_create_sales_backend.sql', '20260827040859_campaign_artwork.sql',
  '20261007223743_epic_public_snapshot.sql', '20261012185056_sales_operational_visibility.sql']) {
  await client.query(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
}
const slug = 'playstation-store', source = 'https://store.playstation.com/en-us/pages/deals'
const ids = ['56f636cb-c476-40b8-9ffd-b17f3f5cf5ad', '5931f998-d583-4643-85e0-e890480fcff9',
  '3e5a4aeb-33af-442a-ab10-61d946d3b33c', '52e149ff-ec0d-4492-8fd9-a7df289f0ec9']
const names = ['Autumn Adventures', 'Games Under $15', 'Games Under $20', "Player's Choice"]
const identity = i => `https://store.playstation.com/en-us/category/${ids[i - 1]}/1`
const key = i => `${slug}-${String(i).padStart(24, '0')}`
const row = (i = 1, extra = {}) => ({ campaign_key: key(i), store_slug: slug, source_uid: identity(i), name: names[i - 1],
  market: 'US', state: 'live', lifecycle_basis: 'official-source', starts_on: null, starts_at: null,
  ends_on: null, ends_at: null, official_url: identity(i), source_url: source, ...extra })
const reserve = async (db = client, store = slug) => (await db.query('select public.reserve_sales_visibility_scan($1) r', [store])).rows[0].r
const finalize = async (r, at, options = {}, db = client) => (await db.query(
  'select public.finalize_sales_visibility_scan($1,$2,$3,$4,$5,$6,$7) r',
  [options.store ?? slug, r.generation, r.base_pointer, JSON.stringify(options.rows ?? []), options.ends ?? [], options.absent ?? [], at])).rows[0].r
const scan = async (at, options) => finalize(await reserve(), at, options)
const state = async (i = 1) => (await client.query('select * from public.sales_campaigns where campaign_key=$1', [key(i)])).rows[0]
const publicRows = async () => (await client.query('select public.read_sales_public_snapshot() r')).rows[0].r.campaigns
const t0 = '2026-10-12T00:00:00Z', t4 = '2026-10-12T04:00:00Z', t72 = '2026-10-15T04:00:00Z'
const iso = value => value?.toISOString() ?? null
async function scenario(name, run) {
  await test(name, async () => {
    await client.query('begin')
    try { await run() } finally { await client.query('rollback') }
  })
}
try {
  await scenario('PlayStation old campaigns hide independently while Games Under $20 and Player’s Choice stay public', async () => {
    await scan('2026-10-07T16:00:00Z', { rows: [row(1), row(2)] })
    await scan(t0, { rows: [row(3), row(4)], absent: [identity(1), identity(2)] })
    assert.deepEqual((await publicRows()).map(c => c.name), ['Games Under $20', "Player's Choice"])
    assert.equal((await state(1)).operational_closed_at, null)
    assert.equal((await state(2)).operational_closed_at, null)
    assert.equal(iso((await state(1)).absence_started_at), '2026-10-12T00:00:00.000Z')
  })
  await scenario('service_role can publish using granted functions; no extra infrastructure required', async () => {
    await client.query('set local role service_role')
    assert.equal((await scan(t0, { rows: [row()] })).status, 'published')
    await client.query('reset role')
  })
  await scenario('confirmed Live remains public and bootstrap never uses old last_confirmed_at', async () => {
    await scan('2020-01-01T00:00:00Z', { rows: [row()] })
    await scan(t0, {}) // successful but inconclusive, NOT absence
    assert.equal((await publicRows()).length, 1)
    assert.equal((await state()).absence_started_at, null)
  })
  await scenario('first valid absence hides immediately; <72h retains identity without END dates', async () => {
    await scan(t0, { rows: [row()] })
    const result = await scan(t4, { absent: [identity(1)] })
    assert.equal(result.hidden, 1)
    await scan('2026-10-15T03:59:59Z', { absent: [identity(1)] })
    const c = await state()
    assert.equal(iso(c.absence_started_at), '2026-10-12T04:00:00.000Z')
    assert.equal(c.operational_closed_at, null)
    assert.equal(c.ends_at, null); assert.equal(c.ends_on, null)
    assert.equal(c.state, 'live', 'last official state is separate from operational closure')
    assert.deepEqual(await publicRows(), [])
  })
  await scenario('reappearance clears the entire absence period and does not duplicate identity', async () => {
    await scan(t0, { rows: [row()] }); await scan(t4, { absent: [identity(1)] })
    const firstSeen = (await state()).first_seen_at
    await scan('2026-10-13T00:00:00Z', { rows: [row()] })
    assert.equal((await state()).absence_started_at, null)
    assert.equal((await publicRows()).length, 1)
    await scan('2026-10-13T04:00:00Z', { absent: [identity(1)] })
    await scan(t72, { absent: [identity(1)] })
    assert.equal((await state()).operational_closed_at, null, 'old interval must not leak')
    assert.deepEqual((await state()).first_seen_at, firstSeen)
    assert.equal((await client.query('select count(*)::int n from public.sales_campaigns')).rows[0].n, 1)
  })
  await scenario('72h requires a NEW verified absence; technical failure and incomplete checks cannot close', async () => {
    await scan(t0, { rows: [row()] })
    await reserve() // source failure: no finalization
    assert.equal((await state()).absence_started_at, null)
    await scan(t4, { absent: [identity(1)] })
    await reserve() // intermediate failure
    await scan(t72, {}) // incomplete after 72h
    assert.equal((await state()).operational_closed_at, null)
    const closed = await scan(t72, { absent: [identity(1)] })
    assert.equal(closed.operationallyClosed, 1)
    assert.equal(iso((await state()).operational_closed_at), '2026-10-15T04:00:00.000Z')
    assert.equal((await state()).ends_at, null)
  })
  await scenario('operational closure reactivates the same identity and preserves first_seen_at', async () => {
    await scan(t0, { rows: [row()] }); const firstSeen = (await state()).first_seen_at
    await scan(t4, { absent: [identity(1)] }); await scan(t72, { absent: [identity(1)] })
    await scan('2026-10-16T00:00:00Z', { rows: [row()] })
    assert.equal((await state()).operational_closed_at, null)
    assert.equal((await state()).absence_started_at, null)
    assert.deepEqual((await state()).first_seen_at, firstSeen)
    assert.equal((await publicRows()).length, 1)
  })
  await scenario('Upcoming and official end boundaries never enter operational observation', async () => {
    await scan(t0, { rows: [row(1, { state: 'upcoming' }), row(2, { ends_on: '2026-10-21' }), row(3, { ends_at: '2026-10-21T12:00:00Z' })] })
    for (const i of [1, 2, 3]) {
      await client.query('savepoint invalid_absence')
      await assert.rejects(scan(t4, { absent: [identity(i)] }), /Invalid or contradictory/)
      await client.query('rollback to savepoint invalid_absence')
    }
    assert.equal((await publicRows()).length, 3)
    await scan('2026-10-23T00:00:00Z', { ends: [key(2), key(3)] })
    assert.equal((await state(2)).state, 'ended')
    assert.equal((await state(2)).ends_on, '2026-10-21')
    assert.equal((await state(2)).operational_closed_at, null)
  })
  await scenario('fresh official dates or Upcoming clear prior operational metadata', async () => {
    await scan(t0, { rows: [row()] }); await scan(t4, { absent: [identity(1)] })
    await scan('2026-10-13T00:00:00Z', { rows: [row(1, { ends_on: '2026-10-21' })] })
    assert.equal((await state()).absence_started_at, null)
    assert.equal((await publicRows()).length, 1)
  })
  await scenario('idempotent retry cannot advance absence clock, repeat END or change publication', async () => {
    await scan(t0, { rows: [row()] })
    const reservation = await reserve()
    await finalize(reservation, t4, { absent: [identity(1)] })
    const retry = await finalize(reservation, t72, { absent: [identity(1)] })
    assert.equal(retry.status, 'already-published')
    assert.equal((await state()).operational_closed_at, null)
  })
  await scenario('publication is atomic: duplicate payload rolls back all rows and pointer', async () => {
    await scan(t0, { rows: [row()] })
    const reservation = await reserve(); const before = await state()
    await client.query('savepoint invalid_payload')
    await assert.rejects(finalize(reservation, t4, { rows: [row(2), row(2)], absent: [identity(1)] }))
    await client.query('rollback to savepoint invalid_payload')
    assert.deepEqual(await state(), before)
    assert.equal((await state(2)), undefined)
    assert.equal((await reserve()).base_pointer, reservation.base_pointer)
  })
  await scenario('store isolation rejects foreign absence targets and blocked adapter contracts', async () => {
    await scan(t0, { rows: [row()] })
    const reservation = await reserve(client, 'gog')
    await client.query('savepoint forbidden')
    await assert.rejects(finalize(reservation, t4, { store: 'gog', absent: [identity(1)] }), /no enabled absence/)
    await client.query('rollback to savepoint forbidden')
    assert.equal((await state()).absence_started_at, null)
  })
  await scenario('anonymous table and shared EN/ES snapshot hide observation; RPC mutation is denied', async () => {
    await scan(t0, { rows: [row(), row(2)] }); await scan(t4, { absent: [identity(1)] })
    await client.query('set local role anon')
    assert.equal((await client.query('select campaign_key from public.sales_campaigns')).rowCount, 1)
    assert.deepEqual((await publicRows()).map(c => c.campaign_key), [key(2)])
    await client.query('savepoint denied')
    await assert.rejects(reserve(), /permission denied/)
    await client.query('rollback to savepoint denied')
    await client.query('reset role')
  })
  await scenario('Epic snapshot membership and its generation protocol remain intact', async () => {
    const epic = { ...row(), store_slug: 'epic-games-store', campaign_key: 'epic-games-store-' + 'a'.repeat(24),
      source_uid: 'epic-storefront:week', source_url: 'https://store.epicgames.com/sales-and-specials',
      official_url: 'https://store.epicgames.com/browse?tag=week', epic_public_scan_generation: '1' }
    const r = (await client.query('select public.reserve_epic_public_scan() r')).rows[0].r
    await client.query('select public.finalize_epic_public_scan($1,$2,$3,$4,$5)', [r.generation, r.base_pointer, JSON.stringify([epic]), [], t0])
    await scan(t0, { rows: [row()] }); await scan(t4, { absent: [identity(1)] })
    const snapshot = (await client.query('select public.read_sales_public_snapshot() r')).rows[0].r
    assert.equal(snapshot.epic_public_scan_generation, '1')
    assert.equal(snapshot.campaigns.length, 1)
    assert.equal(snapshot.campaigns[0].epic_public_scan_generation, '1')
    const r2 = (await client.query('select public.reserve_epic_public_scan() r')).rows[0].r
    await client.query('select public.finalize_epic_public_scan($1,$2,$3,$4,$5)', [r2.generation, r2.base_pointer, '[]', [], t4])
    assert.equal((await client.query("select state,absence_started_at from public.sales_campaigns where store_slug='epic-games-store'")).rows[0].absence_started_at, null)
  })
  await test('real concurrent connections serialize publication and reject stale baselines', async () => {
    await scan(t0, { rows: [row()] })
    const a = await reserve(), b = await reserve()
    const other = new pg.Client({ ...config, database }); await other.connect()
    try {
      await client.query('begin')
      await finalize(a, t4, { absent: [identity(1)] })
      let settled = false
      const pending = finalize(b, t72, { absent: [identity(1)] }, other).then(r => { settled = true; return r })
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.equal(settled, false, 'second transaction waits on the source-row lock')
      await client.query('commit')
      assert.equal((await pending).status, 'baseline-conflict')
      assert.equal((await state()).operational_closed_at, null)
      const c = await reserve(), d = await reserve()
      await finalize(d, t72, { rows: [row()] }, other)
      assert.equal((await finalize(c, t72, { absent: [identity(1)] })).status, 'obsolete')
      assert.equal((await state()).absence_started_at, null)
    } finally { await other.end() }
  })
  await test('manual rollback preserves history/Epic, fences v19, supports v18 writes and restores approved public projection', async () => {
    await scan(t0, { rows: [row(1), row(2), row(3), row(4)] })
    await scan(t4, { absent: [identity(1), identity(2)], ends: [key(4)] })
    await scan(t72, { absent: [identity(1)] })
    const epic = { ...row(), store_slug: 'epic-games-store', campaign_key: 'epic-games-store-' + 'b'.repeat(24),
      source_uid: 'epic-storefront:rollback', source_url: 'https://store.epicgames.com/sales-and-specials',
      official_url: 'https://store.epicgames.com/browse?tag=rollback', epic_public_scan_generation: '1' }
    const er = (await client.query('select public.reserve_epic_public_scan() r')).rows[0].r
    epic.epic_public_scan_generation = er.generation
    await client.query('select public.finalize_epic_public_scan($1,$2,$3,$4,$5)', [er.generation, er.base_pointer, JSON.stringify([epic]), [], t0])
    const dump = async table => (await client.query(`select to_jsonb(t) r from public.${table} t order by 1::text`)).rows
    const campaigns = await dump('sales_campaigns'), health = await dump('sales_source_health')
    const epicFunctions = async () => (await client.query("select proname,pg_get_functiondef(oid) body,proacl::text acl from pg_proc where proname in ('reserve_epic_public_scan','finalize_epic_public_scan','apply_epic_scan_artwork') order by proname")).rows
    const functionsBefore = await epicFunctions()
    const compatibility = await readFile(new URL('../docs/sales-visibility-rollback-compatibility.sql', import.meta.url), 'utf8')
    const projection = await readFile(new URL('../docs/sales-visibility-rollback-projection.sql', import.meta.url), 'utf8')
    await client.query(compatibility)
    await client.query(compatibility) // Safe repeat, no data repair or history loss.
    assert.deepEqual(await dump('sales_campaigns'), campaigns)
    assert.deepEqual(await dump('sales_source_health'), health)
    assert.equal((await publicRows()).some(c => c.campaign_key === key(2)), false, 'compatibility alone retains hiding')
    await client.query('set role service_role')
    await assert.rejects(reserve(), /permission denied/)
    await assert.rejects(finalize({ generation: '999', base_pointer: null }, t72), /permission denied/)
    // Exact legacy writer behavior: lifecycle/date updates do not clear new metadata.
    await client.query("update public.sales_campaigns set state='ended' where campaign_key=$1", [key(1)])
    await client.query("update public.sales_campaigns set ends_on='2026-10-21' where campaign_key=$1", [key(2)])
    await client.query('reset role')
    assert.equal(iso((await state(1)).operational_closed_at), '2026-10-15T04:00:00.000Z')
    assert.equal(iso((await state(2)).absence_started_at), '2026-10-12T04:00:00.000Z')
    const beforeProjection = await dump('sales_campaigns')
    await client.query(projection); await client.query(projection)
    assert.deepEqual(await dump('sales_campaigns'), beforeProjection)
    assert.deepEqual(await dump('sales_source_health'), health)
    assert.deepEqual(await epicFunctions(), functionsBefore)
    assert.equal((await client.query("select bool_and(relrowsecurity) ok from pg_class where oid in ('public.sales_campaigns'::regclass,'public.sales_source_health'::regclass)")).rows[0].ok, true)
    for (const role of ['anon', 'authenticated']) {
      await client.query(`set role ${role}`)
      assert.deepEqual((await client.query('select campaign_key from public.sales_campaigns order by campaign_key')).rows.map(c => c.campaign_key),
        [epic.campaign_key, key(2), key(3)])
      const snapshot = (await client.query('select public.read_sales_public_snapshot() r')).rows[0].r
      assert.equal(snapshot.epic_public_scan_generation, er.generation)
      assert.equal(snapshot.campaigns.find(c => c.campaign_key === epic.campaign_key).epic_public_scan_generation, er.generation)
      assert.equal(snapshot.campaigns.some(c => 'absence_started_at' in c || 'operational_closed_at' in c), false)
      await assert.rejects(client.query('select * from public.sales_source_health'), /permission denied/)
      await assert.rejects(client.query("update public.sales_campaigns set state='live'"), /permission denied/)
      await assert.rejects(reserve(), /permission denied/)
      await client.query('reset role')
    }
    // Epic's existing service-role protocol still operates after both recovery steps.
    await client.query('set role service_role')
    const next = (await client.query('select public.reserve_epic_public_scan() r')).rows[0].r
    assert.equal((await client.query('select public.finalize_epic_public_scan($1,$2,$3,$4,$5) r', [next.generation, next.base_pointer, '[]', [], t72])).rows[0].r, 'published')
    await client.query('reset role')
  })
  console.log(`Local synthetic database retained for review: ${database}`)
} finally { await client.end() }
