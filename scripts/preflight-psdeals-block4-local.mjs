import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { auditLocalPriceHistoryDependencies } from './lib/price-history-dependency-audit.mjs'
import {
  PSDEALS_BLOCK4_CAPABILITIES,
  validatePsdealsBlock4Map,
} from './lib/psdeals-block4-map.mjs'
import { evaluatePsdealsBlock4LocalReadiness } from './lib/psdeals-block4-readiness.mjs'
import {
  PSDEALS_APPLIED_006_SHA256,
  evaluatePsdealsPost006Checkpoint,
} from './lib/psdeals-post-006-state.mjs'
import { runPsdealsUpdaterDryRun } from './lib/psdeals-updater-dry-run.mjs'

function argValue(argv, name) {
  const prefix = `--${name}=`
  const found = argv.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

async function fileExists(file) {
  try { await fs.access(file); return true } catch { return false }
}

async function staticExecutionGateCheck() {
  const [importer, demoter, cache, port] = await Promise.all([
    fs.readFile('scripts/import-psdeals-detail-local.mjs', 'utf8'),
    fs.readFile('scripts/apply-psdeals-ended-discounts-safe-demotion-v1.mjs', 'utf8'),
    fs.readFile('scripts/refresh-catalog-public-cache-v15.mjs', 'utf8'),
    fs.readFile('scripts/lib/psdeals-supabase-port.mjs', 'utf8'),
  ])
  const checks = {
    importer_intent_before_client:
      importer.indexOf('assertPsdealsRemoteExecutionIntent({') >= 0 &&
      importer.indexOf('assertPsdealsRemoteExecutionIntent({') < importer.indexOf('const admin = createClient'),
    legacy_demotion_disabled_before_client:
      demoter.indexOf('LEGACY_DIRECT_DEMOTION_DISABLED') >= 0 &&
      demoter.indexOf('LEGACY_DIRECT_DEMOTION_DISABLED') < demoter.indexOf('const admin = createClient'),
    legacy_cache_v15_disabled_before_client:
      cache.indexOf('LEGACY_CACHE_REFRESH_V15_DISABLED') >= 0 &&
      cache.indexOf('LEGACY_CACHE_REFRESH_V15_DISABLED') < cache.indexOf('const admin = createClient'),
    operational_port_requires_intent:
      port.includes('assertPsdealsRemoteExecutionIntent(execution_intent'),
  }
  return { valid: Object.values(checks).every(Boolean), checks }
}

export async function collectPsdealsBlock4LocalReadiness({ test_count = 0 } = {}) {
  const checkpoint = JSON.parse(await fs.readFile('config/psdeals-post-006-checkpoint.json', 'utf8'))
  const migrationBytes = await fs.readFile('sql/006-lobodeals-3-restrictive-price-history-retirement.sql')
  const migrationHash = crypto.createHash('sha256').update(migrationBytes).digest('hex')
  if (migrationHash !== PSDEALS_APPLIED_006_SHA256) {
    checkpoint.migrations['006'].sha256 = migrationHash
  }
  const linkedPaths = [...new Set(PSDEALS_BLOCK4_CAPABILITIES.flatMap((entry) => [
    ...entry.files,
    ...entry.tests,
  ]))]
  const existingPaths = []
  for (const file of linkedPaths) if (await fileExists(file)) existingPaths.push(file)
  const remoteSimulationFiles = [
    'tests/psdeals-controlled-live-rehearsal.test.mjs',
    'tests/psdeals-migrated-lifecycle-rehearsal.test.mjs',
    'scripts/lib/psdeals-cycle-fixture-adapters.mjs',
  ]
  const remoteSimulationValidated = (await Promise.all(remoteSimulationFiles.map(fileExists))).every(Boolean)

  return evaluatePsdealsBlock4LocalReadiness({
    post_006: evaluatePsdealsPost006Checkpoint(checkpoint),
    history_audit: await auditLocalPriceHistoryDependencies({ root_dir: '.' }),
    block4_map: validatePsdealsBlock4Map({ existing_paths: existingPaths }),
    dry_run: runPsdealsUpdaterDryRun(),
    execution_gates: await staticExecutionGateCheck(),
    tests: { passed: Number.isSafeInteger(test_count) && test_count > 0, count: test_count },
    remote_simulation_contracts: { validated: remoteSimulationValidated },
  })
}

export async function runPsdealsBlock4LocalPreflightCli(argv, io = {}) {
  const stdout = io.stdout || ((value) => process.stdout.write(value))
  const stderr = io.stderr || ((value) => process.stderr.write(value))
  if (argv.includes('--help')) {
    stdout('Usage: npm run preflight:block4 -- --tests-passed=<exact-count>\nLocal-only preflight; never opens network or authorizes operations.\n')
    return 0
  }
  const testCount = Number(argValue(argv, 'tests-passed'))
  try {
    const result = await collectPsdealsBlock4LocalReadiness({
      test_count: Number.isSafeInteger(testCount) ? testCount : 0,
    })
    stdout(`${JSON.stringify(result, null, 2)}\n`)
    return result.valid ? 0 : 2
  } catch (error) {
    stderr(`BLOCK4_LOCAL_PREFLIGHT_ERROR: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

function isMain() {
  return Boolean(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
}

if (isMain()) process.exitCode = await runPsdealsBlock4LocalPreflightCli(process.argv.slice(2))
