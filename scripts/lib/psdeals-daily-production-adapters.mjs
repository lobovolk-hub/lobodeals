import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import { collectPsdealsBlock4LocalReadiness } from '../preflight-psdeals-block4-local.mjs'
import {
  executeIdempotentPsdealsCreateCycle,
  preparePsdealsCreateCycleRequest,
} from './psdeals-cycle-operational-adapters.mjs'
import {
  hashPsdealsOperationalRequest,
  validatePsdealsRemoteActionReceipt,
} from './psdeals-cycle-migration-contract.mjs'
import { finalizePsdealsCycleWorkspace } from './psdeals-cycle-workspace.mjs'
import { PSDEALS_DAILY_LIVE_BINDINGS } from './psdeals-daily-live-bindings.mjs'
import {
  buildPsdealsPublicValidationPlan,
  executePsdealsPublicValidation,
} from './psdeals-public-validation.mjs'

const HASH_PATTERN = /^[a-f0-9]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PROCESS_SOURCES = Object.freeze({
  collect_recently_added: 'scripts/collect-psdeals-listing-edge-live-cdp.mjs',
  analyze_recently_added: 'scripts/analyze-psdeals-listing-new-v2.mjs',
  import_recently_added: 'scripts/import-psdeals-detail-local.mjs',
  collect_discounts: 'scripts/collect-psdeals-listing-edge-live-cdp.mjs',
  analyze_fast_refresh: 'scripts/analyze-psdeals-discounts-fast-refresh-v1.mjs',
  import_discount_details: 'scripts/import-psdeals-detail-local.mjs',
  retry_failed_details: 'scripts/import-psdeals-detail-local.mjs',
  analyze_ended: 'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs',
  revalidate_ambiguous_details: 'scripts/import-psdeals-detail-local.mjs',
  reanalyze_ended: 'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs',
})

const INVENTORY_ROWS = [
  ['run_local_preflight', 'local_preflight_passed', 'REUSE_DIRECTLY', 'scripts/preflight-psdeals-block4-local.mjs', 'none', null, 'local_preflight_evidence', 'read-only-by-code-head', 'repeat_read_only_preflight'],
  ['verify_remote_preflight', 'remote_preflight_passed', 'REUSE_DIRECTLY', 'sql/validation/007-safe-demotion-postcheck-certificate-readonly.sql', 'none', null, 'remote_preflight_evidence', 'read-only-by-project-snapshot', 'repeat_same_read_only_certificate'],
  ['probe_edge_cdp', 'edge_ready', 'WRAP_EXISTING_SCRIPT', 'scripts/start-psdeals-edge-cdp.ps1', 'local_process', null, 'edge_runtime_preflight', 'selected-port-plus-dedicated-profile', 'reinspect_owned_edge_process_and_cdp_target'],
  ['wait_for_captcha_clear', 'captcha_resolved', 'REUSE_DIRECTLY', 'scripts/lib/psdeals-edge-cdp-preflight.mjs', 'none', null, 'captcha_runtime_observation', 'poll-current-cdp-target', 'resume_polling_without_clicks_or_chat_confirmation'],
  ['create_remote_cycle', 'cycle_created', 'IMPLEMENT_FROM_CANONICAL_RPC', 'scripts/lib/psdeals-cycle-operational-adapters.mjs', 'supabase', 'create_or_reconcile_price_refresh_cycle_v1', 'committed_create_cycle_receipt', 'create-cycle:<run_intent_id>', 'find_by_immutable_local_identity_and_idempotency_key'],
  ['collect_recently_added', 'recently_added_collected', 'WRAP_EXISTING_SCRIPT', PROCESS_SOURCES.collect_recently_added, 'external_read', null, 'recently_added_collection_evidence', 'recently-added:<remote_cycle_id>:<listing-fingerprint>', 'verify_final_artifact_and_evidence_hash_before_repeat'],
  ['analyze_recently_added', 'recently_added_analyzed', 'EXTRACT_FUNCTION', PROCESS_SOURCES.analyze_recently_added, 'supabase_read', null, 'recently_added_analysis_evidence', 'recently-added-analysis:<remote_cycle_id>:<listing-hash>', 'recompute_from_immutable_listing_artifact'],
  ['import_recently_added', 'recently_added_imported', 'WRAP_EXISTING_SCRIPT', PROCESS_SOURCES.import_recently_added, 'supabase', 'begin_psdeals_cycle_action_v1+finish_psdeals_cycle_action_v1', 'psdeals_import_run_plus_evidence', 'recently-added-import:<remote_cycle_id>:<queue-hash>', 'read_import_run_and_exact_owned_stage_fields'],
  ['collect_discounts', 'discounts_collected', 'WRAP_EXISTING_SCRIPT', PROCESS_SOURCES.collect_discounts, 'external_read', null, 'discounts_collection_evidence', 'discounts:<remote_cycle_id>:<listing-fingerprint>', 'verify_final_artifact_and_evidence_hash_before_repeat'],
  ['analyze_fast_refresh', 'discounts_analyzed', 'EXTRACT_FUNCTION', PROCESS_SOURCES.analyze_fast_refresh, 'supabase_read_and_receipt', 'record_psdeals_listing_completion_v1', 'listing_validation_plus_fast_refresh_analysis', 'fast-refresh:<remote_cycle_id>:<listing-hash>', 'read_listing_receipt_then_recompute_analysis'],
  ['import_discount_details', 'discount_details_imported', 'WRAP_EXISTING_SCRIPT', PROCESS_SOURCES.import_discount_details, 'supabase', 'begin_psdeals_cycle_action_v1+finish_psdeals_cycle_action_v1', 'detail_import', 'detail-import:<remote_cycle_id>:<queue-hash>', 'read_import_run_receipt_and_exact_stage_postconditions'],
  ['retry_failed_details', 'detail_retry_reconciled', 'WRAP_EXISTING_SCRIPT', PROCESS_SOURCES.retry_failed_details, 'supabase', 'begin_psdeals_cycle_action_v1+finish_psdeals_cycle_action_v1', 'detail_retry', 'detail-retry:<remote_cycle_id>:<failure-hash>', 'one_bounded_retry_then_read_import_run'],
  ['process_monthly', 'monthly_processed', 'IMPLEMENT_FROM_CANONICAL_RPC', 'scripts/record-psdeals-monthly-evidence-offline.mjs', 'supabase', 'record_psdeals_monthly_check_v1', 'monthly_check_record', 'monthly:<remote_cycle_id>:<evidence-hash>', 'read_committed_monthly_receipt'],
  ['analyze_ended', 'ended_analyzed', 'EXTRACT_FUNCTION', PROCESS_SOURCES.analyze_ended, 'supabase_read_and_receipt', 'begin_psdeals_cycle_action_v1+finish_psdeals_cycle_action_v1', 'ended_deals_analysis', 'ended-analysis:<remote_cycle_id>:<listing-hash>', 'recompute_from_immutable_listing_and_stage_snapshot'],
  ['revalidate_ambiguous_details', 'ambiguous_revalidated', 'WRAP_EXISTING_SCRIPT', PROCESS_SOURCES.revalidate_ambiguous_details, 'supabase', null, 'detail_revalidation', 'ended-revalidation:<remote_cycle_id>:<queue-hash>', 'read_exact_detail_import_receipt_and_stage_postconditions'],
  ['reanalyze_ended', 'ended_reanalyzed', 'EXTRACT_FUNCTION', PROCESS_SOURCES.reanalyze_ended, 'supabase_read_and_receipt', 'begin_psdeals_cycle_action_v1+finish_psdeals_cycle_action_v1', 'ended_deals_reanalysis', 'ended-reanalysis:<remote_cycle_id>:<input-hash>', 'recompute_exact_bounded_candidate_set'],
  ['apply_safe_demotions_v2', 'demotions_reconciled', 'IMPLEMENT_FROM_CANONICAL_RPC', 'scripts/lib/psdeals-ended-discounts.mjs', 'supabase', 'apply_psdeals_ended_deals_v2', 'demotion_apply', 'demotion-apply:<remote_cycle_id>:<candidate-set-hash>', 'read_committed_exact_candidate_set_receipt_and_cycle'],
  ['prepare_candidates', 'candidates_prepared', 'REUSE_DIRECTLY', 'scripts/lib/psdeals-certification-evidence.mjs', 'none', null, 'candidate_set', 'candidates:<remote_cycle_id>:<evidence-chain-hash>', 'recompute_from_verified_cycle_evidence'],
  ['certify_candidates_v3', 'certification_reconciled', 'IMPLEMENT_FROM_CANONICAL_RPC', 'scripts/lib/psdeals-cycle-operational-adapters.mjs', 'supabase', 'mark_psdeals_price_refresh_cycle_succeeded_v1+certify_price_refresh_cycle_v3', 'mark_succeeded_plus_certify', 'mark-and-certify:<remote_cycle_id>:<candidate-set-hash>', 'read_committed_mark_and_certify_receipts_and_cycle_status'],
  ['apply_compact_minima', 'minima_reconciled', 'REUSE_DIRECTLY', 'scripts/lib/psdeals-compact-minima.mjs', 'none', 'certify_price_refresh_cycle_v3', 'certification_minima_result', 'minima:<certification-receipt-id>', 'verify_minima_counts_from_committed_certification_receipt'],
  ['refresh_cache_v16', 'cache_reconciled', 'IMPLEMENT_FROM_CANONICAL_RPC', 'scripts/lib/psdeals-cycle-operational-adapters.mjs', 'supabase', 'refresh_catalog_public_cache_v16', 'cache_refresh', 'cache-refresh:<remote_cycle_id>:<certification-receipt-id>', 'read_committed_cache_receipt_cycle_and_cache_timestamp'],
  ['run_final_postchecks', 'final_postchecks_passed', 'REUSE_DIRECTLY', 'scripts/lib/psdeals-public-validation.mjs', 'remote_read_only', null, 'cycle_public_postcheck', 'read-only:<remote_cycle_id>:<cache-receipt-id>', 'repeat_bounded_read_only_postchecks'],
  ['finalize_or_reconcile_cycle', 'succeeded', 'REUSE_DIRECTLY', 'scripts/lib/psdeals-cycle-workspace.mjs', 'local_artifact', null, 'final_manifest', 'manifest:<remote_cycle_id>:<evidence-chain-hash>', 'verify_existing_manifest_hash_before_noop'],
]

const TIMEOUTS = new Map(PSDEALS_DAILY_LIVE_BINDINGS.map((binding) => [binding.adapter, binding.timeout_ms]))

export const PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY = Object.freeze(INVENTORY_ROWS.map(([
  name, stage, classification, source, mutation, rpc, evidence, idempotency, reconciliation,
]) => Object.freeze({
  name,
  stage,
  classification,
  source,
  inputs: `psdeals.daily.${name}.input.v1`,
  outputs: 'psdeals.daily.stage-result.v1',
  mutation,
  rpc,
  receipt: evidence,
  evidence,
  idempotency,
  timeout_ms: TIMEOUTS.get(name),
  reconciliation,
  status: 'BOUND',
})))

function inputFor(context, name) {
  return context?.production_inputs?.[name] || {}
}

function resultFor(context, extra = {}) {
  return {
    status: 'succeeded',
    accepted_parent_receipt_id: context?.previous_stage_receipt_id ?? null,
    executed_writes: 0,
    external_action_performed: false,
    action_receipt: null,
    ...extra,
  }
}

function blocked(context, blocker, status = 'failed') {
  return resultFor(context, { status, blockers: [blocker] })
}

function assertPermission(input, expected) {
  if (input.authorization?.permission !== expected || !input.authorization?.authorization_id) {
    throw new Error(`PRODUCTION_ADAPTER_AUTHORIZATION_REQUIRED:${expected}`)
  }
}

function rowOf(value) {
  return Array.isArray(value) ? value[0] : value
}

function receiptFrom(row, remoteCycleId) {
  const value = rowOf(row) || {}
  return {
    receipt_id: value.receipt_id || value.id || null,
    cycle_id: value.cycle_id || remoteCycleId || null,
    status: value.action_status || value.status || null,
    result: value.result || value,
  }
}

function validateRpcArgs(args, requiredNames) {
  const missing = requiredNames.filter((name) => !(name in (args || {})))
  if (missing.length > 0) throw new Error(`PRODUCTION_RPC_ARGS_MISSING:${missing.join(',')}`)
}

async function invokeRpc(context, name, args) {
  const port = context?.production_ports?.supabase
  if (typeof port?.write?.invokeAllowedRpc !== 'function') throw new Error('PRODUCTION_SUPABASE_WRITE_PORT_REQUIRED')
  return port.write.invokeAllowedRpc(name, args)
}

async function invokeReconciledRpc(context, name, args, actionKind) {
  validateRpcArgs(args, ['p_cycle_id', 'p_idempotency_key', 'p_request_hash'])
  const port = context?.production_ports?.supabase
  if (typeof port?.read?.findActionReceiptByIdempotencyKey !== 'function') {
    throw new Error('PRODUCTION_SUPABASE_RECEIPT_READ_PORT_REQUIRED')
  }
  const expected = {
    cycle_id: args.p_cycle_id,
    action_kind: actionKind,
    idempotency_key: args.p_idempotency_key,
    request_hash: args.p_request_hash,
  }
  const reconcile = async () => {
    const receipt = await port.read.findActionReceiptByIdempotencyKey(args.p_idempotency_key)
    const validation = validatePsdealsRemoteActionReceipt(receipt, expected)
    return validation.committed ? receipt : receipt ? { unresolved_receipt: receipt } : null
  }
  const before = await reconcile()
  if (before?.unresolved_receipt) throw new Error(`PRODUCTION_RPC_REQUIRES_RECONCILIATION:${name}`)
  if (before) return { row: before, reconciled: true, invoked: false }
  try {
    const row = await invokeRpc(context, name, args)
    return { row, reconciled: false, invoked: true }
  } catch (error) {
    const after = await reconcile()
    if (after && !after.unresolved_receipt) return { row: after, reconciled: true, invoked: true, transport_error: true }
    throw new Error(`PRODUCTION_RPC_REQUIRES_RECONCILIATION:${name}:${error instanceof Error ? error.message : String(error)}`)
  }
}

async function defaultRunProcess(spec) {
  return new Promise((resolve, reject) => {
    const child = spawn(spec.executable, [spec.entrypoint, ...spec.args], {
      cwd: spec.cwd,
      shell: false,
      windowsHide: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spec.env,
    })
    let stdoutBytes = 0
    let stderrBytes = 0
    let exceeded = false
    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length
      if (stdoutBytes > spec.stdout_limit_bytes) { exceeded = true; child.kill() }
    })
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length
      if (stderrBytes > spec.stderr_limit_bytes) { exceeded = true; child.kill() }
    })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, spec.timeout_ms)
    child.once('error', reject)
    child.once('close', (exitCode) => {
      clearTimeout(timer)
      resolve({ exit_code: exitCode, stdout_bytes: stdoutBytes, stderr_bytes: stderrBytes, timed_out: timedOut, output_exceeded: exceeded })
    })
  })
}

async function defaultVerifyArtifacts(spec) {
  for (const file of spec.expected_artifacts) {
    const stat = await fs.stat(file)
    if (!stat.isFile()) return { valid: false }
  }
  return { valid: true }
}

async function defaultFetchPublicPage({ url, timeout_ms, max_body_bytes, follows_redirects }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('PUBLIC_VALIDATION_TIMEOUT')), timeout_ms)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: follows_redirects ? 'follow' : 'manual',
      signal: controller.signal,
    })
    const chunks = []
    let bodyBytes = 0
    const reader = response.body?.getReader()
    if (reader) {
      while (bodyBytes <= max_body_bytes) {
        const { done, value } = await reader.read()
        if (done) break
        bodyBytes += value.byteLength
        chunks.push(Buffer.from(value))
      }
      if (bodyBytes > max_body_bytes) await reader.cancel()
    }
    const bytes = Buffer.concat(chunks)
    return {
      status: response.status,
      body_bytes: bodyBytes,
      body: bytes.subarray(0, max_body_bytes + 1).toString('utf8'),
    }
  } finally {
    clearTimeout(timer)
  }
}

function buildProcessSpec(name, context) {
  const input = inputFor(context, name)
  const projectRoot = path.resolve(input.project_root || process.cwd())
  const source = PROCESS_SOURCES[name]
  if (!source) throw new Error('PRODUCTION_PROCESS_SOURCE_UNKNOWN')
  const entrypoint = path.resolve(projectRoot, source)
  const relative = path.relative(projectRoot, entrypoint)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('PRODUCTION_PROCESS_ENTRYPOINT_OUTSIDE_PROJECT')
  if (!Array.isArray(input.args) || input.args.some((value) => typeof value !== 'string')) {
    throw new Error('PRODUCTION_PROCESS_ARGS_REQUIRED')
  }
  const expectedArtifacts = (input.expected_artifacts || []).map((file) => path.resolve(file))
  if (expectedArtifacts.length === 0) throw new Error('PRODUCTION_PROCESS_ARTIFACTS_REQUIRED')
  if (input.workspace?.root_dir && expectedArtifacts.some((file) => {
    const rel = path.relative(path.resolve(input.workspace.root_dir), file)
    return rel.startsWith('..') || path.isAbsolute(rel)
  })) throw new Error('PRODUCTION_PROCESS_ARTIFACT_OUTSIDE_WORKSPACE')
  const allowedEnv = Object.fromEntries((input.allowed_env || []).map((key) => [key, process.env[key]]).filter(([, value]) => typeof value === 'string'))
  return {
    adapter: name,
    executable: process.execPath,
    entrypoint,
    args: [...input.args],
    cwd: projectRoot,
    shell: false,
    timeout_ms: TIMEOUTS.get(name),
    stdout_limit_bytes: input.stdout_limit_bytes || 8 * 1024 * 1024,
    stderr_limit_bytes: input.stderr_limit_bytes || 4 * 1024 * 1024,
    expected_artifacts: expectedArtifacts,
    env: { ...allowedEnv, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP },
  }
}

async function executeProcess(name, context, { permission = null } = {}) {
  const input = inputFor(context, name)
  if (permission) assertPermission(input, permission)
  const spec = buildProcessSpec(name, context)
  const runProcess = context?.production_ports?.run_process || defaultRunProcess
  const verifyArtifacts = context?.production_ports?.verify_artifacts || defaultVerifyArtifacts
  const run = await runProcess(spec)
  if (run.timed_out || run.output_exceeded) return blocked(context, 'production_process_requires_reconciliation', 'requires_reconciliation')
  if (run.exit_code !== 0) return blocked(context, 'production_process_failed')
  const verification = await verifyArtifacts(spec)
  if (verification?.valid !== true) return blocked(context, 'production_process_evidence_invalid')
  return resultFor(context, {
    process_spec: { ...spec, env: Object.keys(spec.env).filter((key) => spec.env[key] !== undefined) },
    evidence: verification.evidence || null,
  })
}

async function executeReceiptBoundProcess(name, context, { permission, actionKind, parentReceiptId } = {}) {
  const input = inputFor(context, name)
  assertPermission(input, permission)
  const receiptInput = input.receipt || {}
  const beginArgs = {
    p_cycle_id: context.run_identity?.remote_cycle_id,
    p_parent_receipt_id: parentReceiptId || receiptInput.parent_receipt_id,
    p_action_kind: actionKind,
    p_idempotency_key: receiptInput.idempotency_key,
    p_attempt: 1,
    p_request_hash: receiptInput.request_hash,
    p_input_artifact_hash: receiptInput.input_artifact_hash,
    p_started_at: receiptInput.started_at,
  }
  validateRpcArgs(beginArgs, [
    'p_cycle_id', 'p_parent_receipt_id', 'p_action_kind', 'p_idempotency_key',
    'p_attempt', 'p_request_hash', 'p_input_artifact_hash', 'p_started_at',
  ])
  const existing = await context.production_ports.supabase.read.findActionReceiptByIdempotencyKey(beginArgs.p_idempotency_key)
  const existingValidation = validatePsdealsRemoteActionReceipt(existing, {
    cycle_id: beginArgs.p_cycle_id,
    action_kind: actionKind,
    idempotency_key: beginArgs.p_idempotency_key,
    request_hash: beginArgs.p_request_hash,
    input_artifact_hash: beginArgs.p_input_artifact_hash,
    parent_receipt_id: beginArgs.p_parent_receipt_id,
  })
  if (existingValidation.committed) {
    return resultFor(context, { action_receipt: receiptFrom(existing, beginArgs.p_cycle_id), reconciliation: { reconciled: true } })
  }
  if (existing) return blocked(context, 'receipt_bound_process_requires_reconciliation', 'requires_reconciliation')
  let begun
  try {
    begun = rowOf(await invokeRpc(context, 'begin_psdeals_cycle_action_v1', beginArgs))
  } catch {
    const after = await context.production_ports.supabase.read.findActionReceiptByIdempotencyKey(beginArgs.p_idempotency_key)
    if (!after) return blocked(context, 'receipt_begin_requires_reconciliation', 'requires_reconciliation')
    begun = after
  }
  if (!begun?.id || begun.status !== 'running') return blocked(context, 'receipt_begin_contract_invalid', 'requires_reconciliation')
  const processResult = await executeProcess(name, context, { permission })
  const terminalStatus = processResult.status === 'succeeded'
    ? 'committed'
    : processResult.status === 'requires_reconciliation'
      ? 'indeterminate'
      : 'failed'
  const finishArgs = {
    p_receipt_id: begun.id,
    p_cycle_id: beginArgs.p_cycle_id,
    p_idempotency_key: beginArgs.p_idempotency_key,
    p_request_hash: beginArgs.p_request_hash,
    p_status: terminalStatus,
    p_finished_at: receiptInput.finished_at,
    p_affected_rows: Number(receiptInput.affected_rows || 0),
    p_result: receiptInput.result || {},
    p_error_code: terminalStatus === 'committed' ? null : receiptInput.error_code || 'PROCESS_STAGE_INCOMPLETE',
  }
  let finished
  try {
    finished = rowOf(await invokeRpc(context, 'finish_psdeals_cycle_action_v1', finishArgs))
  } catch {
    finished = await context.production_ports.supabase.read.findActionReceiptByIdempotencyKey(beginArgs.p_idempotency_key)
  }
  const validation = validatePsdealsRemoteActionReceipt(finished, {
    cycle_id: beginArgs.p_cycle_id,
    action_kind: actionKind,
    idempotency_key: beginArgs.p_idempotency_key,
    request_hash: beginArgs.p_request_hash,
    input_artifact_hash: beginArgs.p_input_artifact_hash,
    parent_receipt_id: beginArgs.p_parent_receipt_id,
  })
  if (terminalStatus === 'committed' && !validation.committed) {
    return blocked(context, 'receipt_finish_requires_reconciliation', 'requires_reconciliation')
  }
  return resultFor(context, {
    ...processResult,
    executed_writes: 1,
    external_action_performed: true,
    action_receipt: receiptFrom(finished, beginArgs.p_cycle_id),
  })
}

async function run_local_preflight(context) {
  const input = inputFor(context, 'run_local_preflight')
  const report = await collectPsdealsBlock4LocalReadiness({ test_count: input.test_count })
  return report.valid ? resultFor(context, { evidence: report }) : blocked(context, 'local_preflight_failed')
}

async function verify_remote_preflight(context) {
  const evidence = inputFor(context, 'verify_remote_preflight').evidence || context.remote_preflight
  const valid = evidence?.read_only_verified === true && evidence?.migration_007_applied === true &&
    evidence?.certificate_passed === true && Number(evidence?.blocker_failures) === 0 &&
    (evidence?.blockers || []).length === 0 && evidence?.drift_detected !== true
  return valid ? resultFor(context, { evidence }) : blocked(context, 'remote_preflight_failed')
}

async function probe_edge_cdp(context) {
  const evidence = inputFor(context, 'probe_edge_cdp').evidence || context.edge_cdp
  const valid = evidence?.ready === true && ['page_ready', 'challenge_cleared'].includes(evidence?.state) &&
    Number.isSafeInteger(evidence?.port) && evidence.port >= 9222 && evidence.port <= 9232 &&
    evidence?.launcher?.operational_profile_verified === true
  return valid ? resultFor(context, { evidence }) : blocked(context, 'edge_runtime_preflight_failed')
}

async function wait_for_captcha_clear(context) {
  const evidence = inputFor(context, 'wait_for_captcha_clear').evidence || context.edge_cdp
  const valid = evidence?.ready === true && ['page_ready', 'challenge_cleared'].includes(evidence?.state) &&
    evidence?.chat_confirmation_required === false
  return valid ? resultFor(context, { evidence }) : blocked(context, 'captcha_automatic_wait_incomplete', 'requires_johan')
}

async function create_remote_cycle(context) {
  const input = inputFor(context, 'create_remote_cycle')
  assertPermission(input, 'allow_create_remote_cycle')
  const request = preparePsdealsCreateCycleRequest(input)
  const port = context?.production_ports?.supabase
  const result = await executeIdempotentPsdealsCreateCycle(request, {
    find_cycles: (query) => port.read.findCyclesByLocalIdentity(query),
    find_receipt: (key) => port.read.findActionReceiptByIdempotencyKey(key),
    invoke_create_cycle: (rpc, args) => port.write.invokeAllowedRpc(rpc, args),
    write_receipt: async (receipt) => receipt,
  })
  if (result.status !== 'succeeded') {
    return blocked(context, result.blockers?.[0] || 'create_cycle_requires_reconciliation', 'requires_reconciliation')
  }
  return resultFor(context, {
    remote_cycle_id: result.remote_cycle_id,
    executed_writes: result.created === true ? 1 : 0,
    external_action_performed: true,
    action_receipt: receiptFrom(result.remote_receipt || { receipt_id: result.remote_receipt_id }, result.remote_cycle_id),
    reconciliation: result,
  })
}

async function collect_recently_added(context) { return executeProcess('collect_recently_added', context, { permission: 'allow_collect_listing' }) }
async function analyze_recently_added(context) { return executeProcess('analyze_recently_added', context, { permission: 'allow_analyze_detail_candidates' }) }
async function import_recently_added(context) {
  return executeReceiptBoundProcess('import_recently_added', context, {
    permission: 'allow_detail_import',
    actionKind: 'detail_import',
  })
}
async function collect_discounts(context) { return executeProcess('collect_discounts', context, { permission: 'allow_collect_listing' }) }

async function analyze_fast_refresh(context) {
  const input = inputFor(context, 'analyze_fast_refresh')
  validateRpcArgs(input.listing_rpc_args, [
    'p_cycle_id', 'p_idempotency_key', 'p_request_hash', 'p_listing_artifact_hash',
    'p_filter_fingerprint', 'p_listing_observed_at', 'p_items_seen', 'p_pages_failed',
    'p_duplicate_ids', 'p_is_partial', 'p_termination_observed', 'p_started_at', 'p_finished_at',
  ])
  const listing = await invokeReconciledRpc(
    context,
    'record_psdeals_listing_completion_v1',
    input.listing_rpc_args,
    'listing_validation'
  )
  const listingReceipt = receiptFrom(listing.row, context.run_identity?.remote_cycle_id)
  return executeReceiptBoundProcess('analyze_fast_refresh', context, {
    permission: 'allow_analyze_detail_candidates',
    actionKind: 'fast_refresh_analysis',
    parentReceiptId: listingReceipt.receipt_id,
  })
}

async function import_discount_details(context) {
  return executeReceiptBoundProcess('import_discount_details', context, { permission: 'allow_detail_import', actionKind: 'detail_import' })
}
async function retry_failed_details(context) {
  return executeReceiptBoundProcess('retry_failed_details', context, { permission: 'allow_detail_retry', actionKind: 'detail_retry' })
}

async function process_monthly(context) {
  const input = inputFor(context, 'process_monthly')
  assertPermission(input, 'allow_monthly_record')
  if (input.status === 'not_due') return resultFor(context, { status: 'skipped', evidence: { status: 'not_due' } })
  validateRpcArgs(input.rpc_args, [
    'p_cycle_id', 'p_idempotency_key', 'p_request_hash', 'p_checked_at', 'p_source_type',
    'p_source_reference', 'p_procedure', 'p_procedure_version', 'p_evidence_hash', 'p_result',
    'p_proposed_changes_count', 'p_application_performed', 'p_started_at', 'p_finished_at',
  ])
  if (input.rpc_args.p_application_performed !== false) return blocked(context, 'monthly_application_forbidden')
  const rpc = await invokeReconciledRpc(context, 'record_psdeals_monthly_check_v1', input.rpc_args, 'monthly_check_record')
  const receipt = receiptFrom(rpc.row, context.run_identity?.remote_cycle_id)
  return resultFor(context, { executed_writes: rpc.invoked ? 1 : 0, external_action_performed: rpc.invoked, action_receipt: receipt })
}

async function analyze_ended(context) {
  return executeReceiptBoundProcess('analyze_ended', context, { permission: 'allow_analyze_ended_deals', actionKind: 'ended_deals_analysis' })
}
async function revalidate_ambiguous_details(context) {
  return executeReceiptBoundProcess('revalidate_ambiguous_details', context, { permission: 'allow_detail_import', actionKind: 'detail_import' })
}
async function reanalyze_ended(context) {
  return executeReceiptBoundProcess('reanalyze_ended', context, { permission: 'allow_analyze_ended_deals', actionKind: 'ended_deals_analysis' })
}

async function apply_safe_demotions_v2(context) {
  const input = inputFor(context, 'apply_safe_demotions_v2')
  assertPermission(input, 'allow_apply_demotion')
  if (input.rpc === 'apply_psdeals_ended_deals_v1') return blocked(context, 'legacy_demotion_v1_forbidden')
  validateRpcArgs(input.rpc_args, [
    'p_cycle_id', 'p_ended_analysis_receipt_id', 'p_idempotency_key', 'p_request_hash',
    'p_listing_artifact_hash', 'p_analysis_evidence_hash', 'p_candidate_set_hash',
    'p_candidate_psdeals_ids', 'p_expected_count', 'p_applied_at',
  ])
  const rpc = await invokeReconciledRpc(context, 'apply_psdeals_ended_deals_v2', input.rpc_args, 'demotion_apply')
  const receipt = receiptFrom(rpc.row, context.run_identity?.remote_cycle_id)
  return resultFor(context, { executed_writes: rpc.invoked ? 1 : 0, external_action_performed: rpc.invoked, action_receipt: receipt })
}

async function prepare_candidates(context) {
  const input = inputFor(context, 'prepare_candidates')
  if (!Array.isArray(input.regular) || !Array.isArray(input.ps_plus) || !HASH_PATTERN.test(String(input.evidence_chain_hash || ''))) {
    return blocked(context, 'certification_candidate_evidence_invalid')
  }
  return resultFor(context, { evidence: { regular_count: input.regular.length, ps_plus_count: input.ps_plus.length, evidence_chain_hash: input.evidence_chain_hash } })
}

async function certify_candidates_v3(context) {
  const input = inputFor(context, 'certify_candidates_v3')
  assertPermission(input, 'allow_certify')
  validateRpcArgs(input.mark_rpc_args, [
    'p_cycle_id', 'p_demotion_receipt_id', 'p_required_receipt_ids', 'p_idempotency_key',
    'p_request_hash', 'p_manifest_hash', 'p_details_completed_at', 'p_validation_completed_at',
    'p_finished_at', 'p_items_updated', 'p_items_failed', 'p_new_items_detected', 'p_metrics',
  ])
  const mark = await invokeReconciledRpc(context, 'mark_psdeals_price_refresh_cycle_succeeded_v1', input.mark_rpc_args, 'mark_succeeded')
  const markReceipt = receiptFrom(mark.row, context.run_identity?.remote_cycle_id)
  if (!markReceipt.receipt_id || !['committed', 'succeeded'].includes(markReceipt.status)) {
    return blocked(context, 'mark_succeeded_requires_reconciliation', 'requires_reconciliation')
  }
  const certifyArgs = { ...(input.certify_rpc_args || {}), p_mark_succeeded_receipt_id: markReceipt.receipt_id }
  validateRpcArgs(certifyArgs, ['p_cycle_id', 'p_mark_succeeded_receipt_id', 'p_idempotency_key', 'p_request_hash', 'p_started_at'])
  const certify = await invokeReconciledRpc(context, 'certify_price_refresh_cycle_v3', certifyArgs, 'certify')
  const certifyReceipt = receiptFrom(certify.row, context.run_identity?.remote_cycle_id)
  const writes = Number(mark.invoked) + Number(certify.invoked)
  return resultFor(context, { executed_writes: writes, external_action_performed: writes > 0, action_receipt: certifyReceipt, evidence: { mark_receipt: markReceipt, certification: rowOf(certify.row) } })
}

async function apply_compact_minima(context) {
  const input = inputFor(context, 'apply_compact_minima')
  const counters = ['regular_initialized', 'regular_lowered', 'ps_plus_initialized', 'ps_plus_lowered']
  if (!UUID_PATTERN.test(String(input.certification_receipt_id || '')) || counters.some((key) => !Number.isSafeInteger(input[key]) || input[key] < 0)) {
    return blocked(context, 'compact_minima_receipt_result_invalid')
  }
  return resultFor(context, { evidence: Object.fromEntries(counters.map((key) => [key, input[key]])) })
}

async function refresh_cache_v16(context) {
  const input = inputFor(context, 'refresh_cache_v16')
  assertPermission(input, 'allow_refresh_cache')
  if (input.rpc === 'refresh_catalog_public_cache_v15') return blocked(context, 'legacy_cache_v15_forbidden')
  validateRpcArgs(input.rpc_args, ['p_cycle_id', 'p_certification_receipt_id', 'p_idempotency_key', 'p_request_hash', 'p_started_at'])
  const rpc = await invokeReconciledRpc(context, 'refresh_catalog_public_cache_v16', input.rpc_args, 'cache_refresh')
  return resultFor(context, { executed_writes: rpc.invoked ? 1 : 0, external_action_performed: rpc.invoked, action_receipt: receiptFrom(rpc.row, context.run_identity?.remote_cycle_id) })
}

async function run_final_postchecks(context) {
  const input = inputFor(context, 'run_final_postchecks')
  const plan = buildPsdealsPublicValidationPlan({
    base_url: input.base_url,
    detail_slugs: input.detail_slugs,
    timeout_ms: input.timeout_ms,
  })
  const report = await executePsdealsPublicValidation(plan, {
    fetch_page: context?.production_ports?.fetch_public_page || defaultFetchPublicPage,
  })
  return report.valid === true && report.read_only_requests_performed === true
    ? resultFor(context, { evidence: report })
    : blocked(context, 'final_read_only_postchecks_failed')
}

async function finalize_or_reconcile_cycle(context) {
  const input = inputFor(context, 'finalize_or_reconcile_cycle')
  if (!input.workspace) return blocked(context, 'finalization_workspace_missing')
  const reference = await finalizePsdealsCycleWorkspace({
    workspace: input.workspace,
    status: input.status || 'operational_complete',
    finished_at: input.finished_at,
    manifest_reference: input.manifest_reference || null,
    reason_codes: input.reason_codes || [],
  })
  return resultFor(context, { evidence: reference })
}

const IMPLEMENTATIONS = Object.freeze({
  run_local_preflight,
  verify_remote_preflight,
  probe_edge_cdp,
  wait_for_captcha_clear,
  create_remote_cycle,
  collect_recently_added,
  analyze_recently_added,
  import_recently_added,
  collect_discounts,
  analyze_fast_refresh,
  import_discount_details,
  retry_failed_details,
  process_monthly,
  analyze_ended,
  revalidate_ambiguous_details,
  reanalyze_ended,
  apply_safe_demotions_v2,
  prepare_candidates,
  certify_candidates_v3,
  apply_compact_minima,
  refresh_cache_v16,
  run_final_postchecks,
  finalize_or_reconcile_cycle,
})

export function validatePsdealsDailyProductionRegistry(adapters) {
  const required = PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY.map((row) => row.name)
  const missing = required.filter((name) => typeof adapters?.[name] !== 'function')
  const unknown = Object.keys(adapters || {}).filter((name) => !required.includes(name))
  const nonProduction = required.filter((name) => adapters?.[name]?.psdeals_implementation_status !== 'production')
  const sourceMismatch = required.filter((name) => adapters?.[name]?.psdeals_source !== PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY.find((row) => row.name === name)?.source)
  return {
    valid: missing.length === 0 && unknown.length === 0 && nonProduction.length === 0 && sourceMismatch.length === 0,
    total: required.length,
    bound: required.length - missing.length - nonProduction.length,
    missing,
    unknown,
    non_production: nonProduction,
    source_mismatch: sourceMismatch,
  }
}

export function createPsdealsDailyProductionAdapters({ production_inputs, production_ports } = {}) {
  return Object.fromEntries(PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY.map((row) => {
    const implementation = IMPLEMENTATIONS[row.name]
    const adapter = async (context = {}) => implementation({
      ...context,
      production_inputs: context.production_inputs || production_inputs,
      production_ports: context.production_ports || production_ports,
    })
    Object.defineProperties(adapter, {
      psdeals_implementation_status: { value: 'production', enumerable: true },
      psdeals_implementation: { value: implementation.name, enumerable: true },
      psdeals_source: { value: row.source, enumerable: true },
      psdeals_inventory: { value: row, enumerable: true },
    })
    return [row.name, adapter]
  }))
}

export function buildPsdealsProductionParityRequest(adapterName, context = {}) {
  const row = PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY.find((value) => value.name === adapterName)
  if (!row) throw new Error('PRODUCTION_ADAPTER_UNKNOWN')
  const input = inputFor(context, adapterName)
  return {
    adapter: adapterName,
    input_schema: row.inputs,
    output_schema: row.outputs,
    run_intent_id: context.run_identity?.run_intent_id || null,
    remote_cycle_id: context.run_identity?.remote_cycle_id || null,
    previous_stage_receipt_id: context.previous_stage_receipt_id ?? null,
    target: row.rpc || row.source,
    idempotency_key: input.idempotency_key || null,
    request_hash: input.request_hash || (input.rpc_args ? hashPsdealsOperationalRequest(input.rpc_args) : null),
    mutation: row.mutation,
    evidence: row.evidence,
    timeout_ms: row.timeout_ms,
    reconciliation: row.reconciliation,
  }
}
