-- Read-only postcheck for a separately authorized application of migration 007.

with function_catalog as (
  select
    procedure.proname,
    owner_role.rolname as owner_name,
    procedure.prosecdef as security_definer,
    coalesce(procedure.proconfig, array[]::text[]) as proconfig,
    pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
    pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
    pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_roles as owner_role on owner_role.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname in ('apply_psdeals_ended_deals_v1', 'apply_psdeals_ended_deals_v2')
)
select
  statement_timestamp() as checked_at,
  pg_catalog.pg_backend_pid() as backend_pid,
  pg_catalog.pg_current_snapshot()::text as snapshot,
  (select count(*) from supabase_migrations.schema_migrations where name = 'lobodeals_3_safe_demotion_hardening') = 1 as migration_007_registered,
  to_regprocedure('public.apply_psdeals_ended_deals_v2(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamp with time zone)') is not null as v2_present,
  coalesce((select not service_role_execute from function_catalog where proname = 'apply_psdeals_ended_deals_v1'), false) as v1_service_role_revoked,
  coalesce((select service_role_execute and not anon_execute and not authenticated_execute and owner_name = 'postgres' and security_definer and proconfig = array['search_path=""']::text[] from function_catalog where proname = 'apply_psdeals_ended_deals_v2'), false) as v2_security_contract_matches,
  (select count(*) from public.price_refresh_cycles) = 0 as cycles_still_empty,
  (select count(*) from public.psdeals_cycle_action_receipts) = 0 as receipts_still_empty;
