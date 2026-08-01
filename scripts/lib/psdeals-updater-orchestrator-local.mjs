import { buildPsdealsRegularCertificationEvidence, buildPsdealsPsPlusCertificationEvidence } from './psdeals-certification-evidence.mjs'
import { applyPsdealsCertifiedPriceLow } from './psdeals-compact-minima.mjs'
import { normalizePsdealsCommercialState } from './psdeals-commercial-state.mjs'
import { buildPsdealsDailyCyclePlan, PSDEALS_DAILY_CYCLE_STEPS } from './psdeals-cycle-plan.mjs'
import { classifyFastRefreshItem, selectFastRefreshQueues } from './psdeals-fast-refresh.mjs'
import { classifyPsdealsItemType, normalizePsdealsPlatforms } from './psdeals-item-classification.mjs'
import { buildPsdealsDetailUpsertPayload, buildPsdealsListingInsertPayload, buildPsdealsListingUpdatePayload } from './psdeals-stage-payload.mjs'
import {
  buildPsdealsUpdaterSimulationIdentity,
  createPsdealsUpdaterSimulationLedger,
  createPsdealsUpdaterSimulationStateMachine,
  hashPsdealsUpdaterSimulationValue,
  PSDEALS_UPDATER_SIMULATION_SCHEMA_VERSION,
  validatePsdealsUpdaterSimulationInput,
  validatePsdealsUpdaterSimulationManifest,
} from './psdeals-updater-orchestration-core.mjs'
import { selectEndedDiscountCandidatesFromListing } from '../analyze-psdeals-ended-discounts-from-listing-v1.mjs'

export const PSDEALS_UPDATER_ORCHESTRATOR_VERSION = 1

export const PSDEALS_UPDATER_ORCHESTRATOR_INTEGRATION_MAP = Object.freeze([
  ['listing', 'normalizeListing', 'local fixture pages', 'complete canonical listing'],
  ['classification', 'classifyPsdealsItemType/normalizePsdealsPlatforms', 'raw labels', 'safe classifications'],
  ['commercial', 'normalizePsdealsCommercialState', 'raw prices', 'normalized state'],
  ['fast_refresh', 'classifyFastRefreshItem/selectFastRefreshQueues', 'listing + stage', 'bounded queues'],
  ['stage_payload', 'buildPsdealsListingInsertPayload/buildPsdealsDetailUpsertPayload', 'safe observations', 'partial plans'],
  ['candidates', 'buildPsdealsRegularCertificationEvidence/buildPsdealsPsPlusCertificationEvidence', 'cycle-bound observations', 'sealed candidates'],
  ['minima', 'applyPsdealsCertifiedPriceLow', 'candidate + prior minimum', 'prospective decision'],
  ['ended_deals', 'selectEndedDiscountCandidatesFromListing', 'complete listing + stage', 'bounded demotion plan'],
  ['cycle', 'buildPsdealsDailyCyclePlan', 'local gates', 'future ordered plan'],
])

function unique(values) {
  return [...new Set(values)]
}

function enrichListingItem(raw, pageNumber) {
  const commercialState = normalizePsdealsCommercialState({
    currentPrice: raw?.current_price,
    originalPrice: raw?.original_price,
    discountPercent: raw?.discount_percent,
    sourceContext: 'discount_listing',
  })
  return {
    ...structuredClone(raw),
    source_page_url: `https://psdeals.net/us-store/discounts?page=${pageNumber}`,
    current_price_amount: commercialState.current_price_amount,
    original_price_amount: commercialState.original_price_amount,
    discount_percent: commercialState.discount_percent_source,
    discount_percent_normalized: commercialState.discount_percent_normalized,
    commercial_state: commercialState,
    type_classification: classifyPsdealsItemType(raw?.type_label),
    platform_classification: normalizePsdealsPlatforms(raw?.platforms),
  }
}

function normalizeListing(input) {
  const pages = input.listing.pages
  const blockers = []
  const warnings = []
  const expectedPages = input.configuration?.expected_pages
  const expectedTotal = input.configuration?.expected_total
  const pageNumbers = pages.map((page) => page?.page_number)
  if (!Number.isSafeInteger(expectedPages) || expectedPages < 1) blockers.push('listing_expected_pages_invalid')
  if (!Number.isSafeInteger(expectedTotal) || expectedTotal < 0) blockers.push('listing_expected_total_invalid')
  if (pages.length !== expectedPages) blockers.push('listing_page_count_mismatch')
  if (new Set(pageNumbers).size !== pageNumbers.length) blockers.push('listing_duplicate_page_number')
  if (pages.some((page) => page?.truncated === true)) blockers.push('listing_page_truncated')
  if (!pages.some((page) => page?.final === true)) blockers.push('listing_final_page_not_observed')
  if (pages.filter((page) => page?.final === true).length !== 1) blockers.push('listing_final_page_ambiguous')

  const byId = new Map()
  const duplicates = []
  const conflictingDuplicates = []
  for (const page of pages) {
    for (const raw of Array.isArray(page?.items) ? page.items : []) {
      if (!Number.isSafeInteger(raw?.psdeals_id) || raw.psdeals_id <= 0) {
        blockers.push('listing_identity_missing')
        continue
      }
      const item = enrichListingItem(raw, page.page_number)
      const comparable = { ...item, source_page_url: null }
      const fingerprint = hashPsdealsUpdaterSimulationValue(comparable)
      if (!byId.has(item.psdeals_id)) {
        byId.set(item.psdeals_id, { item, fingerprint })
      } else if (byId.get(item.psdeals_id).fingerprint === fingerprint) {
        duplicates.push(item.psdeals_id)
      } else {
        conflictingDuplicates.push(item.psdeals_id)
      }
    }
  }
  if (conflictingDuplicates.length > 0) blockers.push('listing_conflicting_duplicates')
  const items = [...byId.values()].map((entry) => entry.item).sort((a, b) => a.psdeals_id - b.psdeals_id)
  if (items.length === 0 && input.configuration?.allow_empty_listing !== true) blockers.push('listing_empty')
  if (items.length !== expectedTotal) blockers.push('listing_total_mismatch')
  if (duplicates.length > 0) warnings.push('listing_equivalent_duplicates_deduplicated')
  return {
    complete: blockers.length === 0,
    blockers: unique(blockers).sort(),
    warnings: unique(warnings).sort(),
    pages_requested: expectedPages,
    pages_completed: pages.length,
    final_page_observed: pages.some((page) => page?.final === true),
    total_expected: expectedTotal,
    total_collected: pages.reduce((sum, page) => sum + (Array.isArray(page?.items) ? page.items.length : 0), 0),
    unique_items: items.length,
    equivalent_duplicates: unique(duplicates).sort((a, b) => a - b),
    conflicting_duplicates: unique(conflictingDuplicates).sort((a, b) => a - b),
    fingerprint: hashPsdealsUpdaterSimulationValue(items),
    items,
  }
}

function buildParsedDetail(item, attempt, timestamp) {
  const commercial = normalizePsdealsCommercialState({
    currentPrice: attempt.current_price,
    originalPrice: attempt.original_price,
    discountPercent: attempt.discount_percent,
    sourceContext: 'detail',
  })
  const plus = attempt.ps_plus_price
  const plusActive = typeof plus === 'number' && plus > 0 && plus < commercial.current_price_amount
  return {
    ...item,
    current_price_amount: commercial.current_price_amount,
    original_price_amount: commercial.original_price_amount,
    discount_percent: commercial.discount_percent_normalized,
    commercial_state: commercial,
    type_classification: classifyPsdealsItemType(attempt.type_label, { sourceContext: 'detail' }),
    platform_classification: normalizePsdealsPlatforms(attempt.platforms, { sourceContext: 'detail' }),
    currency_code: 'USD',
    is_free_to_play: false,
    is_ps_plus_discount: plusActive,
    is_monthly_game: attempt.is_monthly_game === true,
    detail_last_synced_at: timestamp,
    raw_detail_json: {
      current_ps_plus_price_amount: plus ?? null,
      ps_plus_evidence: {
        parser_status: attempt.ps_plus_parser_status,
        source_consistent: attempt.ps_plus_source_consistent,
      },
    },
  }
}

function processDetails(input, listingItems, queueIds) {
  const fixtures = new Map(input.details.map((entry) => [entry.psdeals_id, entry]))
  const listing = new Map(listingItems.map((entry) => [entry.psdeals_id, entry]))
  const accepted = []
  const rejected = []
  const retries = []
  const pending = []
  for (const id of queueIds) {
    const fixture = fixtures.get(id)
    const attempts = fixture?.attempts || []
    if (attempts.length === 0) {
      pending.push(id)
      rejected.push({ psdeals_id: id, disposition: 'cycle_blocker', reason_codes: ['detail_missing'] })
      continue
    }
    let selected = null
    for (const [index, attempt] of attempts.slice(0, 2).entries()) {
      if (attempt?.status === 'ok') {
        selected = attempt
        break
      }
      if (index === 0 && attempts.length > 1) {
        retries.push({ psdeals_id: id, attempts: 2, result: attempts[1]?.status === 'ok' ? 'resolved' : 'failed' })
      }
    }
    if (!selected) {
      pending.push(id)
      rejected.push({ psdeals_id: id, disposition: 'cycle_blocker', reason_codes: ['detail_retry_exhausted'] })
      continue
    }
    accepted.push(buildParsedDetail(listing.get(id), selected, input.logical_timestamp))
  }
  return { accepted, rejected, retries, pending_failures: pending }
}

function minimumObservation(candidate, itemId) {
  const regular = candidate.kind === 'regular'
  return {
    local_cycle_id: candidate.cycle_id,
    item_id: itemId,
    psdeals_id: candidate.psdeals_id,
    region_code: 'us',
    storefront: 'playstation',
    currency_code: 'USD',
    price_kind: candidate.kind,
    price_amount: regular ? candidate.current_price_amount : candidate.ps_plus_price_amount,
    observed_at: candidate.observed_at,
    producer: regular ? 'listing' : 'detail',
    is_free_to_play: false,
    type_classification_safe: true,
    platform_classification_safe: true,
    deal_active: true,
    current_price_amount: candidate.current_price_amount,
    original_price_amount: candidate.original_price_amount,
    discount_percent: candidate.discount_percent,
    is_ps_plus_discount: regular ? false : true,
    ps_plus_price_amount: candidate.ps_plus_price_amount,
    is_monthly_game: false,
    commercial_state: regular
      ? {
          classification: 'regular_discount',
          is_certified_regular_discount_eligible: true,
          current_price_amount: candidate.current_price_amount,
          original_price_amount: candidate.original_price_amount,
          discount_percent_normalized: candidate.discount_percent,
        }
      : null,
  }
}

function certificationDecision(result) {
  if (!result.changed) {
    if (result.reason_code === 'certified_low_equal') return 'noop_equal'
    if (result.reason_code === 'certified_low_higher') return 'noop_higher'
    return 'reject_unsafe'
  }
  return result.reason_code === 'certified_low_initialized' ? 'initialize' : 'reduce'
}

function failManifest(input, validation, identity) {
  return {
    schema_version: PSDEALS_UPDATER_SIMULATION_SCHEMA_VERSION,
    orchestrator_version: PSDEALS_UPDATER_ORCHESTRATOR_VERSION,
    run_id: identity?.run_id || null,
    mode: 'simulation',
    generated_at: input?.logical_timestamp || null,
    input_hashes: { input: identity?.input_sha256 || null },
    fixture_identifiers: [input?.fixture_id || null],
    pipeline_states: ['initialized', 'failed'],
    operation_ledger: { operations: [], planned_writes: 0, executed_writes: 0 },
    blockers: validation.errors,
    warnings: [],
    planned_writes: 0,
    executed_writes: 0,
    opens_connections: false,
    executes_processes: false,
    uses_supabase: false,
    overall_status: 'blocked',
  }
}

export function runPsdealsUpdaterOrchestratorLocal(inputValue) {
  const validation = validatePsdealsUpdaterSimulationInput(inputValue)
  const identity = validation.normalized_input
    ? buildPsdealsUpdaterSimulationIdentity(validation.normalized_input)
    : null
  if (!validation.valid) return failManifest(inputValue, validation, identity)
  const input = validation.normalized_input
  const ledger = createPsdealsUpdaterSimulationLedger({ run_id: identity.run_id, cycle_id: identity.simulation_cycle_id })
  const machine = createPsdealsUpdaterSimulationStateMachine()
  const blockers = []
  const warnings = []
  const operationalBlockers = []
  machine.transition('preflight_passed')

  const listing = normalizeListing(input)
  warnings.push(...listing.warnings)
  machine.transition('listing_collected')
  if (!listing.complete) {
    blockers.push(...listing.blockers)
    machine.transition('failed', 'listing_validation_failed')
  } else {
    machine.transition('listing_validated')
  }

  const stageById = new Map(input.initial_stage.map((entry) => [entry.psdeals_id, entry]))
  const analyzed = listing.items.map((item) => {
    const db = stageById.get(item.psdeals_id) || null
    const decision = classifyFastRefreshItem(item, db)
    return { listing: item, db, ...decision }
  })
  const queues = selectFastRefreshQueues(analyzed, {
    staleLimit: input.configuration.stale_limit,
    psPlusRecheckLimit: input.configuration.ps_plus_recheck_limit,
    staleHours: input.configuration.stale_hours,
    nowMs: Date.parse(input.logical_timestamp),
  })

  for (const item of listing.items) {
    const existing = stageById.has(item.psdeals_id)
    const payloadResult = existing
      ? buildPsdealsListingUpdatePayload(item, { isExisting: true, listingObservedAt: input.logical_timestamp })
      : buildPsdealsListingInsertPayload(item, { listingObservedAt: input.logical_timestamp })
    ledger.plan({
      operation_type: 'stage_upsert', target: 'psdeals_stage_items',
      key: `us:playstation:${item.psdeals_id}`, before: stageById.get(item.psdeals_id) || null,
      after: payloadResult.payload, reason: 'safe_listing_partial_payload', family: 'listing',
      source_observation: item.psdeals_id, allowed: listing.complete && payloadResult.is_valid,
      blocker: listing.complete && payloadResult.is_valid ? null : 'listing_payload_not_safe',
    })
  }

  const queueIds = queues.combined.map((entry) => entry.listing.psdeals_id)
  const details = processDetails(input, listing.items, queueIds)
  if (machine.state === 'listing_validated') machine.transition('details_processed')
  if (details.pending_failures.length > 0) blockers.push('detail_failures_pending_after_retry')

  for (const parsed of details.accepted) {
    const payload = buildPsdealsDetailUpsertPayload(parsed, { isExisting: stageById.has(parsed.psdeals_id) })
    ledger.plan({
      operation_type: 'stage_upsert', target: 'psdeals_stage_items', key: `us:playstation:${parsed.psdeals_id}`,
      before: stageById.get(parsed.psdeals_id) || null, after: payload.payload,
      reason: 'safe_detail_partial_payload', family: 'detail', source_observation: parsed.psdeals_id,
      allowed: payload.is_valid, blocker: payload.is_valid ? null : 'detail_payload_not_safe',
    })
  }

  ledger.plan({
    operation_type: 'cycle_insert', target: 'price_refresh_cycles', key: identity.run_id,
    before: null, after: { simulation_cycle_id: identity.simulation_cycle_id, status: 'planned' },
    reason: 'offline_cycle_plan', family: 'cycle', allowed: blockers.length === 0,
    blocker: blockers.length === 0 ? null : 'cycle_preconditions_failed',
  })
  if (machine.state === 'details_processed' && blockers.length === 0) machine.transition('cycle_planned')
  else if (!['failed', 'requires_reconciliation'].includes(machine.state)) machine.transition('failed', blockers[0] || 'cycle_plan_blocked')

  const receiptFamilies = ['listing', 'details', 'ended_deals', 'monthly', 'certification', 'cache']
  for (const family of receiptFamilies) {
    ledger.plan({
      operation_type: 'receipt_insert', target: 'psdeals_cycle_action_receipts', key: family,
      before: null, after: { status: 'planned', family }, reason: 'cycle_action_receipt_plan', family,
      allowed: blockers.length === 0, blocker: blockers.length === 0 ? null : 'receipt_parent_cycle_blocked',
    })
  }
  const omittedReceipts = new Set(input.faults?.omit_receipt_for || [])
  if (omittedReceipts.size > 0) blockers.push('required_receipt_missing')
  if (machine.state === 'cycle_planned' && blockers.length === 0) machine.transition('receipts_reconciled')

  const regularEvidence = listing.items.map((item) => ({
    psdeals_id: item.psdeals_id,
    ...buildPsdealsRegularCertificationEvidence(item, {
      remote_cycle_id: input.faults?.candidate_cycle_mismatch
        ? '22222222-2222-4222-8222-222222222222'
        : identity.simulation_cycle_id,
      observed_at: input.logical_timestamp,
      evidence_sha256: listing.fingerprint,
    }),
  }))
  const detailArtifactHash = hashPsdealsUpdaterSimulationValue(details.accepted)
  const plusEvidence = details.accepted.map((parsed) => ({
    psdeals_id: parsed.psdeals_id,
    monthly: parsed.is_monthly_game,
    ...buildPsdealsPsPlusCertificationEvidence(parsed, {
      remote_cycle_id: identity.simulation_cycle_id,
      observed_at: input.logical_timestamp,
      evidence_sha256: detailArtifactHash,
      input_artifact_sha256: detailArtifactHash,
    }),
  }))
  const candidates = []
  const rejected = [...details.rejected]
  for (const evidence of [...regularEvidence, ...plusEvidence]) {
    if (evidence.monthly === true) {
      rejected.push({ psdeals_id: evidence.psdeals_id, disposition: 'permanently_rejected', reason_codes: ['monthly_game_excluded'] })
    } else if (evidence.eligible) {
      const sameCycle = evidence.candidate.cycle_id === identity.simulation_cycle_id
      const familyReceipt = evidence.kind === 'regular' ? 'listing' : 'details'
      const receiptPresent = !omittedReceipts.has(familyReceipt)
      if (!sameCycle || !receiptPresent) {
        rejected.push({
          psdeals_id: evidence.psdeals_id, disposition: 'cycle_blocker',
          reason_codes: [!sameCycle ? 'candidate_cycle_mismatch' : 'candidate_receipt_missing'],
        })
        blockers.push(!sameCycle ? 'candidate_cycle_mismatch' : 'candidate_receipt_missing')
      } else candidates.push(evidence.candidate)
    } else {
      rejected.push({ psdeals_id: evidence.psdeals_id, disposition: 'item_only_blocker', reason_codes: evidence.reason_codes })
    }
  }
  for (const candidate of candidates) {
    ledger.plan({
      operation_type: 'candidate_update', target: 'psdeals_stage_items',
      key: `${candidate.psdeals_id}:${candidate.kind}`, before: null, after: candidate,
      reason: 'safe_cycle_bound_candidate', family: candidate.kind,
      source_observation: candidate.candidate_sha256,
    })
  }
  if (machine.state === 'receipts_reconciled' && blockers.length === 0) machine.transition('candidates_planned')

  const certification = []
  const minima = []
  for (const candidate of candidates) {
    const prior = input.initial_minima?.[candidate.psdeals_id]?.[candidate.kind] || null
    const stageId = stageById.get(candidate.psdeals_id)?.id || `simulation-item-${candidate.psdeals_id}`
    const applied = applyPsdealsCertifiedPriceLow(prior, minimumObservation(candidate, stageId))
    const decision = certificationDecision(applied)
    const entry = { psdeals_id: candidate.psdeals_id, family: candidate.kind, decision, result: applied }
    certification.push(entry)
    ledger.plan({
      operation_type: 'certification_decision', target: 'certify_price_refresh_cycle_v3',
      key: `${candidate.psdeals_id}:${candidate.kind}`, before: prior, after: applied.value,
      reason: decision, family: candidate.kind, source_observation: candidate.candidate_sha256,
      allowed: !decision.startsWith('reject'), blocker: decision.startsWith('reject') ? 'candidate_not_certifiable' : null,
    })
    if (applied.changed) {
      minima.push(entry)
      const operationType = decision === 'initialize' ? 'minima_initialize' : 'minima_reduce'
      ledger.plan({
        operation_type: operationType, target: 'psdeals_stage_items',
        key: `${candidate.psdeals_id}:${candidate.kind}:amount`, before: prior, after: applied.value,
        reason: applied.reason_code, family: candidate.kind, source_observation: candidate.candidate_sha256,
      })
      ledger.plan({
        operation_type: 'first_seen_set', target: 'psdeals_stage_items',
        key: `${candidate.psdeals_id}:${candidate.kind}:first_seen`, before: prior?.observed_at || null,
        after: applied.value.observed_at, reason: applied.reason_code, family: candidate.kind,
        source_observation: candidate.candidate_sha256,
      })
    }
  }
  if (machine.state === 'candidates_planned' && blockers.length === 0) machine.transition('certification_planned')
  if (machine.state === 'certification_planned') machine.transition('minima_planned')

  const endedSelection = selectEndedDiscountCandidatesFromListing(listing.items, input.initial_stage)
  const endedDeals = []
  for (const row of endedSelection.candidates.filter((entry) => entry.is_active_discount === true)) {
    const verifiable = listing.complete && Number(row.original_price_amount) > 0 &&
      row.identity_ambiguous !== true && row.category_changed !== true && row.is_published !== false
    const decision = {
      psdeals_id: row.psdeals_id,
      decision: verifiable ? 'plan_demotion' : 'blocked_unverifiable',
      restore_price: verifiable ? Number(row.original_price_amount) : null,
    }
    endedDeals.push(decision)
    ledger.plan({
      operation_type: 'ended_deal_demotion', target: 'psdeals_stage_items', key: String(row.psdeals_id),
      before: row, after: verifiable ? { current_price_amount: Number(row.original_price_amount), discount_percent: 0 } : null,
      reason: decision.decision, family: 'ended_deals', source_observation: listing.fingerprint,
      allowed: verifiable, blocker: verifiable ? null : 'ended_deal_not_verifiable',
    })
  }
  if (machine.state === 'minima_planned') machine.transition('ended_deals_planned')

  const certificationAllowed = blockers.length === 0 && candidates.length > 0
  const changedIds = unique([
    ...listing.items.map((entry) => entry.psdeals_id),
    ...endedDeals.filter((entry) => entry.decision === 'plan_demotion').map((entry) => entry.psdeals_id),
  ]).sort((a, b) => a - b)
  const cache = {
    eligible: certificationAllowed,
    changes: certificationAllowed ? changedIds : [],
    blocker: certificationAllowed ? null : 'cache_requires_successful_certification',
  }
  for (const id of cache.changes) {
    ledger.plan({
      operation_type: 'cache_change', target: 'catalog_public_cache', key: String(id),
      before: input.initial_public_prices?.[id] || null, after: { source: 'simulated_certified_stage' },
      reason: 'post_certification_cache_plan', family: 'cache', source_observation: identity.run_id,
    })
  }
  if (input.faults?.cache_before_certification === true) blockers.push('cache_before_certification_forbidden')
  if (machine.state === 'ended_deals_planned' && blockers.length === 0) machine.transition('cache_planned')

  const monthlySupported = input.monthly?.status === 'supported' && input.monthly?.checked === true &&
    typeof input.monthly?.source === 'string' && typeof input.monthly?.procedure === 'string' &&
    input.monthly?.application_performed === false && (input.monthly?.proposed_changes || []).length === 0
  const monthly = {
    classification: monthlySupported ? 'supported' : input.monthly?.status === 'partial' ? 'partial' : 'blocked',
    changes: [],
    application_performed: false,
  }
  if (!monthlySupported) {
    warnings.push('monthly_not_operationally_complete')
    operationalBlockers.push('monthly_real_operation_not_supported')
  }
  if ((input.monthly?.proposed_changes || []).length > 0) {
    warnings.push('monthly_proposed_changes_not_applied')
  }
  if (machine.state === 'cache_planned') machine.transition('monthly_planned')

  if (input.faults?.timeout_after_receipts === true && !['failed', 'requires_reconciliation'].includes(machine.state)) {
    machine.transition('requires_reconciliation', 'ambiguous_transport_simulated')
    blockers.push('reconciliation_required')
  } else if (machine.state === 'monthly_planned' && blockers.length === 0) {
    machine.transition('ready_to_finalize')
    ledger.plan({
      operation_type: 'cycle_finalization', target: 'price_refresh_cycles', key: identity.run_id,
      before: { status: 'planned' }, after: { status: 'succeeded' },
      reason: 'all_offline_gates_passed', family: 'cycle', source_observation: identity.input_sha256,
    })
    machine.transition('succeeded')
  } else if (!['failed', 'requires_reconciliation'].includes(machine.state)) {
    machine.transition('failed', blockers[0] || 'finalization_blocked')
  }

  const ledgerSnapshot = ledger.snapshot()
  const stateSnapshot = machine.snapshot()
  const cyclePlan = buildPsdealsDailyCyclePlan({
    completed_steps: PSDEALS_DAILY_CYCLE_STEPS.map((step) => step.name),
    gates: { listing_complete: listing.complete, can_demote: listing.complete, can_mark_succeeded: blockers.length === 0, can_certify: certificationAllowed, can_refresh_cache: certificationAllowed },
  })
  const manifest = {
    schema_version: PSDEALS_UPDATER_SIMULATION_SCHEMA_VERSION,
    orchestrator_version: PSDEALS_UPDATER_ORCHESTRATOR_VERSION,
    run_id: identity.run_id,
    simulation_cycle_id: identity.simulation_cycle_id,
    remote_cycle_id: null,
    mode: 'simulation',
    generated_at: input.logical_timestamp,
    code_head: input.code_revision || null,
    input_hashes: { input: identity.input_sha256, listing: listing.fingerprint, details: detailArtifactHash },
    fixture_identifiers: [input.fixture_id],
    listing_summary: { ...listing, items: undefined },
    pagination_summary: {
      requested: listing.pages_requested, completed: listing.pages_completed,
      final_observed: listing.final_page_observed, complete: listing.complete,
    },
    detail_queue: { ids: queueIds, must_refresh: queues.mustRefresh.length, ps_plus_recheck: queues.psPlusRecheckCandidates.length, stale: queues.staleCandidates.length },
    accepted_observations: candidates,
    rejected_observations: rejected,
    rejection_reasons: Object.fromEntries(rejected.flatMap((entry) => entry.reason_codes).reduce((map, code) => map.set(code, (map.get(code) || 0) + 1), new Map())),
    ended_deals: endedDeals,
    cycle_plan: cyclePlan,
    receipt_plan: ledgerSnapshot.operations.filter((entry) => entry.operation_type.startsWith('receipt_')),
    candidate_plan: candidates,
    certification_plan: certification,
    minima_plan: minima,
    first_seen_plan: ledgerSnapshot.operations.filter((entry) => entry.operation_type === 'first_seen_set'),
    cache_plan: cache,
    monthly_plan: monthly,
    finalization_plan: { state: stateSnapshot.state, eligible: stateSnapshot.state === 'succeeded' },
    retry_plan: { maximum_attempts: 2, retries: details.retries, pending_failures: details.pending_failures },
    pipeline_states: ['initialized', ...stateSnapshot.transitions.map((entry) => entry.to)],
    operation_ledger: ledgerSnapshot,
    warnings: unique(warnings).sort(),
    blockers: unique(blockers).sort(),
    operational_blockers: unique(operationalBlockers).sort(),
    planned_writes: ledgerSnapshot.planned_writes,
    executed_writes: 0,
    idempotency_key: identity.idempotency_key,
    accepted_count: candidates.length,
    rejected_count: rejected.length,
    candidates_count: candidates.length,
    certifications_count: certification.filter((entry) => !entry.decision.startsWith('reject')).length,
    minima_initializations: minima.filter((entry) => entry.decision === 'initialize').length,
    minima_reductions: minima.filter((entry) => entry.decision === 'reduce').length,
    ended_deals_count: endedDeals.filter((entry) => entry.decision === 'plan_demotion').length,
    cache_changes: cache.changes.length,
    monthly_changes: 0,
    retries: details.retries.length,
    reconciliation_required: stateSnapshot.state === 'requires_reconciliation',
    opens_connections: false,
    executes_processes: false,
    uses_supabase: false,
    overall_status: stateSnapshot.state === 'succeeded' ? 'simulated_success' : stateSnapshot.state,
  }
  const manifestValidation = validatePsdealsUpdaterSimulationManifest(manifest)
  return { ...manifest, manifest_validation: manifestValidation }
}
