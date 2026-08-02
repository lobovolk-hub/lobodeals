import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createPsdealsEdgeCdpInspector,
  PSDEALS_EDGE_RECENTLY_ADDED_URL,
  waitForPsdealsChallengeClear,
} from './lib/psdeals-edge-cdp-preflight.mjs'

function parse(argv) {
  const options = new Map()
  for (const value of argv) {
    if (!value.startsWith('--')) continue
    const split = value.indexOf('=')
    options.set(split < 0 ? value.slice(2) : value.slice(2, split), split < 0 ? true : value.slice(split + 1))
  }
  return options
}

function runBoundedProcess(executable, args, { cwd, timeout_ms = 120000, output_limit = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks = { stdout: [], stderr: [] }
    let bytes = 0
    let exceeded = false
    const collect = (kind, chunk) => {
      bytes += chunk.length
      if (bytes > output_limit) { exceeded = true; child.kill(); return }
      chunks[kind].push(chunk)
    }
    child.stdout.on('data', (chunk) => collect('stdout', chunk))
    child.stderr.on('data', (chunk) => collect('stderr', chunk))
    const timer = setTimeout(() => child.kill(), timeout_ms)
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      const stdout = Buffer.concat(chunks.stdout).toString('utf8').trim()
      const stderr = Buffer.concat(chunks.stderr).toString('utf8').trim()
      if (exceeded) return reject(new Error('EDGE_LAUNCH_OUTPUT_LIMIT_EXCEEDED'))
      if (code !== 0) return reject(new Error(`EDGE_LAUNCH_FAILED: ${stderr || `exit ${code}`}`))
      resolve(stdout)
    })
  })
}

export async function runPsdealsEdgeCdpPreflight(argv, io = {}, dependencies = {}) {
  const stdout = io.stdout || ((value) => process.stdout.write(value))
  const stderr = io.stderr || ((value) => process.stderr.write(value))
  const options = parse(argv)
  const port = Number(options.get('port') || 9222)
  const timeoutMs = Number(options.get('timeout-ms') || 15 * 60 * 1000)
  const pollMs = Number(options.get('poll-ms') || 2000)
  const url = String(options.get('url') || PSDEALS_EDGE_RECENTLY_ADDED_URL)
  let launch = dependencies.launch_result || null
  if (options.has('launch') && !launch) {
    const projectRoot = dependencies.project_root || process.cwd()
    const powershell = dependencies.powershell_executable || path.join(
      process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
    )
    const script = path.join(projectRoot, 'scripts', 'start-psdeals-edge-cdp.ps1')
    const raw = await (dependencies.run_process || runBoundedProcess)(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, '-Url', url, '-Port', String(port), '-Json',
    ], { cwd: projectRoot })
    launch = JSON.parse(raw)
  }
  const inspectPage = dependencies.inspect_page || createPsdealsEdgeCdpInspector({ port, expected_url: url })
  let waitingMessageShown = false
  const result = await waitForPsdealsChallengeClear({
    inspect_page: inspectPage,
    sleep: dependencies.sleep,
    now: dependencies.now,
    timeout_ms: timeoutMs,
    poll_ms: pollMs,
    expected_url: url,
    on_state: async (state) => {
      if (state.state === 'challenge_present' && !waitingMessageShown) {
        stderr('Waiting for Johan to complete the PSDeals challenge in Edge...\n')
        waitingMessageShown = true
      }
    },
  })
  const report = {
    preflight_version: 1,
    classification: result.ready ? 'EDGE_CDP_RUNTIME_PREFLIGHT_PASSED' : 'EDGE_CDP_RUNTIME_PREFLIGHT_BLOCKED',
    launcher: launch,
    ...result,
    port,
    expected_url: url,
    collector_executed: false,
    listing_saved: false,
    imports_executed: false,
    remote_writes: 0,
  }
  stdout(`${JSON.stringify(report, null, 2)}\n`)
  return result.ready ? 0 : 2
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try { process.exitCode = await runPsdealsEdgeCdpPreflight(process.argv.slice(2)) }
  catch (error) {
    process.stderr.write(`EDGE_CDP_PREFLIGHT_ERROR: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
