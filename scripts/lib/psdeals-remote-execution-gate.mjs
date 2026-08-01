export const PSDEALS_REMOTE_EXECUTION_INTENT_VERSION = 1
export const PSDEALS_REMOTE_PROJECT_REF = 'vlxkoprpobfevxefizwr'
export const PSDEALS_REMOTE_ENV_CONFIRMATION = 'EXPLICITLY_AUTHORIZED'

export const PSDEALS_REMOTE_ACTION_CONFIRMATIONS = Object.freeze({
  create_cycle: 'EXECUTE_CREATE_CYCLE',
  upsert_listing: 'EXECUTE_UPSERT_LISTING',
  import_details: 'EXECUTE_IMPORT_DETAILS',
  detail_retry: 'EXECUTE_DETAIL_RETRY',
  record_monthly: 'EXECUTE_RECORD_MONTHLY',
  apply_ended_deals: 'EXECUTE_APPLY_ENDED_DEALS',
  mark_succeeded: 'EXECUTE_MARK_SUCCEEDED',
  certify: 'EXECUTE_CERTIFY',
  refresh_cache: 'EXECUTE_REFRESH_CACHE',
  record_metrics: 'EXECUTE_RECORD_METRICS',
})

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function validatePsdealsRemoteExecutionIntent(
  intent,
  { env_confirmation, node_env } = {}
) {
  const errors = []
  const expectedConfirmation = PSDEALS_REMOTE_ACTION_CONFIRMATIONS[intent?.action]
  if (intent?.execution_intent_version !== PSDEALS_REMOTE_EXECUTION_INTENT_VERSION) {
    errors.push('remote_execution_intent_version_invalid')
  }
  if (!expectedConfirmation) errors.push('remote_execution_action_invalid')
  if (intent?.execution_mode !== 'operational') errors.push('remote_execution_mode_not_operational')
  if (intent?.project_ref !== PSDEALS_REMOTE_PROJECT_REF) errors.push('remote_execution_project_mismatch')
  if (intent?.confirmation !== expectedConfirmation) errors.push('remote_execution_confirmation_mismatch')
  if (env_confirmation !== PSDEALS_REMOTE_ENV_CONFIRMATION) {
    errors.push('remote_execution_environment_confirmation_missing')
  }
  if (node_env === 'test') errors.push('remote_execution_forbidden_in_test')
  if (intent?.dry_run !== false) errors.push('remote_execution_dry_run_or_ambiguity_forbidden')
  if (!nonEmpty(intent?.authorization_id)) errors.push('remote_execution_authorization_id_missing')
  if (!/^local-cycle-[a-z0-9][a-z0-9_-]{7,}$/.test(String(intent?.local_cycle_id || ''))) {
    errors.push('remote_execution_local_cycle_id_invalid')
  }
  if (intent?.action !== 'create_cycle' && !UUID_PATTERN.test(String(intent?.remote_cycle_id || ''))) {
    errors.push('remote_execution_remote_cycle_id_invalid')
  }
  return {
    valid: errors.length === 0,
    action: intent?.action || null,
    project_ref: intent?.project_ref || null,
    authorization_id: intent?.authorization_id || null,
    errors,
    creates_client: false,
    executes_remote_operation: false,
  }
}

export function assertPsdealsRemoteExecutionIntent(intent, context = {}) {
  const result = validatePsdealsRemoteExecutionIntent(intent, context)
  if (!result.valid) {
    throw new Error(`PSDEALS_REMOTE_EXECUTION_BLOCKED: ${result.errors.join(',')}`)
  }
  return result
}
