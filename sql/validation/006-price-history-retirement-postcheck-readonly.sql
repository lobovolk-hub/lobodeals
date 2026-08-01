-- Read-only integrity evidence to capture only after a separately authorized
-- and successful application of migration 006.
--
-- The authorized application must refresh the expected data baseline
-- immediately before migration 006. These values are the verified baseline
-- from 2026-07-31 and are intentionally visible rather than inferred.

select
  clock_timestamp() as checked_at,
  current_database() as database_name,
  current_user as session_role,
  pg_database_size(current_database()) as database_bytes_after,
  440741011::bigint as database_bytes_before,
  pg_database_size(current_database()) - 440741011::bigint
    as database_bytes_difference,
  273907712::bigint as history_relation_bytes_before;

with history_relation as (
  select relation.oid
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'psdeals_stage_price_history'
),
history_residue as (
  select
    (select count(*) from history_relation)::integer
      as remaining_history_relations,
    (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'psdeals_stage_price_history'
    )::integer as remaining_history_columns,
    (
      select count(*)
      from pg_catalog.pg_constraint as constraint_row
      where constraint_row.conrelid in (
          select oid from history_relation
        )
        or constraint_row.confrelid in (
          select oid from history_relation
        )
    )::integer as remaining_history_constraints,
    (
      select count(*)
      from pg_catalog.pg_indexes
      where schemaname = 'public'
        and tablename = 'psdeals_stage_price_history'
    )::integer as remaining_history_indexes,
    (
      select count(*)
      from pg_catalog.pg_indexes
      where schemaname = 'public'
        and indexname in (
          'psdeals_stage_price_history_pkey',
          'psdeals_stage_price_history_unique_point',
          'psdeals_stage_price_history_item_idx',
          'psdeals_stage_price_history_kind_idx'
        )
    )::integer as remaining_named_history_indexes,
    (
      select count(*)
      from pg_catalog.pg_indexes
      where schemaname = 'public'
        and indexdef ilike '%psdeals_stage_price_history%'
    )::integer as remaining_history_index_definitions,
    (
      select count(*)
      from pg_catalog.pg_trigger
      where tgrelid in (select oid from history_relation)
    )::integer as remaining_history_triggers,
    (
      select count(*)
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'psdeals_stage_price_history'
    )::integer as remaining_history_policies,
    (
      select count(*)
      from pg_catalog.pg_class as relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) as acl
      where relation.oid in (select oid from history_relation)
    )::integer as remaining_history_acl_entries,
    (
      select count(*)
      from pg_catalog.pg_depend
      where refobjid in (select oid from history_relation)
    )::integer as remaining_history_dependencies
)
select
  history_residue.*,
  (
    remaining_history_relations = 0
    and remaining_history_columns = 0
    and remaining_history_constraints = 0
    and remaining_history_indexes = 0
    and remaining_named_history_indexes = 0
    and remaining_history_index_definitions = 0
    and remaining_history_triggers = 0
    and remaining_history_policies = 0
    and remaining_history_acl_entries = 0
    and remaining_history_dependencies = 0
  ) as history_retirement_postcheck_passed
from history_residue;

select
  count(*)::integer as migration_006_rows,
  array_agg(version order by version) as migration_006_versions,
  count(*) = 1 as migration_006_registered
from supabase_migrations.schema_migrations
where name = 'lobodeals_3_restrictive_price_history_retirement';

with expected_columns(
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
) as (
  values
    (
      'regular_certification_cycle_id',
      'uuid',
      'YES',
      null,
      null::integer
    ),
    (
      'regular_certification_observed_at',
      'timestamp with time zone',
      'YES',
      null,
      null::integer
    ),
    (
      'regular_certification_evidence_sha256',
      'character varying',
      'YES',
      null,
      64
    ),
    (
      'regular_certification_candidate',
      'jsonb',
      'YES',
      null,
      null::integer
    ),
    (
      'ps_plus_certification_cycle_id',
      'uuid',
      'YES',
      null,
      null::integer
    ),
    (
      'ps_plus_certification_observed_at',
      'timestamp with time zone',
      'YES',
      null,
      null::integer
    ),
    (
      'ps_plus_certification_evidence_sha256',
      'character varying',
      'YES',
      null,
      64
    ),
    (
      'ps_plus_certification_candidate',
      'jsonb',
      'YES',
      null,
      null::integer
    )
),
actual_columns as (
  select
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'psdeals_stage_items'
    and column_name in (
      select expected_columns.column_name
      from expected_columns
    )
),
column_drift as (
  (
    select * from expected_columns
    except
    select * from actual_columns
  )
  union all
  (
    select * from actual_columns
    except
    select * from expected_columns
  )
)
select
  (select count(*) from actual_columns)::integer
    as migration_005_columns_present,
  (select count(*) from column_drift)::integer
    as migration_005_column_drift_count,
  (
    (select count(*) from actual_columns) = 8
    and not exists (select 1 from column_drift)
  ) as migration_005_columns_match;

select
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
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

with expected_constraints(constraint_name) as (
  values
    ('psdeals_stage_items_regular_certification_cycle_fkey'),
    ('psdeals_stage_items_ps_plus_certification_cycle_fkey'),
    ('psdeals_stage_items_regular_certification_pair_check'),
    ('psdeals_stage_items_ps_plus_certification_pair_check')
),
expected_indexes(index_name) as (
  values
    ('psdeals_stage_items_regular_certification_cycle_idx'),
    ('psdeals_stage_items_ps_plus_certification_cycle_idx')
)
select
  (
    select count(*)
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid =
        'public.psdeals_stage_items'::regclass
      and constraint_row.conname in (
        select constraint_name from expected_constraints
      )
  )::integer as migration_005_constraints_present,
  (
    select count(*)
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid =
        'public.psdeals_stage_items'::regclass
      and constraint_row.conname in (
        select constraint_name from expected_constraints
      )
      and constraint_row.contype = 'f'
      and constraint_row.confrelid =
        'public.price_refresh_cycles'::regclass
      and constraint_row.confdeltype = 'r'
  )::integer as migration_005_restrictive_fks_present,
  (
    select count(*)
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'psdeals_stage_items'
      and indexname in (
        select index_name from expected_indexes
      )
      and indexdef ilike '% where % is not null%'
  )::integer as migration_005_partial_indexes_present,
  (
    (
      select count(*)
      from pg_catalog.pg_constraint as constraint_row
      where constraint_row.conrelid =
          'public.psdeals_stage_items'::regclass
        and constraint_row.conname in (
          select constraint_name from expected_constraints
        )
    ) = 4
    and (
      select count(*)
      from pg_catalog.pg_constraint as constraint_row
      where constraint_row.conrelid =
          'public.psdeals_stage_items'::regclass
        and constraint_row.conname in (
          select constraint_name from expected_constraints
        )
        and constraint_row.contype = 'f'
        and constraint_row.confrelid =
          'public.price_refresh_cycles'::regclass
        and constraint_row.confdeltype = 'r'
    ) = 2
    and (
      select count(*)
      from pg_catalog.pg_indexes
      where schemaname = 'public'
        and tablename = 'psdeals_stage_items'
        and indexname in (
          select index_name from expected_indexes
        )
        and indexdef ilike '% where % is not null%'
    ) = 2
  ) as migration_005_constraints_and_indexes_match;

select
  constraint_row.conname,
  constraint_row.contype,
  constraint_row.convalidated,
  constraint_row.confdeltype,
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
  procedure.oid::regprocedure as function_signature,
  owner_role.rolname as owner_name,
  procedure.prosecdef as security_definer,
  procedure.provolatile as volatility,
  procedure.proisstrict as is_strict,
  procedure.proparallel as parallel_safety,
  procedure.proconfig as function_settings,
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(procedure.oid),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as definition_sha256
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
join pg_catalog.pg_roles as owner_role
  on owner_role.oid = procedure.proowner
where namespace.nspname = 'public'
  and procedure.oid in (
    to_regprocedure(
      'public.certify_price_refresh_cycle(uuid)'
    ),
    to_regprocedure(
      'public.certify_price_refresh_cycle_v2(uuid,uuid,text,text,timestamp with time zone)'
    ),
    to_regprocedure(
      'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
    ),
    to_regprocedure(
      'public._psdeals_certification_candidate_sha256_v1(jsonb)'
    )
  )
order by procedure.oid::regprocedure::text;

select
  procedure.oid::regprocedure as function_signature,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else grantee_role.rolname
  end as grantee,
  acl.privilege_type,
  acl.is_grantable,
  grantor_role.rolname as grantor
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(
    procedure.proacl,
    pg_catalog.acldefault('f', procedure.proowner)
  )
) as acl
left join pg_catalog.pg_roles as grantee_role
  on grantee_role.oid = acl.grantee
left join pg_catalog.pg_roles as grantor_role
  on grantor_role.oid = acl.grantor
where namespace.nspname = 'public'
  and procedure.oid in (
    to_regprocedure(
      'public.certify_price_refresh_cycle(uuid)'
    ),
    to_regprocedure(
      'public.certify_price_refresh_cycle_v2(uuid,uuid,text,text,timestamp with time zone)'
    ),
    to_regprocedure(
      'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
    ),
    to_regprocedure(
      'public._psdeals_certification_candidate_sha256_v1(jsonb)'
    )
  )
order by
  procedure.oid::regprocedure::text,
  grantee;

with expected_function_acl(function_name, grantee) as (
  values
    ('certify_price_refresh_cycle', 'postgres'),
    ('certify_price_refresh_cycle_v2', 'postgres'),
    ('certify_price_refresh_cycle_v3', 'postgres'),
    ('certify_price_refresh_cycle_v3', 'service_role'),
    (
      '_psdeals_certification_candidate_sha256_v1',
      'postgres'
    ),
    (
      '_psdeals_certification_candidate_sha256_v1',
      'service_role'
    )
),
actual_function_acl as (
  select
    procedure.proname as function_name,
    grantee_role.rolname as grantee
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      procedure.proacl,
      pg_catalog.acldefault('f', procedure.proowner)
    )
  ) as acl
  left join pg_catalog.pg_roles as grantee_role
    on grantee_role.oid = acl.grantee
  where namespace.nspname = 'public'
    and procedure.oid in (
      to_regprocedure(
        'public.certify_price_refresh_cycle(uuid)'
      ),
      to_regprocedure(
        'public.certify_price_refresh_cycle_v2(uuid,uuid,text,text,timestamp with time zone)'
      ),
      to_regprocedure(
        'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
      ),
      to_regprocedure(
        'public._psdeals_certification_candidate_sha256_v1(jsonb)'
      )
    )
    and acl.privilege_type = 'EXECUTE'
    and not acl.is_grantable
),
acl_drift as (
  (
    select * from expected_function_acl
    except
    select * from actual_function_acl
  )
  union all
  (
    select * from actual_function_acl
    except
    select * from expected_function_acl
  )
)
select
  to_regprocedure(
    'public._psdeals_certification_candidate_sha256_v1(jsonb)'
  ) is not null as candidate_hash_helper_present,
  to_regprocedure(
    'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
  ) is not null as certification_v3_present,
  (
    select owner_role.rolname = 'postgres'
      and not procedure.prosecdef
      and procedure.provolatile = 'i'
      and procedure.proisstrict
      and procedure.proparallel = 's'
      and procedure.proconfig = array['search_path=""']::text[]
      and position(
        'pg_catalog.sha256'
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) > 0
      and position(
        'pg_catalog.array_to_string'
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) > 0
      and position(
        'when ''regular'''
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) > 0
      and position(
        'when ''ps_plus'''
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) > 0
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = procedure.proowner
    where procedure.oid = to_regprocedure(
      'public._psdeals_certification_candidate_sha256_v1(jsonb)'
    )
  ) is true as candidate_hash_helper_definition_matches,
  (
    select owner_role.rolname = 'postgres'
      and procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
      and position(
        'source.candidate_percent between 1 and 99'
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) > 0
      and position(
        'source.original_amount / source.candidate_amount <= 20'
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) = 0
      and position(
        'source.candidate ->> ''content_type'' = ''game'''
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) > 0
      and position(
        'source.candidate ->> ''content_type'' = ''bundle'''
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) > 0
      and position(
        'source.candidate ->> ''content_type'' = ''dlc'''
        in lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ) > 0
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = procedure.proowner
    where procedure.oid = to_regprocedure(
      'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
    )
  ) is true as certification_v3_definition_matches,
  not exists (select 1 from acl_drift)
    as certification_function_acl_matches;

with expected as (
  select
    32890::bigint as stage_rows,
    0::bigint as cycles,
    0::bigint as receipts,
    0::bigint as regular_low_amounts,
    0::bigint as regular_low_first_seen,
    0::bigint as ps_plus_low_amounts,
    0::bigint as ps_plus_low_first_seen,
    0::bigint as regular_candidates,
    0::bigint as ps_plus_candidates,
    7::bigint as monthly_rows,
    4::bigint as monthly_active_rows,
    32890::bigint as cache_rows,
    '2026-06-06 21:52:17.916997+00'::timestamptz
      as cache_max_updated_at
),
actual as (
  select
    (select count(*) from public.psdeals_stage_items)
      as stage_rows,
    (select count(*) from public.price_refresh_cycles)
      as cycles,
    (
      select count(*)
      from public.psdeals_cycle_action_receipts
    ) as receipts,
    (
      select count(*)
      from public.psdeals_stage_items
      where lobodeals_lowest_regular_price_amount is not null
    ) as regular_low_amounts,
    (
      select count(*)
      from public.psdeals_stage_items
      where lobodeals_lowest_regular_price_first_seen_at is not null
    ) as regular_low_first_seen,
    (
      select count(*)
      from public.psdeals_stage_items
      where lobodeals_lowest_ps_plus_price_amount is not null
    ) as ps_plus_low_amounts,
    (
      select count(*)
      from public.psdeals_stage_items
      where lobodeals_lowest_ps_plus_price_first_seen_at is not null
    ) as ps_plus_low_first_seen,
    (
      select count(*)
      from public.psdeals_stage_items
      where regular_certification_cycle_id is not null
        or regular_certification_observed_at is not null
        or regular_certification_evidence_sha256 is not null
        or regular_certification_candidate is not null
    ) as regular_candidates,
    (
      select count(*)
      from public.psdeals_stage_items
      where ps_plus_certification_cycle_id is not null
        or ps_plus_certification_observed_at is not null
        or ps_plus_certification_evidence_sha256 is not null
        or ps_plus_certification_candidate is not null
    ) as ps_plus_candidates,
    (select count(*) from public.ps_plus_monthly_games)
      as monthly_rows,
    (
      select count(*)
      from public.ps_plus_monthly_games
      where is_active
    ) as monthly_active_rows,
    (select count(*) from public.catalog_public_cache)
      as cache_rows,
    (select max(updated_at) from public.catalog_public_cache)
      as cache_max_updated_at
)
select
  to_jsonb(expected) as expected_before_retirement,
  to_jsonb(actual) as measured_after_retirement,
  actual.stage_rows - expected.stage_rows as stage_rows_difference,
  actual.cycles - expected.cycles as cycles_difference,
  actual.receipts - expected.receipts as receipts_difference,
  actual.monthly_rows - expected.monthly_rows
    as monthly_rows_difference,
  actual.monthly_active_rows - expected.monthly_active_rows
    as monthly_active_rows_difference,
  actual.cache_rows - expected.cache_rows as cache_rows_difference,
  (
    actual.stage_rows = expected.stage_rows
    and actual.cycles = expected.cycles
    and actual.receipts = expected.receipts
    and actual.regular_low_amounts =
      expected.regular_low_amounts
    and actual.regular_low_first_seen =
      expected.regular_low_first_seen
    and actual.ps_plus_low_amounts =
      expected.ps_plus_low_amounts
    and actual.ps_plus_low_first_seen =
      expected.ps_plus_low_first_seen
    and actual.regular_candidates =
      expected.regular_candidates
    and actual.ps_plus_candidates =
      expected.ps_plus_candidates
    and actual.monthly_rows = expected.monthly_rows
    and actual.monthly_active_rows =
      expected.monthly_active_rows
    and actual.cache_rows = expected.cache_rows
    and actual.cache_max_updated_at =
      expected.cache_max_updated_at
  ) as preserved_data_matches_authorized_baseline
from expected
cross join actual;

with public_relations as (
  select
    relation.oid,
    relation.relname
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'm', 'p')
)
select
  pg_database_size(current_database()) as database_bytes_after,
  (
    select sum(pg_total_relation_size(oid))
    from public_relations
  ) as public_relations_total_bytes_after,
  pg_total_relation_size(
    to_regclass('public.psdeals_stage_items')
  ) as stage_total_bytes_after,
  pg_total_relation_size(
    to_regclass('public.price_refresh_cycles')
  ) as cycles_total_bytes_after,
  pg_total_relation_size(
    to_regclass('public.psdeals_cycle_action_receipts')
  ) as receipts_total_bytes_after,
  pg_total_relation_size(
    to_regclass('public.ps_plus_monthly_games')
  ) as monthly_total_bytes_after,
  pg_total_relation_size(
    to_regclass('public.catalog_public_cache')
  ) as cache_total_bytes_after,
  to_regclass('public.psdeals_stage_price_history') is null
    as history_relation_size_absent,
  273907712::bigint as history_relation_bytes_before;
