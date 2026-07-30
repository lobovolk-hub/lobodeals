import fs from 'node:fs/promises'
import path from 'node:path'

import { sha256PsdealsBytes } from './lib/psdeals-evidence-envelope.mjs'
import {
  buildPsdealsMigration004MutationMap,
  buildPsdealsMigration004RecoveryManifest,
  findPsdealsRecoveryBundleSecretSignals,
  PSDEALS_MIGRATION_004_PATH,
  PSDEALS_MIGRATION_004_RECOVERY_PATH,
  validatePsdealsMigration004RecoveryBundle,
  validatePsdealsMigration004RecoverySql,
  verifyPsdealsMigration004RecoveryBundleChecksums,
} from './lib/psdeals-migration-recovery.mjs'

const ROOT = process.cwd()
const BUNDLE_DIRECTORY = 'docs/audit/lobodeals-3-migration-004-scoped-recovery-2026-07-30'
const MUTATION_MAP_PATH = `${BUNDLE_DIRECTORY}/mutation-map.json`
const EMPTY_DATA_PATH = `${BUNDLE_DIRECTORY}/empty-operational-data.json`
const MANIFEST_PATH = `${BUNDLE_DIRECTORY}/recovery-manifest.json`
const CHECKSUMS_PATH = `${BUNDLE_DIRECTORY}/checksums.json`
const README_PATH = `${BUNDLE_DIRECTORY}/README.md`

const INPUT_ARTIFACTS = Object.freeze([
  { role: 'migration_sql', path: PSDEALS_MIGRATION_004_PATH },
  { role: 'recovery_sql_not_authorized', path: PSDEALS_MIGRATION_004_RECOVERY_PATH },
  { role: 'bundle_readme', path: README_PATH },
  { role: 'remote_facts_baseline', path: 'docs/audit/lobodeals-3-remote-readonly-facts-2026-07-29.json' },
  { role: 'schema_baseline', path: 'docs/audit/lobodeals-3-migration-004-schema-precheck-2026-07-29.json' },
  { role: 'legacy_function_definitions', path: 'docs/audit/lobodeals-3-migration-004-legacy-function-definitions-precheck-2026-07-29.json' },
  { role: 'application_plan', path: 'docs/audit/lobodeals-3-cycle-migration-004-application-plan-2026-07-29.md' },
  { role: 'price_history_scope_audit', path: 'docs/audit/lobodeals-3-price-history-retention-audit-2026-07-29.md' },
])

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function readPortable(filePath) {
  return fs.readFile(path.resolve(ROOT, filePath))
}

function artifactDescriptor(role, filePath, bytes) {
  return {
    role,
    path: filePath,
    sha256: sha256PsdealsBytes(bytes),
    bytes: Buffer.byteLength(bytes),
  }
}

export async function buildPsdealsMigration004RecoveryBundleArtifacts() {
  const migrationSql = await readPortable(PSDEALS_MIGRATION_004_PATH)
  const recoverySql = await readPortable(PSDEALS_MIGRATION_004_RECOVERY_PATH)
  const facts = JSON.parse(await readPortable('docs/audit/lobodeals-3-remote-readonly-facts-2026-07-29.json'))
  const mutationMap = buildPsdealsMigration004MutationMap(migrationSql)
  const recoveryValidation = validatePsdealsMigration004RecoverySql(recoverySql, migrationSql)
  const scopedRecoveryProven = recoveryValidation.valid
    && mutationMap.coverage.all_persistent_mutations_mapped
    && facts.measurements.price_refresh_cycles === 0
    && facts.objects.psdeals_cycle_action_receipts.exists === false

  const emptyOperationalData = {
    export_version: 1,
    source: 'read-only remote baseline captured before migration 004',
    observed_at: facts.checked_at,
    project_id: facts.project.id,
    price_refresh_cycles: { row_count: 0, rows: [] },
    psdeals_cycle_action_receipts: { exists: false, row_count: null, rows: null },
    certified_compact_lows: {
      regular_rows: facts.measurements.certified_regular_low_rows,
      ps_plus_rows: facts.measurements.certified_ps_plus_low_rows,
    },
    price_history: {
      exported: false,
      row_count_observed: facts.objects.psdeals_stage_price_history.exact_rows,
      total_bytes_observed: facts.objects.psdeals_stage_price_history.total_bytes,
      exclusion_reason: 'Migration 004 does not reference or mutate this table.',
    },
  }
  const mutationMapBytes = Buffer.from(formatJson(mutationMap))
  const emptyDataBytes = Buffer.from(formatJson(emptyOperationalData))

  const memberArtifacts = []
  for (const artifact of INPUT_ARTIFACTS) {
    memberArtifacts.push(artifactDescriptor(artifact.role, artifact.path, await readPortable(artifact.path)))
  }
  memberArtifacts.push(artifactDescriptor('mutation_map', MUTATION_MAP_PATH, mutationMapBytes))
  memberArtifacts.push(artifactDescriptor('empty_operational_data', EMPTY_DATA_PATH, emptyDataBytes))

  const manifest = buildPsdealsMigration004RecoveryManifest({
    classification: scopedRecoveryProven ? 'SCOPED_RECOVERY_PROVEN' : 'RECOVERY_INDETERMINATE',
    prepared_at: '2026-07-30T00:47:21.4842928Z',
    initial_head: '39cd12781304a05da2802f60f81ba8e50f612fd8',
    migration_commit: 'e18a3c5bcd477e95f30ee297f1f54f43ef033910',
    mutation_map: mutationMap,
    remote_baseline: {
      observed_at: facts.checked_at,
      project_id: facts.project.id,
      region: facts.project.region,
      status: facts.project.status,
      postgres_version: facts.project.postgres_version,
      price_refresh_cycles: facts.measurements.price_refresh_cycles,
      receipts_table_exists: facts.objects.psdeals_cycle_action_receipts.exists,
      certified_regular_low_rows: facts.measurements.certified_regular_low_rows,
      certified_ps_plus_low_rows: facts.measurements.certified_ps_plus_low_rows,
      certify_v1_sha256: facts.functions.certify_price_refresh_cycle.definition_sha256,
      cache_v15_sha256: facts.functions.refresh_catalog_public_cache_v15.definition_sha256,
    },
    member_artifacts: memberArtifacts,
  })
  manifest.recovery_sql_validation = {
    valid: recoveryValidation.valid,
    errors: recoveryValidation.errors,
    execution_authorized: false,
  }
  manifest.migration_history = {
    application_record_created_by_control_plane: true,
    applied_version: null,
    direct_history_sql_forbidden: true,
    reconciliation_after_recovery: 'separate_explicitly_authorized_supabase_migration_repair',
  }
  const manifestBytes = Buffer.from(formatJson(manifest))

  const files = {
    [MUTATION_MAP_PATH]: mutationMapBytes,
    [EMPTY_DATA_PATH]: emptyDataBytes,
    [MANIFEST_PATH]: manifestBytes,
  }
  for (const artifact of INPUT_ARTIFACTS) files[artifact.path] = await readPortable(artifact.path)

  const checksumEntries = Object.entries(files)
    .map(([filePath, bytes]) => artifactDescriptor('bundle_member', filePath, bytes))
    .map((entry) => ({ path: entry.path, sha256: entry.sha256, bytes: entry.bytes }))
    .sort((left, right) => left.path.localeCompare(right.path))
  const checksums = {
    checksum_version: 1,
    algorithm: 'SHA-256',
    self_hash_excluded: true,
    note: 'checksums.json excludes itself to avoid a circular self-hash',
    files: checksumEntries,
  }
  const checksumsBytes = Buffer.from(formatJson(checksums))
  files[CHECKSUMS_PATH] = checksumsBytes

  const bundleValidation = validatePsdealsMigration004RecoveryBundle({
    manifest,
    mutation_map: mutationMap,
    empty_operational_data: emptyOperationalData,
    checksums,
  })
  const checksumValidation = verifyPsdealsMigration004RecoveryBundleChecksums(files, checksums)
  const secretSignals = findPsdealsRecoveryBundleSecretSignals(files)
  if (!bundleValidation.valid || !checksumValidation.valid || secretSignals.length > 0) {
    throw new Error(JSON.stringify({ bundleValidation, checksumValidation, secretSignals }))
  }

  return {
    generated: {
      [MUTATION_MAP_PATH]: mutationMapBytes,
      [EMPTY_DATA_PATH]: emptyDataBytes,
      [MANIFEST_PATH]: manifestBytes,
      [CHECKSUMS_PATH]: checksumsBytes,
    },
    summary: {
      classification: manifest.classification,
      source_lines: mutationMap.source_line_count,
      statements: mutationMap.statement_count,
      persistent_mutations: mutationMap.mutation_count,
      checksum_files: checksums.files.length,
      secret_signals: secretSignals.length,
    },
  }
}

async function writeWithoutOverwrite(filePath, bytes) {
  const target = path.resolve(ROOT, filePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.tmp-${process.pid}`
  await fs.writeFile(temporary, bytes, { flag: 'wx' })
  try {
    await fs.rename(temporary, target)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
}

async function main() {
  const mode = process.argv[2]
  if (!['--write', '--check'].includes(mode)) {
    console.error('Usage: node scripts/build-psdeals-migration-004-recovery-bundle.mjs --write|--check')
    process.exitCode = 2
    return
  }
  const bundle = await buildPsdealsMigration004RecoveryBundleArtifacts()
  if (mode === '--write') {
    for (const [filePath, bytes] of Object.entries(bundle.generated)) {
      await writeWithoutOverwrite(filePath, bytes)
    }
  } else {
    for (const [filePath, bytes] of Object.entries(bundle.generated)) {
      const actual = await readPortable(filePath)
      if (!actual.equals(bytes)) throw new Error(`RECOVERY_BUNDLE_DRIFT:${filePath}`)
    }
  }
  console.log(JSON.stringify({ mode, ...bundle.summary }, null, 2))
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) {
  await main()
}
