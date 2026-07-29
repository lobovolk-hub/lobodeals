import { hashPsdealsRunToken } from './psdeals-operational-authorization.mjs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function hasUniqueLocalIdentity(contract) {
  const columns = new Set(contract?.columns || [])
  const indexes = new Set(contract?.indexes || [])
  return columns.has('local_cycle_id') &&
    columns.has('run_token_sha256') &&
    indexes.has('price_refresh_cycles_local_identity_unique_idx')
}
function matchingCycle(row, request) {
  return UUID_PATTERN.test(String(row?.id || '')) &&
    row?.region_code === 'us' && row?.storefront === 'playstation' &&
    row?.metrics?.lobodeals_local_cycle_id === request.local_cycle_id &&
    row?.metrics?.lobodeals_run_token_sha256 === request.run_token_sha256
}

export function preparePsdealsCreateCycleRequest({
  workspace,
  authorization,
  remote_contract,
  cycle_date,
  started_at,
} = {}) {
  const blockers = []
  if (!workspace?.identity?.local_cycle_id || !workspace?.identity?.run_token) {
    blockers.push('workspace_identity_missing')
  }
  if (authorization?.stage !== 'create_cycle' ||
      authorization?.permission !== 'allow_create_remote_cycle') {
    blockers.push('create_cycle_authorization_missing')
  }
  if (!hasUniqueLocalIdentity(remote_contract)) {
    blockers.push('create_cycle_unique_reconciliation_contract_missing')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(cycle_date || ''))) {
    blockers.push('cycle_date_invalid')
  }
  if (Number.isNaN(new Date(started_at).getTime())) blockers.push('cycle_started_at_invalid')

  const runTokenSha256 = workspace?.identity?.run_token
    ? hashPsdealsRunToken(workspace.identity.run_token)
    : null
  return {
    action: 'create_cycle',
    local_cycle_id: workspace?.identity?.local_cycle_id || null,
    run_token_sha256: runTokenSha256,
    authorization_id: authorization?.authorization_id || null,
    cycle_date,
    started_at,
    payload: {
      region_code: 'us',
      storefront: 'playstation',
      cycle_date,
      status: 'running',
      started_at,
      metrics: {
        lobodeals_local_cycle_id: workspace?.identity?.local_cycle_id || null,
        lobodeals_run_token_sha256: runTokenSha256,
        code_revision: workspace?.identity?.code_revision || null,
        filter_fingerprint: workspace?.identity?.context?.fingerprint || null,
        runner_mode: workspace?.identity?.mode || null,
      },
    },
    ready: blockers.length === 0,
    blockers,
    executes_remote_operation: false,
  }
}

export async function executeIdempotentPsdealsCreateCycle(
  request,
  { find_cycles, insert_cycle, write_receipt } = {}
) {
  if (!request?.ready) {
    return { status: 'awaiting_contract', blockers: request?.blockers || ['create_cycle_request_invalid'] }
  }
  if (typeof find_cycles !== 'function' || typeof insert_cycle !== 'function' || typeof write_receipt !== 'function') {
    throw new Error('CREATE_CYCLE_PORT_INCOMPLETE')
  }
  const reconcile = async () => {
    const candidates = await find_cycles({
      local_cycle_id: request.local_cycle_id,
      run_token_sha256: request.run_token_sha256,
    })
    const matching = (Array.isArray(candidates) ? candidates : []).filter((row) => matchingCycle(row, request))
    if (matching.length > 1) return { status: 'blocked', blockers: ['create_cycle_reconciliation_ambiguous'] }
    if (matching.length === 1) return { status: 'succeeded', remote_cycle_id: matching[0].id, reconciled: true }
    return { status: 'absent' }
  }

  const before = await reconcile()
  if (before.status !== 'absent') {
    if (before.status !== 'succeeded') return before
    const receipt = await write_receipt({
      action: 'create_cycle',
      authorization_id: request.authorization_id,
      remote_cycle_id: before.remote_cycle_id,
      reconciled: true,
    })
    return { ...before, receipt }
  }

  let inserted
  try {
    inserted = await insert_cycle(request.payload)
  } catch (error) {
    const afterError = await reconcile()
    if (afterError.status === 'succeeded') {
      const receipt = await write_receipt({
        action: 'create_cycle',
        authorization_id: request.authorization_id,
        remote_cycle_id: afterError.remote_cycle_id,
        reconciled: true,
        ambiguous_transport_result: true,
      })
      return { ...afterError, receipt, ambiguous_transport_result: true }
    }
    return {
      status: afterError.status === 'blocked' ? 'blocked' : 'indeterminate',
      blockers: afterError.blockers || ['create_cycle_transport_ambiguous_unreconciled'],
      error: error instanceof Error ? error.message : String(error),
    }
  }

  if (!matchingCycle(inserted, request)) {
    return { status: 'indeterminate', blockers: ['create_cycle_insert_response_mismatch'] }
  }
  const receipt = await write_receipt({
    action: 'create_cycle',
    authorization_id: request.authorization_id,
    remote_cycle_id: inserted.id,
    reconciled: false,
  })
  return {
    status: 'succeeded',
    remote_cycle_id: inserted.id,
    reconciled: false,
    receipt,
  }
}

export function assessPsdealsLifecycleContracts(remoteFacts) {
  const cycles = remoteFacts?.objects?.price_refresh_cycles
  const functions = remoteFacts?.functions || {}
  return {
    mark_succeeded: {
      ready: cycles?.exists === true,
      reconciliation: 'read_cycle_by_uuid_and_verify_succeeded_fields',
    },
    certify: {
      ready: cycles?.exists === true && functions.certify_price_refresh_cycle?.definition_verified === true,
      reconciliation: 'read_cycle_by_uuid_and_verify_status_certified_and_certified_at',
    },
    refresh_cache: {
      ready: functions.refresh_catalog_public_cache_v15?.independent_receipt_supported === true,
      reconciliation: 'requires_cycle_linked_remote_cache_receipt',
    },
    apply_demotion: {
      ready: false,
      reconciliation: 'requires_exact_cycle_linked_candidate_application_receipt',
    },
  }
}

export async function executeReconciledPsdealsLifecycleAction(
  request,
  { read_cycle, perform_action, write_receipt } = {}
) {
  if (!request?.ready) return { status: 'awaiting_contract', blockers: request?.blockers || ['lifecycle_request_invalid'] }
  if (!UUID_PATTERN.test(String(request.remote_cycle_id || ''))) {
    return { status: 'blocked', blockers: ['remote_cycle_id_invalid'] }
  }
  if (typeof read_cycle !== 'function' || typeof perform_action !== 'function' || typeof write_receipt !== 'function') {
    throw new Error('LIFECYCLE_PORT_INCOMPLETE')
  }
  const achieved = (row) => request.action === 'mark_succeeded'
    ? ['succeeded', 'certified'].includes(row?.status) && Boolean(row?.finished_at)
    : request.action === 'certify'
      ? row?.status === 'certified' && Boolean(row?.certified_at)
      : false
  const before = await read_cycle(request.remote_cycle_id)
  if (achieved(before)) {
    return {
      status: 'succeeded',
      reconciled: true,
      receipt: await write_receipt({ action: request.action, remote_cycle_id: request.remote_cycle_id, reconciled: true }),
    }
  }
  try {
    await perform_action(request)
  } catch (error) {
    const afterError = await read_cycle(request.remote_cycle_id)
    if (!achieved(afterError)) {
      return {
        status: 'indeterminate',
        blockers: ['lifecycle_transport_ambiguous_unreconciled'],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  const after = await read_cycle(request.remote_cycle_id)
  if (!achieved(after)) return { status: 'failed', blockers: ['lifecycle_postcondition_failed'] }
  return {
    status: 'succeeded',
    reconciled: true,
    receipt: await write_receipt({ action: request.action, remote_cycle_id: request.remote_cycle_id, reconciled: true }),
  }
}
