import {
  evaluatePsdealsCaptchaGate,
  evaluatePsdealsEdgeCdpGate,
  PSDEALS_DAILY_PROJECT_REF,
} from './psdeals-daily-refresh-v3.mjs'
import { validatePsdealsDailyLiveBindings } from './psdeals-daily-live-bindings.mjs'
import { evaluatePsdealsVercelManualEvidence } from './psdeals-vercel-manual-evidence.mjs'

const LOCAL_CYCLE_PATTERN = /^local-cycle-[a-z0-9][a-z0-9_-]{7,}$/
const HASH_PATTERN = /^[a-f0-9]{64}$/

function unique(values) {
  return [...new Set(values)]
}

function readMeasurement(source, ...names) {
  for (const name of names) {
    const value = source?.[name]
    if (Number.isSafeInteger(value) && value >= 0) return value
  }
  return null
}

function isFresh(value, now, maxAgeMinutes) {
  const checkedAt = Date.parse(value)
  const nowAt = Date.parse(now)
  return Number.isFinite(checkedAt) && Number.isFinite(nowAt) &&
    checkedAt <= nowAt && nowAt - checkedAt <= maxAgeMinutes * 60_000
}

export function evaluatePsdealsRecoveryLivePreflight({
  inspection,
  remote_preflight,
  vercel_evidence,
  edge_runtime,
  run_intent_id,
  code_head,
  now = new Date().toISOString(),
} = {}) {
  const blockers = []
  const bindings = validatePsdealsDailyLiveBindings()
  blockers.push(...bindings.blockers)
  if (inspection?.DAILY_RUNNER_CODE_READY !== true) blockers.push('daily_runner_code_not_ready')
  if (inspection?.LIVE_EXECUTOR_BOUND !== true) blockers.push('live_executor_not_bound')
  if (inspection?.REMOTE_CYCLE_IDENTITY_ALIGNED !== true) blockers.push('remote_cycle_identity_not_aligned')
  if (!HASH_PATTERN.test(String(inspection?.migration_007_sha256 || ''))) blockers.push('migration_007_local_sha_invalid')
  if (!/^[a-f0-9]{40}$/.test(String(code_head || ''))) blockers.push('code_head_invalid')
  if (!LOCAL_CYCLE_PATTERN.test(String(run_intent_id || ''))) blockers.push('run_intent_id_invalid')

  if (remote_preflight?.project_ref !== PSDEALS_DAILY_PROJECT_REF &&
      remote_preflight?.project?.id !== PSDEALS_DAILY_PROJECT_REF) {
    blockers.push('remote_preflight_project_mismatch')
  }
  if (remote_preflight?.read_only_verified !== true) blockers.push('remote_preflight_not_read_only')
  if (!isFresh(remote_preflight?.checked_at, now, 30)) blockers.push('remote_preflight_stale')
  if (remote_preflight?.migration_007_applied !== true) blockers.push('migration_007_not_applied')
  if (remote_preflight?.migration_007_sha256 !== inspection?.migration_007_sha256) {
    blockers.push('migration_007_remote_sha_mismatch')
  }
  if (remote_preflight?.certificate_sha256 !== inspection?.certificate_007_sha256) {
    blockers.push('remote_certificate_sha_mismatch')
  }
  if (remote_preflight?.certificate_passed !== true ||
      !Number.isSafeInteger(remote_preflight?.blocker_failures) ||
      remote_preflight.blocker_failures !== 0) {
    blockers.push('remote_preflight_not_certified')
  }
  if ((remote_preflight?.blockers || []).length > 0) blockers.push('remote_preflight_has_blockers')
  if (remote_preflight?.drift_detected !== false) blockers.push('remote_drift_not_explicitly_absent')

  const measurements = remote_preflight?.measurements || {}
  const cycles = readMeasurement(measurements, 'price_refresh_cycles', 'cycles')
  const receipts = readMeasurement(measurements, 'psdeals_cycle_action_receipts', 'receipts')
  const candidates = readMeasurement(measurements, 'psdeals_price_candidates', 'candidates')
  const minima = readMeasurement(measurements, 'compact_minima', 'certified_minima')
  const locks = readMeasurement(measurements, 'active_locks', 'locks')
  const activity = readMeasurement(measurements, 'active_operational_sessions', 'activity')
  for (const [name, value] of Object.entries({ cycles, receipts, candidates, minima, locks, activity })) {
    if (value === null) blockers.push(`remote_${name}_measurement_missing`)
    else if (value !== 0) blockers.push(`remote_${name}_not_zero`)
  }

  const vercel = evaluatePsdealsVercelManualEvidence(vercel_evidence, { now })
  const edge = evaluatePsdealsEdgeCdpGate(edge_runtime)
  const captcha = evaluatePsdealsCaptchaGate(edge_runtime, { now })
  blockers.push(...edge.blockers, ...captcha.blockers)

  const coreBlockers = unique(blockers).sort()
  const vercelRenewalOnly = coreBlockers.length === 0 &&
    vercel.blockers.length === 1 && vercel.blockers[0] === 'vercel_evidence_stale'
  const uniqueBlockers = unique([...coreBlockers, ...vercel.blockers]).sort()
  const ready = uniqueBlockers.length === 0
  const commandReady = ready || vercelRenewalOnly
  return {
    preflight_version: 1,
    classification: ready
      ? 'READY_FOR_AUTHORIZATION_B'
      : vercelRenewalOnly
        ? 'PENDING_MANUAL_VERCEL_REFRESH'
        : 'RECOVERY_REFRESH_PREFLIGHT_BLOCKED',
    ready,
    blockers: uniqueBlockers,
    project_ref: PSDEALS_DAILY_PROJECT_REF,
    code_head: code_head || null,
    run_intent_id: run_intent_id || null,
    migration_007_sha256: inspection?.migration_007_sha256 || null,
    measurements: { cycles, receipts, candidates, minima, locks, activity },
    last_completed_state: commandReady ? 'captcha_resolved' : null,
    next_state: 'cycle_created',
    stopped_before_remote_cycle_creation: true,
    remote_cycle_id: null,
    remote_cycle_created: false,
    remote_receipts_created: 0,
    collectors_executed: 0,
    imports_executed: 0,
    executed_writes: 0,
    operational_manifest_written: false,
    LIVE_ADAPTER_CONTRACTS_READY: bindings.LIVE_ADAPTER_CONTRACTS_READY,
    LIVE_EXECUTOR_BOUND: inspection?.LIVE_EXECUTOR_BOUND === true,
    PRODUCTION_ADAPTERS_TOTAL: inspection?.PRODUCTION_ADAPTERS_TOTAL ?? null,
    PRODUCTION_ADAPTERS_BOUND: inspection?.PRODUCTION_ADAPTERS_BOUND ?? null,
    PRODUCTION_ADAPTERS_MISSING: inspection?.PRODUCTION_ADAPTERS_MISSING ?? null,
    REMOTE_CYCLE_IDENTITY_ALIGNED: inspection?.REMOTE_CYCLE_IDENTITY_ALIGNED === true,
    EDGE_CDP_POWERSHELL_LAUNCH_READY: edge_runtime?.launcher?.launch_method === 'powershell_start_process' || edge_runtime?.launcher?.powershell === true,
    CAPTCHA_AUTOMATIC_WAIT_READY: captcha.CAPTCHA_AUTOMATIC_WAIT_READY,
    CHAT_CONFIRMATION_REQUIRED: false,
    EDGE_CDP_RUNTIME_PREFLIGHT_PASSED: edge.valid,
    VERCEL_MANUAL_EVIDENCE_ACCEPTED: vercel.VERCEL_MANUAL_EVIDENCE_ACCEPTED,
    VERCEL_CAPACITY_WITHIN_THRESHOLD: vercel.VERCEL_CAPACITY_WITHIN_THRESHOLD,
    RECOVERY_REFRESH_COMMAND_READY: commandReady,
    RECOVERY_REFRESH_REMOTE_PREFLIGHT_READY: ready ? true : vercelRenewalOnly ? 'pending_manual_vercel_refresh' : false,
    RECOVERY_REFRESH_EXECUTED: false,
    PUBLIC_DATA_CURRENT: false,
    DAILY_RUNNER_READY: false,
    COMPACT_MINIMA_READY: false,
    LIVE_CYCLE_READY: false,
    THIRTY_DAY_TRIAL_READY: false,
    authorizes_next_state: false,
  }
}
