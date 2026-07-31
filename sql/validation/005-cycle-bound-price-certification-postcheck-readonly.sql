-- Read-only integrity evidence to capture only after a separately authorized
-- and successful application of migration 005.

select
  '2e631ebaabe809d8828690f25de4ae8b0b598f6faf0519e114e71f7bde2b7b96'
    as expected_migration_005_sha256,
  1024::integer as candidate_max_bytes,
  1::integer as minimum_regular_discount_percent,
  99::integer as maximum_regular_discount_percent,
  array['game:game', 'bundle:bundle', 'dlc:addon']::text[]
    as certifiable_public_type_pairs,
  array['PS4', 'PS5', 'PS5,PS4']::text[]
    as canonical_platform_sets;

select
  clock_timestamp() as checked_at,
  current_database() as database_name,
  current_user as session_role,
  pg_database_size(current_database()) as database_bytes,
  to_regprocedure(
    'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
  ) as certification_v3,
  to_regprocedure(
    'public._psdeals_certification_candidate_sha256_v1(jsonb)'
  ) as candidate_hash_function;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'psdeals_stage_items'
  and column_name in (
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
  constraint_row.conname,
  constraint_row.contype,
  constraint_row.convalidated,
  constraint_row.confdeltype,
  constraint_row.confupdtype,
  pg_catalog.pg_get_constraintdef(
    constraint_row.oid
  ) as definition
from pg_catalog.pg_constraint as constraint_row
where constraint_row.conrelid =
    'public.psdeals_stage_items'::regclass
  and constraint_row.conname in (
    'psdeals_stage_items_regular_certification_cycle_fkey',
    'psdeals_stage_items_ps_plus_certification_cycle_fkey',
    'psdeals_stage_items_regular_certification_pair_check',
    'psdeals_stage_items_ps_plus_certification_pair_check'
  )
order by constraint_row.conname;

select
  indexname,
  indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename = 'psdeals_stage_items'
  and indexname in (
    'psdeals_stage_items_regular_certification_cycle_idx',
    'psdeals_stage_items_ps_plus_certification_cycle_idx'
  )
order by indexname;

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

with certification_function as (
  select lower(
    pg_catalog.pg_get_functiondef(procedure.oid)
  ) as definition
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'certify_price_refresh_cycle_v3'
    and pg_catalog.pg_get_function_identity_arguments(
      procedure.oid
    ) = 'p_cycle_id uuid, p_mark_succeeded_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_started_at timestamp with time zone'
)
select
  position(
    'source.candidate_percent between 1 and 99'
    in definition
  ) > 0 as regular_discounts_1_to_99_allowed,
  position(
    'source.original_amount / source.candidate_amount <= 20'
    in definition
  ) = 0 as ratio_limit_absent,
  position(
    'source.candidate ->> ''content_type'' = ''game'''
    in definition
  ) > 0 as game_pair_present,
  position(
    'source.candidate ->> ''content_type'' = ''bundle'''
    in definition
  ) > 0 as bundle_pair_present,
  position(
    'source.candidate ->> ''content_type'' = ''dlc'''
    in definition
  ) > 0
    and position(
      'source.candidate ->> ''item_type_label'' = ''addon'''
      in definition
    ) > 0 as dlc_addon_pair_present,
  position(
    '''["ps5","ps4"]''::jsonb'
    in definition
  ) > 0 as canonical_combined_platform_present
from certification_function;

select
  count(*)::bigint as stage_rows,
  count(*) filter (
    where regular_certification_candidate is not null
  )::bigint as regular_candidates,
  count(*) filter (
    where ps_plus_certification_candidate is not null
  )::bigint as ps_plus_candidates,
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
