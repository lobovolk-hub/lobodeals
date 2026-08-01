import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createPsdealsDailyOperationalExecutor,
  inspectPsdealsDailyRefreshCode,
  PSDEALS_DAILY_REPLAY_SCENARIOS,
  runPsdealsDailyLiveGate,
  runPsdealsDailyReplay,
  stringifyPsdealsDailyResult,
} from './lib/psdeals-daily-refresh-v3.mjs'

export const PSDEALS_DAILY_CLI_EXIT_CODES = Object.freeze({
  success: 0,
  usage: 1,
  blocked: 2,
  requires_johan: 3,
  requires_reconciliation: 4,
})

function parse(argv) {
  const values = [...argv]
  const mode = values.shift() || 'help'
  const options = new Map()
  for (const value of values) {
    if (!value.startsWith('--')) continue
    const split = value.indexOf('=')
    options.set(split < 0 ? value.slice(2) : value.slice(2, split), split < 0 ? true : value.slice(split + 1))
  }
  return { mode, options }
}

function help() {
  return `LoboDeals 3.2 daily refresh v3

Modes:
  validate [--json]
  replay --scenario=<name|all> --timestamp=<iso> [--json]
  live --authorization-file=<json> --remote-preflight-file=<json> --vercel-file=<json> --edge-file=<json> --captcha-file=<json>

Replay scenarios: ${PSDEALS_DAILY_REPLAY_SCENARIOS.join(', ')}

validate and replay never use network, Supabase, Edge or child processes.
live fails closed before binding an executor unless every authorization gate passes.
`
}

async function readBoundedJson(file, label) {
  if (typeof file !== 'string' || !file.trim()) throw new Error(`${label}_file_required`)
  const stat = await fs.stat(path.resolve(file))
  if (stat.size > 1024 * 1024) throw new Error(`${label}_file_too_large`)
  return JSON.parse(await fs.readFile(path.resolve(file), 'utf8'))
}

export async function runPsdealsDailyRefreshCli(argv, io = {}, dependencies = {}) {
  const stdout = io.stdout || ((value) => process.stdout.write(value))
  const stderr = io.stderr || ((value) => process.stderr.write(value))
  const { mode, options } = parse(argv)
  if (mode === 'help' || options.has('help')) {
    stdout(help())
    return PSDEALS_DAILY_CLI_EXIT_CODES.success
  }
  try {
    const inspection = await inspectPsdealsDailyRefreshCode({ project_root: dependencies.project_root || process.cwd() })
    if (mode === 'validate') {
      stdout(stringifyPsdealsDailyResult({ mode, ...inspection }))
      return inspection.DAILY_RUNNER_CODE_READY ? 0 : PSDEALS_DAILY_CLI_EXIT_CODES.blocked
    }
    if (mode === 'replay') {
      const scenario = options.get('scenario')
      const timestamp = options.get('timestamp')
      const scenarios = scenario === 'all' ? PSDEALS_DAILY_REPLAY_SCENARIOS : [scenario]
      if (scenarios.some((value) => !PSDEALS_DAILY_REPLAY_SCENARIOS.includes(value)) || !Number.isFinite(Date.parse(timestamp))) {
        throw new Error('replay_scenario_and_timestamp_required')
      }
      const results = scenarios.map((value) => runPsdealsDailyReplay({
        scenario: value,
        logical_timestamp: timestamp,
        code_head: dependencies.code_head || 'local-uncommitted',
        migration_007_sha256: inspection.migration_007_sha256,
      }))
      const report = {
        mode,
        scenarios: results,
        passed: results.every((value) => value.passed),
        executed_writes: results.reduce((sum, value) => sum + value.executed_writes, 0),
        opens_connections: false,
        executes_processes: false,
        uses_supabase: false,
      }
      stdout(stringifyPsdealsDailyResult(scenario === 'all' ? report : results[0]))
      return report.passed ? 0 : PSDEALS_DAILY_CLI_EXIT_CODES.blocked
    }
    if (mode === 'live') {
      const authorization = await readBoundedJson(options.get('authorization-file'), 'authorization')
      const remotePreflight = await readBoundedJson(options.get('remote-preflight-file'), 'remote_preflight')
      const vercel = await readBoundedJson(options.get('vercel-file'), 'vercel')
      const edge = await readBoundedJson(options.get('edge-file'), 'edge')
      const captcha = await readBoundedJson(options.get('captcha-file'), 'captcha')
      const liveExecutor = dependencies.live_executor ||
        (dependencies.operational_adapters
          ? createPsdealsDailyOperationalExecutor({ adapters: dependencies.operational_adapters })
          : null)
      const result = await runPsdealsDailyLiveGate({
        authorization,
        remote_preflight: remotePreflight,
        vercel,
        edge_cdp: edge,
        captcha,
        migration_007_sha256: inspection.migration_007_sha256,
        code_head: dependencies.code_head || authorization.code_head,
        env: dependencies.env || process.env,
        now: dependencies.now || new Date().toISOString(),
        live_executor: liveExecutor,
      })
      stdout(stringifyPsdealsDailyResult(result))
      if (result.classification === 'REQUIRES_JOHAN') return PSDEALS_DAILY_CLI_EXIT_CODES.requires_johan
      if (result.classification === 'REQUIRES_RECONCILIATION') return PSDEALS_DAILY_CLI_EXIT_CODES.requires_reconciliation
      return result.classification === 'GO' ? 0 : PSDEALS_DAILY_CLI_EXIT_CODES.blocked
    }
    stderr(help())
    return PSDEALS_DAILY_CLI_EXIT_CODES.usage
  } catch (error) {
    stderr(`DAILY_REFRESH_V3_ERROR: ${error instanceof Error ? error.message : String(error)}\n`)
    return PSDEALS_DAILY_CLI_EXIT_CODES.usage
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exitCode = await runPsdealsDailyRefreshCli(process.argv.slice(2))
