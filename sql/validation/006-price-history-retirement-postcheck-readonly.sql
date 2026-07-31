-- Read-only integrity evidence to capture only after a separately authorized
-- and successful application of migration 006.

select
  clock_timestamp() as checked_at,
  to_regclass('public.psdeals_stage_price_history') as history_object,
  pg_database_size(current_database()) as database_bytes;

select count(*)::integer as remaining_history_indexes
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename = 'psdeals_stage_price_history';

select count(*)::integer as remaining_history_policies
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = 'psdeals_stage_price_history';

select count(*)::integer as remaining_history_grants
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'psdeals_stage_price_history';

select
  count(*)::bigint as stage_rows,
  count(*) filter (
    where lobodeals_lowest_regular_price_amount is not null
  )::bigint as regular_lows,
  count(*) filter (
    where lobodeals_lowest_ps_plus_price_amount is not null
  )::bigint as ps_plus_lows
from public.psdeals_stage_items;

select
  (select count(*) from public.price_refresh_cycles) as cycles,
  (
    select count(*)
    from public.psdeals_cycle_action_receipts
  ) as receipts,
  (select count(*) from public.ps_plus_monthly_games) as monthly_rows,
  (select count(*) from public.catalog_public_cache) as cache_rows;
