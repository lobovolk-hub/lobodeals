import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { stablePsdealsUpdaterSimulationJson } from './lib/psdeals-updater-orchestration-core.mjs'
import { runPsdealsUpdaterOrchestratorLocal } from './lib/psdeals-updater-orchestrator-local.mjs'
import { getPsdealsUpdaterSimulationFixture, PSDEALS_UPDATER_SIMULATION_SCENARIOS } from './lib/psdeals-updater-simulation-fixtures.mjs'

export const PSDEALS_UPDATER_SIMULATION_EXIT_CODES = Object.freeze({ success: 0, blocked: 2, invalid_cli: 3 })

function option(argv, name) {
  const prefix = `--${name}=`
  const value = argv.find((entry) => entry.startsWith(prefix))
  return value ? value.slice(prefix.length) : null
}

function help() {
  return [
    'LoboDeals PSDeals updater — OFFLINE SIMULATION ONLY',
    '',
    'Usage:',
    '  npm run simulate:updater-cycle -- --scenario=happy-path --timestamp=2026-08-01T12:00:00.000Z [--json] [--output=data/simulations/result.json]',
    '',
    `Scenarios: ${PSDEALS_UPDATER_SIMULATION_SCENARIOS.join(', ')}`,
    'The command never opens network, Supabase, browsers, or child processes.',
  ].join('\n')
}

export async function runPsdealsUpdaterOrchestratorCli(argv, io = {}) {
  const stdout = io.stdout || ((value) => process.stdout.write(value))
  const stderr = io.stderr || ((value) => process.stderr.write(value))
  if (argv.includes('--help')) {
    stdout(`${help()}\n`)
    return 0
  }
  const forbidden = argv.find((entry) => /^(?:--live|--real|--operational|--url|--project-ref|--token|--credentials|--connection)/i.test(entry))
  const scenario = option(argv, 'scenario')
  const timestamp = option(argv, 'timestamp')
  if (forbidden || !scenario || !timestamp || Number.isNaN(Date.parse(timestamp))) {
    stderr(`${forbidden ? `Forbidden operational argument: ${forbidden}` : 'A valid --scenario and --timestamp are required.'}\n`)
    return PSDEALS_UPDATER_SIMULATION_EXIT_CODES.invalid_cli
  }
  let fixture
  try {
    fixture = getPsdealsUpdaterSimulationFixture(scenario)
  } catch (error) {
    stderr(`${error.message}\n`)
    return PSDEALS_UPDATER_SIMULATION_EXIT_CODES.invalid_cli
  }
  fixture.logical_timestamp = new Date(timestamp).toISOString()
  const result = runPsdealsUpdaterOrchestratorLocal(fixture)
  const json = `${stablePsdealsUpdaterSimulationJson(result, 2)}\n`
  const output = option(argv, 'output')
  if (output) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const allowedRoot = path.resolve(root, 'data', 'simulations')
    const resolved = path.resolve(root, output)
    if (!(resolved === allowedRoot || resolved.startsWith(`${allowedRoot}${path.sep}`))) {
      stderr('Output must remain inside data/simulations.\n')
      return PSDEALS_UPDATER_SIMULATION_EXIT_CODES.invalid_cli
    }
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, json, { encoding: 'utf8', flag: 'wx' })
  }
  if (argv.includes('--json')) stdout(json)
  else stdout([
    'OFFLINE_SIMULATION',
    `STATUS=${result.overall_status}`,
    `RUN_ID=${result.run_id}`,
    `PLANNED_WRITES=${result.planned_writes}`,
    `EXECUTED_WRITES=${result.executed_writes}`,
    `BLOCKERS=${result.blockers.join(',') || 'none'}`,
  ].join('\n') + '\n')
  return result.manifest_validation.valid && result.blockers.length === 0
    ? PSDEALS_UPDATER_SIMULATION_EXIT_CODES.success
    : PSDEALS_UPDATER_SIMULATION_EXIT_CODES.blocked
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exitCode = await runPsdealsUpdaterOrchestratorCli(process.argv.slice(2))
