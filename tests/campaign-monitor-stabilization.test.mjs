import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { adapters } from '../supabase/functions/campaign-monitoring/adapters/index.ts'
import { STORE_SLUGS, SOURCE_URLS, AdapterError } from '../supabase/functions/campaign-monitoring/_shared/types.ts'
import { sha256Hex } from '../supabase/functions/campaign-monitoring/_shared/auth.ts'

const token = 'local-test-only-do-not-log'
const hash = await sha256Hex(token)
const deno = { env: { get: key => ({ SUPABASE_URL: 'https://monitor.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'local-admin-do-not-log', CAMPAIGN_MONITOR_TOKEN: hash })[key] }, serve() {} }
const oldDeno = globalThis.Deno
globalThis.Deno = deno
const { handleMonitorRequest } = await import('../supabase/functions/campaign-monitoring/index.ts')
globalThis.Deno = oldDeno
const cycleId = '2026-10-23T16:00:00Z'
const request = (body, auth = token) => new Request('https://monitor.invalid/function', {
  method: 'POST', headers: { 'x-campaign-monitor-token': auth, 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

async function fixture(run, options = {}) {
  const saved = { Deno: globalThis.Deno, fetch: globalThis.fetch, log: console.log, error: console.error,
    adapters: { ...adapters } }
  const logs = [], calls = [], rows = new Map(), leases = new Map(), cycles = new Map()
  globalThis.Deno = deno
  console.log = line => logs.push(JSON.parse(line))
  console.error = console.log
  for (const store of STORE_SLUGS) adapters[store] = async () => {
    calls.push(store)
    await options.beforeAdapter?.(store)
    if (options.failStore === store) throw new AdapterError('HTTP_503', `source unavailable ${token}`)
    return { storeSlug: store, sourceUrl: SOURCE_URLS[store], sourceUrls: [SOURCE_URLS[store]],
      coverage: 'partial', explicitlyEndedSourceUids: [],
      diagnostics: [{ code: 'SOURCE_CANDIDATE_UNVERIFIED', reason: token, sourceUrl: 'https://example.invalid/?secret=' + token }],
      campaigns: [{ storeSlug: store, sourceUid: 'stable', name: 'Official Sale', state: 'live',
        lifecycleBasis: 'official-source', officialUrl: SOURCE_URLS[store], sourceUrl: SOURCE_URLS[store] }] }
  }
  globalThis.fetch = async (input, init) => {
    const url = new URL(input)
    assert.equal(url.origin, 'https://monitor.invalid', 'No network or production calls')
    const body = init.body ? JSON.parse(init.body) : null
    const path = url.pathname
    if (path.endsWith('/claim_campaign_monitor_store')) {
      if (options.admissionLost) throw new TypeError('uncertain admission')
      if (cycles.get(body.p_store_slug) === body.p_cycle && body.p_cycle) return Response.json('duplicate-cycle')
      if (leases.has(body.p_store_slug)) return Response.json('busy')
      leases.set(body.p_store_slug, body.p_invocation)
      if (body.p_cycle) cycles.set(body.p_store_slug, body.p_cycle)
      return Response.json('acquired')
    }
    if (path.endsWith('/release_campaign_monitor_store')) {
      assert.equal(leases.get(body.p_store_slug), body.p_invocation)
      leases.delete(body.p_store_slug)
      return Response.json(true)
    }
    if (path.includes('/reserve_')) return Response.json({ generation: '1', base_pointer: null, campaigns: [] })
    if (path.includes('/finalize_')) {
      for (const row of body.p_campaigns) rows.set(row.campaign_key, row)
      return Response.json(path.includes('epic') ? 'published' :
        { status: 'published', upserted: body.p_campaigns.length, ended: 0, hidden: 0, operationallyClosed: 0 })
    }
    if (path.endsWith('/sales_campaigns')) {
      if (init.method === 'GET') return Response.json([])
      assert.equal(init.method, 'POST', 'Uncertain absence must never produce END')
      if (options.writeFailure === 'before') return new Response('', { status: 400 })
      for (const row of body) rows.set(row.campaign_key, row)
      if (options.writeFailure === 'after') throw new TypeError('response lost after write')
      return Response.json(null)
    }
    if (path.endsWith('/sales_source_health')) {
      if (init.method === 'GET') return Response.json([{ consecutive_failures: 0 }])
      return options.healthFailure ? new Response('', { status: 400 }) : Response.json(null)
    }
    throw new Error('Unexpected backend request: ' + path)
  }
  try { await run({ logs, calls, rows, leases }) } finally {
    globalThis.Deno = saved.Deno; globalThis.fetch = saved.fetch
    console.log = saved.log; console.error = saved.error; Object.assign(adapters, saved.adapters)
  }
}

test('ten independent authorized HTTP requests complete with attributable, secret-free partial diagnostics', async () => {
  await fixture(async ({ logs, calls, rows, leases }) => {
    const responses = await Promise.all(STORE_SLUGS.map(store => handleMonitorRequest(request({ mode: 'persist', stores: [store], cycleId }))))
    const bodies = await Promise.all(responses.map(r => r.json()))
    assert.equal(responses.every(r => r.status === 200), true)
    assert.deepEqual([...calls].sort(), [...STORE_SLUGS].sort())
    assert.equal(rows.size, 10); assert.equal(leases.size, 0)
    assert.equal(new Set(bodies.flatMap(b => b.outcomes.map(o => o.invocationId))).size, 10)
    assert.equal(bodies.every(b => b.requestedStores === 1 && b.succeeded === 1 && b.cycleId === cycleId), true)
    const terminals = logs.filter(l => l.event === 'campaign-monitoring.store-complete')
    assert.equal(terminals.length, 10)
    assert.equal(terminals.every(l => l.persistenceStatus === 'completed' && l.coverage === 'partial' && l.diagnosticCount === 1), true)
    assert.equal(logs.filter(l => l.event === 'campaign-monitoring.persistence-complete').length, 10)
    assert.doesNotMatch(JSON.stringify(logs), /local-test-only|local-admin|secret=|reason/)
  })
})

for (const failStore of STORE_SLUGS) test(`independent failure of ${failStore} leaves the other nine terminal and published`, async () => {
  await fixture(async ({ rows }) => {
    const results = await Promise.all(STORE_SLUGS.map(async store =>
      (await handleMonitorRequest(request({ mode: 'persist', stores: [store], cycleId }))).json()))
    assert.equal(results.reduce((n, r) => n + r.failed, 0), 1)
    assert.equal(rows.size, 9)
    assert.equal(results.find(r => r.failed).outcomes[0].errorCode, 'HTTP_503')
  }, { failStore })
})

test('authentication and malformed dispatch reject before admission or extraction', async () => {
  await fixture(async ({ calls, logs }) => {
    for (const auth of ['', 'wrong']) assert.equal((await handleMonitorRequest(request({ mode: 'persist' }, auth))).status, 401)
    for (const body of ['{', null, [], { stores: [] }, { stores: ['gog', 'gog'] }, { stores: ['unknown'] },
      { mode: 'persist', cycleId }, { mode: 'probe', stores: ['gog'], cycleId },
      { mode: 'persist', stores: ['gog'], cycleId: '2026-02-30T00:00:00Z' },
      { mode: 'persist', stores: ['gog'], cycleId: '2026-10-23T17:00:00Z' },
      { mode: 'persist', stores: ['gog'], simulateFailure: 'gog' }]) {
      assert.equal((await handleMonitorRequest(request(body))).status, 400)
    }
    assert.deepEqual(calls, []); assert.deepEqual(logs, [])
  })
})

test('scheduled duplicates after completion do not extract again; manual overlap is rejected', async () => {
  let unblock, started
  const waiting = new Promise(resolve => { unblock = resolve })
  const entered = new Promise(resolve => { started = resolve })
  await fixture(async ({ calls, rows }) => {
    const first = handleMonitorRequest(request({ mode: 'persist', stores: ['gog'], cycleId }))
    await entered
    const duplicate = await (await handleMonitorRequest(request({ mode: 'persist', stores: ['gog'], cycleId }))).json()
    assert.equal(duplicate.outcomes[0].errorCode, 'MONITOR_DUPLICATE_CYCLE')
    const overlap = await (await handleMonitorRequest(request({ mode: 'persist', stores: ['gog'] }))).json()
    assert.equal(overlap.outcomes[0].errorCode, 'MONITOR_BUSY')
    unblock(); await first
    const repeat = await (await handleMonitorRequest(request({ mode: 'persist', stores: ['gog'], cycleId }))).json()
    assert.equal(repeat.outcomes[0].errorCode, 'MONITOR_DUPLICATE_CYCLE')
    assert.equal(calls.length, 1); assert.equal(rows.size, 1)
  }, { beforeAdapter: async () => { started(); await waiting } })
})

for (const writeFailure of ['before', 'after']) test(`failure ${writeFailure} persistence is explicit, never replayed automatically`, async () => {
  await fixture(async ({ calls, rows, logs, leases }) => {
    const body = { mode: 'persist', stores: ['gog'], cycleId }
    const first = await (await handleMonitorRequest(request(body))).json()
    assert.equal(first.failed, 1)
    assert.equal(first.outcomes[0].persistenceStatus, 'incomplete-or-unknown')
    assert.equal(rows.size, writeFailure === 'after' ? 1 : 0)
    assert.equal(leases.size, 1, 'Uncertain publication retains the admission lease')
    await handleMonitorRequest(request(body))
    assert.equal(calls.length, 1)
    assert.equal(logs.some(l => l.event === 'campaign-monitoring.persistence-complete'), false)
  }, { writeFailure })
})

test('sequential manual runs upsert the same identity without duplicate campaign rows', async () => {
  await fixture(async ({ rows, calls }) => {
    for (let i = 0; i < 2; i++) {
      const result = await (await handleMonitorRequest(request({ mode: 'persist', stores: ['gog'] }))).json()
      assert.equal(result.succeeded, 1)
    }
    assert.equal(calls.length, 2); assert.equal(rows.size, 1)
  })
})

test('health failure after commit retains explicit completed persistence in terminal logs', async () => {
  await fixture(async ({ rows, logs }) => {
    const body = await (await handleMonitorRequest(request({ mode: 'persist', stores: ['gog'], cycleId }))).json()
    assert.equal(body.failed, 1); assert.equal(rows.size, 1)
    assert.equal(logs.find(l => l.event === 'campaign-monitoring.store-complete').persistenceStatus, 'completed')
  }, { healthFailure: true })
})

test('uncertain admission cannot extract or persist; probe retains existing no-write semantics', async () => {
  await fixture(async ({ calls }) => {
    const failed = await (await handleMonitorRequest(request({ mode: 'persist', stores: ['gog'], cycleId }))).json()
    assert.equal(failed.failed, 1); assert.equal(calls.length, 0)
    const probe = await (await handleMonitorRequest(request({ mode: 'probe', stores: ['gog'] }))).json()
    assert.equal(probe.outcomes[0].persistenceStatus, 'not-requested')
  }, { admissionLost: true })
})

test('deploy configuration preserves verify_jwt=false and scheduler modifies the original job only', async () => {
  const config = await readFile('supabase/config.toml', 'utf8')
  assert.match(config, /\[functions.campaign-monitoring\]\s+verify_jwt = false/)
  const sql = await readFile('supabase/migrations/20261023160058_campaign_monitor_store_dispatch.sql', 'utf8')
  assert.match(sql, /cron.alter_job/); assert.doesNotMatch(sql, /cron.schedule\(/)
  assert.match(sql, /0 \*\/4 \* \* \*/)
})
