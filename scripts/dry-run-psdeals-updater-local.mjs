import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { runPsdealsUpdaterDryRun } from './lib/psdeals-updater-dry-run.mjs'

export function runPsdealsUpdaterDryRunCli(argv, io = {}) {
  const stdout = io.stdout || ((value) => process.stdout.write(value))
  const stderr = io.stderr || ((value) => process.stderr.write(value))
  if (argv.includes('--help')) {
    stdout('Usage: npm run dry-run:updater\nOffline deterministic validation only; no network, Supabase, processes, or production files.\n')
    return 0
  }
  if (argv.length > 0) {
    stderr('UPDATER_DRY_RUN does not accept operational arguments.\n')
    return 1
  }
  const report = runPsdealsUpdaterDryRun()
  stdout(`${JSON.stringify(report, null, 2)}\n`)
  return report.remote_writes_executed === 0 ? 0 : 2
}

function isMain() {
  return Boolean(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
}

if (isMain()) process.exitCode = runPsdealsUpdaterDryRunCli(process.argv.slice(2))
