import assert from 'node:assert/strict'
import test from 'node:test'
import { adapters } from '../supabase/functions/campaign-monitoring/adapters/index.ts'

const savedDeno = globalThis.Deno
const mockDeno = { env: { get: key => ({ SUPABASE_URL: 'https://monitor.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only' })[key] }, serve: () => {} }
globalThis.Deno = mockDeno
const { runStore } = await import('../supabase/functions/campaign-monitoring/index.ts')
globalThis.Deno = savedDeno

test('PlayStation internal diagnostics survive monitor response without changing healthy availability or ending unknown campaigns', async () => {
  const saved = { fetch: globalThis.fetch, Deno: globalThis.Deno, adapter: adapters['playstation-store'] }
  const source = 'https://store.playstation.com/en-us/pages/deals'
  const url = 'https://store.playstation.com/en-us/category/56f636cb-c476-40b8-9ffd-b17f3f5cf5ad/1'
  const diagnostic = { code: 'PLAYSTATION_COMMERCIAL_UNKNOWN', sourceUrl: url, reason: 'DEADLINE_EXCEEDED', pages: 0, inspected: 0 }
  const writes = []
  globalThis.Deno = mockDeno
  adapters['playstation-store'] = async () => ({ storeSlug: 'playstation-store', sourceUrl: source,
    sourceUrls: [source], coverage: 'partial', campaigns: [], explicitlyEndedSourceUids: [], diagnostics: [diagnostic] })
  globalThis.fetch = async (input, init) => {
    const request = new URL(input)
    assert.equal(request.origin, 'https://monitor.invalid', 'no external requests')
    if (request.pathname === '/rest/v1/rpc/reserve_sales_visibility_scan') return Response.json({
      generation: '1', base_pointer: null, campaigns: [],
    })
    if (request.pathname === '/rest/v1/rpc/finalize_sales_visibility_scan') {
      assert.deepEqual(JSON.parse(init.body).p_absent_source_uids, [])
      return Response.json({ status: 'published', upserted: 0, ended: 0, hidden: 0, operationallyClosed: 0 })
    }
    if (init.method === 'GET' && request.pathname === '/rest/v1/sales_campaigns') return Response.json([{
      campaign_key: 'playstation-store-aaaaaaaaaaaaaaaaaaaaaaaa', source_uid: url, official_url: url,
      source_url: source, name: 'Autumn Adventures', state: 'live', starts_on: null, starts_at: null, ends_on: null, ends_at: null,
    }])
    assert.equal(request.pathname, '/rest/v1/sales_source_health', 'UNKNOWN must not write campaign rows')
    writes.push(JSON.parse(init.body))
    return Response.json(null)
  }
  try {
    for (const mode of ['probe', 'persist']) {
      const outcome = await runStore('playstation-store', mode, new Date('2026-10-12T18:00:00Z'))
      assert.equal(outcome.ok, true)
      assert.equal(outcome.campaignsEnded, 0)
      assert.equal(outcome.campaignsUpserted, 0)
      assert.deepEqual(outcome.diagnostics, [diagnostic])
      if (mode === 'probe') assert.equal(writes.length, 0)
    }
    assert.equal(writes.length, 1)
    assert.equal(writes[0].status, 'healthy')
    assert.equal(writes[0].diagnostics, undefined, 'no schema change or new persisted field')
  } finally {
    globalThis.fetch = saved.fetch
    globalThis.Deno = saved.Deno
    adapters['playstation-store'] = saved.adapter
  }
})

test('PlayStation monitor publishes only explicit absence, retries idempotently and isolates source/health/conflict failures', async () => {
  const saved = { fetch: globalThis.fetch, Deno: globalThis.Deno, ps: adapters['playstation-store'], gog: adapters.gog }
  const source = 'https://store.playstation.com/en-us/pages/deals'
  const uid = 'https://store.playstation.com/en-us/category/56f636cb-c476-40b8-9ffd-b17f3f5cf5ad/1'
  const known = { campaign_key: 'playstation-store-' + 'a'.repeat(24), source_uid: uid,
    name: 'Autumn Adventures', state: 'live', official_url: uid, source_url: source,
    starts_on: null, starts_at: null, ends_on: null, ends_at: null }
  globalThis.Deno = mockDeno
  try {
    for (const mode of ['absent', 'inconclusive', 'source-failure', 'baseline-conflict', 'obsolete', 'lost-response', 'health-failure']) {
      const calls = [], payloads = []
      adapters['playstation-store'] = async () => {
        if (mode === 'source-failure') throw new Error('Official source failed')
        return { storeSlug: 'playstation-store', sourceUrl: source, sourceUrls: [source], coverage: 'partial',
          campaigns: [], explicitlyEndedSourceUids: [], absenceChecks: [{ sourceUid: uid, sourceUrl: source,
            contract: 'playstation-ems-promotions-v1', outcome: mode === 'inconclusive' ? 'inconclusive' : 'absent' }] }
      }
      adapters.gog = async () => ({ storeSlug: 'gog', sourceUrl: 'https://www.gog.com/en/', sourceUrls: ['https://www.gog.com/en/'],
        coverage: 'partial', campaigns: [], explicitlyEndedSourceUids: [] })
      globalThis.fetch = async (input, init) => {
        const url = new URL(input); assert.equal(url.origin, 'https://monitor.invalid')
        calls.push({ path: url.pathname, method: init.method })
        if (url.pathname.endsWith('/reserve_sales_visibility_scan')) return Response.json({ generation: '2', base_pointer: '1', campaigns: [known] })
        if (url.pathname.endsWith('/finalize_sales_visibility_scan')) {
          payloads.push(JSON.parse(init.body))
          if (mode === 'lost-response') {
            if (payloads.length === 1) throw new TypeError('Response lost after commit')
            return Response.json({ status: 'already-published' })
          }
          if (['baseline-conflict', 'obsolete'].includes(mode)) return Response.json({ status: mode })
          return Response.json({ status: 'published', upserted: 0, ended: 0,
            hidden: mode === 'inconclusive' ? 0 : 1, operationallyClosed: 0 })
        }
        if (url.pathname.endsWith('/sales_campaigns') && init.method === 'GET') return Response.json([])
        if (url.pathname.endsWith('/sales_source_health')) {
          if (init.method === 'POST') assert.equal(JSON.parse(init.body).adapter_version, '19')
          if (mode === 'health-failure') return new Response('', { status: 400 })
          return Response.json(init.method === 'GET' ? [{ consecutive_failures: 0 }] : null)
        }
        throw new Error('Unexpected request')
      }
      const [ps, gog] = await Promise.all([runStore('playstation-store', 'persist', new Date('2026-10-12T18:00:00Z')),
        runStore('gog', 'probe', new Date('2026-10-12T18:00:00Z'))])
      assert.equal(gog.ok, true, 'PlayStation failure cannot fail another adapter')
      if (mode === 'source-failure') { assert.equal(ps.ok, false); assert.equal(payloads.length, 0); continue }
      assert.deepEqual(payloads[0].p_absent_source_uids, mode === 'inconclusive' ? [] : [uid])
      if (['baseline-conflict', 'obsolete'].includes(mode)) {
        assert.equal(ps.ok, false)
        assert.equal(calls.some(c => c.path.endsWith('/sales_source_health')), false)
      } else assert.equal(ps.ok, true, mode)
      if (mode === 'lost-response') { assert.deepEqual(payloads[0], payloads[1]); assert.equal(ps.campaignsHidden, 0) }
      assert.equal(ps.campaignsEnded, 0)
      assert.equal(ps.absenceChecks[0].sourceUid, uid)
    }
  } finally {
    globalThis.fetch = saved.fetch; globalThis.Deno = saved.Deno
    adapters['playstation-store'] = saved.ps; adapters.gog = saved.gog
  }
})
