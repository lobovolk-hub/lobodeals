export const PSDEALS_DAILY_LIVE_BINDING_VERSION = 1

function binding({
  state,
  adapter,
  parent,
  kind,
  component,
  timeout_ms,
  idempotency,
  receipt,
  reconciliation,
  errors,
  ...rest
}) {
  return Object.freeze({
    binding_version: PSDEALS_DAILY_LIVE_BINDING_VERSION,
    state,
    adapter,
    parent,
    kind,
    component,
    input_schema: `psdeals.daily.${adapter}.input.v1`,
    output_schema: 'psdeals.daily.stage-result.v1',
    timeout_ms,
    idempotency,
    receipt_contract: receipt,
    reconciliation,
    error_classifications: Object.freeze(errors),
    implementation_status: 'bound',
    ...rest,
  })
}

const LOCAL_ERRORS = ['failed', 'requires_reconciliation']
const REMOTE_ERRORS = ['failed', 'requires_reconciliation', 'authorization_rejected']
const PROCESS_ERRORS = ['failed', 'requires_reconciliation', 'timeout', 'partial']

export const PSDEALS_DAILY_LIVE_BINDINGS = Object.freeze([
  binding({ state: 'local_preflight_passed', adapter: 'run_local_preflight', parent: 'initialized', kind: 'local_module', component: 'scripts/preflight-psdeals-block4-local.mjs', timeout_ms: 120000, idempotency: 'read-only-by-code-head', receipt: 'local_preflight_evidence', reconciliation: 'repeat_read_only_preflight', errors: LOCAL_ERRORS }),
  binding({ state: 'remote_preflight_passed', adapter: 'verify_remote_preflight', parent: 'local_preflight_passed', kind: 'read_only_evidence', component: 'sql/validation/007-safe-demotion-postcheck-certificate-readonly.sql', timeout_ms: 120000, idempotency: 'read-only-by-project-snapshot', receipt: 'remote_preflight_evidence', reconciliation: 'repeat_same_read_only_certificate', errors: LOCAL_ERRORS }),
  binding({ state: 'edge_ready', adapter: 'probe_edge_cdp', parent: 'remote_preflight_passed', kind: 'powershell_cdp', component: 'scripts/start-psdeals-edge-cdp.ps1', timeout_ms: 120000, idempotency: 'port-9222-plus-dedicated-profile', receipt: 'edge_runtime_preflight', reconciliation: 'reinspect_owned_edge_process_and_cdp_target', errors: ['requires_johan', ...LOCAL_ERRORS] }),
  binding({ state: 'captcha_resolved', adapter: 'wait_for_captcha_clear', parent: 'edge_ready', kind: 'local_module', component: 'scripts/lib/psdeals-edge-cdp-preflight.mjs', timeout_ms: 900000, idempotency: 'poll-current-cdp-target', receipt: 'captcha_runtime_observation', reconciliation: 'resume_polling_without_clicks_or_chat_confirmation', errors: ['requires_johan', ...LOCAL_ERRORS] }),
  binding({ state: 'cycle_created', adapter: 'create_remote_cycle', parent: 'captcha_resolved', kind: 'supabase_rpc', component: 'create_or_reconcile_price_refresh_cycle_v1', timeout_ms: 120000, idempotency: 'create-cycle:<run_intent_id>', receipt: 'committed_create_cycle_receipt', reconciliation: 'find_by_immutable_local_identity_and_idempotency_key', errors: REMOTE_ERRORS }),
  binding({ state: 'recently_added_collected', adapter: 'collect_recently_added', parent: 'cycle_created', kind: 'bounded_process', component: 'scripts/collect-psdeals-listing-edge-live-cdp.mjs', timeout_ms: 2700000, idempotency: 'recently-added:<remote_cycle_id>:<listing_fingerprint>', receipt: 'recently_added_collection_evidence', reconciliation: 'verify_final_artifact_and_evidence_hash_before_repeat', errors: PROCESS_ERRORS, url: 'https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc' }),
  binding({ state: 'recently_added_imported', adapter: 'import_recently_added', parent: 'recently_added_collected', kind: 'bounded_process', component: 'scripts/analyze-psdeals-listing-new-v2.mjs -> scripts/import-psdeals-detail-local.mjs', timeout_ms: 21600000, idempotency: 'recently-added-import:<remote_cycle_id>:<artifact_hash>', receipt: 'recently_added_import', reconciliation: 'read_import_run_and_exact_owned_stage_fields', errors: PROCESS_ERRORS }),
  binding({ state: 'discounts_collected', adapter: 'collect_discounts', parent: 'recently_added_imported', kind: 'bounded_process', component: 'scripts/collect-psdeals-listing-edge-live-cdp.mjs', timeout_ms: 2700000, idempotency: 'discounts:<remote_cycle_id>:<listing_fingerprint>', receipt: 'discounts_collection_evidence', reconciliation: 'verify_final_artifact_and_evidence_hash_before_repeat', errors: PROCESS_ERRORS, url: 'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc' }),
  binding({ state: 'discounts_certified', adapter: 'certify_discounts_listing', parent: 'discounts_collected', kind: 'local_module', component: 'strong_listing_completeness_v3', timeout_ms: 120000, idempotency: 'discounts-certificate:<listing_fingerprint>', receipt: 'listing_validation', reconciliation: 'recompute_from_immutable_listing_artifact', errors: LOCAL_ERRORS }),
  binding({ state: 'details_refreshed', adapter: 'refresh_discount_details', parent: 'discounts_certified', kind: 'bounded_process', component: 'scripts/analyze-psdeals-discounts-fast-refresh-v1.mjs -> scripts/import-psdeals-detail-local.mjs', timeout_ms: 21600000, idempotency: 'detail-import:<remote_cycle_id>:<queue_hash>', receipt: 'detail_import', reconciliation: 'read_import_run_receipt_and_exact_stage_postconditions', errors: PROCESS_ERRORS }),
  binding({ state: 'retry_reconciled', adapter: 'reconcile_detail_retry', parent: 'details_refreshed', kind: 'bounded_process', component: 'scripts/import-psdeals-detail-local.mjs', timeout_ms: 7200000, idempotency: 'detail-retry:<remote_cycle_id>:<failure_hash>', receipt: 'detail_retry', reconciliation: 'one_bounded_retry_then_read_import_run', errors: PROCESS_ERRORS, max_attempts: 1 }),
  binding({ state: 'monthly_reconciled', adapter: 'reconcile_monthly_branch', parent: 'retry_reconciled', kind: 'supabase_rpc', component: 'record_psdeals_monthly_check_v1', timeout_ms: 120000, idempotency: 'monthly:<remote_cycle_id>:<evidence_hash>', receipt: 'monthly_check_record', reconciliation: 'read_committed_monthly_receipt', errors: REMOTE_ERRORS }),
  binding({ state: 'ended_analyzed', adapter: 'analyze_ended_discounts', parent: 'monthly_reconciled', kind: 'bounded_process', component: 'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs', timeout_ms: 900000, idempotency: 'ended-analysis:<remote_cycle_id>:<listing_hash>', receipt: 'ended_deals_analysis', reconciliation: 'recompute_from_immutable_listing_and_stage_snapshot', errors: PROCESS_ERRORS }),
  binding({ state: 'ambiguous_revalidated', adapter: 'revalidate_ambiguous_details', parent: 'ended_analyzed', kind: 'bounded_process', component: 'scripts/import-psdeals-detail-local.mjs', timeout_ms: 7200000, idempotency: 'ended-revalidation:<remote_cycle_id>:<queue_hash>', receipt: 'detail_revalidation', reconciliation: 'read_exact_detail_import_receipt_and_stage_postconditions', errors: PROCESS_ERRORS }),
  binding({ state: 'ended_reanalyzed', adapter: 'reanalyze_ended_discounts', parent: 'ambiguous_revalidated', kind: 'bounded_process', component: 'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs', timeout_ms: 900000, idempotency: 'ended-reanalysis:<remote_cycle_id>:<input_hash>', receipt: 'ended_deals_reanalysis', reconciliation: 'recompute_from_revalidated_immutable_inputs', errors: PROCESS_ERRORS }),
  binding({ state: 'demotions_planned', adapter: 'plan_safe_demotions', parent: 'ended_reanalyzed', kind: 'local_module', component: 'scripts/lib/psdeals-ended-discounts.mjs', timeout_ms: 120000, idempotency: 'demotion-plan:<candidate-set-hash>', receipt: 'demotion_plan', reconciliation: 'recompute_exact_bounded_candidate_set', errors: LOCAL_ERRORS }),
  binding({ state: 'demotions_reconciled', adapter: 'apply_safe_demotions_v2', parent: 'demotions_planned', kind: 'supabase_rpc', component: 'apply_psdeals_ended_deals_v2', timeout_ms: 120000, idempotency: 'demotion-apply:<remote_cycle_id>:<candidate-set-hash>', receipt: 'demotion_apply', reconciliation: 'read_committed_exact_candidate_set_receipt_and_cycle', errors: REMOTE_ERRORS }),
  binding({ state: 'candidates_prepared', adapter: 'prepare_certification_candidates', parent: 'demotions_reconciled', kind: 'local_module', component: 'scripts/lib/psdeals-certification-evidence.mjs', timeout_ms: 120000, idempotency: 'candidates:<remote_cycle_id>:<evidence-chain-hash>', receipt: 'candidate_set', reconciliation: 'recompute_from_verified_cycle_evidence', errors: LOCAL_ERRORS }),
  binding({ state: 'certification_reconciled', adapter: 'certify_price_cycle_v3', parent: 'candidates_prepared', kind: 'supabase_rpc', component: 'certify_price_refresh_cycle_v3', timeout_ms: 120000, idempotency: 'certify:<remote_cycle_id>:<candidate-set-hash>', receipt: 'certify', reconciliation: 'read_committed_certify_receipt_and_cycle_status', errors: REMOTE_ERRORS }),
  binding({ state: 'minima_reconciled', adapter: 'reconcile_compact_minima', parent: 'certification_reconciled', kind: 'receipt_result', component: 'certify_price_refresh_cycle_v3', timeout_ms: 120000, idempotency: 'minima:<certification-receipt-id>', receipt: 'certification_minima_result', reconciliation: 'verify_minima_counts_from_committed_certification_receipt', errors: LOCAL_ERRORS }),
  binding({ state: 'cache_reconciled', adapter: 'refresh_public_cache_v16', parent: 'minima_reconciled', kind: 'supabase_rpc', component: 'refresh_catalog_public_cache_v16', timeout_ms: 120000, idempotency: 'cache-refresh:<remote_cycle_id>:<certification-receipt-id>', receipt: 'cache_refresh', reconciliation: 'read_committed_cache_receipt_cycle_and_cache_timestamp', errors: REMOTE_ERRORS }),
  binding({ state: 'ready_to_finalize', adapter: 'run_cycle_public_postchecks', parent: 'cache_reconciled', kind: 'read_only_evidence', component: 'cycle_and_public_postchecks_v3', timeout_ms: 120000, idempotency: 'read-only:<remote_cycle_id>:<cache-receipt-id>', receipt: 'cycle_public_postcheck', reconciliation: 'repeat_bounded_read_only_postchecks', errors: LOCAL_ERRORS }),
  binding({ state: 'succeeded', adapter: 'finalize_manifest', parent: 'ready_to_finalize', kind: 'local_module', component: 'manifest_finalization_v3', timeout_ms: 120000, idempotency: 'manifest:<remote_cycle_id>:<evidence-chain-hash>', receipt: 'final_manifest', reconciliation: 'verify_existing_manifest_hash_before_noop', errors: LOCAL_ERRORS }),
])

export function validatePsdealsDailyLiveBindings(bindings = PSDEALS_DAILY_LIVE_BINDINGS) {
  const blockers = []
  const states = new Set()
  const adapters = new Set()
  for (const value of bindings || []) {
    if (value?.binding_version !== PSDEALS_DAILY_LIVE_BINDING_VERSION) blockers.push('live_binding_version_invalid')
    if (!value?.state || states.has(value.state)) blockers.push('live_binding_state_invalid_or_duplicate')
    if (!value?.adapter || adapters.has(value.adapter)) blockers.push('live_binding_adapter_invalid_or_duplicate')
    states.add(value?.state)
    adapters.add(value?.adapter)
    if (value?.implementation_status !== 'bound') blockers.push('live_binding_not_bound')
    if (/stub|not[_ -]?implemented/i.test(`${value?.component || ''} ${value?.implementation_status || ''}`)) {
      blockers.push('live_binding_stub_detected')
    }
    if (!value?.input_schema || !value?.output_schema) blockers.push('live_binding_schema_missing')
    if (!value?.idempotency || !value?.receipt_contract) blockers.push('live_binding_idempotency_or_receipt_missing')
    if (!Number.isSafeInteger(value?.timeout_ms) || value.timeout_ms < 1000) blockers.push('live_binding_timeout_invalid')
    if (!value?.reconciliation) blockers.push('live_binding_reconciliation_missing')
    if (!Array.isArray(value?.error_classifications) || value.error_classifications.length === 0) blockers.push('live_binding_error_classification_missing')
    if (value?.parent !== 'initialized' && !states.has(value?.parent)) blockers.push('live_binding_parent_invalid')
  }
  const uniqueBlockers = [...new Set(blockers)]
  return {
    valid: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    binding_count: bindings?.length || 0,
    adapter_names: [...adapters],
    LIVE_ADAPTER_CONTRACTS_READY: uniqueBlockers.length === 0,
  }
}

export function createPsdealsBoundDailyLiveAdapters({ execute_stage } = {}) {
  if (typeof execute_stage !== 'function') throw new Error('LIVE_STAGE_EXECUTION_PORT_REQUIRED')
  return Object.fromEntries(PSDEALS_DAILY_LIVE_BINDINGS.map((value) => {
    const adapter = async (context) => execute_stage(value, context)
    Object.defineProperties(adapter, {
      psdeals_live_binding: { value, enumerable: true },
      // This factory binds the stage contract to a dispatcher. It does not prove
      // that the dispatcher is a concrete production implementation.
      psdeals_implementation_status: { value: 'delegated', enumerable: true },
    })
    return [value.adapter, adapter]
  }))
}
