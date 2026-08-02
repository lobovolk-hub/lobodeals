import { hashPsdealsRunToken } from './psdeals-operational-authorization.mjs'
import {
  hashPsdealsOperationalRequest,
  validatePsdealsRemoteActionReceipt,
} from './psdeals-cycle-migration-contract.mjs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function hasUniqueLocalIdentity(contract) {
  const columns = new Set(contract?.columns || [])
  const indexes = new Set(contract?.indexes || [])
  return [
    'local_cycle_id',
    'run_token_sha256',
    'code_revision',
    'filter_fingerprint',
    'manifest_hash',
    'mode',
  ].every((column) => columns.has(column)) &&
    indexes.has('price_refresh_cycles_local_cycle_id_unique_idx') &&
    indexes.has('price_refresh_cycles_run_token_sha256_unique_idx') &&
    indexes.has('price_refresh_cycles_local_identity_unique_idx')
}
function matchingCycle(row, request) {
  return UUID_PATTERN.test(String(row?.id || '')) &&
    row?.region_code === 'us' && row?.storefront === 'playstation' &&
    row?.local_cycle_id === request.local_cycle_id &&
    row?.run_token_sha256 === request.run_token_sha256 &&
    row?.code_revision === request.code_revision &&
    row?.filter_fingerprint === request.filter_fingerprint &&
    row?.manifest_hash === request.manifest_hash &&
    row?.mode === 'operational'
}

export function preparePsdealsCreateCycleRequest({
  workspace,
  authorization,
  remote_contract,
  cycle_date,
  started_at,
  manifest_hash = null,
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
  if (remote_contract?.create_rpc_ready !== true) {
    blockers.push('create_cycle_rpc_contract_missing')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(cycle_date || ''))) {
    blockers.push('cycle_date_invalid')
  }
  if (Number.isNaN(new Date(started_at).getTime())) blockers.push('cycle_started_at_invalid')

  const runTokenSha256 = workspace?.identity?.run_token
    ? hashPsdealsRunToken(workspace.identity.run_token)
    : null
  const manifestHash = manifest_hash || hashPsdealsOperationalRequest({
    local_cycle_id: workspace?.identity?.local_cycle_id || null,
    run_token_sha256: runTokenSha256,
    code_revision: workspace?.identity?.code_revision || null,
    filter_fingerprint: workspace?.identity?.context?.fingerprint || null,
    mode: workspace?.identity?.mode || null,
  })
  const idempotencyKey = `create-cycle:${workspace?.identity?.local_cycle_id || 'missing'}`
  const rpcArgs = {
    p_local_cycle_id: workspace?.identity?.local_cycle_id || null,
    p_run_token_sha256: runTokenSha256,
    p_code_revision: workspace?.identity?.code_revision || null,
    p_filter_fingerprint: workspace?.identity?.context?.fingerprint || null,
    p_manifest_hash: manifestHash,
    p_mode: workspace?.identity?.mode || null,
    p_region_code: 'us',
    p_storefront: 'playstation',
    p_cycle_date: cycle_date,
    p_started_at: started_at,
    p_idempotency_key: idempotencyKey,
  }
  rpcArgs.p_request_hash = hashPsdealsOperationalRequest(rpcArgs)
  return {
    action: 'create_cycle',
    local_cycle_id: workspace?.identity?.local_cycle_id || null,
    run_token_sha256: runTokenSha256,
    code_revision: workspace?.identity?.code_revision || null,
    filter_fingerprint: workspace?.identity?.context?.fingerprint || null,
    manifest_hash: manifestHash,
    idempotency_key: idempotencyKey,
    request_hash: rpcArgs.p_request_hash,
    authorization_id: authorization?.authorization_id || null,
    cycle_date,
    started_at,
    rpc: 'create_or_reconcile_price_refresh_cycle_v1',
    rpc_args: rpcArgs,
    ready: blockers.length === 0,
    blockers,
    executes_remote_operation: false,
  }
}

export async function executeIdempotentPsdealsCreateCycle(
  request,
  { find_cycles, find_receipt, invoke_create_cycle, write_receipt } = {}
) {
  if (!request?.ready) {
    return { status: 'awaiting_contract', blockers: request?.blockers || ['create_cycle_request_invalid'] }
  }
  if (typeof find_cycles !== 'function' || typeof find_receipt !== 'function' ||
      typeof invoke_create_cycle !== 'function' || typeof write_receipt !== 'function') {
    throw new Error('CREATE_CYCLE_PORT_INCOMPLETE')
  }
  const reconcile = async () => {
    const [candidateRows, receipt] = await Promise.all([
      find_cycles({
        local_cycle_id: request.local_cycle_id,
        run_token_sha256: request.run_token_sha256,
      }),
      find_receipt(request.idempotency_key),
    ])
    const candidates = Array.isArray(candidateRows) ? candidateRows : []
    const matching = candidates.filter((row) => matchingCycle(row, request))
    if (candidates.length > 1 || matching.length > 1) {
      return { status: 'blocked', blockers: ['create_cycle_reconciliation_ambiguous'] }
    }
    if (candidates.length === 1 && matching.length === 0) {
      return { status: 'blocked', blockers: ['create_cycle_foreign_identity_conflict'] }
    }
    if (matching.length === 1) {
      const receiptValidation = validatePsdealsRemoteActionReceipt(receipt, {
        cycle_id: matching[0].id,
        action_kind: 'create_cycle',
        idempotency_key: request.idempotency_key,
        request_hash: request.request_hash,
      })
      if (!receiptValidation.committed) {
        return { status: 'indeterminate', blockers: ['create_cycle_remote_receipt_missing_or_invalid'] }
      }
      return {
        status: 'succeeded',
        remote_cycle_id: matching[0].id,
        remote_receipt: receipt,
        reconciled: true,
      }
    }
    if (receipt) {
      return { status: 'indeterminate', blockers: ['create_cycle_receipt_without_matching_cycle'] }
    }
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

  let invoked
  try {
    invoked = await invoke_create_cycle(request.rpc, request.rpc_args)
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

  const returned = Array.isArray(invoked) ? invoked[0] : invoked
  if (!UUID_PATTERN.test(String(returned?.cycle_id || '')) || returned?.receipt_status !== 'committed') {
    return { status: 'indeterminate', blockers: ['create_cycle_rpc_response_mismatch'] }
  }
  const afterInvoke = await reconcile()
  if (afterInvoke.status !== 'succeeded' || afterInvoke.remote_cycle_id !== returned.cycle_id) {
    return {
      status: afterInvoke.status === 'blocked' ? 'blocked' : 'indeterminate',
      blockers: afterInvoke.blockers || ['create_cycle_postcondition_failed'],
    }
  }
  const receipt = await write_receipt({
    action: 'create_cycle',
    authorization_id: request.authorization_id,
    remote_cycle_id: returned.cycle_id,
    remote_receipt_id: afterInvoke.remote_receipt?.id || returned.receipt_id,
    reconciled: true,
  })
  return {
    status: 'succeeded',
    remote_cycle_id: returned.cycle_id,
    remote_receipt_id: afterInvoke.remote_receipt?.id || returned.receipt_id,
    reconciled: true,
    receipt,
  }
}

export function assessPsdealsLifecycleContracts(remoteFacts) {
  const cycles = remoteFacts?.objects?.price_refresh_cycles
  const receipts = remoteFacts?.objects?.psdeals_cycle_action_receipts
  const functions = remoteFacts?.functions || {}
  const receiptReady = receipts?.exists === true && receipts?.contract_verified === true
  return {
    create_cycle: {
      ready: cycles?.exists === true && receiptReady &&
        functions.create_or_reconcile_price_refresh_cycle_v1?.definition_verified === true,
      reconciliation: 'read_cycle_by_immutable_local_identity_and_committed_create_receipt',
    },
    mark_succeeded: {
      ready: cycles?.exists === true && receiptReady &&
        functions.mark_psdeals_price_refresh_cycle_succeeded_v1?.definition_verified === true,
      reconciliation: 'read_committed_mark_succeeded_receipt_and_cycle_status',
    },
    certify: {
      ready: cycles?.exists === true && receiptReady &&
        functions.certify_price_refresh_cycle_v3?.definition_verified === true,
      reconciliation: 'read_committed_certify_receipt_and_cycle_status',
    },
    refresh_cache: {
      ready: receiptReady && functions.refresh_catalog_public_cache_v16?.definition_verified === true,
      reconciliation: 'read_committed_cache_refresh_receipt_linked_to_certification',
    },
    apply_demotion: {
      ready: receiptReady && functions.apply_psdeals_ended_deals_v2?.definition_verified === true &&
        functions.apply_psdeals_ended_deals_v1?.service_role_execute === false,
      reconciliation: 'read_committed_exact_candidate_set_receipt',
    },
    monthly: {
      ready: receiptReady && functions.record_psdeals_monthly_check_v1?.definition_verified === true,
      reconciliation: 'read_committed_monthly_check_receipt_with_semantic_evidence',
    },
  }
}

export async function executeReconciledPsdealsLifecycleAction(
  request,
  { read_cycle, find_receipt, perform_action, write_receipt } = {}
) {
  if (!request?.ready) return { status: 'awaiting_contract', blockers: request?.blockers || ['lifecycle_request_invalid'] }
  if (!UUID_PATTERN.test(String(request.remote_cycle_id || ''))) {
    return { status: 'blocked', blockers: ['remote_cycle_id_invalid'] }
  }
  if (typeof read_cycle !== 'function' || typeof find_receipt !== 'function' ||
      typeof perform_action !== 'function' || typeof write_receipt !== 'function') {
    throw new Error('LIFECYCLE_PORT_INCOMPLETE')
  }
  const achieved = (row) => request.action === 'mark_succeeded'
    ? ['succeeded', 'certified'].includes(row?.status) && Boolean(row?.finished_at)
    : request.action === 'certify'
      ? row?.status === 'certified' && Boolean(row?.certified_at)
      : request.action === 'refresh_cache'
        ? row?.status === 'certified' && Boolean(row?.cache_refreshed_at)
        : request.action === 'demotion_apply'
          ? Boolean(row?.ended_discounts_completed_at)
          : false
  const reconcile = async () => {
    const [cycle, remoteReceipt] = await Promise.all([
      read_cycle(request.remote_cycle_id),
      find_receipt(request.idempotency_key),
    ])
    const receiptValidation = validatePsdealsRemoteActionReceipt(remoteReceipt, {
      cycle_id: request.remote_cycle_id,
      action_kind: request.action === 'refresh_cache' ? 'cache_refresh' : request.action,
      idempotency_key: request.idempotency_key,
      request_hash: request.request_hash,
    })
    return { cycle, remoteReceipt, receiptValidation }
  }
  const before = await reconcile()
  if (achieved(before.cycle) && before.receiptValidation.committed) {
    return {
      status: 'succeeded',
      reconciled: true,
      remote_receipt: before.remoteReceipt,
      receipt: await write_receipt({ action: request.action, remote_cycle_id: request.remote_cycle_id, remote_receipt_id: before.remoteReceipt.id, reconciled: true }),
    }
  }
  try {
    await perform_action(request)
  } catch (error) {
    const afterError = await reconcile()
    if (!achieved(afterError.cycle) || !afterError.receiptValidation.committed) {
      return {
        status: 'indeterminate',
        blockers: ['lifecycle_transport_ambiguous_unreconciled'],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  const after = await reconcile()
  if (!achieved(after.cycle) || !after.receiptValidation.committed) {
    return { status: 'failed', blockers: ['lifecycle_postcondition_failed'] }
  }
  return {
    status: 'succeeded',
    reconciled: true,
    remote_receipt: after.remoteReceipt,
    receipt: await write_receipt({ action: request.action, remote_cycle_id: request.remote_cycle_id, remote_receipt_id: after.remoteReceipt.id, reconciled: true }),
  }
}
