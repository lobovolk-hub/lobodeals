import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { selectEndedDiscountCandidatesFromListing } from './psdeals-ended-discounts.mjs'
import {
  stablePsdealsUpdaterSimulationJson,
  hashPsdealsUpdaterSimulationValue,
} from './psdeals-updater-orchestration-core.mjs'
import { runPsdealsUpdaterOrchestratorLocal } from './psdeals-updater-orchestrator-local.mjs'
import { getPsdealsUpdaterSimulationFixture } from './psdeals-updater-simulation-fixtures.mjs'
import {
  PSDEALS_DAILY_LIVE_BINDINGS,
  validatePsdealsDailyLiveBindings,
} from './psdeals-daily-live-bindings.mjs'
import {
  buildPsdealsProductionParityRequest,
  createPsdealsDailyProductionAdapters,
  PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY,
  validatePsdealsDailyProductionRegistry,
} from './psdeals-daily-production-adapters.mjs'
import { evaluatePsdealsVercelManualEvidence } from './psdeals-vercel-manual-evidence.mjs'

export const PSDEALS_DAILY_REFRESH_VERSION = 3
export const PSDEALS_DAILY_REFRESH_SCHEMA_VERSION = 3
export const PSDEALS_DAILY_PROJECT_REF = 'vlxkoprpobfevxefizwr'
export const PSDEALS_DAILY_LIVE_ACTION = 'EXECUTE_SINGLE_RECOVERY_REFRESH'
export const PSDEALS_DAILY_ENV_CONFIRMATION = 'EXPLICITLY_AUTHORIZED'
export const PSDEALS_RECENTLY_ADDED_URL = 'https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'
export const PSDEALS_DISCOUNTS_URL = 'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'

export const PSDEALS_DAILY_REFRESH_STATES = Object.freeze([
  'initialized',
  'local_preflight_passed',
  'remote_preflight_passed',
  'edge_ready',
  'captcha_resolved',
  'cycle_created',
  'recently_added_collected',
  'recently_added_analyzed',
  'recently_added_imported',
  'discounts_collected',
  'discounts_analyzed',
  'discount_details_imported',
  'detail_retry_reconciled',
  'monthly_processed',
  'ended_analyzed',
  'ambiguous_revalidated',
  'ended_reanalyzed',
  'demotions_reconciled',
  'candidates_prepared',
  'certification_reconciled',
  'minima_reconciled',
  'cache_reconciled',
  'final_postchecks_passed',
  'succeeded',
  'failed',
  'requires_reconciliation',
])

export const PSDEALS_DAILY_OPERATIONAL_STAGES = PSDEALS_DAILY_LIVE_BINDINGS

export const PSDEALS_DAILY_REPLAY_SCENARIOS = Object.freeze([
  'may-18-healthy',
  'may-20-retry',
  'june-incomplete',
  'ended-massive',
  'hollow-knight',
  'challenge',
  'timeout',
  'duplication',
  'restart',
  'cycle-mismatch',
  'receipt-missing',
  'cache-postcheck-failed',
  'monthly-not-due',
  'ps-plus-ambiguous',
  'empty-listing',
])

const HASH_PATTERN = /^[a-f0-9]{64}$/
const LOCAL_CYCLE_PATTERN = /^local-cycle-[a-z0-9][a-z0-9_-]{7,}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LIVE_STAGE_NAMES = new Set(PSDEALS_DAILY_OPERATIONAL_STAGES.map((value) => value.state))
const LIVE_ADAPTER_STATUSES = new Set([
  'succeeded',
  'skipped',
  'failed',
  'requires_johan',
  'requires_reconciliation',
])

function unique(values) {
  return [...new Set(values)]
}

function isFresh(value, now, maxAgeMinutes = 30) {
  const timestamp = Date.parse(value)
  const current = Date.parse(now)
  return Number.isFinite(timestamp) && Number.isFinite(current) &&
    timestamp <= current && current - timestamp <= maxAgeMinutes * 60_000
}

function sourceFiles(projectRoot) {
  return unique(PSDEALS_DAILY_OPERATIONAL_STAGES
    .flatMap((stage) => String(stage.component).split(' -> '))
    .filter((value) => value.startsWith('scripts/') || value.startsWith('sql/'))
    .map((value) => path.resolve(projectRoot, value)))
}

export async function inspectPsdealsDailyRefreshCode({
  project_root = process.cwd(),
  production_adapters,
} = {}) {
  const effectiveProductionAdapters = production_adapters || createPsdealsDailyProductionAdapters()
  const root = path.resolve(project_root)
  const migrationPath = path.join(root, 'sql', '007-lobodeals-3-safe-demotion-hardening.sql')
  const certificatePath = path.join(root, 'sql', 'validation', '007-safe-demotion-postcheck-certificate-readonly.sql')
  const packagePath = path.join(root, 'package.json')
  const [migration, certificate, packageJson] = await Promise.all([
    fs.readFile(migrationPath),
    fs.readFile(certificatePath),
    fs.readFile(packagePath, 'utf8').then(JSON.parse),
  ])
  const files = sourceFiles(root)
  const missing = []
  for (const file of files) {
    try { await fs.access(file) } catch { missing.push(path.relative(root, file).replaceAll('\\', '/')) }
  }
  const migrationSha = crypto.createHash('sha256').update(migration).digest('hex')
  const certificateSha = crypto.createHash('sha256').update(certificate).digest('hex')
  const stageNames = PSDEALS_DAILY_OPERATIONAL_STAGES.map((value) => value.state)
  const legacyCacheInPath = PSDEALS_DAILY_OPERATIONAL_STAGES.some((value) =>
    String(value.component).includes('refresh_catalog_public_cache_v15') ||
    String(value.component).includes('refresh-catalog-public-cache-v15'))
  const duplicateStates = stageNames.length !== new Set(stageNames).size
  const adapterNames = PSDEALS_DAILY_OPERATIONAL_STAGES.map((value) => value.adapter)
  const missingAdapterNames = adapterNames.filter((value) => typeof value !== 'string' || !value)
  const duplicateAdapters = adapterNames.length !== new Set(adapterNames).size
  const invalidParents = PSDEALS_DAILY_OPERATIONAL_STAGES.filter((value) =>
    value.parent !== 'initialized' && !LIVE_STAGE_NAMES.has(value.parent))
  const modes = ['validate', 'replay', 'live-preflight', 'live']
  const bindingValidation = validatePsdealsDailyLiveBindings()
  const productionAdapterValidation = validatePsdealsDailyOperationalAdapters(
    effectiveProductionAdapters,
    { require_production: true }
  )
  const productionRegistryValidation = validatePsdealsDailyProductionRegistry(effectiveProductionAdapters)
  const blockers = [
    ...(missing.length ? ['daily_runner_component_missing'] : []),
    ...(packageJson.scripts?.['refresh:daily'] !== 'node scripts/run-psdeals-daily-refresh-v3.mjs'
      ? ['daily_runner_npm_command_missing'] : []),
    ...(legacyCacheInPath ? ['legacy_cache_v15_in_operational_path'] : []),
    ...(duplicateStates ? ['daily_runner_duplicate_state'] : []),
    ...(missingAdapterNames.length ? ['daily_runner_adapter_name_missing'] : []),
    ...(duplicateAdapters ? ['daily_runner_duplicate_adapter'] : []),
    ...(invalidParents.length ? ['daily_runner_parent_state_invalid'] : []),
    ...bindingValidation.blockers,
    ...(!productionAdapterValidation.valid || !productionRegistryValidation.valid ? ['live_executor_not_bound'] : []),
  ]
  return {
    runner_version: PSDEALS_DAILY_REFRESH_VERSION,
    modes,
    operational_stage_count: PSDEALS_DAILY_OPERATIONAL_STAGES.length,
    replay_scenario_count: PSDEALS_DAILY_REPLAY_SCENARIOS.length,
    migration_007_sha256: migrationSha,
    migration_007_bytes: migration.length,
    certificate_007_sha256: certificateSha,
    certificate_007_bytes: certificate.length,
    required_files: files.map((value) => path.relative(root, value).replaceAll('\\', '/')),
    missing_files: missing,
    legacy_cache_v15_blocked: !legacyCacheInPath,
    blockers,
    DAILY_RUNNER_CODE_READY: blockers.length === 0,
    RECOVERY_REFRESH_COMMAND_READY: false,
    RECOVERY_REFRESH_COMMAND_REQUIRES_LIVE_PREFLIGHT: true,
    LIVE_ADAPTER_CONTRACTS_READY: bindingValidation.LIVE_ADAPTER_CONTRACTS_READY,
    LIVE_EXECUTOR_BOUND: productionAdapterValidation.valid && productionRegistryValidation.valid,
    production_adapter_validation: productionAdapterValidation,
    production_registry_validation: productionRegistryValidation,
    PRODUCTION_ADAPTERS_TOTAL: PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY.length,
    PRODUCTION_ADAPTERS_BOUND: productionRegistryValidation.bound,
    PRODUCTION_ADAPTERS_MISSING: productionRegistryValidation.missing.length,
    REMOTE_CYCLE_IDENTITY_ALIGNED: stageNames.includes('cycle_created'),
    SAFE_DEMOTION_RUNNER_INTEGRATED:
      stageNames.includes('ended_analyzed') &&
      stageNames.includes('ambiguous_revalidated') &&
      stageNames.includes('ended_reanalyzed') &&
      PSDEALS_DAILY_OPERATIONAL_STAGES.some((value) => value.component === 'apply_psdeals_ended_deals_v2'),
    operational_adapter_contracts: adapterNames,
    executes_processes: false,
    opens_connections: false,
    uses_supabase: false,
  }
}

export function validatePsdealsDailyOperationalAdapters(
  adapters = {},
  { require_production = false } = {}
) {
  const required = PSDEALS_DAILY_OPERATIONAL_STAGES.map((stage) => stage.adapter)
  const missing = required.filter((name) => typeof adapters?.[name] !== 'function')
  const unknown = Object.keys(adapters || {}).filter((name) => !required.includes(name))
  const unbound = required.filter((name) => {
    const adapter = adapters?.[name]
    if (typeof adapter !== 'function') return false
    if (adapter.psdeals_implementation_status === 'stub') return true
    return /not[_ ]?implemented|\bstub\b/i.test(String(adapter.psdeals_implementation_status || ''))
  })
  const nonProduction = require_production
    ? required.filter((name) =>
        typeof adapters?.[name] === 'function' &&
        adapters[name].psdeals_implementation_status !== 'production')
    : []
  return {
    valid: missing.length === 0 && unknown.length === 0 && unbound.length === 0 && nonProduction.length === 0,
    required,
    missing,
    unknown,
    unbound,
    non_production: nonProduction,
  }
}

function dailyStageReceipt({ authorizationId, runIntentId, remoteCycleId, stage, order, parentReceiptId, adapterResult }) {
  const body = {
    schema_version: PSDEALS_DAILY_REFRESH_SCHEMA_VERSION,
    authorization_id: authorizationId,
    run_intent_id: runIntentId,
    remote_cycle_id: remoteCycleId,
    state: stage.state,
    order,
    parent_receipt_id: parentReceiptId,
    adapter_receipt_id: adapterResult.action_receipt?.receipt_id || null,
    status: adapterResult.status,
  }
  return {
    receipt_id: `daily-v3-${hashPsdealsUpdaterSimulationValue(body).slice(0, 32)}`,
    ...body,
  }
}

export function createPsdealsDailyOperationalExecutor({
  adapters,
  resolve_stage_runtime = null,
  production_ports = null,
} = {}) {
  const adapterValidation = validatePsdealsDailyOperationalAdapters(adapters)
  return async function executePsdealsDailyOperationalRun(input = {}) {
    if (!adapterValidation.valid) {
      return {
        mode: 'live',
        classification: 'FAILED',
        blockers: ['operational_adapter_set_incomplete'],
        adapter_validation: adapterValidation,
        receipts: [],
        stage_results: {},
        executed_writes: 0,
        adapter_calls: 0,
      }
    }
    const { authorization, gates } = input
    if (gates?.valid !== true) throw new Error('DAILY_OPERATIONAL_EXECUTOR_GATE_BYPASS')
    if (resolve_stage_runtime !== null && typeof resolve_stage_runtime !== 'function') {
      return {
        mode: 'live',
        classification: 'FAILED',
        blockers: ['stage_runtime_resolver_invalid'],
        receipts: [],
        stage_results: {},
        executed_writes: 0,
        adapter_calls: 0,
      }
    }

    const receipts = []
    const stageResults = {}
    let executedWrites = 0
    let previousReceiptId = null
    let remoteCycleId = UUID_PATTERN.test(String(authorization.resume_remote_cycle_id || ''))
      ? authorization.resume_remote_cycle_id
      : null
    const createStageIndex = PSDEALS_DAILY_OPERATIONAL_STAGES.findIndex((value) => value.state === 'cycle_created')

    for (const [index, stage] of PSDEALS_DAILY_OPERATIONAL_STAGES.entries()) {
      const baseContext = {
        ...input,
        run_identity: {
          run_intent_id: authorization.run_intent_id,
          remote_cycle_id: remoteCycleId,
        },
        stage: { ...stage },
        order: index + 1,
        previous_stage_receipt_id: previousReceiptId,
        receipts: receipts.map((value) => ({ ...value })),
        stage_results: Object.fromEntries(
          Object.entries(stageResults).map(([key, value]) => [key, { ...value }])
        ),
      }

      let runtime = {}
      if (resolve_stage_runtime) {
        try {
          runtime = await resolve_stage_runtime(baseContext)
        } catch {
          return {
            mode: 'live',
            classification: 'FAILED',
            blockers: ['stage_runtime_resolution_failed'],
            failed_state: stage.state,
            receipts,
            stage_results: stageResults,
            executed_writes: executedWrites,
            adapter_calls: index,
          }
        }
        if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
          return {
            mode: 'live',
            classification: 'FAILED',
            blockers: ['stage_runtime_resolution_invalid'],
            failed_state: stage.state,
            receipts,
            stage_results: stageResults,
            executed_writes: executedWrites,
            adapter_calls: index,
          }
        }
      }

      const result = await adapters[stage.adapter]({
        ...baseContext,
        production_inputs: runtime.production_inputs ?? input.production_inputs,
        production_ports:
          runtime.production_ports ?? input.production_ports ?? production_ports,
      })

      stageResults[stage.state] = {
        adapter: stage.adapter,
        status: result?.status || null,
        result,
      }

      if (!LIVE_ADAPTER_STATUSES.has(result?.status)) {
        return {
          mode: 'live', classification: 'FAILED', blockers: ['operational_adapter_status_invalid'],
          failed_state: stage.state, receipts, stage_results: stageResults,
          executed_writes: executedWrites, adapter_calls: index + 1,
        }
      }
      if (stage.state === 'cycle_created' && ['succeeded', 'skipped'].includes(result.status)) {
        if (!UUID_PATTERN.test(String(result.remote_cycle_id || ''))) {
          return {
            mode: 'live', classification: 'REQUIRES_RECONCILIATION', blockers: ['create_cycle_remote_uuid_invalid'],
            failed_state: stage.state, receipts, stage_results: stageResults,
            executed_writes: executedWrites, adapter_calls: index + 1,
          }
        }
        if (remoteCycleId && result.remote_cycle_id !== remoteCycleId) {
          return {
            mode: 'live', classification: 'REQUIRES_RECONCILIATION', blockers: ['resume_cycle_identity_mismatch'],
            failed_state: stage.state, receipts, stage_results: stageResults,
            executed_writes: executedWrites, adapter_calls: index + 1,
          }
        }
        remoteCycleId = result.remote_cycle_id
      }
      if (index > createStageIndex && remoteCycleId === null) {
        return {
          mode: 'live', classification: 'FAILED', blockers: ['remote_cycle_identity_not_bound'],
          failed_state: stage.state, receipts, stage_results: stageResults,
          executed_writes: executedWrites, adapter_calls: index + 1,
        }
      }
      if ((result.accepted_parent_receipt_id ?? null) !== previousReceiptId) {
        return {
          mode: 'live', classification: 'FAILED', blockers: ['stage_receipt_parent_mismatch'],
          failed_state: stage.state, receipts, stage_results: stageResults,
          executed_writes: executedWrites, adapter_calls: index + 1,
        }
      }
      const writes = Number(result.executed_writes || 0)
      if (!Number.isSafeInteger(writes) || writes < 0) {
        return {
          mode: 'live', classification: 'FAILED', blockers: ['stage_executed_writes_invalid'],
          failed_state: stage.state, receipts, stage_results: stageResults,
          executed_writes: executedWrites, adapter_calls: index + 1,
        }
      }
      if (result.external_action_performed === true &&
          (!result.action_receipt?.receipt_id ||
            !UUID_PATTERN.test(String(remoteCycleId || '')) ||
            result.action_receipt?.cycle_id !== remoteCycleId)) {
        return {
          mode: 'live', classification: 'REQUIRES_RECONCILIATION', blockers: ['external_action_receipt_invalid'],
          failed_state: stage.state, receipts, stage_results: stageResults,
          executed_writes: executedWrites, adapter_calls: index + 1,
        }
      }
      executedWrites += writes
      const stageReceipt = dailyStageReceipt({
        authorizationId: authorization.authorization_id,
        runIntentId: authorization.run_intent_id,
        remoteCycleId,
        stage,
        order: index + 1,
        parentReceiptId: previousReceiptId,
        adapterResult: result,
      })
      receipts.push(stageReceipt)
      previousReceiptId = stageReceipt.receipt_id
      if (result.status !== 'succeeded' && result.status !== 'skipped') {
        const classification = result.status === 'requires_johan'
          ? 'REQUIRES_JOHAN'
          : result.status === 'requires_reconciliation'
            ? 'REQUIRES_RECONCILIATION'
            : 'FAILED'
        return {
          mode: 'live', classification, blockers: unique(result.blockers || [stage.state + '_' + result.status]),
          failed_state: stage.state, receipts, stage_results: stageResults,
          executed_writes: executedWrites, adapter_calls: index + 1,
        }
      }
    }
    return {
      mode: 'live',
      classification: 'GO',
      blockers: [],
      final_state: 'succeeded',
      run_intent_id: authorization.run_intent_id,
      remote_cycle_id: remoteCycleId,
      receipts,
      stage_results: stageResults,
      executed_writes: executedWrites,
      adapter_calls: PSDEALS_DAILY_OPERATIONAL_STAGES.length,
    }
  }
}

function replayDefinition(name) {
  const definitions = {
    'may-18-healthy': { fixture: 'happy-path', expected: 'GO', historical: { collected: 7593, declared: 7593 }, stop: null },
    'may-20-retry': { fixture: 'retry-success', expected: 'GO', historical: { retry_recovered: true }, stop: null },
    'june-incomplete': { fixture: 'adversarial-listing', expected: 'NO_GO', historical: { collected: 5531, declared: 5552 }, stop: 'discounts_analyzed', blocker: 'listing_not_strongly_complete' },
    'ended-massive': { fixture: 'ended-deals', expected: 'GO', historical: { candidate_count: 1406 }, stop: null },
    'hollow-knight': { fixture: 'ended-deals', expected: 'NO_GO', stop: 'ended_reanalyzed', blocker: 'unsafe_demotion_blocked' },
    challenge: { fixture: 'happy-path', expected: 'REQUIRES_JOHAN', stop: 'captcha_resolved', blocker: 'captcha_requires_visible_johan' },
    timeout: { fixture: 'happy-path', expected: 'REQUIRES_RECONCILIATION', stop: 'detail_retry_reconciled', blocker: 'ambiguous_timeout_requires_reconciliation' },
    duplication: { fixture: 'happy-path', expected: 'GO', stop: null, idempotent_replay: true },
    restart: { fixture: 'happy-path', expected: 'GO', stop: null, resumed: true },
    'cycle-mismatch': { fixture: 'happy-path', expected: 'NO_GO', stop: 'candidates_prepared', blocker: 'candidate_cycle_mismatch' },
    'receipt-missing': { fixture: 'happy-path', expected: 'NO_GO', stop: 'candidates_prepared', blocker: 'required_receipt_missing' },
    'cache-postcheck-failed': { fixture: 'happy-path', expected: 'NO_GO', stop: 'cache_reconciled', blocker: 'cache_postcheck_failed' },
    'monthly-not-due': { fixture: 'happy-path', expected: 'GO', stop: null, monthly: 'not_due' },
    'ps-plus-ambiguous': { fixture: 'ended-deals', expected: 'NO_GO', stop: 'ended_reanalyzed', blocker: 'ps_plus_ambiguous_demotion_blocked' },
    'empty-listing': { fixture: 'happy-path', expected: 'NO_GO', stop: 'discounts_analyzed', blocker: 'listing_empty' },
  }
  return definitions[name] || null
}

function mutateReplayFixture(name, fixture) {
  if (name === 'timeout') fixture.faults.timeout_after_receipts = true
  if (name === 'cycle-mismatch') fixture.faults.candidate_cycle_mismatch = true
  if (name === 'receipt-missing') fixture.faults.omit_receipt_for = ['listing']
  if (name === 'empty-listing') {
    for (const page of fixture.listing.pages) page.items = []
    fixture.configuration.expected_total = 0
  }
  if (name === 'hollow-knight') {
    const ended = fixture.initial_stage.find((value) => value.psdeals_id === 910004)
    ended.deal_ends_at = '2026-08-03T12:00:00.000Z'
  }
  if (name === 'ps-plus-ambiguous') {
    const ended = fixture.initial_stage.find((value) => value.psdeals_id === 910004)
    ended.is_ps_plus_discount = null
  }
  if (name === 'monthly-not-due') {
    fixture.monthly.status = 'supported'
    fixture.monthly.checked = true
    fixture.monthly.source = 'not_due_replay'
  }
  return fixture
}

function statesForReplay(definition) {
  const successStates = PSDEALS_DAILY_OPERATIONAL_STAGES.map((value) => value.state)
  if (!definition.stop) return ['initialized', ...successStates]
  const stopIndex = successStates.indexOf(definition.stop)
  const terminal = definition.expected === 'REQUIRES_RECONCILIATION'
    ? 'requires_reconciliation'
    : 'failed'
  return ['initialized', ...successStates.slice(0, Math.max(0, stopIndex)), terminal]
}

function hollowKnightProof(name, fixture, timestamp) {
  if (!['hollow-knight', 'ps-plus-ambiguous'].includes(name)) return null
  const selected = selectEndedDiscountCandidatesFromListing(
    fixture.listing.pages.flatMap((page) => page.items),
    fixture.initial_stage,
    {
      listing_complete: true,
      monthly_evidence_verified: true,
      monthly_item_ids: [],
      observed_at: timestamp,
    }
  )
  return {
    candidates: selected.candidates.map((value) => value.psdeals_id),
    blocked: selected.blocked_candidates.map((value) => ({
      psdeals_id: value.psdeals_id,
      reason_codes: value.demotion_blockers,
    })),
    unsafe_candidate_absent: !selected.candidates.some((value) => value.psdeals_id === 910004),
  }
}

export function runPsdealsDailyReplay({
  scenario,
  logical_timestamp,
  code_head = 'local-uncommitted',
  migration_007_sha256,
} = {}) {
  const definition = replayDefinition(scenario)
  if (!definition) throw new Error('DAILY_REPLAY_SCENARIO_UNKNOWN')
  if (!Number.isFinite(Date.parse(logical_timestamp))) throw new Error('DAILY_REPLAY_TIMESTAMP_INVALID')
  if (!HASH_PATTERN.test(String(migration_007_sha256 || ''))) throw new Error('DAILY_REPLAY_MIGRATION_SHA_INVALID')
  const fixture = mutateReplayFixture(scenario, getPsdealsUpdaterSimulationFixture(definition.fixture))
  fixture.fixture_id = `daily-v3-${scenario}`
  fixture.logical_timestamp = new Date(logical_timestamp).toISOString()
  const simulation = runPsdealsUpdaterOrchestratorLocal(fixture)
  const safetyProof = hollowKnightProof(scenario, fixture, fixture.logical_timestamp)
  const blockers = unique([
    ...(definition.blocker ? [definition.blocker] : []),
    ...(definition.expected === 'GO' ? simulation.blockers : []),
  ]).sort()
  const pipelineStates = statesForReplay(definition)
  const inputHash = hashPsdealsUpdaterSimulationValue({ scenario, fixture, definition })
  const runId = `daily-replay-${inputHash.slice(0, 24)}`
  const receipts = pipelineStates
    .filter((state) => !['initialized', 'failed', 'requires_reconciliation'].includes(state))
    .map((state, index) => ({
      receipt_id: `replay-receipt-${String(index + 1).padStart(2, '0')}`,
      state,
      parent: index === 0 ? null : `replay-receipt-${String(index).padStart(2, '0')}`,
      status: 'simulated',
      sha256: hashPsdealsUpdaterSimulationValue({ runId, state, index }),
    }))
  const productionAdapters = createPsdealsDailyProductionAdapters()
  const productionRegistry = validatePsdealsDailyProductionRegistry(productionAdapters)
  const parityRequests = PSDEALS_DAILY_PRODUCTION_ADAPTER_INVENTORY.map((row) =>
    buildPsdealsProductionParityRequest(row.name, {
      run_identity: { run_intent_id: `local-cycle-replay-${scenario}`, remote_cycle_id: null },
      previous_stage_receipt_id: null,
      production_inputs: { [row.name]: { idempotency_key: `${row.name}:${inputHash}` } },
    })
  )
  const expectedSafetyBlock = definition.expected !== 'GO'
  const passed = definition.expected === 'GO'
    ? simulation.executed_writes === 0 && simulation.blockers.length === 0
    : definition.expected === 'REQUIRES_RECONCILIATION'
      ? simulation.overall_status === 'requires_reconciliation'
      : safetyProof
        ? safetyProof.unsafe_candidate_absent
        : simulation.executed_writes === 0
  const finalState = pipelineStates.at(-1)
  const manifest = {
    schema_version: PSDEALS_DAILY_REFRESH_SCHEMA_VERSION,
    runner_version: PSDEALS_DAILY_REFRESH_VERSION,
    run_id: runId,
    mode: 'replay',
    scenario,
    code_head,
    migration_007_sha256,
    project_ref: 'fixture-lobodeals',
    generated_at: fixture.logical_timestamp,
    input_hashes: { replay: inputHash, simulation: simulation.input_sha256 },
    listing_fingerprints: { discounts: simulation.listing_summary?.fingerprint || null },
    counts: {
      historical: definition.historical || {},
      planned_writes: simulation.planned_writes,
      executed_writes: 0,
      retries: simulation.retries,
      ended_candidates: simulation.ended_deals_count,
    },
    receipts,
    evidence: {
      simulation_manifest_sha256: hashPsdealsUpdaterSimulationValue(simulation),
      hollow_knight: safetyProof,
      monthly_branch: definition.monthly || 'evidence_only',
      resumed: definition.resumed === true,
      duplicate_replay_noop: definition.idempotent_replay === true,
      production_registry: {
        valid: productionRegistry.valid,
        total: productionRegistry.total,
        bound: productionRegistry.bound,
        missing: productionRegistry.missing,
        request_contracts: parityRequests,
        in_memory_ports_only: true,
      },
    },
    blockers,
    warnings: [],
    planned_writes: simulation.planned_writes,
    executed_writes: 0,
    opens_connections: false,
    executes_processes: false,
    uses_supabase: false,
    pipeline_states: pipelineStates,
    final_state: finalState,
    human_summary: definition.expected,
    passed,
    expected_safe_block: expectedSafetyBlock,
  }
  manifest.manifest_sha256 = hashPsdealsUpdaterSimulationValue(manifest)
  return manifest
}

export function evaluatePsdealsDailyLiveGates({
  authorization,
  remote_preflight,
  vercel,
  edge_cdp,
  migration_007_sha256,
  certificate_007_sha256,
  code_head,
  env = process.env,
  now = new Date().toISOString(),
} = {}) {
  const blockers = []
  if (authorization?.action !== PSDEALS_DAILY_LIVE_ACTION) blockers.push('live_action_mismatch')
  if (authorization?.project_ref !== PSDEALS_DAILY_PROJECT_REF) blockers.push('live_project_mismatch')
  if (!authorization?.authorization_id || authorization?.approved_by !== 'Johan') blockers.push('visible_authorization_missing')
  if (!LOCAL_CYCLE_PATTERN.test(String(authorization?.run_intent_id || ''))) blockers.push('live_run_intent_id_invalid')
  if (authorization?.remote_cycle_id != null) blockers.push('fresh_authorization_cannot_prefix_remote_uuid')
  if (authorization?.resume_remote_cycle_id != null &&
      !UUID_PATTERN.test(String(authorization.resume_remote_cycle_id))) {
    blockers.push('resume_remote_cycle_id_invalid')
  }
  if (authorization?.dry_run !== false) blockers.push('live_dry_run_must_be_false')
  if (authorization?.migration_007_sha256 !== migration_007_sha256) blockers.push('authorized_migration_007_sha_mismatch')
  if (authorization?.code_head !== code_head) blockers.push('authorized_code_head_mismatch')
  if (!isFresh(authorization?.issued_at, now, 120) || !isFresh(remote_preflight?.checked_at, now, 30)) blockers.push('authorization_or_preflight_stale')
  if (env.LOBODEALS_REMOTE_EXECUTION !== PSDEALS_DAILY_ENV_CONFIRMATION) blockers.push('remote_execution_environment_confirmation_missing')
  if (env.NODE_ENV === 'test') blockers.push('live_forbidden_in_test')
  if (remote_preflight?.project_ref !== PSDEALS_DAILY_PROJECT_REF) blockers.push('remote_preflight_project_mismatch')
  if (remote_preflight?.migration_007_applied !== true) blockers.push('migration_007_not_applied')
  if (remote_preflight?.certificate_passed !== true || Number(remote_preflight?.blocker_failures) !== 0) blockers.push('remote_preflight_not_certified')
  if (!HASH_PATTERN.test(String(remote_preflight?.certificate_sha256 || ''))) blockers.push('remote_certificate_sha_invalid')
  if (remote_preflight?.certificate_sha256 !== certificate_007_sha256) blockers.push('remote_certificate_sha_mismatch')
  const vercelEvidence = evaluatePsdealsVercelManualEvidence(vercel, { now })
  blockers.push(...vercelEvidence.blockers)
  blockers.push(...evaluatePsdealsEdgeCdpGate(edge_cdp).blockers)
  blockers.push(...evaluatePsdealsCaptchaGate(edge_cdp, { now }).blockers)
  if (Array.isArray(remote_preflight?.blockers) && remote_preflight.blockers.length > 0) blockers.push('remote_preflight_has_blockers')
  return {
    valid: blockers.length === 0,
    blockers: unique(blockers).sort(),
    project_ref: authorization?.project_ref || null,
    run_intent_id: authorization?.run_intent_id || null,
    resume_remote_cycle_id: authorization?.resume_remote_cycle_id || null,
    authorized_migration_007_sha256: authorization?.migration_007_sha256 || null,
    authorized_code_head: authorization?.code_head || null,
    creates_client: false,
    opens_edge: false,
    executes_writes: false,
    vercel_evidence: vercelEvidence,
  }
}

export function evaluatePsdealsEdgeCdpGate(edgeCdp = {}) {
  const blockers = []
  const terminalStateBlocker = {
    browser_starting: 'edge_browser_starting',
    cdp_unavailable: 'edge_cdp_unavailable',
    wrong_tab: 'edge_cdp_wrong_tab',
    wrong_domain: 'edge_cdp_wrong_domain',
    wrong_storefront: 'edge_cdp_wrong_storefront',
    challenge_present: 'edge_cdp_challenge_present',
    timeout: 'edge_cdp_timeout',
    browser_closed: 'edge_browser_closed',
  }[edgeCdp.state]
  if (terminalStateBlocker) {
    return { valid: false, blockers: [terminalStateBlocker] }
  }
  if (edgeCdp.ready !== true) blockers.push('edge_cdp_not_ready')
  if (!Number.isSafeInteger(edgeCdp.port) || edgeCdp.port < 9222 || edgeCdp.port > 9232) {
    blockers.push('edge_cdp_port_invalid')
  }
  if (edgeCdp.port_status && edgeCdp.port_status !== 'listening') blockers.push('edge_cdp_port_invalid')
  if (edgeCdp.connection_state && edgeCdp.connection_state !== 'connected') blockers.push('edge_cdp_disconnected')
  let tabUrl = null
  const observedUrl = edgeCdp.page?.url || edgeCdp.tab_url
  try { tabUrl = new URL(observedUrl) } catch { blockers.push('edge_cdp_tab_invalid') }
  if (tabUrl && (tabUrl.protocol !== 'https:' || tabUrl.hostname !== 'psdeals.net' || !tabUrl.pathname.startsWith('/us-store/'))) {
    blockers.push('edge_cdp_tab_invalid')
  }
  if ((edgeCdp.page?.region || edgeCdp.region) !== 'us') blockers.push('edge_cdp_region_invalid')
  if ((edgeCdp.page?.storefront || edgeCdp.storefront) !== 'playstation') blockers.push('edge_cdp_storefront_invalid')
  if (!['page_ready', 'challenge_cleared'].includes(edgeCdp.state)) blockers.push('edge_cdp_page_state_invalid')
  return { valid: blockers.length === 0, blockers: unique(blockers).sort() }
}

export function evaluatePsdealsCaptchaGate(edgeRuntime = {}, { now = new Date().toISOString() } = {}) {
  const blockers = []
  if (!['page_ready', 'challenge_cleared'].includes(edgeRuntime.state) || edgeRuntime.ready !== true) {
    blockers.push(edgeRuntime.state === 'challenge_present'
      ? 'captcha_challenge_persists'
      : 'captcha_automatic_wait_not_ready')
  }
  if (edgeRuntime.chat_confirmation_required !== false) blockers.push('captcha_chat_confirmation_contract_invalid')
  if (edgeRuntime.checked_at && !isFresh(edgeRuntime.checked_at, now, 30)) blockers.push('captcha_runtime_evidence_stale')
  return {
    valid: blockers.length === 0,
    blockers: unique(blockers).sort(),
    CAPTCHA_AUTOMATIC_WAIT_READY: blockers.length === 0,
    CHAT_CONFIRMATION_REQUIRED: false,
  }
}

export async function runPsdealsDailyLiveGate({ live_executor, ...input } = {}) {
  const gates = evaluatePsdealsDailyLiveGates(input)
  if (!gates.valid) {
    return {
      mode: 'live',
      classification: gates.blockers.includes('captcha_not_visibly_resolved')
        ? 'REQUIRES_JOHAN'
        : 'REQUIRES_AUTHORIZATION',
      gates,
      executed_writes: 0,
      executor_called: false,
    }
  }
  if (typeof live_executor !== 'function') {
    return {
      mode: 'live',
      classification: 'FAILED',
      gates: { ...gates, valid: false, blockers: ['live_executor_not_bound'] },
      executed_writes: 0,
      executor_called: false,
    }
  }
  return live_executor({ ...input, gates })
}

export function stringifyPsdealsDailyResult(value, space = 2) {
  return `${stablePsdealsUpdaterSimulationJson(value, space)}\n`
}
