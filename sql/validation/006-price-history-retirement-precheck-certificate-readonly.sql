-- Machine-readable, single-result-set certificate for migration 006.
-- This is one read-only PostgreSQL statement and therefore one snapshot.

with
certificate_context as materialized (
  select
    pg_catalog.pg_backend_pid() as backend_pid,
    pg_catalog.pg_current_snapshot()::text as snapshot_id,
    statement_timestamp() as checked_at,
    current_database() as database_name,
    current_schema() as schema_name,
    current_user as current_user_name,
    session_user as session_user_name,
    current_setting('server_version_num')::integer as server_version_num,
    pg_catalog.pg_database_size(current_database()) as database_bytes
),
history_relation_candidate as materialized (
  select
    relation.oid as history_oid,
    namespace.nspname as schema_name,
    relation.relname,
    owner_role.rolname as owner_name,
    relation.relkind,
    relation.relpersistence,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    relation.relfilenode,
    pg_catalog.pg_relation_size(relation.oid) as heap_bytes,
    pg_catalog.pg_indexes_size(relation.oid) as index_bytes,
    pg_catalog.pg_total_relation_size(relation.oid) as total_bytes
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join pg_catalog.pg_roles as owner_role
    on owner_role.oid = relation.relowner
  where namespace.nspname = 'public'
    and relation.relname = 'psdeals_stage_price_history'
),
history_relation as materialized (
  select
    max(history_oid)::oid as history_oid,
    max(schema_name)::text as schema_name,
    max(relname)::text as relname,
    max(owner_name)::text as owner_name,
    max(relkind::text)::text as relkind,
    max(relpersistence::text)::text as relpersistence,
    coalesce(bool_or(relrowsecurity), false) as relrowsecurity,
    coalesce(bool_or(relforcerowsecurity), false) as relforcerowsecurity,
    max(relfilenode)::oid as relfilenode,
    max(heap_bytes)::bigint as heap_bytes,
    max(index_bytes)::bigint as index_bytes,
    max(total_bytes)::bigint as total_bytes
  from history_relation_candidate
),
history_metrics as materialized (
  select
    count(*)::bigint as history_rows,
    min(observed_at) as oldest_observation,
    max(observed_at) as newest_observation
  from public.psdeals_stage_price_history
),
expected_columns(
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default,
  numeric_precision,
  numeric_scale
) as (
  values
    (1, 'id', 'uuid', 'NO', 'gen_random_uuid()', null::integer, null::integer),
    (2, 'item_id', 'uuid', 'NO', null::text, null::integer, null::integer),
    (3, 'price_kind', 'text', 'NO', null::text, null::integer, null::integer),
    (4, 'observed_at', 'timestamp with time zone', 'NO', null::text, null::integer, null::integer),
    (5, 'price_amount', 'numeric', 'NO', null::text, 10, 2),
    (6, 'currency_code', 'text', 'NO', '''USD''::text', null::integer, null::integer),
    (7, 'source_name', 'text', 'NO', '''psdeals''::text', null::integer, null::integer),
    (8, 'created_at', 'timestamp with time zone', 'NO', 'now()', null::integer, null::integer)
),
actual_columns as materialized (
  select
    column_row.ordinal_position,
    column_row.column_name,
    column_row.data_type,
    column_row.is_nullable,
    column_row.column_default,
    column_row.numeric_precision,
    column_row.numeric_scale
  from information_schema.columns as column_row
  where column_row.table_schema = 'public'
    and column_row.table_name = 'psdeals_stage_price_history'
),
column_drift as (
  (select * from expected_columns except select * from actual_columns)
  union all
  (select * from actual_columns except select * from expected_columns)
),
history_constraints as materialized (
  select
    constraint_row.oid,
    constraint_row.conname,
    constraint_row.contype,
    constraint_row.conrelid,
    constraint_row.confrelid,
    constraint_row.confdeltype,
    pg_catalog.pg_get_constraintdef(constraint_row.oid) as definition
  from pg_catalog.pg_constraint as constraint_row
  cross join history_relation as history
  where constraint_row.conrelid = history.history_oid
     or constraint_row.confrelid = history.history_oid
),
constraint_summary as materialized (
  select
    count(*) filter (where conrelid = history.history_oid)::integer as outgoing_count,
    count(*) filter (
      where confrelid = history.history_oid
        and conrelid <> history.history_oid
    )::integer as incoming_count,
    count(*) filter (
      where conrelid = history.history_oid
        and contype = 'p'
        and definition = 'PRIMARY KEY (id)'
    )::integer as primary_key_matches,
    count(*) filter (
      where conrelid = history.history_oid
        and contype = 'u'
        and definition = 'UNIQUE (item_id, price_kind, observed_at, price_amount)'
    )::integer as unique_matches,
    count(*) filter (
      where conrelid = history.history_oid
        and contype = 'c'
        and definition ilike '%price_kind%'
        and definition ilike '%regular%'
        and definition ilike '%ps_plus%'
    )::integer as check_matches,
    count(*) filter (
      where conrelid = history.history_oid
        and contype = 'f'
        and confrelid = 'public.psdeals_stage_items'::regclass
        and confdeltype = 'c'
        and definition ilike 'FOREIGN KEY (item_id)%'
    )::integer as foreign_key_matches,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', conname,
          'type', contype,
          'definition', definition
        ) order by conname
      ),
      '[]'::jsonb
    ) as constraints
  from history_constraints
  cross join history_relation as history
),
history_indexes as materialized (
  select
    index_row.indexname,
    index_row.indexdef
  from pg_catalog.pg_indexes as index_row
  where index_row.schemaname = 'public'
    and index_row.tablename = 'psdeals_stage_price_history'
),
expected_index_names(indexname) as (
  values
    ('psdeals_stage_price_history_pkey'),
    ('psdeals_stage_price_history_unique_point'),
    ('psdeals_stage_price_history_item_idx'),
    ('psdeals_stage_price_history_kind_idx')
),
index_drift as (
  (select indexname from expected_index_names except select indexname from history_indexes)
  union all
  (select indexname from history_indexes except select indexname from expected_index_names)
),
all_history_dependencies as materialized (
  select
    dependency.classid,
    dependency.objid,
    dependency.objsubid,
    dependency.deptype
  from pg_catalog.pg_depend as dependency
  cross join history_relation as history
  where dependency.refobjid = history.history_oid
),
external_dependencies as materialized (
  select dependency.*
  from all_history_dependencies as dependency
  cross join history_relation as history
  where not (
    dependency.classid = 'pg_catalog.pg_class'::regclass
    and dependency.objid in (
      select indexrelid
      from pg_catalog.pg_index
      where indrelid = history.history_oid
      union all
      select reltoastrelid
      from pg_catalog.pg_class
      where oid = history.history_oid
        and reltoastrelid <> 0
    )
  )
  and not (
    dependency.classid = 'pg_catalog.pg_type'::regclass
    and dependency.objid in (
      select type_row.oid
      from pg_catalog.pg_type as type_row
      where type_row.typrelid = history.history_oid
        or type_row.typelem in (
          select row_type.oid
          from pg_catalog.pg_type as row_type
          where row_type.typrelid = history.history_oid
        )
    )
  )
  and not (
    dependency.classid = 'pg_catalog.pg_trigger'::regclass
    and dependency.objid in (
      select oid
      from pg_catalog.pg_trigger
      where tgrelid = history.history_oid
        and tgisinternal
    )
  )
  and not (
    dependency.classid = 'pg_catalog.pg_constraint'::regclass
    and dependency.objid in (
      select oid
      from pg_catalog.pg_constraint
      where conrelid = history.history_oid
    )
  )
  and not (
    dependency.classid = 'pg_catalog.pg_rewrite'::regclass
    and dependency.objid in (
      select oid
      from pg_catalog.pg_rewrite
      where ev_class = history.history_oid
    )
  )
  and not (
    dependency.classid = 'pg_catalog.pg_policy'::regclass
    and dependency.objid in (
      select oid
      from pg_catalog.pg_policy
      where polrelid = history.history_oid
    )
  )
  and not (
    dependency.classid = 'pg_catalog.pg_attrdef'::regclass
    and dependency.objid in (
      select oid
      from pg_catalog.pg_attrdef
      where adrelid = history.history_oid
    )
  )
),
history_triggers as materialized (
  select
    trigger_row.tgname,
    trigger_row.tgisinternal,
    pg_catalog.pg_get_triggerdef(trigger_row.oid) as definition
  from pg_catalog.pg_trigger as trigger_row
  cross join history_relation as history
  where trigger_row.tgrelid = history.history_oid
),
history_routines as materialized (
  select
    namespace.nspname as schema_name,
    procedure.proname,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) as arguments
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname not in ('pg_catalog', 'information_schema')
    and procedure.prokind in ('f', 'p')
    and pg_catalog.pg_get_functiondef(procedure.oid)
      ilike '%psdeals_stage_price_history%'
),
history_views as materialized (
  select 'view'::text as object_kind, schemaname, viewname as object_name
  from pg_catalog.pg_views
  where definition ilike '%psdeals_stage_price_history%'
  union all
  select 'materialized_view', schemaname, matviewname
  from pg_catalog.pg_matviews
  where definition ilike '%psdeals_stage_price_history%'
),
history_rules as materialized (
  select rewrite.rulename
  from pg_catalog.pg_rewrite as rewrite
  cross join history_relation as history
  where rewrite.ev_class = history.history_oid
    and rewrite.rulename <> '_RETURN'
),
history_policies as materialized (
  select
    policy.polname,
    policy.polcmd,
    policy.polpermissive,
    policy.polroles,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
    pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) as with_check_expression
  from pg_catalog.pg_policy as policy
  cross join history_relation as history
  where policy.polrelid = history.history_oid
),
information_schema_acl as materialized (
  select
    grant_row.grantee,
    grant_row.privilege_type,
    grant_row.is_grantable
  from information_schema.role_table_grants as grant_row
  where grant_row.table_schema = 'public'
    and grant_row.table_name = 'psdeals_stage_price_history'
),
effective_acl as materialized (
  select
    case when acl.grantee = 0 then 'PUBLIC' else grantee_role.rolname end as grantee,
    acl.privilege_type,
    acl.is_grantable,
    grantor_role.rolname as grantor
  from pg_catalog.pg_class as relation
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      relation.relacl,
      pg_catalog.acldefault('r', relation.relowner)
    )
  ) as acl
  left join pg_catalog.pg_roles as grantee_role
    on grantee_role.oid = acl.grantee
  left join pg_catalog.pg_roles as grantor_role
    on grantor_role.oid = acl.grantor
  cross join history_relation as history
  where relation.oid = history.history_oid
),
expected_acl(grantee, privilege_type, is_grantable, grantor) as (
  select
    expected_role.grantee,
    expected_privilege.privilege_type,
    false,
    'postgres'
  from (
    values ('anon'), ('authenticated'), ('postgres'), ('service_role')
  ) as expected_role(grantee)
  cross join (
    values
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
  ) as expected_privilege(privilege_type)
),
acl_drift as (
  (select * from expected_acl except select * from effective_acl)
  union all
  (select * from effective_acl except select * from expected_acl)
),
acl_by_grantee as materialized (
  select
    effective_acl.grantee,
    count(*)::integer as entry_count,
    array_agg(effective_acl.privilege_type order by effective_acl.privilege_type) as privileges,
    array_agg(effective_acl.grantor order by effective_acl.privilege_type) as grantors,
    array_agg(effective_acl.is_grantable order by effective_acl.privilege_type) as grant_options
  from effective_acl
  group by effective_acl.grantee
),
acl_by_privilege as materialized (
  select privilege_type, count(*)::integer as entry_count
  from effective_acl
  group by privilege_type
),
lock_summary as materialized (
  select
    count(*) filter (where not lock_row.granted)::integer as waiting_locks,
    count(*) filter (
      where lock_row.pid <> pg_catalog.pg_backend_pid()
        and lock_row.granted
    )::integer as external_granted_locks
  from pg_catalog.pg_locks as lock_row
  cross join history_relation as history
  where lock_row.relation in (
    history.history_oid,
    'public.psdeals_stage_items'::regclass
  )
),
activity_summary as materialized (
  select
    count(*) filter (
      where activity.backend_type = 'client backend'
        and activity.state = 'idle in transaction'
    )::integer as idle_in_transaction,
    count(*) filter (
      where activity.backend_type = 'client backend'
        and activity.state is distinct from 'idle'
        and activity.xact_start < statement_timestamp() - interval '5 minutes'
    )::integer as transactions_over_five_minutes,
    count(*) filter (
      where activity.backend_type = 'client backend'
        and activity.state = 'active'
        and activity.query_start < statement_timestamp() - interval '2 minutes'
    )::integer as active_queries_over_two_minutes,
    count(*) filter (
      where activity.backend_type = 'client backend'
        and activity.state = 'active'
        and activity.query ilike '%psdeals_stage_price_history%'
    )::integer as active_history_mentions
  from pg_catalog.pg_stat_activity as activity
  where activity.pid <> pg_catalog.pg_backend_pid()
),
required_005_columns(column_name) as (
  values
    ('regular_certification_cycle_id'),
    ('regular_certification_observed_at'),
    ('regular_certification_evidence_sha256'),
    ('regular_certification_candidate'),
    ('ps_plus_certification_cycle_id'),
    ('ps_plus_certification_observed_at'),
    ('ps_plus_certification_evidence_sha256'),
    ('ps_plus_certification_candidate')
),
required_005_constraints(constraint_name) as (
  values
    ('psdeals_stage_items_regular_certification_cycle_fkey'),
    ('psdeals_stage_items_ps_plus_certification_cycle_fkey'),
    ('psdeals_stage_items_regular_certification_pair_check'),
    ('psdeals_stage_items_ps_plus_certification_pair_check')
),
required_005_indexes(index_name) as (
  values
    ('psdeals_stage_items_regular_certification_cycle_idx'),
    ('psdeals_stage_items_ps_plus_certification_cycle_idx')
),
stage_summary as materialized (
  select
    count(*)::bigint as stage_rows,
    count(*) filter (where lobodeals_lowest_regular_price_amount is not null)::bigint as regular_minimum_amount_rows,
    count(*) filter (where lobodeals_lowest_regular_price_first_seen_at is not null)::bigint as regular_first_seen_rows,
    count(*) filter (where lobodeals_lowest_ps_plus_price_amount is not null)::bigint as plus_minimum_amount_rows,
    count(*) filter (where lobodeals_lowest_ps_plus_price_first_seen_at is not null)::bigint as plus_first_seen_rows,
    count(*) filter (where regular_certification_candidate is not null)::bigint as regular_candidate_rows,
    count(*) filter (where ps_plus_certification_candidate is not null)::bigint as plus_candidate_rows
  from public.psdeals_stage_items
),
migration_005_summary as materialized (
  select
    (select count(*) from required_005_columns as required where exists (
      select 1 from information_schema.columns as actual
      where actual.table_schema = 'public'
        and actual.table_name = 'psdeals_stage_items'
        and actual.column_name = required.column_name
    ))::integer as columns_present,
    (select count(*) from required_005_constraints as required where exists (
      select 1 from pg_catalog.pg_constraint as actual
      where actual.conrelid = 'public.psdeals_stage_items'::regclass
        and actual.conname = required.constraint_name
    ))::integer as constraints_present,
    (select count(*) from pg_catalog.pg_constraint
      where conrelid = 'public.psdeals_stage_items'::regclass
        and conname in (
          'psdeals_stage_items_regular_certification_cycle_fkey',
          'psdeals_stage_items_ps_plus_certification_cycle_fkey'
        )
        and confdeltype = 'r')::integer as restrictive_fks_present,
    (select count(*) from required_005_indexes as required where exists (
      select 1 from pg_catalog.pg_indexes as actual
      where actual.schemaname = 'public'
        and actual.tablename = 'psdeals_stage_items'
        and actual.indexname = required.index_name
        and actual.indexdef ilike '%where%cycle_id is not null%'
    ))::integer as partial_indexes_present,
    to_regprocedure('public._psdeals_certification_candidate_sha256_v1(jsonb)') is not null as helper_present,
    to_regprocedure('public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)') is not null as v3_present,
    exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '20260731052531'
        and name = 'lobodeals_3_cycle_bound_price_certification'
    ) as migration_005_present,
    exists (
      select 1
      from supabase_migrations.schema_migrations
      where name = 'lobodeals_3_restrictive_price_history_retirement'
    ) as migration_006_present
),
operational_summary as materialized (
  select
    (select count(*) from public.price_refresh_cycles)::bigint as cycles,
    (select count(*) from public.psdeals_cycle_action_receipts)::bigint as receipts,
    (select count(*) from public.ps_plus_monthly_games)::bigint as monthly_rows,
    (select count(*) from public.ps_plus_monthly_games where is_active)::bigint as monthly_active_rows,
    (select count(*) from public.catalog_public_cache)::bigint as cache_rows,
    (select max(updated_at) from public.catalog_public_cache) as cache_max_updated_at
),
checks(check_id, check_name, passed, severity, observed, expected) as (
  select 1, 'identity',
    context.database_name = 'postgres'
      and context.schema_name = 'public'
      and context.current_user_name = 'postgres'
      and context.session_user_name = 'postgres'
      and context.server_version_num between 170000 and 179999
      and history.history_oid is not null
      and history.schema_name = 'public'
      and history.owner_name = 'postgres'
      and history.relkind = 'r'
      and history.relpersistence = 'p'
      and not migration.migration_006_present,
    'blocker',
    jsonb_build_object(
      'database', context.database_name, 'schema', context.schema_name,
      'current_user', context.current_user_name, 'session_user', context.session_user_name,
      'server_version_num', context.server_version_num, 'database_bytes', context.database_bytes,
      'history_oid', history.history_oid, 'history_schema', history.schema_name,
      'owner', history.owner_name, 'relkind', history.relkind,
      'relpersistence', history.relpersistence, 'relfilenode', history.relfilenode,
      'migration_006_present', migration.migration_006_present
    ),
    jsonb_build_object(
      'database', 'postgres', 'schema', 'public', 'users', 'postgres',
      'postgres_major', 17, 'history_present', true, 'owner', 'postgres',
      'relkind', 'r', 'relpersistence', 'p', 'migration_006_present', false
    )
  from certificate_context context
  left join history_relation history on true
  cross join migration_005_summary migration

  union all
  select 2, 'history_rows_range_and_size',
    metrics.history_rows = 841549
      and history.total_bytes = 273907712
      and metrics.oldest_observation is not null
      and metrics.newest_observation is not null
      and metrics.oldest_observation <= metrics.newest_observation,
    'blocker',
    jsonb_build_object(
      'history_rows', metrics.history_rows, 'heap_bytes', history.heap_bytes,
      'index_bytes', history.index_bytes, 'total_bytes', history.total_bytes,
      'oldest_observation', metrics.oldest_observation,
      'newest_observation', metrics.newest_observation
    ),
    jsonb_build_object(
      'history_rows', 841549, 'total_bytes', 273907712,
      'temporal_range_present_and_ordered', true
    )
  from history_relation history cross join history_metrics metrics

  union all
  select 3, 'columns_exact',
    (select count(*) from actual_columns) = 8
      and not exists (select 1 from column_drift),
    'blocker',
    jsonb_build_object(
      'count', (select count(*) from actual_columns),
      'drift_count', (select count(*) from column_drift),
      'columns', coalesce((select jsonb_agg(to_jsonb(actual_columns) order by ordinal_position) from actual_columns), '[]'::jsonb)
    ),
    jsonb_build_object(
      'count', 8,
      'columns', (select jsonb_agg(to_jsonb(expected_columns) order by ordinal_position) from expected_columns)
    )

  union all
  select 4, 'constraints_and_foreign_keys',
    summary.outgoing_count = 4 and summary.incoming_count = 0
      and summary.primary_key_matches = 1 and summary.unique_matches = 1
      and summary.check_matches = 1 and summary.foreign_key_matches = 1,
    'blocker',
    to_jsonb(summary),
    jsonb_build_object(
      'outgoing_count', 4, 'incoming_count', 0, 'primary_key_matches', 1,
      'unique_matches', 1, 'check_matches', 1, 'foreign_key_matches', 1,
      'foreign_key_target', 'public.psdeals_stage_items', 'on_delete', 'CASCADE'
    )
  from constraint_summary summary

  union all
  select 5, 'indexes_exact',
    (select count(*) from history_indexes) = 4
      and not exists (select 1 from index_drift),
    'blocker',
    jsonb_build_object(
      'count', (select count(*) from history_indexes),
      'drift_count', (select count(*) from index_drift),
      'indexes', coalesce((select jsonb_agg(to_jsonb(history_indexes) order by indexname) from history_indexes), '[]'::jsonb)
    ),
    jsonb_build_object(
      'count', 4,
      'names', (select jsonb_agg(indexname order by indexname) from expected_index_names)
    )

  union all
  select 6, 'internal_dependencies',
    history.history_oid is not null,
    'informational',
    jsonb_build_object(
      'count', (select count(*) from all_history_dependencies),
      'types', coalesce((
        select jsonb_agg(to_jsonb(grouped) order by grouped.dependent_catalog, grouped.deptype)
        from (
          select classid::regclass::text as dependent_catalog, deptype, count(*)::integer as count
          from all_history_dependencies group by classid, deptype
        ) grouped
      ), '[]'::jsonb)
    ),
    jsonb_build_object('classification', 'owned_or_internal_dependencies_are_informational')
  from history_relation history

  union all
  select 7, 'external_dependencies_and_blockers',
    (select count(*) from external_dependencies) = 0
      and summary.incoming_count = 0,
    'blocker',
    jsonb_build_object(
      'external_dependencies', (select count(*) from external_dependencies),
      'incoming_foreign_keys', summary.incoming_count,
      'blockers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'catalog', classid::regclass::text, 'objid', objid,
          'objsubid', objsubid, 'deptype', deptype
        ) order by classid::regclass::text, objid, objsubid)
        from external_dependencies
      ), '[]'::jsonb)
    ),
    jsonb_build_object('external_dependencies', 0, 'incoming_foreign_keys', 0, 'blockers', 0)
  from constraint_summary summary

  union all
  select 8, 'triggers',
    (select count(*) from history_triggers where not tgisinternal) = 0
      and (select count(*) from history_triggers where tgisinternal) = 2,
    'blocker',
    jsonb_build_object(
      'user_triggers', (select count(*) from history_triggers where not tgisinternal),
      'internal_triggers', (select count(*) from history_triggers where tgisinternal),
      'triggers', coalesce((select jsonb_agg(to_jsonb(history_triggers) order by tgisinternal, tgname) from history_triggers), '[]'::jsonb)
    ),
    jsonb_build_object('user_triggers', 0, 'internal_fk_triggers', 2)

  union all
  select 9, 'stored_routines',
    (select count(*) from history_routines) = 0,
    'blocker',
    jsonb_build_object(
      'stored_writers', (select count(*) from history_routines),
      'stored_consumers', (select count(*) from history_routines),
      'routines', coalesce((select jsonb_agg(to_jsonb(history_routines) order by schema_name, proname, arguments) from history_routines), '[]'::jsonb)
    ),
    jsonb_build_object('stored_writers', 0, 'stored_consumers', 0)

  union all
  select 10, 'views_materialized_views_and_rules',
    (select count(*) from history_views) = 0
      and (select count(*) from history_rules) = 0,
    'blocker',
    jsonb_build_object(
      'views', (select count(*) from history_views where object_kind = 'view'),
      'materialized_views', (select count(*) from history_views where object_kind = 'materialized_view'),
      'external_rules', (select count(*) from history_rules),
      'objects', coalesce((select jsonb_agg(to_jsonb(history_views) order by object_kind, schemaname, object_name) from history_views), '[]'::jsonb)
    ),
    jsonb_build_object('views', 0, 'materialized_views', 0, 'external_rules', 0)

  union all
  select 11, 'rls_and_policy',
    history.relrowsecurity and not history.relforcerowsecurity
      and (select count(*) from history_policies) = 1
      and exists (
        select 1 from history_policies
        where polname = 'Public read psdeals price history'
          and polcmd = 'r' and polpermissive and with_check_expression is null
          and polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'anon')]
          and using_expression ilike '%psdeals_stage_items%'
          and using_expression ilike '%playstation%'
          and using_expression ilike '%us%'
      ),
    'blocker',
    jsonb_build_object(
      'rls_enabled', history.relrowsecurity, 'rls_forced', history.relforcerowsecurity,
      'policy_count', (select count(*) from history_policies),
      'policies', coalesce((select jsonb_agg(to_jsonb(history_policies) order by polname) from history_policies), '[]'::jsonb)
    ),
    jsonb_build_object(
      'rls_enabled', true, 'rls_forced', false, 'policy_count', 1,
      'policy_name', 'Public read psdeals price history', 'command', 'SELECT',
      'role', 'anon', 'scope', 'US/PlayStation', 'with_check', null
    )
  from history_relation history

  union all
  select 12, 'information_schema_acl',
    (select count(*) from information_schema_acl) = 28,
    'blocker',
    jsonb_build_object(
      'count', (select count(*) from information_schema_acl),
      'entries', coalesce((select jsonb_agg(to_jsonb(information_schema_acl) order by grantee, privilege_type) from information_schema_acl), '[]'::jsonb),
      'maintain_visible', (select count(*) from information_schema_acl where privilege_type = 'MAINTAIN')
    ),
    jsonb_build_object('count', 28, 'source', 'secondary', 'maintain_required_here', false)

  union all
  select 13, 'effective_acl',
    (select count(*) from effective_acl) = 32
      and (select count(*) from effective_acl where privilege_type = 'MAINTAIN') = 4
      and (select count(*) from effective_acl where is_grantable) = 0
      and (select count(*) from effective_acl where grantor <> 'postgres') = 0,
    'blocker',
    jsonb_build_object(
      'count', (select count(*) from effective_acl),
      'maintain', (select count(*) from effective_acl where privilege_type = 'MAINTAIN'),
      'grant_options', (select count(*) from effective_acl where is_grantable),
      'unexpected_grantors', (select count(*) from effective_acl where grantor <> 'postgres'),
      'entries', coalesce((select jsonb_agg(to_jsonb(effective_acl) order by grantee, privilege_type) from effective_acl), '[]'::jsonb)
    ),
    jsonb_build_object('count', 32, 'roles', 4, 'privileges_per_role', 8, 'maintain', 4, 'grantor', 'postgres', 'is_grantable', false)

  union all
  select 14, 'acl_by_grantee',
    (select count(*) from acl_by_grantee) = 4
      and not exists (select 1 from acl_by_grantee where grantee not in ('anon', 'authenticated', 'postgres', 'service_role') or entry_count <> 8)
      and not exists (select 1 from acl_by_grantee where grantee = 'PUBLIC'),
    'blocker',
    jsonb_build_object(
      'groups', coalesce((select jsonb_agg(to_jsonb(acl_by_grantee) order by grantee) from acl_by_grantee), '[]'::jsonb),
      'public_entries', (select count(*) from effective_acl where grantee = 'PUBLIC')
    ),
    jsonb_build_object('anon', 8, 'authenticated', 8, 'postgres', 8, 'service_role', 8, 'PUBLIC', 0)

  union all
  select 15, 'acl_by_privilege',
    (select count(*) from acl_by_privilege) = 8
      and not exists (select 1 from acl_by_privilege where entry_count <> 4),
    'blocker',
    jsonb_build_object('groups', coalesce((select jsonb_agg(to_jsonb(acl_by_privilege) order by privilege_type) from acl_by_privilege), '[]'::jsonb)),
    jsonb_build_object('privilege_types', 8, 'entries_per_privilege', 4, 'includes_maintain', true)

  union all
  select 16, 'acl_exact_reconciliation',
    (select count(*) from effective_acl) = 32
      and not exists (select 1 from acl_drift),
    'blocker',
    jsonb_build_object(
      'expected_count', (select count(*) from expected_acl),
      'actual_count', (select count(*) from effective_acl),
      'missing_or_unexpected', (select count(*) from acl_drift),
      'unexpected_grant_options', (select count(*) from effective_acl where is_grantable),
      'unexpected_grantors', (select count(*) from effective_acl where grantor <> 'postgres')
    ),
    jsonb_build_object('expected_count', 32, 'actual_count', 32, 'missing', 0, 'unexpected', 0, 'grant_options', 0, 'unexpected_grantors', 0)

  union all
  select 17, 'locks',
    locks.waiting_locks = 0 and locks.external_granted_locks = 0,
    'blocker',
    to_jsonb(locks),
    jsonb_build_object('waiting_locks', 0, 'external_conflicting_history_or_stage_locks', 0, 'own_access_share_ignored', true)
  from lock_summary locks

  union all
  select 18, 'bounded_activity',
    activity.idle_in_transaction = 0
      and activity.transactions_over_five_minutes = 0
      and activity.active_queries_over_two_minutes = 0
      and activity.active_history_mentions = 0
      and locks.waiting_locks = 0,
    'blocker',
    to_jsonb(activity) || jsonb_build_object('waiters', locks.waiting_locks),
    jsonb_build_object('idle_in_transaction', 0, 'transactions_over_five_minutes', 0, 'active_queries_over_two_minutes', 0, 'waiters', 0, 'active_history_mentions', 0)
  from activity_summary activity cross join lock_summary locks

  union all
  select 19, 'stage_migration_005_and_minima',
    stage.stage_rows = 32890
      and migration.columns_present = 8
      and migration.constraints_present = 4
      and migration.restrictive_fks_present = 2
      and migration.partial_indexes_present = 2
      and migration.helper_present and migration.v3_present
      and stage.regular_minimum_amount_rows = 0 and stage.regular_first_seen_rows = 0
      and stage.plus_minimum_amount_rows = 0 and stage.plus_first_seen_rows = 0,
    'blocker',
    to_jsonb(stage) || jsonb_build_object(
      'migration_005_columns', migration.columns_present,
      'migration_005_constraints', migration.constraints_present,
      'migration_005_restrictive_fks', migration.restrictive_fks_present,
      'migration_005_partial_indexes', migration.partial_indexes_present,
      'helper_present', migration.helper_present, 'v3_present', migration.v3_present
    ),
    jsonb_build_object(
      'stage_rows', 32890, 'migration_005_columns', 8, 'migration_005_constraints', 4,
      'migration_005_restrictive_fks', 2, 'migration_005_partial_indexes', 2,
      'helper_present', true, 'v3_present', true,
      'regular_minimum_amount_rows', 0, 'regular_first_seen_rows', 0,
      'plus_minimum_amount_rows', 0, 'plus_first_seen_rows', 0
    )
  from stage_summary stage cross join migration_005_summary migration

  union all
  select 20, 'operational_state',
    operational.cycles = 0 and operational.receipts = 0
      and stage.regular_candidate_rows = 0 and stage.plus_candidate_rows = 0
      and operational.monthly_rows = 7 and operational.monthly_active_rows = 4
      and operational.cache_rows = 32890
      and operational.cache_max_updated_at = '2026-06-06 21:52:17.916997+00'::timestamptz
      and migration.migration_005_present and not migration.migration_006_present,
    'blocker',
    to_jsonb(operational) || jsonb_build_object(
      'regular_candidates', stage.regular_candidate_rows,
      'plus_candidates', stage.plus_candidate_rows,
      'migration_005_present', migration.migration_005_present,
      'migration_006_present', migration.migration_006_present
    ),
    jsonb_build_object(
      'cycles', 0, 'receipts', 0, 'regular_candidates', 0, 'plus_candidates', 0,
      'monthly_rows', 7, 'monthly_active_rows', 4, 'cache_rows', 32890,
      'cache_max_updated_at', '2026-06-06T21:52:17.916997+00:00',
      'migration_005_present', true, 'migration_006_present', false
    )
  from operational_summary operational
  cross join stage_summary stage
  cross join migration_005_summary migration
)
select
  checks.check_id::integer,
  checks.check_name::text,
  checks.passed::boolean,
  checks.severity::text,
  checks.observed::jsonb,
  checks.expected::jsonb,
  context.backend_pid::integer,
  context.snapshot_id::text,
  context.checked_at::timestamptz
from checks
cross join certificate_context as context
order by checks.check_id;
