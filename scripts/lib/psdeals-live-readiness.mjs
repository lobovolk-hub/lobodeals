import { PSDEALS_OPERATIONAL_STAGE_PERMISSIONS } from './psdeals-operational-authorization.mjs'

export function evaluatePsdealsControlledLiveReadiness({
  preflight,
  lifecycle_contracts,
  producer_specs_ready = false,
  wrapper_ready = false,
  operational_adapters_connected = false,
  monthly_source_authorized = false,
  public_validation_ready = false,
} = {}) {
  const blockers = []
  if (!preflight?.valid || !preflight?.read_only_verified) blockers.push('remote_preflight_invalid_or_not_read_only')
  blockers.push(...(preflight?.blockers || []).map((entry) => entry.code))
  if (!lifecycle_contracts?.mark_succeeded?.ready) blockers.push('mark_succeeded_contract_not_ready')
  if (!lifecycle_contracts?.certify?.ready) blockers.push('certification_contract_not_ready')
  if (!lifecycle_contracts?.refresh_cache?.ready) blockers.push('cache_reconciliation_contract_not_ready')
  if (!lifecycle_contracts?.apply_demotion?.ready) blockers.push('demotion_reconciliation_contract_not_ready')
  if (!producer_specs_ready) blockers.push('producer_process_specs_not_ready')
  if (!wrapper_ready) blockers.push('powershell_wrapper_not_ready')
  if (!operational_adapters_connected) blockers.push('operational_adapters_not_connected')
  if (!monthly_source_authorized) blockers.push('monthly_source_not_authorized')
  if (!public_validation_ready) blockers.push('public_validation_not_ready')
  const uniqueBlockers = [...new Set(blockers)]
  return {
    readiness_version: 1,
    classification: uniqueBlockers.length === 0
      ? 'READY_FOR_CONTROLLED_LIVE_CYCLE'
      : preflight?.valid
        ? 'NOT_READY'
        : 'INDETERMINATE',
    ready: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    required_future_authorizations: Object.values(PSDEALS_OPERATIONAL_STAGE_PERMISSIONS),
    future_external_effects: [
      'create one remote price_refresh_cycles row',
      'open Edge and read PSDeals listing pages',
      'upsert safe listing-owned fields in psdeals_stage_items',
      'read and update selected detail rows and psdeals_import_runs',
      'record an authorized monthly-games review',
      'apply exact ended-deal demotions only if separately authorized',
      'mark one cycle succeeded',
      'invoke certify_price_refresh_cycle(uuid) once',
      'invoke refresh_catalog_public_cache_v15() once',
      'read public LoboDeals pages for validation',
    ],
    stop_conditions: [
      'listing incomplete, partial, failed page, or altered hash',
      'any detail failure remains after one bounded retry',
      'monthly review is missing, indeterminate, or proposes unapplied changes',
      'ended-deal evidence is missing or cannot be reconciled exactly',
      'remote cycle state differs from the local manifest',
      'any authorization is absent, expired, ambiguous, or from another cycle',
      'any write or RPC has an ambiguous result that cannot be reconciled',
      'public validation fails',
    ],
    recovery_policy: [
      'preserve workspace, ledger, receipts, and all evidence',
      'never repeat a write or RPC after an ambiguous timeout without read reconciliation',
      'resume only the first incomplete stage with the exact same inputs',
      'do not certify, demote, or refresh cache while any gate is closed',
    ],
    authorizes_execution: false,
  }
}
