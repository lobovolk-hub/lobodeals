import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

import {
  classifyPsdealsEdgeSnapshot,
  PSDEALS_EDGE_CDP_STATES,
  PSDEALS_EDGE_RECENTLY_ADDED_URL,
  selectPsdealsEdgeCdpPort,
  validatePsdealsEdgeLauncherEvidence,
  waitForPsdealsChallengeClear,
} from '../scripts/lib/psdeals-edge-cdp-preflight.mjs'
import { runPsdealsEdgeCdpPreflight } from '../scripts/preflight-psdeals-edge-cdp.mjs'

function readySnapshot(overrides = {}) {
  return {
    cdp_available: true,
    tab_found: true,
    title: 'PS5, PS4 Games — Recently Added',
    url: PSDEALS_EDGE_RECENTLY_ADDED_URL,
    body_text: 'Recently added games',
    card_count: 36,
    listing_container_present: true,
    challenge_markers: [],
    ...overrides,
  }
}

function launcherEvidence(overrides = {}) {
  return {
    launcher_version: 2,
    launch_method: 'powershell_start_process',
    visible: true,
    port: 9222,
    user_data_dir: 'D:\\Proyectos\\lobodeals\\data\\edge\\recovery-profile',
    operational_profile_verified: true,
    terminated_existing_process: false,
    version_endpoint: 'http://127.0.0.1:9222/json/version',
    list_endpoint: 'http://127.0.0.1:9222/json/list',
    canonical_tab_url: PSDEALS_EDGE_RECENTLY_ADDED_URL,
    compatible_process_ids: [100],
    launch_process_id: 100,
    process_id: 100,
    launch_process_exited: false,
    process_handoff_observed: false,
    warnings: [],
    ...overrides,
  }
}

test('Edge state contract covers every required observable state', () => {
  assert.deepEqual(PSDEALS_EDGE_CDP_STATES, [
    'browser_starting', 'cdp_unavailable', 'wrong_tab', 'wrong_domain',
    'wrong_storefront', 'challenge_present', 'challenge_cleared', 'page_ready',
    'timeout', 'browser_closed',
  ])
})

test('snapshot classifier distinguishes CDP, tab, domain, storefront, challenge and ready page', () => {
  assert.equal(classifyPsdealsEdgeSnapshot({}).state, 'cdp_unavailable')
  assert.equal(classifyPsdealsEdgeSnapshot({ cdp_available: true }).state, 'wrong_tab')
  assert.equal(classifyPsdealsEdgeSnapshot(readySnapshot({ url: 'https://example.com/' })).state, 'wrong_domain')
  assert.equal(classifyPsdealsEdgeSnapshot(readySnapshot({ url: 'https://psdeals.net/ca-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc' })).state, 'wrong_storefront')
  assert.equal(classifyPsdealsEdgeSnapshot(readySnapshot({ body_text: 'Verify you are human', card_count: 0 })).state, 'challenge_present')
  assert.equal(classifyPsdealsEdgeSnapshot(readySnapshot()).state, 'page_ready')
})

test('automatic wait observes a challenge without clicks or chat confirmation and continues', async () => {
  const snapshots = [
    readySnapshot({ title: 'Just a moment...', body_text: 'Checking your browser', card_count: 0, listing_container_present: false }),
    readySnapshot(),
  ]
  let clock = 0
  const states = []
  const result = await waitForPsdealsChallengeClear({
    inspect_page: async () => snapshots.shift(),
    sleep: async (ms) => { clock += ms },
    now: () => clock,
    timeout_ms: 10_000,
    poll_ms: 500,
    on_state: async (state) => states.push(state.state),
  })
  assert.deepEqual(states, ['challenge_present', 'challenge_cleared'])
  assert.equal(result.ready, true)
  assert.equal(result.challenge_was_present, true)
  assert.equal(result.chat_confirmation_required, false)
  assert.equal(result.wait_duration_ms, 500)
})

test('persistent challenge times out with a simulated clock', async () => {
  let clock = 0
  const result = await waitForPsdealsChallengeClear({
    inspect_page: async () => readySnapshot({ body_text: 'captcha', card_count: 0, listing_container_present: false }),
    sleep: async (ms) => { clock += ms },
    now: () => clock,
    timeout_ms: 1000,
    poll_ms: 250,
  })
  assert.equal(result.state, 'timeout')
  assert.equal(result.challenge_was_present, true)
})

test('port selection preserves a free preferred port and safely falls back from occupied 9222', () => {
  assert.deepEqual(selectPsdealsEdgeCdpPort({ occupied_ports: [] }), {
    valid: true, selected_port: 9222, preferred_port: 9222, fallback_selected: false, blockers: [],
  })
  assert.equal(selectPsdealsEdgeCdpPort({ occupied_ports: [9222] }).selected_port, 9223)
  assert.equal(selectPsdealsEdgeCdpPort({ occupied_ports: [9222, 9223] }).selected_port, 9224)
  const exhausted = selectPsdealsEdgeCdpPort({ occupied_ports: [9222, 9223, 9224], fallback_start: 9223, fallback_end: 9224 })
  assert.equal(exhausted.valid, false)
  assert.deepEqual(exhausted.blockers, ['edge_cdp_no_free_operational_port'])
})

test('launcher contract accepts PID handoff and initial-process error when CDP remains healthy', () => {
  const profile = 'D:\\Proyectos\\lobodeals\\data\\edge\\recovery-profile'
  assert.equal(validatePsdealsEdgeLauncherEvidence(launcherEvidence(), { expected_profile: profile }).valid, true)
  const handoff = launcherEvidence({
    launch_process_exited: true,
    launch_process_exit_code: 1,
    process_handoff_observed: true,
    process_id: 200,
    compatible_process_ids: [200],
    warnings: ['initial_launch_process_exited_after_handoff'],
  })
  assert.equal(validatePsdealsEdgeLauncherEvidence(handoff, { expected_profile: profile }).valid, true)
  assert.ok(validatePsdealsEdgeLauncherEvidence(
    launcherEvidence({ user_data_dir: 'D:\\Personal\\Edge' }),
    { expected_profile: profile }
  ).blockers.includes('edge_launcher_profile_mismatch'))
  assert.ok(validatePsdealsEdgeLauncherEvidence(
    launcherEvidence({ canonical_tab_url: 'https://psdeals.net/us-store/discounts' }),
    { expected_profile: profile }
  ).blockers.includes('edge_launcher_canonical_tab_invalid'))
})

test('CLI preflight emits waiting text once and performs no collector or remote write', async () => {
  const snapshots = [
    readySnapshot({ body_text: 'captcha', card_count: 0, listing_container_present: false }),
    readySnapshot(),
  ]
  let clock = 0
  let output = ''
  let error = ''
  const exitCode = await runPsdealsEdgeCdpPreflight([
    '--timeout-ms=1000', '--poll-ms=100',
  ], {
    stdout: (value) => { output += value },
    stderr: (value) => { error += value },
  }, {
    inspect_page: async () => snapshots.shift(),
    sleep: async (ms) => { clock += ms },
    now: () => clock,
  })
  assert.equal(exitCode, 0)
  assert.match(error, /PSDeals challenge detected\. Complete it manually in Edge\./)
  assert.match(error, /The runner will continue automatically\./)
  assert.match(error, /\u0007/)
  const report = JSON.parse(output)
  assert.equal(report.classification, 'EDGE_CDP_RUNTIME_PREFLIGHT_PASSED')
  assert.equal(report.collector_executed, false)
  assert.equal(report.remote_writes, 0)
})

test('PowerShell launcher is dedicated, visible and never terminates an existing Edge process', async () => {
  const source = await fs.readFile('scripts/start-psdeals-edge-cdp.ps1', 'utf8')
  assert.match(source, /--remote-debugging-port=\$Port/)
  assert.match(source, /--remote-debugging-address=127\.0\.0\.1/)
  assert.match(source, /--remote-allow-origins=\*/)
  assert.match(source, /--user-data-dir=\$profilePath/)
  assert.match(source, /Start-Process[\s\S]*-PassThru/)
  assert.match(source, /OperationalProfile/)
  assert.match(source, /\$edgeCandidates = @\(@\(/)
  assert.match(source, /process_handoff_observed/)
  assert.match(source, /PortReleaseTimeoutMs/)
  assert.match(source, /waited_for_unverified_port_release/)
  assert.match(source, /operational_profile_verified = \$true/)
  assert.match(source, /no Microsoft Edge process owns the exact operational profile and port/)
  assert.match(source, /FallbackPortStart = 9223/)
  assert.match(source, /FallbackPortEnd = 9232/)
  assert.match(source, /reused_owned_operational_session/)
  assert.match(source, /existing_exact_edge_executable\+exact_profile_process\+exact_port_argument/)
  assert.match(source, /\/json\/version/)
  assert.match(source, /\/json\/list/)
  assert.match(source, /\$rawTargets = Invoke-RestMethod[\s\S]*\$targets = @\(\$rawTargets\)/)
  assert.match(source, /while \(\$canonicalTargets\.Count -lt 1/)
  assert.match(source, /before the startup timeout/)
  assert.match(source, /canonical PSDeals tab/)
  assert.match(source, /initial_launch_process_exited_after_handoff/)
  assert.doesNotMatch(source, /HasExited[\s\S]*throw/)
  assert.doesNotMatch(source, /Stop-Process|taskkill|Get-Process\s+msedge/)
  assert.doesNotMatch(source, /WindowStyle\s+Hidden/)
})

test('repository lint excludes the generated Edge profile and other local data artifacts', async () => {
  const eslint = await fs.readFile(new URL('../eslint.config.mjs', import.meta.url), 'utf8')
  assert.match(eslint, /globalIgnores/)
  assert.match(eslint, /["']data\/\*\*["']/)
})
