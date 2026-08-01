import { createHash } from 'node:crypto'

export const PSDEALS_UPDATER_SIMULATION_SCHEMA_VERSION = 1
export const PSDEALS_UPDATER_SIMULATION_MODE = 'simulation'

export const PSDEALS_UPDATER_SIMULATION_STATES = Object.freeze([
  'initialized',
  'preflight_passed',
  'listing_collected',
  'listing_validated',
  'details_processed',
  'cycle_planned',
  'receipts_reconciled',
  'candidates_planned',
  'certification_planned',
  'minima_planned',
  'ended_deals_planned',
  'cache_planned',
  'monthly_planned',
  'ready_to_finalize',
  'succeeded',
  'failed',
  'requires_reconciliation',
])

const SUCCESS_PATH = Object.freeze([
  'initialized',
  'preflight_passed',
  'listing_collected',
  'listing_validated',
  'details_processed',
  'cycle_planned',
  'receipts_reconciled',
  'candidates_planned',
  'certification_planned',
  'minima_planned',
  'ended_deals_planned',
  'cache_planned',
  'monthly_planned',
  'ready_to_finalize',
  'succeeded',
])

export const PSDEALS_UPDATER_SIMULATION_OPERATION_TYPES = Object.freeze([
  'cycle_insert',
  'receipt_insert',
  'receipt_update',
  'stage_upsert',
  'candidate_update',
  'certification_decision',
  'minima_initialize',
  'minima_reduce',
  'first_seen_set',
  'ended_deal_demotion',
  'cache_change',
  'monthly_change',
  'cycle_finalization',
])

const SENSITIVE_NAME = /(password|secret|token|credential|authorization|cookie|connection|string|supabase[_-]?url|api[_-]?key)/i
const PRODUCT_PROJECT_REF = 'vlxkoprpobfevxefizwr'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  )
}

export function stablePsdealsUpdaterSimulationJson(value, space = 0) {
  return JSON.stringify(canonicalize(value), null, space)
}

export function hashPsdealsUpdaterSimulationValue(value) {
  return createHash('sha256')
    .update(stablePsdealsUpdaterSimulationJson(value), 'utf8')
    .digest('hex')
}

function collectSensitivePaths(value, prefix = '') {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectSensitivePaths(entry, `${prefix}[${index}]`))
  }
  if (!isObject(value)) return []
  const paths = []
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (SENSITIVE_NAME.test(key) && key !== 'idempotency_key') paths.push(path)
    paths.push(...collectSensitivePaths(entry, path))
  }
  return paths
}

export function validatePsdealsUpdaterSimulationInput(input) {
  const errors = []
  if (!isObject(input)) {
    return { valid: false, errors: ['simulation_input_invalid'], normalized_input: null }
  }
  const normalized = canonicalize(input)
  if (normalized.mode !== PSDEALS_UPDATER_SIMULATION_MODE) {
    errors.push('simulation_mode_required')
  }
  if (!Number.isFinite(Date.parse(normalized.logical_timestamp))) {
    errors.push('logical_timestamp_invalid')
  }
  if (typeof normalized.fixture_id !== 'string' || !normalized.fixture_id.trim()) {
    errors.push('fixture_id_missing')
  }
  if (typeof normalized.seed !== 'string' || !normalized.seed.trim()) {
    errors.push('deterministic_seed_missing')
  }
  if (
    typeof normalized.project_ref !== 'string' ||
    !/^(?:fixture|local)-[a-z0-9][a-z0-9_-]*$/i.test(normalized.project_ref) ||
    normalized.project_ref === PRODUCT_PROJECT_REF
  ) {
    errors.push('non_product_fixture_project_ref_required')
  }
  if (!Array.isArray(normalized.listing?.pages)) errors.push('listing_pages_missing')
  if (!Array.isArray(normalized.initial_stage)) errors.push('initial_stage_missing')
  if (!isObject(normalized.initial_minima)) errors.push('initial_minima_missing')
  if (!Array.isArray(normalized.details)) errors.push('detail_fixtures_missing')
  const sensitivePaths = collectSensitivePaths(normalized)
  if (sensitivePaths.length > 0) errors.push('sensitive_input_field_forbidden')
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    sensitive_paths: sensitivePaths,
    normalized_input: normalized,
  }
}

export function buildPsdealsUpdaterSimulationIdentity(input) {
  const inputHash = hashPsdealsUpdaterSimulationValue(input)
  const runId = `simulation-${inputHash.slice(0, 24)}`
  return {
    run_id: runId,
    simulation_cycle_id: `${inputHash.slice(0, 8)}-${inputHash.slice(8, 12)}-4${inputHash.slice(13, 16)}-8${inputHash.slice(17, 20)}-${inputHash.slice(20, 32)}`,
    input_sha256: inputHash,
    idempotency_key: `updater-simulation:${inputHash}`,
  }
}

export function createPsdealsUpdaterSimulationLedger({ run_id, cycle_id } = {}) {
  if (!/^simulation-[a-f0-9]{24}$/.test(String(run_id || ''))) {
    throw new Error('SIMULATION_RUN_ID_INVALID')
  }
  if (typeof cycle_id !== 'string' || !cycle_id) throw new Error('SIMULATION_CYCLE_ID_INVALID')
  const operations = []
  const operationIds = new Set()

  return Object.freeze({
    plan({
      operation_type,
      target,
      key,
      before = null,
      after = null,
      reason,
      family = 'cycle',
      source_observation = null,
      allowed = true,
      blocker = null,
    }) {
      if (!PSDEALS_UPDATER_SIMULATION_OPERATION_TYPES.includes(operation_type)) {
        throw new Error(`SIMULATION_OPERATION_TYPE_INVALID:${operation_type}`)
      }
      const operationId = `op-${hashPsdealsUpdaterSimulationValue({
        run_id, operation_type, target, key, family,
      }).slice(0, 24)}`
      if (operationIds.has(operationId)) return operations.find((entry) => entry.operation_id === operationId)
      const operation = canonicalize({
        operation_id: operationId,
        operation_type,
        target,
        key,
        before,
        after,
        reason,
        cycle_id,
        family,
        source_observation,
        idempotency_key: `${run_id}:${operationId}`,
        allowed: allowed === true,
        blocker: blocker || null,
        executed: false,
      })
      operations.push(operation)
      operationIds.add(operationId)
      return operation
    },
    snapshot() {
      return canonicalize({
        ledger_version: 1,
        run_id,
        cycle_id,
        operations,
        planned_writes: operations.filter((entry) => entry.allowed).length,
        blocked_writes: operations.filter((entry) => !entry.allowed).length,
        executed_writes: 0,
      })
    },
  })
}

export function createPsdealsUpdaterSimulationStateMachine() {
  const transitions = []
  let state = 'initialized'

  return Object.freeze({
    get state() { return state },
    transition(next, reason = 'stage_completed') {
      if (!PSDEALS_UPDATER_SIMULATION_STATES.includes(next)) {
        throw new Error(`SIMULATION_STATE_UNKNOWN:${next}`)
      }
      const currentIndex = SUCCESS_PATH.indexOf(state)
      const nextIndex = SUCCESS_PATH.indexOf(next)
      const terminalTransition = ['failed', 'requires_reconciliation'].includes(next) &&
        !['succeeded', 'failed'].includes(state)
      const valid = terminalTransition || nextIndex === currentIndex + 1
      if (!valid) throw new Error(`SIMULATION_STATE_TRANSITION_INVALID:${state}->${next}`)
      transitions.push({ from: state, to: next, reason })
      state = next
      return state
    },
    snapshot() {
      return { state, transitions: transitions.map((entry) => ({ ...entry })) }
    },
  })
}

export function validatePsdealsUpdaterSimulationManifest(manifest) {
  const errors = []
  if (!isObject(manifest)) return { valid: false, errors: ['manifest_invalid'] }
  if (manifest.schema_version !== PSDEALS_UPDATER_SIMULATION_SCHEMA_VERSION) {
    errors.push('manifest_schema_version_invalid')
  }
  if (!/^simulation-[a-f0-9]{24}$/.test(String(manifest.run_id || ''))) {
    errors.push('manifest_run_id_invalid')
  }
  if (manifest.mode !== PSDEALS_UPDATER_SIMULATION_MODE) errors.push('manifest_mode_invalid')
  if (!Number.isFinite(Date.parse(manifest.generated_at))) errors.push('manifest_generated_at_invalid')
  if (!isObject(manifest.input_hashes) || !/^[a-f0-9]{64}$/.test(String(manifest.input_hashes?.input || ''))) {
    errors.push('manifest_input_hash_invalid')
  }
  if (!Array.isArray(manifest.pipeline_states) || manifest.pipeline_states.length === 0) {
    errors.push('manifest_pipeline_states_missing')
  }
  if (!isObject(manifest.operation_ledger)) errors.push('manifest_operation_ledger_missing')
  if (manifest.executed_writes !== 0 || manifest.operation_ledger?.executed_writes !== 0) {
    errors.push('manifest_executed_writes_nonzero')
  }
  if (manifest.opens_connections !== false) errors.push('manifest_connection_flag_not_false')
  if (manifest.executes_processes !== false) errors.push('manifest_process_flag_not_false')
  if (manifest.uses_supabase !== false) errors.push('manifest_supabase_flag_not_false')
  if (!Array.isArray(manifest.blockers) || !Array.isArray(manifest.warnings)) {
    errors.push('manifest_diagnostics_missing')
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)].sort() }
}
