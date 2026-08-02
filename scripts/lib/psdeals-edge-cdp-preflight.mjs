export const PSDEALS_EDGE_CDP_PREFLIGHT_VERSION = 1

export const PSDEALS_EDGE_CDP_STATES = Object.freeze([
  'browser_starting',
  'cdp_unavailable',
  'wrong_tab',
  'wrong_domain',
  'wrong_storefront',
  'challenge_present',
  'challenge_cleared',
  'page_ready',
  'timeout',
  'browser_closed',
])

const CHALLENGE_PATTERNS = Object.freeze([
  /captcha/i,
  /verify (?:that )?you are human/i,
  /checking your browser/i,
  /just a moment/i,
  /cf-chl-/i,
  /cloudflare/i,
])

const DEFAULT_URL = 'https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'

function parseUrl(value) {
  try { return new URL(value) } catch { return null }
}

function requiredFiltersPresent(url) {
  const platforms = url.searchParams.get('platforms')?.split(',') || []
  const contentTypes = url.searchParams.getAll('contentType[]')
  return url.searchParams.get('sort') === 'recently-added' &&
    platforms.length === 2 && platforms.includes('ps5') && platforms.includes('ps4') &&
    ['games', 'bundles', 'dlc'].every((value) => contentTypes.includes(value))
}

export function selectPsdealsEdgeCdpPort({
  preferred_port = 9222,
  fallback_start = 9223,
  fallback_end = 9232,
  occupied_ports = [],
} = {}) {
  if (!Number.isSafeInteger(preferred_port) || preferred_port < 1024 || preferred_port > 65535 ||
      !Number.isSafeInteger(fallback_start) || !Number.isSafeInteger(fallback_end) ||
      fallback_start > fallback_end || fallback_end - fallback_start > 9) {
    return { valid: false, selected_port: null, blockers: ['edge_cdp_port_range_invalid'] }
  }
  const occupied = new Set(occupied_ports)
  const candidates = preferred_port === 9222
    ? [preferred_port, ...Array.from({ length: fallback_end - fallback_start + 1 }, (_, index) => fallback_start + index)]
    : [preferred_port]
  const selected = candidates.find((port) => !occupied.has(port)) ?? null
  return {
    valid: selected !== null,
    selected_port: selected,
    preferred_port,
    fallback_selected: selected !== null && selected !== preferred_port,
    blockers: selected === null ? ['edge_cdp_no_free_operational_port'] : [],
  }
}

export function validatePsdealsEdgeLauncherEvidence(
  evidence = {},
  { expected_url = DEFAULT_URL, expected_profile } = {}
) {
  const blockers = []
  const port = Number(evidence.port)
  if (evidence.launcher_version !== 2) blockers.push('edge_launcher_version_invalid')
  if (evidence.launch_method !== 'powershell_start_process' || evidence.visible !== true) blockers.push('edge_launcher_visibility_invalid')
  if (!Number.isSafeInteger(port) || port < 9222 || port > 9232) blockers.push('edge_launcher_port_invalid')
  if (evidence.operational_profile_verified !== true || evidence.terminated_existing_process !== false) blockers.push('edge_launcher_profile_contract_invalid')
  if (expected_profile && pathValue(evidence.user_data_dir) !== pathValue(expected_profile)) blockers.push('edge_launcher_profile_mismatch')
  if (evidence.version_endpoint !== `http://127.0.0.1:${port}/json/version`) blockers.push('edge_launcher_version_endpoint_invalid')
  if (evidence.list_endpoint !== `http://127.0.0.1:${port}/json/list`) blockers.push('edge_launcher_list_endpoint_invalid')
  const target = parseUrl(evidence.canonical_tab_url)
  const expected = parseUrl(expected_url)
  if (!target || !expected || target.hostname !== 'psdeals.net' || target.pathname !== expected.pathname || !requiredFiltersPresent(target)) {
    blockers.push('edge_launcher_canonical_tab_invalid')
  }
  if (!Array.isArray(evidence.compatible_process_ids) || evidence.compatible_process_ids.length < 1) blockers.push('edge_launcher_compatible_process_missing')
  if (evidence.launch_process_exited === true && evidence.process_handoff_observed !== true) blockers.push('edge_launcher_exit_without_handoff')
  return { valid: blockers.length === 0, blockers: [...new Set(blockers)] }
}

function pathValue(value) {
  return typeof value === 'string' ? value.replaceAll('/', '\\').toLowerCase() : ''
}

export function classifyPsdealsEdgeSnapshot(snapshot = {}, { expected_url = DEFAULT_URL } = {}) {
  if (snapshot.browser_closed === true) return { state: 'browser_closed', ready: false }
  if (snapshot.cdp_available !== true) return { state: 'cdp_unavailable', ready: false }
  if (snapshot.tab_found !== true) return { state: 'wrong_tab', ready: false }
  const url = parseUrl(snapshot.url)
  const expected = parseUrl(expected_url)
  if (!url || url.protocol !== 'https:' || url.hostname !== 'psdeals.net') {
    return { state: 'wrong_domain', ready: false }
  }
  if (!expected || url.pathname !== expected.pathname || !url.pathname.startsWith('/us-store/') || !requiredFiltersPresent(url)) {
    return { state: 'wrong_storefront', ready: false }
  }
  const text = [snapshot.title, snapshot.body_text, ...(snapshot.challenge_markers || [])]
    .filter(Boolean).join('\n')
  const challenge = snapshot.challenge_present === true || CHALLENGE_PATTERNS.some((pattern) => pattern.test(text))
  if (challenge) return { state: 'challenge_present', ready: false }
  const cards = Number(snapshot.card_count || 0)
  const structureReady = snapshot.listing_container_present === true && cards > 0
  if (!structureReady) return { state: 'wrong_tab', ready: false }
  return {
    state: snapshot.challenge_was_present === true ? 'challenge_cleared' : 'page_ready',
    ready: true,
    page: {
      title: snapshot.title || null,
      url: url.href,
      domain: url.hostname,
      storefront: 'playstation',
      region: 'us',
      card_count: cards,
    },
  }
}

export async function waitForPsdealsChallengeClear({
  inspect_page,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => Date.now(),
  timeout_ms = 15 * 60 * 1000,
  poll_ms = 2000,
  expected_url = DEFAULT_URL,
  on_state = () => {},
} = {}) {
  if (typeof inspect_page !== 'function') throw new Error('EDGE_INSPECT_PAGE_PORT_REQUIRED')
  if (!Number.isSafeInteger(timeout_ms) || timeout_ms < 1000 || timeout_ms > 30 * 60 * 1000) {
    throw new Error('EDGE_CHALLENGE_TIMEOUT_INVALID')
  }
  if (!Number.isSafeInteger(poll_ms) || poll_ms < 100 || poll_ms > 30_000) {
    throw new Error('EDGE_CHALLENGE_POLL_INVALID')
  }
  const startedAt = now()
  let challengeWasPresent = false
  let last = null
  while (now() - startedAt <= timeout_ms) {
    const snapshot = await inspect_page()
    const classified = classifyPsdealsEdgeSnapshot(
      { ...snapshot, challenge_was_present: challengeWasPresent },
      { expected_url }
    )
    last = classified
    if (classified.state === 'challenge_present') challengeWasPresent = true
    await on_state(classified)
    if (classified.ready) {
      return {
        ...classified,
        challenge_was_present: challengeWasPresent,
        wait_duration_ms: Math.max(0, now() - startedAt),
        chat_confirmation_required: false,
      }
    }
    if (['wrong_domain', 'wrong_storefront', 'browser_closed'].includes(classified.state)) {
      return { ...classified, wait_duration_ms: Math.max(0, now() - startedAt) }
    }
    await sleep(poll_ms)
  }
  return {
    state: 'timeout',
    ready: false,
    previous_state: last?.state || null,
    challenge_was_present: challengeWasPresent,
    wait_duration_ms: Math.max(0, now() - startedAt),
  }
}

function websocketClient(endpoint, timeoutMs) {
  let sequence = 0
  const pending = new Map()
  const socket = new WebSocket(endpoint)
  const opened = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('EDGE_CDP_WEBSOCKET_OPEN_TIMEOUT')), timeoutMs)
    socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('EDGE_CDP_WEBSOCKET_OPEN_FAILED')) }, { once: true })
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const entry = pending.get(message.id)
    if (!entry) return
    clearTimeout(entry.timer)
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(`EDGE_CDP_COMMAND_FAILED: ${JSON.stringify(message.error)}`))
    else entry.resolve(message.result)
  })
  return {
    opened,
    send(method, params = {}) {
      sequence += 1
      const id = sequence
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`EDGE_CDP_COMMAND_TIMEOUT: ${method}`))
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
      })
      socket.send(JSON.stringify({ id, method, params }))
      return promise
    },
    close() { socket.close() },
  }
}

export function createPsdealsEdgeCdpInspector({
  port = 9222,
  expected_url = DEFAULT_URL,
  fetch_impl = globalThis.fetch,
  command_timeout_ms = 15_000,
} = {}) {
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error('EDGE_CDP_PORT_INVALID')
  }
  if (typeof fetch_impl !== 'function') throw new Error('EDGE_CDP_FETCH_PORT_REQUIRED')
  return async function inspectPsdealsEdgePage() {
    let targets
    try {
      const response = await fetch_impl(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(command_timeout_ms),
      })
      if (!response.ok) return { cdp_available: false, tab_found: false }
      targets = await response.json()
    } catch {
      return { cdp_available: false, tab_found: false }
    }
    const expected = parseUrl(expected_url)
    const pages = (Array.isArray(targets) ? targets : []).filter((target) => target.type === 'page')
    const target = pages.find((entry) => {
      const url = parseUrl(entry.url)
      return url?.hostname === 'psdeals.net' && url.pathname === expected?.pathname &&
        requiredFiltersPresent(url)
    })
    if (!target?.webSocketDebuggerUrl) return { cdp_available: true, tab_found: false }
    const client = websocketClient(target.webSocketDebuggerUrl, command_timeout_ms)
    try {
      await client.opened
      const expression = `(() => {
        const bodyText = (document.body?.innerText || '').slice(0, 20000)
        const cards = document.querySelectorAll('a.game-collection-item-link[href*="/us-store/game/"]')
        const challengeMarkers = Array.from(document.querySelectorAll('[id*="challenge"], [class*="challenge"], [class*="captcha"], iframe[src*="challenge"]')).slice(0, 20).map((node) => node.id || node.className || node.getAttribute('src'))
        return {
          title: document.title,
          url: location.href,
          body_text: bodyText,
          card_count: cards.length,
          listing_container_present: Boolean(document.querySelector('.game-collection, .game-collection-list, [class*="game-collection"]')),
          challenge_markers: challengeMarkers,
        }
      })()`
      const evaluated = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      return {
        cdp_available: true,
        tab_found: true,
        ...(evaluated?.result?.value || {}),
      }
    } catch (error) {
      return {
        cdp_available: false,
        tab_found: true,
        browser_closed: /closed|socket|target/i.test(String(error?.message || error)),
      }
    } finally {
      client.close()
    }
  }
}

export const PSDEALS_EDGE_RECENTLY_ADDED_URL = DEFAULT_URL
