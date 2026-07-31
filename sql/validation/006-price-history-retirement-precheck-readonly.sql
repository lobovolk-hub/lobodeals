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

select *
from (
  select
    dependency.classid::regclass as dependent_catalog,
    dependency.objid,
    dependency.objsubid,
    dependency.deptype
  from pg_catalog.pg_depend as dependency
  where dependency.refobjid =
    'public.psdeals_stage_price_history'::regclass
) as history_dependencies
order by
  history_dependencies.dependent_catalog::text,
  history_dependencies.objid,
  history_dependencies.objsubid;

with history_object as (
  select 'public.psdeals_stage_price_history'::regclass::oid as history_oid
),
external_dependencies as (
  select dependency.*
  from pg_catalog.pg_depend as dependency
  cross join history_object
  where dependency.refobjid = history_object.history_oid
    and not (
      dependency.classid = 'pg_catalog.pg_class'::regclass
      and dependency.objid in (
        select indexrelid
        from pg_catalog.pg_index
        where indrelid = history_object.history_oid
        union all
        select reltoastrelid
        from pg_catalog.pg_class
        where oid = history_object.history_oid
          and reltoastrelid <> 0
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_type'::regclass
      and dependency.objid in (
        select type_row.oid
        from pg_catalog.pg_type as type_row
        where type_row.typrelid = history_object.history_oid
          or type_row.typelem in (
            select row_type.oid
            from pg_catalog.pg_type as row_type
            where row_type.typrelid = history_object.history_oid
          )
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_trigger'::regclass
      and dependency.objid in (
        select oid
        from pg_catalog.pg_trigger
        where tgrelid = history_object.history_oid
          and tgisinternal
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_constraint'::regclass
      and dependency.objid in (
        select oid
        from pg_catalog.pg_constraint
        where conrelid = history_object.history_oid
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_rewrite'::regclass
      and dependency.objid in (
        select oid
        from pg_catalog.pg_rewrite
        where ev_class = history_object.history_oid
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_policy'::regclass
      and dependency.objid in (
        select oid
        from pg_catalog.pg_policy
        where polrelid = history_object.history_oid
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_attrdef'::regclass
      and dependency.objid in (
        select oid
        from pg_catalog.pg_attrdef
        where adrelid = history_object.history_oid
      )
    )
)
select
  dependency.classid::regclass as dependent_catalog,
  dependency.objid,
  dependency.objsubid,
  dependency.deptype
from external_dependencies as dependency
order by
  dependency.classid::regclass::text,
  dependency.objid,
  dependency.objsubid;

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
  grant_row.privilege_type,
  grant_row.is_grantable
from information_schema.role_table_grants as grant_row
where grant_row.table_schema = 'public'
  and grant_row.table_name = 'psdeals_stage_price_history'
order by grant_row.grantee, grant_row.privilege_type;

select
  case
    when acl.grantee = 0 then 'PUBLIC'
    else grantee_role.rolname
  end as grantee,
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
where relation.oid =
  'public.psdeals_stage_price_history'::regclass
order by
  grantee,
  acl.privilege_type,
  grantor;

with effective_acl as (
  select
    case
      when acl.grantee = 0 then 'PUBLIC'
      else grantee_role.rolname
    end as grantee,
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
  where relation.oid =
    'public.psdeals_stage_price_history'::regclass
)
select
  effective_acl.grantee,
  count(*)::integer as effective_acl_entries,
  array_agg(
    effective_acl.privilege_type
    order by effective_acl.privilege_type
  ) as privilege_types,
  array_agg(
    effective_acl.grantor
    order by effective_acl.privilege_type
  ) as grantors,
  array_agg(
    effective_acl.is_grantable
    order by effective_acl.privilege_type
  ) as grant_options
from effective_acl
group by effective_acl.grantee
order by effective_acl.grantee;

select
  acl.privilege_type,
  count(*)::integer as effective_acl_entries
from pg_catalog.pg_class as relation
cross join lateral pg_catalog.aclexplode(
  coalesce(
    relation.relacl,
    pg_catalog.acldefault('r', relation.relowner)
  )
) as acl
where relation.oid =
  'public.psdeals_stage_price_history'::regclass
group by acl.privilege_type
order by acl.privilege_type;

with expected_acl(
  grantee,
  privilege_type,
  is_grantable,
  grantor
) as (
  select
    expected_role.grantee,
    expected_privilege.privilege_type,
    false,
    'postgres'
  from (
    values
      ('anon'),
      ('authenticated'),
      ('service_role'),
      ('postgres')
  ) as expected_role(grantee)
  cross join (
    values
      ('SELECT'),
      ('INSERT'),
      ('UPDATE'),
      ('DELETE'),
      ('TRUNCATE'),
      ('REFERENCES'),
      ('TRIGGER'),
      ('MAINTAIN')
  ) as expected_privilege(privilege_type)
),
effective_acl as (
  select
    case
      when acl.grantee = 0 then 'PUBLIC'
      else grantee_role.rolname
    end as grantee,
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
  where relation.oid =
    'public.psdeals_stage_price_history'::regclass
),
acl_drift as (
  (
    select * from expected_acl
    except
    select * from effective_acl
  )
  union all
  (
    select * from effective_acl
    except
    select * from expected_acl
  )
)
select
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'psdeals_stage_price_history'
  )::integer as history_information_schema_grants_count,
  count(*)::integer as history_effective_acl_entries_count,
  count(*) filter (
    where privilege_type = 'MAINTAIN'
  )::integer as history_maintain_grants_count,
  count(*) filter (
    where grantee = 'PUBLIC'
  )::integer as history_public_grants_count,
  count(*) filter (
    where grantee not in (
      'anon',
      'authenticated',
      'service_role',
      'postgres'
    )
  )::integer as history_unexpected_grantees_count,
  count(*) filter (
    where privilege_type not in (
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
      'MAINTAIN'
    )
  )::integer as history_unexpected_privileges_count,
  count(*) filter (
    where is_grantable
  )::integer as history_unexpected_grant_options_count,
  (
    count(*) = 32
    and not exists (select 1 from acl_drift)
  ) as history_grants_match_006
from effective_acl;

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
