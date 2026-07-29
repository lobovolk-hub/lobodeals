import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { createPsdealsFixtureAdapters } from './lib/psdeals-cycle-fixture-adapters.mjs'
import {
  planPsdealsCycleRun,
  PSDEALS_CYCLE_RUNNER_EXIT_CODES,
  redactPsdealsRunToken,
  runPsdealsCycle,
  verifyPsdealsCycleWorkspaceEvidence,
} from './lib/psdeals-cycle-runner.mjs'
import { readPsdealsCycleLedger } from './lib/psdeals-cycle-ledger.mjs'
import {
  acquirePsdealsCycleLock,
  releasePsdealsCycleLock,
} from './lib/psdeals-cycle-lock.mjs'
import {
  initializePsdealsCycleWorkspace,
  openPsdealsCycleWorkspace,
} from './lib/psdeals-cycle-workspace.mjs'

const DEFAULT_CONTEXT = {
  requested_url: 'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc',
  platforms: ['PS5', 'PS4'],
  content_types: ['games', 'bundles', 'dlc'],
  order: 'best-new-deals',
}

function parseArgs(argv) {
  const values = [...argv]
  const command = values.shift() || 'help'
  const options = new Map()
  for (const value of values) {
    if (!value.startsWith('--')) continue
    const split = value.indexOf('=')
    options.set(split < 0 ? value.slice(2) : value.slice(2, split), split < 0 ? true : value.slice(split + 1))
  }
  return { command, options }
}

function help() {
  return `LoboDeals PSDeals cycle runner

Safe defaults: plan and offline validation. This CLI cannot enable operational actions.

Commands:
  init --cycles-root=<path> --code-revision=<sha> [--mode=plan|fixture|offline_validation|operational]
  plan --workspace=<path>
  status --workspace=<path>
  verify --workspace=<path> [--now=<iso>]
  run-fixture --workspace=<path>
  assemble --workspace=<path> [--now=<iso>]
  resume --workspace=<path>
  explain-blockers --workspace=<path>

Exit codes:
  0 success; 1 usage/I-O; 2 invalid evidence; 3 indeterminate; 4 blocked;
  5 awaiting authorization; 6 stage failure; 7 workspace corruption; 8 active lock.

No command runs collectors, Supabase, SQL, demotion, certification, cache, or network.
`
}

function redactOutput(value) {
  if (Array.isArray(value)) return value.map(redactOutput)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === 'run_token'
        ? redactPsdealsRunToken(entry)
        : redactOutput(entry),
    ])
  )
}

function printable(value) {
  return `${JSON.stringify(redactOutput(value), null, 2)}\n`
}

async function workspaceFrom(options) {
  const value = options.get('workspace')
  if (typeof value !== 'string' || !value.trim()) throw new Error('--workspace is required')
  return openPsdealsCycleWorkspace({ workspace_dir: path.resolve(value) })
}

async function withFixtureLock(workspace, callback) {
  let lock
  try {
    lock = await acquirePsdealsCycleLock({ workspace })
  } catch (error) {
    if (String(error?.message || error).includes('CYCLE_LOCK_ACTIVE')) {
      return { exit_code: PSDEALS_CYCLE_RUNNER_EXIT_CODES.lock_active, blockers: ['cycle_lock_active'] }
    }
    throw error
  }
  try {
    return await callback(lock)
  } finally {
    await releasePsdealsCycleLock({ workspace, owner_token: lock.owner_token })
  }
}

export async function runPsdealsCycleCli(argv, io = {}) {
  const stdout = io.stdout || ((value) => process.stdout.write(value))
  const stderr = io.stderr || ((value) => process.stderr.write(value))
  const { command, options } = parseArgs(argv)
  if (command === 'help' || options.has('help')) {
    stdout(help())
    return 0
  }
  try {
    if (command === 'init') {
      const cyclesRoot = options.get('cycles-root')
      const codeRevision = options.get('code-revision')
      if (typeof cyclesRoot !== 'string' || typeof codeRevision !== 'string') throw new Error('--cycles-root and --code-revision are required')
      const workspace = await initializePsdealsCycleWorkspace({
        cycles_root: path.resolve(cyclesRoot),
        mode: options.get('mode') || 'plan',
        code_revision: codeRevision,
        context: DEFAULT_CONTEXT,
      })
      stdout(printable({ initialized: true, root_dir: workspace.root_dir, ...workspace.identity }))
      return 0
    }

    const workspace = await workspaceFrom(options)
    const ledger = await readPsdealsCycleLedger({ workspace })
    if (command === 'status' || command === 'plan' || command === 'explain-blockers') {
      const result = planPsdealsCycleRun({ workspace, ledger })
      stdout(printable(command === 'explain-blockers' ? { ...result, adapter_readiness: (await import('./lib/psdeals-cycle-runner.mjs')).PSDEALS_OPERATIONAL_ADAPTER_READINESS } : result))
      return ledger.valid ? 0 : PSDEALS_CYCLE_RUNNER_EXIT_CODES.workspace_corrupt
    }
    if (command === 'verify' || command === 'assemble') {
      const result = await verifyPsdealsCycleWorkspaceEvidence({
        workspace,
        now: options.get('now') || new Date().toISOString(),
      })
      stdout(printable(result))
      return result.classification === 'indeterminate'
        ? PSDEALS_CYCLE_RUNNER_EXIT_CODES.state_indeterminate
        : result.valid
          ? 0
          : PSDEALS_CYCLE_RUNNER_EXIT_CODES.evidence_invalid
    }
    if (command === 'run-fixture' || command === 'resume') {
      if (workspace.identity.mode !== 'fixture') throw new Error('run-fixture and resume require a fixture workspace')
      const result = await withFixtureLock(workspace, (lock) =>
        runPsdealsCycle({
          workspace,
          owner_token: lock.owner_token,
          mode: 'fixture',
          adapters: createPsdealsFixtureAdapters(),
        })
      )
      stdout(printable(result))
      return result.exit_code
    }
    stderr(help())
    return PSDEALS_CYCLE_RUNNER_EXIT_CODES.usage_or_io_error
  } catch (error) {
    stderr(`PSDEALS_CYCLE_RUNNER error: ${error instanceof Error ? error.message : String(error)}\n`)
    return PSDEALS_CYCLE_RUNNER_EXIT_CODES.usage_or_io_error
  }
}

function isMain() {
  return Boolean(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
}

if (isMain()) process.exitCode = await runPsdealsCycleCli(process.argv.slice(2))
