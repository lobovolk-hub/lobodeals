export const PSDEALS_CRITICAL_ACTIONS = Object.freeze({
  create_cycle: {
    target: 'public.price_refresh_cycles',
    operation: 'insert',
    idempotency: 'unique certified date does not protect running inserts; reconcile before retry',
  },
  mark_succeeded: {
    target: 'public.price_refresh_cycles',
    operation: 'update_by_id',
    idempotency: 'read current row before retry; never overwrite certified',
  },
  certify: {
    target: 'public.certify_price_refresh_cycle(uuid)',
    operation: 'rpc',
    idempotency: 'function rejects an already certified cycle; verify row before retry',
  },
  refresh_cache: {
    target: 'public.refresh_catalog_public_cache_v15()',
    operation: 'rpc',
    idempotency: 'repeat only after independently verifying certification and cache result',
  },
})

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function buildPsdealsCriticalActionRequest({
  action,
  local_cycle_id,
  remote_cycle_id = null,
  authorization_id,
  inputs = {},
  gates = {},
} = {}) {
  const contract = PSDEALS_CRITICAL_ACTIONS[action]
  const blockers = []
  if (!contract) blockers.push('critical_action_unknown')
  if (!nonEmpty(local_cycle_id)) blockers.push('local_cycle_id_missing')
  if (!nonEmpty(authorization_id)) blockers.push('stage_specific_authorization_missing')
  if (action !== 'create_cycle' && !UUID_PATTERN.test(String(remote_cycle_id || ''))) {
    blockers.push('remote_cycle_id_missing_or_invalid')
  }
  if (action === 'mark_succeeded' && gates.can_mark_succeeded !== true) blockers.push('can_mark_succeeded_gate_closed')
  if (action === 'certify' && gates.can_certify !== true) blockers.push('can_certify_gate_closed')
  if (action === 'refresh_cache' && gates.can_refresh_cache !== true) blockers.push('can_refresh_cache_gate_closed')

  return {
    request_version: 1,
    action,
    local_cycle_id,
    remote_cycle_id,
    authorization_id,
    target: contract?.target || null,
    operation: contract?.operation || null,
    inputs,
    preconditions: {
      gates,
      verify_remote_state_before_retry: action !== 'create_cycle',
    },
    ready: blockers.length === 0,
    blockers,
    requires_external_authorization: true,
    executes_action: false,
    idempotency: contract?.idempotency || null,
  }
}

export async function executePsdealsCriticalActionWithPort(
  request,
  { perform_authorized_action } = {}
) {
  if (!request?.ready) throw new Error(`CRITICAL_ACTION_BLOCKED: ${(request?.blockers || []).join(',')}`)
  if (typeof perform_authorized_action !== 'function') throw new Error('CRITICAL_ACTION_PORT_REQUIRED')
  const result = await perform_authorized_action(request)
  if (result?.action !== request.action || result?.authorization_id !== request.authorization_id) {
    throw new Error('CRITICAL_ACTION_RECEIPT_MISMATCH')
  }
  return result
}
