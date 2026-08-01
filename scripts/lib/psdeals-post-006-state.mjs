export const PSDEALS_POST_006_CHECKPOINT_VERSION = 1
export const PSDEALS_APPLIED_006_SHA256 =
  'e825a88ef811873f16cc48da5685d8e87eb699b5d903bd29ad34025a9630f5e4'

const HASH_PATTERN = /^[a-f0-9]{64}$/

function issue(code, path, detail = null) {
  return { code, path, detail }
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

export function evaluatePsdealsPost006Checkpoint(input) {
  const checkpoint = input && typeof input === 'object' ? input : {}
  const errors = []
  const blockers = []
  const warnings = []

  if (checkpoint.checkpoint_version !== PSDEALS_POST_006_CHECKPOINT_VERSION) {
    errors.push(issue('POST_006_CHECKPOINT_VERSION_INVALID', 'checkpoint_version'))
  }
  if (checkpoint.state_kind !== 'post_006_verified_checkpoint') {
    errors.push(issue('POST_006_STATE_KIND_INVALID', 'state_kind'))
  }
  if (checkpoint.project?.ref !== 'vlxkoprpobfevxefizwr') {
    blockers.push(issue('POST_006_PROJECT_MISMATCH', 'project.ref'))
  }
  if (checkpoint.migrations?.['005']?.applied !== true) {
    blockers.push(issue('POST_006_MIGRATION_005_NOT_APPLIED', 'migrations.005.applied'))
  }
  if (checkpoint.migrations?.['005']?.postcheck_passed !== true) {
    blockers.push(issue('POST_006_MIGRATION_005_POSTCHECK_MISSING', 'migrations.005.postcheck_passed'))
  }

  const migration006 = checkpoint.migrations?.['006'] || {}
  if (migration006.applied !== true) {
    blockers.push(issue('POST_006_MIGRATION_006_NOT_APPLIED', 'migrations.006.applied'))
  }
  if (migration006.postcheck_passed !== true) {
    blockers.push(issue('POST_006_MIGRATION_006_POSTCHECK_MISSING', 'migrations.006.postcheck_passed'))
  }
  if (migration006.version !== '20260801030244') {
    blockers.push(issue('POST_006_MIGRATION_VERSION_MISMATCH', 'migrations.006.version'))
  }
  if (!HASH_PATTERN.test(String(migration006.sha256 || '')) ||
      migration006.sha256 !== PSDEALS_APPLIED_006_SHA256) {
    blockers.push(issue('POST_006_MIGRATION_HASH_MISMATCH', 'migrations.006.sha256'))
  }
  if (migration006.drop_mode !== 'RESTRICT') {
    blockers.push(issue('POST_006_DROP_MODE_NOT_RESTRICT', 'migrations.006.drop_mode'))
  }
  if (checkpoint.history?.relation !== 'public.psdeals_stage_price_history') {
    blockers.push(issue('POST_006_HISTORY_RELATION_MISMATCH', 'history.relation'))
  }
  if (checkpoint.history?.retired !== true || checkpoint.history?.residual_objects !== 0) {
    blockers.push(issue('POST_006_HISTORY_NOT_CLEANLY_RETIRED', 'history'))
  }
  if (checkpoint.history?.rows_retired !== 841549) {
    warnings.push(issue('POST_006_RETIRED_ROW_COUNT_UNEXPECTED', 'history.rows_retired'))
  }

  const storage = checkpoint.storage || {}
  const storageMeasurementsValid = [
    storage.capacity_limit_bytes,
    storage.database_size_before_bytes,
    storage.database_size_after_bytes,
    storage.bytes_reclaimed,
  ].every(positiveInteger)
  if (!storageMeasurementsValid) {
    blockers.push(issue('POST_006_STORAGE_MEASUREMENTS_INVALID', 'storage'))
  } else {
    if (storage.database_size_before_bytes - storage.database_size_after_bytes !== storage.bytes_reclaimed) {
      blockers.push(issue('POST_006_STORAGE_DELTA_MISMATCH', 'storage.bytes_reclaimed'))
    }
    if (storage.database_size_after_bytes >= storage.database_size_before_bytes) {
      blockers.push(issue('POST_006_STORAGE_NOT_REDUCED', 'storage.database_size_after_bytes'))
    }
    if (storage.database_size_after_bytes >= storage.capacity_limit_bytes) {
      blockers.push(issue('POST_006_STORAGE_CAPACITY_EXCEEDED', 'storage.database_size_after_bytes'))
    }
  }

  if (checkpoint.operational_state?.compact_minima_schema_ready !== true) {
    blockers.push(issue('POST_006_COMPACT_MINIMA_SCHEMA_NOT_READY', 'operational_state.compact_minima_schema_ready'))
  }
  for (const [field, expected] of Object.entries({
    compact_minima_ready: false,
    block_4_complete: false,
    live_cycle_ready: false,
    thirty_day_trial_started: false,
  })) {
    if (checkpoint.operational_state?.[field] !== expected) {
      blockers.push(issue('POST_006_UNSUPPORTED_OPERATIONAL_STATE', `operational_state.${field}`))
    }
  }

  const storageBlockerCodes = new Set([
    'POST_006_MIGRATION_006_NOT_APPLIED',
    'POST_006_MIGRATION_006_POSTCHECK_MISSING',
    'POST_006_MIGRATION_VERSION_MISMATCH',
    'POST_006_MIGRATION_HASH_MISMATCH',
    'POST_006_DROP_MODE_NOT_RESTRICT',
    'POST_006_HISTORY_RELATION_MISMATCH',
    'POST_006_HISTORY_NOT_CLEANLY_RETIRED',
    'POST_006_STORAGE_MEASUREMENTS_INVALID',
    'POST_006_STORAGE_DELTA_MISMATCH',
    'POST_006_STORAGE_NOT_REDUCED',
    'POST_006_STORAGE_CAPACITY_EXCEEDED',
  ])
  const storageReady = errors.length === 0 &&
    blockers.every((entry) => !storageBlockerCodes.has(entry.code))

  return {
    checkpoint_version: PSDEALS_POST_006_CHECKPOINT_VERSION,
    valid: errors.length === 0,
    post_006_verified: errors.length === 0 && blockers.length === 0,
    storage_ready: storageReady,
    history_retired: checkpoint.history?.retired === true,
    compact_minima_schema_ready:
      checkpoint.operational_state?.compact_minima_schema_ready === true,
    compact_minima_ready: false,
    block_4_complete: false,
    live_cycle_ready: false,
    thirty_day_trial_ready: false,
    errors,
    blockers,
    warnings,
    reason_codes: [...new Set([...errors, ...blockers].map((entry) => entry.code))],
  }
}
