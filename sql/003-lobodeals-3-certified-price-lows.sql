-- LoboDeals 3.0
-- Certified price-refresh cycles and compact all-time lows.
--
-- This migration:
--   1. Creates an internal record for complete price-refresh cycles.
--   2. Adds compact LoboDeals-owned regular and PS Plus lows.
--   3. Creates the atomic certification function that updates those lows.
--   4. Restricts the new internal table and function to privileged roles.
--
-- This migration does not:
--   1. Initialize lows from the legacy detailed history.
--   2. Invent historical first-seen timestamps.
--   3. Delete public.psdeals_stage_price_history.
--   4. Refresh public.catalog_public_cache.
--
-- Apply this file once against the live schema only after reviewing it.

begin;

do $preflight$
declare
  stage_required_column_count integer;
  monthly_required_column_count integer;
begin
  if to_regclass(
    'public.psdeals_stage_items'
  ) is null then
    raise exception
      'Required table public.psdeals_stage_items does not exist.';
  end if;

  if to_regclass(
    'public.ps_plus_monthly_games'
  ) is null then
    raise exception
      'Required table public.ps_plus_monthly_games does not exist.';
  end if;

  if to_regprocedure(
    'public.set_updated_at()'
  ) is null then
    raise exception
      'Required function public.set_updated_at() does not exist.';
  end if;

  select count(*)
  into stage_required_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'psdeals_stage_items'
    and column_name in (
      'id',
      'region_code',
      'storefront',
      'currency_code',
      'current_price_amount',
      'original_price_amount',
      'discount_percent',
      'deal_ends_at',
      'is_free_to_play',
      'is_ps_plus_discount',
      'raw_detail_json',
      'listing_last_seen_at',
      'detail_last_synced_at'
    );

  if stage_required_column_count <> 13 then
    raise exception
      'public.psdeals_stage_items is missing one or more required columns.';
  end if;

  select count(*)
  into monthly_required_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'ps_plus_monthly_games'
    and column_name in (
      'item_id',
      'is_active',
      'active_from',
      'active_until',
      'active_from_at',
      'active_until_at'
    );

  if monthly_required_column_count <> 6 then
    raise exception
      'public.ps_plus_monthly_games is missing one or more required columns.';
  end if;

  if to_regclass(
    'public.price_refresh_cycles'
  ) is not null then
    raise exception
      'public.price_refresh_cycles already exists.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'psdeals_stage_items'
      and column_name in (
        'lobodeals_lowest_regular_price_amount',
        'lobodeals_lowest_regular_price_first_seen_at',
        'lobodeals_lowest_ps_plus_price_amount',
        'lobodeals_lowest_ps_plus_price_first_seen_at'
      )
  ) then
    raise exception
      'One or more proposed compact-low columns already exist.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname =
        'certify_price_refresh_cycle'
  ) then
    raise exception
      'public.certify_price_refresh_cycle already exists.';
  end if;
end;
$preflight$;

alter table public.psdeals_stage_items
  add column
    lobodeals_lowest_regular_price_amount
    numeric(10,2) null,
  add column
    lobodeals_lowest_regular_price_first_seen_at
    timestamptz null,
  add column
    lobodeals_lowest_ps_plus_price_amount
    numeric(10,2) null,
  add column
    lobodeals_lowest_ps_plus_price_first_seen_at
    timestamptz null;

alter table public.psdeals_stage_items
  add constraint
    psdeals_stage_items_lobodeals_regular_low_positive_check
    check (
      lobodeals_lowest_regular_price_amount is null
      or lobodeals_lowest_regular_price_amount > 0
    ),
  add constraint
    psdeals_stage_items_lobodeals_regular_low_pair_check
    check (
      (
        lobodeals_lowest_regular_price_amount is null
        and
        lobodeals_lowest_regular_price_first_seen_at is null
      )
      or
      (
        lobodeals_lowest_regular_price_amount is not null
        and
        lobodeals_lowest_regular_price_first_seen_at is not null
      )
    ),
  add constraint
    psdeals_stage_items_lobodeals_ps_plus_low_positive_check
    check (
      lobodeals_lowest_ps_plus_price_amount is null
      or lobodeals_lowest_ps_plus_price_amount > 0
    ),
  add constraint
    psdeals_stage_items_lobodeals_ps_plus_low_pair_check
    check (
      (
        lobodeals_lowest_ps_plus_price_amount is null
        and
        lobodeals_lowest_ps_plus_price_first_seen_at is null
      )
      or
      (
        lobodeals_lowest_ps_plus_price_amount is not null
        and
        lobodeals_lowest_ps_plus_price_first_seen_at is not null
      )
    );

comment on column
  public.psdeals_stage_items.lobodeals_lowest_regular_price_amount
is
  'Lowest certified positive regular sale price observed by LoboDeals 3.0.';

comment on column
  public.psdeals_stage_items.lobodeals_lowest_regular_price_first_seen_at
is
  'Source observation timestamp when the current LoboDeals regular low was first observed.';

comment on column
  public.psdeals_stage_items.lobodeals_lowest_ps_plus_price_amount
is
  'Lowest certified positive PS Plus sale price observed by LoboDeals 3.0.';

comment on column
  public.psdeals_stage_items.lobodeals_lowest_ps_plus_price_first_seen_at
is
  'Source observation timestamp when the current LoboDeals PS Plus low was first observed.';

create table public.price_refresh_cycles (
  id uuid primary key default gen_random_uuid(),

  region_code text not null default 'us',
  storefront text not null default 'playstation',
  cycle_date date not null,

  status text not null default 'running',

  listing_completed_at timestamptz null,
  details_completed_at timestamptz null,
  ended_discounts_completed_at timestamptz null,
  monthly_games_checked_at timestamptz null,
  validation_completed_at timestamptz null,
  validation_passed boolean not null default false,

  items_seen integer not null default 0,
  items_updated integer not null default 0,
  items_failed integer not null default 0,
  new_items_detected integer not null default 0,
  ended_discounts_applied integer not null default 0,

  regular_lows_initialized integer not null default 0,
  regular_lows_lowered integer not null default 0,
  ps_plus_lows_initialized integer not null default 0,
  ps_plus_lows_lowered integer not null default 0,

  failure_reason text null,
  metrics jsonb not null default '{}'::jsonb,

  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  certified_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint price_refresh_cycles_status_check
    check (
      status in (
        'running',
        'succeeded',
        'failed',
        'partial',
        'cancelled',
        'certified'
      )
    ),

  constraint price_refresh_cycles_nonnegative_counts_check
    check (
      items_seen >= 0
      and items_updated >= 0
      and items_failed >= 0
      and new_items_detected >= 0
      and ended_discounts_applied >= 0
      and regular_lows_initialized >= 0
      and regular_lows_lowered >= 0
      and ps_plus_lows_initialized >= 0
      and ps_plus_lows_lowered >= 0
    ),

  constraint price_refresh_cycles_metrics_object_check
    check (
      jsonb_typeof(metrics) = 'object'
    ),

  constraint price_refresh_cycles_finished_after_start_check
    check (
      finished_at is null
      or finished_at >= started_at
    ),

  constraint price_refresh_cycles_status_timestamps_check
    check (
      (
        status = 'running'
        and finished_at is null
        and certified_at is null
      )
      or
      (
        status in (
          'succeeded',
          'failed',
          'partial',
          'cancelled'
        )
        and finished_at is not null
        and certified_at is null
      )
      or
      (
        status = 'certified'
        and finished_at is not null
        and certified_at is not null
      )
    ),

  constraint price_refresh_cycles_validation_check
    check (
      validation_passed = false
      or (
        validation_completed_at is not null
        and status in (
          'succeeded',
          'certified'
        )
      )
    ),

  constraint price_refresh_cycles_certified_after_finish_check
    check (
      certified_at is null
      or certified_at >= finished_at
    )
);

comment on table public.price_refresh_cycles is
  'Internal record of complete LoboDeals price-refresh cycles and their certification result.';

comment on column public.price_refresh_cycles.cycle_date is
  'Operational calendar date assigned explicitly by the price-refresh runner.';

comment on column public.price_refresh_cycles.items_seen is
  'Count of unique listing items whose listing_last_seen_at exactly matches this cycle listing_completed_at.';

comment on column
  public.price_refresh_cycles.monthly_games_checked_at
is
  'Timestamp proving that the current PS Plus monthly-games source was checked during the cycle.';

comment on column public.price_refresh_cycles.certified_at is
  'Timestamp at which compact LoboDeals lows were atomically evaluated and updated.';

create index price_refresh_cycles_status_idx
  on public.price_refresh_cycles (
    status,
    started_at desc
  );

create index price_refresh_cycles_certified_at_idx
  on public.price_refresh_cycles (
    certified_at desc
  )
  where certified_at is not null;

create index price_refresh_cycles_storefront_date_idx
  on public.price_refresh_cycles (
    region_code,
    storefront,
    cycle_date desc,
    started_at desc
  );

create unique index
  price_refresh_cycles_certified_date_unique_idx
  on public.price_refresh_cycles (
    region_code,
    storefront,
    cycle_date
  )
  where status = 'certified';

create trigger
  trg_price_refresh_cycles_set_updated_at
before update
on public.price_refresh_cycles
for each row
execute function public.set_updated_at();

alter table public.price_refresh_cycles
  enable row level security;

revoke all
  on table public.price_refresh_cycles
  from public, anon, authenticated;

grant select, insert, update
  on table public.price_refresh_cycles
  to service_role;

grant all
  on table public.price_refresh_cycles
  to postgres;

create or replace function
  public.certify_price_refresh_cycle(
    p_cycle_id uuid
  )
returns table (
  cycle_id uuid,
  certification_timestamp timestamptz,
  regular_initialized integer,
  regular_lowered integer,
  ps_plus_initialized integer,
  ps_plus_lowered integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;

  certification_time timestamptz;

  listing_observed_count integer := 0;

  regular_initialized_count integer := 0;
  regular_lowered_count integer := 0;
  ps_plus_initialized_count integer := 0;
  ps_plus_lowered_count integer := 0;
begin
  select *
  into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id
  for update;

  if not found then
    raise exception
      'Price-refresh cycle % does not exist.',
      p_cycle_id;
  end if;

  if cycle_row.region_code <> 'us'
    or cycle_row.storefront <> 'playstation' then
    raise exception
      'Cycle % is not a US PlayStation cycle.',
      p_cycle_id;
  end if;

  if cycle_row.status = 'certified' then
    raise exception
      'Cycle % has already been certified.',
      p_cycle_id;
  end if;

  if cycle_row.status <> 'succeeded' then
    raise exception
      'Cycle % must have status succeeded before certification. Current status: %.',
      p_cycle_id,
      cycle_row.status;
  end if;

  if cycle_row.finished_at is null then
    raise exception
      'Cycle % has no finished_at timestamp.',
      p_cycle_id;
  end if;

  if cycle_row.finished_at < cycle_row.started_at then
    raise exception
      'Cycle % finished before it started.',
      p_cycle_id;
  end if;

  if cycle_row.validation_passed is distinct from true
    or cycle_row.validation_completed_at is null then
    raise exception
      'Cycle % has not passed its final validation.',
      p_cycle_id;
  end if;

  if cycle_row.items_seen <= 0 then
    raise exception
      'Cycle % cannot be certified with items_seen <= 0.',
      p_cycle_id;
  end if;

  if cycle_row.items_failed <> 0 then
    raise exception
      'Cycle % cannot be certified with % failed items.',
      p_cycle_id,
      cycle_row.items_failed;
  end if;

  if cycle_row.failure_reason is not null then
    raise exception
      'Cycle % still has a failure reason: %.',
      p_cycle_id,
      cycle_row.failure_reason;
  end if;

  if cycle_row.listing_completed_at is null
    or cycle_row.details_completed_at is null
    or cycle_row.ended_discounts_completed_at is null
    or cycle_row.monthly_games_checked_at is null then
    raise exception
      'Cycle % is missing one or more required completion timestamps.',
      p_cycle_id;
  end if;

  if cycle_row.listing_completed_at < cycle_row.started_at
    or cycle_row.details_completed_at < cycle_row.started_at
    or cycle_row.ended_discounts_completed_at < cycle_row.started_at
    or cycle_row.monthly_games_checked_at < cycle_row.started_at
    or cycle_row.validation_completed_at < cycle_row.started_at then
    raise exception
      'Cycle % has a completion timestamp before started_at.',
      p_cycle_id;
  end if;

  if cycle_row.listing_completed_at > cycle_row.finished_at
    or cycle_row.details_completed_at > cycle_row.finished_at
    or cycle_row.ended_discounts_completed_at >
      cycle_row.finished_at
    or cycle_row.monthly_games_checked_at >
      cycle_row.finished_at
    or cycle_row.validation_completed_at >
      cycle_row.finished_at then
    raise exception
      'Cycle % has a completion timestamp after finished_at.',
      p_cycle_id;
  end if;

  if cycle_row.validation_completed_at < greatest(
    cycle_row.listing_completed_at,
    cycle_row.details_completed_at,
    cycle_row.ended_discounts_completed_at,
    cycle_row.monthly_games_checked_at
  ) then
    raise exception
      'Cycle % was validated before all required stages completed.',
      p_cycle_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      cycle_row.region_code
        || ':'
        || cycle_row.storefront
        || ':certified-price-lows',
      0
    )
  );

  select count(*)::integer
  into listing_observed_count
  from public.psdeals_stage_items as item
  where item.region_code = cycle_row.region_code
    and item.storefront = cycle_row.storefront
    and item.listing_last_seen_at =
      cycle_row.listing_completed_at;

  if listing_observed_count <>
    cycle_row.items_seen then
    raise exception
      'Cycle % declares % listing items, but % rows were marked with listing_completed_at %.',
      p_cycle_id,
      cycle_row.items_seen,
      listing_observed_count,
      cycle_row.listing_completed_at;
  end if;

  certification_time := clock_timestamp();

  with regular_candidates as (
    select
      item.id,
      item.current_price_amount as candidate_amount,
      item.listing_last_seen_at as observed_at,
      item.lobodeals_lowest_regular_price_amount
        as previous_amount
    from public.psdeals_stage_items as item
    where item.region_code = cycle_row.region_code
      and item.storefront = cycle_row.storefront
      and item.currency_code = 'USD'
      and item.is_free_to_play = false
      and item.current_price_amount is not null
      and item.current_price_amount > 0
      and item.original_price_amount is not null
      and item.original_price_amount >
        item.current_price_amount
      and item.discount_percent between 1 and 99
      and item.original_price_amount <=
        item.current_price_amount * 20
      and item.listing_last_seen_at is not null
      and (
        item.deal_ends_at is null
        or item.deal_ends_at >
          item.listing_last_seen_at
      )
      and item.listing_last_seen_at =
        cycle_row.listing_completed_at
  ),
  regular_updates as (
    update public.psdeals_stage_items as item
    set
      lobodeals_lowest_regular_price_amount =
        candidate.candidate_amount,
      lobodeals_lowest_regular_price_first_seen_at =
        candidate.observed_at
    from regular_candidates as candidate
    where item.id = candidate.id
      and (
        item.lobodeals_lowest_regular_price_amount
          is null
        or candidate.candidate_amount <
          item.lobodeals_lowest_regular_price_amount
      )
    returning
      (
        candidate.previous_amount is null
      ) as initialized
  )
  select
    (
      count(*) filter (
        where initialized
      )
    )::integer,
    (
      count(*) filter (
        where not initialized
      )
    )::integer
  into
    regular_initialized_count,
    regular_lowered_count
  from regular_updates;

  with ps_plus_source as (
    select
      item.*,
      case
        when coalesce(
          item.raw_detail_json
            ->> 'current_ps_plus_price_amount',
          ''
        ) ~ '^[0-9]+(\.[0-9]{1,2})?$'
          then (
            item.raw_detail_json
              ->> 'current_ps_plus_price_amount'
          )::numeric
        else null
      end as candidate_amount
    from public.psdeals_stage_items as item
    where item.region_code = cycle_row.region_code
      and item.storefront = cycle_row.storefront
      and item.detail_last_synced_at is not null
      and item.detail_last_synced_at >=
        cycle_row.started_at
      and item.detail_last_synced_at <=
        cycle_row.details_completed_at
  ),
  ps_plus_candidates as (
    select
      source.id,
      source.candidate_amount,
      source.detail_last_synced_at as observed_at,
      source.lobodeals_lowest_ps_plus_price_amount
        as previous_amount
    from ps_plus_source as source
    where source.currency_code = 'USD'
      and source.is_free_to_play = false
      and source.is_ps_plus_discount = true
      and source.candidate_amount is not null
      and source.candidate_amount > 0
      and source.candidate_amount <= 99999999.99
      and source.current_price_amount is not null
      and source.current_price_amount > 0
      and source.candidate_amount <
        source.current_price_amount
      and (
        source.deal_ends_at is null
        or source.deal_ends_at >
          source.detail_last_synced_at
      )
      and not exists (
        select 1
        from public.ps_plus_monthly_games
          as monthly_game
        where monthly_game.item_id = source.id
          and monthly_game.is_active = true
          and coalesce(
            monthly_game.active_from_at,
            monthly_game.active_from::timestamptz
          ) <= source.detail_last_synced_at
          and coalesce(
            monthly_game.active_until_at,
            (
              monthly_game.active_until + 1
            )::timestamptz
          ) > source.detail_last_synced_at
      )
  ),
  ps_plus_updates as (
    update public.psdeals_stage_items as item
    set
      lobodeals_lowest_ps_plus_price_amount =
        candidate.candidate_amount,
      lobodeals_lowest_ps_plus_price_first_seen_at =
        candidate.observed_at
    from ps_plus_candidates as candidate
    where item.id = candidate.id
      and (
        item.lobodeals_lowest_ps_plus_price_amount
          is null
        or candidate.candidate_amount <
          item.lobodeals_lowest_ps_plus_price_amount
      )
    returning
      (
        candidate.previous_amount is null
      ) as initialized
  )
  select
    (
      count(*) filter (
        where initialized
      )
    )::integer,
    (
      count(*) filter (
        where not initialized
      )
    )::integer
  into
    ps_plus_initialized_count,
    ps_plus_lowered_count
  from ps_plus_updates;

  update public.price_refresh_cycles
  set
    status = 'certified',
    certified_at = certification_time,
    regular_lows_initialized =
      regular_initialized_count,
    regular_lows_lowered =
      regular_lowered_count,
    ps_plus_lows_initialized =
      ps_plus_initialized_count,
    ps_plus_lows_lowered =
      ps_plus_lowered_count
  where id = cycle_row.id;

  return query
  select
    cycle_row.id,
    certification_time,
    regular_initialized_count,
    regular_lowered_count,
    ps_plus_initialized_count,
    ps_plus_lowered_count;
end;
$function$;

comment on function
  public.certify_price_refresh_cycle(uuid)
is
  'Certifies one completed US PlayStation price cycle and atomically initializes or lowers compact LoboDeals price records.';

revoke all
  on function
    public.certify_price_refresh_cycle(uuid)
  from public, anon, authenticated;

grant execute
  on function
    public.certify_price_refresh_cycle(uuid)
  to service_role, postgres;

commit;

-- Post-migration read-only verification.

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'psdeals_stage_items'
  and column_name like
    'lobodeals_lowest_%'
order by ordinal_position;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'price_refresh_cycles'
order by ordinal_position;

select
  relation.relname as table_name,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as rls_forced
from pg_catalog.pg_class as relation
join pg_catalog.pg_namespace as namespace
  on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname = 'price_refresh_cycles';

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'price_refresh_cycles'
order by grantee, privilege_type;

select
  routine.routine_name,
  routine.security_type
from information_schema.routines as routine
where routine.routine_schema = 'public'
  and routine.routine_name =
    'certify_price_refresh_cycle';