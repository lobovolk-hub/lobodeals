import { assemblePsdealsCycleManifest } from './psdeals-evidence-assembly.mjs'
import { stablePsdealsEvidenceJson } from './psdeals-evidence-envelope.mjs'
import { readPsdealsArtifact } from './psdeals-evidence-io.mjs'
import { loadVerifiedPsdealsCycleEvidence } from './psdeals-cycle-evidence-store.mjs'
import {
  beginPsdealsCycleStage,
  finishPsdealsCycleStage,
  readPsdealsCycleLedger,
  recoverInterruptedPsdealsCycleStage,
} from './psdeals-cycle-ledger.mjs'
import { validatePsdealsCycleManifest } from './psdeals-cycle-manifest.mjs'
import {
  buildPsdealsDailyCyclePlan,
  PSDEALS_DAILY_CYCLE_STEPS,
} from './psdeals-cycle-plan.mjs'
import {
  finalizePsdealsCycleWorkspace,
  resolvePsdealsCycleWorkspacePath,
} from './psdeals-cycle-workspace.mjs'

export const PSDEALS_CYCLE_RUNNER_MODES = Object.freeze([
  'plan',
  'fixture',
  'offline_validation',
  'operational',
])

export const PSDEALS_CYCLE_RUNNER_EXIT_CODES = Object.freeze({
  success: 0,
  usage_or_io_error: 1,
  evidence_invalid: 2,
  state_indeterminate: 3,
  stage_blocked: 4,
  awaiting_authorization: 5,
  stage_failed: 6,
  workspace_corrupt: 7,
  lock_active: 8,
})

export const PSDEALS_OPERATIONAL_ADAPTER_READINESS = Object.freeze({
  create_cycle: 'contract_known_authorization_and_remote_adapter_missing',
  collect_listing: 'producer_exists_authorization_and_process_adapter_missing',
  validate_listing: 'implemented_locally',
  build_partial_payload: 'implemented_locally',
  upsert_listing: 'prepared_fake_only_remote_adapter_missing',
  analyze_detail_candidates: 'producer_exists_authorization_and_remote_adapter_missing',
  import_details: 'producer_exists_authorization_and_process_adapter_missing',
  retry_details: 'producer_exists_authorization_and_process_adapter_missing',
  check_monthly_games: 'manual_evidence_cli_implemented_real_source_review_required',
  analyze_ended_deals: 'analysis_exists_authorization_and_remote_adapter_missing',
  validate_cycle: 'implemented_locally_remote_state_verification_missing',
  mark_succeeded: 'contract_known_authorization_and_remote_adapter_missing',
  certify: 'contract_known_authorization_and_remote_adapter_missing',
  refresh_cache: 'contract_known_authorization_and_remote_adapter_missing',
  validate_public: 'contract_incomplete_authorization_required',
  record_metrics: 'contract_incomplete_remote_adapter_missing',
})

function iso(now) {
  const value = now()
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function gatesFromLedger(ledger) {
  const succeeded = (stage) => ledger.stages?.[stage]?.status === 'succeeded'
  return {
    listing_complete: succeeded('validate_listing'),
    can_demote: succeeded('analyze_ended_deals'),
    can_mark_succeeded: succeeded('validate_cycle'),
    can_certify: succeeded('mark_succeeded'),
    can_refresh_cache: succeeded('certify'),
  }
}

function statusResult({ workspace, ledger, mode, blockers = [], exitCode = 0 }) {
  const gates = gatesFromLedger(ledger)
  return {
    exit_code: exitCode,
    local_cycle_id: workspace.identity.local_cycle_id,
    run_token: workspace.identity.run_token,
    mode,
    valid_ledger: ledger.valid,
    current_stage: ledger.running?.stage || null,
    last_completed_stage: ledger.last_succeeded_stage,
    next_stage: ledger.next_stage,
    gates,
    blockers,
    CAN_DEMOTE: gates.can_demote,
    CAN_MARK_SUCCEEDED: gates.can_mark_succeeded,
    CAN_CERTIFY: gates.can_certify,
    CAN_REFRESH_CACHE: gates.can_refresh_cache,
  }
}

export function planPsdealsCycleRun({ workspace, ledger }) {
  const gates = gatesFromLedger(ledger)
  const completed = PSDEALS_DAILY_CYCLE_STEPS
    .filter((stage) => ['succeeded', 'skipped'].includes(ledger.stages?.[stage.name]?.status))
    .map((stage) => stage.name)
  const failed = PSDEALS_DAILY_CYCLE_STEPS
    .filter((stage) => ['failed', 'partial', 'blocked'].includes(ledger.stages?.[stage.name]?.status))
    .map((stage) => stage.name)
  return {
    ...statusResult({ workspace, ledger, mode: workspace.identity.mode }),
    plan: buildPsdealsDailyCyclePlan({ completed_steps: completed, failed_steps: failed, gates }),
    executes_commands: false,
    opens_connections: false,
  }
}

export async function verifyPsdealsCycleWorkspaceEvidence({ workspace, now } = {}) {
  const ledger = await readPsdealsCycleLedger({ workspace })
  if (!ledger.valid) {
    return { valid: false, classification: 'workspace_corrupt', ledger, errors: ledger.errors }
  }
  const store = await loadVerifiedPsdealsCycleEvidence({ workspace, now })
  if (!store.valid) {
    return { valid: false, classification: 'evidence_invalid', ledger, store, errors: store.errors }
  }
  const kinds = new Set(store.evidence_kinds)
  const producerChainPresent = ['listing_collection', 'fast_refresh_analysis', 'detail_import'].every((kind) => kinds.has(kind))
  if (!producerChainPresent) {
    return { valid: true, classification: 'indeterminate', ledger, store, assembly: null, manifest_validation: null, errors: [] }
  }

  let generatedAt = now
  let storedManifest = null
  try {
    const manifestPath = await resolvePsdealsCycleWorkspacePath(workspace, 'manifest/cycle-manifest.json', { must_exist: true })
    const loaded = await readPsdealsArtifact({
      root_dir: workspace.root_dir,
      file_path: manifestPath,
      portable_path: 'manifest/cycle-manifest.json',
      role: 'cycle_manifest',
      artifact_kind: 'cycle_manifest',
    })
    storedManifest = JSON.parse(loaded.bytes.toString('utf8'))
    generatedAt = storedManifest.identity?.generated_at || generatedAt
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const assembly = assemblePsdealsCycleManifest(store.records, {
    generated_at: generatedAt,
    now,
  })
  if (!assembly.assembled || !assembly.manifest) {
    return { valid: false, classification: 'evidence_invalid', ledger, store, assembly, errors: assembly.errors }
  }
  if (storedManifest && !sameProducerManifestSections(storedManifest, assembly.manifest)) {
    return {
      valid: false,
      classification: 'evidence_invalid',
      ledger,
      store,
      assembly,
      errors: [{ code: 'STORED_MANIFEST_MISMATCH' }],
    }
  }
  const manifestValidation = validatePsdealsCycleManifest(
    storedManifest || assembly.manifest,
    { now }
  )
  return {
    valid: assembly.assembled && manifestValidation.listing_complete && manifestValidation.detail_complete,
    classification: manifestValidation.classification,
    ledger,
    store,
    assembly,
    manifest_validation: manifestValidation,
    errors: manifestValidation.errors,
  }
}

function requiresCriticalReverification(stage) {
  return ['mark_succeeded', 'certify', 'refresh_cache'].includes(stage)
}

function sameProducerManifestSections(stored, assembled) {
  const storedComparable = {
    identity: stored?.identity,
    listing: stored?.listing,
    fast_refresh: stored?.fast_refresh,
    detail_import: stored?.detail_import,
    monthly_games: stored?.monthly_games,
    ended_deals: stored?.ended_deals,
    cycle_items_seen: stored?.cycle_state?.items_seen,
    cycle_items_failed: stored?.cycle_state?.items_failed,
    cycle_failure_reason: stored?.cycle_state?.failure_reason,
  }
  const assembledComparable = {
    identity: assembled?.identity,
    listing: assembled?.listing,
    fast_refresh: assembled?.fast_refresh,
    detail_import: assembled?.detail_import,
    monthly_games: assembled?.monthly_games,
    ended_deals: assembled?.ended_deals,
    cycle_items_seen: assembled?.cycle_state?.items_seen,
    cycle_items_failed: assembled?.cycle_state?.items_failed,
    cycle_failure_reason: assembled?.cycle_state?.failure_reason,
  }
  return stablePsdealsEvidenceJson(storedComparable) === stablePsdealsEvidenceJson(assembledComparable)
}

export async function runPsdealsCycle({
  workspace,
  owner_token,
  mode = workspace?.identity?.mode || 'plan',
  adapters = {},
  now = () => new Date(),
  stop_after_stage = null,
} = {}) {
  if (!PSDEALS_CYCLE_RUNNER_MODES.includes(mode)) throw new Error('RUNNER_MODE_INVALID')
  let ledger = await readPsdealsCycleLedger({ workspace })
  if (!ledger.valid) {
    return statusResult({
      workspace,
      ledger,
      mode,
      blockers: ['workspace_ledger_corrupt'],
      exitCode: PSDEALS_CYCLE_RUNNER_EXIT_CODES.workspace_corrupt,
    })
  }

  if (mode === 'plan') return planPsdealsCycleRun({ workspace, ledger })
  if (mode === 'offline_validation') {
    const verified = await verifyPsdealsCycleWorkspaceEvidence({ workspace, now: iso(now) })
    const exitCode = verified.classification === 'indeterminate'
      ? PSDEALS_CYCLE_RUNNER_EXIT_CODES.state_indeterminate
      : verified.valid
        ? PSDEALS_CYCLE_RUNNER_EXIT_CODES.success
        : PSDEALS_CYCLE_RUNNER_EXIT_CODES.evidence_invalid
    return { ...statusResult({ workspace, ledger, mode, blockers: verified.errors?.map((value) => value.code) || [], exitCode }), verification: verified }
  }
  if (mode === 'operational') {
    return statusResult({
      workspace,
      ledger,
      mode,
      blockers: ['operational_mode_requires_stage_specific_authorization_and_adapters'],
      exitCode: PSDEALS_CYCLE_RUNNER_EXIT_CODES.awaiting_authorization,
    })
  }
  if (!owner_token) throw new Error('RUNNER_LOCK_OWNER_REQUIRED')

  if (ledger.running) {
    await recoverInterruptedPsdealsCycleStage({
      workspace,
      owner_token,
      recovered_at: iso(now),
    })
    ledger = await readPsdealsCycleLedger({ workspace })
  }

  for (const definition of PSDEALS_DAILY_CYCLE_STEPS) {
    const currentStatus = ledger.stages[definition.name].status
    if (['succeeded', 'skipped'].includes(currentStatus)) continue
    const gates = gatesFromLedger(ledger)
    const startedAt = iso(now)
    const finishedAt = iso(now)
    const authorizationRequired = definition.requires_future_authorization === true
    await beginPsdealsCycleStage({
      workspace,
      owner_token,
      stage: definition.name,
      started_at: startedAt,
      authorization_required: authorizationRequired,
      external_action_requested: authorizationRequired ? definition.name : null,
    })

    if (definition.critical_gate && gates[definition.critical_gate] !== true) {
      await finishPsdealsCycleStage({
        workspace,
        owner_token,
        stage: definition.name,
        status: 'blocked',
        finished_at: finishedAt,
        reason_codes: [`gate_${definition.critical_gate}_closed`],
        authorization_required: authorizationRequired,
        external_action_requested: authorizationRequired ? definition.name : null,
      })
      ledger = await readPsdealsCycleLedger({ workspace })
      return statusResult({
        workspace,
        ledger,
        mode,
        blockers: [`gate_${definition.critical_gate}_closed`],
        exitCode: PSDEALS_CYCLE_RUNNER_EXIT_CODES.stage_blocked,
      })
    }

    if (requiresCriticalReverification(definition.name)) {
      const verified = await verifyPsdealsCycleWorkspaceEvidence({ workspace, now: finishedAt })
      if (!verified.valid || !verified.manifest_validation?.can_mark_succeeded) {
        await finishPsdealsCycleStage({
          workspace,
          owner_token,
          stage: definition.name,
          status: 'blocked',
          finished_at: finishedAt,
          reason_codes: ['critical_evidence_reverification_failed'],
          authorization_required: true,
          external_action_requested: definition.name,
        })
        ledger = await readPsdealsCycleLedger({ workspace })
        return statusResult({
          workspace,
          ledger,
          mode,
          blockers: ['critical_evidence_reverification_failed'],
          exitCode: PSDEALS_CYCLE_RUNNER_EXIT_CODES.evidence_invalid,
        })
      }
    }

    const adapter = adapters[definition.name]
    if (typeof adapter !== 'function') {
      await finishPsdealsCycleStage({
        workspace,
        owner_token,
        stage: definition.name,
        status: authorizationRequired ? 'awaiting_authorization' : 'blocked',
        finished_at: finishedAt,
        reason_codes: ['adapter_missing'],
        authorization_required: authorizationRequired,
        external_action_requested: authorizationRequired ? definition.name : null,
      })
      ledger = await readPsdealsCycleLedger({ workspace })
      return statusResult({
        workspace,
        ledger,
        mode,
        blockers: ['adapter_missing'],
        exitCode: authorizationRequired
          ? PSDEALS_CYCLE_RUNNER_EXIT_CODES.awaiting_authorization
          : PSDEALS_CYCLE_RUNNER_EXIT_CODES.stage_blocked,
      })
    }

    try {
      const result = await adapter({
        workspace,
        ledger,
        gates,
        started_at: startedAt,
        finished_at: finishedAt,
        mode,
      })
      await finishPsdealsCycleStage({
        workspace,
        owner_token,
        stage: definition.name,
        status: result.status,
        finished_at: result.finished_at || finishedAt,
        input_hashes: result.input_hashes,
        output_hashes: result.output_hashes,
        evidence_path: result.evidence_path,
        exit_code: result.exit_code,
        reason_codes: result.reason_codes,
        errors: result.errors,
        warnings: result.warnings,
        authorization_required: authorizationRequired,
        external_action_requested: result.external_action_requested || (authorizationRequired ? definition.name : null),
        external_action_performed: false,
        simulation_performed: result.simulation_performed === true,
        action_receipt_path: result.action_receipt_path,
      })
    } catch (error) {
      await finishPsdealsCycleStage({
        workspace,
        owner_token,
        stage: definition.name,
        status: 'failed',
        finished_at: finishedAt,
        reason_codes: ['adapter_failed'],
        errors: [error],
        authorization_required: authorizationRequired,
        external_action_requested: authorizationRequired ? definition.name : null,
      })
    }

    ledger = await readPsdealsCycleLedger({ workspace })
    const terminal = ledger.stages[definition.name].status
    if (!['succeeded', 'skipped'].includes(terminal)) {
      return statusResult({
        workspace,
        ledger,
        mode,
        blockers: ledger.stages[definition.name].latest?.reason_codes || [terminal],
        exitCode: terminal === 'awaiting_authorization'
          ? PSDEALS_CYCLE_RUNNER_EXIT_CODES.awaiting_authorization
          : terminal === 'blocked'
            ? PSDEALS_CYCLE_RUNNER_EXIT_CODES.stage_blocked
            : PSDEALS_CYCLE_RUNNER_EXIT_CODES.stage_failed,
      })
    }
    if (stop_after_stage === definition.name) {
      return {
        ...statusResult({ workspace, ledger, mode, blockers: ['fixture_stop_requested'], exitCode: PSDEALS_CYCLE_RUNNER_EXIT_CODES.state_indeterminate }),
        stopped_after_stage: definition.name,
      }
    }
  }

  try {
    await finalizePsdealsCycleWorkspace({
      workspace,
      status: 'fixture_complete',
      finished_at: iso(now),
      manifest_reference: 'manifest/cycle-manifest.json',
      reason_codes: [],
    })
  } catch (error) {
    if (!String(error?.message || error).includes('EVIDENCE_OUTPUT_EXISTS')) throw error
  }
  ledger = await readPsdealsCycleLedger({ workspace })
  return statusResult({ workspace, ledger, mode, exitCode: PSDEALS_CYCLE_RUNNER_EXIT_CODES.success })
}

export function redactPsdealsRunToken(value) {
  if (typeof value !== 'string' || value.length < 10) return '[redacted]'
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}
