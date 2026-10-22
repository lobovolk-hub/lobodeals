// Offline diagnostics: node tests/helpers/steam-json-profile.mjs
// Baseline is read from Git into memory; no checkout, network or persistence.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { decodeHtml } from '../../supabase/functions/campaign-monitoring/_shared/html.ts'

const self = fileURLToPath(import.meta.url)
const root = new URL('../../', import.meta.url)
const baseline = '44158560835e55bb69a89e25e60296eac6981fd4'
const attr = 'data-partnereventstore'
const oldPattern = /\bdata-partnereventstore=(["'])([\s\S]*?)\1/i
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
function attribute(event, size = 0, quote = '"') {
  // Unicode forces representative two-byte strings; entities exercise decoding.
  const unit = '雪 & diagnostic '
  const padding = unit.repeat(Math.ceil(size / 21))
  const json = JSON.stringify([{ ...event, diagnostic_padding: padding }])
    .replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
  return `${attr}=${quote}${json}${quote}`
}
const event = { event_name: 'Synthetic Sale 雪', rtime32_start_time: 1790874000,
  rtime32_end_time: 1791478800, jsondata: '{"localized_subtitle":["Synthetic Sale"]}' }

if (process.argv[2] !== '--worker') {
  const check = process.argv.includes('--check')
  const results = []
  for (const version of ['baseline', 'current']) {
    const child = spawnSync(process.execPath, [self, '--worker', version, ...(check ? ['--check'] : [])],
      { encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 })
    assert.equal(child.error, undefined, child.error?.message)
    assert.equal(child.status, 0, child.stderr)
    results.push(JSON.parse(child.stdout))
  }
  assert.deepEqual(results[0].commercial, results[1].commercial)
  assert.deepEqual(results[0].fixtureResults, results[1].fixtureResults)
  assert.deepEqual(results[0].extraction, results[1].extraction)
  console.log(JSON.stringify({ node: process.version, baseline, equivalent: true, results }, null, 2))
} else {
  const previous = process.argv[3] === 'baseline'
  const check = process.argv.includes('--check')
  const registered = [], fixtures = new Map()
  let capture = false
  globalThis.fetch = async () => { throw new Error('Network disabled') }
  globalThis.__steamRegister = (name, fn) => registered.push({ name, fn })
  globalThis.__steamCapture = async (name, adapter, context) => {
    if (!capture || fixtures.has(name)) return adapter(context)
    const records = new Map()
    const result = await adapter({ ...context, fetch: async (input, init) => {
      const key = JSON.stringify([String(input), init?.method ?? 'GET', init?.body ?? null])
      const queue = records.get(key) ?? []; records.set(key, queue)
      const record = {}; queue.push(record)
      try {
        const response = await context.fetch(input, init)
        Object.assign(record, { text: await response.clone().text(), status: response.status,
          headers: [...response.headers], url: response.url })
        return response
      } catch (error) { record.error = error; throw error }
    } })
    if (result.campaigns.length && !fixtures.has(name)) fixtures.set(name, { adapter, context, records, expected: result })
    return result
  }
  registerHooks({ load(url, context, next) {
    const loaded = next(url, context)
    if (url.endsWith('/tests/backend-adapters.test.mjs')) return { ...loaded,
      source: String(loaded.source).replace("import test from 'node:test'", 'const test = globalThis.__steamRegister') }
    if (!url.includes('/campaign-monitoring/adapters/') || !url.endsWith('.ts')) return loaded
    let source = String(loaded.source)
    const name = url.split('/').at(-1)
    if (name === 'steam.ts') {
      if (previous) {
        const old = spawnSync('git', ['show', `${baseline}:supabase/functions/campaign-monitoring/adapters/steam.ts`],
          { cwd: fileURLToPath(root), encoding: 'utf8', timeout: 5000 })
        assert.equal(old.status, 0, old.stderr); source = old.stdout
      }
      source += '\nexport { extractDataAttributeJson };\n'
    }
    const match = /export const (run\w+Adapter): StoreAdapter =/.exec(source)
    if (match) {
      source = source.replace(match[0], `const ${match[1]}Original: StoreAdapter =`)
      source += `\nexport const ${match[1]}: StoreAdapter = context => globalThis.__steamCapture(${JSON.stringify(name)}, ${match[1]}Original, context);\n`
    }
    return { ...loaded, source }
  } })
  const steam = await import('../../supabase/functions/campaign-monitoring/adapters/steam.ts')
  const good = attribute(event)
  const cases = [good, attribute(event, 0, "'"), '', `${good} ${attribute({ event_name: 'Second Sale' })}`,
    `${attr}="invalid" ${good}`, `${attr}="`, `${attr}='[]`, `${attr}=[]`, `${attr} ="[]"`,
    `${attr.toUpperCase()}="[]"`, `x${good}`, `x-${good}`, `${attr}="" ${good}`,
    `${attr}='{"x":"opposite quote"}'`, `${attr}="{&quot;x&quot;:&quot;&#x96ea; &#38634; &amp;&quot;}"`,
    `${attr}="[" ${good}`, `${attr}='unterminated ${good}`, `${attr}="&unknown;"`,
    `${'prefix '.repeat(15000)}${good}${' suffix'.repeat(15000)}`,
    attribute(event, 3000000), attribute({ ...event, event_name: 'Different Sale', rtime32_end_time: 1791565200 }, 3000000, "'")]
  const extraction = []
  for (const html of cases) {
    let expected = null
    const match = oldPattern.exec(html)
    if (match) { try { expected = JSON.parse(decodeHtml(match[2])) } catch { /* contract: null */ } }
    const actual = steam.extractDataAttributeJson(html, attr)
    assert.deepEqual(actual, expected)
    extraction.push(hash(actual))
  }
  // Interleave different pages to guard against future cross-page/global caching.
  for (const html of [cases.at(-1), good, cases.at(-2), '', good]) {
    assert.equal(hash(steam.extractDataAttributeJson(html, attr)), extraction[cases.indexOf(html)])
  }
  await import('../backend-adapters.test.mjs')
  capture = true
  for (const { fn } of registered) {
    await fn({ test: async (_name, run) => run() })
    if (fixtures.size === 10) break
  }
  capture = false
  assert.equal(fixtures.size, 10)
  // Enlarge one existing Steam landing without changing any commercial fields.
  let enlarged = false, enlargedBytes = 0
  for (const queue of fixtures.get('steam.ts').records.values()) for (const record of queue) {
    if (enlarged || !record.text) continue
    const match = oldPattern.exec(record.text)
    if (!match) continue
    const parsed = JSON.parse(decodeHtml(match[2]))
    const replacement = attribute(parsed[0], 3000000)
    record.text = record.text.replace(match[0], () => replacement)
    enlarged = true; enlargedBytes = Buffer.byteLength(record.text)
  }
  assert.ok(enlarged && enlargedBytes >= 2900000 && enlargedBytes <= 3400000)
  async function replay(fixture) {
    const cursors = new Map()
    const result = await fixture.adapter({ ...fixture.context, fetch: async (input, init) => {
      const key = JSON.stringify([String(input), init?.method ?? 'GET', init?.body ?? null])
      const index = cursors.get(key) ?? 0; cursors.set(key, index + 1)
      const record = fixture.records.get(key)?.[index]
      assert.ok(record, `Unrecorded request: ${key}`)
      if (record.error) throw record.error
      const response = new Response(record.text, { status: record.status, headers: record.headers })
      Object.defineProperty(response, 'url', { value: record.url }); return response
    } })
    assert.deepEqual(result, fixture.expected, 'Full commercial output must be unchanged')
    return result
  }
  const commercial = hash(await replay(fixtures.get('steam.ts')))
  const fixtureResults = []
  for (const [store, fixture] of fixtures) fixtureResults.push({ store, result: hash(await replay(fixture)),
    knownCampaigns: fixture.context.knownCampaigns?.length ?? 0 })
  const metrics = []
  async function measure(label, fn) {
    await fn()
    const samples = []
    for (let i = 0; i < 5; i++) {
      const cpu = process.cpuUsage(), start = performance.now()
      await fn()
      const delta = process.cpuUsage(cpu)
      samples.push({ cpuMs: (delta.user + delta.system) / 1000, wallMs: performance.now() - start })
    }
    const sorted = samples.map(s => s.cpuMs).sort((a, b) => a - b)
    metrics.push({ label, medianCpuMs: sorted[2], minCpuMs: sorted[0], maxCpuMs: sorted[4], samples })
  }
  if (!check) {
    for (const size of [100000, 500000, 1000000, 2000000, 3000000]) {
      const html = attribute(event, size)
      await measure(`extraction:${Buffer.byteLength(html)} bytes`, () => steam.extractDataAttributeJson(html, attr))
    }
    await measure('Steam:full-adapter:large-page:known-campaign', () => replay(fixtures.get('steam.ts')))
    await measure('ten-adapters:concurrent:large-Steam:other-small-fixtures', () => Promise.all([...fixtures.values()].map(replay)))
  }
  console.log(JSON.stringify({ version: previous ? baseline : 'working-tree', enlargedBytes,
    extraction, commercial, fixtureResults, metrics }))
}
