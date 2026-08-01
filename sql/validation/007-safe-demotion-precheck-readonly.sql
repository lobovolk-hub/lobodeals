-- Diagnostic read-only precheck for migration 007. This file intentionally
-- returns several focused result sets; the canonical certificate is the
-- single-statement companion file.

select
  statement_timestamp() as checked_at,
  pg_catalog.pg_backend_pid() as backend_pid,
  pg_catalog.pg_current_snapshot()::text as snapshot,
  current_database() as database_name,
  current_user as session_role,
  current_setting('server_version') as server_version;

select version, name
from supabase_migrations.schema_migrations
where name in (
  'lobodeals_3_reconciliable_cycle_actions',
  'lobodeals_3_cycle_bound_price_certification',
  'lobodeals_3_restrictive_price_history_retirement',
  'lobodeals_3_safe_demotion_hardening'
)
order by version;

select
  (select count(*) from public.price_refresh_cycles)::bigint as cycles,
  (select count(*) from public.psdeals_cycle_action_receipts)::bigint as receipts,
  (select count(*) from public.psdeals_stage_items)::bigint as stage_rows,
  (select count(*) from public.ps_plus_monthly_games)::bigint as monthly_rows,
  (select count(*) from public.catalog_public_cache)::bigint as cache_rows;

select
  namespace.nspname as schema_name,
  procedure.proname,
  pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments,
  owner_role.rolname as owner_name,
  procedure.prosecdef as security_definer,
  procedure.proconfig,
  pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(pg_catalog.pg_get_functiondef(procedure.oid), 'UTF8')
    ),
    'hex'
  ) as definition_sha256,
  pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
  pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
join pg_catalog.pg_roles as owner_role on owner_role.oid = procedure.proowner
where namespace.nspname = 'public'
  and procedure.proname in (
    'apply_psdeals_ended_deals_v1',
    'apply_psdeals_ended_deals_v2',
    'certify_price_refresh_cycle_v3',
    'refresh_catalog_public_cache_v16'
  )
order by procedure.proname, identity_arguments;

select
  lock_row.relation::regclass::text as relation_name,
  lock_row.mode,
  lock_row.granted,
  count(*)::integer as lock_count
from pg_catalog.pg_locks as lock_row
where lock_row.pid <> pg_catalog.pg_backend_pid()
  and lock_row.relation in (
    'public.price_refresh_cycles'::regclass,
    'public.psdeals_cycle_action_receipts'::regclass,
    'public.psdeals_stage_items'::regclass,
    'public.ps_plus_monthly_games'::regclass
  )
group by lock_row.relation, lock_row.mode, lock_row.granted
order by relation_name, lock_row.mode, lock_row.granted;

select
  count(*)::integer as other_active_client_backends,
  count(*) filter (
    where activity.query ~* '(price_refresh_cycles|psdeals_cycle_action_receipts|psdeals_stage_items|ps_plus_monthly_games)'
  )::integer as relevant_active_client_backends
from pg_catalog.pg_stat_activity as activity
where activity.pid <> pg_catalog.pg_backend_pid()
  and activity.backend_type = 'client backend'
  and activity.state is distinct from 'idle';
