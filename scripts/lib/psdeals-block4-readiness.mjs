export const PSDEALS_BLOCK4_READINESS_VERSION = 1

function unique(values) {
  return [...new Set(values)]
}

export function evaluatePsdealsBlock4LocalReadiness({
  post_006,
  history_audit,
  block4_map,
  dry_run,
  execution_gates,
  tests,
  remote_simulation_contracts,
  offline_orchestrator,
} = {}) {
  const blockers = []
  const warnings = []
  if (post_006?.post_006_verified !== true) blockers.push('post_006_checkpoint_invalid')
  if (post_006?.storage_ready !== true) blockers.push('storage_not_ready')
  if ((history_audit?.runtime_violations || []).length !== 0) blockers.push('runtime_history_reference_found')
  if (block4_map?.valid !== true || block4_map?.capability_count !== 25) blockers.push('block4_map_invalid')
  if (dry_run?.remote_writes_executed !== 0 || dry_run?.opens_connections !== false || dry_run?.executes_processes !== false) {
    blockers.push('dry_run_external_effect_detected')
  }
  if (dry_run?.failure_simulation?.all_fail_closed !== true) blockers.push('failure_simulation_not_fail_closed')
  if (execution_gates?.valid !== true) blockers.push('execution_gates_invalid')
  if (tests?.passed !== true || !Number.isSafeInteger(tests?.count) || tests.count <= 0) {
    blockers.push('local_test_attestation_missing')
  }
  if (remote_simulation_contracts?.validated !== true) blockers.push('remote_simulation_contracts_not_validated')
  const requiredPipelineStates = [
    'listing_validated', 'details_processed', 'cycle_planned',
    'receipts_reconciled', 'candidates_planned', 'certification_planned',
    'minima_planned', 'ended_deals_planned', 'cache_planned',
    'monthly_planned', 'ready_to_finalize', 'succeeded',
  ]
  const orchestratorReady =
    offline_orchestrator?.manifest_validation?.valid === true &&
    offline_orchestrator?.overall_status === 'simulated_success' &&
    offline_orchestrator?.executed_writes === 0 &&
    offline_orchestrator?.opens_connections === false &&
    offline_orchestrator?.executes_processes === false &&
    offline_orchestrator?.uses_supabase === false &&
    offline_orchestrator?.static_remote_imports_absent === true &&
    offline_orchestrator?.integration_map_count >= 9 &&
    requiredPipelineStates.every((state) => offline_orchestrator?.pipeline_states?.includes(state))
  if (!orchestratorReady) blockers.push('offline_orchestrator_not_code_ready')

  const mapIncomplete = (block4_map?.status_counts?.PARTIAL || 0) > 0 ||
    (block4_map?.status_counts?.BLOCKED || 0) > 0 ||
    (block4_map?.status_counts?.MISSING || 0) > 0
  if (mapIncomplete) warnings.push('block4_operational_capabilities_incomplete')

  const localFoundationReady = !blockers.some((code) => [
    'post_006_checkpoint_invalid',
    'storage_not_ready',
    'runtime_history_reference_found',
    'block4_map_invalid',
    'execution_gates_invalid',
    'local_test_attestation_missing',
  ].includes(code))
  const dryRunReady = localFoundationReady &&
    !blockers.includes('dry_run_external_effect_detected') &&
    !blockers.includes('failure_simulation_not_fail_closed')
  const remoteSimulationReady = dryRunReady &&
    !blockers.includes('remote_simulation_contracts_not_validated')
  const codeReady = localFoundationReady && dryRunReady && orchestratorReady

  return {
    readiness_version: PSDEALS_BLOCK4_READINESS_VERSION,
    valid: blockers.length === 0,
    classification: blockers.length > 0
      ? 'LOCAL_PREFLIGHT_BLOCKED'
      : codeReady ? 'LOCAL_CODE_READY' : 'LOCAL_SIMULATION_READY',
    blockers: unique(blockers),
    warnings: unique(warnings),
    states: {
      POST_006_READY: post_006?.post_006_verified === true,
      STORAGE_READY: post_006?.storage_ready === true,
      HISTORY_RUNTIME_CLEAN: (history_audit?.runtime_violations || []).length === 0,
      BLOCK_4_LOCAL_FOUNDATION_READY: localFoundationReady,
      BLOCK_4_CODE_READY: codeReady,
      BLOCK_4_DRY_RUN_READY: dryRunReady,
      BLOCK_4_REMOTE_SIMULATION_READY: remoteSimulationReady,
      BLOCK_4_COMPLETE: false,
      COMPACT_MINIMA_READY: false,
      LIVE_CYCLE_READY: false,
      THIRTY_DAY_TRIAL_READY: false,
    },
    tests: {
      passed: tests?.passed === true,
      count: Number.isSafeInteger(tests?.count) ? tests.count : 0,
    },
    remote_operations_authorized: false,
    remote_writes_executed: 0,
    opens_connections: false,
    executes_processes: false,
  }
}
