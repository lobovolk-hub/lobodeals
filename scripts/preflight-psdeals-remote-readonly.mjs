import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { stablePsdealsEvidenceJson } from './lib/psdeals-evidence-envelope.mjs'
import { evaluatePsdealsRemotePreflight } from './lib/psdeals-remote-preflight.mjs'

function parseArgs(argv) {
  const values = new Map()
  for (const value of argv) {
    if (!value.startsWith('--')) continue
    const index = value.indexOf('=')
    values.set(index < 0 ? value.slice(2) : value.slice(2, index), index < 0 ? true : value.slice(index + 1))
  }
  return values
}

function help() {
  return `LoboDeals remote preflight evaluator\n\n` +
    `Usage: node scripts/preflight-psdeals-remote-readonly.mjs --facts=<redacted-json> [--output=<json>] [--now=<iso>]\n\n` +
    `This CLI opens no network connection and executes no SQL or RPC. It evaluates facts collected separately by an authorized read-only channel.\n` +
    `Exit codes: 0 live-cycle ready; 2 migration ready; 3 migration missing/partial/mismatched; 4 not ready; 1 usage or I/O.\n`
}

export async function runPsdealsRemotePreflightCli(argv, io = {}) {
  const stdout = io.stdout || ((value) => process.stdout.write(value))
  const stderr = io.stderr || ((value) => process.stderr.write(value))
  const args = parseArgs(argv)
  if (args.has('help')) {
    stdout(help())
    return 0
  }
  const factsPath = args.get('facts')
  if (typeof factsPath !== 'string') {
    stderr(help())
    return 1
  }
  try {
    const facts = JSON.parse(await fs.readFile(path.resolve(factsPath), 'utf8'))
    const result = evaluatePsdealsRemotePreflight(facts, {
      now: args.get('now') || facts.checked_at,
    })
    const output = stablePsdealsEvidenceJson(result)
    if (typeof args.get('output') === 'string') {
      await fs.writeFile(path.resolve(args.get('output')), output, { encoding: 'utf8', flag: 'wx' })
    }
    stdout(output)
    return result.classification === 'LIVE_CYCLE_READY'
      ? 0
      : result.classification === 'MIGRATION_READY'
        ? 2
        : [
            'MIGRATION_NOT_APPLIED',
            'MIGRATION_PARTIALLY_APPLIED',
            'MIGRATION_CONTRACT_MISMATCH',
          ].includes(result.classification)
          ? 3
          : 4
  } catch (error) {
    stderr(`PSDEALS_REMOTE_PREFLIGHT error: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

function isMain() {
  return Boolean(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
}

if (isMain()) process.exitCode = await runPsdealsRemotePreflightCli(process.argv.slice(2))
