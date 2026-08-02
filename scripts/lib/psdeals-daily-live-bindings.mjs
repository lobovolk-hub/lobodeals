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
  binding({ state: 'edge_ready', adapter: 'probe_edge_cdp', parent: 'remote_preflight_passed', kind: 'powershell_cdp', component: 'scripts/start-psdeals-edge-cdp.ps1', timeout_ms: 120000, idempotency: 'selected-port-plus-dedicated-profile', receipt: 'edge_runtime_preflight', reconciliation: 'reinspect_owned_edge_process_and_cdp_target', errors: ['requires_johan', ...LOCAL_ERRORS] }),
  binding({ state: 'captcha_resolved', adapter: 'wait_for_captcha_clear', parent: 'edge_ready', kind: 'local_module', component: 'scripts/lib/psdeals-edge-cdp-preflight.mjs', timeout_ms: 900000, idempotency: 'poll-current-cdp-target', receipt: 'captcha_runtime_observation', reconciliation: 'resume_polling_without_clicks_or_chat_confirmation', errors: ['requires_johan', ...LOCAL_ERRORS] }),
  binding({ state: 'cycle_created', adapter: 'create_remote_cycle', parent: 'captcha_resolved', kind: 'supabase_rpc', component: 'create_or_reconcile_price_refresh_cycle_v1', timeout_ms: 120000, idempotency: 'create-cycle:<run_intent_id>', receipt: 'committed_create_cycle_receipt', reconciliation: 'find_by_immutable_local_identity_and_idempotency_key', errors: REMOTE_ERRORS }),
  binding({ state: 'recently_added_collected', adapter: 'collect_recently_added', parent: 'cycle_created', kind: 'bounded_process', component: 'scripts/collect-psdeals-listing-edge-live-cdp.mjs', timeout_ms: 2700000, idempotency: 'recently-added:<remote_cycle_id>:<listing_fingerprint>', receipt: 'recently_added_collection_evidence', reconciliation: 'verify_final_artifact_and_evidence_hash_before_repeat', errors: PROCESS_ERRORS, url: 'https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc' }),
  binding({ state: 'recently_added_analyzed', adapter: 'analyze_recently_added', parent: 'recently_added_collected', kind: 'bounded_process', component: 'scripts/analyze-psdeals-listing-new-v2.mjs', timeout_ms: 900000, idempotency: 'recently-added-analysis:<remote_cycle_id>:<listing-hash>', receipt: 'recently_added_analysis_evidence', reconciliation: 'recompute_from_immutable_listing_artifact', errors: PROCESS_ERRORS }),
  binding({ state: 'recently_added_imported', adapter: 'import_recently_added', parent: 'recently_added_analyzed', kind: 'bounded_process', component: 'scripts/import-psdeals-detail-local.mjs', timeout_ms: 21600000, idempotency: 'recently-added-import:<remote_cycle_id>:<queue-hash>', receipt: 'psdeals_import_run_plus_evidence', reconciliation: 'read_import_run_and_exact_owned_stage_fields', errors: PROCESS_ERRORS }),
  binding({ state: 'discounts_collected', adapter: 'collect_discounts', parent: 'recently_added_imported', kind: 'bounded_process', component: 'scripts/collect-psdeals-listing-edge-live-cdp.mjs', timeout_ms: 2700000, idempotency: 'discounts:<remote_cycle_id>:<listing_fingerprint>', receipt: 'discounts_collection_evidence', reconciliation: 'verify_final_artifact_and_evidence_hash_before_repeat', errors: PROCESS_ERRORS, url: 'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc' }),
  binding({ state: 'discounts_analyzed', adapter: 'analyze_fast_refresh', parent: 'discounts_collected', kind: 'bounded_process_and_rpc', component: 'scripts/analyze-psdeals-discounts-fast-refresh-v1.mjs -> record_psdeals_listing_completion_v1', timeout_ms: 900000, idempotency: 'fast-refresh:<remote_cycle_id>:<listing-hash>', receipt: 'listing_validation_plus_fast_refresh_analysis', reconciliation: 'read_listing_receipt_then_recompute_analysis', errors: PROCESS_ERRORS }),
  binding({ state: 'discount_details_imported', adapter: 'import_discount_details', parent: 'discounts_analyzed', kind: 'bounded_process', component: 'scripts/import-psdeals-detail-local.mjs', timeout_ms: 21600000, idempotency: 'detail-import:<remote_cycle_id>:<queue-hash>', receipt: 'detail_import', reconciliation: 'read_import_run_receipt_and_exact_stage_postconditions', errors: PROCESS_ERRORS }),
  binding({ state: 'detail_retry_reconciled', adapter: 'retry_failed_details', parent: 'discount_details_imported', kind: 'bounded_process', component: 'scripts/import-psdeals-detail-local.mjs', timeout_ms: 7200000, idempotency: 'detail-retry:<remote_cycle_id>:<failure-hash>', receipt: 'detail_retry', reconciliation: 'one_bounded_retry_then_read_import_run', errors: PROCESS_ERRORS, max_attempts: 1 }),
  binding({ state: 'monthly_processed', adapter: 'process_monthly', parent: 'detail_retry_reconciled', kind: 'supabase_rpc', component: 'record_psdeals_monthly_check_v1', timeout_ms: 120000, idempotency: 'monthly:<remote_cycle_id>:<evidence-hash>', receipt: 'monthly_check_record', reconciliation: 'read_committed_monthly_receipt', errors: REMOTE_ERRORS }),
  binding({ state: 'ended_analyzed', adapter: 'analyze_ended', parent: 'monthly_processed', kind: 'bounded_process', component: 'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs', timeout_ms: 900000, idempotency: 'ended-analysis:<remote_cycle_id>:<listing-hash>', receipt: 'ended_deals_analysis', reconciliation: 'recompute_from_immutable_listing_and_stage_snapshot', errors: PROCESS_ERRORS }),
  binding({ state: 'ambiguous_revalidated', adapter: 'revalidate_ambiguous_details', parent: 'ended_analyzed', kind: 'bounded_process', component: 'scripts/import-psdeals-detail-local.mjs', timeout_ms: 7200000, idempotency: 'ended-revalidation:<remote_cycle_id>:<queue-hash>', receipt: 'detail_revalidation', reconciliation: 'read_exact_detail_import_receipt_and_stage_postconditions', errors: PROCESS_ERRORS }),
  binding({ state: 'ended_reanalyzed', adapter: 'reanalyze_ended', parent: 'ambiguous_revalidated', kind: 'bounded_process_and_local_selector', component: 'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs -> scripts/lib/psdeals-ended-discounts.mjs', timeout_ms: 900000, idempotency: 'ended-reanalysis:<remote_cycle_id>:<input-hash>', receipt: 'ended_deals_reanalysis', reconciliation: 'recompute_exact_bounded_candidate_set', errors: PROCESS_ERRORS }),
  binding({ state: 'demotions_reconciled', adapter: 'apply_safe_demotions_v2', parent: 'ended_reanalyzed', kind: 'supabase_rpc', component: 'apply_psdeals_ended_deals_v2', timeout_ms: 120000, idempotency: 'demotion-apply:<remote_cycle_id>:<candidate-set-hash>', receipt: 'demotion_apply', reconciliation: 'read_committed_exact_candidate_set_receipt_and_cycle', errors: REMOTE_ERRORS }),
  binding({ state: 'candidates_prepared', adapter: 'prepare_candidates', parent: 'demotions_reconciled', kind: 'local_module', component: 'scripts/lib/psdeals-certification-evidence.mjs', timeout_ms: 120000, idempotency: 'candidates:<remote_cycle_id>:<evidence-chain-hash>', receipt: 'candidate_set', reconciliation: 'recompute_from_verified_cycle_evidence', errors: LOCAL_ERRORS }),
  binding({ state: 'certification_reconciled', adapter: 'certify_candidates_v3', parent: 'candidates_prepared', kind: 'supabase_rpc', component: 'mark_psdeals_price_refresh_cycle_succeeded_v1 -> certify_price_refresh_cycle_v3', timeout_ms: 240000, idempotency: 'mark-and-certify:<remote_cycle_id>:<candidate-set-hash>', receipt: 'mark_succeeded_plus_certify', reconciliation: 'read_committed_mark_and_certify_receipts_and_cycle_status', errors: REMOTE_ERRORS }),
  binding({ state: 'minima_reconciled', adapter: 'apply_compact_minima', parent: 'certification_reconciled', kind: 'receipt_result', component: 'scripts/lib/psdeals-compact-minima.mjs -> certify_price_refresh_cycle_v3', timeout_ms: 120000, idempotency: 'minima:<certification-receipt-id>', receipt: 'certification_minima_result', reconciliation: 'verify_minima_counts_from_committed_certification_receipt', errors: LOCAL_ERRORS }),
  binding({ state: 'cache_reconciled', adapter: 'refresh_cache_v16', parent: 'minima_reconciled', kind: 'supabase_rpc', component: 'refresh_catalog_public_cache_v16', timeout_ms: 120000, idempotency: 'cache-refresh:<remote_cycle_id>:<certification-receipt-id>', receipt: 'cache_refresh', reconciliation: 'read_committed_cache_receipt_cycle_and_cache_timestamp', errors: REMOTE_ERRORS }),
  binding({ state: 'final_postchecks_passed', adapter: 'run_final_postchecks', parent: 'cache_reconciled', kind: 'read_only_evidence', component: 'scripts/lib/psdeals-public-validation.mjs', timeout_ms: 120000, idempotency: 'read-only:<remote_cycle_id>:<cache-receipt-id>', receipt: 'cycle_public_postcheck', reconciliation: 'repeat_bounded_read_only_postchecks', errors: LOCAL_ERRORS }),
  binding({ state: 'succeeded', adapter: 'finalize_or_reconcile_cycle', parent: 'final_postchecks_passed', kind: 'local_module', component: 'scripts/lib/psdeals-cycle-workspace.mjs', timeout_ms: 120000, idempotency: 'manifest:<remote_cycle_id>:<evidence-chain-hash>', receipt: 'final_manifest', reconciliation: 'verify_existing_manifest_hash_before_noop', errors: LOCAL_ERRORS }),
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
