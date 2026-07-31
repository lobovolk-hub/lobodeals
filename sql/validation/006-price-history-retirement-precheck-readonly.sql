-- Read-only evidence to capture immediately before a separately authorized
-- application of migration 006.

select
  clock_timestamp() as checked_at,
  current_database() as database_name,
  current_user as session_role,
  to_regclass('public.psdeals_stage_price_history') as history_object,
  pg_database_size(current_database()) as database_bytes;

select
  count(*)::bigint as history_rows,
  pg_relation_size('public.psdeals_stage_price_history') as heap_bytes,
  pg_indexes_size('public.psdeals_stage_price_history') as index_bytes,
  pg_total_relation_size(
    'public.psdeals_stage_price_history'
  ) as total_bytes,
  min(observed_at) as oldest_observation,
  max(observed_at) as newest_observation
from public.psdeals_stage_price_history;

select
  column_name,
  data_type,
  is_nullable,
  column_default,
  numeric_precision,
  numeric_scale
from information_schema.columns
where table_schema = 'public'
  and table_name = 'psdeals_stage_price_history'
order by ordinal_position;

select
  constraint_row.conname,
  constraint_row.contype,
  constraint_row.conrelid::regclass as source_object,
  constraint_row.confrelid::regclass as referenced_object,
  pg_catalog.pg_get_constraintdef(
    constraint_row.oid
  ) as definition
from pg_catalog.pg_constraint as constraint_row
where constraint_row.conrelid =
    'public.psdeals_stage_price_history'::regclass
  or constraint_row.confrelid =
    'public.psdeals_stage_price_history'::regclass
order by constraint_row.conname;

select indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename = 'psdeals_stage_price_history'
order by indexname;

select
  dependency.classid::regclass as dependent_catalog,
  dependency.objid,
  dependency.objsubid,
  dependency.deptype
from pg_catalog.pg_depend as dependency
where dependency.refobjid =
  'public.psdeals_stage_price_history'::regclass
order by dependent_catalog::text, dependency.objid, dependency.objsubid;

select
  trigger_row.tgname,
  trigger_row.tgisinternal,
  pg_catalog.pg_get_triggerdef(trigger_row.oid) as definition
from pg_catalog.pg_trigger as trigger_row
where trigger_row.tgrelid =
  'public.psdeals_stage_price_history'::regclass
order by trigger_row.tgisinternal, trigger_row.tgname;

select
  namespace.nspname as schema_name,
  procedure.proname,
  pg_catalog.pg_get_function_identity_arguments(
    procedure.oid
  ) as arguments
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
where namespace.nspname not in ('pg_catalog', 'information_schema')
  and procedure.prokind in ('f', 'p')
  and pg_catalog.pg_get_functiondef(procedure.oid)
    ilike '%psdeals_stage_price_history%'
order by schema_name, procedure.proname, arguments;

select schemaname, viewname
from pg_catalog.pg_views
where definition ilike '%psdeals_stage_price_history%'
union all
select schemaname, matviewname
from pg_catalog.pg_matviews
where definition ilike '%psdeals_stage_price_history%'
order by 1, 2;

select
  policy.policyname,
  policy.roles,
  policy.cmd,
  policy.qual,
  policy.with_check
from pg_catalog.pg_policies as policy
where policy.schemaname = 'public'
  and policy.tablename = 'psdeals_stage_price_history';

select
  grant_row.grantee,
  grant_row.privilege_type
from information_schema.role_table_grants as grant_row
where grant_row.table_schema = 'public'
  and grant_row.table_name = 'psdeals_stage_price_history'
order by grant_row.grantee, grant_row.privilege_type;

select
  lock_row.pid,
  lock_row.mode,
  lock_row.granted,
  activity.usename,
  activity.state,
  activity.query_start
from pg_catalog.pg_locks as lock_row
left join pg_catalog.pg_stat_activity as activity
  on activity.pid = lock_row.pid
where lock_row.relation =
  'public.psdeals_stage_price_history'::regclass
order by lock_row.granted, lock_row.mode, lock_row.pid;

select
  activity.pid,
  activity.usename,
  activity.application_name,
  activity.state,
  activity.xact_start,
  activity.query_start,
  activity.wait_event_type,
  activity.wait_event
from pg_catalog.pg_stat_activity as activity
where activity.pid <> pg_backend_pid()
  and activity.state is distinct from 'idle'
order by activity.xact_start nulls last, activity.query_start;

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
