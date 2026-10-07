import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { adapters } from '../supabase/functions/campaign-monitoring/adapters/index.ts'

// No server or real backend is invoked. Every dependency URL must match a mock.
const oldDeno = globalThis.Deno
globalThis.Deno = { env: { get: key => ({ SUPABASE_URL: 'https://monitor.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only' })[key] }, serve: () => {} }
const { runStore } = await import('../supabase/functions/campaign-monitoring/index.ts')
const mockDeno = globalThis.Deno
globalThis.Deno = oldDeno
const sales = 'https://store.epicgames.com/sales-and-specials'
const key = 'epic-games-store-aaaaaaaaaaaaaaaaaaaaaaaa'
const known = { campaign_key: key, source_uid: 'epic-storefront:historical', name: 'Historical Sale',
  state: 'live', official_url: 'https://store.epicgames.com/browse?tag=historical', source_url: sales,
  starts_on: null, starts_at: null, ends_on: null, ends_at: null }
const positive = { storeSlug: 'epic-games-store', sourceUid: 'epic-storefront:current', name: 'Current Sale',
  state: 'live', lifecycleBasis: 'official-source', officialUrl: 'https://store.epicgames.com/browse?tag=current', sourceUrl: sales }
const result = campaigns => ({ storeSlug: 'epic-games-store', sourceUrl: sales, sourceUrls: [sales],
  coverage: 'partial', campaigns, explicitlyEndedSourceUids: [] })

async function simulate(options = {}) {
  const saved = { fetch: globalThis.fetch, Deno: globalThis.Deno, adapter: adapters['epic-games-store'] }
  globalThis.Deno = mockDeno
  const calls = [], sourceCalls = []
  let committed = false
  if (!options.realAdapter) adapters['epic-games-store'] = async context => {
    sourceCalls.push(context)
    if (options.sourceFailure) throw new Error('Mock official source failed')
    return options.output ?? result(options.campaigns ?? [positive])
  }
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    if (url.origin === 'https://store.epicgames.com' && options.realAdapter) {
      assert.equal(url.pathname, '/graphql')
      sourceCalls.push(url)
      return new Response(options.officialBody ?? JSON.stringify({ data: { Storefront: { discoverLayout: {
        modules: [{ __typename: 'PageHeader', title: 'Epic Games Sales & Specials' }],
      } } } }), { status: options.officialStatus ?? 200 })
    }
    assert.equal(url.origin, 'https://monitor.invalid', 'all requests must be mocked')
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ path: url.pathname, search: url.search, method: init.method, body })
    if (url.pathname.endsWith('/reserve_epic_public_scan')) return Response.json({ generation: '9007199254740993', base_pointer: '2', campaigns: options.known ?? [known] })
    if (url.pathname.endsWith('/finalize_epic_public_scan')) {
      if (options.finalizeFails) return new Response('', { status: 400 })
      if (options.lostResponse && !committed) {
        committed = true
        if (options.lostResponse === 'network') throw new TypeError('Mock connection lost after commit')
        return new Response('', { status: 502 })
      }
      committed = true
      return Response.json(options.publication ?? (options.lostResponse ? 'already-published' : 'published'))
    }
    if (url.pathname.endsWith('/apply_epic_scan_artwork')) return options.artworkFails
      ? new Response('', { status: 400 }) : Response.json(options.artworkStillCurrent ?? true)
    if (url.pathname.endsWith('/sales_source_health')) return options.healthFails
      ? new Response('', { status: 400 }) : Response.json(init.method === 'GET' ? [{ consecutive_failures: 0 }] : null)
    if (url.pathname.endsWith('/sales_campaigns') && init.method === 'GET') return Response.json(options.known ?? [known])
    throw new Error(`Unexpected persistence path: ${url}`)
  }
  try {
    return { outcome: await runStore('epic-games-store', options.mode ?? 'persist', new Date('2026-10-07T12:00:00Z')), calls, sourceCalls }
  } finally {
    globalThis.fetch = saved.fetch
    globalThis.Deno = saved.Deno
    adapters['epic-games-store'] = saved.adapter
  }
}
const finalizations = calls => calls.filter(c => c.path.endsWith('/finalize_epic_public_scan'))

test('Epic monitor reserves before extraction and publishes positive membership with exact string generation', async () => {
  const { outcome, calls, sourceCalls } = await simulate()
  assert.equal(calls[0].path, '/rest/v1/rpc/reserve_epic_public_scan')
  assert.equal(sourceCalls[0].knownCampaigns[0].campaignKey, key)
  const publication = finalizations(calls)[0].body
  assert.equal(publication.p_generation, '9007199254740993')
  assert.equal(publication.p_base_pointer, '2')
  assert.equal(publication.p_campaigns[0].epic_public_scan_generation, publication.p_generation)
  assert.equal(outcome.snapshotPublication, 'published')
  assert.equal(outcome.campaignsUpserted, 1)
  assert.equal(calls.some(c => c.path.endsWith('/sales_campaigns')), false)
})

test('Epic monitor performs no absence mutation and preserves dedicated landing scope', async () => {
  const { calls } = await simulate({ campaigns: [{ ...positive, officialUrl: `${sales}/dedicated` }] })
  const body = finalizations(calls)[0].body
  assert.equal(body.p_campaigns[0].epic_public_scan_generation, null)
  assert.equal(body.p_campaigns.some(c => c.campaign_key === key), false)
  assert.deepEqual(body.p_end_keys, [])
})

test('Epic real positive adapter can publish a valid zero-campaign snapshot', async () => {
  const { outcome, calls, sourceCalls } = await simulate({ realAdapter: true })
  assert.equal(outcome.ok, true)
  assert.equal(sourceCalls.length, 1)
  assert.deepEqual(finalizations(calls)[0].body.p_campaigns, [])
  assert.deepEqual(finalizations(calls)[0].body.p_end_keys, [])
})

for (const status of [403, 429, 500]) test(`Epic official HTTP ${status} cannot finalize`, async () => {
  const { outcome, calls } = await simulate({ realAdapter: true, officialStatus: status, officialBody: 'Unavailable' })
  assert.equal(outcome.ok, false)
  assert.equal(finalizations(calls).length, 0)
})

for (const [label, body] of [
  ['JSON', 'invalid'], ['GraphQL', JSON.stringify({ errors: [{ message: 'Unavailable' }] })],
  ['root', JSON.stringify({ data: {} })],
  ['header', JSON.stringify({ data: { Storefront: { discoverLayout: { modules: [{ __typename: 'PageHeader', title: 'Wrong Surface' }] } } } })],
]) test(`Epic invalid official ${label} cannot finalize`, async () => {
  const { outcome, calls } = await simulate({ realAdapter: true, officialBody: body })
  assert.equal(outcome.ok, false)
  assert.equal(finalizations(calls).length, 0)
})

test('Epic adapter exception and invalid AdapterResult do not finalize', async () => {
  for (const options of [{ sourceFailure: true }, { output: { ...result([positive]), storeSlug: 'steam' } },
    { output: result([{ ...positive, officialUrl: 'http://invalid.test' }]) }]) {
    const { outcome, calls } = await simulate(options)
    assert.equal(outcome.ok, false)
    assert.equal(finalizations(calls).length, 0)
  }
})

test('Epic independent END decisions still reach finalization without membership-based END', async () => {
  const { calls } = await simulate({ campaigns: [], known: [{ ...known, ends_at: '2026-09-01T00:00:00Z' }] })
  assert.deepEqual(finalizations(calls)[0].body.p_end_keys, [key])
})

for (const publication of ['obsolete', 'baseline-conflict']) test(`Epic ${publication} result performs no artwork or health writes`, async () => {
  const { outcome, calls } = await simulate({ publication, campaigns: [{ ...positive, artworkUrl: 'https://cdn1.epicgames.com/image.jpg' }] })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.snapshotPublication, publication)
  assert.equal(outcome.campaignsUpserted, 0)
  assert.equal(calls.some(c => /apply_epic_scan_artwork|sales_source_health$/.test(c.path)), false)
})

test('Epic same-generation retry is an explicit no-op with no duplicate write counts', async () => {
  const { outcome } = await simulate({ publication: 'already-published' })
  assert.equal(outcome.ok, true)
  assert.equal(outcome.campaignsUpserted, 0)
  assert.equal(outcome.campaignsEnded, 0)
})

test('Epic retry after an uncertain commit reuses identical generation and payload', async () => {
  for (const lostResponse of [true, 'network']) {
    const { outcome, calls } = await simulate({ lostResponse })
    assert.equal(outcome.snapshotPublication, 'already-published')
    const attempts = finalizations(calls)
    assert.equal(attempts.length, 2)
    assert.deepEqual(attempts[0].body, attempts[1].body)
  }
})

test('Epic required DB failure cannot trigger optional artwork or successful health', async () => {
  const { outcome, calls } = await simulate({ finalizeFails: true })
  assert.equal(outcome.ok, false)
  assert.equal(calls.some(c => c.path.endsWith('/apply_epic_scan_artwork')), false)
  assert.equal(calls.some(c => c.body?.status === 'healthy'), false)
})

test('Epic health failure after commit cannot retroactively fail publication', async () => {
  const { outcome, calls } = await simulate({ healthFails: true })
  assert.equal(outcome.ok, true)
  assert.equal(outcome.snapshotPublication, 'published')
  assert.equal(calls.filter(c => c.path.endsWith('/sales_source_health')).length, 1)
  for (const call of calls.filter(c => c.path.endsWith('/sales_source_health'))) {
    assert.equal(Object.hasOwn(call.body, 'epic_public_scan_generation'), false)
    assert.equal(Object.hasOwn(call.body, 'epic_scan_generation_counter'), false)
    assert.equal(call.body.adapter_version, '16')
  }
})

test('Epic optional artwork uses a generation-guarded RPC and cannot fail core publication', async () => {
  for (const options of [{ artworkFails: true }, { artworkStillCurrent: false }]) {
    const { outcome, calls } = await simulate({ ...options, campaigns: [{ ...positive, artworkUrl: 'https://cdn1.epicgames.com/image.jpg' }] })
    assert.equal(outcome.ok, true)
    const artwork = calls.find(c => c.path.endsWith('/apply_epic_scan_artwork'))
    assert.equal(artwork.body.p_generation, finalizations(calls)[0].body.p_generation)
    assert.ok(calls.indexOf(artwork) > calls.indexOf(finalizations(calls)[0]))
  }
  const sql = await readFile('supabase/migrations/20261007185448_epic_public_snapshot.sql', 'utf8')
  const artwork = sql.slice(sql.indexOf('create function public.apply_epic_scan_artwork'), sql.indexOf('create function public.read_sales_public_snapshot'))
  assert.match(artwork, /for update/)
  assert.ok(artwork.indexOf('pointer is distinct from p_generation::bigint') < artwork.indexOf('update public.sales_campaigns'))
})

test('Epic probe remains read-only and does not reserve or publish generations', async () => {
  const { outcome, calls } = await simulate({ mode: 'probe' })
  assert.equal(outcome.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'GET')
})
