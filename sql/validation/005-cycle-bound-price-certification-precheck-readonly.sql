-- Read-only evidence to capture immediately before a separately authorized
-- application of migration 005.

select
  clock_timestamp() as checked_at,
  current_database() as database_name,
  current_user as session_role,
  pg_database_size(current_database()) as database_bytes,
  to_regclass('public.psdeals_stage_items') as stage_object,
  to_regclass('public.price_refresh_cycles') as cycles_object,
  to_regclass(
    'public.psdeals_cycle_action_receipts'
  ) as receipts_object,
  to_regprocedure(
    'public.certify_price_refresh_cycle(uuid)'
  ) as certification_v1,
  to_regprocedure(
    'public.certify_price_refresh_cycle_v2(uuid,uuid,text,text,timestamp with time zone)'
  ) as certification_v2,
  to_regprocedure(
    'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
  ) as certification_v3;

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
  ) as receipts;

select
  column_name,
  data_type,
  is_nullable,
  column_default,
  numeric_precision,
  numeric_scale
from information_schema.columns
where table_schema = 'public'
  and table_name = 'psdeals_stage_items'
  and column_name in (
    'id',
    'psdeals_id',
    'region_code',
    'storefront',
    'lobodeals_lowest_regular_price_amount',
    'lobodeals_lowest_regular_price_first_seen_at',
    'lobodeals_lowest_ps_plus_price_amount',
    'lobodeals_lowest_ps_plus_price_first_seen_at',
    'regular_certification_cycle_id',
    'regular_certification_observed_at',
    'regular_certification_evidence_sha256',
    'regular_certification_candidate',
    'ps_plus_certification_cycle_id',
    'ps_plus_certification_observed_at',
    'ps_plus_certification_evidence_sha256',
    'ps_plus_certification_candidate'
  )
order by ordinal_position;

select
  namespace.nspname as schema_name,
  procedure.proname,
  pg_catalog.pg_get_function_identity_arguments(
    procedure.oid
  ) as arguments,
  owner_role.rolname as owner_name,
  procedure.prosecdef as security_definer,
  procedure.proconfig as function_settings
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
join pg_catalog.pg_roles as owner_role
  on owner_role.oid = procedure.proowner
where namespace.nspname = 'public'
  and procedure.proname in (
    'certify_price_refresh_cycle',
    'certify_price_refresh_cycle_v2',
    'certify_price_refresh_cycle_v3',
    '_psdeals_certification_candidate_sha256_v1'
  )
order by procedure.proname, arguments;

select
  procedure.proname,
  pg_catalog.pg_get_function_identity_arguments(
    procedure.oid
  ) as arguments,
  role_row.rolname as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(
    procedure.proacl,
    pg_catalog.acldefault('f', procedure.proowner)
  )
) as acl
left join pg_catalog.pg_roles as role_row
  on role_row.oid = acl.grantee
where namespace.nspname = 'public'
  and procedure.proname in (
    'certify_price_refresh_cycle',
    'certify_price_refresh_cycle_v2',
    'certify_price_refresh_cycle_v3',
    '_psdeals_certification_candidate_sha256_v1'
  )
order by procedure.proname, arguments, grantee;
