-- Remove the superseded non-user catalog, pricing, ingestion, and PSDeals
-- backend. The Directory/Sales backend and managed platform schemas are out of
-- scope for this migration.

-- Trigger producers and shared trigger consumers must be detached first.
drop trigger set_catalog_public_cache_sort_keys_trigger on public.catalog_public_cache;
drop trigger trg_metacritic_queue_set_updated_at on public.metacritic_queue;
drop trigger trg_price_offer_queue_set_updated_at on public.price_offer_queue;
drop trigger trg_price_refresh_cycles_protect_identity_v1 on public.price_refresh_cycles;
drop trigger trg_price_refresh_cycles_set_updated_at on public.price_refresh_cycles;
drop trigger trg_ps_discovery_progress_set_updated_at on public.ps_discovery_progress;
drop trigger trg_ps_ingest_queue_set_updated_at on public.ps_ingest_queue;
drop trigger trg_psdeals_cycle_action_receipts_set_updated_at on public.psdeals_cycle_action_receipts;
drop trigger trg_psdeals_import_runs_set_updated_at on public.psdeals_import_runs;
drop trigger trg_psdeals_stage_items_set_updated_at on public.psdeals_stage_items;

-- These table constraints depend directly on the legacy hash functions.
alter table public.psdeals_stage_items
  drop constraint psdeals_stage_items_regular_certification_pair_check;
alter table public.psdeals_stage_items
  drop constraint psdeals_stage_items_ps_plus_certification_pair_check;
alter table public.psdeals_stage_items
  drop constraint psdeals_stage_items_monthly_regular_candidate_check;

-- Exact identities are intentionally used so overload or signature drift fails
-- the migration instead of deleting an unexpected routine.
drop function public._begin_psdeals_cycle_action_v1(p_cycle_id uuid, p_parent_receipt_id uuid, p_action_kind text, p_idempotency_key text, p_attempt integer, p_request_hash text, p_input_artifact_hash text, p_started_at timestamp with time zone);
drop function public._finish_psdeals_cycle_action_v1(p_receipt_id uuid, p_cycle_id uuid, p_idempotency_key text, p_request_hash text, p_status text, p_finished_at timestamp with time zone, p_affected_rows integer, p_result jsonb, p_error_code text);
drop function public._psdeals_certification_candidate_sha256_v1(p_candidate jsonb);
drop function public._psdeals_monthly_regular_candidate_sha256_v1(p_candidate jsonb);
drop function public.apply_ps_plus_monthly_games_v1(p_idempotency_key text, p_request_hash text, p_evidence_hash text, p_month_key text, p_source_url text, p_active_from date, p_active_until date, p_entries jsonb, p_applied_at timestamp with time zone);
drop function public.apply_psdeals_ended_deals_v1(p_cycle_id uuid, p_ended_analysis_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_listing_artifact_hash text, p_analysis_evidence_hash text, p_candidate_set_hash text, p_candidate_psdeals_ids bigint[], p_expected_count integer, p_applied_at timestamp with time zone);
drop function public.apply_psdeals_ended_deals_v2(p_cycle_id uuid, p_ended_analysis_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_listing_artifact_hash text, p_analysis_evidence_hash text, p_candidate_set_hash text, p_candidate_psdeals_ids bigint[], p_expected_count integer, p_applied_at timestamp with time zone);
drop function public.apply_psdeals_ended_deals_v3(p_cycle_id uuid, p_ended_analysis_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_listing_artifact_hash text, p_analysis_evidence_hash text, p_candidate_set_hash text, p_candidate_psdeals_ids bigint[], p_expected_count integer, p_applied_at timestamp with time zone);
drop function public.apply_psdeals_ended_deals_v4(p_cycle_id uuid, p_ended_analysis_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_listing_artifact_hash text, p_analysis_evidence_hash text, p_candidate_set_hash text, p_candidate_psdeals_ids bigint[], p_expected_count integer, p_applied_at timestamp with time zone);
drop function public.begin_psdeals_cycle_action_v1(p_cycle_id uuid, p_parent_receipt_id uuid, p_action_kind text, p_idempotency_key text, p_attempt integer, p_request_hash text, p_input_artifact_hash text, p_started_at timestamp with time zone);
drop function public.catalog_search_compact(value text);
drop function public.catalog_search_normalize(value text);
drop function public.certify_price_refresh_cycle(p_cycle_id uuid);
drop function public.certify_price_refresh_cycle_v2(p_cycle_id uuid, p_mark_succeeded_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_started_at timestamp with time zone);
drop function public.certify_price_refresh_cycle_v3(p_cycle_id uuid, p_mark_succeeded_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_started_at timestamp with time zone);
drop function public.certify_price_refresh_cycle_v4(p_cycle_id uuid, p_mark_succeeded_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_started_at timestamp with time zone);
drop function public.certify_price_refresh_cycle_v5(p_cycle_id uuid, p_mark_succeeded_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_started_at timestamp with time zone);
drop function public.claim_ps_ingest_queue_items(p_limit integer, p_run_id uuid);
drop function public.create_or_reconcile_price_refresh_cycle_v1(p_local_cycle_id text, p_run_token_sha256 text, p_code_revision text, p_filter_fingerprint text, p_manifest_hash text, p_mode text, p_region_code text, p_storefront text, p_cycle_date date, p_started_at timestamp with time zone, p_idempotency_key text, p_request_hash text);
drop function public.enqueue_lobodeals_catalog_cache_refresh_v18(p_cycle_id uuid, p_certification_receipt_id uuid, p_cache_idempotency_key text, p_cache_request_hash text, p_cache_started_at timestamp with time zone);
drop function public.enqueue_lobodeals_ended_demotion_v5(p_cycle_id uuid, p_ended_analysis_receipt_id uuid, p_demotion_idempotency_key text, p_demotion_request_hash text, p_listing_artifact_hash text, p_analysis_evidence_hash text, p_candidate_set_hash text, p_candidate_psdeals_ids bigint[], p_expected_count integer, p_applied_at timestamp with time zone);
drop function public.finish_psdeals_cycle_action_v1(p_receipt_id uuid, p_cycle_id uuid, p_idempotency_key text, p_request_hash text, p_status text, p_finished_at timestamp with time zone, p_affected_rows integer, p_result jsonb, p_error_code text);
drop function public.finish_psdeals_ended_analysis_v2(p_receipt_id uuid, p_cycle_id uuid, p_idempotency_key text, p_request_hash text, p_status text, p_finished_at timestamp with time zone, p_affected_rows integer, p_result jsonb, p_error_code text);
drop function public.get_lobodeals_catalog_cache_refresh_v18(p_job_id uuid);
drop function public.get_lobodeals_ended_demotion_v5(p_job_id uuid);
drop function public.lobodeals_daily_runner_v21_preflight();
drop function public.lobodeals_daily_runner_v22_preflight();
drop function public.lobodeals_daily_runner_v23_preflight();
drop function public.lobodeals_daily_runner_v24_preflight();
drop function public.lobodeals_daily_runner_v25_preflight();
drop function public.lobodeals_daily_runner_v2_preflight();
drop function public.mark_psdeals_price_refresh_cycle_succeeded_v1(p_cycle_id uuid, p_demotion_receipt_id uuid, p_required_receipt_ids uuid[], p_idempotency_key text, p_request_hash text, p_manifest_hash text, p_details_completed_at timestamp with time zone, p_validation_completed_at timestamp with time zone, p_finished_at timestamp with time zone, p_items_updated integer, p_items_failed integer, p_new_items_detected integer, p_metrics jsonb);
drop function public.protect_price_refresh_cycle_identity_v1();
drop function public.record_psdeals_listing_completion_v1(p_cycle_id uuid, p_idempotency_key text, p_request_hash text, p_listing_artifact_hash text, p_filter_fingerprint text, p_listing_observed_at timestamp with time zone, p_items_seen integer, p_pages_failed integer, p_duplicate_ids integer, p_is_partial boolean, p_termination_observed boolean, p_started_at timestamp with time zone, p_finished_at timestamp with time zone);
drop function public.record_psdeals_monthly_check_v1(p_cycle_id uuid, p_idempotency_key text, p_request_hash text, p_checked_at timestamp with time zone, p_source_type text, p_source_reference text, p_procedure text, p_procedure_version text, p_evidence_hash text, p_result text, p_proposed_changes_count integer, p_application_performed boolean, p_started_at timestamp with time zone, p_finished_at timestamp with time zone);
drop function public.refresh_catalog_public_cache_v15();
drop function public.refresh_catalog_public_cache_v16(p_cycle_id uuid, p_certification_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_started_at timestamp with time zone);
drop function public.refresh_catalog_public_cache_v17(p_cycle_id uuid, p_certification_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_started_at timestamp with time zone);
drop function public.refresh_catalog_public_cache_v19(p_cycle_id uuid, p_certification_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_started_at timestamp with time zone);
drop function public.run_lobodeals_catalog_cache_refresh_v18(p_job_id uuid);
drop function public.run_lobodeals_ended_demotion_v5(p_job_id uuid);
drop function public.search_catalog_public_cache(p_q text, p_tab text, p_letter text, p_sort text, p_limit integer, p_offset integer);
drop function public.search_catalog_public_cache_v2(p_q text, p_tab text, p_letter text, p_sort text, p_limit integer, p_offset integer);
drop function public.set_catalog_public_cache_sort_keys();

-- Child tables precede their FK parents. Standalone relations follow after the
-- dependency graph has been removed.
drop table public.lobodeals_async_cache_jobs;
drop table public.lobodeals_async_demotion_jobs;
drop table public.catalog_public_cache;
drop table public.psdeals_stage_relations;
drop table public.ps_plus_monthly_games;
drop table public.psdeals_stage_items;
drop table public.psdeals_cycle_action_receipts;
drop table public.price_refresh_cycles;
drop table public.official_ps_store_deals;
drop table public.automation_runs;
drop table public.ps_ingest_queue;
drop table public.metacritic_queue;
drop table public.price_offer_queue;
drop table public.ps_discovery_progress;
drop table public.ps_plus_monthly_game_apply_receipts;
drop table public.psdeals_import_runs;

-- All consumers were on the removed legacy tables.
drop function public.set_updated_at();

-- These extensions had no consumers outside the removed backend. Dependency
-- propagation is not used, so any unexpected consumer aborts the transaction.
drop extension pg_trgm;
drop extension unaccent;
drop extension "uuid-ossp";
