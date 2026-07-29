-- LoboDeals 3.0
-- Reconciliable operational identity, action receipts, and lifecycle RPCs.
--
-- This migration is intentionally fail-closed. It may be applied only while
-- public.price_refresh_cycles is still empty and while the two lifecycle
-- functions audited on 2026-07-29 retain their exact verified definitions.
-- It preserves the v15 cache function and the original certification RPC.
-- It does not change or remove the detailed price history.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

lock table public.price_refresh_cycles in access exclusive mode;

do $preflight$
declare
  cycle_count bigint;
  certify_sha256 text;
  cache_sha256 text;
  required_cycle_columns integer;
  required_stage_columns integer;
begin
  if to_regclass('public.price_refresh_cycles') is null then
    raise exception 'Required table public.price_refresh_cycles does not exist.';
  end if;

  if to_regclass('public.psdeals_stage_items') is null then
    raise exception 'Required table public.psdeals_stage_items does not exist.';
  end if;

  if to_regclass('public.psdeals_cycle_action_receipts') is not null then
    raise exception 'public.psdeals_cycle_action_receipts already exists.';
  end if;

  select count(*)
  into required_cycle_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'price_refresh_cycles'
    and column_name in (
      'id',
      'region_code',
      'storefront',
      'cycle_date',
      'status',
      'listing_completed_at',
      'details_completed_at',
      'ended_discounts_completed_at',
      'monthly_games_checked_at',
      'validation_completed_at',
      'validation_passed',
      'items_seen',
      'items_updated',
      'items_failed',
      'new_items_detected',
      'ended_discounts_applied',
      'failure_reason',
      'metrics',
      'started_at',
      'finished_at',
      'certified_at'
    );

  if required_cycle_columns <> 21 then
    raise exception 'public.price_refresh_cycles no longer matches the audited base contract.';
  end if;

  select count(*)
  into required_stage_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'psdeals_stage_items'
    and column_name in (
      'id',
      'region_code',
      'storefront',
      'psdeals_id',
      'current_price_amount',
      'original_price_amount',
      'discount_percent',
      'deal_ends_at',
      'is_ps_plus_discount',
      'raw_detail_json',
      'source_note',
      'updated_at'
    );

  if required_stage_columns <> 12 then
    raise exception 'public.psdeals_stage_items no longer matches the audited demotion contract.';
  end if;

  if exists (
    select 1
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
      )
  ) then
    raise exception 'One or more migration 004 cycle columns already exist.';
  end if;

  select count(*)
  into cycle_count
  from public.price_refresh_cycles;

  if cycle_count <> 0 then
    raise exception 'Migration 004 requires zero price_refresh_cycles rows; found %.', cycle_count;
  end if;

  if to_regprocedure('public.certify_price_refresh_cycle(uuid)') is null then
    raise exception 'Required function public.certify_price_refresh_cycle(uuid) does not exist.';
  end if;

  if to_regprocedure('public.refresh_catalog_public_cache_v15()') is null then
    raise exception 'Required function public.refresh_catalog_public_cache_v15() does not exist.';
  end if;

  select pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(
          to_regprocedure('public.certify_price_refresh_cycle(uuid)')
        ),
        'UTF8'
      )
    ),
    'hex'
  )
  into certify_sha256;

  if certify_sha256 <> '3dfa2232903c014039f070f48d4044ffe0b329e38cb86615b9bdbc20c4f9aa88' then
    raise exception 'certify_price_refresh_cycle(uuid) definition changed after the 2026-07-29 audit.';
  end if;

  select pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(
          to_regprocedure('public.refresh_catalog_public_cache_v15()')
        ),
        'UTF8'
      )
    ),
    'hex'
  )
  into cache_sha256;

  if cache_sha256 <> '1c6e71d26e6554e6f8fdf2e6ed0388db959419db4ee64132d8ddd5761b3996dc' then
    raise exception 'refresh_catalog_public_cache_v15() definition changed after the 2026-07-29 audit.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        '_begin_psdeals_cycle_action_v1',
        '_finish_psdeals_cycle_action_v1',
        'protect_price_refresh_cycle_identity_v1',
        'begin_psdeals_cycle_action_v1',
        'finish_psdeals_cycle_action_v1',
        'create_or_reconcile_price_refresh_cycle_v1',
        'record_psdeals_listing_completion_v1',
        'record_psdeals_monthly_check_v1',
        'apply_psdeals_ended_deals_v1',
        'mark_psdeals_price_refresh_cycle_succeeded_v1',
        'certify_price_refresh_cycle_v2',
        'refresh_catalog_public_cache_v16'
      )
  ) then
    raise exception 'One or more migration 004 functions already exist.';
  end if;
end;
$preflight$;

alter table public.price_refresh_cycles
  add column local_cycle_id varchar(160) not null,
  add column run_token_sha256 varchar(64) not null,
  add column code_revision varchar(64) not null,
  add column filter_fingerprint varchar(64) not null,
  add column manifest_hash varchar(64) not null,
  add column mode varchar(32) not null,
  add column listing_complete boolean not null default false,
  add column cache_refreshed_at timestamptz null,
  add column public_validation_completed_at timestamptz null,
  add column metrics_recorded_at timestamptz null;

alter table public.price_refresh_cycles
  add constraint price_refresh_cycles_local_cycle_id_check
    check (
      local_cycle_id ~ '^local-cycle-[a-z0-9][a-z0-9_-]{7,}$'
      and char_length(local_cycle_id) <= 160
    ),
  add constraint price_refresh_cycles_run_token_sha256_check
    check (run_token_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint price_refresh_cycles_code_revision_check
    check (code_revision ~ '^[a-f0-9]{7,64}$'),
  add constraint price_refresh_cycles_filter_fingerprint_check
    check (filter_fingerprint ~ '^[a-f0-9]{64}$'),
  add constraint price_refresh_cycles_manifest_hash_check
    check (manifest_hash ~ '^[a-f0-9]{64}$'),
  add constraint price_refresh_cycles_mode_check
    check (mode = 'operational'),
  add constraint price_refresh_cycles_scope_check
    check (region_code = 'us' and storefront = 'playstation'),
  add constraint price_refresh_cycles_listing_complete_check
    check (
      listing_complete = false
      or (
        listing_completed_at is not null
        and items_seen > 0
      )
    ),
  add constraint price_refresh_cycles_operational_timestamps_check
    check (
      (cache_refreshed_at is null or cache_refreshed_at >= started_at)
      and (
        public_validation_completed_at is null
        or public_validation_completed_at >= started_at
      )
      and (
        metrics_recorded_at is null
        or metrics_recorded_at >= started_at
      )
    );

create unique index price_refresh_cycles_local_cycle_id_unique_idx
  on public.price_refresh_cycles (local_cycle_id);

create unique index price_refresh_cycles_run_token_sha256_unique_idx
  on public.price_refresh_cycles (run_token_sha256);

create unique index price_refresh_cycles_local_identity_unique_idx
  on public.price_refresh_cycles (local_cycle_id, run_token_sha256);

comment on column public.price_refresh_cycles.local_cycle_id is
  'Visible path-safe identity generated once by the local cycle workspace.';
comment on column public.price_refresh_cycles.run_token_sha256 is
  'SHA-256 of the opaque local run token; the raw token is never stored remotely.';
comment on column public.price_refresh_cycles.manifest_hash is
  'Immutable SHA-256 of the cycle manifest identity supplied when the remote cycle is created.';
comment on column public.price_refresh_cycles.listing_complete is
  'True only after strong listing evidence is recorded by the versioned listing-completion RPC.';

create table public.psdeals_cycle_action_receipts (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null,
  parent_receipt_id uuid null,
  action_kind varchar(48) not null,
  idempotency_key varchar(200) not null,
  attempt smallint not null default 1,
  request_hash varchar(64) not null,
  input_artifact_hash varchar(64) null,
  status varchar(16) not null,
  started_at timestamptz not null,
  finished_at timestamptz null,
  affected_rows integer null,
  result jsonb not null default '{}'::jsonb,
  error_code varchar(128) null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint psdeals_cycle_action_receipts_cycle_fkey
    foreign key (cycle_id)
    references public.price_refresh_cycles(id)
    on delete restrict,
  constraint psdeals_cycle_action_receipts_parent_fkey
    foreign key (parent_receipt_id)
    references public.psdeals_cycle_action_receipts(id)
    on delete restrict,
  constraint psdeals_cycle_action_receipts_kind_check
    check (
      action_kind in (
        'create_cycle',
        'listing_validation',
        'listing_upsert_batch',
        'fast_refresh_analysis',
        'detail_import',
        'detail_retry',
        'monthly_check_record',
        'ended_deals_analysis',
        'demotion_apply',
        'mark_succeeded',
        'certify',
        'cache_refresh',
        'public_validation',
        'metrics_record'
      )
    ),
  constraint psdeals_cycle_action_receipts_key_check
    check (
      btrim(idempotency_key) = idempotency_key
      and char_length(idempotency_key) between 16 and 200
      and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:_-]+$'
    ),
  constraint psdeals_cycle_action_receipts_attempt_check
    check (attempt between 1 and 100),
  constraint psdeals_cycle_action_receipts_request_hash_check
    check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint psdeals_cycle_action_receipts_input_hash_check
    check (
      input_artifact_hash is null
      or input_artifact_hash ~ '^[a-f0-9]{64}$'
    ),
  constraint psdeals_cycle_action_receipts_status_check
    check (status in ('intent', 'running', 'committed', 'failed', 'indeterminate')),
  constraint psdeals_cycle_action_receipts_timestamps_check
    check (
      (status in ('intent', 'running') and finished_at is null)
      or (
        status in ('committed', 'failed', 'indeterminate')
        and finished_at is not null
        and finished_at >= started_at
      )
    ),
  constraint psdeals_cycle_action_receipts_counts_check
    check (affected_rows is null or affected_rows >= 0),
  constraint psdeals_cycle_action_receipts_result_check
    check (
      jsonb_typeof(result) = 'object'
      and pg_column_size(result) <= 16384
    ),
  constraint psdeals_cycle_action_receipts_error_check
    check (
      (status = 'committed' and error_code is null)
      or (status in ('intent', 'running') and error_code is null)
      or (
        status in ('failed', 'indeterminate')
        and error_code is not null
        and btrim(error_code) = error_code
      )
    ),
  constraint psdeals_cycle_action_receipts_idempotency_unique
    unique (idempotency_key)
);

create index psdeals_cycle_action_receipts_cycle_kind_status_idx
  on public.psdeals_cycle_action_receipts (
    cycle_id,
    action_kind,
    status,
    created_at desc
  );

create index psdeals_cycle_action_receipts_parent_idx
  on public.psdeals_cycle_action_receipts (parent_receipt_id)
  where parent_receipt_id is not null;

comment on table public.psdeals_cycle_action_receipts is
  'Bounded operational receipts for reconciling cycle actions after retries or lost responses.';
comment on column public.psdeals_cycle_action_receipts.idempotency_key is
  'Globally unique non-secret key; an exact replay returns the same receipt and a contradiction fails.';
comment on column public.psdeals_cycle_action_receipts.result is
  'Small structured result only; bulk payloads, full ID lists, logs, secrets, and credentials are forbidden.';

alter table public.psdeals_cycle_action_receipts enable row level security;

revoke all on table public.psdeals_cycle_action_receipts
  from public, anon, authenticated;
revoke all on table public.psdeals_cycle_action_receipts
  from service_role;
grant select on table public.psdeals_cycle_action_receipts
  to service_role;
grant all on table public.psdeals_cycle_action_receipts
  to postgres;

create function public._begin_psdeals_cycle_action_v1(
  p_cycle_id uuid,
  p_parent_receipt_id uuid,
  p_action_kind text,
  p_idempotency_key text,
  p_attempt integer,
  p_request_hash text,
  p_input_artifact_hash text,
  p_started_at timestamptz
)
returns public.psdeals_cycle_action_receipts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  parent_row public.psdeals_cycle_action_receipts%rowtype;
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
begin
  if p_cycle_id is null
    or p_action_kind is null
    or p_idempotency_key is null
    or p_request_hash is null
    or p_started_at is null then
    raise exception 'PSDEALS_ACTION_REQUIRED_ARGUMENT_MISSING';
  end if;

  select *
  into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id
  for update;

  if not found then
    raise exception 'PSDEALS_ACTION_CYCLE_NOT_FOUND';
  end if;

  if p_started_at < cycle_row.started_at
    or p_started_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'PSDEALS_ACTION_STARTED_AT_INVALID';
  end if;

  if p_parent_receipt_id is not null then
    select *
    into parent_row
    from public.psdeals_cycle_action_receipts
    where id = p_parent_receipt_id;

    if not found or parent_row.cycle_id <> p_cycle_id then
      raise exception 'PSDEALS_ACTION_PARENT_RECEIPT_INVALID';
    end if;
  end if;

  select *
  into receipt_row
  from public.psdeals_cycle_action_receipts
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if receipt_row.cycle_id <> p_cycle_id
      or receipt_row.action_kind <> p_action_kind
      or receipt_row.request_hash <> p_request_hash
      or receipt_row.input_artifact_hash is distinct from p_input_artifact_hash
      or receipt_row.parent_receipt_id is distinct from p_parent_receipt_id
      or receipt_row.attempt <> p_attempt then
      raise exception 'PSDEALS_ACTION_IDEMPOTENCY_CONTRADICTION';
    end if;

    return receipt_row;
  end if;

  insert into public.psdeals_cycle_action_receipts (
    cycle_id,
    parent_receipt_id,
    action_kind,
    idempotency_key,
    attempt,
    request_hash,
    input_artifact_hash,
    status,
    started_at
  ) values (
    p_cycle_id,
    p_parent_receipt_id,
    p_action_kind,
    p_idempotency_key,
    p_attempt,
    p_request_hash,
    p_input_artifact_hash,
    'running',
    p_started_at
  )
  returning * into receipt_row;

  return receipt_row;
end;
$function$;

create function public._finish_psdeals_cycle_action_v1(
  p_receipt_id uuid,
  p_cycle_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_status text,
  p_finished_at timestamptz,
  p_affected_rows integer,
  p_result jsonb,
  p_error_code text
)
returns public.psdeals_cycle_action_receipts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
  parent_row public.psdeals_cycle_action_receipts%rowtype;
begin
  if p_status not in ('committed', 'failed', 'indeterminate') then
    raise exception 'PSDEALS_ACTION_TERMINAL_STATUS_INVALID';
  end if;

  if p_result is null
    or jsonb_typeof(p_result) <> 'object'
    or pg_column_size(p_result) > 16384 then
    raise exception 'PSDEALS_ACTION_RESULT_INVALID';
  end if;

  select *
  into receipt_row
  from public.psdeals_cycle_action_receipts
  where id = p_receipt_id
  for update;

  if not found
    or receipt_row.cycle_id <> p_cycle_id
    or receipt_row.idempotency_key <> p_idempotency_key
    or receipt_row.request_hash <> p_request_hash then
    raise exception 'PSDEALS_ACTION_RECEIPT_MISMATCH';
  end if;

  if receipt_row.status in ('committed', 'failed', 'indeterminate') then
    if receipt_row.status <> p_status
      or receipt_row.affected_rows is distinct from p_affected_rows
      or receipt_row.result is distinct from p_result
      or receipt_row.error_code is distinct from p_error_code then
      raise exception 'PSDEALS_ACTION_TERMINAL_REPLAY_CONTRADICTION';
    end if;

    return receipt_row;
  end if;

  if p_finished_at is null
    or p_finished_at < receipt_row.started_at
    or p_finished_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'PSDEALS_ACTION_FINISHED_AT_INVALID';
  end if;

  if p_status = 'committed' and p_error_code is not null then
    raise exception 'PSDEALS_ACTION_COMMITTED_ERROR_CONTRADICTION';
  end if;

  if p_status in ('failed', 'indeterminate')
    and (p_error_code is null or btrim(p_error_code) = '') then
    raise exception 'PSDEALS_ACTION_FAILURE_CODE_REQUIRED';
  end if;

  if receipt_row.action_kind = 'public_validation'
    and p_status = 'committed' then
    if receipt_row.parent_receipt_id is null
      or coalesce((p_result ->> 'passed')::boolean, false) is distinct from true then
      raise exception 'PSDEALS_PUBLIC_VALIDATION_RESULT_INVALID';
    end if;

    select *
    into parent_row
    from public.psdeals_cycle_action_receipts
    where id = receipt_row.parent_receipt_id;

    if not found
      or parent_row.cycle_id <> p_cycle_id
      or parent_row.action_kind <> 'cache_refresh'
      or parent_row.status <> 'committed' then
      raise exception 'PSDEALS_PUBLIC_VALIDATION_CACHE_RECEIPT_INVALID';
    end if;
  end if;

  if receipt_row.action_kind = 'metrics_record'
    and p_status = 'committed' then
    select *
    into parent_row
    from public.psdeals_cycle_action_receipts
    where id = receipt_row.parent_receipt_id;

    if not found
      or parent_row.cycle_id <> p_cycle_id
      or parent_row.action_kind <> 'public_validation'
      or parent_row.status <> 'committed' then
      raise exception 'PSDEALS_METRICS_PUBLIC_VALIDATION_RECEIPT_INVALID';
    end if;
  end if;

  update public.psdeals_cycle_action_receipts
  set
    status = p_status,
    finished_at = p_finished_at,
    affected_rows = p_affected_rows,
    result = p_result,
    error_code = p_error_code,
    updated_at = clock_timestamp()
  where id = receipt_row.id
  returning * into receipt_row;

  if receipt_row.action_kind = 'public_validation'
    and receipt_row.status = 'committed' then
    update public.price_refresh_cycles
    set public_validation_completed_at = p_finished_at
    where id = p_cycle_id;
  elsif receipt_row.action_kind = 'metrics_record'
    and receipt_row.status = 'committed' then
    update public.price_refresh_cycles
    set metrics_recorded_at = p_finished_at
    where id = p_cycle_id;
  end if;

  return receipt_row;
end;
$function$;

create function public.begin_psdeals_cycle_action_v1(
  p_cycle_id uuid,
  p_parent_receipt_id uuid,
  p_action_kind text,
  p_idempotency_key text,
  p_attempt integer,
  p_request_hash text,
  p_input_artifact_hash text,
  p_started_at timestamptz
)
returns public.psdeals_cycle_action_receipts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  parent_row public.psdeals_cycle_action_receipts%rowtype;
begin
  if p_action_kind not in (
    'listing_upsert_batch',
    'fast_refresh_analysis',
    'detail_import',
    'detail_retry',
    'ended_deals_analysis',
    'public_validation',
    'metrics_record'
  ) then
    raise exception 'PSDEALS_GENERIC_ACTION_KIND_FORBIDDEN';
  end if;

  select *
  into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id;

  if not found then
    raise exception 'PSDEALS_ACTION_CYCLE_NOT_FOUND';
  end if;

  if p_action_kind in (
    'listing_upsert_batch',
    'fast_refresh_analysis',
    'detail_import',
    'detail_retry',
    'ended_deals_analysis'
  ) and cycle_row.status <> 'running' then
    raise exception 'PSDEALS_ACTION_REQUIRES_RUNNING_CYCLE';
  end if;

  if p_action_kind in ('public_validation', 'metrics_record')
    and cycle_row.status <> 'certified' then
    raise exception 'PSDEALS_ACTION_REQUIRES_CERTIFIED_CYCLE';
  end if;

  if p_parent_receipt_id is null then
    raise exception 'PSDEALS_ACTION_PARENT_RECEIPT_REQUIRED';
  end if;

  select *
  into parent_row
  from public.psdeals_cycle_action_receipts
  where id = p_parent_receipt_id;

  if not found
    or parent_row.cycle_id <> p_cycle_id
    or parent_row.status <> 'committed' then
    raise exception 'PSDEALS_ACTION_PARENT_RECEIPT_NOT_COMMITTED';
  end if;

  if (p_action_kind = 'listing_upsert_batch' and parent_row.action_kind <> 'listing_validation')
    or (p_action_kind = 'fast_refresh_analysis' and parent_row.action_kind <> 'listing_validation')
    or (p_action_kind = 'detail_import' and parent_row.action_kind <> 'fast_refresh_analysis')
    or (p_action_kind = 'detail_retry' and parent_row.action_kind <> 'detail_import')
    or (p_action_kind = 'ended_deals_analysis' and parent_row.action_kind <> 'listing_validation')
    or (p_action_kind = 'public_validation' and parent_row.action_kind <> 'cache_refresh')
    or (p_action_kind = 'metrics_record' and parent_row.action_kind <> 'public_validation') then
    raise exception 'PSDEALS_ACTION_PARENT_KIND_INVALID';
  end if;

  return public._begin_psdeals_cycle_action_v1(
    p_cycle_id,
    p_parent_receipt_id,
    p_action_kind,
    p_idempotency_key,
    p_attempt,
    p_request_hash,
    p_input_artifact_hash,
    p_started_at
  );
end;
$function$;

create function public.finish_psdeals_cycle_action_v1(
  p_receipt_id uuid,
  p_cycle_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_status text,
  p_finished_at timestamptz,
  p_affected_rows integer,
  p_result jsonb,
  p_error_code text
)
returns public.psdeals_cycle_action_receipts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
begin
  select *
  into receipt_row
  from public.psdeals_cycle_action_receipts
  where id = p_receipt_id;

  if not found
    or receipt_row.action_kind not in (
      'listing_upsert_batch',
      'fast_refresh_analysis',
      'detail_import',
      'detail_retry',
      'ended_deals_analysis',
      'public_validation',
      'metrics_record'
    ) then
    raise exception 'PSDEALS_GENERIC_ACTION_RECEIPT_FORBIDDEN';
  end if;

  if receipt_row.action_kind = 'listing_upsert_batch' then
    if coalesce(p_result ->> 'batch_index', '') !~ '^[0-9]+$'
      or coalesce(p_result ->> 'attempted', '') !~ '^[0-9]+$'
      or coalesce(p_result ->> 'failed', '') !~ '^[0-9]+$'
      or coalesce(p_result ->> 'skipped', '') !~ '^[0-9]+$' then
      raise exception 'PSDEALS_LISTING_UPSERT_RECEIPT_RESULT_INVALID';
    end if;
  elsif receipt_row.action_kind = 'fast_refresh_analysis' then
    if coalesce(p_result ->> 'combined_count', '') !~ '^[0-9]+$'
      or coalesce(p_result ->> 'overlap_count', '') !~ '^[0-9]+$'
      or coalesce(p_result ->> 'combined_artifact_hash', '') !~ '^[a-f0-9]{64}$' then
      raise exception 'PSDEALS_FAST_REFRESH_RECEIPT_RESULT_INVALID';
    end if;
  elsif receipt_row.action_kind in ('detail_import', 'detail_retry') then
    if coalesce(p_result ->> 'attempted', '') !~ '^[0-9]+$'
      or coalesce(p_result ->> 'succeeded', '') !~ '^[0-9]+$'
      or coalesce(p_result ->> 'pending_failures', '') !~ '^[0-9]+$' then
      raise exception 'PSDEALS_DETAIL_RECEIPT_RESULT_INVALID';
    end if;
  elsif receipt_row.action_kind = 'ended_deals_analysis' then
    if coalesce((p_result ->> 'listing_complete')::boolean, false) is distinct from true
      or coalesce(p_result ->> 'listing_artifact_hash', '') !~ '^[a-f0-9]{64}$'
      or coalesce(p_result ->> 'analysis_evidence_hash', '') !~ '^[a-f0-9]{64}$'
      or coalesce(p_result ->> 'candidate_set_hash', '') !~ '^[a-f0-9]{64}$'
      or coalesce(p_result ->> 'candidate_count', '') !~ '^[0-9]+$'
      or (p_result ->> 'candidate_count')::integer > 500 then
      raise exception 'PSDEALS_ENDED_ANALYSIS_RECEIPT_RESULT_INVALID';
    end if;
  end if;

  return public._finish_psdeals_cycle_action_v1(
    p_receipt_id,
    p_cycle_id,
    p_idempotency_key,
    p_request_hash,
    p_status,
    p_finished_at,
    p_affected_rows,
    p_result,
    p_error_code
  );
end;
$function$;

create function public.protect_price_refresh_cycle_identity_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.local_cycle_id is distinct from old.local_cycle_id
    or new.run_token_sha256 is distinct from old.run_token_sha256
    or new.code_revision is distinct from old.code_revision
    or new.filter_fingerprint is distinct from old.filter_fingerprint
    or new.manifest_hash is distinct from old.manifest_hash
    or new.mode is distinct from old.mode
    or new.region_code is distinct from old.region_code
    or new.storefront is distinct from old.storefront
    or new.cycle_date is distinct from old.cycle_date
    or new.started_at is distinct from old.started_at then
    raise exception 'PSDEALS_CYCLE_IDENTITY_IMMUTABLE';
  end if;

  return new;
end;
$function$;

create trigger trg_price_refresh_cycles_protect_identity_v1
before update of
  local_cycle_id,
  run_token_sha256,
  code_revision,
  filter_fingerprint,
  manifest_hash,
  mode,
  region_code,
  storefront,
  cycle_date,
  started_at
on public.price_refresh_cycles
for each row
execute function public.protect_price_refresh_cycle_identity_v1();

create function public.create_or_reconcile_price_refresh_cycle_v1(
  p_local_cycle_id text,
  p_run_token_sha256 text,
  p_code_revision text,
  p_filter_fingerprint text,
  p_manifest_hash text,
  p_mode text,
  p_region_code text,
  p_storefront text,
  p_cycle_date date,
  p_started_at timestamptz,
  p_idempotency_key text,
  p_request_hash text
)
returns table (
  cycle_id uuid,
  cycle_status text,
  reconciled boolean,
  receipt_id uuid,
  receipt_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  matched_count integer;
  cycle_row public.price_refresh_cycles%rowtype;
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
  cycle_existed boolean := false;
begin
  if p_local_cycle_id is null
    or p_local_cycle_id !~ '^local-cycle-[a-z0-9][a-z0-9_-]{7,}$'
    or char_length(p_local_cycle_id) > 160 then
    raise exception 'PSDEALS_CREATE_CYCLE_LOCAL_ID_INVALID';
  end if;

  if p_run_token_sha256 is null
    or p_run_token_sha256 !~ '^[a-f0-9]{64}$'
    or p_filter_fingerprint is null
    or p_filter_fingerprint !~ '^[a-f0-9]{64}$'
    or p_manifest_hash is null
    or p_manifest_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'PSDEALS_CREATE_CYCLE_HASH_INVALID';
  end if;

  if p_code_revision is null
    or p_code_revision !~ '^[a-f0-9]{7,64}$' then
    raise exception 'PSDEALS_CREATE_CYCLE_REVISION_INVALID';
  end if;

  if p_region_code <> 'us'
    or p_storefront <> 'playstation'
    or p_mode <> 'operational' then
    raise exception 'PSDEALS_CREATE_CYCLE_SCOPE_INVALID';
  end if;

  if p_started_at is null
    or p_started_at > clock_timestamp() + interval '5 minutes'
    or p_cycle_date is distinct from (
      p_started_at at time zone 'America/Lima'
    )::date then
    raise exception 'PSDEALS_CREATE_CYCLE_TIMESTAMP_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'lobodeals:create-cycle:local:' || p_local_cycle_id,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'lobodeals:create-cycle:token:' || p_run_token_sha256,
      0
    )
  );

  select count(*)::integer
  into matched_count
  from public.price_refresh_cycles
  where local_cycle_id = p_local_cycle_id
    or run_token_sha256 = p_run_token_sha256;

  if matched_count > 1 then
    raise exception 'PSDEALS_CREATE_CYCLE_IDENTITY_SPLIT';
  end if;

  if matched_count = 1 then
    select *
    into cycle_row
    from public.price_refresh_cycles
    where local_cycle_id = p_local_cycle_id
      or run_token_sha256 = p_run_token_sha256
    for update;

    if cycle_row.local_cycle_id <> p_local_cycle_id
      or cycle_row.run_token_sha256 <> p_run_token_sha256
      or cycle_row.code_revision <> p_code_revision
      or cycle_row.filter_fingerprint <> p_filter_fingerprint
      or cycle_row.manifest_hash <> p_manifest_hash
      or cycle_row.mode <> p_mode
      or cycle_row.region_code <> p_region_code
      or cycle_row.storefront <> p_storefront
      or cycle_row.cycle_date <> p_cycle_date
      or cycle_row.started_at <> p_started_at then
      raise exception 'PSDEALS_CREATE_CYCLE_IDENTITY_CONTRADICTION';
    end if;

    cycle_existed := true;
  else
    insert into public.price_refresh_cycles (
      local_cycle_id,
      run_token_sha256,
      code_revision,
      filter_fingerprint,
      manifest_hash,
      mode,
      region_code,
      storefront,
      cycle_date,
      status,
      started_at
    ) values (
      p_local_cycle_id,
      p_run_token_sha256,
      p_code_revision,
      p_filter_fingerprint,
      p_manifest_hash,
      p_mode,
      p_region_code,
      p_storefront,
      p_cycle_date,
      'running',
      p_started_at
    )
    returning * into cycle_row;
  end if;

  select *
  into receipt_row
  from public.psdeals_cycle_action_receipts
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if receipt_row.cycle_id <> cycle_row.id
      or receipt_row.action_kind <> 'create_cycle'
      or receipt_row.request_hash <> p_request_hash
      or receipt_row.status <> 'committed' then
      raise exception 'PSDEALS_CREATE_CYCLE_RECEIPT_CONTRADICTION';
    end if;
  else
    insert into public.psdeals_cycle_action_receipts (
      cycle_id,
      action_kind,
      idempotency_key,
      attempt,
      request_hash,
      status,
      started_at,
      finished_at,
      affected_rows,
      result
    ) values (
      cycle_row.id,
      'create_cycle',
      p_idempotency_key,
      1,
      p_request_hash,
      'committed',
      p_started_at,
      clock_timestamp(),
      case when cycle_existed then 0 else 1 end,
      jsonb_build_object(
        'cycle_id', cycle_row.id,
        'reconciled_existing_cycle', cycle_existed
      )
    )
    returning * into receipt_row;
  end if;

  return query
  select
    cycle_row.id,
    cycle_row.status,
    cycle_existed,
    receipt_row.id,
    receipt_row.status;
end;
$function$;

create function public.record_psdeals_listing_completion_v1(
  p_cycle_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_listing_artifact_hash text,
  p_filter_fingerprint text,
  p_listing_observed_at timestamptz,
  p_items_seen integer,
  p_pages_failed integer,
  p_duplicate_ids integer,
  p_is_partial boolean,
  p_termination_observed boolean,
  p_started_at timestamptz,
  p_finished_at timestamptz
)
returns public.psdeals_cycle_action_receipts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
  result_value jsonb;
begin
  select *
  into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id
  for update;

  if not found or cycle_row.status <> 'running' then
    raise exception 'PSDEALS_LISTING_CYCLE_NOT_RUNNING';
  end if;

  if p_listing_artifact_hash !~ '^[a-f0-9]{64}$'
    or p_filter_fingerprint <> cycle_row.filter_fingerprint then
    raise exception 'PSDEALS_LISTING_IDENTITY_INVALID';
  end if;

  if p_listing_observed_at < cycle_row.started_at
    or p_listing_observed_at > p_finished_at
    or p_finished_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'PSDEALS_LISTING_TIMESTAMP_INVALID';
  end if;

  if p_items_seen <= 0
    or p_pages_failed <> 0
    or p_duplicate_ids <> 0
    or p_is_partial is distinct from false
    or p_termination_observed is distinct from true then
    raise exception 'PSDEALS_LISTING_NOT_STRONGLY_COMPLETE';
  end if;

  receipt_row := public._begin_psdeals_cycle_action_v1(
    p_cycle_id,
    null,
    'listing_validation',
    p_idempotency_key,
    1,
    p_request_hash,
    p_listing_artifact_hash,
    p_started_at
  );

  if receipt_row.status <> 'running' then
    return receipt_row;
  end if;

  result_value := jsonb_build_object(
    'complete', true,
    'listing_artifact_hash', p_listing_artifact_hash,
    'filter_fingerprint', p_filter_fingerprint,
    'items_seen', p_items_seen,
    'pages_failed', p_pages_failed,
    'duplicate_ids', p_duplicate_ids,
    'is_partial', p_is_partial,
    'termination_observed', p_termination_observed
  );

  update public.price_refresh_cycles
  set
    listing_complete = true,
    listing_completed_at = p_listing_observed_at,
    items_seen = p_items_seen
  where id = p_cycle_id;

  return public._finish_psdeals_cycle_action_v1(
    receipt_row.id,
    p_cycle_id,
    p_idempotency_key,
    p_request_hash,
    'committed',
    p_finished_at,
    p_items_seen,
    result_value,
    null
  );
end;
$function$;

create function public.record_psdeals_monthly_check_v1(
  p_cycle_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_checked_at timestamptz,
  p_source_type text,
  p_source_reference text,
  p_procedure text,
  p_procedure_version text,
  p_evidence_hash text,
  p_result text,
  p_proposed_changes_count integer,
  p_application_performed boolean,
  p_started_at timestamptz,
  p_finished_at timestamptz
)
returns public.psdeals_cycle_action_receipts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
  receipt_status text;
  receipt_error text;
  result_value jsonb;
begin
  select *
  into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id
  for update;

  if not found or cycle_row.status <> 'running' then
    raise exception 'PSDEALS_MONTHLY_CYCLE_NOT_RUNNING';
  end if;

  if p_checked_at < cycle_row.started_at
    or p_checked_at > p_finished_at
    or p_finished_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'PSDEALS_MONTHLY_TIMESTAMP_INVALID';
  end if;

  if p_evidence_hash !~ '^[a-f0-9]{64}$'
    or p_source_type is null
    or btrim(p_source_type) = ''
    or char_length(p_source_type) > 64
    or p_source_reference is null
    or btrim(p_source_reference) = ''
    or char_length(p_source_reference) > 500
    or p_source_reference ~* '(secret|password|api[_-]?key|access[_-]?token|authorization|cookie)='
    or p_procedure is null
    or btrim(p_procedure) = ''
    or char_length(p_procedure) > 120
    or p_procedure_version is null
    or btrim(p_procedure_version) = ''
    or char_length(p_procedure_version) > 64 then
    raise exception 'PSDEALS_MONTHLY_EVIDENCE_INVALID';
  end if;

  if p_application_performed is distinct from false then
    raise exception 'PSDEALS_MONTHLY_APPLICATION_FORBIDDEN';
  end if;

  if p_result not in ('no_changes', 'proposed_changes', 'indeterminate', 'failed')
    or p_proposed_changes_count < 0
    or (p_result = 'no_changes' and p_proposed_changes_count <> 0)
    or (p_result = 'proposed_changes' and p_proposed_changes_count = 0) then
    raise exception 'PSDEALS_MONTHLY_RESULT_INVALID';
  end if;

  receipt_row := public._begin_psdeals_cycle_action_v1(
    p_cycle_id,
    null,
    'monthly_check_record',
    p_idempotency_key,
    1,
    p_request_hash,
    p_evidence_hash,
    p_started_at
  );

  if receipt_row.status <> 'running' then
    return receipt_row;
  end if;

  result_value := jsonb_build_object(
    'checked_at', p_checked_at,
    'source_type', p_source_type,
    'source_reference', p_source_reference,
    'procedure', p_procedure,
    'procedure_version', p_procedure_version,
    'evidence_hash', p_evidence_hash,
    'result', p_result,
    'proposed_changes_count', p_proposed_changes_count,
    'application_performed', false
  );

  receipt_status := case
    when p_result in ('no_changes', 'proposed_changes') then 'committed'
    when p_result = 'failed' then 'failed'
    else 'indeterminate'
  end;
  receipt_error := case
    when p_result = 'failed' then 'MONTHLY_CHECK_FAILED'
    when p_result = 'indeterminate' then 'MONTHLY_CHECK_INDETERMINATE'
    else null
  end;

  if p_result = 'no_changes' then
    update public.price_refresh_cycles
    set monthly_games_checked_at = p_checked_at
    where id = p_cycle_id;
  end if;

  return public._finish_psdeals_cycle_action_v1(
    receipt_row.id,
    p_cycle_id,
    p_idempotency_key,
    p_request_hash,
    receipt_status,
    p_finished_at,
    0,
    result_value,
    receipt_error
  );
end;
$function$;

create function public.apply_psdeals_ended_deals_v1(
  p_cycle_id uuid,
  p_ended_analysis_receipt_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_listing_artifact_hash text,
  p_analysis_evidence_hash text,
  p_candidate_set_hash text,
  p_candidate_psdeals_ids bigint[],
  p_expected_count integer,
  p_applied_at timestamptz
)
returns public.psdeals_cycle_action_receipts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  analysis_row public.psdeals_cycle_action_receipts%rowtype;
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
  canonical_ids bigint[];
  calculated_candidate_hash text;
  rows_found integer := 0;
  ineligible_rows integer := 0;
  updated_rows integer := 0;
  result_value jsonb;
begin
  select *
  into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id
  for update;

  if not found
    or cycle_row.status <> 'running'
    or cycle_row.listing_complete is distinct from true
    or cycle_row.listing_completed_at is null then
    raise exception 'PSDEALS_DEMOTION_CYCLE_NOT_READY';
  end if;

  if p_applied_at < cycle_row.listing_completed_at
    or p_applied_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'PSDEALS_DEMOTION_TIMESTAMP_INVALID';
  end if;

  select *
  into analysis_row
  from public.psdeals_cycle_action_receipts
  where id = p_ended_analysis_receipt_id;

  if not found
    or analysis_row.cycle_id <> p_cycle_id
    or analysis_row.action_kind <> 'ended_deals_analysis'
    or analysis_row.status <> 'committed'
    or coalesce((analysis_row.result ->> 'listing_complete')::boolean, false) is distinct from true
    or analysis_row.result ->> 'listing_artifact_hash' <> p_listing_artifact_hash
    or analysis_row.result ->> 'analysis_evidence_hash' <> p_analysis_evidence_hash
    or analysis_row.result ->> 'candidate_set_hash' <> p_candidate_set_hash
    or (analysis_row.result ->> 'candidate_count')::integer <> p_expected_count then
    raise exception 'PSDEALS_DEMOTION_ANALYSIS_RECEIPT_INVALID';
  end if;

  if p_listing_artifact_hash !~ '^[a-f0-9]{64}$'
    or p_analysis_evidence_hash !~ '^[a-f0-9]{64}$'
    or p_candidate_set_hash !~ '^[a-f0-9]{64}$'
    or p_candidate_psdeals_ids is null
    or p_expected_count < 0
    or p_expected_count > 500 then
    raise exception 'PSDEALS_DEMOTION_INPUT_INVALID';
  end if;

  select coalesce(
    array_agg(distinct candidate_id order by candidate_id),
    '{}'::bigint[]
  )
  into canonical_ids
  from unnest(p_candidate_psdeals_ids) as candidate(candidate_id);

  if canonical_ids <> p_candidate_psdeals_ids
    or cardinality(canonical_ids) <> p_expected_count
    or exists (
      select 1
      from unnest(canonical_ids) as candidate(candidate_id)
      where candidate_id <= 0
    ) then
    raise exception 'PSDEALS_DEMOTION_CANDIDATES_NOT_CANONICAL';
  end if;

  calculated_candidate_hash := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        coalesce(array_to_string(canonical_ids, E'\n'), ''),
        'UTF8'
      )
    ),
    'hex'
  );

  if calculated_candidate_hash <> p_candidate_set_hash then
    raise exception 'PSDEALS_DEMOTION_CANDIDATE_HASH_MISMATCH';
  end if;

  receipt_row := public._begin_psdeals_cycle_action_v1(
    p_cycle_id,
    p_ended_analysis_receipt_id,
    'demotion_apply',
    p_idempotency_key,
    1,
    p_request_hash,
    p_candidate_set_hash,
    p_applied_at
  );

  if receipt_row.status <> 'running' then
    return receipt_row;
  end if;

  perform 1
  from public.psdeals_stage_items as item
  where item.region_code = cycle_row.region_code
    and item.storefront = cycle_row.storefront
    and item.psdeals_id = any(canonical_ids)
  for update;

  select
    count(*)::integer,
    count(*) filter (
      where item.current_price_amount is null
        or item.original_price_amount is null
        or item.current_price_amount <= 0
        or item.original_price_amount <= 0
        or item.original_price_amount <= item.current_price_amount
        or item.discount_percent is null
        or item.discount_percent not between 1 and 99
        or item.discount_percent <> round(
          100 * (
            item.original_price_amount - item.current_price_amount
          ) / item.original_price_amount
        )::integer
    )::integer
  into rows_found, ineligible_rows
  from public.psdeals_stage_items as item
  where item.region_code = cycle_row.region_code
    and item.storefront = cycle_row.storefront
    and item.psdeals_id = any(canonical_ids);

  if rows_found <> p_expected_count or ineligible_rows <> 0 then
    raise exception 'PSDEALS_DEMOTION_EXACT_SET_NOT_ELIGIBLE';
  end if;

  update public.psdeals_stage_items as item
  set
    current_price_amount = item.original_price_amount,
    original_price_amount = null,
    discount_percent = null,
    deal_ends_at = null,
    is_ps_plus_discount = false,
    raw_detail_json = coalesce(item.raw_detail_json, '{}'::jsonb)
      || jsonb_build_object(
        'current_ps_plus_price_amount', null,
        'current_ps_plus_buy_box_price_amount', null,
        'ended_discount_safe_demotion', jsonb_build_object(
          'demoted_at', p_applied_at,
          'reason', 'psdeals_id_missing_from_complete_cycle_listing',
          'cycle_id', p_cycle_id,
          'previous_current_price_amount', item.current_price_amount,
          'previous_original_price_amount', item.original_price_amount,
          'previous_discount_percent', item.discount_percent,
          'previous_deal_ends_at', item.deal_ends_at,
          'previous_is_ps_plus_discount', item.is_ps_plus_discount
        )
      ),
    source_note = 'ended_discount_safe_demotion_from_complete_cycle_listing',
    updated_at = p_applied_at
  where item.region_code = cycle_row.region_code
    and item.storefront = cycle_row.storefront
    and item.psdeals_id = any(canonical_ids);

  get diagnostics updated_rows = row_count;

  if updated_rows <> p_expected_count then
    raise exception 'PSDEALS_DEMOTION_AFFECTED_COUNT_MISMATCH';
  end if;

  update public.price_refresh_cycles
  set
    ended_discounts_completed_at = p_applied_at,
    ended_discounts_applied = updated_rows
  where id = p_cycle_id;

  result_value := jsonb_build_object(
    'listing_artifact_hash', p_listing_artifact_hash,
    'analysis_evidence_hash', p_analysis_evidence_hash,
    'candidate_set_hash', p_candidate_set_hash,
    'candidate_count', p_expected_count,
    'affected_rows', updated_rows,
    'application_performed', true
  );

  return public._finish_psdeals_cycle_action_v1(
    receipt_row.id,
    p_cycle_id,
    p_idempotency_key,
    p_request_hash,
    'committed',
    p_applied_at,
    updated_rows,
    result_value,
    null
  );
end;
$function$;

create function public.mark_psdeals_price_refresh_cycle_succeeded_v1(
  p_cycle_id uuid,
  p_demotion_receipt_id uuid,
  p_required_receipt_ids uuid[],
  p_idempotency_key text,
  p_request_hash text,
  p_manifest_hash text,
  p_details_completed_at timestamptz,
  p_validation_completed_at timestamptz,
  p_finished_at timestamptz,
  p_items_updated integer,
  p_items_failed integer,
  p_new_items_detected integer,
  p_metrics jsonb
)
returns public.psdeals_cycle_action_receipts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
  demotion_row public.psdeals_cycle_action_receipts%rowtype;
  required_count integer;
  matched_count integer;
  result_value jsonb;
begin
  select *
  into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id
  for update;

  if not found then
    raise exception 'PSDEALS_MARK_SUCCEEDED_CYCLE_NOT_FOUND';
  end if;

  receipt_row := public._begin_psdeals_cycle_action_v1(
    p_cycle_id,
    p_demotion_receipt_id,
    'mark_succeeded',
    p_idempotency_key,
    1,
    p_request_hash,
    p_manifest_hash,
    p_validation_completed_at
  );

  if receipt_row.status <> 'running' then
    return receipt_row;
  end if;

  if cycle_row.status <> 'running'
    or cycle_row.listing_complete is distinct from true
    or cycle_row.listing_completed_at is null
    or cycle_row.monthly_games_checked_at is null
    or cycle_row.ended_discounts_completed_at is null then
    raise exception 'PSDEALS_MARK_SUCCEEDED_CYCLE_NOT_READY';
  end if;

  if p_manifest_hash <> cycle_row.manifest_hash
    or p_manifest_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'PSDEALS_MARK_SUCCEEDED_MANIFEST_MISMATCH';
  end if;

  if p_items_updated < 0
    or p_items_failed <> 0
    or p_new_items_detected < 0
    or p_metrics is null
    or jsonb_typeof(p_metrics) <> 'object'
    or pg_column_size(p_metrics) > 16384 then
    raise exception 'PSDEALS_MARK_SUCCEEDED_METRICS_INVALID';
  end if;

  if p_details_completed_at < cycle_row.started_at
    or p_validation_completed_at < greatest(
      cycle_row.listing_completed_at,
      p_details_completed_at,
      cycle_row.ended_discounts_completed_at,
      cycle_row.monthly_games_checked_at
    )
    or p_finished_at < p_validation_completed_at
    or p_finished_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'PSDEALS_MARK_SUCCEEDED_TIMESTAMP_INVALID';
  end if;

  if p_required_receipt_ids is null
    or cardinality(p_required_receipt_ids) < 7
    or cardinality(p_required_receipt_ids) > 500 then
    raise exception 'PSDEALS_MARK_SUCCEEDED_RECEIPT_SET_INVALID';
  end if;

  select count(*)::integer
  into required_count
  from (
    select distinct receipt_id
    from unnest(p_required_receipt_ids) as required(receipt_id)
  ) as unique_receipts;

  if required_count <> cardinality(p_required_receipt_ids)
    or not (p_demotion_receipt_id = any(p_required_receipt_ids)) then
    raise exception 'PSDEALS_MARK_SUCCEEDED_RECEIPT_SET_NOT_CANONICAL';
  end if;

  select count(*)::integer
  into matched_count
  from public.psdeals_cycle_action_receipts as receipt
  where receipt.id = any(p_required_receipt_ids)
    and receipt.cycle_id = p_cycle_id
    and receipt.status = 'committed';

  if matched_count <> required_count then
    raise exception 'PSDEALS_MARK_SUCCEEDED_RECEIPT_NOT_COMMITTED';
  end if;

  if not exists (
      select 1 from public.psdeals_cycle_action_receipts
      where id = any(p_required_receipt_ids)
        and action_kind = 'listing_validation'
        and result ->> 'complete' = 'true'
    )
    or not exists (
      select 1 from public.psdeals_cycle_action_receipts
      where id = any(p_required_receipt_ids)
        and action_kind = 'listing_upsert_batch'
    )
    or not exists (
      select 1 from public.psdeals_cycle_action_receipts
      where id = any(p_required_receipt_ids)
        and action_kind = 'fast_refresh_analysis'
    )
    or not exists (
      select 1 from public.psdeals_cycle_action_receipts
      where id = any(p_required_receipt_ids)
        and action_kind in ('detail_import', 'detail_retry')
        and coalesce((result ->> 'pending_failures')::integer, 0) = 0
    )
    or not exists (
      select 1 from public.psdeals_cycle_action_receipts
      where id = any(p_required_receipt_ids)
        and action_kind = 'monthly_check_record'
        and result ->> 'result' = 'no_changes'
        and result ->> 'application_performed' = 'false'
    )
    or not exists (
      select 1 from public.psdeals_cycle_action_receipts
      where id = any(p_required_receipt_ids)
        and action_kind = 'ended_deals_analysis'
        and result ->> 'listing_complete' = 'true'
    )
    or not exists (
      select 1 from public.psdeals_cycle_action_receipts
      where id = p_demotion_receipt_id
        and action_kind = 'demotion_apply'
        and affected_rows = cycle_row.ended_discounts_applied
    ) then
    raise exception 'PSDEALS_MARK_SUCCEEDED_REQUIRED_STAGE_RECEIPT_MISSING';
  end if;

  if exists (
    select 1
    from public.psdeals_cycle_action_receipts
    where cycle_id = p_cycle_id
      and status in ('intent', 'running', 'indeterminate')
      and id <> receipt_row.id
  ) then
    raise exception 'PSDEALS_MARK_SUCCEEDED_UNRESOLVED_RECEIPT_PRESENT';
  end if;

  select *
  into demotion_row
  from public.psdeals_cycle_action_receipts
  where id = p_demotion_receipt_id;

  if demotion_row.parent_receipt_id is null then
    raise exception 'PSDEALS_MARK_SUCCEEDED_DEMOTION_CHAIN_INVALID';
  end if;

  update public.price_refresh_cycles
  set
    status = 'succeeded',
    details_completed_at = p_details_completed_at,
    validation_completed_at = p_validation_completed_at,
    validation_passed = true,
    items_updated = p_items_updated,
    items_failed = p_items_failed,
    new_items_detected = p_new_items_detected,
    failure_reason = null,
    metrics = p_metrics,
    finished_at = p_finished_at
  where id = p_cycle_id;

  result_value := jsonb_build_object(
    'status', 'succeeded',
    'manifest_hash', p_manifest_hash,
    'required_receipt_count', required_count,
    'items_seen', cycle_row.items_seen,
    'items_updated', p_items_updated,
    'items_failed', p_items_failed,
    'new_items_detected', p_new_items_detected,
    'ended_discounts_applied', cycle_row.ended_discounts_applied
  );

  return public._finish_psdeals_cycle_action_v1(
    receipt_row.id,
    p_cycle_id,
    p_idempotency_key,
    p_request_hash,
    'committed',
    p_finished_at,
    1,
    result_value,
    null
  );
end;
$function$;

create function public.certify_price_refresh_cycle_v2(
  p_cycle_id uuid,
  p_mark_succeeded_receipt_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_started_at timestamptz
)
returns table (
  receipt_id uuid,
  action_status text,
  reconciled boolean,
  certification_timestamp timestamptz,
  regular_initialized integer,
  regular_lowered integer,
  ps_plus_initialized integer,
  ps_plus_lowered integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  mark_row public.psdeals_cycle_action_receipts%rowtype;
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
  finished_receipt public.psdeals_cycle_action_receipts%rowtype;
  certified_at_value timestamptz;
  regular_initialized_value integer;
  regular_lowered_value integer;
  ps_plus_initialized_value integer;
  ps_plus_lowered_value integer;
  result_value jsonb;
begin
  select * into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id
  for update;

  if not found then
    raise exception 'PSDEALS_CERTIFY_CYCLE_NOT_FOUND';
  end if;

  select * into mark_row
  from public.psdeals_cycle_action_receipts
  where id = p_mark_succeeded_receipt_id;

  if not found
    or mark_row.cycle_id <> p_cycle_id
    or mark_row.action_kind <> 'mark_succeeded'
    or mark_row.status <> 'committed' then
    raise exception 'PSDEALS_CERTIFY_MARK_RECEIPT_INVALID';
  end if;

  receipt_row := public._begin_psdeals_cycle_action_v1(
    p_cycle_id,
    p_mark_succeeded_receipt_id,
    'certify',
    p_idempotency_key,
    1,
    p_request_hash,
    cycle_row.manifest_hash,
    p_started_at
  );

  if receipt_row.status <> 'running' then
    return query select
      receipt_row.id,
      receipt_row.status,
      true,
      nullif(receipt_row.result ->> 'certification_timestamp', '')::timestamptz,
      nullif(receipt_row.result ->> 'regular_initialized', '')::integer,
      nullif(receipt_row.result ->> 'regular_lowered', '')::integer,
      nullif(receipt_row.result ->> 'ps_plus_initialized', '')::integer,
      nullif(receipt_row.result ->> 'ps_plus_lowered', '')::integer,
      receipt_row.error_code;
    return;
  end if;

  if cycle_row.status <> 'succeeded' then
    raise exception 'PSDEALS_CERTIFY_CYCLE_NOT_SUCCEEDED';
  end if;

  begin
    select
      result.certification_timestamp,
      result.regular_initialized,
      result.regular_lowered,
      result.ps_plus_initialized,
      result.ps_plus_lowered
    into
      certified_at_value,
      regular_initialized_value,
      regular_lowered_value,
      ps_plus_initialized_value,
      ps_plus_lowered_value
    from public.certify_price_refresh_cycle(p_cycle_id) as result;
  exception when others then
    finished_receipt := public._finish_psdeals_cycle_action_v1(
      receipt_row.id,
      p_cycle_id,
      p_idempotency_key,
      p_request_hash,
      'failed',
      clock_timestamp(),
      0,
      jsonb_build_object('stage', 'certify'),
      'CERTIFY_' || sqlstate
    );

    return query select
      finished_receipt.id,
      finished_receipt.status,
      false,
      null::timestamptz,
      null::integer,
      null::integer,
      null::integer,
      null::integer,
      finished_receipt.error_code;
    return;
  end;

  result_value := jsonb_build_object(
    'certification_timestamp', certified_at_value,
    'regular_initialized', regular_initialized_value,
    'regular_lowered', regular_lowered_value,
    'ps_plus_initialized', ps_plus_initialized_value,
    'ps_plus_lowered', ps_plus_lowered_value
  );

  finished_receipt := public._finish_psdeals_cycle_action_v1(
    receipt_row.id,
    p_cycle_id,
    p_idempotency_key,
    p_request_hash,
    'committed',
    clock_timestamp(),
    regular_initialized_value + regular_lowered_value
      + ps_plus_initialized_value + ps_plus_lowered_value,
    result_value,
    null
  );

  return query select
    finished_receipt.id,
    finished_receipt.status,
    false,
    certified_at_value,
    regular_initialized_value,
    regular_lowered_value,
    ps_plus_initialized_value,
    ps_plus_lowered_value,
    null::text;
end;
$function$;

create function public.refresh_catalog_public_cache_v16(
  p_cycle_id uuid,
  p_certification_receipt_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_started_at timestamptz
)
returns table (
  receipt_id uuid,
  action_status text,
  reconciled boolean,
  inserted_rows integer,
  active_regular_deals integer,
  active_ps_plus_deals integer,
  expired_deals_still_marked_active integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  certify_row public.psdeals_cycle_action_receipts%rowtype;
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
  finished_receipt public.psdeals_cycle_action_receipts%rowtype;
  inserted_rows_value integer;
  regular_deals_value integer;
  ps_plus_deals_value integer;
  expired_deals_value integer;
  finished_at_value timestamptz;
  result_value jsonb;
begin
  select * into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id
  for update;

  if not found then
    raise exception 'PSDEALS_CACHE_CYCLE_NOT_FOUND';
  end if;

  select * into certify_row
  from public.psdeals_cycle_action_receipts
  where id = p_certification_receipt_id;

  if not found
    or certify_row.cycle_id <> p_cycle_id
    or certify_row.action_kind <> 'certify'
    or certify_row.status <> 'committed' then
    raise exception 'PSDEALS_CACHE_CERTIFICATION_RECEIPT_INVALID';
  end if;

  receipt_row := public._begin_psdeals_cycle_action_v1(
    p_cycle_id,
    p_certification_receipt_id,
    'cache_refresh',
    p_idempotency_key,
    1,
    p_request_hash,
    cycle_row.manifest_hash,
    p_started_at
  );

  if receipt_row.status <> 'running' then
    return query select
      receipt_row.id,
      receipt_row.status,
      true,
      nullif(receipt_row.result ->> 'inserted_rows', '')::integer,
      nullif(receipt_row.result ->> 'active_regular_deals', '')::integer,
      nullif(receipt_row.result ->> 'active_ps_plus_deals', '')::integer,
      nullif(receipt_row.result ->> 'expired_deals_still_marked_active', '')::integer,
      receipt_row.error_code;
    return;
  end if;

  if cycle_row.status <> 'certified'
    or cycle_row.certified_at is null then
    raise exception 'PSDEALS_CACHE_CYCLE_NOT_CERTIFIED';
  end if;

  begin
    select
      result.inserted_rows,
      result.active_regular_deals,
      result.active_ps_plus_deals,
      result.expired_deals_still_marked_active
    into
      inserted_rows_value,
      regular_deals_value,
      ps_plus_deals_value,
      expired_deals_value
    from public.refresh_catalog_public_cache_v15() as result;

    if inserted_rows_value <= 0
      or expired_deals_value <> 0 then
      raise exception 'PSDEALS_CACHE_POSTCONDITION_FAILED';
    end if;
  exception when others then
    finished_receipt := public._finish_psdeals_cycle_action_v1(
      receipt_row.id,
      p_cycle_id,
      p_idempotency_key,
      p_request_hash,
      'failed',
      clock_timestamp(),
      0,
      jsonb_build_object('stage', 'cache_refresh'),
      case
        when sqlstate = 'P0001' then 'CACHE_REFRESH_POSTCONDITION_FAILED'
        else 'CACHE_REFRESH_' || sqlstate
      end
    );

    return query select
      finished_receipt.id,
      finished_receipt.status,
      false,
      null::integer,
      null::integer,
      null::integer,
      null::integer,
      finished_receipt.error_code;
    return;
  end;

  finished_at_value := clock_timestamp();
  result_value := jsonb_build_object(
    'inserted_rows', inserted_rows_value,
    'active_regular_deals', regular_deals_value,
    'active_ps_plus_deals', ps_plus_deals_value,
    'expired_deals_still_marked_active', expired_deals_value,
    'certification_receipt_id', p_certification_receipt_id
  );

  update public.price_refresh_cycles
  set cache_refreshed_at = finished_at_value
  where id = p_cycle_id;

  finished_receipt := public._finish_psdeals_cycle_action_v1(
    receipt_row.id,
    p_cycle_id,
    p_idempotency_key,
    p_request_hash,
    'committed',
    finished_at_value,
    inserted_rows_value,
    result_value,
    null
  );

  return query select
    finished_receipt.id,
    finished_receipt.status,
    false,
    inserted_rows_value,
    regular_deals_value,
    ps_plus_deals_value,
    expired_deals_value,
    null::text;
end;
$function$;

create trigger trg_psdeals_cycle_action_receipts_set_updated_at
before update
on public.psdeals_cycle_action_receipts
for each row
execute function public.set_updated_at();

comment on function public.create_or_reconcile_price_refresh_cycle_v1(
  text, text, text, text, text, text, text, text, date, timestamptz, text, text
) is
  'Creates one operational cycle or returns the exact existing identity after a safe replay.';
comment on function public.record_psdeals_listing_completion_v1(
  uuid, text, text, text, text, timestamptz, integer, integer, integer,
  boolean, boolean, timestamptz, timestamptz
) is
  'Records strong listing completeness and its exact artifact hash without storing the listing.';
comment on function public.record_psdeals_monthly_check_v1(
  uuid, text, text, timestamptz, text, text, text, text, text, text,
  integer, boolean, timestamptz, timestamptz
) is
  'Records bounded monthly review evidence; it never updates ps_plus_monthly_games.';
comment on function public.apply_psdeals_ended_deals_v1(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
) is
  'Applies one canonical bounded ended-deal candidate set and commits its receipt atomically.';
comment on function public.certify_price_refresh_cycle_v2(
  uuid, uuid, text, text, timestamptz
) is
  'Receipt-bound wrapper around certify_price_refresh_cycle(uuid); the original RPC remains available.';
comment on function public.refresh_catalog_public_cache_v16(
  uuid, uuid, text, text, timestamptz
) is
  'Receipt-bound cache refresh that requires a committed certification receipt for the same cycle.';

revoke all on function public._begin_psdeals_cycle_action_v1(
  uuid, uuid, text, text, integer, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public._finish_psdeals_cycle_action_v1(
  uuid, uuid, text, text, text, timestamptz, integer, jsonb, text
) from public, anon, authenticated, service_role;
revoke all on function public.protect_price_refresh_cycle_identity_v1()
  from public, anon, authenticated, service_role;

grant execute on function public._begin_psdeals_cycle_action_v1(
  uuid, uuid, text, text, integer, text, text, timestamptz
) to postgres;
grant execute on function public._finish_psdeals_cycle_action_v1(
  uuid, uuid, text, text, text, timestamptz, integer, jsonb, text
) to postgres;
grant execute on function public.protect_price_refresh_cycle_identity_v1()
  to postgres;

revoke all on function public.begin_psdeals_cycle_action_v1(
  uuid, uuid, text, text, integer, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.finish_psdeals_cycle_action_v1(
  uuid, uuid, text, text, text, timestamptz, integer, jsonb, text
) from public, anon, authenticated;
revoke all on function public.create_or_reconcile_price_refresh_cycle_v1(
  text, text, text, text, text, text, text, text, date, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function public.record_psdeals_listing_completion_v1(
  uuid, text, text, text, text, timestamptz, integer, integer, integer,
  boolean, boolean, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.record_psdeals_monthly_check_v1(
  uuid, text, text, timestamptz, text, text, text, text, text, text,
  integer, boolean, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.apply_psdeals_ended_deals_v1(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.mark_psdeals_price_refresh_cycle_succeeded_v1(
  uuid, uuid, uuid[], text, text, text, timestamptz, timestamptz,
  timestamptz, integer, integer, integer, jsonb
) from public, anon, authenticated;
revoke all on function public.certify_price_refresh_cycle_v2(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.refresh_catalog_public_cache_v16(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.begin_psdeals_cycle_action_v1(
  uuid, uuid, text, text, integer, text, text, timestamptz
) to service_role, postgres;
grant execute on function public.finish_psdeals_cycle_action_v1(
  uuid, uuid, text, text, text, timestamptz, integer, jsonb, text
) to service_role, postgres;
grant execute on function public.create_or_reconcile_price_refresh_cycle_v1(
  text, text, text, text, text, text, text, text, date, timestamptz, text, text
) to service_role, postgres;
grant execute on function public.record_psdeals_listing_completion_v1(
  uuid, text, text, text, text, timestamptz, integer, integer, integer,
  boolean, boolean, timestamptz, timestamptz
) to service_role, postgres;
grant execute on function public.record_psdeals_monthly_check_v1(
  uuid, text, text, timestamptz, text, text, text, text, text, text,
  integer, boolean, timestamptz, timestamptz
) to service_role, postgres;
grant execute on function public.apply_psdeals_ended_deals_v1(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
) to service_role, postgres;
grant execute on function public.mark_psdeals_price_refresh_cycle_succeeded_v1(
  uuid, uuid, uuid[], text, text, text, timestamptz, timestamptz,
  timestamptz, integer, integer, integer, jsonb
) to service_role, postgres;
grant execute on function public.certify_price_refresh_cycle_v2(
  uuid, uuid, text, text, timestamptz
) to service_role, postgres;
grant execute on function public.refresh_catalog_public_cache_v16(
  uuid, uuid, text, text, timestamptz
) to service_role, postgres;

revoke all on function public.certify_price_refresh_cycle(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.certify_price_refresh_cycle(uuid)
  to postgres;

revoke all on function public.refresh_catalog_public_cache_v15()
  from public, anon, authenticated, service_role;
grant execute on function public.refresh_catalog_public_cache_v15()
  to postgres;

commit;

-- Read-only post-application verification. These statements do not run the RPCs.

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'price_refresh_cycles',
    'psdeals_cycle_action_receipts'
  )
order by table_name, ordinal_position;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in (
    'price_refresh_cycles',
    'psdeals_cycle_action_receipts'
  )
order by tablename, indexname;

select
  procedure.proname,
  pg_catalog.pg_get_function_identity_arguments(procedure.oid) as arguments,
  procedure.prosecdef as security_definer,
  procedure.proconfig as settings,
  pg_catalog.has_function_privilege(
    'anon',
    procedure.oid,
    'EXECUTE'
  ) as anon_execute,
  pg_catalog.has_function_privilege(
    'authenticated',
    procedure.oid,
    'EXECUTE'
  ) as authenticated_execute,
  pg_catalog.has_function_privilege(
    'service_role',
    procedure.oid,
    'EXECUTE'
  ) as service_role_execute
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in (
    'begin_psdeals_cycle_action_v1',
    'finish_psdeals_cycle_action_v1',
    'create_or_reconcile_price_refresh_cycle_v1',
    'record_psdeals_listing_completion_v1',
    'record_psdeals_monthly_check_v1',
    'apply_psdeals_ended_deals_v1',
    'mark_psdeals_price_refresh_cycle_succeeded_v1',
    'certify_price_refresh_cycle_v2',
    'refresh_catalog_public_cache_v16'
  )
order by procedure.proname;

select
  relation.relname,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as rls_forced
from pg_catalog.pg_class as relation
join pg_catalog.pg_namespace as namespace
  on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in (
    'price_refresh_cycles',
    'psdeals_cycle_action_receipts'
  )
order by relation.relname;
