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
import { evaluatePsdealsRecoveryLivePreflight } from './lib/psdeals-daily-live-preflight.mjs'
import { runPsdealsEdgeCdpPreflight } from './preflight-psdeals-edge-cdp.mjs'

export const PSDEALS_DAILY_CLI_EXIT_CODES = Object.freeze({
  success: 0,
  usage: 1,
  blocked: 2,
  requires_johan: 3,
  requires_reconciliation: 4,
})

function parse(argv) {
  const values = [...argv]
  let mode = values[0]?.startsWith('--') ? null : values.shift()
  const options = new Map()
  for (const value of values) {
    if (!value.startsWith('--')) continue
    const split = value.indexOf('=')
    options.set(split < 0 ? value.slice(2) : value.slice(2, split), split < 0 ? true : value.slice(split + 1))
  }
  mode ||= typeof options.get('mode') === 'string' ? options.get('mode') : 'help'
  return { mode, options }
}

function help() {
  return `LoboDeals 3.2 daily refresh v3

Modes:
  validate [--json]
  replay --scenario=<name|all> --timestamp=<iso> [--json]
  live-preflight --remote-preflight-file=<json> --vercel-file=<json> --run-intent-id=<local-cycle-...> [--launch-edge|--edge-file=<json>]
  live --authorization-file=<json> --remote-preflight-file=<json> --vercel-file=<json> --edge-file=<json>

Replay scenarios: ${PSDEALS_DAILY_REPLAY_SCENARIOS.join(', ')}

validate and replay never use network, Supabase, Edge or child processes.
live-preflight performs only local/read-only gates and stops before create_cycle.
live binds the production stage executor before evaluating authorization gates.
`
}

async function readBoundedJson(file, label) {
  if (typeof file !== 'string' || !file.trim()) throw new Error(`${label}_file_required`)
  const stat = await fs.stat(path.resolve(file))
  if (stat.size > 1024 * 1024) throw new Error(`${label}_file_too_large`)
  return JSON.parse(await fs.readFile(path.resolve(file), 'utf8'))
}

export async function readPsdealsLocalGitHead(projectRoot = process.cwd()) {
  const gitPath = path.join(path.resolve(projectRoot), '.git')
  const gitStat = await fs.stat(gitPath)
  let gitDirectory = gitPath
  if (gitStat.isFile()) {
    const pointer = (await fs.readFile(gitPath, 'utf8')).trim()
    if (!pointer.startsWith('gitdir: ')) throw new Error('git_directory_pointer_invalid')
    gitDirectory = path.resolve(path.dirname(gitPath), pointer.slice('gitdir: '.length))
  }
  const head = (await fs.readFile(path.join(gitDirectory, 'HEAD'), 'utf8')).trim()
  let revision = head
  if (head.startsWith('ref: ')) {
    const ref = head.slice('ref: '.length)
    if (!/^refs\/[A-Za-z0-9._\/-]+$/.test(ref) || ref.includes('..')) throw new Error('git_head_ref_invalid')
    try {
      revision = (await fs.readFile(path.join(gitDirectory, ...ref.split('/')), 'utf8')).trim()
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const packed = await fs.readFile(path.join(gitDirectory, 'packed-refs'), 'utf8')
      revision = packed.split(/\r?\n/)
        .map((line) => line.trim().split(' '))
        .find((parts) => parts.length === 2 && parts[1] === ref)?.[0] || ''
    }
  }
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('git_head_revision_invalid')
  return revision
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
    const inspection = await inspectPsdealsDailyRefreshCode({
      project_root: dependencies.project_root || process.cwd(),
      production_adapters: dependencies.operational_adapters,
    })
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
    if (mode === 'live-preflight') {
      const remotePreflight = await readBoundedJson(options.get('remote-preflight-file'), 'remote_preflight')
      const vercel = await readBoundedJson(options.get('vercel-file'), 'vercel')
      const actualCodeHead = dependencies.code_head || await readPsdealsLocalGitHead(
        dependencies.project_root || process.cwd()
      )
      let edge
      if (typeof options.get('edge-file') === 'string') {
        edge = await readBoundedJson(options.get('edge-file'), 'edge')
      } else {
        let edgeOutput = ''
        let edgeError = ''
        const edgeExit = await (dependencies.run_edge_preflight || runPsdealsEdgeCdpPreflight)([
          ...(options.has('launch-edge') ? ['--launch'] : []),
          `--timeout-ms=${options.get('edge-timeout-ms') || 15 * 60 * 1000}`,
          `--poll-ms=${options.get('edge-poll-ms') || 2000}`,
        ], {
          stdout: (value) => { edgeOutput += value },
          stderr: (value) => { edgeError += value; stderr(value) },
        }, dependencies.edge_dependencies || {})
        if (edgeExit !== 0) throw new Error(`edge_runtime_preflight_failed: ${edgeError.trim() || edgeExit}`)
        edge = JSON.parse(edgeOutput)
      }
      const result = evaluatePsdealsRecoveryLivePreflight({
        inspection,
        remote_preflight: remotePreflight,
        vercel_evidence: vercel,
        edge_runtime: edge,
        run_intent_id: options.get('run-intent-id'),
        code_head: actualCodeHead,
        now: dependencies.now || new Date().toISOString(),
      })
      stdout(stringifyPsdealsDailyResult(result))
      return result.ready ? 0 : PSDEALS_DAILY_CLI_EXIT_CODES.blocked
    }
    if (mode === 'live') {
      const authorization = await readBoundedJson(options.get('authorization-file'), 'authorization')
      const remotePreflight = await readBoundedJson(options.get('remote-preflight-file'), 'remote_preflight')
      const vercel = await readBoundedJson(options.get('vercel-file'), 'vercel')
      const edge = await readBoundedJson(options.get('edge-file'), 'edge')
      const actualCodeHead = dependencies.code_head || await readPsdealsLocalGitHead(
        dependencies.project_root || process.cwd()
      )
      const liveExecutor = dependencies.live_executor || (
        inspection.LIVE_EXECUTOR_BOUND
          ? createPsdealsDailyOperationalExecutor({ adapters: dependencies.operational_adapters })
          : undefined
      )
      const result = await runPsdealsDailyLiveGate({
        authorization,
        remote_preflight: remotePreflight,
        vercel,
        edge_cdp: edge,
        migration_007_sha256: inspection.migration_007_sha256,
        certificate_007_sha256: inspection.certificate_007_sha256,
        code_head: actualCodeHead,
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
