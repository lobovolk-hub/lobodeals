// Local-only, bounded CPU diagnostics. No real fetch, persistence or generated files.
// node tests/helpers/campaign-cpu-profile.mjs
// node tests/helpers/campaign-cpu-profile.mjs --worker timing gog 4000
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { timingFixture } from './campaign-cpu-fixtures.mjs'

const self = fileURLToPath(import.meta.url)
const root = new URL('../../', import.meta.url)
const moduleUrl = path => new URL(path, root).href
const adapterRoot = 'supabase/functions/campaign-monitoring/adapters/'
const baseline = process.argv.includes('--baseline')
const baselineRef = 'b3533ec2ab6b4193f136243ddb998cd99aedd913'
const round = n => Math.round(n * 1000) / 1000
async function measure(label, fn, iterations = 1) {
  const cpu = process.cpuUsage(), start = performance.now()
  let value
  for (let i = 0; i < iterations; i++) value = await fn()
  const elapsed = process.cpuUsage(cpu)
  console.log(JSON.stringify({ label, iterations, cpuMs: (elapsed.user + elapsed.system) / 1000,
    wallMs: round(performance.now() - start) }))
  return value
}

if (process.argv[2] !== '--worker') {
  console.log(JSON.stringify({ node: process.version, platform: process.platform,
    source: baseline ? baselineRef : 'working-tree', cpu: 'process.cpuUsage user + system; process-wide, including helper threads' }))
  for (const store of ['gog', 'microsoft-store']) {
    for (const size of [1000, 2000, 4000, 8000]) {
      const child = spawnSync(process.execPath, [self, '--worker', 'timing', store, String(size), ...(baseline ? ['--baseline'] : [])],
        { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 })
      console.log(child.error ? JSON.stringify({ store, size, stopped: child.error.code }) : child.stdout.trim())
      if (child.status && !child.error) throw new Error(child.stderr)
    }
  }
  for (const store of ['gog', 'microsoft-store']) {
    const child = spawnSync(process.execPath, [self, '--worker', 'adapter', store, '4000', ...(baseline ? ['--baseline'] : [])],
      { encoding: 'utf8', timeout: 6000, maxBuffer: 1024 * 1024 })
    console.log(child.error ? JSON.stringify({ store, adapterStopped: child.error.code }) : child.stdout.trim())
    if (child.status && !child.error) throw new Error(child.stderr)
  }
  const child = spawnSync(process.execPath, [self, '--worker', 'fixtures', ...(baseline ? ['--baseline'] : [])],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 })
  if (child.error || child.status) throw child.error ?? new Error(child.stderr)
  console.log(child.stdout.trim())
} else {
  // Expose private pure functions in memory only. Production exports stay unchanged.
  const extras = {
    'gog.ts': 'exactSaleEnd', 'microsoft-store.ts': 'campaignEndBoundary',
    'steam.ts': 'parseUpcomingCalendar, partnerEvent',
  }
  let capture = false
  const fixtures = new Map(), registered = []
  let fixtureName = ''
  globalThis.__cpuRegister = (name, fn) => registered.push({ name, fn })
  globalThis.__cpuAdapter = async (name, adapter, context) => {
    if (!capture || fixtures.has(name)) return adapter(context)
    const requests = new Map()
    const fetcher = async (input, init) => {
      const key = JSON.stringify([String(input), init?.method ?? 'GET', init?.body ?? null])
      const records = requests.get(key) ?? []
      requests.set(key, records)
      const record = {}
      records.push(record)
      try {
        const response = await context.fetch(input, init)
        Object.assign(record, { text: await response.clone().text(), status: response.status,
          headers: [...response.headers], url: response.url })
        return response
      } catch (error) { record.error = error; throw error }
    }
    const result = await adapter({ ...context, fetch: fetcher })
    if (result.campaigns.length && !fixtures.has(name)) {
      fixtures.set(name, { adapter, context, requests, expected: result, name: fixtureName })
    }
    return result
  }
  registerHooks({ load(url, context, nextLoad) {
    const loaded = nextLoad(url, context)
    if (url.includes('/campaign-monitoring/adapters/') && url.endsWith('.ts')) {
      const filename = url.split('/').at(-1)
      // Immutable baseline is read into memory, never checked out or copied over files.
      const old = baseline && ['gog.ts', 'microsoft-store.ts'].includes(filename)
        ? spawnSync('git', ['show', `${baselineRef}:${adapterRoot}${filename}`],
          { cwd: fileURLToPath(root), encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 }) : null
      if (old && (old.error || old.status)) throw old.error ?? new Error(old.stderr)
      let source = old ? old.stdout : String(loaded.source)
      if (extras[filename]) source += `\nexport { ${extras[filename]} };\n`
      const match = /export const (run\w+Adapter): StoreAdapter =/.exec(source)
      if (match) {
        source = source.replace(match[0], `const ${match[1]}Original: StoreAdapter =`)
        source += `\nexport const ${match[1]}: StoreAdapter = context => globalThis.__cpuAdapter(${JSON.stringify(filename)}, ${match[1]}Original, context);\n`
      }
      return { ...loaded, source }
    }
    if (url.endsWith('/tests/backend-adapters.test.mjs')) {
      return { ...loaded, source: String(loaded.source).replace("import test from 'node:test'", 'const test = globalThis.__cpuRegister') }
    }
    return loaded
  } })
  globalThis.fetch = async () => { throw new Error('Real network disabled in CPU diagnostics') }
  if (process.argv[3] === 'adapter') {
    const store = process.argv[4], size = Number(process.argv[5])
    const { adapters } = await import(moduleUrl(`${adapterRoot}index.ts`))
    await adapters[store](timingFixture(store, 10))
    await new Promise(resolve => setTimeout(resolve, 100))
    const context = timingFixture(store, size)
    const result = await measure(`${store}:full-adapter:${size} chars`, () => adapters[store](context))
    assert.equal(result.campaigns.length, 1)
    assert.equal(result.campaigns[0].ends, undefined)
    console.log(JSON.stringify({ requests: context.calls(), campaigns: result.campaigns.length }))
  } else if (process.argv[3] === 'timing') {
    const store = process.argv[4], size = Number(process.argv[5])
    assert.ok([1000, 2000, 4000, 8000].includes(size))
    const mod = await import(moduleUrl(`${adapterRoot}${store}.ts`))
    const text = 'sale '.repeat(size / 5)
    const fn = store === 'gog' ? () => mod.exactSaleEnd(`<p>${text}</p>`) :
      () => mod.campaignEndBoundary(text, 'sale-2026')
    // Exclude module loading and warm up the regex on a small benign input.
    if (store === 'gog') mod.exactSaleEnd('<p>The sale ends October 28, 2026 at 10:00 UTC.</p>')
    else mod.campaignEndBoundary('The sale ends October 28, 2026 at 10:00 UTC.', 'sale-2026')
    await new Promise(resolve => setTimeout(resolve, 100))
    const value = await measure(`${store}:timing:${size} chars`, fn, baseline ? 1 : 1000)
    assert.equal(value, undefined)
  } else {
    await import(moduleUrl('tests/backend-adapters.test.mjs'))
    capture = true
    for (const { name, fn } of registered) {
      fixtureName = name
      await fn({ test: async (_name, run) => run() })
      if (fixtures.size === 10) break
    }
    capture = false
    assert.equal(fixtures.size, 10, 'Need one successful campaign fixture for every store')
    const replay = async fixture => {
      const cursors = new Map()
      const result = await fixture.adapter({ ...fixture.context, fetch: async (input, init) => {
        const key = JSON.stringify([String(input), init?.method ?? 'GET', init?.body ?? null])
        const index = cursors.get(key) ?? 0
        cursors.set(key, index + 1)
        const record = fixture.requests.get(key)?.[index]
        assert.ok(record, `Unexpected mock request: ${key}`)
        if (record.error) throw record.error
        const response = new Response(record.text, { status: record.status, headers: record.headers })
        Object.defineProperty(response, 'url', { value: record.url })
        return response
      } })
      assert.deepEqual(result, fixture.expected)
      return result
    }
    const results = []
    for (const [store, fixture] of fixtures) {
      const records = [...fixture.requests.values()].flat()
      console.log(JSON.stringify({ store, fixture: fixture.name, requests: records.length,
        bytes: records.reduce((n, r) => n + Buffer.byteLength(r.text ?? ''), 0),
        campaigns: fixture.expected.campaigns.length }))
      await replay(fixture) // Warmup outside the measurement.
      results.push(await measure(`${store}:adapter`, () => replay(fixture), 1000))
    }
    await measure('ten-adapters:concurrent-mocked-cycle', () =>
      Promise.all([...fixtures.values()].map(replay)), 200)
    const { campaignBaseRow } = await import(moduleUrl('supabase/functions/campaign-monitoring/_shared/persistence.ts'))
    await measure('persistence:hash+rows+JSON:no-writes', async () => {
      const rows = await Promise.all(results.flatMap(r => r.campaigns).map(async entry => {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${entry.storeSlug}\0${entry.sourceUid}`))
        const key = `${entry.storeSlug}-${Buffer.from(digest).toString('hex').slice(0, 24)}`
        return campaignBaseRow(entry, key, '2026-10-21T00:00:00Z')
      }))
      return JSON.stringify(rows)
    }, 1000)
    const html = await import(moduleUrl('supabase/functions/campaign-monitoring/_shared/html.ts'))
    const steam = await import(moduleUrl(`${adapterRoot}steam.ts`))
    for (const size of [1000, 10000, 100000]) {
      const text = `<p>${'sale '.repeat(size / 5)}</p>`
      await measure(`HTML:text:${size}`, () => html.textFromHtml(text), 100)
      const json = JSON.stringify([{ event_name: 'Example Sale', description: 'x'.repeat(size) }]).replaceAll('"', '&quot;')
      await measure(`Steam:embedded-JSON:${size}`, () => steam.partnerEvent(`<div data-partnereventstore="${json}"></div>`), 100)
    }
    for (const count of [1, 10, 100]) {
      const calendar = 'Upcoming Steam Events 2026 Fests ' +
        Array.from({ length: count }, (_, i) => `Oct 21 Oct 28 Example ${i} Fest Registration details `).join('') + 'Next Fest'
      await measure(`Steam:calendar+dedup:${count} candidates`, () => steam.parseUpcomingCalendar(calendar), 100)
    }
    const { adapters } = await import(moduleUrl(`${adapterRoot}index.ts`))
    await measure('ten-adapters:synthetic-4KB-GOG-Xbox:concurrent', () =>
      Promise.all([...fixtures].map(([store, fixture]) => {
        if (store === 'gog.ts' || store === 'microsoft-store.ts') {
          return adapters[store.slice(0, -3)](timingFixture(store.slice(0, -3), 4000))
        }
        return replay(fixture)
      })), baseline ? 1 : 100)
    for (const store of ['gog', 'microsoft-store']) {
      for (const count of [1, 10, 50]) {
        await measure(`${store}:full-adapter:${count} candidates:100 chars each`, async () => {
          const result = await adapters[store](timingFixture(store, 100, count))
          assert.equal(result.campaigns.length, count)
        }, 100)
      }
    }
  }
}
