-- LoboDeals 3.2
-- Canonical consolidation of the proven Daily Runner v2 database contracts.
--
-- This migration contains infrastructure only. It does not create a cycle,
-- run a collector/importer, execute a demotion, certify prices, or rebuild
-- the public cache. Historical installers remain under data/** as audit evidence.

begin;

set local lock_timeout = '30s';
set local statement_timeout = '120s';

set local statement_timeout = 0;
set local lock_timeout = '30s';

create index if not exists psdeals_stage_items_listing_stamp_v2_idx
  on public.psdeals_stage_items (
    region_code,
    storefront,
    listing_last_seen_at
  );

-- Repair the already-deployed v3/v16 return branches without changing their
-- signatures or business logic. PostgreSQL RETURN QUERY requires the physical
-- varchar(128) error_code to be explicitly cast to the declared text result.
do $patch_existing_contracts$
declare
  v_def text;
  v_md5 text;
begin
  select pg_get_functiondef(p.oid), md5(pg_get_functiondef(p.oid))
  into v_def, v_md5
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='certify_price_refresh_cycle_v3';

  if v_def is null then
    raise exception 'LOBODEALS_RUNNER_V2_CERTIFY_V3_MISSING';
  end if;

  if position('receipt_row.error_code::text' in v_def) = 0
     or position('finished_receipt.error_code::text' in v_def) = 0 then
    if v_md5 <> '2309bdb5b0f6975157d302093ddff6ec' then
      raise exception 'LOBODEALS_RUNNER_V2_CERTIFY_V3_DEFINITION_DRIFT:%', v_md5;
    end if;
    v_def := replace(v_def, 'receipt_row.error_code;', 'receipt_row.error_code::text;');
    v_def := replace(v_def, 'finished_receipt.error_code;', 'finished_receipt.error_code::text;');
    execute v_def;
  end if;

  select pg_get_functiondef(p.oid), md5(pg_get_functiondef(p.oid))
  into v_def, v_md5
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='refresh_catalog_public_cache_v16';

  if v_def is null then
    raise exception 'LOBODEALS_RUNNER_V2_CACHE_V16_MISSING';
  end if;

  if position('receipt_row.error_code::text' in v_def) = 0
     or position('finished_receipt.error_code::text' in v_def) = 0 then
    if v_md5 <> '1333d179ef9ce55aa1e2413a70a06206' then
      raise exception 'LOBODEALS_RUNNER_V2_CACHE_V16_DEFINITION_DRIFT:%', v_md5;
    end if;
    v_def := replace(v_def, 'receipt_row.error_code;', 'receipt_row.error_code::text;');
    v_def := replace(v_def, 'finished_receipt.error_code;', 'finished_receipt.error_code::text;');
    execute v_def;
  end if;
end
$patch_existing_contracts$;

create or replace function public.certify_price_refresh_cycle_v4(
  p_cycle_id uuid,
  p_mark_succeeded_receipt_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_started_at timestamptz
)
returns table(
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
set search_path to ''
as $function$
declare
  existing_receipt public.psdeals_cycle_action_receipts%rowtype;
  v3_result record;
begin
  -- Administrative certification/cache RPCs are intentionally allowed to run
  -- longer than the service-role PostgREST statement budget.
  perform pg_catalog.set_config('statement_timeout', '0', true);

  select *
  into existing_receipt
  from public.psdeals_cycle_action_receipts
  where idempotency_key = p_idempotency_key;

  if found then
    if existing_receipt.cycle_id <> p_cycle_id
      or existing_receipt.parent_receipt_id is distinct from p_mark_succeeded_receipt_id
      or existing_receipt.action_kind <> 'certify'
      or existing_receipt.request_hash <> p_request_hash then
      raise exception 'PSDEALS_CERTIFY_V4_IDEMPOTENCY_MISMATCH';
    end if;

    if existing_receipt.status in ('intent', 'running', 'indeterminate') then
      raise exception 'PSDEALS_CERTIFY_V4_EXISTING_RECEIPT_NOT_TERMINAL';
    end if;

    return query
    select
      existing_receipt.id,
      existing_receipt.status,
      true,
      nullif(existing_receipt.result ->> 'certification_timestamp', '')::timestamptz,
      nullif(existing_receipt.result ->> 'regular_initialized', '')::integer,
      nullif(existing_receipt.result ->> 'regular_lowered', '')::integer,
      nullif(existing_receipt.result ->> 'ps_plus_initialized', '')::integer,
      nullif(existing_receipt.result ->> 'ps_plus_lowered', '')::integer,
      existing_receipt.error_code::text;
    return;
  end if;

  select *
  into v3_result
  from public.certify_price_refresh_cycle_v3(
    p_cycle_id => p_cycle_id,
    p_mark_succeeded_receipt_id => p_mark_succeeded_receipt_id,
    p_idempotency_key => p_idempotency_key,
    p_request_hash => p_request_hash,
    p_started_at => p_started_at
  );

  return query
  select
    v3_result.receipt_id::uuid,
    v3_result.action_status::text,
    false,
    v3_result.certification_timestamp::timestamptz,
    v3_result.regular_initialized::integer,
    v3_result.regular_lowered::integer,
    v3_result.ps_plus_initialized::integer,
    v3_result.ps_plus_lowered::integer,
    v3_result.error_code::text;
end;
$function$;

alter function public.certify_price_refresh_cycle_v4(
  uuid, uuid, text, text, timestamptz
) owner to postgres;

revoke all on function public.certify_price_refresh_cycle_v4(
  uuid, uuid, text, text, timestamptz
) from public;
revoke all on function public.certify_price_refresh_cycle_v4(
  uuid, uuid, text, text, timestamptz
) from anon;
revoke all on function public.certify_price_refresh_cycle_v4(
  uuid, uuid, text, text, timestamptz
) from authenticated;
grant execute on function public.certify_price_refresh_cycle_v4(
  uuid, uuid, text, text, timestamptz
) to service_role;


create or replace function public.refresh_catalog_public_cache_v17(
  p_cycle_id uuid,
  p_certification_receipt_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_started_at timestamptz
)
returns table(
  receipt_id uuid,
  action_status text,
  reconciled boolean,
  inserted_rows integer,
  active_regular_deals integer,
  active_ps_plus_deals integer,
  expired_deals_still_marked_active integer,
  monthly_null_price_rows_added integer,
  error_code text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  certify_row public.psdeals_cycle_action_receipts%rowtype;
  existing_receipt public.psdeals_cycle_action_receipts%rowtype;
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
  finished_receipt public.psdeals_cycle_action_receipts%rowtype;

  base_inserted_rows integer := 0;
  inserted_rows_value integer := 0;
  regular_deals_value integer := 0;
  ps_plus_deals_value integer := 0;
  expired_deals_value integer := 0;
  monthly_null_added_value integer := 0;
  cache_count_value integer := 0;

  finished_at_value timestamptz;
  result_value jsonb;
begin
  perform pg_catalog.set_config('statement_timeout', '0', true);

  select *
  into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id
  for update;

  if not found then
    raise exception 'PSDEALS_CACHE_V17_CYCLE_NOT_FOUND';
  end if;

  select *
  into certify_row
  from public.psdeals_cycle_action_receipts
  where id = p_certification_receipt_id;

  if not found
    or certify_row.cycle_id <> p_cycle_id
    or certify_row.action_kind <> 'certify'
    or certify_row.status <> 'committed' then
    raise exception 'PSDEALS_CACHE_V17_CERTIFICATION_RECEIPT_INVALID';
  end if;

  -- Safe replay/adoption before calling the legacy v16/v15 chain.
  select *
  into existing_receipt
  from public.psdeals_cycle_action_receipts
  where idempotency_key = p_idempotency_key;

  if found then
    if existing_receipt.cycle_id <> p_cycle_id
      or existing_receipt.parent_receipt_id is distinct from p_certification_receipt_id
      or existing_receipt.action_kind <> 'cache_refresh'
      or existing_receipt.request_hash <> p_request_hash then
      raise exception 'PSDEALS_CACHE_V17_IDEMPOTENCY_MISMATCH';
    end if;

    if existing_receipt.status in ('intent', 'running', 'indeterminate') then
      raise exception 'PSDEALS_CACHE_V17_EXISTING_RECEIPT_NOT_TERMINAL';
    end if;

    return query
    select
      existing_receipt.id,
      existing_receipt.status,
      true,
      nullif(existing_receipt.result ->> 'inserted_rows', '')::integer,
      nullif(existing_receipt.result ->> 'active_regular_deals', '')::integer,
      nullif(existing_receipt.result ->> 'active_ps_plus_deals', '')::integer,
      nullif(existing_receipt.result ->> 'expired_deals_still_marked_active', '')::integer,
      coalesce(
        nullif(existing_receipt.result ->> 'monthly_null_price_rows_added', '')::integer,
        0
      ),
      existing_receipt.error_code::text;
    return;
  end if;

  if cycle_row.status <> 'certified'
    or cycle_row.certified_at is null then
    raise exception 'PSDEALS_CACHE_V17_CYCLE_NOT_CERTIFIED';
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
    -- Defensive fallback. Under normal operation the explicit replay branch above
    -- handles this without relying on varchar->text implicit conversion.
    return query
    select
      receipt_row.id,
      receipt_row.status,
      true,
      nullif(receipt_row.result ->> 'inserted_rows', '')::integer,
      nullif(receipt_row.result ->> 'active_regular_deals', '')::integer,
      nullif(receipt_row.result ->> 'active_ps_plus_deals', '')::integer,
      nullif(receipt_row.result ->> 'expired_deals_still_marked_active', '')::integer,
      coalesce(
        nullif(receipt_row.result ->> 'monthly_null_price_rows_added', '')::integer,
        0
      ),
      receipt_row.error_code::text;
    return;
  end if;

  begin
    select
      result.inserted_rows,
      result.active_regular_deals,
      result.active_ps_plus_deals,
      result.expired_deals_still_marked_active
    into
      base_inserted_rows,
      regular_deals_value,
      ps_plus_deals_value,
      expired_deals_value
    from public.refresh_catalog_public_cache_v15() as result;

    if base_inserted_rows <= 0 or expired_deals_value <> 0 then
      raise exception 'PSDEALS_CACHE_V17_BASE_POSTCONDITION_FAILED';
    end if;

    -- v15 intentionally excludes current_price_amount=NULL. Monthly is a
    -- separate subscription benefit, so an active official Monthly title may
    -- still be public with no invented commercial price.
    insert into public.catalog_public_cache (
      item_id,
      region_code,
      storefront,
      slug,
      title,
      image_url,
      platforms,
      release_date,
      publisher,
      genres,
      current_price_amount,
      original_price_amount,
      discount_percent,
      ps_plus_price_amount,
      best_price_amount,
      best_price_type,
      has_deal,
      has_ps_plus_deal,
      is_ps_plus_monthly_game,
      ps_plus_monthly_label,
      ps_plus_monthly_note,
      ps_plus_monthly_month,
      ps_plus_monthly_until,
      metacritic_score,
      deal_ends_at,
      content_type,
      item_type_label
    )
    select
      p.id,
      p.region_code,
      p.storefront,
      case
        when not exists (
          select 1
          from public.catalog_public_cache existing_slug
          where existing_slug.slug = p.psdeals_slug
        )
          then p.psdeals_slug
        else p.psdeals_slug || '-' || p.psdeals_id::text
      end,
      p.title,
      p.image_url,
      coalesce(p.platforms, '{}'::text[]),
      p.release_date,
      p.publisher,
      coalesce(p.genres, '{}'::text[]),
      null::numeric,
      null::numeric,
      0,
      null::numeric,
      0::numeric,
      'none',
      false,
      false,
      true,
      mg.label,
      mg.note,
      mg.month_key,
      mg.active_until,
      p.metacritic_score,
      null::timestamptz,
      p.content_type,
      p.item_type_label
    from public.psdeals_stage_items p
    join lateral (
      select monthly.*
      from public.ps_plus_monthly_games monthly
      where monthly.item_id = p.id
        and monthly.is_active = true
        and coalesce(
          monthly.active_from_at,
          monthly.active_from::timestamptz
        ) <= now()
        and coalesce(
          monthly.active_until_at,
          (monthly.active_until + 1)::timestamptz
        ) > now()
      order by monthly.active_until desc, monthly.updated_at desc
      limit 1
    ) mg on true
    where p.region_code = 'us'
      and p.storefront = 'playstation'
      and p.current_price_amount is null
      and p.psdeals_slug is not null
      and p.title is not null
      and p.image_url is not null
      and not exists (
        select 1
        from public.catalog_public_cache existing_item
        where existing_item.item_id = p.id
      );

    get diagnostics monthly_null_added_value = row_count;

    -- A suffixed collision must itself be unique.
    if exists (
      select 1
      from public.catalog_public_cache c
      group by c.slug
      having count(*) > 1
    ) then
      raise exception 'PSDEALS_CACHE_V17_SLUG_DUPLICATE';
    end if;

    select count(*)::integer
    into inserted_rows_value
    from public.catalog_public_cache;

    select count(*)::integer
    into regular_deals_value
    from public.catalog_public_cache
    where has_deal = true;

    select count(*)::integer
    into ps_plus_deals_value
    from public.catalog_public_cache
    where has_ps_plus_deal = true;

    select count(*)::integer
    into expired_deals_value
    from public.catalog_public_cache
    where deal_ends_at is not null
      and deal_ends_at <= now()
      and (has_deal = true or has_ps_plus_deal = true);

    select count(*)::integer
    into cache_count_value
    from public.catalog_public_cache;

    if inserted_rows_value <> base_inserted_rows + monthly_null_added_value
      or cache_count_value <> inserted_rows_value
      or inserted_rows_value <= 0
      or expired_deals_value <> 0 then
      raise exception 'PSDEALS_CACHE_V17_POSTCONDITION_FAILED';
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
      jsonb_build_object(
        'stage', 'cache_refresh_v17',
        'contract_version', 17
      ),
      case
        when sqlstate = 'P0001' then 'CACHE_V17_POSTCONDITION_FAILED'
        else 'CACHE_V17_' || sqlstate
      end
    );

    return query
    select
      finished_receipt.id,
      finished_receipt.status,
      false,
      null::integer,
      null::integer,
      null::integer,
      null::integer,
      null::integer,
      finished_receipt.error_code::text;
    return;
  end;

  finished_at_value := clock_timestamp();

  result_value := jsonb_build_object(
    'contract_version', 17,
    'inserted_rows', inserted_rows_value,
    'active_regular_deals', regular_deals_value,
    'active_ps_plus_deals', ps_plus_deals_value,
    'expired_deals_still_marked_active', expired_deals_value,
    'monthly_null_price_rows_added', monthly_null_added_value,
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

  return query
  select
    finished_receipt.id,
    finished_receipt.status,
    false,
    inserted_rows_value,
    regular_deals_value,
    ps_plus_deals_value,
    expired_deals_value,
    monthly_null_added_value,
    null::text;
end;
$function$;

alter function public.refresh_catalog_public_cache_v17(
  uuid, uuid, text, text, timestamptz
) owner to postgres;

revoke all on function public.refresh_catalog_public_cache_v17(
  uuid, uuid, text, text, timestamptz
) from public;
revoke all on function public.refresh_catalog_public_cache_v17(
  uuid, uuid, text, text, timestamptz
) from anon;
revoke all on function public.refresh_catalog_public_cache_v17(
  uuid, uuid, text, text, timestamptz
) from authenticated;
grant execute on function public.refresh_catalog_public_cache_v17(
  uuid, uuid, text, text, timestamptz
) to service_role;


create or replace function public.lobodeals_daily_runner_v2_preflight()
returns table(
  contract_version integer,
  certify_v4_present boolean,
  cache_v17_present boolean,
  listing_stamp_index_present boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    2::integer,
    to_regprocedure(
      'public.certify_price_refresh_cycle_v4(uuid,uuid,text,text,timestamptz)'
    ) is not null,
    to_regprocedure(
      'public.refresh_catalog_public_cache_v17(uuid,uuid,text,text,timestamptz)'
    ) is not null,
    exists (
      select 1
      from pg_catalog.pg_indexes
      where schemaname='public'
        and tablename='psdeals_stage_items'
        and indexname='psdeals_stage_items_listing_stamp_v2_idx'
    );
$function$;

alter function public.lobodeals_daily_runner_v2_preflight()
  owner to postgres;

revoke all on function public.lobodeals_daily_runner_v2_preflight()
  from public;
revoke all on function public.lobodeals_daily_runner_v2_preflight()
  from anon;
revoke all on function public.lobodeals_daily_runner_v2_preflight()
  from authenticated;
grant execute on function public.lobodeals_daily_runner_v2_preflight()
  to service_role;

set local statement_timeout = 0;
set local lock_timeout = '30s';

create extension if not exists pg_cron;

create table if not exists public.lobodeals_async_cache_jobs (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.price_refresh_cycles(id) on delete restrict,
  certification_receipt_id uuid not null references public.psdeals_cycle_action_receipts(id) on delete restrict,
  cache_idempotency_key text not null unique,
  cache_request_hash text not null,
  cache_started_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  cron_job_name text not null unique,
  cron_job_id bigint,
  cache_receipt_id uuid references public.psdeals_cycle_action_receipts(id) on delete restrict,
  inserted_rows integer,
  active_regular_deals integer,
  active_ps_plus_deals integer,
  expired_deals_still_marked_active integer,
  monthly_null_price_rows_added integer,
  result jsonb,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.lobodeals_async_cache_jobs enable row level security;
revoke all on table public.lobodeals_async_cache_jobs from public, anon, authenticated, service_role;

create index if not exists lobodeals_async_cache_jobs_cycle_idx
  on public.lobodeals_async_cache_jobs(cycle_id, created_at desc);

create or replace function public.run_lobodeals_catalog_cache_refresh_v18(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  job public.lobodeals_async_cache_jobs%rowtype;
  cache_result record;
  v_error_code text;
begin
  perform pg_catalog.set_config('statement_timeout','0',true);

  select * into job
  from public.lobodeals_async_cache_jobs
  where id=p_job_id
  for update;

  if not found then
    return;
  end if;

  if job.status in ('succeeded','failed') then
    perform cron.unschedule(job.cron_job_name);
    return;
  end if;

  update public.lobodeals_async_cache_jobs
  set status='running', started_at=coalesce(started_at,clock_timestamp()), updated_at=clock_timestamp()
  where id=p_job_id;

  begin
    select * into cache_result
    from public.refresh_catalog_public_cache_v17(
      p_cycle_id => job.cycle_id,
      p_certification_receipt_id => job.certification_receipt_id,
      p_idempotency_key => job.cache_idempotency_key,
      p_request_hash => job.cache_request_hash,
      p_started_at => job.cache_started_at
    );

    if cache_result.action_status <> 'committed' or cache_result.receipt_id is null then
      v_error_code := coalesce(cache_result.error_code::text,'CACHE_V18_V17_NOT_COMMITTED');
      update public.lobodeals_async_cache_jobs
      set status='failed',
          cache_receipt_id=cache_result.receipt_id,
          result=to_jsonb(cache_result),
          error_code=v_error_code,
          finished_at=clock_timestamp(),
          updated_at=clock_timestamp()
      where id=p_job_id;
      perform cron.unschedule(job.cron_job_name);
      return;
    end if;

    update public.lobodeals_async_cache_jobs
    set status='succeeded',
        cache_receipt_id=cache_result.receipt_id,
        inserted_rows=cache_result.inserted_rows,
        active_regular_deals=cache_result.active_regular_deals,
        active_ps_plus_deals=cache_result.active_ps_plus_deals,
        expired_deals_still_marked_active=cache_result.expired_deals_still_marked_active,
        monthly_null_price_rows_added=cache_result.monthly_null_price_rows_added,
        result=to_jsonb(cache_result),
        error_code=null,
        finished_at=clock_timestamp(),
        updated_at=clock_timestamp()
    where id=p_job_id;

  exception when others then
    update public.lobodeals_async_cache_jobs
    set status='failed',
        error_code='CACHE_V18_' || sqlstate,
        result=jsonb_build_object('message',sqlerrm,'sqlstate',sqlstate),
        finished_at=clock_timestamp(),
        updated_at=clock_timestamp()
    where id=p_job_id;
  end;

  perform cron.unschedule(job.cron_job_name);
end;
$function$;

alter function public.run_lobodeals_catalog_cache_refresh_v18(uuid) owner to postgres;
revoke all on function public.run_lobodeals_catalog_cache_refresh_v18(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Quick enqueue RPC. This is the only write RPC the service-role runner needs.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_lobodeals_catalog_cache_refresh_v18(
  p_cycle_id uuid,
  p_certification_receipt_id uuid,
  p_cache_idempotency_key text,
  p_cache_request_hash text,
  p_cache_started_at timestamptz
)
returns table(
  job_id uuid,
  job_status text,
  reconciled boolean,
  cron_job_id bigint,
  cache_receipt_id uuid,
  inserted_rows integer,
  active_regular_deals integer,
  active_ps_plus_deals integer,
  expired_deals_still_marked_active integer,
  monthly_null_price_rows_added integer,
  error_code text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  cert_row public.psdeals_cycle_action_receipts%rowtype;
  existing_job public.lobodeals_async_cache_jobs%rowtype;
  new_job public.lobodeals_async_cache_jobs%rowtype;
  v_job_name text;
  v_cron_job_id bigint;
  v_command text;
begin
  if p_cache_idempotency_key is null or length(trim(p_cache_idempotency_key))=0
     or p_cache_request_hash !~ '^[a-f0-9]{64}$'
     or p_cache_started_at is null then
    raise exception 'LOBODEALS_CACHE_V18_ARGUMENT_INVALID';
  end if;

  select * into cycle_row from public.price_refresh_cycles where id=p_cycle_id;
  if not found or cycle_row.status <> 'certified' or cycle_row.certified_at is null then
    raise exception 'LOBODEALS_CACHE_V18_CYCLE_NOT_CERTIFIED';
  end if;

  select * into cert_row from public.psdeals_cycle_action_receipts where id=p_certification_receipt_id;
  if not found or cert_row.cycle_id <> p_cycle_id or cert_row.action_kind <> 'certify' or cert_row.status <> 'committed' then
    raise exception 'LOBODEALS_CACHE_V18_CERT_RECEIPT_INVALID';
  end if;

  select * into existing_job
  from public.lobodeals_async_cache_jobs
  where cache_idempotency_key=p_cache_idempotency_key;

  if found then
    if existing_job.cycle_id <> p_cycle_id
       or existing_job.certification_receipt_id <> p_certification_receipt_id
       or existing_job.cache_request_hash <> p_cache_request_hash
       or existing_job.cache_started_at <> p_cache_started_at then
      raise exception 'LOBODEALS_CACHE_V18_IDEMPOTENCY_MISMATCH';
    end if;

    return query select
      existing_job.id,
      existing_job.status,
      true,
      existing_job.cron_job_id,
      existing_job.cache_receipt_id,
      existing_job.inserted_rows,
      existing_job.active_regular_deals,
      existing_job.active_ps_plus_deals,
      existing_job.expired_deals_still_marked_active,
      existing_job.monthly_null_price_rows_added,
      existing_job.error_code::text;
    return;
  end if;

  v_job_name := 'lobodeals-cache-' || replace(gen_random_uuid()::text,'-','');

  insert into public.lobodeals_async_cache_jobs(
    cycle_id,certification_receipt_id,cache_idempotency_key,cache_request_hash,
    cache_started_at,status,cron_job_name
  ) values (
    p_cycle_id,p_certification_receipt_id,p_cache_idempotency_key,p_cache_request_hash,
    p_cache_started_at,'queued',v_job_name
  ) returning * into new_job;

  v_command := format(
    'select public.run_lobodeals_catalog_cache_refresh_v18(%L::uuid);',
    new_job.id::text
  );

  select cron.schedule(v_job_name,'5 seconds',v_command) into v_cron_job_id;

  update public.lobodeals_async_cache_jobs
  set cron_job_id=v_cron_job_id, updated_at=clock_timestamp()
  where id=new_job.id
  returning * into new_job;

  return query select
    new_job.id,
    new_job.status,
    false,
    new_job.cron_job_id,
    new_job.cache_receipt_id,
    new_job.inserted_rows,
    new_job.active_regular_deals,
    new_job.active_ps_plus_deals,
    new_job.expired_deals_still_marked_active,
    new_job.monthly_null_price_rows_added,
    new_job.error_code::text;
end;
$function$;

alter function public.enqueue_lobodeals_catalog_cache_refresh_v18(uuid,uuid,text,text,timestamptz) owner to postgres;
revoke all on function public.enqueue_lobodeals_catalog_cache_refresh_v18(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_lobodeals_catalog_cache_refresh_v18(uuid,uuid,text,text,timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Quick polling RPC. Read-only to the service-role caller.
-- ---------------------------------------------------------------------------
create or replace function public.get_lobodeals_catalog_cache_refresh_v18(p_job_id uuid)
returns table(
  job_id uuid,
  job_status text,
  reconciled boolean,
  cron_job_id bigint,
  cache_receipt_id uuid,
  inserted_rows integer,
  active_regular_deals integer,
  active_ps_plus_deals integer,
  expired_deals_still_marked_active integer,
  monthly_null_price_rows_added integer,
  error_code text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    j.id,
    j.status,
    false,
    j.cron_job_id,
    j.cache_receipt_id,
    j.inserted_rows,
    j.active_regular_deals,
    j.active_ps_plus_deals,
    j.expired_deals_still_marked_active,
    j.monthly_null_price_rows_added,
    j.error_code::text
  from public.lobodeals_async_cache_jobs j
  where j.id=p_job_id;
$function$;

alter function public.get_lobodeals_catalog_cache_refresh_v18(uuid) owner to postgres;
revoke all on function public.get_lobodeals_catalog_cache_refresh_v18(uuid) from public, anon, authenticated;
grant execute on function public.get_lobodeals_catalog_cache_refresh_v18(uuid) to service_role;

create or replace function public.lobodeals_daily_runner_v21_preflight()
returns table(
  contract_version integer,
  pg_cron_present boolean,
  enqueue_v18_present boolean,
  poll_v18_present boolean,
  cache_v17_present boolean,
  certify_v4_present boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    21::integer,
    exists(select 1 from pg_catalog.pg_extension where extname='pg_cron'),
    to_regprocedure('public.enqueue_lobodeals_catalog_cache_refresh_v18(uuid,uuid,text,text,timestamp with time zone)') is not null,
    to_regprocedure('public.get_lobodeals_catalog_cache_refresh_v18(uuid)') is not null,
    to_regprocedure('public.refresh_catalog_public_cache_v17(uuid,uuid,text,text,timestamp with time zone)') is not null,
    to_regprocedure('public.certify_price_refresh_cycle_v4(uuid,uuid,text,text,timestamp with time zone)') is not null;
$function$;

alter function public.lobodeals_daily_runner_v21_preflight() owner to postgres;
revoke all on function public.lobodeals_daily_runner_v21_preflight() from public, anon, authenticated;
grant execute on function public.lobodeals_daily_runner_v21_preflight() to service_role;

create or replace function public.catalog_search_normalize(value text)
returns text
language sql
stable
set search_path to ''
as $function$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.lower(public.unaccent(coalesce(value, ''::text))),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$function$;

create or replace function public.apply_psdeals_ended_deals_v4(
  p_cycle_id uuid,
  p_ended_analysis_receipt_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_listing_artifact_hash text,
  p_analysis_evidence_hash text,
  p_candidate_set_hash text,
  p_candidate_psdeals_ids bigint[],
  p_expected_count integer,
  p_applied_at timestamp with time zone
)
returns public.psdeals_cycle_action_receipts
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  analysis_row public.psdeals_cycle_action_receipts%rowtype;
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
  canonical_ids bigint[];
  calculated_candidate_hash text;
  rows_found integer := 0;
  active_eligible_rows integer := 0;
  already_demoted_rows integer := 0;
  invalid_rows integer := 0;
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
    raise exception 'PSDEALS_DEMOTION_V4_CYCLE_NOT_READY';
  end if;

  if p_applied_at < cycle_row.listing_completed_at
    or p_applied_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'PSDEALS_DEMOTION_V4_TIMESTAMP_INVALID';
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
    raise exception 'PSDEALS_DEMOTION_V4_ANALYSIS_RECEIPT_INVALID';
  end if;

  if p_listing_artifact_hash !~ '^[a-f0-9]{64}$'
    or p_analysis_evidence_hash !~ '^[a-f0-9]{64}$'
    or p_candidate_set_hash !~ '^[a-f0-9]{64}$'
    or p_candidate_psdeals_ids is null
    or p_expected_count is null
    or p_expected_count < 0
    or p_expected_count > 5000 then
    raise exception 'PSDEALS_DEMOTION_V4_INPUT_INVALID';
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
    raise exception 'PSDEALS_DEMOTION_V4_CANDIDATES_NOT_CANONICAL';
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
    raise exception 'PSDEALS_DEMOTION_V4_CANDIDATE_HASH_MISMATCH';
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

  lock table public.ps_plus_monthly_games in share mode;

  perform 1
  from public.psdeals_stage_items as item
  where item.region_code = cycle_row.region_code
    and item.storefront = cycle_row.storefront
    and item.psdeals_id = any(canonical_ids)
  for update;

  with classified as (
    select
      item.id,
      item.psdeals_id,
      (
        item.current_price_amount is not null
        and item.original_price_amount is not null
        and item.current_price_amount > 0
        and item.original_price_amount > 0
        and item.original_price_amount > item.current_price_amount
        and item.discount_percent between 1 and 99
        and item.discount_percent = round(
          100 * (item.original_price_amount - item.current_price_amount)
          / item.original_price_amount
        )::integer
        and item.is_ps_plus_discount is false
        and item.psdeals_slug is not null
        and btrim(item.psdeals_slug) <> ''
        and item.psdeals_url is not null
        and item.psdeals_url like
          'https://psdeals.net/us-store/game/' || item.psdeals_id::text || '/%'
        and (
          (item.content_type = 'game' and item.item_type_label = 'game')
          or (item.content_type = 'bundle' and item.item_type_label = 'bundle')
          or (item.content_type = 'dlc' and item.item_type_label = 'addon')
        )
        and (item.deal_ends_at is null or item.deal_ends_at <= p_applied_at)
        and not exists (
          select 1
          from public.ps_plus_monthly_games as monthly_game
          where monthly_game.item_id = item.id
            and monthly_game.is_active = true
            and coalesce(
              monthly_game.active_from_at,
              monthly_game.active_from::timestamptz,
              '-infinity'::timestamptz
            ) <= p_applied_at
            and coalesce(
              monthly_game.active_until_at,
              (monthly_game.active_until + interval '1 day')::timestamptz,
              'infinity'::timestamptz
            ) > p_applied_at
        )
      ) as active_eligible,
      (
        item.current_price_amount is not null
        and item.current_price_amount > 0
        and item.original_price_amount is null
        and item.discount_percent is null
        and item.deal_ends_at is null
        and item.is_ps_plus_discount is false
        and item.psdeals_slug is not null
        and btrim(item.psdeals_slug) <> ''
        and item.psdeals_url is not null
        and item.psdeals_url like
          'https://psdeals.net/us-store/game/' || item.psdeals_id::text || '/%'
        and (
          (item.content_type = 'game' and item.item_type_label = 'game')
          or (item.content_type = 'bundle' and item.item_type_label = 'bundle')
          or (item.content_type = 'dlc' and item.item_type_label = 'addon')
        )
        and item.source_note = 'ended_discount_safe_demotion_from_complete_cycle_listing'
        and item.raw_detail_json #>> '{ended_discount_safe_demotion,cycle_id}' = p_cycle_id::text
        and coalesce(item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_is_ps_plus_discount}', '') = 'false'
        and coalesce(item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_current_price_amount}', '') ~ '^[0-9]+(\.[0-9]+)?$'
        and coalesce(item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_original_price_amount}', '') ~ '^[0-9]+(\.[0-9]+)?$'
        and coalesce(item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_discount_percent}', '') ~ '^[0-9]{1,2}$'
        and (item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_current_price_amount}')::numeric > 0
        and (item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_original_price_amount}')::numeric >
          (item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_current_price_amount}')::numeric
        and item.current_price_amount =
          (item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_original_price_amount}')::numeric
        and (item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_discount_percent}')::integer between 1 and 99
        and (item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_discount_percent}')::integer = round(
          100 * (
            (item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_original_price_amount}')::numeric
            - (item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_current_price_amount}')::numeric
          ) / (item.raw_detail_json #>> '{ended_discount_safe_demotion,previous_original_price_amount}')::numeric
        )::integer
        and not exists (
          select 1
          from public.ps_plus_monthly_games as monthly_game
          where monthly_game.item_id = item.id
            and monthly_game.is_active = true
            and coalesce(
              monthly_game.active_from_at,
              monthly_game.active_from::timestamptz,
              '-infinity'::timestamptz
            ) <= p_applied_at
            and coalesce(
              monthly_game.active_until_at,
              (monthly_game.active_until + interval '1 day')::timestamptz,
              'infinity'::timestamptz
            ) > p_applied_at
        )
      ) as already_demoted_same_cycle
    from public.psdeals_stage_items as item
    where item.region_code = cycle_row.region_code
      and item.storefront = cycle_row.storefront
      and item.psdeals_id = any(canonical_ids)
  )
  select
    count(*)::integer,
    count(*) filter (where active_eligible)::integer,
    count(*) filter (where already_demoted_same_cycle)::integer,
    count(*) filter (where not active_eligible and not already_demoted_same_cycle)::integer
  into rows_found, active_eligible_rows, already_demoted_rows, invalid_rows
  from classified;

  if rows_found <> p_expected_count
    or active_eligible_rows + already_demoted_rows <> p_expected_count
    or invalid_rows <> 0 then
    raise exception 'PSDEALS_DEMOTION_V4_EXACT_SET_NOT_RECONCILABLE';
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
    and item.psdeals_id = any(canonical_ids)
    and item.current_price_amount is not null
    and item.original_price_amount is not null
    and item.current_price_amount > 0
    and item.original_price_amount > item.current_price_amount
    and item.discount_percent between 1 and 99
    and item.discount_percent = round(
      100 * (item.original_price_amount - item.current_price_amount)
      / item.original_price_amount
    )::integer
    and item.is_ps_plus_discount is false
    and (item.deal_ends_at is null or item.deal_ends_at <= p_applied_at);

  get diagnostics updated_rows = row_count;

  if updated_rows <> active_eligible_rows then
    raise exception 'PSDEALS_DEMOTION_V4_NEWLY_DEMOTED_COUNT_MISMATCH';
  end if;

  update public.price_refresh_cycles
  set
    ended_discounts_completed_at = p_applied_at,
    ended_discounts_applied = p_expected_count
  where id = p_cycle_id;

  result_value := jsonb_build_object(
    'contract_version', 4,
    'listing_artifact_hash', p_listing_artifact_hash,
    'analysis_evidence_hash', p_analysis_evidence_hash,
    'candidate_set_hash', p_candidate_set_hash,
    'candidate_count', p_expected_count,
    'reconciled_count', p_expected_count,
    'newly_demoted_rows', updated_rows,
    'already_demoted_same_cycle', already_demoted_rows,
    'application_performed', updated_rows > 0
  );

  return public._finish_psdeals_cycle_action_v1(
    receipt_row.id,
    p_cycle_id,
    p_idempotency_key,
    p_request_hash,
    'committed',
    p_applied_at,
    p_expected_count,
    result_value,
    null
  );
end;
$function$;

alter function public.apply_psdeals_ended_deals_v4(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamp with time zone
) owner to postgres;

revoke all on function public.apply_psdeals_ended_deals_v4(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamp with time zone
) from public;

revoke all on function public.apply_psdeals_ended_deals_v4(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamp with time zone
) from anon, authenticated;

grant execute on function public.apply_psdeals_ended_deals_v4(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamp with time zone
) to service_role;

create table if not exists public.lobodeals_async_demotion_jobs (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.price_refresh_cycles(id) on delete restrict,
  ended_analysis_receipt_id uuid not null references public.psdeals_cycle_action_receipts(id) on delete restrict,
  demotion_idempotency_key text not null unique,
  demotion_request_hash text not null,
  listing_artifact_hash text not null,
  analysis_evidence_hash text not null,
  candidate_set_hash text not null,
  candidate_psdeals_ids bigint[] not null,
  expected_count integer not null,
  applied_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  cron_job_name text not null unique,
  cron_job_id bigint,
  demotion_receipt_id uuid references public.psdeals_cycle_action_receipts(id) on delete restrict,
  affected_rows integer,
  result jsonb,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.lobodeals_async_demotion_jobs enable row level security;
revoke all on table public.lobodeals_async_demotion_jobs from public, anon, authenticated, service_role;

create index if not exists lobodeals_async_demotion_jobs_cycle_idx
  on public.lobodeals_async_demotion_jobs(cycle_id, created_at desc);

create or replace function public.run_lobodeals_ended_demotion_v5(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  job public.lobodeals_async_demotion_jobs%rowtype;
  demotion_result public.psdeals_cycle_action_receipts%rowtype;
  v_error_code text;
begin
  perform pg_catalog.set_config('statement_timeout','0',true);

  select * into job
  from public.lobodeals_async_demotion_jobs
  where id=p_job_id
  for update;

  if not found then
    return;
  end if;

  if job.status in ('succeeded','failed') then
    perform cron.unschedule(job.cron_job_name);
    return;
  end if;

  update public.lobodeals_async_demotion_jobs
  set status='running',
      started_at=coalesce(started_at,clock_timestamp()),
      updated_at=clock_timestamp()
  where id=p_job_id;

  begin
    select * into demotion_result
    from public.apply_psdeals_ended_deals_v4(
      p_cycle_id => job.cycle_id,
      p_ended_analysis_receipt_id => job.ended_analysis_receipt_id,
      p_idempotency_key => job.demotion_idempotency_key,
      p_request_hash => job.demotion_request_hash,
      p_listing_artifact_hash => job.listing_artifact_hash,
      p_analysis_evidence_hash => job.analysis_evidence_hash,
      p_candidate_set_hash => job.candidate_set_hash,
      p_candidate_psdeals_ids => job.candidate_psdeals_ids,
      p_expected_count => job.expected_count,
      p_applied_at => job.applied_at
    );

    if demotion_result.status <> 'committed' or demotion_result.id is null then
      v_error_code := coalesce(demotion_result.error_code::text,'DEMOTION_V5_V4_NOT_COMMITTED');
      update public.lobodeals_async_demotion_jobs
      set status='failed',
          demotion_receipt_id=demotion_result.id,
          affected_rows=demotion_result.affected_rows,
          result=demotion_result.result,
          error_code=v_error_code,
          finished_at=clock_timestamp(),
          updated_at=clock_timestamp()
      where id=p_job_id;
      perform cron.unschedule(job.cron_job_name);
      return;
    end if;

    update public.lobodeals_async_demotion_jobs
    set status='succeeded',
        demotion_receipt_id=demotion_result.id,
        affected_rows=demotion_result.affected_rows,
        result=demotion_result.result,
        error_code=null,
        finished_at=clock_timestamp(),
        updated_at=clock_timestamp()
    where id=p_job_id;

  exception when others then
    update public.lobodeals_async_demotion_jobs
    set status='failed',
        error_code='DEMOTION_V5_' || sqlstate,
        result=jsonb_build_object('message',sqlerrm,'sqlstate',sqlstate),
        finished_at=clock_timestamp(),
        updated_at=clock_timestamp()
    where id=p_job_id;
  end;

  perform cron.unschedule(job.cron_job_name);
end;
$function$;

alter function public.run_lobodeals_ended_demotion_v5(uuid) owner to postgres;
revoke all on function public.run_lobodeals_ended_demotion_v5(uuid) from public, anon, authenticated, service_role;

create or replace function public.enqueue_lobodeals_ended_demotion_v5(
  p_cycle_id uuid,
  p_ended_analysis_receipt_id uuid,
  p_demotion_idempotency_key text,
  p_demotion_request_hash text,
  p_listing_artifact_hash text,
  p_analysis_evidence_hash text,
  p_candidate_set_hash text,
  p_candidate_psdeals_ids bigint[],
  p_expected_count integer,
  p_applied_at timestamptz
)
returns table(
  job_id uuid,
  job_status text,
  reconciled boolean,
  cron_job_id bigint,
  demotion_receipt_id uuid,
  affected_rows integer,
  demotion_result jsonb,
  error_code text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  analysis_row public.psdeals_cycle_action_receipts%rowtype;
  existing_job public.lobodeals_async_demotion_jobs%rowtype;
  new_job public.lobodeals_async_demotion_jobs%rowtype;
  v_job_name text;
  v_cron_job_id bigint;
  v_command text;
begin
  if p_demotion_idempotency_key is null or length(trim(p_demotion_idempotency_key))=0
     or p_demotion_request_hash !~ '^[a-f0-9]{64}$'
     or p_listing_artifact_hash !~ '^[a-f0-9]{64}$'
     or p_analysis_evidence_hash !~ '^[a-f0-9]{64}$'
     or p_candidate_set_hash !~ '^[a-f0-9]{64}$'
     or p_candidate_psdeals_ids is null
     or p_expected_count is null
     or p_expected_count < 0
     or p_expected_count > 5000
     or cardinality(p_candidate_psdeals_ids) <> p_expected_count
     or p_applied_at is null then
    raise exception 'LOBODEALS_DEMOTION_V5_ARGUMENT_INVALID';
  end if;

  select * into cycle_row
  from public.price_refresh_cycles
  where id=p_cycle_id;

  if not found
     or cycle_row.status <> 'running'
     or cycle_row.listing_complete is distinct from true
     or cycle_row.listing_completed_at is null then
    raise exception 'LOBODEALS_DEMOTION_V5_CYCLE_NOT_READY';
  end if;

  select * into analysis_row
  from public.psdeals_cycle_action_receipts
  where id=p_ended_analysis_receipt_id;

  if not found
     or analysis_row.cycle_id <> p_cycle_id
     or analysis_row.action_kind <> 'ended_deals_analysis'
     or analysis_row.status <> 'committed' then
    raise exception 'LOBODEALS_DEMOTION_V5_ANALYSIS_RECEIPT_INVALID';
  end if;

  select * into existing_job
  from public.lobodeals_async_demotion_jobs
  where demotion_idempotency_key=p_demotion_idempotency_key;

  if found then
    if existing_job.cycle_id <> p_cycle_id
       or existing_job.ended_analysis_receipt_id <> p_ended_analysis_receipt_id
       or existing_job.demotion_request_hash <> p_demotion_request_hash
       or existing_job.listing_artifact_hash <> p_listing_artifact_hash
       or existing_job.analysis_evidence_hash <> p_analysis_evidence_hash
       or existing_job.candidate_set_hash <> p_candidate_set_hash
       or existing_job.candidate_psdeals_ids <> p_candidate_psdeals_ids
       or existing_job.expected_count <> p_expected_count
       or existing_job.applied_at <> p_applied_at then
      raise exception 'LOBODEALS_DEMOTION_V5_IDEMPOTENCY_MISMATCH';
    end if;

    return query select
      existing_job.id,
      existing_job.status,
      true,
      existing_job.cron_job_id,
      existing_job.demotion_receipt_id,
      existing_job.affected_rows,
      existing_job.result,
      existing_job.error_code::text;
    return;
  end if;

  v_job_name := 'lobodeals-demotion-' || replace(gen_random_uuid()::text,'-','');

  insert into public.lobodeals_async_demotion_jobs(
    cycle_id,ended_analysis_receipt_id,demotion_idempotency_key,demotion_request_hash,
    listing_artifact_hash,analysis_evidence_hash,candidate_set_hash,candidate_psdeals_ids,
    expected_count,applied_at,status,cron_job_name
  ) values (
    p_cycle_id,p_ended_analysis_receipt_id,p_demotion_idempotency_key,p_demotion_request_hash,
    p_listing_artifact_hash,p_analysis_evidence_hash,p_candidate_set_hash,p_candidate_psdeals_ids,
    p_expected_count,p_applied_at,'queued',v_job_name
  ) returning * into new_job;

  v_command := format(
    'select public.run_lobodeals_ended_demotion_v5(%L::uuid);',
    new_job.id::text
  );

  select cron.schedule(v_job_name,'5 seconds',v_command) into v_cron_job_id;

  update public.lobodeals_async_demotion_jobs
  set cron_job_id=v_cron_job_id, updated_at=clock_timestamp()
  where id=new_job.id
  returning * into new_job;

  return query select
    new_job.id,
    new_job.status,
    false,
    new_job.cron_job_id,
    new_job.demotion_receipt_id,
    new_job.affected_rows,
    new_job.result,
    new_job.error_code::text;
end;
$function$;

alter function public.enqueue_lobodeals_ended_demotion_v5(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamptz) owner to postgres;
revoke all on function public.enqueue_lobodeals_ended_demotion_v5(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_lobodeals_ended_demotion_v5(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamptz) to service_role;

create or replace function public.get_lobodeals_ended_demotion_v5(p_job_id uuid)
returns table(
  job_id uuid,
  job_status text,
  reconciled boolean,
  cron_job_id bigint,
  demotion_receipt_id uuid,
  affected_rows integer,
  demotion_result jsonb,
  error_code text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    j.id,
    j.status,
    false,
    j.cron_job_id,
    j.demotion_receipt_id,
    j.affected_rows,
    j.result,
    j.error_code::text
  from public.lobodeals_async_demotion_jobs j
  where j.id=p_job_id;
$function$;

alter function public.get_lobodeals_ended_demotion_v5(uuid) owner to postgres;
revoke all on function public.get_lobodeals_ended_demotion_v5(uuid) from public, anon, authenticated;
grant execute on function public.get_lobodeals_ended_demotion_v5(uuid) to service_role;

create or replace function public.lobodeals_daily_runner_v23_preflight()
returns table(
  contract_version integer,
  pg_cron_present boolean,
  enqueue_demotion_v5_present boolean,
  poll_demotion_v5_present boolean,
  apply_demotion_v4_present boolean,
  async_cache_v18_present boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    23::integer,
    exists(select 1 from pg_catalog.pg_extension where extname='pg_cron'),
    to_regprocedure('public.enqueue_lobodeals_ended_demotion_v5(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamp with time zone)') is not null,
    to_regprocedure('public.get_lobodeals_ended_demotion_v5(uuid)') is not null,
    to_regprocedure('public.apply_psdeals_ended_deals_v4(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamp with time zone)') is not null,
    to_regprocedure('public.enqueue_lobodeals_catalog_cache_refresh_v18(uuid,uuid,text,text,timestamp with time zone)') is not null;
$function$;

alter function public.lobodeals_daily_runner_v23_preflight() owner to postgres;
revoke all on function public.lobodeals_daily_runner_v23_preflight() from public, anon, authenticated;
grant execute on function public.lobodeals_daily_runner_v23_preflight() to service_role;
commit;

