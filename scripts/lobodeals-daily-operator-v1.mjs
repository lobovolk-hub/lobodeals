import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

import {
  assertAllowedWriteRpc,
  assertExactListingBatchCoverage,
  assertFinalReconciliationReferenceMode,
  assertGenericReceiptResultContract,
  buildDetailImportReceiptResult,
  buildFinalDiscountListingUpsertPlan,
  buildFinalReconciliationDecision,
  buildListingUpsertReceiptResult,
  hydrateListingIdentityFromExistingRows,
  isCanonicalDiscountTerminalClamp,
  planDeferredListingInsertRecovery,
  candidateSetHash,
  canonicalCandidateIds,
  classifyDiscountPage,
  classifyDiscountResumeSnapshot,
  classifyEdgeSnapshot,
  classifyMonthlyCommercialContamination,
  classifyPsDealsLanguageSnapshot,
  auditPsDealsListingLanguage,
  compareMonthlySets,
  mergeBacklogAndFresh,
  normalizeListingEvidenceTermination,
  normalizeTitle,
  parseMonthlyArticle,
  parseMonthlyCategoryCandidates,
  parseMonthlyCategoryHtml,
  parseMonthlyFeed,
  parseMonthlyFeedCandidates,
  parsePsdealsId,
  planRecentPage,
  planUncommittedMarkTimestampRecovery,
  requestHash,
  reconcileMonthlyApplicationCheckpoint,
  resolveMonthlyGames,
  selectCurrentMonthlySet,
  sha256,
  stableJson,
  uniqueListingItems,
} from './lib/lobodeals-daily-core-v1.mjs'

const OPERATOR_VERSION = 2
const STATE_VERSION = 1
const PROJECT_REF = 'vlxkoprpobfevxefizwr'
const DEFAULT_PROJECT_ROOT = 'D:\\Proyectos\\lobodeals'
const EXECUTION_CONFIRMATION = 'EXECUTE_LOBODEALS_DAILY_V2'
const RECENT_URL = 'https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'
const DISCOUNTS_URL = 'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'
const MONTHLY_FEED_URL = 'https://blog.playstation.com/category/ps-plus/feed/'
const MONTHLY_CATEGORY_URL = 'https://blog.playstation.com/category/ps-plus/'
const MONTHLY_PERMANENT_URL = 'https://www.playstation.com/en-us/ps-plus/whats-new/#monthly-games'
const PUBLIC_ORIGIN = 'https://lobodeals.com'
const EDGE_PORT = 9223
const RECENT_STOP_AFTER_KNOWN_PAGES = 3
const RECENT_SAFETY_CAP = 100
const DISCOUNT_SAFETY_CAP = 500
const RECENT_PAGINATION_CONTRACT = 'recently_added_path_segment_v1'
const DISCOUNTS_PAGINATION_CONTRACT = 'discounts_path_segment_v1'
const PAGE_TIMEOUT_MS = 120000
const PAGE_DELAY_MIN_MS = 3000
const PAGE_DELAY_MAX_MS = 6000
const EDGE_POLL_MS = 10000
const DETAIL_CHUNK_SIZE = 50
const DETAIL_DELAY_MS = 5000
const DETAIL_TIMEOUT_MS = 120000
const DETAIL_CHUNK_REST_EVERY = 2
const DETAIL_CHUNK_REST_MS = 60000
const FINAL_FRESH_RECONCILE_MAX_AGE_MS = 2 * 60 * 60 * 1000
const UNSAFE_DETAIL_REVALIDATE_HOURS = 7 * 24
const ASYNC_CACHE_POLL_MS = 2000
const ASYNC_CACHE_MAX_WAIT_MS = 12 * 60 * 1000
const ASYNC_CACHE_MAX_ATTEMPTS = 3
const ASYNC_CACHE_RETRYABLE_ERROR_CODES = new Set(['CACHE_V17_42883'])
const ASYNC_DEMOTION_POLL_MS = 2000
const ASYNC_DEMOTION_MAX_WAIT_MS = 12 * 60 * 1000
const DETAIL_RUNTIME_IMPORTER = 'data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs'
const INITIAL_RUN_ID_PREFIX = 'local-cycle-daily-initial'
const INITIAL_QUEUE_COUNT = 8270
const INITIAL_UNIQUE_LISTING_COUNT = 15652
const INITIAL_ARTIFACTS = Object.freeze({
  listing: {
    relative: 'data/cycles/local-cycle-recovery-20260804-final/artifacts/recently-added-normalized-listing.json',
    sha256: 'd8789eae755c225e0e9b675560a53e03d78df27aa464c5926caa5d1256fec0f3',
  },
  queue: {
    relative: 'data/cycles/local-cycle-recovery-20260804-final/artifacts/recently-added-combined.txt',
    sha256: 'f3c2047bcb04038172a362c11424ca846990a167eb628057c8bc1ccde88ad4fb',
  },
})

const REQUIRED_PROJECT_SOURCES = Object.freeze([
  'scripts/collect-psdeals-listing-edge-live-cdp.mjs',
  'scripts/analyze-psdeals-discounts-fast-refresh-v1.mjs',
  'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs',
  'scripts/import-psdeals-detail-local.mjs',
  'scripts/preflight-psdeals-edge-cdp.mjs',
  'scripts/start-psdeals-edge-cdp.ps1',
  'scripts/lib/psdeals-edge-cdp-preflight.mjs',
  'scripts/lib/psdeals-fast-refresh.mjs',
  'scripts/lib/psdeals-commercial-state.mjs',
  'scripts/lib/psdeals-stage-payload.mjs',
  'scripts/lib/psdeals-listing-upsert-adapter.mjs',
  'scripts/lib/psdeals-certification-evidence.mjs',
  'scripts/lib/psdeals-evidence-envelope.mjs',
  'scripts/lib/psdeals-evidence-io.mjs',
  'scripts/lib/psdeals-evidence-producers.mjs',
  'scripts/lib/psdeals-evidence-runtime.mjs',
  'scripts/lib/psdeals-item-classification.mjs',
  'scripts/lib/psdeals-remote-execution-gate.mjs',
])

function parseArgs(argv) {
  const result = new Map()
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const index = arg.indexOf('=')
    result.set(index < 0 ? arg.slice(2) : arg.slice(2, index), index < 0 ? true : arg.slice(index + 1))
  }
  return result
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function nowIso() { return new Date().toISOString() }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
function randomDelay(minimum, maximum) { return minimum + Math.floor(Math.random() * (maximum - minimum + 1)) }
function randomToken() { return crypto.randomBytes(32).toString('base64url') }
function looksTransientFailure(result, parsed = null) {
  const text = `${result?.stdout || ''}
${result?.stderr || ''}
${parsed ? stableJson(parsed) : ''}`
  return /too many requests|demasiadas solicitudes|(?:^|\n)[^\n]*\b429\b[^\n]*(?:too many requests|demasiadas solicitudes)|captcha|cloudflare|verify (?:that )?you are human|checking your browser|timeout|timed out|psdeals_detail_page_not_ready|cannot read properties of null[^\n]*outerhtml|econnreset|econnrefused|enotfound|etimedout|network|socket hang up|connection (?:closed|lost|reset)|fetch failed|psdeals_edge_challenge_present/i.test(text)
}
function portable(root, absolute) { return path.relative(root, absolute).split(path.sep).join('/') }
function buildCanonicalRecentPageUrl(baseUrl, pageNumber) {
  const url = new URL(baseUrl)
  const normalizedPath = url.pathname.replace(/\/+$/, '').replace(/\/\d+$/, '')
  assert(normalizedPath === '/us-store/all-games', `RECENT_BASE_PATH_INVALID:${url.pathname}`)
  url.pathname = pageNumber <= 1 ? normalizedPath : `${normalizedPath}/${pageNumber}`
  url.searchParams.delete('page')
  return url.toString()
}
function parseCanonicalRecentPage(urlValue) {
  try {
    const url = new URL(urlValue)
    if (url.hostname.toLowerCase() !== 'psdeals.net') return null
    const match = url.pathname.match(/^\/us-store\/all-games(?:\/(\d+))?\/?$/i)
    if (!match) return null
    const page = match[1] ? Number(match[1]) : 1
    return Number.isSafeInteger(page) && page > 0 ? page : null
  } catch { return null }
}
function buildCanonicalDiscountPageUrl(baseUrl, pageNumber) {
  const url = new URL(baseUrl)
  const normalizedPath = url.pathname.replace(/\/+$/, '').replace(/\/\d+$/, '')
  assert(normalizedPath === '/us-store/discounts', `DISCOUNTS_BASE_PATH_INVALID:${url.pathname}`)
  url.pathname = pageNumber <= 1 ? normalizedPath : `${normalizedPath}/${pageNumber}`
  url.searchParams.delete('page')
  return url.toString()
}
function parseCanonicalDiscountPage(urlValue) {
  try {
    const url = new URL(urlValue)
    if (url.hostname.toLowerCase() !== 'psdeals.net') return null
    const match = url.pathname.match(/^\/us-store\/discounts(?:\/(\d+))?\/?$/i)
    if (!match) return null
    const page = match[1] ? Number(match[1]) : 1
    return Number.isSafeInteger(page) && page > 0 ? page : null
  } catch { return null }
}
function firstRow(value) { return Array.isArray(value) ? value[0] || null : value || null }
function monthlyDefinitionHash(monthly) {
  return requestHash({
    month_key: monthly?.month_key || null,
    active_from: monthly?.active_from || null,
    active_until: monthly?.active_until || null,
    games: (monthly?.games || []).map((game) => ({ title: normalizeTitle(game.title), platforms: [...(game.platforms || [])].sort() })),
  })
}


function monthlySearchSlugPrefix(title) {
  const normalized = String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
  return normalized.join('-')
}

function exclusiveSlugPrefixUpperBound(prefix) {
  const value = String(prefix || '').trim()
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), `MONTHLY_SLUG_PREFIX_INVALID:${value}`)
  const chars = [...value]
  const index = chars.length - 1
  const code = chars[index].charCodeAt(0)
  assert(code >= 0x30 && code < 0x7b, `MONTHLY_SLUG_PREFIX_UPPER_BOUND_INVALID:${value}`)
  chars[index] = String.fromCharCode(code + 1)
  return chars.join('')
}

function listingCommercialSignature(item) {
  const commercial = item?.commercial_state && typeof item.commercial_state === 'object'
    ? item.commercial_state
    : null
  const source = commercial?.source && typeof commercial.source === 'object'
    ? commercial.source
    : {}
  return stableJson({
    classification: commercial?.classification || null,
    current_price: source.current_price ?? item?.current_price_amount ?? null,
    original_price: source.original_price ?? item?.original_price_amount ?? null,
    discount_percent: source.discount_percent ?? item?.discount_percent ?? null,
    is_safe_for_price_update: commercial?.is_safe_for_price_update === true,
    requires_detail_revalidation: commercial?.requires_detail_revalidation === true,
  })
}

function needsFinalDeltaDetail(item, dbRow, options = {}) {
  if (!dbRow) return true
  const commercial = item?.commercial_state && typeof item.commercial_state === 'object'
    ? item.commercial_state
    : null

  // Safe commercial changes are owned by the complete listing.
  if (commercial?.is_safe_for_price_update === true) return false

  // Existing unsafe rows are not reopened every daily run. Revalidate only when
  // the listing signal actually changed, there is no previous listing evidence,
  // or the last Detail is old enough for the bounded ambiguity rotation.
  const previousListing = dbRow?.raw_listing_json && typeof dbRow.raw_listing_json === 'object'
    ? dbRow.raw_listing_json
    : null
  if (!previousListing) return true
  if (listingCommercialSignature(item) !== listingCommercialSignature(previousListing)) return true

  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()
  const detailMs = Date.parse(dbRow?.detail_last_synced_at || '')
  if (!Number.isFinite(detailMs)) return true
  const ageHours = Math.max(0, nowMs - detailMs) / (60 * 60 * 1000)
  return ageHours >= Number(options.unsafeStaleHours || UNSAFE_DETAIL_REVALIDATE_HOURS)
}

function dateInLima(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${map.year}-${map.month}-${map.day}`
}

function runIdTimestamp(date = new Date()) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date)
  const map = Object.fromEntries(values.map((part) => [part.type, part.value]))
  return `${map.year}${map.month}${map.day}-${map.hour}${map.minute}${map.second}`
}

async function exists(file) { try { await fs.access(file); return true } catch { return false } }
async function readJson(file) { return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')) }
async function sha256File(file) { return sha256(await fs.readFile(file)) }

async function readVerifiedJson(file, expectedHash, label) {
  assert(await exists(file), `${label}_FILE_MISSING:${file}`)
  const actual = await sha256File(file)
  assert(actual === expectedHash, `${label}_HASH_MISMATCH:${actual}:${expectedHash}`)
  return readJson(file)
}

async function createJsonReference(projectRoot, file, label) {
  assert(await exists(file), `${label}_FILE_MISSING:${file}`)
  return { file: portable(projectRoot, file), hash: await sha256File(file) }
}

function resolvePortable(projectRoot, relative) {
  return path.resolve(projectRoot, ...String(relative).split('/'))
}

function validIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

async function stableTimestamp(state, saveState, key, notBefore = []) {
  state.timestamps ||= {}
  const floors = notBefore.filter(validIso).map((value) => Date.parse(value))
  const minimum = floors.length ? Math.max(...floors) : Number.NEGATIVE_INFINITY
  if (state.timestamps[key]) {
    assert(validIso(state.timestamps[key]), `STABLE_TIMESTAMP_INVALID:${key}`)
    assert(Date.parse(state.timestamps[key]) >= minimum, `STABLE_TIMESTAMP_BEFORE_FLOOR:${key}`)
    return state.timestamps[key]
  }
  const instant = new Date(Math.max(Date.now(), Number.isFinite(minimum) ? minimum + 1 : Date.now())).toISOString()
  state.timestamps[key] = instant
  await saveState()
  return instant
}

async function updatePhaseCheckpoint(file, patch) {
  const previous = await exists(file) ? await readJson(file) : { checkpoint_version: 1, phases: {}, created_at: nowIso() }
  const next = {
    ...previous,
    ...patch,
    phases: { ...(previous.phases || {}), ...(patch.phases || {}) },
    updated_at: nowIso(),
  }
  await writeJsonAtomic(file, next)
  return next
}

async function writeAtomic(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(temp, content)
  await fs.rename(temp, file)
}

async function writeJsonAtomic(file, value) { await writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`) }

async function loadKeyValueFile(file) {
  if (!(await exists(file))) return
  const raw = await fs.readFile(file, 'utf8')
  for (const original of raw.split(/\r?\n/)) {
    const line = original.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index < 1) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!(key in process.env)) process.env[key] = value
  }
}

async function runChild(command, args, { cwd, env = process.env, label = command, allowFailure = false, logFile = null, silent = false } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    const write = (target, chunk) => {
      target.push(chunk)
      if (!silent) process.stdout.write(chunk)
      if (logFile) fsSync.appendFileSync(logFile, chunk)
    }
    child.stdout.on('data', (chunk) => write(stdout, chunk))
    child.stderr.on('data', (chunk) => write(stderr, chunk))
    child.once('error', reject)
    child.once('close', (code, signal) => {
      const result = { code: Number.isInteger(code) ? code : 1, signal, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }
      if (result.code !== 0 && !allowFailure) reject(new Error(`${label}_EXIT_${result.code}:${result.stderr.slice(-1000)}`))
      else resolve(result)
    })
  })
}

async function fetchOnce(url, { label, timeoutMs = 60000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`${label}_TIMEOUT`)), timeoutMs)
  try {
    const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'LoboDeals-Daily-Operator/1' }, signal: controller.signal })
    if (!response.ok) throw new Error(`${label}_HTTP_${response.status}`)
    return { text: await response.text(), final_url: response.url, status: response.status }
  } finally {
    clearTimeout(timer)
  }
}

async function acquireLock(lockFile) {
  await fs.mkdir(path.dirname(lockFile), { recursive: true })
  try {
    const handle = await fs.open(lockFile, 'wx')
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, started_at: nowIso() }, null, 2)}\n`)
    await handle.close()
    return
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }
  let stale = true
  try {
    const lock = await readJson(lockFile)
    if (Number.isSafeInteger(lock.pid)) {
      try { process.kill(lock.pid, 0); stale = false } catch { stale = true }
    }
  } catch { stale = true }
  if (!stale) throw new Error('DAILY_OPERATOR_ALREADY_RUNNING')
  await fs.rm(lockFile, { force: true })
  return acquireLock(lockFile)
}


async function verifyInstalledOperatorManifest(projectRoot) {
  const manifestFile = path.join(projectRoot, 'data', 'daily-operator-v1', 'installed-manifest.json')
  assert(await exists(manifestFile), 'INSTALLED_OPERATOR_MANIFEST_MISSING_RUN_INSTALLER')
  const manifest = await readJson(manifestFile)
  assert(manifest.operator_version === OPERATOR_VERSION, 'INSTALLED_OPERATOR_VERSION_MISMATCH')
  const targets = {
    'scripts/lobodeals-daily-operator-v1.mjs': { file: fileURLToPath(import.meta.url), expected: manifest.files?.['scripts/lobodeals-daily-operator-v1.mjs'] },
    'scripts/lib/lobodeals-daily-core-v1.mjs': { file: path.join(projectRoot, 'scripts', 'lib', 'lobodeals-daily-core-v1.mjs'), expected: manifest.files?.['scripts/lib/lobodeals-daily-core-v1.mjs'] },
    [DETAIL_RUNTIME_IMPORTER]: { file: path.join(projectRoot, ...DETAIL_RUNTIME_IMPORTER.split('/')), expected: manifest.runtime_importer_sha256 },
  }
  for (const [relative, target] of Object.entries(targets)) {
    const { file, expected } = target
    assert(/^[a-f0-9]{64}$/.test(String(expected || '')), `INSTALLED_OPERATOR_HASH_MISSING:${relative}`)
    const actual = await sha256File(file)
    assert(actual === expected, `INSTALLED_OPERATOR_HASH_MISMATCH:${relative}:${actual}`)
  }
  return manifest
}

async function verifySourceBaseline(projectRoot) {
  const baselineFile = path.join(projectRoot, 'data', 'daily-operator-v1', 'source-baseline.json')
  assert(await exists(baselineFile), 'SOURCE_BASELINE_MISSING_RUN_INSTALLER')
  const baseline = await readJson(baselineFile)
  assert(baseline.baseline_version === 1, 'SOURCE_BASELINE_VERSION_INVALID')
  for (const relative of REQUIRED_PROJECT_SOURCES) {
    const expected = baseline.files?.[relative]
    assert(/^[a-f0-9]{64}$/.test(String(expected || '')), `SOURCE_BASELINE_ENTRY_MISSING:${relative}`)
    const file = path.join(projectRoot, ...relative.split('/'))
    assert(await exists(file), `REQUIRED_SOURCE_MISSING:${relative}`)
    const actual = await sha256File(file)
    assert(actual === expected, `REQUIRED_SOURCE_CHANGED:${relative}:${actual}`)
  }
  return baseline
}

async function gitHead(projectRoot) {
  const result = await runChild('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, label: 'GIT_HEAD', silent: true })
  const head = result.stdout.trim()
  assert(/^[a-f0-9]{40}$/.test(head), 'GIT_HEAD_INVALID')
  return head
}

function websocketClient(endpoint, timeoutMs = 30000) {
  let sequence = 0
  const pending = new Map()
  const socket = new WebSocket(endpoint)
  const opened = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('EDGE_CDP_WEBSOCKET_OPEN_TIMEOUT')), timeoutMs)
    socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('EDGE_CDP_WEBSOCKET_OPEN_FAILED')) }, { once: true })
  })
  socket.addEventListener('message', (event) => {
    let message
    try { message = JSON.parse(event.data) } catch { return }
    if (!message.id || !pending.has(message.id)) return
    const item = pending.get(message.id)
    pending.delete(message.id)
    clearTimeout(item.timer)
    if (message.error) item.reject(new Error(message.error.message || stableJson(message.error)))
    else item.resolve(message.result)
  })
  return {
    opened,
    send(method, params = {}, sessionId = null, sendTimeoutMs = timeoutMs) {
      sequence += 1
      const id = sequence
      const payload = { id, method, params, ...(sessionId ? { sessionId } : {}) }
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`EDGE_CDP_METHOD_TIMEOUT:${method}`)) }, sendTimeoutMs)
        pending.set(id, { resolve, reject, timer })
      })
      socket.send(JSON.stringify(payload))
      return promise
    },
    close() { try { socket.close() } catch {} },
  }
}

async function inspectEdge({ port = EDGE_PORT, expectedUrl = null } = {}) {
  let version
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`)
    version = await response.json()
  } catch { return { cdp_available: false, tab_found: false } }
  const browserEndpoint = version?.webSocketDebuggerUrl
  if (!browserEndpoint) return { cdp_available: false, tab_found: false }
  const client = websocketClient(browserEndpoint, 30000)
  try {
    await client.opened
    const targetsResult = await client.send('Target.getTargets')
    const targets = targetsResult.targetInfos || []
    const target = targets.find((entry) => entry.type === 'page' && entry.url.includes('psdeals.net') && (!expectedUrl || entry.url.startsWith(expectedUrl.split('?')[0]))) || targets.find((entry) => entry.type === 'page' && entry.url.includes('psdeals.net'))
    if (!target) return { cdp_available: true, tab_found: false, browser_endpoint: browserEndpoint }
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    const evaluated = await client.send('Runtime.evaluate', {
      expression: `(() => { const rootHtml=document.documentElement?.outerHTML||''; const navText=Array.from(document.querySelectorAll('nav a, header a, .navbar a, .header a, .menu a')).map((node)=>node.textContent||'').join(' | ').slice(0,4000); const bodyText=(document.body?.innerText||'').slice(0,12000); const normalizedTitle=(document.title||'').toLowerCase(); const normalizedBody=bodyText.replace(/\\s+/g,' ').trim().toLowerCase(); const routeMatch=location.pathname.match(/\\/game\\/(\\d+)(?:\\/|$)/i); const routeItemId=routeMatch?Number(routeMatch[1]):null; const canonicalTitle=document.querySelector('.game-title-info-name')||document.querySelector('[itemprop="name"]'); const detailRouteReady=Number.isSafeInteger(routeItemId)&&routeItemId>0&&Boolean(canonicalTitle?.textContent?.trim()); const challengePresent=normalizedTitle.includes('just a moment')||normalizedTitle.includes('un momento')||normalizedBody.includes('performing security verification')||normalizedBody.includes('verify you are human')||normalizedBody.includes('checking your browser')||normalizedBody.includes('demuestra que no eres un robot')||normalizedBody.includes('no eres un robot')||normalizedBody.includes('incompatible browser extension or network configuration'); return {title:document.title||'',url:location.href,ready_state:document.readyState,html_lang:document.documentElement?.lang||'',cookie_text:document.cookie||'',nav_text:navText,body_text:bodyText,card_count:document.querySelectorAll('a.game-collection-item-link[href*="/us-store/"]').length,detail_ready:/var\\s+item_id\\s*=\\s*\\d+\\s*;/i.test(rootHtml),detail_route_ready:detailRouteReady,route_item_id:routeItemId,canonical_title:canonicalTitle?.textContent?.trim()||null,challenge_present:challengePresent} })()`,
      returnByValue: true,
    }, attached.sessionId)
    return { cdp_available: true, tab_found: true, browser_endpoint: browserEndpoint, ...(evaluated?.result?.value || {}) }
  } catch { return { cdp_available: false, tab_found: true, browser_endpoint: browserEndpoint } }
  finally { client.close() }
}

async function navigatePsDealsEdgeTo({ url, port = EDGE_PORT } = {}) {
  const targetUrl = String(url || '').trim()
  assert(/^https:\/\/psdeals\.net\//i.test(targetUrl), `EDGE_NAVIGATE_URL_INVALID:${targetUrl}`)

  const response = await fetch(`http://127.0.0.1:${port}/json/version`)
  const version = await response.json()
  const browserEndpoint = version?.webSocketDebuggerUrl
  assert(browserEndpoint, 'EDGE_NAVIGATE_CDP_UNAVAILABLE')

  const client = websocketClient(browserEndpoint, 30000)
  try {
    await client.opened
    const targetsResult = await client.send('Target.getTargets')
    const targets = targetsResult.targetInfos || []
    const target =
      targets.find((entry) => entry.type === 'page' && entry.url.includes('psdeals.net')) ||
      targets.find((entry) => entry.type === 'page')
    assert(target, 'EDGE_NAVIGATE_TARGET_MISSING')
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    await client.send('Page.enable', {}, attached.sessionId)
    const navigation = await client.send('Page.navigate', { url: targetUrl }, attached.sessionId)
    assert(!navigation?.errorText, `EDGE_NAVIGATE_FAILED:${navigation?.errorText}`)
    return browserEndpoint
  } finally {
    client.close()
  }
}

async function launchEdge(projectRoot, url, logFile) {
  const result = await runChild(process.execPath, [
    'scripts/preflight-psdeals-edge-cdp.mjs', '--launch', `--port=${EDGE_PORT}`, '--timeout-ms=900000', '--poll-ms=2000', `--url=${url}`,
  ], { cwd: projectRoot, label: 'EDGE_PREFLIGHT', logFile, silent: true })
  const report = JSON.parse(result.stdout.trim())
  assert(report.ready === true && report.launcher?.websocket_debugger_url, `EDGE_NOT_READY:${report.state}`)
  return report.launcher.websocket_debugger_url
}

async function waitForEdgeReady({ projectRoot, state, saveState, expectedUrl, reason, log, logFile }) {
  let notice = null
  let languageNotice = null
  let lastLanguageHeartbeat = 0
  while (true) {
    const snapshot = await inspectEdge({ expectedUrl })
    const classification = classifyEdgeSnapshot(snapshot)
    if (classification.ready && snapshot.browser_endpoint) {
      const language = classifyPsDealsLanguageSnapshot(snapshot)
      state.language_guard ||= {}
      state.language_guard.last_checked_at = nowIso()
      state.language_guard.last_state = language.state
      state.language_guard.last_evidence = language
      if (language.ready) {
        state.edge = { port: EDGE_PORT, websocket_debugger_url: snapshot.browser_endpoint, checked_at: nowIso() }
        state.transient_wait = null
        state.language_guard.last_english_at = nowIso()
        await saveState()
        if (languageNotice) log('PSDeals volvió a estar inequívocamente en English. Se reanuda la misma unidad pendiente.')
        else if (notice) log('PSDeals volvió a estar disponible. Se reanuda la misma unidad pendiente.')
        return snapshot.browser_endpoint
      }

      const languageKey = language.state === 'spanish' ? 'spanish' : 'unknown'
      if (languageNotice !== languageKey) {
        languageNotice = languageKey
        log('')
        log('============================================================')
        log('PAUSA POR IDIOMA DE PSDEALS')
        log(`Unidad preservada: ${reason}`)
        log(`Idioma detectado: ${language.state === 'spanish' ? 'Spanish' : 'indeterminado'}`)
        log('Cambia manualmente el selector de idioma de PSDeals a English en el Edge aislado.')
        log('NO cierres el CMD, NO avances el checkpoint y NO hace falta reiniciar el operador.')
        log('El operador esperará indefinidamente y continuará solo cuando English quede demostrado.')
        log('============================================================')
        lastLanguageHeartbeat = Date.now()
      } else if (Date.now() - lastLanguageHeartbeat >= 60000) {
        log(`[ESPERA IDIOMA] ${reason}: PSDeals todavía no está confirmado en English.`)
        lastLanguageHeartbeat = Date.now()
      }
      state.transient_wait = {
        kind: 'language',
        language_state: language.state,
        reason,
        detected_at: state.transient_wait?.kind === 'language' ? state.transient_wait.detected_at : nowIso(),
        last_checked_at: nowIso(),
      }
      if (language.state === 'spanish') {
        state.language_guard.spanish_detected_at ||= nowIso()
        state.language_guard.spanish_detection_count = Number(state.language_guard.spanish_detection_count || 0) + 1
      }
      await saveState()
      await sleep(EDGE_POLL_MS)
      continue
    }
    if (classification.state === 'rate_limited_429') {
      if (notice !== '429') {
        notice = '429'
        log('')
        log('============================================================')
        log('PAUSA POR 429 DE PSDEALS')
        log(`Unidad preservada: ${reason}`)
        log('No se avanzará el checkpoint ni se recargará automáticamente.')
        log('Espera al menos 30 minutos y presiona F5 una sola vez en el Edge aislado.')
        log('============================================================')
      }
      state.transient_wait = { kind: '429', reason, detected_at: state.transient_wait?.detected_at || nowIso(), last_checked_at: nowIso() }
      await saveState(); await sleep(EDGE_POLL_MS); continue
    }
    if (classification.state === 'challenge_present') {
      if (notice !== 'challenge') {
        notice = 'challenge'
        log('CAPTCHA/Cloudflare detectado. Resuélvelo en el Edge aislado; el checkpoint no avanzará.')
      }
      state.transient_wait = { kind: 'challenge', reason, detected_at: state.transient_wait?.detected_at || nowIso(), last_checked_at: nowIso() }
      await saveState(); await sleep(EDGE_POLL_MS); continue
    }
    if (snapshot.cdp_available === true) {
      if (!notice) log(`Edge está abierto pero la página no está lista (${classification.state}). Esperando sin avanzar.`)
      notice ||= 'not_ready'
      await sleep(EDGE_POLL_MS); continue
    }
    log(`Edge aislado no está disponible (${reason}). Se reabrirá el mismo perfil y puerto.`)
    try {
      await launchEdge(projectRoot, expectedUrl, logFile)
      notice = 'reopened'
      await sleep(2000)
      continue
    }
    catch (error) { log(`Edge todavía no está listo: ${error instanceof Error ? error.message : String(error)}. Nuevo intento en 30 s.`); await sleep(30000) }
  }
}

async function collectOnePage({ projectRoot, endpoint, baseUrl, pageNumber, outputDir, label, state, saveState, log, logFile, canonicalDiscountPagination = false, canonicalRecentPagination = false, allowTerminalClamp = false }) {
  await fs.mkdir(outputDir, { recursive: true })
  const canonicalPagination = canonicalDiscountPagination || canonicalRecentPagination
  const requestedUrl = canonicalDiscountPagination
    ? buildCanonicalDiscountPageUrl(baseUrl, pageNumber)
    : canonicalRecentPagination
      ? buildCanonicalRecentPageUrl(baseUrl, pageNumber)
      : baseUrl
  const collectorStartPage = canonicalPagination ? 1 : pageNumber
  const verifiedEndpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: baseUrl, reason: `${label} página ${pageNumber}`, log, logFile })
  const outputJson = path.join(outputDir, `${label}-page-${String(pageNumber).padStart(4, '0')}.json`)
  const outputTxt = path.join(outputDir, `${label}-page-${String(pageNumber).padStart(4, '0')}.txt`)
  await Promise.all([fs.rm(outputJson, { force: true }), fs.rm(outputTxt, { force: true })])
  const result = await runChild(process.execPath, [
    'scripts/collect-psdeals-listing-edge-live-cdp.mjs', `--url=${requestedUrl}`, `--endpoint=${verifiedEndpoint}`, '--pages=1', `--start-page=${collectorStartPage}`, '--delay-ms=0', `--timeout-ms=${PAGE_TIMEOUT_MS}`, `--output-json=${portable(projectRoot, outputJson)}`, `--output-txt=${portable(projectRoot, outputTxt)}`, '--stop-after-consecutive-no-new-pages=5',
  ], { cwd: projectRoot, label: `${label}_PAGE_${pageNumber}`, allowFailure: true, logFile })
  if (result.code !== 0 || !(await exists(outputJson))) return { ok: false, error: `${label}_PAGE_EXIT_${result.code}` }
  try {
    const payload = await readJson(outputJson)
    assert(payload.pages_failed === 0, `${label}_PAGE_FAILED`)
    assert(Array.isArray(payload.items) && payload.items.length > 0, `${label}_PAGE_EMPTY`)
    const languageAudit = auditPsDealsListingLanguage(payload.items)
    assert(languageAudit.spanish_count === 0, `${label}_PAGE_LANGUAGE_SPANISH:${languageAudit.spanish_count}`)
    assert(Array.isArray(payload.page_summaries) && payload.page_summaries.length === 1, `${label}_PAGE_SUMMARY_INVALID`)
    const summary = payload.page_summaries[0]
    const declaredPage = Number(summary?.page_number)
    assert(Number.isSafeInteger(declaredPage) && declaredPage === collectorStartPage, `${label}_PAGE_NUMBER_MISMATCH:${declaredPage}:${collectorStartPage}`)
    const activePage = Number(summary?.active_page_detected ?? summary?.active_page)
    const summaryUrl = String(summary?.url || summary?.page_url || '')
    if (canonicalDiscountPagination) {
      const requestedPage = parseCanonicalDiscountPage(summaryUrl || requestedUrl)
      assert(requestedPage === pageNumber, `${label}_CANONICAL_PAGE_URL_MISMATCH:${requestedPage}:${pageNumber}`)
      if (pageNumber > 1) {
        const exactActivePage = Number.isSafeInteger(activePage) && activePage === pageNumber
        const terminalClamp = allowTerminalClamp && isCanonicalDiscountTerminalClamp({
          requested_page: pageNumber,
          active_page: activePage,
        })
        assert(exactActivePage || terminalClamp, `${label}_ACTIVE_PAGE_REQUIRED_MISMATCH:${activePage}:${pageNumber}`)
      } else if (Number.isSafeInteger(activePage) && activePage > 0) {
        assert(activePage === 1, `${label}_ACTIVE_PAGE_MISMATCH:${activePage}:1`)
      }
    } else if (canonicalRecentPagination) {
      const requestedPage = parseCanonicalRecentPage(summaryUrl || requestedUrl)
      assert(requestedPage === pageNumber, `${label}_CANONICAL_RECENT_PAGE_URL_MISMATCH:${requestedPage}:${pageNumber}`)
      if (pageNumber > 1) {
        assert(Number.isSafeInteger(activePage) && activePage === pageNumber, `${label}_ACTIVE_RECENT_PAGE_REQUIRED_MISMATCH:${activePage}:${pageNumber}`)
      } else if (Number.isSafeInteger(activePage) && activePage > 0) {
        assert(activePage === 1, `${label}_ACTIVE_RECENT_PAGE_MISMATCH:${activePage}:1`)
      }
    } else {
      if (Number.isSafeInteger(activePage) && activePage > 0) assert(activePage === pageNumber, `${label}_ACTIVE_PAGE_MISMATCH:${activePage}:${pageNumber}`)
      if (summaryUrl) {
        const observedUrl = new URL(summaryUrl)
        const observedPage = Number(observedUrl.searchParams.get('page') || 1)
        assert(observedPage === pageNumber, `${label}_PAGE_URL_MISMATCH:${observedPage}:${pageNumber}`)
      }
    }
    const terminalClamp = canonicalDiscountPagination && allowTerminalClamp && isCanonicalDiscountTerminalClamp({
      requested_page: pageNumber,
      active_page: activePage,
    })
    return { ok: true, payload, outputJson, outputTxt, requestedUrl, activePage, terminalClamp }
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
}

async function fetchExistingRows(admin, ids, columns = 'id,psdeals_id') {
  const result = []
  const uniqueIds = [...new Set(ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
  for (let index = 0; index < uniqueIds.length; index += 500) {
    const chunk = uniqueIds.slice(index, index + 500)
    const { data, error } = await admin.from('psdeals_stage_items').select(columns).eq('region_code', 'us').eq('storefront', 'playstation').in('psdeals_id', chunk)
    if (error) throw new Error(`FETCH_STAGE_ROWS:${error.message}`)
    result.push(...(data || []))
  }
  return result
}

async function loadInitialBacklog(projectRoot, admin) {
  const listingFile = path.join(projectRoot, ...INITIAL_ARTIFACTS.listing.relative.split('/'))
  const queueFile = path.join(projectRoot, ...INITIAL_ARTIFACTS.queue.relative.split('/'))
  assert(await exists(listingFile) && await exists(queueFile), 'INITIAL_BACKLOG_ARTIFACTS_MISSING')
  assert(await sha256File(listingFile) === INITIAL_ARTIFACTS.listing.sha256, 'INITIAL_BACKLOG_LISTING_HASH_MISMATCH')
  assert(await sha256File(queueFile) === INITIAL_ARTIFACTS.queue.sha256, 'INITIAL_BACKLOG_QUEUE_HASH_MISMATCH')
  const listing = await readJson(listingFile)
  const items = uniqueListingItems(listing.items || [])
  assert(items.length === INITIAL_UNIQUE_LISTING_COUNT, `INITIAL_BACKLOG_LISTING_COUNT_INVALID:${items.length}`)
  const queueUrls = (await fs.readFile(queueFile, 'utf8')).split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  assert(queueUrls.length === INITIAL_QUEUE_COUNT && new Set(queueUrls).size === INITIAL_QUEUE_COUNT, `INITIAL_BACKLOG_QUEUE_COUNT_INVALID:${queueUrls.length}`)
  const itemByUrl = new Map(items.map((item) => [String(item.psdeals_url), item]))
  const queuedItems = queueUrls.map((url) => itemByUrl.get(url)).filter(Boolean)
  assert(queuedItems.length === queueUrls.length, 'INITIAL_BACKLOG_QUEUE_NOT_SUBSET_OF_LISTING')
  const allIds = items.map((item) => parsePsdealsId(item.psdeals_id ?? item.psdeals_url))
  const existing = await fetchExistingRows(admin, allIds)
  const existingIds = new Set(existing.map((row) => Number(row.psdeals_id)))
  const missing = items.filter((item) => !existingIds.has(parsePsdealsId(item.psdeals_id ?? item.psdeals_url)))
  const originalQueueIds = new Set(queuedItems.map((item) => parsePsdealsId(item.psdeals_id ?? item.psdeals_url)))
  assert([...originalQueueIds].every((id) => allIds.includes(id)), 'INITIAL_BACKLOG_QUEUE_ID_NOT_IN_LISTING')
  return { listingFile, queueFile, items, queuedItems, missing, originalQueueIds, allArtifactIds: new Set(allIds) }
}

async function collectRecentIncremental({ projectRoot, admin, endpoint, runRoot, state, saveState, knownArtifactIds = new Set(), log, logFile }) {
  const root = path.join(runRoot, 'state', 'recently-added')
  const pageDir = path.join(root, 'pages')
  const checkpointFile = path.join(root, 'checkpoint.json')
  await fs.mkdir(pageDir, { recursive: true })
  let checkpoint = await exists(checkpointFile) ? await readJson(checkpointFile) : {
    checkpoint_version: 1, pagination_contract: RECENT_PAGINATION_CONTRACT, next_page: 1, consecutive_known_pages: 0, completed: false, missing_items: [], page_summaries: [], created_at: nowIso(), updated_at: nowIso(),
  }
  if (checkpoint.pagination_contract !== RECENT_PAGINATION_CONTRACT) {
    const migrationDir = path.join(root, 'resets')
    await fs.mkdir(migrationDir, { recursive: true })
    const migrationNumber = Number(checkpoint.reset_count || 0) + 1
    await writeJsonAtomic(path.join(migrationDir, `checkpoint-before-pagination-migration-${String(migrationNumber).padStart(3, '0')}.json`), {
      ...checkpoint,
      reset_reason: 'recently_added_canonical_path_pagination_upgrade',
      reset_at: nowIso(),
    })
    checkpoint = {
      checkpoint_version: 1,
      pagination_contract: RECENT_PAGINATION_CONTRACT,
      generation: Number(checkpoint.generation || 1) + 1,
      reset_count: migrationNumber,
      next_page: 1,
      consecutive_known_pages: 0,
      completed: false,
      missing_items: [],
      page_summaries: [],
      created_at: checkpoint.created_at || nowIso(),
      updated_at: nowIso(),
      last_reset: { reason: 'recently_added_canonical_path_pagination_upgrade', at: nowIso() },
    }
    await writeJsonAtomic(checkpointFile, checkpoint)
    log('[MIGRACIÓN PAGINACIÓN RECENTLY ADDED] Se archivó SOLO el checkpoint parcial/anterior de Recently Added y se reinicia en página 1 usando /us-store/all-games/N + recently-added. Discounts y los 314 lotes de detalle permanecen intactos.')
  }
  if (checkpoint.completed) return checkpoint


  while (!checkpoint.completed) {
    const pageNumber = checkpoint.next_page
    assert(pageNumber <= RECENT_SAFETY_CAP, `RECENT_SAFETY_CAP_REACHED:${RECENT_SAFETY_CAP}`)
    let pageResult
    while (true) {
      pageResult = await collectOnePage({ projectRoot, endpoint, baseUrl: RECENT_URL, pageNumber, outputDir: path.join(root, 'attempts'), label: 'recent', state, saveState, log, logFile, canonicalRecentPagination: true })
      if (pageResult.ok) {
        const raw = Number(pageResult.payload.page_summaries[0]?.raw_item_count || pageResult.payload.items.length)
        if (raw >= 30) break
        log(`[CONTROL DE CALIDAD RECENT] página ${pageNumber} corta (${raw}). Se mantiene pendiente y se reintenta.`)
      }
      endpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: RECENT_URL, reason: `Recently Added página ${pageNumber}: ${pageResult.error || 'página corta'}`, log, logFile })
      await sleep(30000)
    }
    const items = uniqueListingItems(pageResult.payload.items)
    const ids = items.map((item) => parsePsdealsId(item.psdeals_id ?? item.psdeals_url))
    const existing = await fetchExistingRows(admin, ids)
    const known = new Set([...knownArtifactIds, ...existing.map((row) => Number(row.psdeals_id))])
    const plan = planRecentPage({ page_items: items, known_ids: known, consecutive_known_pages: checkpoint.consecutive_known_pages, stop_after: RECENT_STOP_AFTER_KNOWN_PAGES })
    checkpoint.missing_items = mergeBacklogAndFresh(checkpoint.missing_items, plan.missing_items)
    checkpoint.consecutive_known_pages = plan.consecutive_known_pages
    checkpoint.page_summaries.push({ page_number: pageNumber, raw_items: items.length, missing_against_lobodeals: plan.missing_ids.length, all_known: plan.page_all_known, collected_at: pageResult.payload.collected_at })
    checkpoint.next_page = pageNumber + 1
    checkpoint.last_successful_page = pageNumber
    checkpoint.completed = plan.should_stop
    checkpoint.stop_reason = plan.should_stop ? `three_consecutive_pages_fully_known_against_database_or_adopted_listing:last_page=${pageNumber}` : null
    checkpoint.updated_at = nowIso()
    await writeJsonAtomic(path.join(pageDir, `page-${String(pageNumber).padStart(4, '0')}.json`), { items, summary: checkpoint.page_summaries.at(-1) })
    await writeJsonAtomic(checkpointFile, checkpoint)
    log(`[CHECKPOINT RECENT] página=${pageNumber} | ausentes_reales=${plan.missing_ids.length} | páginas_totalmente_conocidas=${checkpoint.consecutive_known_pages}/${RECENT_STOP_AFTER_KNOWN_PAGES} | siguiente=${checkpoint.next_page}`)
    if (!checkpoint.completed) await sleep(randomDelay(PAGE_DELAY_MIN_MS, PAGE_DELAY_MAX_MS))
  }
  return checkpoint
}

async function collectDiscountsComplete({ projectRoot, endpoint, runRoot, state, saveState, log, logFile }) {
  const root = path.join(runRoot, 'state', 'discounts-listing')
  const pageDir = path.join(root, 'pages')
  const checkpointFile = path.join(root, 'checkpoint.json')
  await fs.mkdir(pageDir, { recursive: true })
  let checkpoint = await exists(checkpointFile) ? await readJson(checkpointFile) : {
    checkpoint_version: 1, pagination_contract: DISCOUNTS_PAGINATION_CONTRACT, next_page: 1, completed: false, expected_page_size: 36, items: [], page_summaries: [], retry_count: 0, created_at: nowIso(), updated_at: nowIso(),
  }
  if (checkpoint.pagination_contract !== DISCOUNTS_PAGINATION_CONTRACT) {
    const migrationDir = path.join(root, 'resets')
    await fs.mkdir(migrationDir, { recursive: true })
    const migrationNumber = Number(checkpoint.reset_count || 0) + 1
    await writeJsonAtomic(path.join(migrationDir, `checkpoint-before-pagination-migration-${String(migrationNumber).padStart(3, '0')}.json`), {
      ...checkpoint,
      reset_reason: 'discounts_canonical_path_pagination_upgrade',
      reset_at: nowIso(),
    })
    checkpoint = {
      checkpoint_version: 1,
      pagination_contract: DISCOUNTS_PAGINATION_CONTRACT,
      generation: Number(checkpoint.generation || 1) + 1,
      reset_count: migrationNumber,
      next_page: 1,
      completed: false,
      expected_page_size: 36,
      observed_total: null,
      items: [],
      page_summaries: [],
      retry_count: Number(checkpoint.retry_count || 0),
      created_at: checkpoint.created_at || nowIso(),
      updated_at: nowIso(),
      last_reset: { reason: 'discounts_canonical_path_pagination_upgrade', at: nowIso() },
    }
    await writeJsonAtomic(checkpointFile, checkpoint)
    log('[MIGRACIÓN PAGINACIÓN DESCUENTOS] Se archivó SOLO el checkpoint parcial de Discounts y se reinicia en página 1 usando /us-store/discounts/N + best-new-deals. Los 314 lotes de detalle permanecen cerrados.')
  }
  if (checkpoint.completed) return checkpoint
  const resetForSnapshotChange = async (reason, details = {}) => {
    const resetNumber = Number(checkpoint.reset_count || 0) + 1
    const resetDir = path.join(root, 'resets')
    await fs.mkdir(resetDir, { recursive: true })
    await writeJsonAtomic(path.join(resetDir, `checkpoint-before-reset-${String(resetNumber).padStart(3, '0')}.json`), {
      ...checkpoint, reset_reason: reason, reset_details: details, reset_at: nowIso(),
    })
    checkpoint = {
      checkpoint_version: 1,
      pagination_contract: DISCOUNTS_PAGINATION_CONTRACT,
      generation: Number(checkpoint.generation || 1) + 1,
      reset_count: resetNumber,
      next_page: 1,
      completed: false,
      expected_page_size: 36,
      observed_total: null,
      items: [],
      page_summaries: [],
      retry_count: Number(checkpoint.retry_count || 0),
      created_at: checkpoint.created_at || nowIso(),
      updated_at: nowIso(),
      last_reset: { reason, details, at: nowIso() },
    }
    await writeJsonAtomic(checkpointFile, checkpoint)
    log(`[REINICIO CONSISTENTE DESCUENTOS] ${reason}. Se archivó el checkpoint anterior y se vuelve a página 1; no se escribe en Supabase.`)
  }
  const collectFreshHeadForResume = async (reasonLabel) => {
    const pageOneUrl = buildCanonicalDiscountPageUrl(DISCOUNTS_URL, 1)
    log(`[GUARD REANUDACIÓN DESCUENTOS] ${reasonLabel}: comprobando página 1 fresca antes de confiar en el checkpoint parcial.`)
    try {
      await navigatePsDealsEdgeTo({ url: pageOneUrl })
    } catch (error) {
      log(`[GUARD REANUDACIÓN DESCUENTOS] no se pudo navegar todavía a página 1: ${error instanceof Error ? error.message : String(error)}.`)
    }

    let head
    while (true) {
      head = await collectOnePage({
        projectRoot,
        endpoint,
        baseUrl: DISCOUNTS_URL,
        pageNumber: 1,
        outputDir: path.join(root, 'attempts'),
        label: 'discounts-resume-head',
        state,
        saveState,
        log,
        logFile,
        canonicalDiscountPagination: true,
      })
      if (head.ok) break
      endpoint = await waitForEdgeReady({
        projectRoot,
        state,
        saveState,
        expectedUrl: DISCOUNTS_URL,
        reason: `Guard de reanudación Discounts página 1: ${head.error}`,
        log,
        logFile,
      })
      await sleep(30000)
      try { await navigatePsDealsEdgeTo({ url: pageOneUrl }) } catch {}
    }

    const freshValue = Number(head.payload.total_results_detected)
    const freshTotal = Number.isSafeInteger(freshValue) && freshValue > 0 ? freshValue : null
    const decision = classifyDiscountResumeSnapshot({
      checkpoint_total: checkpoint.observed_total,
      fresh_total: freshTotal,
      next_page: checkpoint.next_page,
      expected_page_size: checkpoint.expected_page_size || 36,
    })
    log(`[GUARD REANUDACIÓN DESCUENTOS] checkpoint_total=${decision.checkpoint_total ?? 'null'} | fresh_total=${decision.fresh_total ?? 'null'} | siguiente=${checkpoint.next_page} | última_estimada=${decision.expected_last_page ?? 'null'} | decisión=${decision.reason}.`)
    return { head, freshTotal, decision }
  }

  if (
    checkpoint.completed !== true &&
    Number(checkpoint.next_page || 1) > 1 &&
    Number.isSafeInteger(Number(checkpoint.observed_total)) &&
    Number(checkpoint.observed_total) > 0
  ) {
    const resumeGuard = await collectFreshHeadForResume('run reanudado con Discounts incompleto')
    if (resumeGuard.decision.reset) {
      await resetForSnapshotChange(resumeGuard.decision.reason, {
        previous_total: resumeGuard.decision.checkpoint_total,
        current_total: resumeGuard.decision.fresh_total,
        previous_next_page: checkpoint.next_page,
        expected_last_page: resumeGuard.decision.expected_last_page,
      })
    }
  }

  while (!checkpoint.completed) {
    const pageNumber = checkpoint.next_page
    assert(pageNumber <= DISCOUNT_SAFETY_CAP, `DISCOUNT_SAFETY_CAP_REACHED:${DISCOUNT_SAFETY_CAP}`)
    let current
    let snapshotResetDuringPage = false
    while (true) {
      current = await collectOnePage({ projectRoot, endpoint, baseUrl: DISCOUNTS_URL, pageNumber, outputDir: path.join(root, 'attempts'), label: 'discounts', state, saveState, log, logFile, canonicalDiscountPagination: true })
      if (current.ok) break
      checkpoint.retry_count += 1
      checkpoint.updated_at = nowIso()
      await writeJsonAtomic(checkpointFile, checkpoint)

      if (
        pageNumber > 1 &&
        Number.isSafeInteger(Number(checkpoint.observed_total)) &&
        Number(checkpoint.observed_total) > 0
      ) {
        const driftGuard = await collectFreshHeadForResume(`falló página ${pageNumber} (${current.error})`)
        if (driftGuard.decision.reset) {
          await resetForSnapshotChange(driftGuard.decision.reason, {
            previous_total: driftGuard.decision.checkpoint_total,
            current_total: driftGuard.decision.fresh_total,
            failed_page: pageNumber,
            expected_last_page: driftGuard.decision.expected_last_page,
            page_error: current.error,
          })
          snapshotResetDuringPage = true
          break
        }
      }

      endpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: DISCOUNTS_URL, reason: `Descuentos página ${pageNumber}: ${current.error}`, log, logFile })
      await sleep(30000)
    }
    if (snapshotResetDuringPage) continue
    const currentItems = uniqueListingItems(current.payload.items)
    const raw = Number(current.payload.page_summaries[0]?.raw_item_count || currentItems.length)
    if (currentItems.length !== raw) {
      checkpoint.retry_count += 1
      checkpoint.last_suspicious_page = { page_number: pageNumber, raw, unique_items: currentItems.length, reason: 'duplicates_inside_page', detected_at: nowIso() }
      checkpoint.updated_at = nowIso()
      await writeJsonAtomic(checkpointFile, checkpoint)
      log(`[CONTROL DE CALIDAD DESCUENTOS] página ${pageNumber} contiene IDs repetidos internamente (${currentItems.length}/${raw}); no se guarda ni se avanza.`)
      await sleep(30000)
      continue
    }
    checkpoint.expected_page_size = Math.max(checkpoint.expected_page_size || 0, raw)
    let terminal = false
    let classification = 'normal'
    const totalValue = Number(current.payload.total_results_detected)
    const total = Number.isSafeInteger(totalValue) && totalValue > 0 ? totalValue : null
    if (total !== null && checkpoint.observed_total !== null && Number(checkpoint.observed_total) !== total) {
      await resetForSnapshotChange('total_results_changed_during_collection', { previous_total: checkpoint.observed_total, current_total: total, detected_page: pageNumber })
      await sleep(60000)
      continue
    }
    if (total !== null && checkpoint.observed_total === null) checkpoint.observed_total = total
    const knownBefore = new Set(uniqueListingItems(checkpoint.items).map((item) => parsePsdealsId(item.psdeals_id ?? item.psdeals_url)))
    const currentNewAgainstCheckpoint = currentItems.filter((item) => !knownBefore.has(parsePsdealsId(item.psdeals_id ?? item.psdeals_url)))
    const overlapCount = currentItems.length - currentNewAgainstCheckpoint.length
    if (pageNumber > 1 && overlapCount > 0 && currentNewAgainstCheckpoint.length > 0) {
      checkpoint.cross_page_overlap_events = Number(checkpoint.cross_page_overlap_events || 0) + 1
      checkpoint.last_cross_page_overlap = { page_number: pageNumber, raw, overlap_count: overlapCount, new_count: currentNewAgainstCheckpoint.length, detected_at: nowIso() }
      checkpoint.updated_at = nowIso()
      await writeJsonAtomic(checkpointFile, checkpoint)
      log(`[SOLAPE TOLERADO DESCUENTOS] página ${pageNumber}: repetidos=${overlapCount}, nuevos=${currentNewAgainstCheckpoint.length}. Se deduplica globalmente y se continúa con best-new-deals; no se reinicia.`)
    }
    if (pageNumber > 1 && currentNewAgainstCheckpoint.length === 0) {
      log(`[PROBE DESCUENTOS] página ${pageNumber} repite IDs ya guardados; comprobando página ${pageNumber + 1}.`)
      let duplicateProbe
      while (true) {
        duplicateProbe = await collectOnePage({ projectRoot, endpoint, baseUrl: DISCOUNTS_URL, pageNumber: pageNumber + 1, outputDir: path.join(root, 'attempts'), label: 'discounts-duplicate-probe', state, saveState, log, logFile, canonicalDiscountPagination: true, allowTerminalClamp: true })
        if (duplicateProbe.ok) break
        endpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: DISCOUNTS_URL, reason: `Probe de repetición descuentos página ${pageNumber + 1}`, log, logFile })
        await sleep(30000)
      }
      if (duplicateProbe.terminalClamp) {
        log(`[PROBE DESCUENTOS] página ${pageNumber + 1} fuera de rango: PSDeals mantiene la URL solicitada pero la paginación activa queda en ${duplicateProbe.activePage}. Se evalúa como límite terminal, sin reintento infinito.`)
      }
      const probeNewAgainstCheckpoint = uniqueListingItems(duplicateProbe.payload.items).filter((item) => !knownBefore.has(parsePsdealsId(item.psdeals_id ?? item.psdeals_url)))
      if (probeNewAgainstCheckpoint.length === 0) {
        terminal = true
        classification = 'terminal_repeated_page'
      } else {
        checkpoint.retry_count += 1
        checkpoint.last_suspicious_page = { page_number: pageNumber, raw, reason: 'duplicate_page_followed_by_new_ids', detected_at: nowIso() }
        checkpoint.updated_at = nowIso()
        await writeJsonAtomic(checkpointFile, checkpoint)
        log(`[CONTROL DE CALIDAD DESCUENTOS] página ${pageNumber} fue una repetición anómala; no se guarda ni se avanza.`)
        await sleep(30000)
        continue
      }
    } else if (
      raw < Math.max(1, Math.floor(checkpoint.expected_page_size * 0.8)) &&
      total !== null &&
      uniqueListingItems([...checkpoint.items, ...currentItems]).length === total
    ) {
      terminal = true
      classification = 'terminal_exact_total'
      log(`[FIN DESCUENTOS] página ${pageNumber} corta (${raw}) completa exactamente los ${total} IDs únicos reportados; no se necesita probe fuera de rango.`)
    } else if (raw < Math.max(1, Math.floor(checkpoint.expected_page_size * 0.8))) {
      log(`[PROBE DESCUENTOS] página ${pageNumber} corta (${raw}); comprobando página ${pageNumber + 1} antes de aceptarla.`)
      let probe
      while (true) {
        probe = await collectOnePage({ projectRoot, endpoint, baseUrl: DISCOUNTS_URL, pageNumber: pageNumber + 1, outputDir: path.join(root, 'attempts'), label: 'discounts-probe', state, saveState, log, logFile, canonicalDiscountPagination: true, allowTerminalClamp: true })
        if (probe.ok) break
        endpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: DISCOUNTS_URL, reason: `Probe descuentos página ${pageNumber + 1}`, log, logFile })
        await sleep(30000)
      }
      if (probe.terminalClamp) {
        log(`[PROBE DESCUENTOS] página ${pageNumber + 1} fuera de rango: PSDeals mantiene la URL solicitada pero la paginación activa queda en ${probe.activePage}. Se evalúa como límite terminal, sin reintento infinito.`)
      }
      const result = classifyDiscountPage({ current_items: currentItems, probe_items: probe.payload.items, expected_page_size: checkpoint.expected_page_size, total_results: total, unique_before: uniqueListingItems(checkpoint.items).length })
      classification = result.classification
      if (!result.accept_current) {
        checkpoint.retry_count += 1; checkpoint.last_suspicious_page = { page_number: pageNumber, raw, probe_new_count: result.probe_new_count, detected_at: nowIso() }; checkpoint.updated_at = nowIso(); await writeJsonAtomic(checkpointFile, checkpoint)
        log(`[CONTROL DE CALIDAD DESCUENTOS] página ${pageNumber} incompleta; no se guarda ni se avanza.`)
        await sleep(30000); continue
      }
      terminal = result.terminal
    } else if (total !== null && uniqueListingItems([...checkpoint.items, ...currentItems]).length >= total) {
      terminal = true; classification = 'terminal_exact_total'
    }
    checkpoint.items = uniqueListingItems([...checkpoint.items, ...currentItems])
    checkpoint.page_summaries.push({ page_number: pageNumber, canonical_page_url: current.requestedUrl || buildCanonicalDiscountPageUrl(DISCOUNTS_URL, pageNumber), raw_items: raw, accepted: true, classification, unique_total: checkpoint.items.length, total_results_detected: total, collected_at: current.payload.collected_at })
    checkpoint.next_page = pageNumber + 1
    checkpoint.last_successful_page = pageNumber
    checkpoint.completed = terminal
    checkpoint.stop_reason = terminal ? classification : null
    checkpoint.updated_at = nowIso()
    await writeJsonAtomic(path.join(pageDir, `page-${String(pageNumber).padStart(4, '0')}.json`), { items: currentItems, summary: checkpoint.page_summaries.at(-1) })
    await writeJsonAtomic(checkpointFile, checkpoint)
    log(`[CHECKPOINT DESCUENTOS] página=${pageNumber} | filas=${raw} | únicos=${checkpoint.items.length} | clasificación=${classification} | siguiente=${checkpoint.next_page}`)
    if (!checkpoint.completed) await sleep(randomDelay(PAGE_DELAY_MIN_MS, PAGE_DELAY_MAX_MS))
  }
  assert(checkpoint.items.length > 0 && checkpoint.stop_reason, 'DISCOUNT_LISTING_NOT_CERTIFIED_COMPLETE')
  if (Number.isSafeInteger(Number(checkpoint.observed_total)) && Number(checkpoint.observed_total) > 0) {
    assert(
      checkpoint.items.length === Number(checkpoint.observed_total),
      `DISCOUNT_LISTING_UNIQUE_COVERAGE_MISMATCH:unique=${checkpoint.items.length}:reported=${checkpoint.observed_total}`,
    )
  }
  return checkpoint
}

async function officialMonthlyReview(log) {
  let attempt = 0
  while (true) {
    attempt += 1
    const discoveryErrors = []
    const discovered = new Map()

    try {
      const feed = await fetchOnce(MONTHLY_FEED_URL, { label: 'MONTHLY_OFFICIAL_FEED' })
      for (const article of parseMonthlyFeedCandidates(feed.text)) discovered.set(article.link, article)
      if (discovered.size) log(`[JUEGOS MENSUALES] ${discovered.size} artículo(s) oficial(es) descubiertos mediante RSS.`)
    } catch (error) {
      discoveryErrors.push(`RSS=${error instanceof Error ? error.message : String(error)}`)
    }

    try {
      const category = await fetchOnce(MONTHLY_CATEGORY_URL, { label: 'MONTHLY_OFFICIAL_CATEGORY' })
      for (const article of parseMonthlyCategoryCandidates(category.text)) {
        if (!discovered.has(article.link)) discovered.set(article.link, article)
      }
      if (discovered.size) log(`[JUEGOS MENSUALES] candidatos oficiales totales tras revisar la categoría: ${discovered.size}.`)
    } catch (error) {
      discoveryErrors.push(`CATEGORY=${error instanceof Error ? error.message : String(error)}`)
    }

    const currentDate = dateInLima(nowIso())
    const parsed = []
    for (const article of [...discovered.values()]
      .sort((a, b) => Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0))
      .slice(0, 8)) {
      try {
        const page = await fetchOnce(article.link, { label: 'MONTHLY_OFFICIAL_ARTICLE' })
        const finalUrl = new URL(page.final_url || article.link)
        assert(finalUrl.protocol === 'https:' && finalUrl.hostname.toLowerCase() === 'blog.playstation.com', `MONTHLY_SOURCE_FINAL_HOST_INVALID:${finalUrl.href}`)
        const monthly = parseMonthlyArticle({ html: page.text, source_url: finalUrl.href, published_at: article.published_at })
        parsed.push(monthly)
      } catch (error) {
        discoveryErrors.push(`ARTICLE=${article.link}:${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (parsed.length) {
      try {
        const current = selectCurrentMonthlySet(parsed, currentDate)
        if (current) {
          log(`[JUEGOS MENSUALES] conjunto oficial vigente para ${currentDate}: ${current.month_key} (${current.active_from} a ${current.active_until}).`)
          return current
        }
      } catch (error) {
        discoveryErrors.push(error instanceof Error ? error.message : String(error))
      }
      discoveryErrors.push(`NO_ACTIVE_RANGE_FOR_${currentDate}:${parsed.map((row) => `${row.month_key}:${row.active_from}/${row.active_until}`).join(',')}`)
    }
    log(`[ESPERA JUEGOS MENSUALES] intento ${attempt} sin una lectura oficial vigente y certificable: ${discoveryErrors.join(' | ')}. Nuevo intento en 120 s; los datos actuales no se modifican.`)
    await sleep(120000)
  }
}

async function resolveRunIdentity(projectRoot) {
  const operatorRoot = path.join(projectRoot, 'data', 'daily-operator-v1')
  const activeFile = path.join(operatorRoot, 'active-run.json')
  const initialMarker = path.join(operatorRoot, 'initial-backlog-completed.json')
  const successDir = path.join(operatorRoot, 'daily-success')
  await Promise.all([fs.mkdir(operatorRoot, { recursive: true }), fs.mkdir(successDir, { recursive: true })])

  // Runner v2 contract:
  //   * unfinished active run => resume it exactly;
  //   * completed run => always create a fresh run, even on the same Lima date.
  // The local lock still prevents simultaneous double-click executions.
  if (await exists(activeFile)) {
    const active = await readJson(activeFile)
    const stateFile = path.join(projectRoot, 'data', 'cycles', active.run_id, 'state', 'daily-operator-state-v1.json')
    if (await exists(stateFile)) {
      const activeState = await readJson(stateFile)
      if (activeState.status !== 'completed') {
        return {
          runId: active.run_id,
          initialMode: false,
          activeFile,
          initialMarker,
          resumedExistingRun: true,
        }
      }
    }
  }

  const runId = `local-cycle-daily-${runIdTimestamp()}-${crypto.randomBytes(4).toString('hex')}`
  await writeJsonAtomic(activeFile, {
    run_id: runId,
    initial_mode: false,
    runner_version: 2,
    status: 'active',
    created_at: nowIso(),
  })
  return {
    runId,
    initialMode: false,
    activeFile,
    initialMarker,
    resumedExistingRun: false,
  }
}

async function createSupabase(projectRoot) {
  await loadKeyValueFile(path.join(projectRoot, '.env.local'))
  await loadKeyValueFile(path.resolve(projectRoot, '..', 'worker-playstation-ingest', '.dev.vars'))
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  assert(typeof supabaseUrl === 'string' && supabaseUrl.includes(PROJECT_REF), 'SUPABASE_URL_PROJECT_MISMATCH')
  assert(typeof secretKey === 'string' && secretKey.length > 40, 'SUPABASE_SECRET_KEY_MISSING')
  const requireFromProject = createRequire(path.join(projectRoot, 'package.json'))
  const entry = requireFromProject.resolve('@supabase/supabase-js')
  const supabaseModule = await import(pathToFileURL(entry).href)
  const createClient = supabaseModule.createClient || supabaseModule.default?.createClient
  assert(typeof createClient === 'function', 'SUPABASE_CLIENT_RESOLUTION_FAILED')
  return createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

async function verifyNoForeignCycle(admin, runId) {
  const { data, error } = await admin.from('price_refresh_cycles').select('id,local_cycle_id,status,started_at').eq('status', 'running')
  if (error) throw new Error(`RUNNING_CYCLE_READ:${error.message}`)
  const foreign = (data || []).filter((row) => row.local_cycle_id !== runId)
  assert(foreign.length === 0, `FOREIGN_RUNNING_CYCLE_PRESENT:${foreign.map((row) => row.local_cycle_id).join(',')}`)
}

async function fetchMonthlyCandidates(admin, monthly, prospectiveItems) {
  const candidates = [...prospectiveItems]
  const exactTitles = [...new Set(monthly.games.map((game) => String(game.title || '').trim()).filter(Boolean))]
  if (exactTitles.length) {
    const { data, error } = await admin.from('psdeals_stage_items')
      .select('id,psdeals_id,title,psdeals_slug,platforms,content_type,item_type_label,psdeals_url')
      .eq('region_code', 'us').eq('storefront', 'playstation').in('title', exactTitles).limit(100)
    if (error) throw new Error(`MONTHLY_CANDIDATE_EXACT_READ:${error.message}`)
    candidates.push(...(data || []))
  }
  for (const game of monthly.games) {
    const prefix = monthlySearchSlugPrefix(game.title)
    if (!prefix) continue
    const upperBound = exclusiveSlugPrefixUpperBound(prefix)
    const { data, error } = await admin.from('psdeals_stage_items')
      .select('id,psdeals_id,title,psdeals_slug,platforms,content_type,item_type_label,psdeals_url')
      .gte('psdeals_slug', prefix).lt('psdeals_slug', upperBound)
      .eq('region_code', 'us').eq('storefront', 'playstation')
      .order('psdeals_slug', { ascending: true }).order('psdeals_id', { ascending: true }).limit(100)
    if (error) throw new Error(`MONTHLY_CANDIDATE_SLUG_RANGE_READ:${error.message}`)
    const rows = data || []
    assert(rows.every((row) => String(row.psdeals_slug || '').startsWith(prefix)), `MONTHLY_CANDIDATE_SLUG_RANGE_ESCAPE:${prefix}`)
    candidates.push(...rows)
  }
  return uniqueListingItems(candidates)
}

async function recordAction({ rpc, state, saveState, actionKind, parentReceiptId, idempotencyKey, inputHash, execute, resultBuilder }) {
  state.action_runtime ||= {}
  state.action_runtime[idempotencyKey] ||= {}
  const runtime = state.action_runtime[idempotencyKey]
  runtime.started_at ||= nowIso()
  const reqHash = requestHash({ actionKind, idempotencyKey, inputHash })
  runtime.request_hash ||= reqHash
  assert(runtime.request_hash === reqHash, `ACTION_REQUEST_HASH_CHANGED:${idempotencyKey}`)
  await saveState()
  const begin = firstRow(await rpc('begin_psdeals_cycle_action_v1', {
    p_cycle_id: state.remote_cycle_id,
    p_parent_receipt_id: parentReceiptId || null,
    p_action_kind: actionKind,
    p_idempotency_key: idempotencyKey,
    p_attempt: 1,
    p_request_hash: reqHash,
    p_input_artifact_hash: inputHash || null,
    p_started_at: runtime.started_at,
  }))
  assert(begin?.id, `${actionKind}_RECEIPT_BEGIN_FAILED`)
  runtime.receipt_id = begin.id
  await saveState()
  if (begin.status !== 'committed') {
    const execution = await execute({ receiptId: begin.id })
    const result = resultBuilder ? resultBuilder(execution) : execution
    assertGenericReceiptResultContract(actionKind, result)
    runtime.finished_at ||= new Date(Math.max(Date.now(), Date.parse(runtime.started_at) + 1)).toISOString()
    await saveState()
    const finishRpc = actionKind === 'ended_deals_analysis'
      ? 'finish_psdeals_ended_analysis_v2'
      : 'finish_psdeals_cycle_action_v1'
    const finished = firstRow(await rpc(finishRpc, {
      p_receipt_id: begin.id,
      p_cycle_id: state.remote_cycle_id,
      p_idempotency_key: idempotencyKey,
      p_request_hash: reqHash,
      p_status: 'committed',
      p_finished_at: runtime.finished_at,
      p_affected_rows: Number(result?.affected_rows ?? result?.succeeded ?? 0),
      p_result: result,
      p_error_code: null,
    }))
    assert(finished?.status === 'committed', `${actionKind}_RECEIPT_FINISH_FAILED`)
    runtime.committed_at = runtime.finished_at
    await saveState()
    return { receipt_id: begin.id, result }
  }
  runtime.committed_at ||= begin.finished_at || runtime.finished_at || nowIso()
  await saveState()
  return { receipt_id: begin.id, result: begin.result || null, reconciled: true }
}


async function selectCleanTerminalDetailReceipt(admin, receiptIds) {
  const candidates = [...new Set((receiptIds || []).filter(Boolean))].reverse()
  for (const receiptId of candidates) {
    const { data, error } = await admin.from('psdeals_cycle_action_receipts')
      .select('id,action_kind,status,result')
      .eq('id', receiptId)
      .limit(1)
    if (error) throw new Error(`DETAIL_RECEIPT_PREFLIGHT_READ:${error.message}`)
    const row = (data || [])[0]
    if (!row || row.status !== 'committed' || !['detail_import', 'detail_retry'].includes(row.action_kind)) continue
    if (Number(row.result?.pending_failures ?? 0) === 0) return row.id
  }
  throw new Error('NO_CLEAN_DETAIL_RECEIPT_AVAILABLE_FOR_MARK')
}

async function assertMarkReceiptSetReady(admin, requiredReceiptIds, demotionReceiptId, expectedEndedApplied) {
  const required = [...new Set((requiredReceiptIds || []).filter(Boolean))]
  const { data, error } = await admin.from('psdeals_cycle_action_receipts')
    .select('id,action_kind,status,affected_rows,result')
    .in('id', required)
  if (error) throw new Error(`MARK_RECEIPT_PREFLIGHT_READ:${error.message}`)
  const rows = data || []
  assert(rows.length === required.length, `MARK_RECEIPT_PREFLIGHT_COUNT_MISMATCH:${rows.length}:${required.length}`)
  assert(rows.every((row) => row.status === 'committed'), 'MARK_RECEIPT_PREFLIGHT_NOT_ALL_COMMITTED')
  const has = (predicate) => rows.some(predicate)
  assert(has((row) => row.action_kind === 'listing_validation' && row.result?.complete === true), 'MARK_RECEIPT_PREFLIGHT_LISTING_VALIDATION_MISSING')
  assert(has((row) => row.action_kind === 'listing_upsert_batch'), 'MARK_RECEIPT_PREFLIGHT_LISTING_UPSERT_MISSING')
  assert(has((row) => row.action_kind === 'fast_refresh_analysis'), 'MARK_RECEIPT_PREFLIGHT_FAST_REFRESH_MISSING')
  assert(has((row) => ['detail_import', 'detail_retry'].includes(row.action_kind) && Number(row.result?.pending_failures ?? 0) === 0), 'MARK_RECEIPT_PREFLIGHT_CLEAN_DETAIL_MISSING')
  assert(has((row) => row.action_kind === 'monthly_check_record' && row.result?.result === 'no_changes' && row.result?.application_performed === false), 'MARK_RECEIPT_PREFLIGHT_MONTHLY_MISSING')
  assert(has((row) => row.action_kind === 'ended_deals_analysis' && row.result?.listing_complete === true), 'MARK_RECEIPT_PREFLIGHT_ENDED_ANALYSIS_MISSING')
  assert(has((row) => row.id === demotionReceiptId && row.action_kind === 'demotion_apply' && Number(row.affected_rows) === Number(expectedEndedApplied)), 'MARK_RECEIPT_PREFLIGHT_DEMOTION_MISMATCH')
  return rows
}

async function reconcileUncommittedMarkTimestamps(admin, state, saveState, validationFloors, log) {
  assert(typeof log === 'function', 'MARK_TIMESTAMP_RECOVERY_LOG_REQUIRED')
  const plan = planUncommittedMarkTimestampRecovery({
    timestamps: state.timestamps || {},
    validation_floors: validationFloors,
  })
  if (!plan.requires_reset) return plan

  const { data: cycleRows, error: cycleError } = await admin.from('price_refresh_cycles')
    .select('id,status,validation_completed_at,finished_at')
    .eq('id', state.remote_cycle_id)
    .limit(1)
  if (cycleError) throw new Error(`MARK_TIMESTAMP_RECOVERY_CYCLE_READ:${cycleError.message}`)
  const cycleRow = (cycleRows || [])[0]
  assert(cycleRow?.status === 'running', `MARK_TIMESTAMP_RECOVERY_REMOTE_CYCLE_NOT_RUNNING:${cycleRow?.status || 'missing'}`)
  assert(cycleRow.validation_completed_at === null && cycleRow.finished_at === null, 'MARK_TIMESTAMP_RECOVERY_REMOTE_CYCLE_NOT_PRISTINE')

  const { data: markRows, error: markError } = await admin.from('psdeals_cycle_action_receipts')
    .select('id,status,action_kind')
    .eq('cycle_id', state.remote_cycle_id)
    .eq('action_kind', 'mark_succeeded')
    .limit(1)
  if (markError) throw new Error(`MARK_TIMESTAMP_RECOVERY_RECEIPT_READ:${markError.message}`)
  assert((markRows || []).length === 0, `MARK_TIMESTAMP_RECOVERY_REMOTE_RECEIPT_PRESENT:${markRows?.[0]?.status || 'unknown'}`)

  const previousValidation = state.timestamps?.validation_completed_at || null
  const previousFinished = state.timestamps?.cycle_finished_at || null
  if (plan.reset_validation_completed_at) delete state.timestamps.validation_completed_at
  if (plan.reset_cycle_finished_at) delete state.timestamps.cycle_finished_at
  await saveState()
  log(`[RECUPERACIÓN TIMESTAMP MARK] Se descartaron timestamps locales NO committed anteriores al nuevo piso remoto. validation=${previousValidation || 'null'}; finished=${previousFinished || 'null'}; floor=${plan.validation_floor_iso}.`)
  return plan
}


async function adoptCommittedCertificationRecovery(admin, state, saveState, log) {
  assert(typeof log === 'function', 'CERTIFY_RECOVERY_LOG_REQUIRED')
  if (!state.remote_cycle_id || !state.receipts?.mark_succeeded) return null

  const { data: cycleRows, error: cycleError } = await admin.from('price_refresh_cycles')
    .select('id,status,certified_at,cache_refreshed_at')
    .eq('id', state.remote_cycle_id)
    .limit(1)
  if (cycleError) throw new Error(`CERTIFY_RECOVERY_CYCLE_READ:${cycleError.message}`)
  const cycleRow = (cycleRows || [])[0]
  if (cycleRow?.status !== 'certified' || !cycleRow.certified_at) return null

  const { data: receiptRows, error: receiptError } = await admin.from('psdeals_cycle_action_receipts')
    .select('id,status,action_kind,parent_receipt_id,result,started_at,finished_at,created_at')
    .eq('cycle_id', state.remote_cycle_id)
    .eq('action_kind', 'certify')
    .eq('status', 'committed')
    .eq('parent_receipt_id', state.receipts.mark_succeeded)
    .order('created_at', { ascending: false })
    .limit(1)
  if (receiptError) throw new Error(`CERTIFY_RECOVERY_RECEIPT_READ:${receiptError.message}`)
  const receipt = (receiptRows || [])[0]
  if (!receipt?.id) return null

  const result = receipt.result || {}
  assert(String(result.contract_version || '') === '3', 'CERTIFY_RECOVERY_CONTRACT_INVALID')
  assert(String(result.certification_timestamp || '') === String(cycleRow.certified_at), 'CERTIFY_RECOVERY_TIMESTAMP_MISMATCH')

  state.receipts.certify = receipt.id
  await saveState()
  log(`[RECONCILIAR CERTIFY] Se adoptó receipt committed remoto ${receipt.id}; no se repite el RPC largo por PostgREST.`)
  return {
    receipt_id: receipt.id,
    action_status: 'committed',
    reconciled: true,
    certification_timestamp: result.certification_timestamp,
    regular_initialized: Number(result.regular_initialized || 0),
    regular_lowered: Number(result.regular_lowered || 0),
    ps_plus_initialized: Number(result.ps_plus_initialized || 0),
    ps_plus_lowered: Number(result.ps_plus_lowered || 0),
    error_code: null,
  }
}

async function adoptCommittedCacheRecovery(admin, state, saveState, log) {
  assert(typeof log === 'function', 'CACHE_RECOVERY_LOG_REQUIRED')
  if (!state.remote_cycle_id || !state.receipts?.certify) return null

  const { data: cycleRows, error: cycleError } = await admin.from('price_refresh_cycles')
    .select('id,status,certified_at,cache_refreshed_at')
    .eq('id', state.remote_cycle_id)
    .limit(1)
  if (cycleError) throw new Error(`CACHE_RECOVERY_CYCLE_READ:${cycleError.message}`)
  const cycleRow = (cycleRows || [])[0]
  if (cycleRow?.status !== 'certified' || !cycleRow.certified_at || !cycleRow.cache_refreshed_at) return null

  const { data: receiptRows, error: receiptError } = await admin.from('psdeals_cycle_action_receipts')
    .select('id,status,action_kind,parent_receipt_id,result,affected_rows,started_at,finished_at,created_at')
    .eq('cycle_id', state.remote_cycle_id)
    .eq('action_kind', 'cache_refresh')
    .eq('status', 'committed')
    .eq('parent_receipt_id', state.receipts.certify)
    .order('created_at', { ascending: false })
    .limit(1)
  if (receiptError) throw new Error(`CACHE_RECOVERY_RECEIPT_READ:${receiptError.message}`)
  const receipt = (receiptRows || [])[0]
  if (!receipt?.id) return null

  const result = receipt.result || {}
  assert(Number(result.inserted_rows || 0) > 0, 'CACHE_RECOVERY_INSERTED_ROWS_INVALID')
  assert(Number(result.expired_deals_still_marked_active || 0) === 0, 'CACHE_RECOVERY_EXPIRED_DEALS_PRESENT')

  state.receipts.cache = receipt.id
  await saveState()
  log(`[RECONCILIAR CACHE] Se adoptó receipt committed remoto ${receipt.id}; no se repite el rebuild largo por PostgREST.`)
  return {
    receipt_id: receipt.id,
    action_status: 'committed',
    reconciled: true,
    inserted_rows: Number(result.inserted_rows || 0),
    active_regular_deals: Number(result.active_regular_deals || 0),
    active_ps_plus_deals: Number(result.active_ps_plus_deals || 0),
    expired_deals_still_marked_active: Number(result.expired_deals_still_marked_active || 0),
    error_code: null,
  }
}

async function runAsyncEndedDemotionV5({
  admin,
  rpc,
  state,
  saveState,
  log,
  parameters,
  expectedCount,
  stateJobKey,
  label,
}) {
  assert(typeof log === 'function', 'DEMOTION_V5_LOG_REQUIRED')
  assert(stateJobKey && typeof stateJobKey === 'string', 'DEMOTION_V5_STATE_KEY_REQUIRED')
  assert(Number.isSafeInteger(Number(expectedCount)) && Number(expectedCount) >= 0, 'DEMOTION_V5_EXPECTED_COUNT_INVALID')

  const { data: preflightData, error: preflightError } = await admin.rpc('lobodeals_daily_runner_v23_preflight')
  if (preflightError) throw new Error(`lobodeals_daily_runner_v23_preflight:${preflightError.message}`)
  const preflight = firstRow(preflightData)
  assert(Number(preflight?.contract_version) === 23, 'DEMOTION_V23_PREFLIGHT_CONTRACT_INVALID')
  assert(preflight?.pg_cron_present === true, 'DEMOTION_V23_PG_CRON_MISSING')
  assert(preflight?.enqueue_demotion_v5_present === true, 'DEMOTION_V23_ENQUEUE_MISSING')
  assert(preflight?.poll_demotion_v5_present === true, 'DEMOTION_V23_POLL_MISSING')
  assert(preflight?.apply_demotion_v4_present === true, 'DEMOTION_V23_V4_MISSING')

  let asyncJobId = state[stateJobKey] || null
  if (!asyncJobId) {
    const enqueueParameters = {
      p_cycle_id: parameters.p_cycle_id,
      p_ended_analysis_receipt_id: parameters.p_ended_analysis_receipt_id,
      p_demotion_idempotency_key: parameters.p_idempotency_key,
      p_demotion_request_hash: parameters.p_request_hash,
      p_listing_artifact_hash: parameters.p_listing_artifact_hash,
      p_analysis_evidence_hash: parameters.p_analysis_evidence_hash,
      p_candidate_set_hash: parameters.p_candidate_set_hash,
      p_candidate_psdeals_ids: parameters.p_candidate_psdeals_ids,
      p_expected_count: parameters.p_expected_count,
      p_applied_at: parameters.p_applied_at,
    }
    const enqueueRow = firstRow(await rpc('enqueue_lobodeals_ended_demotion_v5', enqueueParameters))
    assert(enqueueRow?.job_id, `DEMOTION_V5_ENQUEUE_FAILED:${enqueueRow?.error_code || enqueueRow?.job_status}`)
    asyncJobId = enqueueRow.job_id
    state[stateJobKey] = asyncJobId
    await saveState()
    log(`[DEMOTION ASYNC V5] ${label} | job=${asyncJobId} | estado=${enqueueRow.job_status}. La transacción exact-set corre fuera del timeout de PostgREST.`)
  } else {
    log(`[DEMOTION ASYNC V5] ${label} | reanudando job=${asyncJobId}.`)
  }

  const waitStarted = Date.now()
  let lastLoggedStatus = null
  let lastLogAt = 0
  while (Date.now() - waitStarted <= ASYNC_DEMOTION_MAX_WAIT_MS) {
    const { data, error } = await admin.rpc('get_lobodeals_ended_demotion_v5', { p_job_id: asyncJobId })
    if (error) throw new Error(`get_lobodeals_ended_demotion_v5:${error.message}`)
    const job = firstRow(data)
    assert(job?.job_id === asyncJobId, 'DEMOTION_V5_JOB_READ_INVALID')

    if (job.job_status === 'succeeded') {
      assert(job.demotion_receipt_id, 'DEMOTION_V5_RECEIPT_MISSING')
      assert(Number(job.affected_rows) === Number(expectedCount), `DEMOTION_V5_AFFECTED_COUNT_MISMATCH:${job.affected_rows}:${expectedCount}`)
      return {
        receipt_id: job.demotion_receipt_id,
        affected_rows: Number(job.affected_rows || 0),
        result: job.demotion_result || {},
        async_job_id: asyncJobId,
      }
    }

    if (job.job_status === 'failed') {
      throw new Error(`DEMOTION_V5_ASYNC_FAILED:${job.error_code || 'unknown'}`)
    }

    const now = Date.now()
    if (job.job_status !== lastLoggedStatus || now - lastLogAt >= 10000) {
      log(`[DEMOTION ASYNC V5] ${label} | job=${asyncJobId} | estado=${job.job_status}.`)
      lastLoggedStatus = job.job_status
      lastLogAt = now
    }
    await sleep(ASYNC_DEMOTION_POLL_MS)
  }

  throw new Error(`DEMOTION_V5_ASYNC_TIMEOUT:${label}:${asyncJobId}`)
}

async function buildChunkEvidence({ projectRoot, runRoot, state, chunkItems, chunkIndex, modules }) {
  const dir = path.join(runRoot, 'state', 'detail-import', `chunk-${String(chunkIndex).padStart(4, '0')}`)
  await fs.mkdir(dir, { recursive: true })
  const listingFile = path.join(dir, 'source-listing.json')
  const queueFile = path.join(dir, 'combined.txt')
  const mustFile = path.join(dir, 'must.txt')
  const plusFile = path.join(dir, 'plus.txt')
  const staleFile = path.join(dir, 'stale.txt')
  const skippedFile = path.join(dir, 'skipped.txt')
  const summaryFile = path.join(dir, 'analysis-summary.json')
  const evidenceFile = path.join(dir, 'fast-refresh-analysis.json')
  const urls = chunkItems.map((item) => item.psdeals_url)
  await writeJsonAtomic(listingFile, { base_url: RECENT_URL, pages_processed: 0, pages_failed: 0, items: chunkItems })
  const text = urls.length ? `${urls.join('\n')}\n` : ''
  await writeAtomic(queueFile, text); await writeAtomic(mustFile, text); await writeAtomic(plusFile, ''); await writeAtomic(staleFile, ''); await writeAtomic(skippedFile, '')
  await writeJsonAtomic(summaryFile, { chunk_index: chunkIndex, combined: urls.length, reason: 'daily_operator_detail_queue' })
  const outputSpecs = [
    [summaryFile, 'fast_refresh_summary', 'fast_refresh_summary'], [queueFile, 'combined_queue', 'url_queue'], [mustFile, 'must_refresh_queue', 'url_queue'], [plusFile, 'ps_plus_recheck_queue', 'url_queue'], [staleFile, 'stale_queue', 'url_queue'], [skippedFile, 'skipped_queue', 'url_queue'],
  ]
  const outputs = []
  for (const [file, role, artifactKind] of outputSpecs) outputs.push(await modules.referencePsdealsFile({ project_root: projectRoot, file_path: file, role, artifact_kind: artifactKind }))
  const listingInput = await modules.referencePsdealsFile({ project_root: projectRoot, file_path: listingFile, role: 'listing_json', artifact_kind: 'listing_json' })
  const rows = chunkItems.map((item) => ({ listing: item, db: null, reasons: ['daily_operator_detail_queue'] }))
  const envelope = modules.buildAnalyzerFastRefreshEvidence({
    identity: { local_cycle_id: state.run_id, run_token: state.run_token, remote_cycle_id: state.remote_cycle_id, region_code: 'us', storefront: 'playstation', mode: 'real_recorded' },
    producer: { name: 'lobodeals-daily-operator-v1', version: String(OPERATOR_VERSION), code_revision: state.code_revision },
    timestamps: { started_at: nowIso(), finished_at: nowIso(), generated_at: nowIso() },
    context: modules.buildPsdealsFilterContext({ requested_url: RECENT_URL, platforms: ['ps5', 'ps4'], content_types: ['games', 'bundles', 'dlc'], order: 'daily-detail-queue', limits: { chunk_size: DETAIL_CHUNK_SIZE } }),
    listing_input: listingInput, outputs,
    queues: { must_refresh: rows, ps_plus_recheck: [], stale: [], skipped: [], combined: rows, ps_plus_recheck_limit: 0, stale_limit: 0 },
  })
  await fs.rm(evidenceFile, { force: true })
  await modules.emitPsdealsProducerEvidence({ output_path: evidenceFile, envelope })
  return { dir, queueFile, evidenceFile, queueHash: await sha256File(queueFile) }
}

async function processDetailChunks({ projectRoot, runRoot, state, saveState, rpc, modules, endpoint, detailItems, detailQueueHash, parentReceiptId, log, logFile, stateKey = 'detail_chunks', idempotencyNamespace = 'primary' }) {
  const items = uniqueListingItems(detailItems).filter((item) => item.psdeals_url)
  state[stateKey] ||= { completed: [], receipts: [], runtime: {}, total_items: items.length, chunk_size: DETAIL_CHUNK_SIZE }
  const chunksState = state[stateKey]
  chunksState.runtime ||= {}
  assert(Number(chunksState.total_items) === items.length, `DETAIL_QUEUE_SIZE_CHANGED_ON_RESUME:${stateKey}`)
  const completed = new Set(chunksState.completed || [])
  const idempotencyPart = idempotencyNamespace === 'primary' ? '' : `${idempotencyNamespace}:`
  const labelPart = idempotencyNamespace === 'primary' ? '' : `${idempotencyNamespace.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_`

  if (items.length === 0) {
    assert(/^[a-f0-9]{64}$/.test(String(detailQueueHash || '')), 'DETAIL_EMPTY_QUEUE_HASH_INVALID')
    const noop = await recordAction({
      rpc,
      state,
      saveState,
      actionKind: 'detail_import',
      parentReceiptId,
      idempotencyKey: `detail-import:${state.run_id}:${idempotencyPart}empty:${detailQueueHash}`,
      inputHash: detailQueueHash,
      execute: async () => ({
        affected_rows: 0, attempted: 0, succeeded: 0, pending_failures: 0, failed: 0, skipped: 0, empty_queue: true,
      }),
    })
    if (!chunksState.receipts.includes(noop.receipt_id)) chunksState.receipts.push(noop.receipt_id)
    chunksState.empty_queue_confirmed = true
    chunksState.updated_at = nowIso()
    await saveState()
    await updatePhaseCheckpoint(path.join(runRoot, 'state', 'detail-import', 'checkpoint.json'), {
      empty_queue: true, receipt_id: noop.receipt_id, phases: { completed: true },
    })
    log('[CHECKPOINT DETALLES] cola vacía confirmada mediante receipt idempotente; no se abrieron fichas.')
    return { item_count: 0, chunk_count: 0, receipts: chunksState.receipts }
  }

  const runImport = async ({ queueFile, evidenceKind, parentEvidence, originalFailuresFile = null, retryChainParentEvidence = null, summaryFile, failuresFile, evidenceFile, authorizationId, debugDir, label, expectedCount, requireClean = false }) => {
    let transientAttempts = 0
    while (true) {
      await Promise.all([fs.rm(summaryFile, { force: true }), fs.rm(failuresFile, { force: true }), fs.rm(evidenceFile, { force: true })])
      const runtimeArgs = [
        DETAIL_RUNTIME_IMPORTER,
        `--file=${portable(projectRoot, queueFile)}`,
        `--evidence-kind=${evidenceKind}`,
        `--remote-cycle-id=${state.remote_cycle_id}`,
        `--parent-evidence=${portable(projectRoot, parentEvidence)}`,
        ...(evidenceKind === 'detail_retry'
          ? [`--original-failures=${portable(projectRoot, originalFailuresFile)}`]
          : []),
        ...(retryChainParentEvidence
          ? [`--retry-chain-parent-evidence=${portable(projectRoot, retryChainParentEvidence)}`]
          : []),
        `--summary-output-json=${portable(projectRoot, summaryFile)}`,
        `--failures-output-txt=${portable(projectRoot, failuresFile)}`,
        `--local-cycle-id=${state.run_id}`,
        `--run-token=${state.run_token}`,
        `--evidence-output=${portable(projectRoot, evidenceFile)}`,
        `--code-revision=${state.code_revision}`,
        '--producer-version=1',
        '--evidence-mode=real_recorded',
        '--execution-mode=operational',
        `--project-ref=${PROJECT_REF}`,
        `--confirm-remote-action=${evidenceKind === 'detail_retry' ? 'EXECUTE_DETAIL_RETRY' : 'EXECUTE_IMPORT_DETAILS'}`,
        `--authorization-id=${authorizationId}`,
        '--fetch-mode=edge-live',
        `--edge-endpoint=${endpoint}`,
        '--relations-mode=replace',
        `--delay-ms=${DETAIL_DELAY_MS}`,
        `--timeout-ms=${DETAIL_TIMEOUT_MS}`,
        `--debug-html-dir=${portable(projectRoot, debugDir)}`,
      ]
      const result = await runChild(process.execPath, runtimeArgs, {
        cwd: projectRoot,
        label,
        allowFailure: true,
        logFile,
        env: { ...process.env, LOBODEALS_REMOTE_EXECUTION: 'EXPLICITLY_AUTHORIZED' },
      })
      let parsed = null
      if (await exists(summaryFile)) {
        try { parsed = await readJson(summaryFile) } catch {}
      }
      const parsedIsComplete = Boolean(
        parsed &&
        Number(parsed.attempted) === expectedCount &&
        Number(parsed.succeeded) + Number(parsed.failed) === expectedCount &&
        Number(parsed.skipped || 0) === 0
      )
      if (parsedIsComplete && (!requireClean || Number(parsed.failed) === 0)) {
        return { result, parsed }
      }
      const edgeSnapshot = await inspectEdge({ expectedUrl: null })
      const edgeState = classifyEdgeSnapshot(edgeSnapshot)
      if (looksTransientFailure(result, parsed) || ['rate_limited_429', 'challenge_present', 'cdp_unavailable', 'page_not_ready'].includes(edgeState.state)) {
        transientAttempts += 1
        if (transientAttempts >= 3) {
          throw new Error(`${label}_TRANSIENT_RETRY_LIMIT:${transientAttempts}`)
        }
        log(`[${evidenceKind === 'detail_retry' ? 'RETRY ' : ''}DETALLES TRANSITORIO] ${label}, intento ${transientAttempts}; se preserva y espera.`)
        endpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: RECENT_URL, reason: label, log, logFile })
        await sleep(30000)
        continue
      }
      if (parsedIsComplete) return { result, parsed }
      throw new Error(`${label}_UNRESOLVED:${result.code}`)
    }
  }

  for (let start = 0, chunkIndex = 0; start < items.length; start += DETAIL_CHUNK_SIZE, chunkIndex += 1) {
    if (completed.has(chunkIndex)) {
      log(`[REANUDAR DETALLES] lote ${chunkIndex + 1} ya confirmado.`)
      continue
    }

    const chunkItems = items.slice(start, start + DETAIL_CHUNK_SIZE)
    const chunk = await buildChunkEvidence({ projectRoot, runRoot, state, chunkItems, chunkIndex, modules })
    const summary = path.join(chunk.dir, 'detail-summary.json')
    const failures = path.join(chunk.dir, 'detail-failures.txt')
    const evidence = path.join(chunk.dir, 'detail-import.json')
    const importKey = `detail-import:${state.run_id}:${idempotencyPart}${chunkIndex}:${chunk.queueHash}`
    chunksState.runtime[String(chunkIndex)] ||= { chunk_index: chunkIndex, queue_hash: chunk.queueHash, created_at: nowIso() }
    const chunkRuntime = chunksState.runtime[String(chunkIndex)]
    assert(chunkRuntime.queue_hash === chunk.queueHash, `DETAIL_CHUNK_QUEUE_HASH_CHANGED:${chunkIndex}`)
    await saveState()

    const initial = await recordAction({
      rpc,
      state,
      saveState,
      actionKind: 'detail_import',
      parentReceiptId,
      idempotencyKey: importKey,
      inputHash: chunk.queueHash,
      execute: async () => {
        let parsed
        if (chunkRuntime.initial_attempt?.completed === true) {
          assert(await exists(summary), `DETAIL_INITIAL_SUMMARY_MISSING_ON_RESUME:${chunkIndex}`)
          assert(await sha256File(summary) === chunkRuntime.initial_attempt.summary_hash, `DETAIL_INITIAL_SUMMARY_HASH_MISMATCH:${chunkIndex}`)
          parsed = await readJson(summary)
          assert(requestHash(parsed) === chunkRuntime.initial_attempt.parsed_hash, `DETAIL_INITIAL_PARSED_CHANGED:${chunkIndex}`)
          assert(await exists(evidence), `DETAIL_IMPORT_EVIDENCE_MISSING_ON_RESUME:${chunkIndex}`)
          assert(await sha256File(evidence) === chunkRuntime.initial_attempt.evidence_hash, `DETAIL_IMPORT_EVIDENCE_HASH_MISMATCH:${chunkIndex}`)
          if (Number(parsed.failed) > 0) {
            assert(await exists(failures), `DETAIL_FAILURE_FILE_MISSING_ON_RESUME:${chunkIndex}`)
            assert(await sha256File(failures) === chunkRuntime.initial_attempt.failures_hash, `DETAIL_FAILURE_FILE_HASH_MISMATCH:${chunkIndex}`)
          }
          log(`[REANUDAR DETALLES] lote ${chunkIndex + 1}: intento inicial ya confirmado localmente; no se repite.`)
        } else {
          const firstAttempt = await runImport({
            queueFile: chunk.queueFile,
            evidenceKind: 'detail_import',
            parentEvidence: chunk.evidenceFile,
            summaryFile: summary,
            failuresFile: failures,
            evidenceFile: evidence,
            authorizationId: `authorization-${state.run_id}-${idempotencyPart}detail-${chunkIndex}`,
            debugDir: path.join(chunk.dir, 'html'),
            label: `${labelPart}DETAIL_CHUNK_${chunkIndex}`,
            expectedCount: chunkItems.length,
          })
          parsed = firstAttempt.parsed
          chunkRuntime.initial_attempt = {
            completed: true,
            completed_at: nowIso(),
            summary_hash: await sha256File(summary),
            parsed_hash: requestHash(parsed),
            failures_hash: Number(parsed.failed) > 0 ? await sha256File(failures) : null,
            evidence_hash: await sha256File(evidence),
            attempted: Number(parsed.attempted),
            succeeded: Number(parsed.succeeded),
            failed: Number(parsed.failed),
            skipped: Number(parsed.skipped || 0),
          }
          await saveState()
        }
        return buildDetailImportReceiptResult({
          attempted: Number(parsed.attempted),
          succeeded: Number(parsed.succeeded),
          failed: Number(parsed.failed),
          skipped: Number(parsed.skipped || 0),
          chunk_index: chunkIndex,
        })
      },
    })

    chunkRuntime.initial_receipt_id = initial.receipt_id
    chunkRuntime.initial_receipt_committed = true
    chunkRuntime.initial_receipt_committed_at ||= nowIso()
    await saveState()

    const initialPending = Number(initial.result?.pending_failures || 0)
    const initialSucceeded = Number(initial.result?.succeeded || 0)
    let retry = null

    if (initialPending > 0) {
      assert(await exists(failures), `DETAIL_FAILURE_FILE_MISSING:${chunkIndex}`)
      assert(await exists(evidence), `DETAIL_IMPORT_EVIDENCE_MISSING:${chunkIndex}`)
      const failuresHash = await sha256File(failures)
      if (chunkRuntime.initial_attempt?.failures_hash) {
        assert(failuresHash === chunkRuntime.initial_attempt.failures_hash, `DETAIL_FAILURE_HASH_RUNTIME_MISMATCH:${chunkIndex}`)
      }
      const retrySummary = path.join(chunk.dir, 'retry-summary.json')
      const retryFailures = path.join(chunk.dir, 'retry-failures.txt')
      const retryEvidence = path.join(chunk.dir, 'detail-retry.json')
      const retryKey = `detail-retry:${state.run_id}:${idempotencyPart}${chunkIndex}:${failuresHash}`
      chunkRuntime.retry ||= { idempotency_key: retryKey, failures_hash: failuresHash, created_at: nowIso() }
      assert(chunkRuntime.retry.idempotency_key === retryKey && chunkRuntime.retry.failures_hash === failuresHash, `DETAIL_RETRY_IDENTITY_CHANGED:${chunkIndex}`)
      await saveState()

      retry = await recordAction({
        rpc,
        state,
        saveState,
        actionKind: 'detail_retry',
        parentReceiptId: initial.receipt_id,
        idempotencyKey: retryKey,
        inputHash: failuresHash,
        execute: async () => {
          const retryProgressFile = path.join(chunk.dir, 'retry-progress.json')
          let pendingQueueFile = failures
          let pendingRetryParentEvidence = null
          let pendingCount = initialPending
          let cumulativeSucceeded = 0
          let cumulativeSkipped = 0
          let attemptIndex = 0
          let consecutiveNoProgress = 0
          let languageGateRemediationApplied = false
          let languageGateRemediationAt = null
          let languageGatePreviousNoProgress = null

          if (await exists(retryProgressFile)) {
            const progress = await readJson(retryProgressFile)
            assert(progress.initial_failures_hash === failuresHash, `DETAIL_RETRY_PROGRESS_INPUT_CHANGED:${chunkIndex}`)
            assert(Number(progress.initial_pending) === initialPending, `DETAIL_RETRY_PROGRESS_COUNT_CHANGED:${chunkIndex}`)
            cumulativeSucceeded = Number(progress.cumulative_succeeded || 0)
            cumulativeSkipped = Number(progress.cumulative_skipped || 0)
            pendingCount = Number(progress.pending_count || 0)
            attemptIndex = Number(progress.attempt_index || 0)
            consecutiveNoProgress = Number(progress.consecutive_no_progress || 0)
            languageGateRemediationApplied = progress.language_gate_remediation_applied === true
            languageGateRemediationAt = progress.language_gate_remediation_at || null
            languageGatePreviousNoProgress = Number.isSafeInteger(Number(progress.language_gate_previous_no_progress)) ? Number(progress.language_gate_previous_no_progress) : null
            if (pendingCount > 0) {
              assert(typeof progress.pending_queue_file === 'string' && progress.pending_queue_file, `DETAIL_RETRY_PROGRESS_QUEUE_MISSING:${chunkIndex}`)
              pendingQueueFile = path.resolve(projectRoot, progress.pending_queue_file)
              assert(await exists(pendingQueueFile), `DETAIL_RETRY_PROGRESS_QUEUE_FILE_MISSING:${chunkIndex}`)
              if (progress.pending_queue_hash) assert(await sha256File(pendingQueueFile) === progress.pending_queue_hash, `DETAIL_RETRY_PROGRESS_QUEUE_HASH_CHANGED:${chunkIndex}`)
              if (attemptIndex > 0) {
                const compatibleParentEvidence = progress.pending_parent_evidence_file
                  ? path.resolve(projectRoot, progress.pending_parent_evidence_file)
                  : path.join(
                      chunk.dir,
                      'retry-progress',
                      `attempt-${String(attemptIndex).padStart(4, '0')}`,
                      'evidence.json',
                    )
                assert(await exists(compatibleParentEvidence), `DETAIL_RETRY_PROGRESS_PARENT_EVIDENCE_MISSING:${chunkIndex}:${attemptIndex}`)
                if (progress.pending_parent_evidence_hash) {
                  assert(
                    await sha256File(compatibleParentEvidence) === progress.pending_parent_evidence_hash,
                    `DETAIL_RETRY_PROGRESS_PARENT_EVIDENCE_HASH_CHANGED:${chunkIndex}:${attemptIndex}`,
                  )
                }
                pendingRetryParentEvidence = compatibleParentEvidence
              }
            }
            if (
              pendingCount > 0 &&
              consecutiveNoProgress >= 2 &&
              languageGateRemediationApplied !== true &&
              state.language_guard?.legacy_spanish_listing_detected === true
            ) {
              endpoint = await waitForEdgeReady({
                projectRoot,
                state,
                saveState,
                expectedUrl: RECENT_URL,
                reason: `LANGUAGE_REMEDIATION_DETAIL_CHUNK_${chunkIndex}`,
                log,
                logFile,
              })
              const previousNoProgress = consecutiveNoProgress
              consecutiveNoProgress = 0
              progress.language_gate_remediation_applied = true
              languageGateRemediationApplied = true
              languageGateRemediationAt = nowIso()
              languageGatePreviousNoProgress = previousNoProgress
              progress.language_gate_remediation_at = languageGateRemediationAt
              progress.language_gate_previous_no_progress = languageGatePreviousNoProgress
              progress.consecutive_no_progress = 0
              await writeJsonAtomic(retryProgressFile, progress)
              log(`[REANUDAR RETRY POR IDIOMA] lote ${chunkIndex + 1}: English confirmado; se concede un nuevo intento sobre las ${pendingCount} pendientes sin repetir éxitos previos.`)
            }
            log(`[REANUDAR RETRY] lote ${chunkIndex + 1}: ${cumulativeSucceeded}/${initialPending} ya confirmados localmente; pendientes=${pendingCount}.`)
          } else if (await exists(retrySummary) && await exists(retryFailures)) {
            let legacy = null
            try { legacy = await readJson(retrySummary) } catch {}
            const legacyAttempted = Number(legacy?.attempted)
            const legacySucceeded = Number(legacy?.succeeded)
            const legacyFailed = Number(legacy?.failed)
            const legacySkipped = Number(legacy?.skipped || 0)
            const legacyIsCompleteAccounting =
              Number.isSafeInteger(legacyAttempted) &&
              legacyAttempted === initialPending &&
              legacySucceeded >= 0 &&
              legacyFailed >= 0 &&
              legacySkipped >= 0 &&
              legacySucceeded + legacyFailed + legacySkipped === initialPending
            if (legacyIsCompleteAccounting) {
              cumulativeSucceeded = legacySucceeded
              cumulativeSkipped = legacySkipped
              pendingCount = legacyFailed
              attemptIndex = 1
              if (pendingCount > 0) {
                const legacyFailureLines = (await fs.readFile(retryFailures, 'utf8')).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
                assert(legacyFailureLines.length === pendingCount, `DETAIL_RETRY_LEGACY_FAILURE_COUNT_MISMATCH:${chunkIndex}:${legacyFailureLines.length}:${pendingCount}`)
                pendingQueueFile = retryFailures
                assert(await exists(retryEvidence), `DETAIL_RETRY_LEGACY_EVIDENCE_MISSING:${chunkIndex}`)
                pendingRetryParentEvidence = retryEvidence
              }
              const pendingQueueHash = pendingCount > 0 ? await sha256File(pendingQueueFile) : null
              const pendingParentEvidenceHash = pendingRetryParentEvidence ? await sha256File(pendingRetryParentEvidence) : null
              await writeJsonAtomic(retryProgressFile, {
                version: 1,
                initial_failures_hash: failuresHash,
                initial_pending: initialPending,
                cumulative_succeeded: cumulativeSucceeded,
                cumulative_skipped: cumulativeSkipped,
                pending_count: pendingCount,
                pending_queue_file: pendingCount > 0 ? portable(projectRoot, pendingQueueFile) : null,
                pending_queue_hash: pendingQueueHash,
                pending_parent_evidence_file: pendingRetryParentEvidence ? portable(projectRoot, pendingRetryParentEvidence) : null,
                pending_parent_evidence_hash: pendingParentEvidenceHash,
                attempt_index: attemptIndex,
                consecutive_no_progress: 0,
                seeded_from_legacy_retry_summary: true,
                language_gate_remediation_applied: languageGateRemediationApplied,
                language_gate_remediation_at: languageGateRemediationAt,
                language_gate_previous_no_progress: languageGatePreviousNoProgress,
                updated_at: nowIso(),
              })
              log(`[REANUDAR RETRY] lote ${chunkIndex + 1}: se reutiliza el resultado previo ${cumulativeSucceeded}/${initialPending}; pendientes=${pendingCount}.`)
            }
          }

          while (pendingCount > 0) {
            const currentAttempt = attemptIndex + 1
            const attemptDir = path.join(chunk.dir, 'retry-progress', `attempt-${String(currentAttempt).padStart(4, '0')}`)
            const attemptSummary = path.join(attemptDir, 'summary.json')
            const attemptFailures = path.join(attemptDir, 'failures.txt')
            const attemptEvidence = path.join(attemptDir, 'evidence.json')
            const attemptDebug = path.join(attemptDir, 'html')
            await fs.mkdir(attemptDir, { recursive: true })

            const retryAttempt = await runImport({
              queueFile: pendingQueueFile,
              evidenceKind: 'detail_retry',
              parentEvidence: evidence,
              originalFailuresFile: failures,
              retryChainParentEvidence: pendingRetryParentEvidence,
              summaryFile: attemptSummary,
              failuresFile: attemptFailures,
              evidenceFile: attemptEvidence,
              authorizationId: `authorization-${state.run_id}-${idempotencyPart}retry-${chunkIndex}-attempt-${currentAttempt}`,
              debugDir: attemptDebug,
              label: `${labelPart}DETAIL_RETRY_CHUNK_${chunkIndex}_ATTEMPT_${currentAttempt}`,
              expectedCount: pendingCount,
              requireClean: false,
            })
            const retryParsed = retryAttempt.parsed
            const attemptedNow = Number(retryParsed.attempted)
            const succeededNow = Number(retryParsed.succeeded)
            const failedNow = Number(retryParsed.failed)
            const skippedNow = Number(retryParsed.skipped || 0)
            assert(attemptedNow === pendingCount, `DETAIL_RETRY_PROGRESS_ATTEMPTED_MISMATCH:${chunkIndex}:${attemptedNow}:${pendingCount}`)
            assert(succeededNow + failedNow + skippedNow === pendingCount, `DETAIL_RETRY_PROGRESS_ARITHMETIC:${chunkIndex}`)

            cumulativeSucceeded += succeededNow
            cumulativeSkipped += skippedNow
            attemptIndex = currentAttempt
            consecutiveNoProgress = succeededNow === 0 ? consecutiveNoProgress + 1 : 0
            pendingCount = failedNow
            pendingQueueFile = attemptFailures
            assert(await exists(attemptEvidence), `DETAIL_RETRY_PROGRESS_EVIDENCE_MISSING:${chunkIndex}:${currentAttempt}`)
            pendingRetryParentEvidence = pendingCount > 0 ? attemptEvidence : null
            const pendingQueueHash = pendingCount > 0 ? await sha256File(pendingQueueFile) : null
            const pendingParentEvidenceHash = pendingRetryParentEvidence ? await sha256File(pendingRetryParentEvidence) : null
            await writeJsonAtomic(retryProgressFile, {
              version: 1,
              initial_failures_hash: failuresHash,
              initial_pending: initialPending,
              cumulative_succeeded: cumulativeSucceeded,
              cumulative_skipped: cumulativeSkipped,
              pending_count: pendingCount,
              pending_queue_file: pendingCount > 0 ? portable(projectRoot, pendingQueueFile) : null,
              pending_queue_hash: pendingQueueHash,
              pending_parent_evidence_file: pendingRetryParentEvidence ? portable(projectRoot, pendingRetryParentEvidence) : null,
              pending_parent_evidence_hash: pendingParentEvidenceHash,
              attempt_index: attemptIndex,
              consecutive_no_progress: consecutiveNoProgress,
              seeded_from_legacy_retry_summary: false,
              language_gate_remediation_applied: languageGateRemediationApplied,
              language_gate_remediation_at: languageGateRemediationAt,
              language_gate_previous_no_progress: languageGatePreviousNoProgress,
              updated_at: nowIso(),
            })

            log(`[RETRY PROGRESIVO] lote ${chunkIndex + 1}: intento=${currentAttempt} | +${succeededNow} OK | pendientes=${pendingCount}/${initialPending}.`)
            if (pendingCount === 0) break
            if (consecutiveNoProgress >= 2) {
              throw new Error(`DETAIL_RETRY_NO_PROGRESS:${chunkIndex}:${pendingCount}`)
            }
            if (looksTransientFailure(retryAttempt.result, retryParsed)) {
              endpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: RECENT_URL, reason: `DETAIL_RETRY_PROGRESS_${chunkIndex}_${currentAttempt}`, log, logFile })
              await sleep(30000)
            }
          }

          assert(cumulativeSkipped === 0, `DETAIL_RETRY_PROGRESS_SKIPPED_UNSAFE:${chunkIndex}:${cumulativeSkipped}`)
          assert(cumulativeSucceeded === initialPending, `DETAIL_RETRY_PROGRESS_SUCCEEDED_MISMATCH:${chunkIndex}:${cumulativeSucceeded}:${initialPending}`)
          return buildDetailImportReceiptResult({
            attempted: initialPending,
            succeeded: cumulativeSucceeded,
            failed: 0,
            skipped: 0,
            chunk_index: chunkIndex,
          })
        },
      })
      assert(Number(retry.result?.pending_failures || 0) === 0, `DETAIL_RETRY_NOT_CLEAN:${chunkIndex}`)
      assert(Number(retry.result?.attempted || 0) === initialPending, `DETAIL_RETRY_ATTEMPTED_MISMATCH:${chunkIndex}`)
      chunkRuntime.retry = { ...chunkRuntime.retry, receipt_id: retry.receipt_id, committed: true, committed_at: nowIso() }
      await saveState()
    }

    const retrySucceeded = Number(retry?.result?.succeeded || 0)
    const finalSucceeded = initialSucceeded + retrySucceeded
    const finalPending = Number(retry?.result?.pending_failures ?? initial.result?.pending_failures ?? 0)
    assert(finalPending === 0, `DETAIL_CHUNK_NOT_CLEAN:${chunkIndex}`)
    assert(finalSucceeded === chunkItems.length, `DETAIL_CHUNK_SUCCEEDED_MISMATCH:${chunkIndex}:${finalSucceeded}:${chunkItems.length}`)
    chunkRuntime.committed = true
    chunkRuntime.retry_receipt_id = retry?.receipt_id || null
    chunkRuntime.committed_at = nowIso()
    completed.add(chunkIndex)
    chunksState.completed = [...completed].sort((a, b) => a - b)
    for (const receiptId of [initial.receipt_id, retry?.receipt_id].filter(Boolean)) {
      if (!chunksState.receipts.includes(receiptId)) chunksState.receipts.push(receiptId)
    }
    chunksState.last_completed_chunk = chunkIndex
    chunksState.updated_at = nowIso()
    await saveState()
    log(`[CHECKPOINT DETALLES] lote=${chunkIndex + 1}/${Math.ceil(items.length / DETAIL_CHUNK_SIZE)} | fichas=${chunkItems.length} | retry=${retry ? 'sí' : 'no'} | siguiente=${chunkIndex + 2}`)
    if ((chunkIndex + 1) % DETAIL_CHUNK_REST_EVERY === 0) await sleep(DETAIL_CHUNK_REST_MS)
  }

  return {
    item_count: items.length,
    chunk_count: Math.ceil(items.length / DETAIL_CHUNK_SIZE),
    receipts: chunksState.receipts,
  }
}

export async function upsertListingBatches({ admin, rpc, state, saveState, prepared, parentReceiptId, label, inputHash, log }) {
  assert(prepared && Array.isArray(prepared.batches), 'LISTING_UPSERT_BATCHES_REQUIRED')
  if (prepared.batches.length === 0) return { affected: 0, receipts: [] }
  state.listing_batches ||= {}
  state.listing_batches[label] ||= { completed: [], receipts: [] }
  const progress = state.listing_batches[label]
  const completed = new Set(progress.completed || [])
  let affected = 0
  for (const batch of prepared.batches) {
    const index = Number(batch.batch_index)
    if (completed.has(index)) { affected += batch.rows.length; continue }
    const rowsHash = requestHash(batch.rows)
    const receipt = await recordAction({
      rpc, state, saveState, actionKind: 'listing_upsert_batch', parentReceiptId, idempotencyKey: `listing-upsert:${state.run_id}:${label}:${index}:${rowsHash}`, inputHash,
      execute: async () => {
        const { data, error } = await admin.from('psdeals_stage_items').upsert(batch.rows, { onConflict: 'region_code,storefront,psdeals_id', ignoreDuplicates: false }).select('psdeals_id')
        if (error) throw new Error(`STAGE_UPSERT_${label}:${error.message}`)
        const returned = new Set((data || []).map((row) => Number(row.psdeals_id)))
        const expected = new Set(batch.rows.map((row) => Number(row.psdeals_id)))
        assert(returned.size === expected.size && [...expected].every((id) => returned.has(id)), `STAGE_UPSERT_POSTCONDITION_${label}`)
        return buildListingUpsertReceiptResult({
          batch_index: index,
          attempted: batch.rows.length,
          affected_rows: returned.size,
          label,
        })
      },
    })
    completed.add(index)
    progress.completed = [...completed].sort((a, b) => a - b)
    if (!progress.receipts.includes(receipt.receipt_id)) progress.receipts.push(receipt.receipt_id)
    progress.updated_at = nowIso()
    await saveState()
    affected += batch.rows.length
    log(`[CHECKPOINT UPSERT ${label}] lote=${index + 1}/${prepared.batches.length} | filas=${batch.rows.length}`)
  }
  return { affected, receipts: progress.receipts }
}

async function applyMonthlySafely({ admin, monthly, resolutions, appliedAt }) {
  assert(resolutions.resolved, 'MONTHLY_MAPPING_NOT_RESOLVED')
  assert(typeof appliedAt === 'string' && !Number.isNaN(Date.parse(appliedAt)), 'MONTHLY_APPLIED_AT_INVALID')
  const targetPsdealsIds = resolutions.resolutions.map((row) => row.psdeals_id)
  const stage = await fetchExistingRows(admin, targetPsdealsIds, 'id,psdeals_id,title,psdeals_slug,platforms,content_type,item_type_label')
  const byPsdeals = new Map(stage.map((row) => [Number(row.psdeals_id), row]))
  const targetRows = resolutions.resolutions.map((resolution) => {
    const item = byPsdeals.get(resolution.psdeals_id)
    assert(item?.id && item?.psdeals_slug, `MONTHLY_STAGE_TARGET_MISSING:${resolution.psdeals_id}`)
    return {
      month_key: monthly.month_key,
      title: resolution.official.title,
      item_id: item.id,
      slug: item.psdeals_slug,
      label: 'Free with PS Plus',
      note: 'Included with PlayStation Plus this month.',
      source_url: MONTHLY_PERMANENT_URL,
      active_from: monthly.active_from,
      active_until: monthly.active_until,
      active_from_at: null,
      active_until_at: null,
      is_active: false,
      updated_at: appliedAt,
    }
  })
  const targetItemIds = targetRows.map((row) => row.item_id)
  const { error: preloadError } = await admin.from('ps_plus_monthly_games').upsert(targetRows, { onConflict: 'month_key,item_id', ignoreDuplicates: false })
  if (preloadError) throw new Error(`MONTHLY_PRELOAD:${preloadError.message}`)
  const { error: activateError } = await admin.from('ps_plus_monthly_games').update({ is_active: true, updated_at: appliedAt }).eq('month_key', monthly.month_key).in('item_id', targetItemIds)
  if (activateError) throw new Error(`MONTHLY_ACTIVATE:${activateError.message}`)
  const { data: activeRows, error: activeReadError } = await admin.from('ps_plus_monthly_games').select('id,item_id,month_key,title,is_active,active_from,active_until').eq('is_active', true)
  if (activeReadError) throw new Error(`MONTHLY_ACTIVE_READ:${activeReadError.message}`)
  const nonTargets = (activeRows || []).filter((row) => !targetItemIds.includes(row.item_id)).map((row) => row.id)
  if (nonTargets.length) {
    const { error: deactivateError } = await admin.from('ps_plus_monthly_games').update({ is_active: false, updated_at: appliedAt }).in('id', nonTargets)
    if (deactivateError) throw new Error(`MONTHLY_DEACTIVATE_OLD:${deactivateError.message}`)
  }
  const { data: verified, error: verifyError } = await admin.from('ps_plus_monthly_games').select('item_id,month_key,title,is_active,active_from,active_until').eq('is_active', true)
  if (verifyError) throw new Error(`MONTHLY_VERIFY:${verifyError.message}`)
  const comparison = compareMonthlySets(verified || [], monthly, resolutions)
  assert(comparison.same, `MONTHLY_POSTCONDITION_MISMATCH:${JSON.stringify(comparison)}`)
  return {
    affected_rows: targetRows.length + nonTargets.length,
    active_games: verified.length,
    target_item_ids: targetItemIds,
    deactivated_old_rows: nonTargets.length,
    applied_at: appliedAt,
  }
}

async function adapterIntegrationSelfTest(projectRoot) {
  const adapterPath = path.join(projectRoot, 'scripts', 'lib', 'psdeals-listing-upsert-adapter.mjs')
  assert(await exists(adapterPath), 'ADAPTER_SELFTEST_SOURCE_MISSING')
  const listingAdapter = await import(`${pathToFileURL(adapterPath).href}?adapter_selftest=${Date.now()}`)
  assert(typeof listingAdapter.preparePsdealsListingUpsertBatches === 'function', 'ADAPTER_SELFTEST_EXPORT_MISSING')

  const listingObservedAt = '2026-08-07T00:00:00.000Z'
  const existing = [{
    psdeals_id: 123,
    psdeals_slug: 'fixture-game',
    psdeals_url: 'https://psdeals.net/us-store/game/123/fixture-game',
    title: 'Fixture Game',
  }]
  const source = [{
    psdeals_id: 123,
    psdeals_slug: '',
    psdeals_url: '',
    title: '',
    commercial_state: { is_safe_for_price_update: false },
  }]
  const before = listingAdapter.preparePsdealsListingUpsertBatches({
    listing_items: source,
    existing_psdeals_ids: [123],
    listing_observed_at: listingObservedAt,
    batch_size: 100,
  })
  assert(before.omitted_count === 1, `ADAPTER_SELFTEST_PRECONDITION_CHANGED:${before.omitted_count}`)

  const hydrated = hydrateListingIdentityFromExistingRows(source, existing)
  const after = listingAdapter.preparePsdealsListingUpsertBatches({
    listing_items: hydrated.items,
    existing_psdeals_ids: [123],
    listing_observed_at: listingObservedAt,
    batch_size: 100,
  })
  assert(after.omitted_count === 0 && after.prepared === 1, `ADAPTER_SELFTEST_HYDRATION_FAILED:${after.omitted_count}:${after.prepared}`)
  const coverage = assertExactListingBatchCoverage(after, hydrated.items)
  assert(coverage.expected_count === 1 && coverage.prepared_count === 1, 'ADAPTER_SELFTEST_COVERAGE_FAILED')

  const malformedNew = [{
    psdeals_id: 1989099,
    psdeals_slug: 'fixture-malformed',
    psdeals_url: 'https://psdeals.net/us-store/game/1989099/fixture-malformed',
    title: null,
    commercial_state: { is_safe_for_price_update: false },
  }]
  const malformedPrepared = listingAdapter.preparePsdealsListingUpsertBatches({
    listing_items: malformedNew,
    existing_psdeals_ids: [],
    listing_observed_at: listingObservedAt,
    batch_size: 100,
  })
  assert(malformedPrepared.omitted_count === 1, `ADAPTER_SELFTEST_MALFORMED_PRECONDITION_CHANGED:${malformedPrepared.omitted_count}`)
  const deferred = planDeferredListingInsertRecovery({
    prepared: malformedPrepared,
    listingItems: malformedNew,
    detailItems: malformedNew,
  })
  assert(deferred.recoverable && deferred.deferred_count === 1, 'ADAPTER_SELFTEST_DEFERRED_RECOVERY_PLAN_FAILED')
  const afterDetailStage = [{
    psdeals_id: 1989099,
    psdeals_slug: 'fixture-malformed',
    psdeals_url: 'https://psdeals.net/us-store/game/1989099/fixture-malformed',
    title: 'Recovered Detail Title',
  }]
  const deferredHydrated = hydrateListingIdentityFromExistingRows(deferred.deferred.map((row) => row.item), afterDetailStage)
  const deferredPrepared = listingAdapter.preparePsdealsListingUpsertBatches({
    listing_items: deferredHydrated.items,
    existing_psdeals_ids: [1989099],
    listing_observed_at: listingObservedAt,
    batch_size: 100,
  })
  assert(deferredPrepared.omitted_count === 0 && deferredPrepared.prepared === 1, 'ADAPTER_SELFTEST_DEFERRED_POST_DETAIL_FAILED')
  const deferredCoverage = assertExactListingBatchCoverage(deferredPrepared, deferredHydrated.items)
  assert(deferredCoverage.expected_count === 1 && deferredCoverage.prepared_count === 1, 'ADAPTER_SELFTEST_DEFERRED_COVERAGE_FAILED')

  process.stdout.write(`${JSON.stringify({
    adapter_integration_self_test: true,
    operator_version: OPERATOR_VERSION,
    before_omitted: before.omitted_count,
    repaired: hydrated.repair_count,
    after_omitted: after.omitted_count,
    exact_coverage: coverage,
    malformed_insert_deferred: deferred.deferred_count,
    deferred_post_detail_coverage: deferredCoverage,
    remote_reads_executed: 0,
    remote_writes_executed: 0,
  }, null, 2)}\n`)
}

async function selfTest() {
  const monthly = parseMonthlyArticle({
    source_url: 'https://blog.playstation.com/example', published_at: '2026-07-28T12:00:00Z',
    html: '<p>The games are available from Tuesday August 4 until Monday August 31.</p><h2>Dying Light 2 Stay Human: Reloaded Edition | PS5, PS4</h2><h2>Big Walk | PS5</h2><h2>Signalis | PS4</h2>',
  })
  assert(monthly.month_key === '2026-08' && monthly.games.length === 3, 'SELFTEST_MONTHLY')
  assert(planRecentPage({ page_items: [{ psdeals_id: 1 }, { psdeals_id: 2 }], known_ids: new Set([1, 2]), consecutive_known_pages: 2 }).should_stop, 'SELFTEST_RECENT_STOP')
  assert(classifyDiscountPage({ current_items: [{ psdeals_id: 1 }], probe_items: [{ psdeals_id: 1 }], expected_page_size: 36 }).terminal, 'SELFTEST_DISCOUNT_TERMINAL')
  assert(classifyEdgeSnapshot({ cdp_available: true, tab_found: true, title: '429 Too Many Requests' }).state === 'rate_limited_429', 'SELFTEST_429')
  assert(classifyPsDealsLanguageSnapshot({ html_lang: 'en-US', nav_text: 'Discounts | All Games' }).ready === true, 'SELFTEST_LANGUAGE_ENGLISH')
  assert(classifyPsDealsLanguageSnapshot({ html_lang: 'es', nav_text: 'Descuentos | Todos los juegos' }).state === 'spanish', 'SELFTEST_LANGUAGE_SPANISH')
  assert(monthlySearchSlugPrefix('Dying Light 2 Stay Human: Reloaded Edition') === 'dying-light-2', 'SELFTEST_MONTHLY_SLUG_PREFIX')
  assert(exclusiveSlugPrefixUpperBound('dying-light-2') === 'dying-light-3', 'SELFTEST_MONTHLY_SLUG_RANGE_UPPER')
  assert(exclusiveSlugPrefixUpperBound('big-walk') === 'big-wall', 'SELFTEST_MONTHLY_SLUG_RANGE_UPPER_ALPHA')
  assert(needsFinalDeltaDetail({ commercial_state: { is_safe_for_price_update: true } }, { raw_listing_json: {}, detail_last_synced_at: nowIso() }) === false, 'SELFTEST_FINAL_DELTA_KNOWN_SAFE_LISTING_ONLY')
  const unchangedUnsafe = { commercial_state: { classification: 'temporary_free_promotion_candidate', is_safe_for_price_update: false, requires_detail_revalidation: true, source: { current_price: 'FREE', original_price: '$9.99', discount_percent: '-100%' } } }
  assert(needsFinalDeltaDetail(unchangedUnsafe, { raw_listing_json: unchangedUnsafe, detail_last_synced_at: nowIso() }, { nowMs: Date.now() }) === false, 'SELFTEST_FINAL_DELTA_UNCHANGED_UNSAFE_SKIPPED')
  assert(needsFinalDeltaDetail(unchangedUnsafe, { raw_listing_json: { ...unchangedUnsafe, commercial_state: { ...unchangedUnsafe.commercial_state, source: { ...unchangedUnsafe.commercial_state.source, original_price: '$19.99' } } }, detail_last_synced_at: nowIso() }, { nowMs: Date.now() }) === true, 'SELFTEST_FINAL_DELTA_CHANGED_UNSAFE_DETAIL')
  assert(needsFinalDeltaDetail({}, null) === true, 'SELFTEST_FINAL_DELTA_NEW_DETAIL')
  assert(buildCanonicalDiscountPageUrl(DISCOUNTS_URL, 1).includes('/us-store/discounts?') && !buildCanonicalDiscountPageUrl(DISCOUNTS_URL, 1).includes('page='), 'SELFTEST_DISCOUNTS_CANONICAL_PAGE_1')
  assert(buildCanonicalDiscountPageUrl(DISCOUNTS_URL, 2).includes('/us-store/discounts/2?') && parseCanonicalDiscountPage(buildCanonicalDiscountPageUrl(DISCOUNTS_URL, 2)) === 2, 'SELFTEST_DISCOUNTS_CANONICAL_PAGE_2')
  assert(buildCanonicalDiscountPageUrl(DISCOUNTS_URL, 225).includes('/us-store/discounts/225?') && parseCanonicalDiscountPage(buildCanonicalDiscountPageUrl(DISCOUNTS_URL, 225)) === 225, 'SELFTEST_DISCOUNTS_CANONICAL_PAGE_225')
  assert(typeof fetch === 'function', 'SELFTEST_FETCH_RUNTIME_MISSING')
  assert(typeof WebSocket === 'function', 'SELFTEST_WEBSOCKET_RUNTIME_MISSING')
  assertAllowedWriteRpc('apply_psdeals_ended_deals_v4')
  assertAllowedWriteRpc('enqueue_lobodeals_catalog_cache_refresh_v18')
  assertAllowedWriteRpc('enqueue_lobodeals_ended_demotion_v5')
  let blocked = false
  try { assertAllowedWriteRpc('refresh_catalog_public_cache_v15') } catch { blocked = true }
  assert(blocked, 'SELFTEST_V15_BLOCK')
  process.stdout.write(`${JSON.stringify({ self_test: true, operator_version: OPERATOR_VERSION, passed: true, incremental_recent_against_database: true, adopted_backlog_without_catalog_rescan: true, durable_page_checkpoints: true, durable_detail_chunk_checkpoints: true, durable_final_reconciliation_decision: true, empty_detail_queue_supported: true, runtime_fetch_available: true, runtime_websocket_available: true, explicit_429_pause: true, psdeals_english_language_gate: true, monthly_dynamic_official_source: true, safe_monthly_swap: true, demotion_v4_reconciliation: true, demotion_v5_async_runner_contract: true, certification_v4_runner_contract: true, cache_v17_runner_contract: true, cache_v18_async_runner_contract: true, unchanged_unsafe_detail_bounded: true, reused_snapshot_zero_detail: true, long_rpc_manual_recovery_adoption: true, cache_receipt_exact_count_postcheck: true, deferred_malformed_discount_insert_recovery: true, final_fresh_reconciliation_before_certification: true, monthly_candidate_prefix_lookup: true, final_delta_listing_first_policy: true, best_new_deals_preserved: true, canonical_discount_path_pagination: true, canonical_recent_path_pagination: true, recent_checkpoint_migration_without_catalog_rescan: true, cross_page_overlap_dedup_without_reset: true, exact_reported_total_required_before_demotion: true }, null, 2)}\n`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.has('self-test')) return selfTest()
  if (args.has('adapter-self-test')) return adapterIntegrationSelfTest(path.resolve(String(args.get('project-root') || DEFAULT_PROJECT_ROOT)))
  assert(args.get('execute') === EXECUTION_CONFIRMATION, 'EXECUTION_CONFIRMATION_MISSING')
  const projectRoot = path.resolve(String(args.get('project-root') || DEFAULT_PROJECT_ROOT))
  assert(await exists(path.join(projectRoot, 'package.json')), 'PROJECT_ROOT_INVALID')
  assert(await exists(path.join(projectRoot, 'node_modules')), 'NODE_MODULES_MISSING')
  await verifyInstalledOperatorManifest(projectRoot)
  await verifySourceBaseline(projectRoot)

  const operatorRoot = path.join(projectRoot, 'data', 'daily-operator-v1')
  const lockFile = path.join(operatorRoot, 'operator.lock')
  await acquireLock(lockFile)
  let activeFile = null

  try {
    const identity = await resolveRunIdentity(projectRoot)
    activeFile = identity.activeFile
    const runId = identity.runId
    const runRoot = path.join(projectRoot, 'data', 'cycles', runId)
    const artifactsDir = path.join(runRoot, 'artifacts')
    const evidenceDir = path.join(runRoot, 'evidence')
    const logsDir = path.join(runRoot, 'logs')
    const stateDir = path.join(runRoot, 'state')
    const stateFile = path.join(stateDir, 'daily-operator-state-v1.json')
    const logFile = path.join(logsDir, 'daily-operator.log')
    await Promise.all([
      fs.mkdir(artifactsDir, { recursive: true }),
      fs.mkdir(evidenceDir, { recursive: true }),
      fs.mkdir(logsDir, { recursive: true }),
      fs.mkdir(stateDir, { recursive: true }),
    ])
    if (!(await exists(logFile))) await writeAtomic(logFile, '')
    else fsSync.appendFileSync(logFile, `\n\n=== REANUDACIÓN ${nowIso()} ===\n`)
    const log = (message = '') => {
      const line = `${message}\n`
      process.stdout.write(line)
      fsSync.appendFileSync(logFile, line)
    }

    log('============================================================')
    log('LOBODEALS — DAILY RUNNER V2')
    log(`Run ID: ${runId}`)
    log(`Reanudando run incompleto: ${identity.resumedExistingRun === true}`)
    log(`Inicio/reanudación: ${nowIso()}`)
    log('============================================================')

    const admin = await createSupabase(projectRoot)
    const codeHead = await gitHead(projectRoot)
    const requireFromProject = async (relative) => import(`${pathToFileURL(path.join(projectRoot, ...relative.split('/'))).href}?daily=${Date.now()}`)
    const listingAdapter = await requireFromProject('scripts/lib/psdeals-listing-upsert-adapter.mjs')
    const fastModule = await requireFromProject('scripts/lib/psdeals-fast-refresh.mjs')
    const analyzerModule = await requireFromProject('scripts/analyze-psdeals-discounts-fast-refresh-v1.mjs')
    const evidenceRuntime = await requireFromProject('scripts/lib/psdeals-evidence-runtime.mjs')
    const evidenceProducers = await requireFromProject('scripts/lib/psdeals-evidence-producers.mjs')
    const evidenceEnvelope = await requireFromProject('scripts/lib/psdeals-evidence-envelope.mjs')
    const modules = { ...analyzerModule, ...evidenceRuntime, ...evidenceProducers, ...evidenceEnvelope }

    let state = await exists(stateFile) ? await readJson(stateFile) : {
      state_version: STATE_VERSION,
      operator_version: OPERATOR_VERSION,
      run_id: runId,
      initial_mode: identity.initialMode,
      project_ref: PROJECT_REF,
      status: 'running',
      started_at: nowIso(),
      cycle_date: dateInLima(nowIso()),
      run_token: randomToken(),
      code_revision: codeHead,
      steps: {},
      receipts: {},
      files: {},
      metrics: {},
      timestamps: {},
    }
    assert(state.state_version === STATE_VERSION && state.operator_version === OPERATOR_VERSION && state.run_id === runId, 'STATE_IDENTITY_MISMATCH')
    assert(state.code_revision === codeHead, `STATE_CODE_REVISION_CHANGED:${state.code_revision}:${codeHead}`)
    state.status = 'running'
    state.last_error = null
    const saveState = async () => writeJsonAtomic(stateFile, state)
    await saveState()

    const step = async (name, fn) => {
      if (state.steps[name]?.status === 'done') {
        log(`[REANUDAR] ${name}: ya completado.`)
        return state.steps[name].result
      }
      state.steps[name] = { status: 'running', started_at: state.steps[name]?.started_at || nowIso() }
      await saveState()
      log(`\n=== ${name.toUpperCase()} ===`)
      try {
        const result = await fn()
        state.steps[name] = { ...state.steps[name], status: 'done', finished_at: nowIso(), result }
        await saveState()
        return result
      } catch (error) {
        state.steps[name] = {
          ...state.steps[name],
          status: 'failed',
          finished_at: nowIso(),
          error: error instanceof Error ? error.message : String(error),
        }
        state.status = 'blocked'
        state.last_error = state.steps[name].error
        await saveState()
        throw error
      }
    }

    const rpc = async (name, parameters) => {
      assertAllowedWriteRpc(name)
      const { data, error } = await admin.rpc(name, parameters)
      if (error) throw new Error(`${name}:${error.message}`)
      return data
    }

    const readActiveMonthly = async () => {
      const { data, error } = await admin.from('ps_plus_monthly_games')
        .select('id,item_id,month_key,title,is_active,active_from,active_until,source_url,updated_at')
        .eq('is_active', true)
      if (error) throw new Error(`MONTHLY_ACTIVE_READ:${error.message}`)
      return data || []
    }

    const preflight = await step('remote_readonly_preflight', async () => {
      await verifyNoForeignCycle(admin, runId)
      const { count: stageCount, error: stageError } = await admin.from('psdeals_stage_items')
        .select('id', { count: 'exact', head: true }).eq('region_code', 'us').eq('storefront', 'playstation')
      if (stageError) throw new Error(`STAGE_COUNT:${stageError.message}`)
      const { count: cacheCount, error: cacheError } = await admin.from('catalog_public_cache')
        .select('id', { count: 'exact', head: true })
      if (cacheError) throw new Error(`CACHE_COUNT:${cacheError.message}`)
      const monthlyRows = await readActiveMonthly()
      const { data: runnerContractsData, error: runnerContractsError } = await admin.rpc('lobodeals_daily_runner_v2_preflight')
      if (runnerContractsError) throw new Error(`DAILY_RUNNER_V2_DB_CONTRACTS_MISSING:${runnerContractsError.message}`)
      const runnerContracts = firstRow(runnerContractsData)
      assert(
        Number(runnerContracts?.contract_version) === 2 &&
        runnerContracts?.certify_v4_present === true &&
        runnerContracts?.cache_v17_present === true &&
        runnerContracts?.listing_stamp_index_present === true,
        `DAILY_RUNNER_V2_DB_CONTRACTS_INVALID:${JSON.stringify(runnerContracts)}`
      )
      assert(Number.isSafeInteger(stageCount) && stageCount > 0 && Number.isSafeInteger(cacheCount) && cacheCount > 0, 'REMOTE_TABLE_COUNTS_INVALID')
      return { stage_rows: stageCount, cache_rows: cacheCount, monthly_active_count: monthlyRows.length, runner_contracts: runnerContracts, checked_at: nowIso() }
    })

    let endpoint = state.edge?.websocket_debugger_url || await step('edge_preflight', async () => ({
      websocket_debugger_url: await launchEdge(projectRoot, RECENT_URL, logFile),
    })).then((value) => value.websocket_debugger_url)
    state.edge = { port: EDGE_PORT, websocket_debugger_url: endpoint, checked_at: nowIso() }
    await saveState()
    endpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: RECENT_URL, reason: 'preflight inicial', log, logFile })

    let backlog = { missing_items: [], all_artifact_ids: [] }
    let backlogSummary = { missing_count: 0 }
    if (identity.initialMode) {
      const backlogRef = await step('adopt_verified_initial_backlog', async () => {
        const value = await loadInitialBacklog(projectRoot, admin)
        const runtimeFile = path.join(stateDir, 'initial-backlog', 'runtime.json')
        await writeJsonAtomic(runtimeFile, {
          artifact_listing_file: portable(projectRoot, value.listingFile),
          artifact_listing_hash: INITIAL_ARTIFACTS.listing.sha256,
          artifact_queue_file: portable(projectRoot, value.queueFile),
          artifact_queue_hash: INITIAL_ARTIFACTS.queue.sha256,
          source_unique_items: value.items.length,
          source_queue_items: value.queuedItems.length,
          missing_items: value.missing,
          all_artifact_ids: [...value.allArtifactIds].sort((a, b) => a - b),
          verified_at: nowIso(),
        })
        const ref = await createJsonReference(projectRoot, runtimeFile, 'INITIAL_BACKLOG_RUNTIME')
        return { ...ref, missing_count: value.missing.length, artifact_unique_count: value.items.length }
      })
      backlog = await readVerifiedJson(resolvePortable(projectRoot, backlogRef.file), backlogRef.hash, 'INITIAL_BACKLOG_RUNTIME')
      backlogSummary = backlogRef
    }

    const recentRef = await step('collect_recently_added_incremental', async () => {
      const checkpoint = await collectRecentIncremental({
        projectRoot,
        admin,
        endpoint,
        runRoot,
        state,
        saveState,
        knownArtifactIds: new Set(backlog.all_artifact_ids || []),
        log,
        logFile,
      })
      const checkpointFile = path.join(runRoot, 'state', 'recently-added', 'checkpoint.json')
      const ref = await createJsonReference(projectRoot, checkpointFile, 'RECENT_CHECKPOINT')
      return {
        ...ref,
        missing_count: checkpoint.missing_items.length,
        pages_checked: checkpoint.page_summaries.length,
        last_successful_page: checkpoint.last_successful_page,
        stop_reason: checkpoint.stop_reason,
      }
    })
    const recent = await readVerifiedJson(resolvePortable(projectRoot, recentRef.file), recentRef.hash, 'RECENT_CHECKPOINT')
    let recentMissingItems = mergeBacklogAndFresh(backlog.missing_items || [], recent.missing_items || [])

    endpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: DISCOUNTS_URL, reason: 'inicio del listado de descuentos', log, logFile })
    const discountsRef = await step('collect_discounts_complete', async () => {
      const checkpoint = await collectDiscountsComplete({ projectRoot, endpoint, runRoot, state, saveState, log, logFile })
      const checkpointFile = path.join(runRoot, 'state', 'discounts-listing', 'checkpoint.json')
      const ref = await createJsonReference(projectRoot, checkpointFile, 'DISCOUNTS_CHECKPOINT')
      return {
        ...ref,
        item_count: checkpoint.items.length,
        pages_checked: checkpoint.page_summaries.length,
        last_successful_page: checkpoint.last_successful_page,
        stop_reason: checkpoint.stop_reason,
      }
    })
    let discounts = await readVerifiedJson(resolvePortable(projectRoot, discountsRef.file), discountsRef.hash, 'DISCOUNTS_CHECKPOINT')

    const recentLanguageAudit = auditPsDealsListingLanguage(recent.items || recent.missing_items || [])
    const discountsLanguageAudit = auditPsDealsListingLanguage(discounts.items || [])
    state.language_guard ||= {}
    state.language_guard.audit_version = 1
    state.language_guard.legacy_spanish_listing_detected = recentLanguageAudit.spanish_count > 0 || discountsLanguageAudit.spanish_count > 0
    state.language_guard.legacy_listing_audit = {
      checked_at: nowIso(),
      recently_added: recentLanguageAudit,
      discounts: discountsLanguageAudit,
    }
    await saveState()
    if (state.language_guard.legacy_spanish_listing_detected) {
      log(`[AUDITORÍA IDIOMA] Se detectó listing previamente guardado en español: recent=${recentLanguageAudit.spanish_count}, descuentos=${discountsLanguageAudit.spanish_count}. Se conserva por trazabilidad; desde V1.26 toda navegación nueva exige English.`)
    }

    let discountArtifacts = await step('finalize_discount_listing_artifacts', async () => {
      const lastCollected = [...(discounts.page_summaries || [])].reverse().find((row) => validIso(row.collected_at))?.collected_at
      const listingObservedAt = await stableTimestamp(state, saveState, 'discount_listing_observed_at', [state.started_at, lastCollected])
      const discountsJson = path.join(artifactsDir, 'discounts-complete.json')
      const discountsTxt = path.join(artifactsDir, 'discounts-complete.txt')
      await writeJsonAtomic(discountsJson, {
        collected_at: listingObservedAt,
        base_url: DISCOUNTS_URL,
        pages_processed: discounts.page_summaries.length,
        pages_failed: 0,
        failed_pages: [],
        stop_reason: discounts.stop_reason,
        total_results_detected: discounts.items.length,
        unique_items_collected: discounts.items.length,
        page_summaries: discounts.page_summaries,
        items: discounts.items,
      })
      await writeAtomic(discountsTxt, discounts.items.length ? `${discounts.items.map((item) => item.psdeals_url).filter(Boolean).join('\n')}\n` : '')
      return {
        json_file: portable(projectRoot, discountsJson),
        json_hash: await sha256File(discountsJson),
        txt_file: portable(projectRoot, discountsTxt),
        txt_hash: await sha256File(discountsTxt),
        listing_observed_at: listingObservedAt,
        items_seen: discounts.items.length,
      }
    })
    let discountsJson = resolvePortable(projectRoot, discountArtifacts.json_file)
    let discountsTxt = resolvePortable(projectRoot, discountArtifacts.txt_file)
    let listingHash = discountArtifacts.json_hash

    let monthly = await step('read_official_monthly_games', async () => officialMonthlyReview(log))

    let listingEvidenceRef = await step('build_discount_listing_evidence', async () => {
      const discountsEvidence = path.join(evidenceDir, 'discounts-listing-collection.json')
      const listingOutputs = [
        await modules.referencePsdealsFile({ project_root: projectRoot, file_path: discountsJson, role: 'listing_json', artifact_kind: 'listing_json' }),
        await modules.referencePsdealsFile({ project_root: projectRoot, file_path: discountsTxt, role: 'listing_urls', artifact_kind: 'url_queue' }),
      ]
      const envelope = modules.buildListingCollectionEvidence({
        identity: { local_cycle_id: runId, run_token: state.run_token, remote_cycle_id: null, region_code: 'us', storefront: 'playstation', mode: 'real_recorded' },
        producer: { name: 'lobodeals-daily-operator-v1', version: String(OPERATOR_VERSION), code_revision: state.code_revision },
        timestamps: {
          started_at: discounts.created_at || state.started_at,
          finished_at: discountArtifacts.listing_observed_at,
          generated_at: discountArtifacts.listing_observed_at,
        },
        context: {
          requested_url: DISCOUNTS_URL,
          platforms: ['ps5', 'ps4'],
          content_types: ['games', 'bundles', 'dlc'],
          order: 'best-new-deals',
          limits: { pages: DISCOUNT_SAFETY_CAP },
        },
        outputs: listingOutputs,
        collection: {
          pages_requested: DISCOUNT_SAFETY_CAP,
          pages_completed: discounts.page_summaries.length,
          failed_pages: [],
          termination: normalizeListingEvidenceTermination(discounts.stop_reason),
          stop_reason: discounts.stop_reason,
          total_results_detected: discounts.items.length,
          total_collected: discounts.items.length,
          unique_ids: discounts.items.length,
          duplicate_ids: 0,
          partial_artifact_present: false,
        },
      })
      await fs.rm(discountsEvidence, { force: true })
      await modules.emitPsdealsProducerEvidence({ output_path: discountsEvidence, envelope })
      const evidence = await readJson(discountsEvidence)
      assert(evidence.status === 'succeeded' && evidence.payload?.collection_result === 'complete', 'DISCOUNTS_EVIDENCE_NOT_COMPLETE')
      return {
        file: portable(projectRoot, discountsEvidence),
        hash: await sha256File(discountsEvidence),
        fingerprint: evidence.context?.fingerprint,
      }
    })
    let discountsEvidence = resolvePortable(projectRoot, listingEvidenceRef.file)
    const listingEvidence = await readVerifiedJson(discountsEvidence, listingEvidenceRef.hash, 'DISCOUNT_LISTING_EVIDENCE')
    assert(/^[a-f0-9]{64}$/.test(String(listingEvidenceRef.fingerprint || '')), 'DISCOUNT_FILTER_FINGERPRINT_INVALID')

    const endedPreRef = await step('analyze_ended_readonly_before_writes', async () => {
      const outputJson = path.join(artifactsDir, 'ended-pre.json')
      const outputTxt = path.join(artifactsDir, 'ended-pre.txt')
      const evidenceFile = path.join(evidenceDir, 'ended-pre.json')
      await Promise.all([fs.rm(outputJson, { force: true }), fs.rm(outputTxt, { force: true }), fs.rm(evidenceFile, { force: true })])
      await runChild(process.execPath, [
        'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs',
        `--discounts-json=${portable(projectRoot, discountsJson)}`,
        `--output-txt=${portable(projectRoot, outputTxt)}`,
        `--output-json=${portable(projectRoot, outputJson)}`,
        `--listing-evidence=${portable(projectRoot, discountsEvidence)}`,
        '--sample-limit=20',
        `--local-cycle-id=${runId}`,
        `--run-token=${state.run_token}`,
        `--evidence-output=${portable(projectRoot, evidenceFile)}`,
        `--code-revision=${state.code_revision}`,
        '--producer-version=1',
        '--evidence-mode=real_recorded',
      ], { cwd: projectRoot, label: 'ENDED_PRE_ANALYSIS', logFile })
      const payload = await readJson(outputJson)
      return {
        output_file: portable(projectRoot, outputJson),
        output_hash: await sha256File(outputJson),
        evidence_file: portable(projectRoot, evidenceFile),
        evidence_hash: await sha256File(evidenceFile),
        safe_candidates: (payload.ended_discount_candidates || []).length,
        blocked_candidates: (payload.blocked_discount_candidates || []).length,
      }
    })
    const endedPre = await readVerifiedJson(resolvePortable(projectRoot, endedPreRef.output_file), endedPreRef.output_hash, 'ENDED_PRE_ANALYSIS')

    const executionPlanRef = await step('prepare_readonly_execution_plan', async () => {
      const discountIds = discounts.items.map((item) => Number(item.psdeals_id))
      const discountDbRows = await fetchExistingRows(admin, discountIds, 'id,psdeals_id,title,psdeals_slug,psdeals_url,content_type,item_type_label,platforms,current_price_amount,original_price_amount,discount_percent,deal_ends_at,is_ps_plus_discount,listing_last_seen_at,detail_last_synced_at,raw_listing_json,raw_detail_json')
      const discountDbById = new Map(discountDbRows.map((row) => [Number(row.psdeals_id), row]))
      const analyzedDiscounts = discounts.items.map((item) => ({
        listing: item,
        db: discountDbById.get(Number(item.psdeals_id)) || null,
        ...fastModule.classifyFastRefreshItem(item, discountDbById.get(Number(item.psdeals_id)) || null),
      }))
      const generatedAt = await stableTimestamp(state, saveState, 'readonly_plan_generated_at', [discountArtifacts.listing_observed_at])
      const selected = fastModule.selectFastRefreshQueues(analyzedDiscounts, {
        staleLimit: 2,
        staleHours: 24,
        psPlusRecheckLimit: 3,
        nowMs: Date.parse(generatedAt),
      })
      const endedCandidateRows = [...(endedPre.ended_discount_candidates || []), ...(endedPre.blocked_discount_candidates || [])]
      const endedCandidateIds = canonicalCandidateIds(endedCandidateRows.map((candidate) => Number(candidate.psdeals_id)))
      // Daily Runner v2 listing-first policy: known safe commercial mismatches
      // are written from the complete listing and do not require Detail.
      // Detail is reserved for new IDs, unsafe/PS+ signals and the tiny bounded
      // PS+/stale rotation. Ended candidates are revalidated transactionally by
      // the demotion RPC and are not reopened wholesale every daily run.
      const requiredMustRefresh = selected.mustRefresh.filter((row) =>
        needsFinalDeltaDetail(row.listing, row.db, { nowMs: Date.parse(generatedAt) })
      )
      const detailItems = mergeBacklogAndFresh(recentMissingItems, [
        ...requiredMustRefresh.map((row) => row.listing),
        ...selected.psPlusRecheckCandidates.map((row) => row.listing),
        ...selected.staleCandidates.map((row) => row.listing),
      ])

      const prospectiveMonthlyCandidates = await fetchMonthlyCandidates(admin, monthly, recentMissingItems)
      const prospectiveMonthlyResolution = resolveMonthlyGames(monthly, prospectiveMonthlyCandidates)
      assert(prospectiveMonthlyResolution.resolved, `MONTHLY_MAPPING_AMBIGUOUS:${JSON.stringify(prospectiveMonthlyResolution.resolutions.map((row) => ({ title: row.official.title, candidates: row.candidates })))}`)

      const detailQueueFile = path.join(artifactsDir, 'detail-queue-combined.txt')
      await writeAtomic(detailQueueFile, `${detailItems.map((item) => item.psdeals_url).join('\n')}\n`)
      const planFile = path.join(artifactsDir, 'READ-ONLY-PLAN-BEFORE-WRITES.json')
      await writeJsonAtomic(planFile, {
        plan_version: 1,
        generated_at: generatedAt,
        run_id: runId,
        initial_mode: identity.initialMode,
        database_before: { stage_rows: preflight.stage_rows, cache_rows: preflight.cache_rows },
        initial_backlog_missing_now: backlogSummary.missing_count || 0,
        fresh_recent_pages_checked: recent.page_summaries.length,
        fresh_recent_missing: recent.missing_items.length,
        total_recent_missing_to_create: recentMissingItems.length,
        recent_missing_items: recentMissingItems,
        discounts_pages: discounts.page_summaries.length,
        discounts_items: discounts.items.length,
        detail_queue_items: detailItems.length,
        detail_items: detailItems,
        listing_first_safe_must_refresh_skipped_from_detail: selected.mustRefresh.length - requiredMustRefresh.length,
        ended_candidates_not_reopened_wholesale: endedCandidateIds.length,
        ended_safe_candidates_before_revalidation: (endedPre.ended_discount_candidates || []).length,
        ended_blocked_candidates_before_revalidation: (endedPre.blocked_discount_candidates || []).length,
        monthly,
        monthly_resolution: prospectiveMonthlyResolution,
        writes_executed_at_plan_time: 0,
        restrictions: {
          demotion_rpc: 'apply_psdeals_ended_deals_v3',
          certification_rpc: 'certify_price_refresh_cycle_v4',
          cache_rpc: 'enqueue_lobodeals_catalog_cache_refresh_v18',
          v1_demotion_forbidden: true,
          cache_v15_forbidden: true,
        },
      })
      return {
        file: portable(projectRoot, planFile),
        hash: await sha256File(planFile),
        detail_queue_file: portable(projectRoot, detailQueueFile),
        detail_queue_hash: await sha256File(detailQueueFile),
        recent_missing_count: recentMissingItems.length,
        detail_queue_count: detailItems.length,
        discount_items: discounts.items.length,
        ended_candidates: endedCandidateRows.length,
      }
    })
    const executionPlan = await readVerifiedJson(resolvePortable(projectRoot, executionPlanRef.file), executionPlanRef.hash, 'READONLY_EXECUTION_PLAN')
    const detailItems = executionPlan.detail_items
    assert(Array.isArray(detailItems) && detailItems.length === executionPlanRef.detail_queue_count, 'DETAIL_QUEUE_PLAN_MISMATCH')

    log('')
    log('================ PLAN EN SECO ANTES DE ESCRIBIR ================')
    log(`Stage/Cache actuales: ${executionPlan.database_before.stage_rows}/${executionPlan.database_before.cache_rows}`)
    log(`Atraso verificado aún ausente: ${executionPlan.initial_backlog_missing_now}`)
    log(`Recently Added fresco: ${executionPlan.fresh_recent_pages_checked} páginas; ${executionPlan.fresh_recent_missing} ausentes nuevos`)
    log(`Fichas nuevas totales: ${executionPlan.total_recent_missing_to_create}`)
    log(`Descuentos: ${executionPlan.discounts_items} artículos en ${executionPlan.discounts_pages} páginas completas`)
    log(`Cola de detalles/revalidación: ${executionPlan.detail_queue_items}`)
    log(`Candidatos a demote antes de confirmar: ${executionPlan.ended_safe_candidates_before_revalidation + executionPlan.ended_blocked_candidates_before_revalidation}`)
    log(`Monthly: ${monthly.month_key} — ${monthly.games.map((game) => game.title).join(', ')}`)
    log(`Plan: ${resolvePortable(projectRoot, executionPlanRef.file)}`)
    log('ESCRITURAS REMOTAS AL GENERAR ESTE PLAN: 0')
    log('================================================================')

    await step('create_remote_cycle', async () => {
      await verifyNoForeignCycle(admin, runId)
      state.manifest_hash ||= requestHash({
        operator_version: OPERATOR_VERSION,
        run_id: runId,
        code_revision: state.code_revision,
        listing_hash: listingHash,
        listing_evidence_hash: listingEvidenceRef.hash,
        monthly_source: monthly.source_url,
        execution_plan_hash: executionPlanRef.hash,
      })
      await saveState()
      const parameters = {
        p_local_cycle_id: runId,
        p_run_token_sha256: sha256(Buffer.from(state.run_token, 'utf8')),
        p_code_revision: state.code_revision,
        p_filter_fingerprint: listingEvidenceRef.fingerprint,
        p_manifest_hash: state.manifest_hash,
        p_mode: 'operational',
        p_region_code: 'us',
        p_storefront: 'playstation',
        p_cycle_date: state.cycle_date,
        p_started_at: state.started_at,
        p_idempotency_key: `create-cycle:${runId}`,
      }
      parameters.p_request_hash = requestHash(parameters)
      const row = firstRow(await rpc('create_or_reconcile_price_refresh_cycle_v1', parameters))
      assert(row?.cycle_id && row.receipt_status === 'committed', 'REMOTE_CYCLE_CREATE_NOT_COMMITTED')
      state.remote_cycle_id = row.cycle_id
      state.receipts.create_cycle = row.receipt_id
      await saveState()
      return { cycle_id: row.cycle_id, receipt_id: row.receipt_id, reconciled: row.reconciled === true }
    })

    await step('record_discount_listing_completion', async () => {
      const startedAt = await stableTimestamp(state, saveState, 'listing_receipt_started_at', [state.started_at])
      const finishedAt = await stableTimestamp(state, saveState, 'listing_receipt_finished_at', [startedAt, discountArtifacts.listing_observed_at])
      const parameters = {
        p_cycle_id: state.remote_cycle_id,
        p_idempotency_key: `listing-validation:${runId}`,
        p_listing_artifact_hash: listingHash,
        p_filter_fingerprint: listingEvidenceRef.fingerprint,
        p_listing_observed_at: discountArtifacts.listing_observed_at,
        p_items_seen: discounts.items.length,
        p_pages_failed: 0,
        p_duplicate_ids: 0,
        p_is_partial: false,
        p_termination_observed: true,
        p_started_at: startedAt,
        p_finished_at: finishedAt,
      }
      parameters.p_request_hash = requestHash(parameters)
      const row = firstRow(await rpc('record_psdeals_listing_completion_v1', parameters))
      assert(row?.status === 'committed', 'LISTING_COMPLETION_NOT_COMMITTED')
      state.receipts.listing_validation = row.id
      await saveState()
      return { receipt_id: row.id, items_seen: discounts.items.length, listing_observed_at: discountArtifacts.listing_observed_at }
    })

    const recentPlanRef = await step('prepare_recent_listing_upsert_plan', async () => {
      const lastRecentCollected = [...(recent.page_summaries || [])].reverse().find((row) => validIso(row.collected_at))?.collected_at
      const observedAt = await stableTimestamp(state, saveState, 'recent_listing_observed_at', [state.started_at, lastRecentCollected])
      const existing = await fetchExistingRows(admin, recentMissingItems.map((item) => Number(item.psdeals_id)))
      const prepared = listingAdapter.preparePsdealsListingUpsertBatches({
        listing_items: recentMissingItems,
        existing_psdeals_ids: existing.map((row) => Number(row.psdeals_id)),
        listing_observed_at: observedAt,
        batch_size: 100,
      })
      assert(prepared.omitted_count === 0, `RECENT_LISTING_OMITTED:${prepared.omitted_count}`)
      const file = path.join(artifactsDir, 'recent-listing-upsert-plan.json')
      await writeJsonAtomic(file, {
        plan_version: 1,
        listing_observed_at: observedAt,
        input_hash: executionPlanRef.hash,
        attempted: prepared.attempted,
        prepared: prepared.prepared,
        omitted_count: prepared.omitted_count,
        batches: prepared.batches,
      })
      return { file: portable(projectRoot, file), hash: await sha256File(file), batch_count: prepared.batches.length, row_count: prepared.prepared }
    })
    const recentPrepared = await readVerifiedJson(resolvePortable(projectRoot, recentPlanRef.file), recentPlanRef.hash, 'RECENT_UPSERT_PLAN')
    let recentUpsert = await step('upsert_recent_listing_batches', async () => upsertListingBatches({
      admin,
      rpc,
      state,
      saveState,
      prepared: recentPrepared,
      parentReceiptId: state.receipts.listing_validation,
      label: 'recent',
      inputHash: recentPlanRef.hash,
      log,
    }))

    const discountPlanRef = await step('prepare_discount_listing_upsert_plan', async () => {
      const discountIds = discounts.items.map((item) => parsePsdealsId(item?.psdeals_id ?? item?.psdeals_url)).filter(Boolean)
      const existing = await fetchExistingRows(
        admin,
        discountIds,
        'id,psdeals_id,psdeals_slug,psdeals_url,title',
      )
      const hydrated = hydrateListingIdentityFromExistingRows(discounts.items, existing)
      const prepared = listingAdapter.preparePsdealsListingUpsertBatches({
        listing_items: hydrated.items,
        existing_psdeals_ids: existing.map((row) => Number(row.psdeals_id)),
        listing_observed_at: discountArtifacts.listing_observed_at,
        certification_context: { remote_cycle_id: state.remote_cycle_id, evidence_sha256: listingHash },
        batch_size: 100,
      })
      const recovery = planDeferredListingInsertRecovery({
        prepared,
        listingItems: hydrated.items,
        detailItems,
        maxDeferred: 20,
      })
      assert(
        recovery.recoverable,
        `DISCOUNT_LISTING_UNSAFE_OMISSIONS:${recovery.unsafe_count}:${JSON.stringify(recovery.unsafe.slice(0, 10))}`,
      )
      const coverage = assertExactListingBatchCoverage(prepared, recovery.primary_items)
      assert(
        coverage.prepared_count + recovery.deferred_count === discounts.items.length,
        `DISCOUNT_LISTING_TOTAL_COVERAGE_INVALID:${coverage.prepared_count}:${recovery.deferred_count}:${discounts.items.length}`,
      )
      const file = path.join(artifactsDir, 'discount-listing-upsert-plan.json')
      await writeJsonAtomic(file, {
        plan_version: 3,
        remote_cycle_id: state.remote_cycle_id,
        listing_observed_at: discountArtifacts.listing_observed_at,
        listing_hash: listingHash,
        attempted: prepared.attempted,
        prepared: prepared.prepared,
        omitted_count: prepared.omitted_count,
        omitted: prepared.omitted || [],
        deferred_count: recovery.deferred_count,
        deferred_items: recovery.deferred,
        existing_rows_found: existing.length,
        identity_repair_count: hydrated.repair_count,
        identity_repairs: hydrated.repairs,
        coverage,
        batches: prepared.batches,
      })
      log(`[PLAN UPSERT DESCUENTOS] inmediatas=${coverage.prepared_count}/${discounts.items.length}; diferidas a detalle=${recovery.deferred_count}; identidades rehidratadas=${hydrated.repair_count}; existentes=${existing.length}.`)
      return {
        file: portable(projectRoot, file),
        hash: await sha256File(file),
        batch_count: prepared.batches.length,
        row_count: prepared.prepared,
        deferred_count: recovery.deferred_count,
        identity_repair_count: hydrated.repair_count,
        existing_rows_found: existing.length,
      }
    })
    const discountPrepared = await readVerifiedJson(resolvePortable(projectRoot, discountPlanRef.file), discountPlanRef.hash, 'DISCOUNT_UPSERT_PLAN')
    assert(discountPrepared.remote_cycle_id === state.remote_cycle_id, 'DISCOUNT_UPSERT_PLAN_CYCLE_MISMATCH')
    assert(discountPrepared.listing_observed_at === discountArtifacts.listing_observed_at, 'DISCOUNT_UPSERT_PLAN_TIMESTAMP_MISMATCH')
    let discountUpsert = await step('upsert_discount_listing_batches', async () => upsertListingBatches({
      admin,
      rpc,
      state,
      saveState,
      prepared: discountPrepared,
      parentReceiptId: state.receipts.listing_validation,
      label: 'discounts',
      inputHash: listingHash,
      log,
    }))

    const fastReceipt = await step('record_detail_queue_analysis', async () => recordAction({
      rpc,
      state,
      saveState,
      actionKind: 'fast_refresh_analysis',
      parentReceiptId: state.receipts.listing_validation,
      idempotencyKey: `fast-refresh:${runId}:${executionPlanRef.detail_queue_hash}`,
      inputHash: listingHash,
      execute: async () => ({
        affected_rows: detailItems.length,
        combined_count: detailItems.length,
        overlap_count: 0,
        combined_artifact_hash: executionPlanRef.detail_queue_hash,
      }),
    }))
    state.receipts.fast_refresh = fastReceipt.receipt_id
    await saveState()

    if (detailItems.length > 0) {
      endpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: RECENT_URL, reason: 'inicio de fichas individuales', log, logFile })
    }
    let details = await step('process_detail_queue_with_checkpoints', async () => processDetailChunks({
      projectRoot,
      runRoot,
      state,
      saveState,
      rpc,
      modules,
      endpoint,
      detailItems,
      detailQueueHash: executionPlanRef.detail_queue_hash,
      parentReceiptId: state.receipts.fast_refresh,
      log,
      logFile,
    }))
    assert(details.item_count === detailItems.length && details.receipts.length > 0, 'DETAIL_COMPLETION_INVALID')
    let detailsCompletedAt = await stableTimestamp(state, saveState, 'details_completed_at', [discountArtifacts.listing_observed_at])

    const deferredDiscountPlanRef = await step('prepare_deferred_discount_listing_after_details', async () => {
      const deferred = Array.isArray(discountPrepared.deferred_items) ? discountPrepared.deferred_items : []
      const file = path.join(artifactsDir, 'discount-listing-deferred-upsert-plan.json')
      if (deferred.length === 0) {
        await writeJsonAtomic(file, { plan_version: 1, deferred_count: 0, batches: [], coverage: { expected_count: 0, prepared_count: 0 } })
        return { file: portable(projectRoot, file), hash: await sha256File(file), deferred_count: 0, row_count: 0 }
      }
      const ids = deferred.map((row) => Number(row.psdeals_id))
      const stageRows = await fetchExistingRows(admin, ids, 'id,psdeals_id,psdeals_slug,psdeals_url,title,listing_last_seen_at,detail_last_synced_at')
      const byId = new Map(stageRows.map((row) => [Number(row.psdeals_id), row]))
      const missingAfterDetail = ids.filter((id) => !byId.has(id))
      assert(missingAfterDetail.length === 0, `DEFERRED_DISCOUNT_DETAIL_DID_NOT_CREATE:${missingAfterDetail.join(',')}`)
      const incomplete = stageRows.filter((row) => !String(row.title || '').trim() || !String(row.psdeals_slug || '').trim() || !String(row.psdeals_url || '').trim())
      assert(incomplete.length === 0, `DEFERRED_DISCOUNT_STAGE_IDENTITY_INCOMPLETE:${incomplete.map((row) => row.psdeals_id).join(',')}`)
      const hydrated = hydrateListingIdentityFromExistingRows(deferred.map((row) => row.item), stageRows)
      const prepared = listingAdapter.preparePsdealsListingUpsertBatches({
        listing_items: hydrated.items,
        existing_psdeals_ids: ids,
        listing_observed_at: discountArtifacts.listing_observed_at,
        certification_context: { remote_cycle_id: state.remote_cycle_id, evidence_sha256: listingHash },
        batch_size: 100,
      })
      assert(prepared.omitted_count === 0, `DEFERRED_DISCOUNT_LISTING_STILL_OMITTED:${prepared.omitted_count}:${JSON.stringify((prepared.omitted || []).slice(0, 10))}`)
      const coverage = assertExactListingBatchCoverage(prepared, hydrated.items)
      await writeJsonAtomic(file, {
        plan_version: 1,
        deferred_count: deferred.length,
        listing_observed_at: discountArtifacts.listing_observed_at,
        stage_rows_found: stageRows.length,
        identity_repair_count: hydrated.repair_count,
        identity_repairs: hydrated.repairs,
        coverage,
        batches: prepared.batches,
      })
      return { file: portable(projectRoot, file), hash: await sha256File(file), deferred_count: deferred.length, row_count: prepared.prepared }
    })
    const deferredDiscountPrepared = await readVerifiedJson(resolvePortable(projectRoot, deferredDiscountPlanRef.file), deferredDiscountPlanRef.hash, 'DEFERRED_DISCOUNT_UPSERT_PLAN')
    let deferredDiscountUpsert = await step('upsert_deferred_discount_listing_batches', async () => upsertListingBatches({
      admin,
      rpc,
      state,
      saveState,
      prepared: deferredDiscountPrepared,
      parentReceiptId: state.receipts.listing_validation,
      label: 'discounts-deferred',
      inputHash: listingHash,
      log,
    }))

    await step('verify_discount_listing_stage_stamp', async () => {
      const ids = discounts.items.map((item) => Number(item.psdeals_id))
      const rows = await fetchExistingRows(admin, ids, 'psdeals_id,title,psdeals_slug,psdeals_url,listing_last_seen_at')
      const expectedAt = Date.parse(discountArtifacts.listing_observed_at)
      const byId = new Map(rows.map((row) => [Number(row.psdeals_id), row]))
      const missing = ids.filter((id) => !byId.has(id))
      const unstamped = rows.filter((row) => Date.parse(row.listing_last_seen_at || '') !== expectedAt).map((row) => Number(row.psdeals_id))
      const incomplete = rows.filter((row) => !String(row.title || '').trim() || !String(row.psdeals_slug || '').trim() || !String(row.psdeals_url || '').trim()).map((row) => Number(row.psdeals_id))
      assert(missing.length === 0, `DISCOUNT_STAGE_FINAL_MISSING:${missing.slice(0, 20).join(',')}`)
      assert(unstamped.length === 0, `DISCOUNT_STAGE_FINAL_STAMP_MISMATCH:${unstamped.slice(0, 20).join(',')}`)
      assert(incomplete.length === 0, `DISCOUNT_STAGE_FINAL_IDENTITY_INCOMPLETE:${incomplete.slice(0, 20).join(',')}`)
      assert(rows.length === discounts.items.length, `DISCOUNT_STAGE_FINAL_COUNT_MISMATCH:${rows.length}:${discounts.items.length}`)
      return { verified: true, rows: rows.length, listing_observed_at: discountArtifacts.listing_observed_at }
    })


    // V1.24: si el ciclo dura varios días, toma una fotografía fresca antes de cerrar.
    // Los slugs se reservan para IDs nuevos o señales explícitamente inseguras/PS Plus.
    const finalReconcileRoot = path.join(runRoot, 'final-fresh-reconcile-v118')
    await fs.mkdir(finalReconcileRoot, { recursive: true })
    const finalReconciliationDecision = await step('decide_final_reconciliation_mode_v127', async () => {
      const decidedAt = await stableTimestamp(
        state,
        saveState,
        'final_reconciliation_decided_at_v127',
        [discountArtifacts.listing_observed_at],
      )
      return buildFinalReconciliationDecision({
        initialListingObservedAt: discountArtifacts.listing_observed_at,
        decidedAt,
        maxAgeMs: FINAL_FRESH_RECONCILE_MAX_AGE_MS,
      })
    })
    const finalFreshRequired = finalReconciliationDecision.final_fresh_required
    const initialListingAgeMs = finalReconciliationDecision.initial_listing_age_ms_at_decision
    if (!finalFreshRequired) {
      log(`[RECONCILIACIÓN FINAL V2] snapshot inicial aún fresco (${Math.round(initialListingAgeMs / 60000)} min < ${FINAL_FRESH_RECONCILE_MAX_AGE_MS / 60000} min); se reutiliza y no se repiten Recently Added/Discounts.`)
    }

    const finalRecentRef = await step('collect_final_recently_added_incremental_v122', async () => {
      if (!finalFreshRequired) return { ...recentRef, reused_initial_snapshot: true }
      const checkpoint = await collectRecentIncremental({
        projectRoot, admin, endpoint, runRoot: finalReconcileRoot, state, saveState,
        knownArtifactIds: new Set(), log, logFile,
      })
      const checkpointFile = path.join(finalReconcileRoot, 'state', 'recently-added', 'checkpoint.json')
      const ref = await createJsonReference(projectRoot, checkpointFile, 'FINAL_RECENT_CHECKPOINT_V122')
      return { ...ref, missing_count: checkpoint.missing_items.length, pages_checked: checkpoint.page_summaries.length, last_successful_page: checkpoint.last_successful_page, stop_reason: checkpoint.stop_reason, reused_initial_snapshot: false }
    })
    assertFinalReconciliationReferenceMode(finalReconciliationDecision, finalRecentRef, 'final_recent_collection')
    const finalRecent = await readVerifiedJson(resolvePortable(projectRoot, finalRecentRef.file), finalRecentRef.hash, 'FINAL_RECENT_CHECKPOINT_V122')

    if (finalFreshRequired) {
      endpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: DISCOUNTS_URL, reason: 'reconciliación final fresca de descuentos', log, logFile })
    }
    const finalDiscountsRef = await step('collect_final_discounts_complete_v118', async () => {
      if (!finalFreshRequired) return { ...discountsRef, reused_initial_snapshot: true }
      const checkpoint = await collectDiscountsComplete({ projectRoot, endpoint, runRoot: finalReconcileRoot, state, saveState, log, logFile })
      const checkpointFile = path.join(finalReconcileRoot, 'state', 'discounts-listing', 'checkpoint.json')
      const ref = await createJsonReference(projectRoot, checkpointFile, 'FINAL_DISCOUNTS_CHECKPOINT_V118')
      return { ...ref, item_count: checkpoint.items.length, pages_checked: checkpoint.page_summaries.length, last_successful_page: checkpoint.last_successful_page, stop_reason: checkpoint.stop_reason, reused_initial_snapshot: false }
    })
    assertFinalReconciliationReferenceMode(finalReconciliationDecision, finalDiscountsRef, 'final_discounts_collection')
    const finalDiscounts = await readVerifiedJson(resolvePortable(projectRoot, finalDiscountsRef.file), finalDiscountsRef.hash, 'FINAL_DISCOUNTS_CHECKPOINT_V118')
    const finalLanguageAudit = auditPsDealsListingLanguage(finalDiscounts.items || [])
    assert(finalLanguageAudit.spanish_count === 0, `FINAL_DISCOUNTS_LANGUAGE_SPANISH:${finalLanguageAudit.spanish_count}`)

    const finalDiscountArtifacts = await step('finalize_final_discount_listing_artifacts_v118', async () => {
      if (!finalFreshRequired) return { ...discountArtifacts, reused_initial_snapshot: true }
      const lastCollected = [...(finalDiscounts.page_summaries || [])].reverse().find((row) => validIso(row.collected_at))?.collected_at
      const listingObservedAt = await stableTimestamp(state, saveState, 'final_discount_listing_observed_at_v118', [detailsCompletedAt, lastCollected])
      const jsonFile = path.join(artifactsDir, 'discounts-final-fresh-v118.json')
      const txtFile = path.join(artifactsDir, 'discounts-final-fresh-v118.txt')
      await writeJsonAtomic(jsonFile, {
        collected_at: listingObservedAt, base_url: DISCOUNTS_URL, pages_processed: finalDiscounts.page_summaries.length,
        pages_failed: 0, failed_pages: [], stop_reason: finalDiscounts.stop_reason,
        total_results_detected: finalDiscounts.items.length, unique_items_collected: finalDiscounts.items.length,
        page_summaries: finalDiscounts.page_summaries, items: finalDiscounts.items,
      })
      await writeAtomic(txtFile, finalDiscounts.items.length ? `${finalDiscounts.items.map((item) => item.psdeals_url).filter(Boolean).join('\n')}\n` : '')
      return { json_file: portable(projectRoot, jsonFile), json_hash: await sha256File(jsonFile), txt_file: portable(projectRoot, txtFile), txt_hash: await sha256File(txtFile), listing_observed_at: listingObservedAt, items_seen: finalDiscounts.items.length, reused_initial_snapshot: false }
    })
    assertFinalReconciliationReferenceMode(finalReconciliationDecision, finalDiscountArtifacts, 'final_discounts_artifacts')
    const finalDiscountsJson = resolvePortable(projectRoot, finalDiscountArtifacts.json_file)
    const finalDiscountsTxt = resolvePortable(projectRoot, finalDiscountArtifacts.txt_file)
    const finalListingHash = finalDiscountArtifacts.json_hash

    const finalListingEvidenceRef = await step('build_final_discount_listing_evidence_v118', async () => {
      if (!finalFreshRequired) return { ...listingEvidenceRef, reused_initial_snapshot: true }
      const evidenceFile = path.join(evidenceDir, 'discounts-final-fresh-listing-v118.json')
      const outputs = [
        await modules.referencePsdealsFile({ project_root: projectRoot, file_path: finalDiscountsJson, role: 'listing_json', artifact_kind: 'listing_json' }),
        await modules.referencePsdealsFile({ project_root: projectRoot, file_path: finalDiscountsTxt, role: 'listing_urls', artifact_kind: 'url_queue' }),
      ]
      const envelope = modules.buildListingCollectionEvidence({
        identity: { local_cycle_id: runId, run_token: state.run_token, remote_cycle_id: null, region_code: 'us', storefront: 'playstation', mode: 'real_recorded' },
        producer: { name: 'lobodeals-daily-operator-v1', version: String(OPERATOR_VERSION), code_revision: state.code_revision },
        timestamps: { started_at: finalDiscounts.created_at || detailsCompletedAt, finished_at: finalDiscountArtifacts.listing_observed_at, generated_at: finalDiscountArtifacts.listing_observed_at },
        context: { requested_url: DISCOUNTS_URL, platforms: ['ps5', 'ps4'], content_types: ['games', 'bundles', 'dlc'], order: 'best-new-deals', limits: { pages: DISCOUNT_SAFETY_CAP } },
        outputs,
        collection: {
          pages_requested: DISCOUNT_SAFETY_CAP, pages_completed: finalDiscounts.page_summaries.length, failed_pages: [],
          termination: normalizeListingEvidenceTermination(finalDiscounts.stop_reason), stop_reason: finalDiscounts.stop_reason,
          total_results_detected: finalDiscounts.items.length, total_collected: finalDiscounts.items.length,
          unique_ids: finalDiscounts.items.length, duplicate_ids: 0, partial_artifact_present: false,
        },
      })
      await fs.rm(evidenceFile, { force: true })
      await modules.emitPsdealsProducerEvidence({ output_path: evidenceFile, envelope })
      const evidence = await readJson(evidenceFile)
      assert(evidence.status === 'succeeded' && evidence.payload?.collection_result === 'complete', 'FINAL_DISCOUNTS_EVIDENCE_NOT_COMPLETE')
      return { file: portable(projectRoot, evidenceFile), hash: await sha256File(evidenceFile), fingerprint: evidence.context?.fingerprint, reused_initial_snapshot: false }
    })
    assertFinalReconciliationReferenceMode(finalReconciliationDecision, finalListingEvidenceRef, 'final_discounts_evidence')
    assert(finalListingEvidenceRef.fingerprint === listingEvidenceRef.fingerprint, 'FINAL_DISCOUNT_FILTER_FINGERPRINT_CHANGED')
    const finalDiscountsEvidence = resolvePortable(projectRoot, finalListingEvidenceRef.file)

    const finalDeltaPlanRef = await step('prepare_final_delta_plan_v118', async () => {
      const discountIds = finalDiscounts.items.map((item) => parsePsdealsId(item?.psdeals_id ?? item?.psdeals_url)).filter(Boolean)
      const existing = await fetchExistingRows(admin, discountIds, 'id,psdeals_id,title,psdeals_slug,psdeals_url,detail_last_synced_at,raw_listing_json')
      const existingIds = new Set(existing.map((row) => Number(row.psdeals_id)))
      const existingById = new Map(existing.map((row) => [Number(row.psdeals_id), row]))
      const discountMissing = finalFreshRequired
        ? finalDiscounts.items.filter((item) => !existingIds.has(parsePsdealsId(item?.psdeals_id ?? item?.psdeals_url)))
        : []
      const exceptionDetails = finalFreshRequired
        ? finalDiscounts.items.filter((item) => {
            const id = parsePsdealsId(item?.psdeals_id ?? item?.psdeals_url)
            return existingIds.has(id) && needsFinalDeltaDetail(item, existingById.get(id), { nowMs: Date.now() })
          })
        : []
      const finalRecentMissing = finalFreshRequired ? (finalRecent.missing_items || []) : []
      const detailItems = mergeBacklogAndFresh(finalRecentMissing, [...discountMissing, ...exceptionDetails])
      const queueFile = path.join(artifactsDir, 'detail-queue-final-delta-v118.txt')
      await writeAtomic(queueFile, detailItems.length ? `${detailItems.map((item) => item.psdeals_url).filter(Boolean).join('\n')}\n` : '')
      const planFile = path.join(artifactsDir, 'FINAL-FRESH-DELTA-PLAN-v1.24.json')
      await writeJsonAtomic(planFile, {
        plan_version: 1, generated_at: nowIso(), final_recent_pages: finalRecent.page_summaries.length,
        final_recent_missing: finalRecentMissing.length, final_discount_pages: finalDiscounts.page_summaries.length,
        final_discount_items: finalDiscounts.items.length, final_discount_missing: discountMissing.length,
        final_exception_details: exceptionDetails.length, final_detail_items: detailItems.length, detail_items: detailItems,
        policy: 'listing_first; unchanged_unsafe_rows_are_bounded_by_age; reused_snapshot_never_reopens_detail',
      })
      return { file: portable(projectRoot, planFile), hash: await sha256File(planFile), queue_file: portable(projectRoot, queueFile), queue_hash: await sha256File(queueFile), detail_count: detailItems.length, recent_missing_count: finalRecentMissing.length, discount_missing_count: discountMissing.length, exception_detail_count: exceptionDetails.length }
    })
    const finalDeltaPlan = await readVerifiedJson(resolvePortable(projectRoot, finalDeltaPlanRef.file), finalDeltaPlanRef.hash, 'FINAL_DELTA_PLAN_V118')
    const finalDeltaDetailItems = finalDeltaPlan.detail_items || []
    assert(finalDeltaDetailItems.length === finalDeltaPlanRef.detail_count, 'FINAL_DELTA_DETAIL_COUNT_MISMATCH')
    log(`[RECONCILIACIÓN FINAL V1.26] Recently Added nuevos=${finalDeltaPlanRef.recent_missing_count}; descuentos actuales=${finalDiscounts.items.length}; nuevos en descuentos=${finalDeltaPlanRef.discount_missing_count}; excepciones a detalle=${finalDeltaPlanRef.exception_detail_count}; fichas a abrir=${finalDeltaPlanRef.detail_count}.`)

    const finalListingReceipt = await step('record_final_discount_listing_completion_v118', async () => {
      const startedAt = await stableTimestamp(state, saveState, 'final_listing_receipt_started_at_v118', [detailsCompletedAt])
      const finishedAt = await stableTimestamp(state, saveState, 'final_listing_receipt_finished_at_v118', [startedAt, finalDiscountArtifacts.listing_observed_at])
      const parameters = {
        p_cycle_id: state.remote_cycle_id, p_idempotency_key: `listing-validation-final-v118:${runId}:${finalListingHash}`,
        p_listing_artifact_hash: finalListingHash, p_filter_fingerprint: finalListingEvidenceRef.fingerprint,
        p_listing_observed_at: finalDiscountArtifacts.listing_observed_at, p_items_seen: finalDiscounts.items.length,
        p_pages_failed: 0, p_duplicate_ids: 0, p_is_partial: false, p_termination_observed: true,
        p_started_at: startedAt, p_finished_at: finishedAt,
      }
      parameters.p_request_hash = requestHash(parameters)
      const row = firstRow(await rpc('record_psdeals_listing_completion_v1', parameters))
      assert(row?.status === 'committed', 'FINAL_LISTING_COMPLETION_NOT_COMMITTED')
      state.receipts.listing_validation_final_v118 = row.id
      await saveState()
      return { receipt_id: row.id, items_seen: finalDiscounts.items.length, listing_observed_at: finalDiscountArtifacts.listing_observed_at }
    })

    const finalRecentPlanRef = await step('prepare_final_recent_listing_upsert_plan_v118', async () => {
      const items = finalRecent.missing_items || []
      const lastCollected = [...(finalRecent.page_summaries || [])].reverse().find((row) => validIso(row.collected_at))?.collected_at
      const observedAt = await stableTimestamp(state, saveState, 'final_recent_listing_observed_at_v118', [detailsCompletedAt, lastCollected])
      const existing = await fetchExistingRows(admin, items.map((item) => Number(item.psdeals_id)))
      const prepared = listingAdapter.preparePsdealsListingUpsertBatches({ listing_items: items, existing_psdeals_ids: existing.map((row) => Number(row.psdeals_id)), listing_observed_at: observedAt, batch_size: 100 })
      assert(prepared.omitted_count === 0, `FINAL_RECENT_LISTING_OMITTED:${prepared.omitted_count}`)
      const file = path.join(artifactsDir, 'recent-listing-final-upsert-plan-v118.json')
      await writeJsonAtomic(file, { plan_version: 1, listing_observed_at: observedAt, batches: prepared.batches, prepared: prepared.prepared, omitted_count: prepared.omitted_count })
      return { file: portable(projectRoot, file), hash: await sha256File(file), row_count: prepared.prepared }
    })
    const finalRecentPrepared = await readVerifiedJson(resolvePortable(projectRoot, finalRecentPlanRef.file), finalRecentPlanRef.hash, 'FINAL_RECENT_UPSERT_PLAN_V118')
    const finalRecentUpsert = await step('upsert_final_recent_listing_batches_v118', async () => upsertListingBatches({ admin, rpc, state, saveState, prepared: finalRecentPrepared, parentReceiptId: finalListingReceipt.receipt_id, label: 'recent-final-v118', inputHash: finalRecentPlanRef.hash, log }))

    const finalDiscountPlanRef = await step('prepare_final_discount_listing_upsert_plan_v118', async () => {
      const file = path.join(artifactsDir, 'discount-listing-final-upsert-plan-v118.json')
      if (!finalFreshRequired) {
        const plan = buildFinalDiscountListingUpsertPlan({
          finalFreshRequired,
          listingObservedAt: finalDiscountArtifacts.listing_observed_at,
          listingHash: finalListingHash,
          itemCount: finalDiscounts.items.length,
        })
        await writeJsonAtomic(file, plan)
        return {
          file: portable(projectRoot, file),
          hash: await sha256File(file),
          row_count: 0,
          deferred_count: 0,
          reused_initial_snapshot: true,
        }
      }
      const ids = finalDiscounts.items.map((item) => parsePsdealsId(item?.psdeals_id ?? item?.psdeals_url)).filter(Boolean)
      const existing = await fetchExistingRows(admin, ids, 'id,psdeals_id,psdeals_slug,psdeals_url,title')
      const hydrated = hydrateListingIdentityFromExistingRows(finalDiscounts.items, existing)
      const prepared = listingAdapter.preparePsdealsListingUpsertBatches({
        listing_items: hydrated.items, existing_psdeals_ids: existing.map((row) => Number(row.psdeals_id)),
        listing_observed_at: finalDiscountArtifacts.listing_observed_at,
        certification_context: { remote_cycle_id: state.remote_cycle_id, evidence_sha256: finalListingHash }, batch_size: 100,
      })
      const recovery = planDeferredListingInsertRecovery({ prepared, listingItems: hydrated.items, detailItems: finalDeltaDetailItems, maxDeferred: 50 })
      assert(recovery.recoverable, `FINAL_DISCOUNT_LISTING_UNSAFE_OMISSIONS:${recovery.unsafe_count}:${JSON.stringify(recovery.unsafe.slice(0, 10))}`)
      const coverage = assertExactListingBatchCoverage(prepared, recovery.primary_items)
      assert(coverage.prepared_count + recovery.deferred_count === finalDiscounts.items.length, `FINAL_DISCOUNT_LISTING_TOTAL_COVERAGE_INVALID:${coverage.prepared_count}:${recovery.deferred_count}:${finalDiscounts.items.length}`)
      const plan = buildFinalDiscountListingUpsertPlan({
        finalFreshRequired,
        listingObservedAt: finalDiscountArtifacts.listing_observed_at,
        listingHash: finalListingHash,
        itemCount: finalDiscounts.items.length,
        prepared,
        recovery,
        identityRepairCount: hydrated.repair_count,
        coverage,
      })
      await writeJsonAtomic(file, plan)
      return { file: portable(projectRoot, file), hash: await sha256File(file), row_count: prepared.prepared, deferred_count: recovery.deferred_count, reused_initial_snapshot: false }
    })
    const finalDiscountPrepared = await readVerifiedJson(resolvePortable(projectRoot, finalDiscountPlanRef.file), finalDiscountPlanRef.hash, 'FINAL_DISCOUNT_UPSERT_PLAN_V118')
    const finalDiscountUpsert = await step('upsert_final_discount_listing_batches_v118', async () => upsertListingBatches({ admin, rpc, state, saveState, prepared: finalDiscountPrepared, parentReceiptId: finalListingReceipt.receipt_id, label: 'discounts-final-v118', inputHash: finalListingHash, log }))

    const finalDeltaAnalysisReceipt = await step('record_final_delta_analysis_v118', async () => recordAction({
      rpc, state, saveState, actionKind: 'fast_refresh_analysis', parentReceiptId: finalListingReceipt.receipt_id,
      idempotencyKey: `fast-refresh-final-v118:${runId}:${finalDeltaPlanRef.queue_hash}`, inputHash: finalListingHash,
      execute: async () => ({ affected_rows: finalDeltaDetailItems.length, combined_count: finalDeltaDetailItems.length, overlap_count: 0, combined_artifact_hash: finalDeltaPlanRef.queue_hash, final_fresh_delta: true }),
    }))
    state.receipts.fast_refresh_final_v118 = finalDeltaAnalysisReceipt.receipt_id
    await saveState()

    if (finalDeltaDetailItems.length > 0) endpoint = await waitForEdgeReady({ projectRoot, state, saveState, expectedUrl: RECENT_URL, reason: 'fichas nuevas/excepciones de la reconciliación final', log, logFile })
    const finalDeltaDetails = await step('process_final_delta_detail_queue_v118', async () => processDetailChunks({
      projectRoot, runRoot: finalReconcileRoot, state, saveState, rpc, modules, endpoint,
      detailItems: finalDeltaDetailItems, detailQueueHash: finalDeltaPlanRef.queue_hash,
      parentReceiptId: finalDeltaAnalysisReceipt.receipt_id, log, logFile,
      stateKey: 'final_delta_detail_chunks_v118', idempotencyNamespace: 'final-delta-v118',
    }))
    assert(finalDeltaDetails.item_count === finalDeltaDetailItems.length && finalDeltaDetails.receipts.length > 0, 'FINAL_DELTA_DETAIL_COMPLETION_INVALID')
    const finalDetailsCompletedAt = await stableTimestamp(state, saveState, 'final_details_completed_at_v118', [finalDiscountArtifacts.listing_observed_at])

    const finalDeferredPlanRef = await step('prepare_final_deferred_discount_listing_after_details_v118', async () => {
      const deferred = Array.isArray(finalDiscountPrepared.deferred_items) ? finalDiscountPrepared.deferred_items : []
      const file = path.join(artifactsDir, 'discount-listing-final-deferred-upsert-plan-v118.json')
      if (deferred.length === 0) {
        const reusedInitialSnapshot = finalDiscountPrepared.reused_initial_snapshot === true
        await writeJsonAtomic(file, { plan_version: 1, reused_initial_snapshot: reusedInitialSnapshot, deferred_count: 0, deferred_items: [], expected_affected: 0, batches: [], coverage: { expected_count: 0, prepared_count: 0 } })
        return { file: portable(projectRoot, file), hash: await sha256File(file), deferred_count: 0, row_count: 0, reused_initial_snapshot: reusedInitialSnapshot }
      }
      const ids = deferred.map((row) => Number(row.psdeals_id))
      const stageRows = await fetchExistingRows(admin, ids, 'id,psdeals_id,psdeals_slug,psdeals_url,title,listing_last_seen_at,detail_last_synced_at')
      const found = new Set(stageRows.map((row) => Number(row.psdeals_id)))
      const missingAfterDetail = ids.filter((id) => !found.has(id))
      assert(missingAfterDetail.length === 0, `FINAL_DEFERRED_DISCOUNT_DETAIL_DID_NOT_CREATE:${missingAfterDetail.join(',')}`)
      const hydrated = hydrateListingIdentityFromExistingRows(deferred.map((row) => row.item), stageRows)
      const prepared = listingAdapter.preparePsdealsListingUpsertBatches({
        listing_items: hydrated.items, existing_psdeals_ids: ids, listing_observed_at: finalDiscountArtifacts.listing_observed_at,
        certification_context: { remote_cycle_id: state.remote_cycle_id, evidence_sha256: finalListingHash }, batch_size: 100,
      })
      assert(prepared.omitted_count === 0, `FINAL_DEFERRED_DISCOUNT_STILL_OMITTED:${prepared.omitted_count}`)
      const coverage = assertExactListingBatchCoverage(prepared, hydrated.items)
      await writeJsonAtomic(file, { plan_version: 1, deferred_count: deferred.length, listing_observed_at: finalDiscountArtifacts.listing_observed_at, coverage, batches: prepared.batches })
      return { file: portable(projectRoot, file), hash: await sha256File(file), deferred_count: deferred.length, row_count: prepared.prepared }
    })
    const finalDeferredPrepared = await readVerifiedJson(resolvePortable(projectRoot, finalDeferredPlanRef.file), finalDeferredPlanRef.hash, 'FINAL_DEFERRED_UPSERT_PLAN_V118')
    const finalDeferredDiscountUpsert = await step('upsert_final_deferred_discount_listing_batches_v118', async () => upsertListingBatches({ admin, rpc, state, saveState, prepared: finalDeferredPrepared, parentReceiptId: finalListingReceipt.receipt_id, label: 'discounts-final-deferred-v118', inputHash: finalListingHash, log }))

    await step('verify_final_discount_listing_stage_stamp_v118', async () => {
      const ids = finalDiscounts.items.map((item) => Number(item.psdeals_id))
      const rows = await fetchExistingRows(admin, ids, 'psdeals_id,title,psdeals_slug,psdeals_url,listing_last_seen_at')
      const expectedAt = Date.parse(finalDiscountArtifacts.listing_observed_at)
      const byId = new Map(rows.map((row) => [Number(row.psdeals_id), row]))
      const missing = ids.filter((id) => !byId.has(id))
      const unstamped = rows.filter((row) => Date.parse(row.listing_last_seen_at || '') !== expectedAt).map((row) => Number(row.psdeals_id))
      const incomplete = rows.filter((row) => !String(row.title || '').trim() || !String(row.psdeals_slug || '').trim() || !String(row.psdeals_url || '').trim()).map((row) => Number(row.psdeals_id))
      assert(missing.length === 0, `FINAL_DISCOUNT_STAGE_MISSING:${missing.slice(0, 20).join(',')}`)
      assert(unstamped.length === 0, `FINAL_DISCOUNT_STAGE_STAMP_MISMATCH:${unstamped.slice(0, 20).join(',')}`)
      assert(incomplete.length === 0, `FINAL_DISCOUNT_STAGE_IDENTITY_INCOMPLETE:${incomplete.slice(0, 20).join(',')}`)
      assert(rows.length === finalDiscounts.items.length, `FINAL_DISCOUNT_STAGE_COUNT_MISMATCH:${rows.length}:${finalDiscounts.items.length}`)
      return { verified: true, rows: rows.length, listing_observed_at: finalDiscountArtifacts.listing_observed_at }
    })

    recentMissingItems = mergeBacklogAndFresh(recentMissingItems, finalRecent.missing_items || [])
    recentUpsert = { affected: recentUpsert.affected + finalRecentUpsert.affected, receipts: [...new Set([...(recentUpsert.receipts || []), ...(finalRecentUpsert.receipts || [])])] }
    discountUpsert = { affected: discountUpsert.affected + finalDiscountUpsert.affected, receipts: [...new Set([...(discountUpsert.receipts || []), ...(finalDiscountUpsert.receipts || [])])] }
    deferredDiscountUpsert = { affected: deferredDiscountUpsert.affected + finalDeferredDiscountUpsert.affected, receipts: [...new Set([...(deferredDiscountUpsert.receipts || []), ...(finalDeferredDiscountUpsert.receipts || [])])] }
    details = { item_count: details.item_count + finalDeltaDetails.item_count, chunk_count: details.chunk_count + finalDeltaDetails.chunk_count, receipts: [...new Set([...(details.receipts || []), ...(finalDeltaDetails.receipts || [])])] }
    detailsCompletedAt = finalDetailsCompletedAt
    discounts = finalDiscounts
    discountArtifacts = finalDiscountArtifacts
    discountsJson = finalDiscountsJson
    discountsTxt = finalDiscountsTxt
    listingHash = finalListingHash
    listingEvidenceRef = finalListingEvidenceRef
    discountsEvidence = finalDiscountsEvidence
    state.receipts.listing_validation = finalListingReceipt.receipt_id
    await saveState()

    const refreshedMonthly = await step('refresh_official_monthly_after_final_reconcile_v118', async () => {
      const refreshed = await officialMonthlyReview(log)
      const changed = monthlyDefinitionHash(refreshed) !== monthlyDefinitionHash(monthly)
      const amendmentFile = path.join(artifactsDir, 'monthly-source-revalidation-before-application.json')
      await writeJsonAtomic(amendmentFile, {
        review_version: 1,
        checked_at: nowIso(),
        original: monthly,
        refreshed,
        changed,
        writes_already_started: true,
        policy: changed ? 'use_refreshed_official_active_set_and_record_amendment' : 'retain_original_verified_set',
      })
      return { monthly: refreshed, changed, amendment_file: portable(projectRoot, amendmentFile), amendment_hash: await sha256File(amendmentFile) }
    })
    if (refreshedMonthly.changed) {
      log(`[JUEGOS MENSUALES] la fuente oficial cambió durante la ejecución; se usará el conjunto vigente ${refreshedMonthly.monthly.month_key} y quedó registrada una enmienda.`)
    }
    monthly = refreshedMonthly.monthly

    const monthlyCheckpointFile = path.join(stateDir, 'monthly-games', 'checkpoint.json')
    let finalMonthlyResolution = null
    const monthlyStep = await step('verify_or_update_monthly_games', async () => {
      const monthlyStageCandidates = await fetchMonthlyCandidates(admin, monthly, [])
      finalMonthlyResolution = resolveMonthlyGames(monthly, monthlyStageCandidates)
      assert(finalMonthlyResolution.resolved, 'MONTHLY_MAPPING_LOST_AFTER_IMPORT')
      let checkpoint = await exists(monthlyCheckpointFile)
        ? await readJson(monthlyCheckpointFile)
        : { checkpoint_version: 1, phases: {}, created_at: nowIso(), target_month: monthly.month_key }
      assert(checkpoint.target_month === monthly.month_key, 'MONTHLY_CHECKPOINT_MONTH_MISMATCH')

      const beforeRows = await readActiveMonthly()
      const beforeComparison = compareMonthlySets(beforeRows, monthly, finalMonthlyResolution)
      let application = checkpoint.application || { affected_rows: 0, active_games: beforeRows.length, no_changes: true }
      const recoveredMonthlyApplication = reconcileMonthlyApplicationCheckpoint({
        comparison_same: beforeComparison.same,
        checkpoint,
        active_games: beforeRows.length,
      })
      if (recoveredMonthlyApplication.recovered) {
        application = recoveredMonthlyApplication.application
        checkpoint = await updatePhaseCheckpoint(monthlyCheckpointFile, {
          application,
          phases: recoveredMonthlyApplication.phases,
        })
        log('[CHECKPOINT MONTHLY] la base ya cumple el conjunto objetivo después de una interrupción; se reconcilia sin repetir escrituras.')
      }

      if (!beforeComparison.same) {
        if (!checkpoint.phases?.proposal_recorded) {
          const proposalStarted = await stableTimestamp(state, saveState, 'monthly_proposal_started_at', [detailsCompletedAt])
          const proposalChecked = await stableTimestamp(state, saveState, 'monthly_proposal_checked_at', [proposalStarted])
          const proposalFinished = await stableTimestamp(state, saveState, 'monthly_proposal_finished_at', [proposalChecked])
          const proposalFile = path.join(artifactsDir, 'monthly-proposed-changes.json')
          await writeJsonAtomic(proposalFile, {
            review_version: 1,
            phase: 'proposed_changes_before_application',
            checked_at: proposalChecked,
            monthly,
            resolution: finalMonthlyResolution,
            current_active_rows: beforeRows,
            comparison: beforeComparison,
            application_performed: false,
          })
          const evidenceHash = await sha256File(proposalFile)
          const parameters = {
            p_cycle_id: state.remote_cycle_id,
            p_idempotency_key: `monthly-proposal:${runId}:${evidenceHash}`,
            p_checked_at: proposalChecked,
            p_source_type: 'official_playstation_blog',
            p_source_reference: monthly.source_url,
            p_procedure: 'dynamic_official_monthly_preapplication_review',
            p_procedure_version: '1',
            p_evidence_hash: evidenceHash,
            p_result: 'proposed_changes',
            p_proposed_changes_count: monthly.games.length,
            p_application_performed: false,
            p_started_at: proposalStarted,
            p_finished_at: proposalFinished,
          }
          parameters.p_request_hash = requestHash(parameters)
          const receipt = firstRow(await rpc('record_psdeals_monthly_check_v1', parameters))
          assert(receipt?.status === 'committed', 'MONTHLY_PROPOSAL_RECEIPT_NOT_COMMITTED')
          state.receipts.monthly_proposal = receipt.id
          await saveState()
          checkpoint = await updatePhaseCheckpoint(monthlyCheckpointFile, {
            proposal_file: portable(projectRoot, proposalFile),
            proposal_hash: evidenceHash,
            proposal_receipt_id: receipt.id,
            phases: { reviewed: true, proposal_recorded: true },
          })
        }

        const appliedAt = await stableTimestamp(state, saveState, 'monthly_application_at', [state.timestamps.monthly_proposal_finished_at || detailsCompletedAt])
        application = await applyMonthlySafely({ admin, monthly, resolutions: finalMonthlyResolution, appliedAt })
        checkpoint = await updatePhaseCheckpoint(monthlyCheckpointFile, {
          application,
          phases: { applied: true, verified_after_application: true },
        })
      }

      const verifiedRows = await readActiveMonthly()
      const verifiedComparison = compareMonthlySets(verifiedRows, monthly, finalMonthlyResolution)
      assert(verifiedComparison.same, `MONTHLY_FINAL_SET_MISMATCH:${JSON.stringify(verifiedComparison)}`)
      checkpoint = await updatePhaseCheckpoint(monthlyCheckpointFile, {
        final_active_rows: verifiedRows,
        phases: { verified: true },
      })

      const finalStarted = await stableTimestamp(state, saveState, 'monthly_final_started_at', [state.timestamps.monthly_application_at || detailsCompletedAt])
      const finalChecked = await stableTimestamp(state, saveState, 'monthly_final_checked_at', [finalStarted])
      const finalFinished = await stableTimestamp(state, saveState, 'monthly_final_finished_at', [finalChecked])
      const finalReviewFile = path.join(artifactsDir, 'monthly-final-verification.json')
      await writeJsonAtomic(finalReviewFile, {
        review_version: 1,
        phase: 'final_no_changes_verification',
        checked_at: finalChecked,
        monthly,
        resolution: finalMonthlyResolution,
        active_rows: verifiedRows,
        comparison: verifiedComparison,
        application,
        application_performed_by_check_receipt: false,
      })
      const finalEvidenceHash = await sha256File(finalReviewFile)
      const parameters = {
        p_cycle_id: state.remote_cycle_id,
        p_idempotency_key: `monthly-final:${runId}:${finalEvidenceHash}`,
        p_checked_at: finalChecked,
        p_source_type: 'official_playstation_blog',
        p_source_reference: monthly.source_url,
        p_procedure: 'dynamic_official_monthly_final_exact_verification',
        p_procedure_version: '1',
        p_evidence_hash: finalEvidenceHash,
        p_result: 'no_changes',
        p_proposed_changes_count: 0,
        p_application_performed: false,
        p_started_at: finalStarted,
        p_finished_at: finalFinished,
      }
      parameters.p_request_hash = requestHash(parameters)
      const receipt = firstRow(await rpc('record_psdeals_monthly_check_v1', parameters))
      assert(receipt?.status === 'committed', 'MONTHLY_FINAL_RECEIPT_NOT_COMMITTED')
      state.receipts.monthly = receipt.id
      await saveState()
      checkpoint = await updatePhaseCheckpoint(monthlyCheckpointFile, {
        final_review_file: portable(projectRoot, finalReviewFile),
        final_review_hash: finalEvidenceHash,
        final_receipt_id: receipt.id,
        phases: { final_receipt: true },
      })
      return {
        receipt_id: receipt.id,
        proposal_receipt_id: state.receipts.monthly_proposal || null,
        active_games: verifiedRows.length,
        changed: !beforeComparison.same,
        affected_rows: Number(application.affected_rows || 0),
        final_checked_at: finalChecked,
        monthly_definition_hash: monthlyDefinitionHash(monthly),
        resolution: finalMonthlyResolution,
      }
    })

    if (!finalMonthlyResolution) {
      if (monthlyStep?.resolution?.resolved === true && monthlyStep?.monthly_definition_hash === monthlyDefinitionHash(monthly)) {
        finalMonthlyResolution = monthlyStep.resolution
      } else {
        const finalReviewFile = path.join(artifactsDir, 'monthly-final-verification.json')
        assert(await exists(finalReviewFile), 'MONTHLY_COMPLETED_RESOLUTION_ARTIFACT_MISSING')
        const finalReview = await readJson(finalReviewFile)
        assert(monthlyDefinitionHash(finalReview.monthly) === monthlyDefinitionHash(monthly), 'MONTHLY_COMPLETED_RESOLUTION_SOURCE_MISMATCH')
        assert(finalReview.resolution?.resolved === true, 'MONTHLY_COMPLETED_RESOLUTION_INVALID')
        finalMonthlyResolution = finalReview.resolution
        log('[REANUDAR MONTHLY] resolución exacta recuperada del artefacto final ya committed; no se repite la búsqueda de candidatos Stage.')
      }
    }

    const endedFinalRef = await step('reanalyze_ended_after_revalidation', async () => {
      const outputJson = path.join(artifactsDir, 'ended-final.json')
      const outputTxt = path.join(artifactsDir, 'ended-final.txt')
      const evidenceFile = path.join(evidenceDir, 'ended-final.json')
      await Promise.all([fs.rm(outputJson, { force: true }), fs.rm(outputTxt, { force: true }), fs.rm(evidenceFile, { force: true })])
      await runChild(process.execPath, [
        'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs',
        `--discounts-json=${portable(projectRoot, discountsJson)}`,
        `--output-txt=${portable(projectRoot, outputTxt)}`,
        `--output-json=${portable(projectRoot, outputJson)}`,
        `--listing-evidence=${portable(projectRoot, discountsEvidence)}`,
        '--sample-limit=20',
        `--local-cycle-id=${runId}`,
        `--run-token=${state.run_token}`,
        `--evidence-output=${portable(projectRoot, evidenceFile)}`,
        `--code-revision=${state.code_revision}`,
        '--producer-version=1',
        '--evidence-mode=real_recorded',
      ], { cwd: projectRoot, label: 'ENDED_FINAL_ANALYSIS', logFile })
      const payload = await readJson(outputJson)
      const candidates = canonicalCandidateIds((payload.ended_discount_candidates || []).map((row) => Number(row.psdeals_id)))
      assert(candidates.length <= 5000, `DEMOTION_CANDIDATE_LIMIT_EXCEEDED:${candidates.length}`)
      const result = {
        output_file: portable(projectRoot, outputJson),
        output_hash: await sha256File(outputJson),
        evidence_file: portable(projectRoot, evidenceFile),
        evidence_hash: await sha256File(evidenceFile),
        candidate_count: candidates.length,
        candidates,
        candidate_hash: candidateSetHash(candidates),
        blocked_remaining: (payload.blocked_discount_candidates || []).length,
      }
      await updatePhaseCheckpoint(path.join(stateDir, 'ended-discounts', 'checkpoint.json'), {
        analysis: result,
        phases: { analyzed: true },
      })
      return result
    })
    const endedFinalPayload = await readVerifiedJson(resolvePortable(projectRoot, endedFinalRef.output_file), endedFinalRef.output_hash, 'ENDED_FINAL_ANALYSIS')
    const endedFinalPayloadRows = endedFinalPayload.ended_discount_candidates || []
    assert(endedFinalPayloadRows.every((row) => Number.isSafeInteger(Number(row?.psdeals_id)) && Number(row.psdeals_id) > 0), 'ENDED_FINAL_CANDIDATE_ID_INVALID')
    const endedFinalPayloadCandidates = canonicalCandidateIds(endedFinalPayloadRows.map((row) => Number(row.psdeals_id)))
    assert(endedFinalPayloadCandidates.length === endedFinalRef.candidate_count, 'ENDED_FINAL_CANONICAL_CANDIDATE_COUNT_MISMATCH')
    assert(JSON.stringify(endedFinalPayloadCandidates) === JSON.stringify(endedFinalRef.candidates), 'ENDED_FINAL_CANONICAL_CANDIDATE_SET_MISMATCH')
    const endedFinalDuplicateRows = endedFinalPayloadRows.length - endedFinalPayloadCandidates.length
    if (endedFinalDuplicateRows > 0) {
      log(`[CANONICALIZACIÓN ENDED] filas_crudas=${endedFinalPayloadRows.length} | ids_unicos=${endedFinalPayloadCandidates.length} | duplicados_descartados=${endedFinalDuplicateRows}. La democión usa únicamente IDs canónicos y v3 revalida el conjunto exacto dentro de la transacción.`)
    }
    assert(candidateSetHash(endedFinalRef.candidates) === endedFinalRef.candidate_hash, 'ENDED_FINAL_CANDIDATE_HASH_MISMATCH')

    const endedReceipt = await step('record_ended_analysis', async () => recordAction({
      rpc,
      state,
      saveState,
      actionKind: 'ended_deals_analysis',
      parentReceiptId: state.receipts.listing_validation,
      idempotencyKey: `ended-analysis:${runId}:${endedFinalRef.candidate_hash}`,
      inputHash: listingHash,
      execute: async () => ({
        affected_rows: endedFinalRef.candidate_count,
        listing_complete: true,
        listing_artifact_hash: listingHash,
        analysis_evidence_hash: endedFinalRef.evidence_hash,
        candidate_set_hash: endedFinalRef.candidate_hash,
        candidate_count: endedFinalRef.candidate_count,
        raw_candidate_rows: endedFinalPayloadRows.length,
        duplicate_candidate_rows: endedFinalDuplicateRows,
        blocked_remaining: endedFinalRef.blocked_remaining,
      }),
    }))
    state.receipts.ended_analysis = endedReceipt.receipt_id
    await saveState()
    await updatePhaseCheckpoint(path.join(stateDir, 'ended-discounts', 'checkpoint.json'), {
      analysis_receipt_id: endedReceipt.receipt_id,
      phases: { analysis_receipt: true },
    })

    const demotion = await step('apply_safe_demotions_v3', async () => {
      const appliedAt = await stableTimestamp(state, saveState, 'demotion_applied_at', [discountArtifacts.listing_observed_at, detailsCompletedAt, monthlyStep.final_checked_at])
      const parameters = {
        p_cycle_id: state.remote_cycle_id,
        p_ended_analysis_receipt_id: state.receipts.ended_analysis,
        p_idempotency_key: `demotion-v4-async-initial:${runId}:${endedFinalRef.candidate_hash}`,
        p_listing_artifact_hash: listingHash,
        p_analysis_evidence_hash: endedFinalRef.evidence_hash,
        p_candidate_set_hash: endedFinalRef.candidate_hash,
        p_candidate_psdeals_ids: endedFinalRef.candidates,
        p_expected_count: endedFinalRef.candidate_count,
        p_applied_at: appliedAt,
      }
      parameters.p_request_hash = requestHash(parameters)
      const asyncResult = await runAsyncEndedDemotionV5({
        admin, rpc, state, saveState, log, parameters,
        expectedCount: endedFinalRef.candidate_count,
        stateJobKey: 'async_demotion_initial_job_v5',
        label: 'inicial',
      })
      state.receipts.demotion = asyncResult.receipt_id
      await saveState()
      await updatePhaseCheckpoint(path.join(stateDir, 'ended-discounts', 'checkpoint.json'), {
        demotion_receipt_id: asyncResult.receipt_id,
        demotion_applied_at: appliedAt,
        affected_rows: asyncResult.affected_rows,
        async_job_id: asyncResult.async_job_id,
        phases: { demoted: true, async: true },
      })
      return { receipt_id: asyncResult.receipt_id, affected_rows: asyncResult.affected_rows, applied_at: appliedAt, result: asyncResult.result }
    })


    const endedResidualV126 = await step('reanalyze_residual_ended_v126', async () => {
      const outputJson = path.join(artifactsDir, 'ended-residual-v126.json')
      const outputTxt = path.join(artifactsDir, 'ended-residual-v126.txt')
      const evidenceFile = path.join(evidenceDir, 'ended-residual-v126.json')
      await Promise.all([fs.rm(outputJson, { force: true }), fs.rm(outputTxt, { force: true }), fs.rm(evidenceFile, { force: true })])
      await runChild(process.execPath, [
        'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs',
        `--discounts-json=${portable(projectRoot, discountsJson)}`,
        `--output-txt=${portable(projectRoot, outputTxt)}`,
        `--output-json=${portable(projectRoot, outputJson)}`,
        `--listing-evidence=${portable(projectRoot, discountsEvidence)}`,
        '--sample-limit=20',
        `--local-cycle-id=${runId}`,
        `--run-token=${state.run_token}`,
        `--evidence-output=${portable(projectRoot, evidenceFile)}`,
        `--code-revision=${state.code_revision}`,
        '--producer-version=1',
        '--evidence-mode=real_recorded',
      ], { cwd: projectRoot, label: 'ENDED_RESIDUAL_V126_ANALYSIS', logFile })
      const payload = await readJson(outputJson)
      const rawRows = payload.ended_discount_candidates || []
      assert(rawRows.every((row) => Number.isSafeInteger(Number(row?.psdeals_id)) && Number(row.psdeals_id) > 0), 'ENDED_RESIDUAL_V126_ID_INVALID')
      const candidates = canonicalCandidateIds(rawRows.map((row) => Number(row.psdeals_id)))
      assert(candidates.length <= 5000, `ENDED_RESIDUAL_V126_LIMIT_EXCEEDED:${candidates.length}`)
      const result = {
        output_file: portable(projectRoot, outputJson),
        output_hash: await sha256File(outputJson),
        analyzer_evidence_file: portable(projectRoot, evidenceFile),
        analyzer_evidence_hash: await sha256File(evidenceFile),
        raw_candidate_rows: rawRows.length,
        duplicate_candidate_rows: rawRows.length - candidates.length,
        candidate_count: candidates.length,
        candidates,
        candidate_hash: candidateSetHash(candidates),
        blocked_remaining: (payload.blocked_discount_candidates || []).length,
      }
      log(`[RECONCILIACIÓN ENDED V1.26] residuales seguros=${result.candidate_count} | filas_crudas=${result.raw_candidate_rows} | duplicados=${result.duplicate_candidate_rows}.`)
      return result
    })

    const endedReconcileV126 = await step('prepare_ended_reconciliation_v126', async () => {
      const overlap = endedResidualV126.candidates.filter((id) => endedFinalRef.candidates.includes(id))
      assert(overlap.length === 0, `ENDED_V126_RESIDUAL_OVERLAP_WITH_ALREADY_DEMOTED:${overlap.length}`)
      const candidates = canonicalCandidateIds([...endedFinalRef.candidates, ...endedResidualV126.candidates])
      assert(candidates.length === endedFinalRef.candidate_count + endedResidualV126.candidate_count, 'ENDED_V126_COMBINED_COUNT_MISMATCH')
      assert(candidates.length <= 5000, `ENDED_V126_COMBINED_LIMIT_EXCEEDED:${candidates.length}`)
      const evidenceFile = path.join(evidenceDir, 'ended-reconciliation-v126.json')
      await writeJsonAtomic(evidenceFile, {
        contract_version: 1,
        kind: 'ended_reconciliation_v126',
        cycle_id: state.remote_cycle_id,
        run_id: runId,
        listing_artifact_hash: listingHash,
        initial_analysis: {
          candidate_count: endedFinalRef.candidate_count,
          candidate_hash: endedFinalRef.candidate_hash,
          evidence_hash: endedFinalRef.evidence_hash,
          demotion_receipt_id: demotion.receipt_id,
        },
        residual_analysis: {
          candidate_count: endedResidualV126.candidate_count,
          candidate_hash: endedResidualV126.candidate_hash,
          evidence_hash: endedResidualV126.analyzer_evidence_hash,
        },
        combined_candidate_count: candidates.length,
        combined_candidate_hash: candidateSetHash(candidates),
        created_at: nowIso(),
      })
      return {
        evidence_file: portable(projectRoot, evidenceFile),
        evidence_hash: await sha256File(evidenceFile),
        candidate_count: candidates.length,
        candidates,
        candidate_hash: candidateSetHash(candidates),
        already_demoted_expected: endedFinalRef.candidate_count,
        residual_expected: endedResidualV126.candidate_count,
      }
    })

    const reconciledEndedReceipt = await step('record_reconciled_ended_analysis_v126', async () => recordAction({
      rpc,
      state,
      saveState,
      actionKind: 'ended_deals_analysis',
      parentReceiptId: state.receipts.listing_validation,
      idempotencyKey: `ended-analysis-v126:${runId}:${endedReconcileV126.candidate_hash}`,
      inputHash: listingHash,
      execute: async () => ({
        affected_rows: endedReconcileV126.candidate_count,
        listing_complete: true,
        listing_artifact_hash: listingHash,
        analysis_evidence_hash: endedReconcileV126.evidence_hash,
        candidate_set_hash: endedReconcileV126.candidate_hash,
        candidate_count: endedReconcileV126.candidate_count,
        already_demoted_expected: endedReconcileV126.already_demoted_expected,
        residual_expected: endedReconcileV126.residual_expected,
        blocked_remaining: endedResidualV126.blocked_remaining,
      }),
    }))
    state.receipts.ended_analysis = reconciledEndedReceipt.receipt_id
    await saveState()

    const demotionReconcileV126 = await step('apply_safe_demotions_v4', async () => {
      const appliedAt = await stableTimestamp(state, saveState, 'demotion_v4_applied_at', [demotion.applied_at, monthlyStep.final_checked_at])
      const parameters = {
        p_cycle_id: state.remote_cycle_id,
        p_ended_analysis_receipt_id: state.receipts.ended_analysis,
        p_idempotency_key: `demotion-v4-async-reconcile:${runId}:${endedReconcileV126.candidate_hash}`,
        p_listing_artifact_hash: listingHash,
        p_analysis_evidence_hash: endedReconcileV126.evidence_hash,
        p_candidate_set_hash: endedReconcileV126.candidate_hash,
        p_candidate_psdeals_ids: endedReconcileV126.candidates,
        p_expected_count: endedReconcileV126.candidate_count,
        p_applied_at: appliedAt,
      }
      parameters.p_request_hash = requestHash(parameters)
      const asyncResult = await runAsyncEndedDemotionV5({
        admin, rpc, state, saveState, log, parameters,
        expectedCount: endedReconcileV126.candidate_count,
        stateJobKey: 'async_demotion_reconcile_job_v5',
        label: 'reconciliación',
      })
      state.receipts.demotion = asyncResult.receipt_id
      await saveState()
      return {
        receipt_id: asyncResult.receipt_id,
        affected_rows: asyncResult.affected_rows,
        newly_demoted_rows: Number(asyncResult.result?.newly_demoted_rows || 0),
        already_demoted_same_cycle: Number(asyncResult.result?.already_demoted_same_cycle || 0),
        applied_at: appliedAt,
      }
    })

    const endedPostV126 = await step('verify_zero_residual_ended_v126', async () => {
      const outputJson = path.join(artifactsDir, 'ended-post-v126.json')
      const outputTxt = path.join(artifactsDir, 'ended-post-v126.txt')
      const evidenceFile = path.join(evidenceDir, 'ended-post-v126.json')
      await Promise.all([fs.rm(outputJson, { force: true }), fs.rm(outputTxt, { force: true }), fs.rm(evidenceFile, { force: true })])
      await runChild(process.execPath, [
        'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs',
        `--discounts-json=${portable(projectRoot, discountsJson)}`,
        `--output-txt=${portable(projectRoot, outputTxt)}`,
        `--output-json=${portable(projectRoot, outputJson)}`,
        `--listing-evidence=${portable(projectRoot, discountsEvidence)}`,
        '--sample-limit=20',
        `--local-cycle-id=${runId}`,
        `--run-token=${state.run_token}`,
        `--evidence-output=${portable(projectRoot, evidenceFile)}`,
        `--code-revision=${state.code_revision}`,
        '--producer-version=1',
        '--evidence-mode=real_recorded',
      ], { cwd: projectRoot, label: 'ENDED_POST_V126_ANALYSIS', logFile })
      const payload = await readJson(outputJson)
      const rawRows = payload.ended_discount_candidates || []
      const candidates = canonicalCandidateIds(rawRows.map((row) => Number(row.psdeals_id)))
      assert(rawRows.length === 0 && candidates.length === 0, `ENDED_V126_RESIDUAL_STILL_ACTIVE:raw=${rawRows.length}:unique=${candidates.length}`)
      log('[AUDITORÍA ENDED V1.26] 0 descuentos terminados seguros permanecen activos antes de mark/certify.')
      return { candidate_count: 0, blocked_remaining: (payload.blocked_discount_candidates || []).length, evidence_hash: await sha256File(evidenceFile) }
    })

    const mark = await step('mark_cycle_succeeded', async () => {
      const allRequiredCandidates = [...new Set([
        state.receipts.listing_validation,
        ...(discountUpsert.receipts || []),
        ...(deferredDiscountUpsert.receipts || []),
        state.receipts.fast_refresh,
        ...(details.receipts || []),
        state.receipts.monthly_proposal,
        state.receipts.monthly,
        state.receipts.ended_analysis,
        state.receipts.demotion,
      ].filter(Boolean))].sort()
      let required = allRequiredCandidates
      let receiptSetCompacted = false
      let cleanDetailReceipt = null
      if (required.length > 500) {
        cleanDetailReceipt = await selectCleanTerminalDetailReceipt(admin, details.receipts)
        required = [...new Set([
          state.receipts.listing_validation,
          discountUpsert.receipts?.[0],
          state.receipts.fast_refresh,
          cleanDetailReceipt,
          state.receipts.monthly,
          state.receipts.ended_analysis,
          state.receipts.demotion,
        ].filter(Boolean))].sort()
        receiptSetCompacted = true
      }
      assert(required.length >= 7 && required.length <= 500, `REQUIRED_RECEIPT_COUNT_INVALID:${required.length}`)
      await assertMarkReceiptSetReady(admin, required, state.receipts.demotion, endedReconcileV126.candidate_count)
      const validationFloors = [
        discountArtifacts.listing_observed_at,
        detailsCompletedAt,
        state.timestamps.monthly_final_finished_at,
        demotionReconcileV126.applied_at,
      ]
      await reconcileUncommittedMarkTimestamps(admin, state, saveState, validationFloors, log)
      const validationAt = await stableTimestamp(state, saveState, 'validation_completed_at', validationFloors)
      const finishedAt = await stableTimestamp(state, saveState, 'cycle_finished_at', [validationAt])
      const metrics = {
        operator_version: OPERATOR_VERSION,
        recently_added_pages_checked: recent.page_summaries.length,
        recently_added_new: recentMissingItems.length,
        discounts_seen: discounts.items.length,
        detail_items: details.item_count,
        ended_demoted: endedReconcileV126.candidate_count,
        ended_residual_recovered: endedResidualV126.candidate_count,
        ended_newly_demoted_v126: demotionReconcileV126.newly_demoted_rows,
        ended_already_demoted_same_cycle_v126: demotionReconcileV126.already_demoted_same_cycle,
        ended_blocked_preserved: endedPostV126.blocked_remaining,
        monthly_active_games: monthlyStep.active_games,
        monthly_changed: monthlyStep.changed,
        required_receipts_total_committed: allRequiredCandidates.length,
        required_receipts_submitted: required.length,
        required_receipt_set_compacted: receiptSetCompacted,
      }
      const parameters = {
        p_cycle_id: state.remote_cycle_id,
        p_demotion_receipt_id: state.receipts.demotion,
        p_required_receipt_ids: required,
        p_idempotency_key: `mark-succeeded:${runId}`,
        p_manifest_hash: state.manifest_hash,
        p_details_completed_at: detailsCompletedAt,
        p_validation_completed_at: validationAt,
        p_finished_at: finishedAt,
        p_items_updated: recentUpsert.affected + discountUpsert.affected + deferredDiscountUpsert.affected + details.item_count + monthlyStep.affected_rows + demotionReconcileV126.affected_rows,
        p_items_failed: 0,
        p_new_items_detected: recentMissingItems.length,
        p_metrics: metrics,
      }
      parameters.p_request_hash = requestHash(parameters)
      const receipt = firstRow(await rpc('mark_psdeals_price_refresh_cycle_succeeded_v1', parameters))
      assert(receipt?.status === 'committed', 'MARK_SUCCEEDED_NOT_COMMITTED')
      state.receipts.mark_succeeded = receipt.id
      await saveState()
      return { receipt_id: receipt.id, required_receipts: required.length, total_committed_receipt_candidates: allRequiredCandidates.length, receipt_set_compacted: receiptSetCompacted, metrics }
    })

    const certification = await step('certify_cycle_v4', async () => {
      const adopted = await adoptCommittedCertificationRecovery(admin, state, saveState, log)
      if (adopted) {
        await updatePhaseCheckpoint(path.join(stateDir, 'certification', 'checkpoint.json'), { result: adopted, phases: { certified: true } })
        return adopted
      }

      const startedAt = await stableTimestamp(state, saveState, 'certify_started_at', [state.timestamps.cycle_finished_at])
      const parameters = {
        p_cycle_id: state.remote_cycle_id,
        p_mark_succeeded_receipt_id: state.receipts.mark_succeeded,
        p_idempotency_key: `certify-v4:${runId}`,
        p_started_at: startedAt,
      }
      parameters.p_request_hash = requestHash(parameters)
      const row = firstRow(await rpc('certify_price_refresh_cycle_v4', parameters))
      assert(row?.action_status === 'committed' && row.receipt_id, `CERTIFY_V4_FAILED:${row?.error_code || row?.action_status}`)
      state.receipts.certify = row.receipt_id
      await saveState()
      await updatePhaseCheckpoint(path.join(stateDir, 'certification', 'checkpoint.json'), { result: row, phases: { certified: true } })
      return row
    })

    const cache = await step('refresh_public_cache_v18_async', async () => {
      const adopted = await adoptCommittedCacheRecovery(admin, state, saveState, log)
      if (adopted) {
        await updatePhaseCheckpoint(path.join(stateDir, 'cache-refresh', 'checkpoint.json'), { result: adopted, phases: { refreshed: true, async: true } })
        return adopted
      }

      const { data: v24PreflightData, error: v24PreflightError } = await admin.rpc('lobodeals_daily_runner_v24_preflight')
      if (v24PreflightError) throw new Error(`lobodeals_daily_runner_v24_preflight:${v24PreflightError.message}`)
      const v24Preflight = firstRow(v24PreflightData)
      assert(Number(v24Preflight?.contract_version) === 24, 'CACHE_V24_PREFLIGHT_CONTRACT_INVALID')
      assert(v24Preflight?.pg_cron_present === true, 'CACHE_V24_PG_CRON_MISSING')
      assert(v24Preflight?.async_cache_v18_present === true, 'CACHE_V24_ASYNC_V18_MISSING')
      assert(v24Preflight?.refresh_cache_v19_present === true, 'CACHE_V24_REFRESH_V19_MISSING')
      assert(v24Preflight?.verified_offer_columns_present === true, 'CACHE_V24_VERIFIED_OFFER_COLUMNS_MISSING')
      assert(v24Preflight?.monthly_regular_columns_present === true, 'CACHE_V24_MONTHLY_REGULAR_COLUMNS_MISSING')
      assert(v24Preflight?.search_v2_present === true, 'CACHE_V24_SEARCH_V2_MISSING')

      const startedAt = await stableTimestamp(state, saveState, 'cache_started_at', [state.timestamps.certify_started_at])
      let attempt = Number(state.async_cache_attempt_v18 || 1)
      if (!Number.isSafeInteger(attempt) || attempt < 1) attempt = 1
      let asyncJobId = state.async_cache_job_id_v18 || null

      while (attempt <= ASYNC_CACHE_MAX_ATTEMPTS) {
        const idempotencyKey = attempt === 1
          ? `cache-v19:${runId}`
          : `cache-v19:${runId}:retry-${attempt}`
        const cacheParameters = {
          p_cycle_id: state.remote_cycle_id,
          p_certification_receipt_id: state.receipts.certify,
          p_idempotency_key: idempotencyKey,
          p_started_at: startedAt,
        }
        cacheParameters.p_request_hash = requestHash(cacheParameters)

        if (!asyncJobId) {
          const enqueueParameters = {
            p_cycle_id: cacheParameters.p_cycle_id,
            p_certification_receipt_id: cacheParameters.p_certification_receipt_id,
            p_cache_idempotency_key: cacheParameters.p_idempotency_key,
            p_cache_request_hash: cacheParameters.p_request_hash,
            p_cache_started_at: cacheParameters.p_started_at,
          }
          const enqueueRow = firstRow(await rpc('enqueue_lobodeals_catalog_cache_refresh_v18', enqueueParameters))
          assert(enqueueRow?.job_id, `CACHE_V18_ENQUEUE_FAILED:${enqueueRow?.error_code || enqueueRow?.job_status}`)
          asyncJobId = enqueueRow.job_id
          state.async_cache_job_id_v18 = asyncJobId
          state.async_cache_attempt_v18 = attempt
          await saveState()
          log(`[CACHE ASYNC V18] intento=${attempt} | job=${asyncJobId} | estado=${enqueueRow.job_status}. El rebuild largo corre fuera del timeout de PostgREST.`)
        } else {
          log(`[CACHE ASYNC V18] reanudando intento=${attempt} | job=${asyncJobId}.`)
        }

        const waitStarted = Date.now()
        let lastLoggedStatus = null
        let lastLogAt = 0
        let retryNextAttempt = false
        while (Date.now() - waitStarted <= ASYNC_CACHE_MAX_WAIT_MS) {
          const { data, error } = await admin.rpc('get_lobodeals_catalog_cache_refresh_v18', { p_job_id: asyncJobId })
          if (error) throw new Error(`get_lobodeals_catalog_cache_refresh_v18:${error.message}`)
          const job = firstRow(data)
          assert(job?.job_id === asyncJobId, 'CACHE_V18_JOB_READ_INVALID')

          if (job.job_status === 'succeeded') {
            assert(job.cache_receipt_id, 'CACHE_V18_RECEIPT_MISSING')
            assert(Number(job.inserted_rows) > 0, 'CACHE_V18_INSERTED_ROWS_INVALID')
            assert(Number(job.expired_deals_still_marked_active) === 0, 'CACHE_V18_EXPIRED_DEALS_REMAIN')
            const row = {
              receipt_id: job.cache_receipt_id,
              action_status: 'committed',
              reconciled: Boolean(job.reconciled),
              inserted_rows: Number(job.inserted_rows),
              active_regular_deals: Number(job.active_regular_deals),
              active_ps_plus_deals: Number(job.active_ps_plus_deals),
              expired_deals_still_marked_active: Number(job.expired_deals_still_marked_active),
              monthly_null_price_rows_added: Number(job.monthly_null_price_rows_added || 0),
              async_job_id: asyncJobId,
              async_attempt: attempt,
            }
            state.receipts.cache = row.receipt_id
            state.async_cache_attempt_v18 = attempt
            await saveState()
            await updatePhaseCheckpoint(path.join(stateDir, 'cache-refresh', 'checkpoint.json'), { result: row, phases: { refreshed: true, async: true } })
            return row
          }
          if (job.job_status === 'failed') {
            const errorCode = String(job.error_code || 'unknown')
            if (ASYNC_CACHE_RETRYABLE_ERROR_CODES.has(errorCode) && attempt < ASYNC_CACHE_MAX_ATTEMPTS) {
              log(`[CACHE ASYNC V18] intento=${attempt} falló con ${errorCode}. Se preserva el job/receipt fallido y se reintenta con un idempotency key nuevo.`)
              attempt += 1
              asyncJobId = null
              state.async_cache_attempt_v18 = attempt
              state.async_cache_job_id_v18 = null
              await saveState()
              retryNextAttempt = true
              break
            }
            throw new Error(`CACHE_V18_ASYNC_FAILED:${errorCode}`)
          }
          assert(['queued', 'running'].includes(job.job_status), `CACHE_V18_JOB_STATUS_INVALID:${job.job_status}`)
          if (job.job_status !== lastLoggedStatus || Date.now() - lastLogAt >= 10000) {
            log(`[CACHE ASYNC V18] intento=${attempt} | job=${asyncJobId} | estado=${job.job_status}.`)
            lastLoggedStatus = job.job_status
            lastLogAt = Date.now()
          }
          await sleep(ASYNC_CACHE_POLL_MS)
        }

        if (retryNextAttempt) continue
        throw new Error(`CACHE_V18_ASYNC_TIMEOUT:${asyncJobId}`)
      }

      throw new Error('CACHE_V18_ASYNC_ATTEMPTS_EXHAUSTED')
    })

    const verification = await step('final_readonly_postchecks', async () => {
      const { count: stageCount, error: stageError } = await admin.from('psdeals_stage_items')
        .select('id', { count: 'exact', head: true }).eq('region_code', 'us').eq('storefront', 'playstation')
      if (stageError) throw new Error(`FINAL_STAGE:${stageError.message}`)
      const { count: cacheCount, error: cacheError } = await admin.from('catalog_public_cache')
        .select('id', { count: 'exact', head: true })
      if (cacheError) throw new Error(`FINAL_CACHE:${cacheError.message}`)
      const expectedCacheCount = Number(cache?.inserted_rows || 0)
      assert(expectedCacheCount > 0, 'FINAL_CACHE_RECEIPT_INSERTED_ROWS_INVALID')
      assert(cacheCount === expectedCacheCount, `FINAL_CACHE_RECEIPT_COUNT_MISMATCH:${cacheCount}:${expectedCacheCount}`)
      assert(stageCount >= cacheCount, `FINAL_CACHE_EXCEEDS_STAGE:${stageCount}:${cacheCount}`)
      assert(stageCount >= preflight.stage_rows, `FINAL_STAGE_DECREASED:${stageCount}:${preflight.stage_rows}`)
      const nonPublicStageCount = stageCount - cacheCount

      const activeMonthly = await readActiveMonthly()
      const monthlyComparison = compareMonthlySets(activeMonthly, monthly, finalMonthlyResolution)
      assert(monthlyComparison.same, `FINAL_MONTHLY_SET_INVALID:${JSON.stringify(monthlyComparison)}`)
      const targetItemIds = finalMonthlyResolution.resolutions.map((row) => row.item_id)
      const { data: monthlyCacheRows, error: monthlyCacheError } = await admin.from('catalog_public_cache')
        .select('item_id,current_price_amount,original_price_amount,discount_percent,ps_plus_price_amount,has_deal,has_ps_plus_deal,has_verified_deal,has_verified_ps_plus_deal,is_ps_plus_monthly_game,ps_plus_monthly_month,ps_plus_monthly_until')
        .in('item_id', targetItemIds)
      if (monthlyCacheError) throw new Error(`FINAL_MONTHLY_CACHE:${monthlyCacheError.message}`)
      const cachedMonthlyIds = new Set((monthlyCacheRows || []).filter((row) => row.is_ps_plus_monthly_game === true && row.ps_plus_monthly_month === monthly.month_key && String(row.ps_plus_monthly_until) === monthly.active_until).map((row) => row.item_id))
      assert(cachedMonthlyIds.size === targetItemIds.length && targetItemIds.every((id) => cachedMonthlyIds.has(id)), 'FINAL_MONTHLY_CACHE_SET_INVALID')
      const monthlyCommercialLeaks = (monthlyCacheRows || [])
        .map((row) => ({
          row,
          classification: classifyMonthlyCommercialContamination(row),
        }))
        .filter((entry) => entry.classification.contaminated)
      assert(monthlyCommercialLeaks.length === 0, `FINAL_MONTHLY_CACHE_COMMERCIAL_LEAK:${monthlyCommercialLeaks.map((entry) => `${entry.row.item_id}:${entry.classification.reasons.join('+')}`).join(',')}`)

      const { data: cycleRows, error: cycleError } = await admin.from('price_refresh_cycles')
        .select('id,status,started_at,details_completed_at,certified_at,cache_refreshed_at,items_seen,items_failed,ended_discounts_applied')
        .eq('id', state.remote_cycle_id).limit(1)
      if (cycleError) throw new Error(`FINAL_CYCLE:${cycleError.message}`)
      const cycleRow = cycleRows?.[0]
      assert(cycleRow?.status === 'certified' && cycleRow.certified_at && cycleRow.cache_refreshed_at, 'FINAL_CYCLE_NOT_CERTIFIED_AND_CACHED')
      assert(Number(cycleRow.items_seen) === discounts.items.length && Number(cycleRow.items_failed) === 0, 'FINAL_CYCLE_METRICS_INVALID')

      const { data: monthlyStageRows, error: monthlyStageError } = await admin.from('psdeals_stage_items')
        .select('id,psdeals_id,title,current_price_amount,discount_percent,raw_detail_json')
        .in('id', targetItemIds)
      if (monthlyStageError) throw new Error(`FINAL_MONTHLY_STAGE:${monthlyStageError.message}`)
      const leakedMonthlyCommercialRows = (monthlyStageRows || []).filter((row) =>
        Number(row.current_price_amount) === 0 &&
        Number(row.discount_percent) === 100 &&
        ['temporary_free_promotion_candidate', 'extreme_full_discount'].includes(
          row.raw_detail_json?.commercial_state?.classification
        )
      )
      assert(leakedMonthlyCommercialRows.length === 0, `FINAL_MONTHLY_ZERO_PRICE_COMMERCIAL_LEAK:${leakedMonthlyCommercialRows.map((row) => row.psdeals_id).join(',')}`)

      const { data: touchedDetailRows, error: touchedDetailError } = await admin.from('psdeals_stage_items')
        .select('psdeals_id,title,content_type,item_type_label,detail_last_synced_at,raw_detail_json')
        .gte('detail_last_synced_at', cycleRow.started_at)
        .lte('detail_last_synced_at', cycleRow.details_completed_at)
      if (touchedDetailError) throw new Error(`FINAL_DETAIL_CLASSIFICATION_AUDIT:${touchedDetailError.message}`)
      const weakMappedRows = (touchedDetailRows || []).filter((row) => {
        const weak = !row.content_type || row.content_type === 'other' || !row.item_type_label
        return weak && row.raw_detail_json?.type_classification?.can_replace_existing === true
      })
      assert(weakMappedRows.length === 0, `FINAL_WEAK_MAPPED_CLASSIFICATION_REMAINS:${weakMappedRows.map((row) => row.psdeals_id).join(',')}`)

      const { data: unresolvedReceipts, error: unresolvedError } = await admin.from('psdeals_cycle_action_receipts')
        .select('id,action_kind,status').eq('cycle_id', state.remote_cycle_id).in('status', ['intent', 'running', 'indeterminate'])
      if (unresolvedError) throw new Error(`FINAL_RECEIPTS:${unresolvedError.message}`)
      assert((unresolvedReceipts || []).length === 0, `FINAL_UNRESOLVED_RECEIPTS:${JSON.stringify(unresolvedReceipts)}`)

      const pages = []
      for (const pathname of ['/', '/catalog', '/deals']) {
        let response = null
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            response = await fetch(`${PUBLIC_ORIGIN}${pathname}`, { redirect: 'follow', headers: { 'user-agent': 'LoboDeals-Daily-Operator/1' } })
            if (response.ok) break
          } catch {}
          await sleep(10000)
        }
        pages.push({ pathname, status: response?.status || null, ok: response?.ok === true })
      }
      assert(pages.every((row) => row.ok), `FINAL_PUBLIC_PAGE_FAILED:${JSON.stringify(pages)}`)
      const result = {
        stage_count: stageCount,
        cache_count: cacheCount,
        cache_expected_from_committed_receipt: expectedCacheCount,
        stage_rows_not_public_by_cache_contract: nonPublicStageCount,
        monthly_zero_price_commercial_leaks: leakedMonthlyCommercialRows.length,
        weak_mapped_classification_rows: weakMappedRows.length,
        monthly_games: activeMonthly,
        monthly_cache_rows: monthlyCacheRows,
        pages,
        cycle: cycleRow,
        blocked_demotions_preserved: endedFinalRef.blocked_remaining,
        certification_receipt: certification.receipt_id,
        cache_receipt: cache.receipt_id,
        mark_receipt: mark.receipt_id,
      }
      await updatePhaseCheckpoint(path.join(stateDir, 'public-validation', 'checkpoint.json'), { result, phases: { validated: true } })
      return result
    })

    state.status = 'completed'
    state.completed_at = nowIso()
    state.last_error = null
    state.final_verification = verification
    await saveState()
    if (identity.initialMode) {
      await writeJsonAtomic(identity.initialMarker, {
        completed_at: nowIso(),
        run_id: runId,
        remote_cycle_id: state.remote_cycle_id,
        initial_queue_count: INITIAL_QUEUE_COUNT,
        initial_missing_processed: recentMissingItems.length,
        stage_count: verification.stage_count,
      })
    }
    const completedAt = state.completed_at
    const successDate = dateInLima(completedAt)
    const successFile = path.join(operatorRoot, 'daily-success', `${successDate}-${runId}.json`)
    await writeJsonAtomic(successFile, {
      date: successDate,
      run_id: runId,
      remote_cycle_id: state.remote_cycle_id,
      completed_at: completedAt,
      stage_count: verification.stage_count,
      cache_count: verification.cache_count,
    })
    await writeJsonAtomic(activeFile, { run_id: runId, initial_mode: false, runner_version: 2, status: 'completed', completed_at: completedAt, success_file: portable(projectRoot, successFile) })

    log('')
    log('============================================================')
    log('OPERADOR DIARIO COMPLETADO')
    log(`Ciclo remoto: ${state.remote_cycle_id}`)
    log(`Recently Added creados/actualizados: ${recentMissingItems.length}`)
    log(`Descuentos observados: ${discounts.items.length}`)
    log(`Demociones seguras reconciliadas: ${demotionReconcileV126.affected_rows}`)
    log(`Ambiguos preservados: ${endedFinalRef.blocked_remaining}`)
    log(`Monthly Games: ${verification.monthly_games.map((row) => row.title).join(', ')}`)
    log(`Stage/Cache: ${verification.stage_count}/${verification.cache_count}`)
    log(`Estado: ${stateFile}`)
    log('============================================================')
  } finally {
    await fs.rm(lockFile, { force: true })
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`\nLOBODEALS_DAILY_OPERATOR_V1_ERROR: ${error instanceof Error ? error.stack || error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
