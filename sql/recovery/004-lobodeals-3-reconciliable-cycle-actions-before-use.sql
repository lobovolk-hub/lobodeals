-- LoboDeals 3.0
-- Manual recovery for migration 004 before any operational use.
--
-- Source migration SHA-256:
-- 712af68ff12934f7f3f7648b6e629e84610e576fbc4d044ccf74a8bd18630dbf
--
-- This file is not a normal migration and must never run automatically.
-- It is intentionally unauthorized for execution. A future operator must first
-- obtain separate authorization and prove that cycles and receipts remain empty.
-- After any operational use, preserve the evidence and correct forward instead.
-- Migration-history reconciliation is a separate control-plane procedure and is
-- deliberately absent from this SQL file.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

lock table public.price_refresh_cycles in access exclusive mode;

do $recovery_presence$
begin
  if to_regclass('public.psdeals_cycle_action_receipts') is null then
    raise exception 'PSDEALS_004_RECOVERY_NOT_APPLIED';
  end if;
end;
$recovery_presence$;

lock table public.psdeals_cycle_action_receipts in access exclusive mode;

do $recovery_preflight$
declare
  cycle_count bigint;
  receipt_count bigint;
  cycle_column_count integer;
  cycle_constraint_count integer;
  cycle_index_count integer;
  receipt_column_count integer;
  receipt_constraint_count integer;
  receipt_index_count integer;
  function_contract_count integer;
  certify_sha256 text;
  cache_sha256 text;
begin
  select count(*) into cycle_count from public.price_refresh_cycles;
  if cycle_count <> 0 then
    raise exception 'PSDEALS_004_RECOVERY_CYCLES_PRESENT';
  end if;

  select count(*) into receipt_count from public.psdeals_cycle_action_receipts;
  if receipt_count <> 0 then
    raise exception 'PSDEALS_004_RECOVERY_RECEIPTS_PRESENT';
  end if;

  select count(*)::integer
  into cycle_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'price_refresh_cycles'
    and column_name in (
      'local_cycle_id',
      'run_token_sha256',
      'code_revision',
      'filter_fingerprint',
      'manifest_hash',
      'mode',
      'listing_complete',
      'cache_refreshed_at',
      'public_validation_completed_at',
      'metrics_recorded_at'
    );
  if cycle_column_count <> 10 then
    raise exception 'PSDEALS_004_RECOVERY_CYCLE_COLUMNS_INCOMPATIBLE';
  end if;

  select count(*)::integer
  into cycle_constraint_count
  from pg_catalog.pg_constraint
  where conrelid = 'public.price_refresh_cycles'::regclass
    and conname in (
      'price_refresh_cycles_local_cycle_id_check',
      'price_refresh_cycles_run_token_sha256_check',
      'price_refresh_cycles_code_revision_check',
      'price_refresh_cycles_filter_fingerprint_check',
      'price_refresh_cycles_manifest_hash_check',
      'price_refresh_cycles_mode_check',
      'price_refresh_cycles_scope_check',
      'price_refresh_cycles_listing_complete_check',
      'price_refresh_cycles_operational_timestamps_check'
    );
  if cycle_constraint_count <> 9 then
    raise exception 'PSDEALS_004_RECOVERY_CYCLE_CONSTRAINTS_INCOMPATIBLE';
  end if;

  select count(*)::integer
  into cycle_index_count
  from pg_catalog.pg_indexes
  where schemaname = 'public'
    and tablename = 'price_refresh_cycles'
    and indexname in (
      'price_refresh_cycles_local_cycle_id_unique_idx',
      'price_refresh_cycles_run_token_sha256_unique_idx',
      'price_refresh_cycles_local_identity_unique_idx'
    );
  if cycle_index_count <> 3 then
    raise exception 'PSDEALS_004_RECOVERY_CYCLE_INDEXES_INCOMPATIBLE';
  end if;

  select count(*)::integer
  into receipt_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'psdeals_cycle_action_receipts'
    and column_name in (
      'id', 'cycle_id', 'parent_receipt_id', 'action_kind',
      'idempotency_key', 'attempt', 'request_hash', 'input_artifact_hash',
      'status', 'started_at', 'finished_at', 'affected_rows', 'result',
      'error_code', 'created_at', 'updated_at'
    );
  if receipt_column_count <> 16 then
    raise exception 'PSDEALS_004_RECOVERY_RECEIPT_COLUMNS_INCOMPATIBLE';
  end if;

  select count(*)::integer
  into receipt_constraint_count
  from pg_catalog.pg_constraint
  where conrelid = 'public.psdeals_cycle_action_receipts'::regclass
    and conname in (
      'psdeals_cycle_action_receipts_pkey',
      'psdeals_cycle_action_receipts_cycle_fkey',
      'psdeals_cycle_action_receipts_parent_fkey',
      'psdeals_cycle_action_receipts_kind_check',
      'psdeals_cycle_action_receipts_key_check',
      'psdeals_cycle_action_receipts_attempt_check',
      'psdeals_cycle_action_receipts_request_hash_check',
      'psdeals_cycle_action_receipts_input_hash_check',
      'psdeals_cycle_action_receipts_status_check',
      'psdeals_cycle_action_receipts_timestamps_check',
      'psdeals_cycle_action_receipts_counts_check',
      'psdeals_cycle_action_receipts_result_check',
      'psdeals_cycle_action_receipts_error_check',
      'psdeals_cycle_action_receipts_idempotency_unique'
    );
  if receipt_constraint_count <> 14 then
    raise exception 'PSDEALS_004_RECOVERY_RECEIPT_CONSTRAINTS_INCOMPATIBLE';
  end if;

  select count(*)::integer
  into receipt_index_count
  from pg_catalog.pg_indexes
  where schemaname = 'public'
    and tablename = 'psdeals_cycle_action_receipts'
    and indexname in (
      'psdeals_cycle_action_receipts_pkey',
      'psdeals_cycle_action_receipts_idempotency_unique',
      'psdeals_cycle_action_receipts_cycle_kind_status_idx',
      'psdeals_cycle_action_receipts_parent_idx'
    );
  if receipt_index_count <> 4 then
    raise exception 'PSDEALS_004_RECOVERY_RECEIPT_INDEXES_INCOMPATIBLE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    where relation.oid = 'public.psdeals_cycle_action_receipts'::regclass
      and relation.relkind = 'r'
      and relation.relrowsecurity = true
  ) then
    raise exception 'PSDEALS_004_RECOVERY_RECEIPT_RLS_INCOMPATIBLE';
  end if;

  if to_regprocedure('public._begin_psdeals_cycle_action_v1(uuid,uuid,text,text,integer,text,text,timestamptz)') is null
    or to_regprocedure('public._finish_psdeals_cycle_action_v1(uuid,uuid,text,text,text,timestamptz,integer,jsonb,text)') is null
    or to_regprocedure('public.begin_psdeals_cycle_action_v1(uuid,uuid,text,text,integer,text,text,timestamptz)') is null
    or to_regprocedure('public.finish_psdeals_cycle_action_v1(uuid,uuid,text,text,text,timestamptz,integer,jsonb,text)') is null
    or to_regprocedure('public.protect_price_refresh_cycle_identity_v1()') is null
    or to_regprocedure('public.create_or_reconcile_price_refresh_cycle_v1(text,text,text,text,text,text,text,text,date,timestamptz,text,text)') is null
    or to_regprocedure('public.record_psdeals_listing_completion_v1(uuid,text,text,text,text,timestamptz,integer,integer,integer,boolean,boolean,timestamptz,timestamptz)') is null
    or to_regprocedure('public.record_psdeals_monthly_check_v1(uuid,text,text,timestamptz,text,text,text,text,text,text,integer,boolean,timestamptz,timestamptz)') is null
    or to_regprocedure('public.apply_psdeals_ended_deals_v1(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamptz)') is null
    or to_regprocedure('public.mark_psdeals_price_refresh_cycle_succeeded_v1(uuid,uuid,uuid[],text,text,text,timestamptz,timestamptz,timestamptz,integer,integer,integer,jsonb)') is null
    or to_regprocedure('public.certify_price_refresh_cycle_v2(uuid,uuid,text,text,timestamptz)') is null
    or to_regprocedure('public.refresh_catalog_public_cache_v16(uuid,uuid,text,text,timestamptz)') is null then
    raise exception 'PSDEALS_004_RECOVERY_FUNCTION_SIGNATURE_INCOMPATIBLE';
  end if;

  select count(*)::integer
  into function_contract_count
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in (
      '_begin_psdeals_cycle_action_v1',
      '_finish_psdeals_cycle_action_v1',
      'begin_psdeals_cycle_action_v1',
      'finish_psdeals_cycle_action_v1',
      'protect_price_refresh_cycle_identity_v1',
      'create_or_reconcile_price_refresh_cycle_v1',
      'record_psdeals_listing_completion_v1',
      'record_psdeals_monthly_check_v1',
      'apply_psdeals_ended_deals_v1',
      'mark_psdeals_price_refresh_cycle_succeeded_v1',
      'certify_price_refresh_cycle_v2',
      'refresh_catalog_public_cache_v16'
    )
    and pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
    and (
      (procedure.proname = 'protect_price_refresh_cycle_identity_v1' and procedure.prosecdef = false)
      or (procedure.proname <> 'protect_price_refresh_cycle_identity_v1' and procedure.prosecdef = true)
    )
    and exists (
      select 1
      from unnest(coalesce(procedure.proconfig, '{}'::text[])) as setting(value)
      where split_part(setting.value, '=', 1) = 'search_path'
        and replace(split_part(setting.value, '=', 2), '"', '') = ''
    );
  if function_contract_count <> 12 then
    raise exception 'PSDEALS_004_RECOVERY_FUNCTION_SECURITY_INCOMPATIBLE';
  end if;

  if to_regprocedure('public.protect_price_refresh_cycle_identity_v1()') is null
    or not exists (
      select 1
      from pg_catalog.pg_trigger
      where tgrelid = 'public.price_refresh_cycles'::regclass
        and tgname = 'trg_price_refresh_cycles_protect_identity_v1'
        and tgenabled <> 'D'
    )
    or not exists (
      select 1
      from pg_catalog.pg_trigger
      where tgrelid = 'public.psdeals_cycle_action_receipts'::regclass
        and tgname = 'trg_psdeals_cycle_action_receipts_set_updated_at'
        and tgenabled <> 'D'
    ) then
    raise exception 'PSDEALS_004_RECOVERY_TRIGGER_INCOMPATIBLE';
  end if;

  if pg_catalog.has_table_privilege('service_role', 'public.psdeals_cycle_action_receipts', 'SELECT') is distinct from true
    or pg_catalog.has_table_privilege('service_role', 'public.psdeals_cycle_action_receipts', 'INSERT') is true
    or pg_catalog.has_table_privilege('service_role', 'public.psdeals_cycle_action_receipts', 'UPDATE') is true
    or pg_catalog.has_table_privilege('service_role', 'public.psdeals_cycle_action_receipts', 'DELETE') is true
    or pg_catalog.has_table_privilege('anon', 'public.psdeals_cycle_action_receipts', 'SELECT') is true
    or pg_catalog.has_table_privilege('anon', 'public.psdeals_cycle_action_receipts', 'INSERT') is true
    or pg_catalog.has_table_privilege('anon', 'public.psdeals_cycle_action_receipts', 'UPDATE') is true
    or pg_catalog.has_table_privilege('anon', 'public.psdeals_cycle_action_receipts', 'DELETE') is true
    or pg_catalog.has_table_privilege('authenticated', 'public.psdeals_cycle_action_receipts', 'SELECT') is true
    or pg_catalog.has_table_privilege('authenticated', 'public.psdeals_cycle_action_receipts', 'INSERT') is true
    or pg_catalog.has_table_privilege('authenticated', 'public.psdeals_cycle_action_receipts', 'UPDATE') is true
    or pg_catalog.has_table_privilege('authenticated', 'public.psdeals_cycle_action_receipts', 'DELETE') is true then
    raise exception 'PSDEALS_004_RECOVERY_RECEIPT_GRANTS_INCOMPATIBLE';
  end if;

  if pg_catalog.has_function_privilege('service_role', 'public.certify_price_refresh_cycle(uuid)', 'EXECUTE') is true
    or pg_catalog.has_function_privilege('service_role', 'public.refresh_catalog_public_cache_v15()', 'EXECUTE') is true
    or pg_catalog.has_function_privilege('anon', 'public.certify_price_refresh_cycle(uuid)', 'EXECUTE') is true
    or pg_catalog.has_function_privilege('authenticated', 'public.certify_price_refresh_cycle(uuid)', 'EXECUTE') is true
    or pg_catalog.has_function_privilege('anon', 'public.refresh_catalog_public_cache_v15()', 'EXECUTE') is true
    or pg_catalog.has_function_privilege('authenticated', 'public.refresh_catalog_public_cache_v15()', 'EXECUTE') is true then
    raise exception 'PSDEALS_004_RECOVERY_LEGACY_GRANTS_INCOMPATIBLE';
  end if;

  select pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(
      to_regprocedure('public.certify_price_refresh_cycle(uuid)')
    ), 'UTF8')), 'hex'
  ) into certify_sha256;
  if certify_sha256 <> '3dfa2232903c014039f070f48d4044ffe0b329e38cb86615b9bdbc20c4f9aa88' then
    raise exception 'PSDEALS_004_RECOVERY_CERTIFY_V1_CHANGED';
  end if;

  select pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(
      to_regprocedure('public.refresh_catalog_public_cache_v15()')
    ), 'UTF8')), 'hex'
  ) into cache_sha256;
  if cache_sha256 <> '1c6e71d26e6554e6f8fdf2e6ed0388db959419db4ee64132d8ddd5761b3996dc' then
    raise exception 'PSDEALS_004_RECOVERY_CACHE_V15_CHANGED';
  end if;
end;
$recovery_preflight$;

-- Containment first: remove every new callable entrypoint from non-owner roles.
revoke all on function public.begin_psdeals_cycle_action_v1(
  uuid, uuid, text, text, integer, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.finish_psdeals_cycle_action_v1(
  uuid, uuid, text, text, text, timestamptz, integer, jsonb, text
) from public, anon, authenticated, service_role;
revoke all on function public.create_or_reconcile_price_refresh_cycle_v1(
  text, text, text, text, text, text, text, text, date, timestamptz, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.record_psdeals_listing_completion_v1(
  uuid, text, text, text, text, timestamptz, integer, integer, integer,
  boolean, boolean, timestamptz, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.record_psdeals_monthly_check_v1(
  uuid, text, text, timestamptz, text, text, text, text, text, text,
  integer, boolean, timestamptz, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.apply_psdeals_ended_deals_v1(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.mark_psdeals_price_refresh_cycle_succeeded_v1(
  uuid, uuid, uuid[], text, text, text, timestamptz, timestamptz,
  timestamptz, integer, integer, integer, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.certify_price_refresh_cycle_v2(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.refresh_catalog_public_cache_v16(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated, service_role;

drop trigger trg_psdeals_cycle_action_receipts_set_updated_at
  on public.psdeals_cycle_action_receipts;
drop trigger trg_price_refresh_cycles_protect_identity_v1
  on public.price_refresh_cycles;

drop function public.refresh_catalog_public_cache_v16(
  uuid, uuid, text, text, timestamptz
);
drop function public.certify_price_refresh_cycle_v2(
  uuid, uuid, text, text, timestamptz
);
drop function public.mark_psdeals_price_refresh_cycle_succeeded_v1(
  uuid, uuid, uuid[], text, text, text, timestamptz, timestamptz,
  timestamptz, integer, integer, integer, jsonb
);
drop function public.apply_psdeals_ended_deals_v1(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
);
drop function public.record_psdeals_monthly_check_v1(
  uuid, text, text, timestamptz, text, text, text, text, text, text,
  integer, boolean, timestamptz, timestamptz
);
drop function public.record_psdeals_listing_completion_v1(
  uuid, text, text, text, text, timestamptz, integer, integer, integer,
  boolean, boolean, timestamptz, timestamptz
);
drop function public.create_or_reconcile_price_refresh_cycle_v1(
  text, text, text, text, text, text, text, text, date, timestamptz, text, text
);
drop function public.finish_psdeals_cycle_action_v1(
  uuid, uuid, text, text, text, timestamptz, integer, jsonb, text
);
drop function public.begin_psdeals_cycle_action_v1(
  uuid, uuid, text, text, integer, text, text, timestamptz
);
drop function public.protect_price_refresh_cycle_identity_v1();
drop function public._finish_psdeals_cycle_action_v1(
  uuid, uuid, text, text, text, timestamptz, integer, jsonb, text
);
drop function public._begin_psdeals_cycle_action_v1(
  uuid, uuid, text, text, integer, text, text, timestamptz
);

drop table public.psdeals_cycle_action_receipts;

drop index public.price_refresh_cycles_local_identity_unique_idx;
drop index public.price_refresh_cycles_run_token_sha256_unique_idx;
drop index public.price_refresh_cycles_local_cycle_id_unique_idx;

alter table public.price_refresh_cycles
  drop constraint price_refresh_cycles_operational_timestamps_check,
  drop constraint price_refresh_cycles_listing_complete_check,
  drop constraint price_refresh_cycles_scope_check,
  drop constraint price_refresh_cycles_mode_check,
  drop constraint price_refresh_cycles_manifest_hash_check,
  drop constraint price_refresh_cycles_filter_fingerprint_check,
  drop constraint price_refresh_cycles_code_revision_check,
  drop constraint price_refresh_cycles_run_token_sha256_check,
  drop constraint price_refresh_cycles_local_cycle_id_check;

alter table public.price_refresh_cycles
  drop column metrics_recorded_at,
  drop column public_validation_completed_at,
  drop column cache_refreshed_at,
  drop column listing_complete,
  drop column mode,
  drop column manifest_hash,
  drop column filter_fingerprint,
  drop column code_revision,
  drop column run_token_sha256,
  drop column local_cycle_id;

-- Restore the exact captured pre-004 execute behavior of the two legacy RPCs.
revoke all on function public.certify_price_refresh_cycle(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.certify_price_refresh_cycle(uuid)
  to service_role, postgres;

grant execute on function public.refresh_catalog_public_cache_v15()
  to public, anon, authenticated, service_role, postgres;

do $recovery_postcheck$
declare
  cycle_count bigint;
  residual_column_count integer;
  residual_function_count integer;
  certify_sha256 text;
  cache_sha256 text;
begin
  select count(*) into cycle_count from public.price_refresh_cycles;
  if cycle_count <> 0 then
    raise exception 'PSDEALS_004_RECOVERY_POSTCHECK_CYCLES_PRESENT';
  end if;

  if to_regclass('public.psdeals_cycle_action_receipts') is not null then
    raise exception 'PSDEALS_004_RECOVERY_POSTCHECK_RECEIPT_TABLE_PRESENT';
  end if;

  select count(*)::integer
  into residual_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'price_refresh_cycles'
    and column_name in (
      'local_cycle_id', 'run_token_sha256', 'code_revision',
      'filter_fingerprint', 'manifest_hash', 'mode', 'listing_complete',
      'cache_refreshed_at', 'public_validation_completed_at', 'metrics_recorded_at'
    );
  if residual_column_count <> 0 then
    raise exception 'PSDEALS_004_RECOVERY_POSTCHECK_COLUMNS_PRESENT';
  end if;

  select count(*)::integer
  into residual_function_count
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in (
      '_begin_psdeals_cycle_action_v1',
      '_finish_psdeals_cycle_action_v1',
      'begin_psdeals_cycle_action_v1',
      'finish_psdeals_cycle_action_v1',
      'protect_price_refresh_cycle_identity_v1',
      'create_or_reconcile_price_refresh_cycle_v1',
      'record_psdeals_listing_completion_v1',
      'record_psdeals_monthly_check_v1',
      'apply_psdeals_ended_deals_v1',
      'mark_psdeals_price_refresh_cycle_succeeded_v1',
      'certify_price_refresh_cycle_v2',
      'refresh_catalog_public_cache_v16'
    );
  if residual_function_count <> 0 then
    raise exception 'PSDEALS_004_RECOVERY_POSTCHECK_FUNCTIONS_PRESENT';
  end if;

  select pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(
      to_regprocedure('public.certify_price_refresh_cycle(uuid)')
    ), 'UTF8')), 'hex'
  ) into certify_sha256;
  select pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(
      to_regprocedure('public.refresh_catalog_public_cache_v15()')
    ), 'UTF8')), 'hex'
  ) into cache_sha256;

  if certify_sha256 <> '3dfa2232903c014039f070f48d4044ffe0b329e38cb86615b9bdbc20c4f9aa88'
    or cache_sha256 <> '1c6e71d26e6554e6f8fdf2e6ed0388db959419db4ee64132d8ddd5761b3996dc' then
    raise exception 'PSDEALS_004_RECOVERY_POSTCHECK_LEGACY_FUNCTION_CHANGED';
  end if;

  if pg_catalog.has_function_privilege('service_role', 'public.certify_price_refresh_cycle(uuid)', 'EXECUTE') is distinct from true
    or pg_catalog.has_function_privilege('anon', 'public.certify_price_refresh_cycle(uuid)', 'EXECUTE') is true
    or pg_catalog.has_function_privilege('authenticated', 'public.certify_price_refresh_cycle(uuid)', 'EXECUTE') is true
    or pg_catalog.has_function_privilege('service_role', 'public.refresh_catalog_public_cache_v15()', 'EXECUTE') is distinct from true
    or pg_catalog.has_function_privilege('anon', 'public.refresh_catalog_public_cache_v15()', 'EXECUTE') is distinct from true
    or pg_catalog.has_function_privilege('authenticated', 'public.refresh_catalog_public_cache_v15()', 'EXECUTE') is distinct from true then
    raise exception 'PSDEALS_004_RECOVERY_POSTCHECK_LEGACY_GRANTS_INCOMPATIBLE';
  end if;
end;
$recovery_postcheck$;

commit;
