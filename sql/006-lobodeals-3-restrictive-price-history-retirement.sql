-- LoboDeals 3.2
-- Restrictive retirement of the verified legacy detailed price table.
--
-- This migration intentionally has no data-preservation side path. It must
-- stop and roll back if the verified object or its dependency surface drifts.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.psdeals_stage_price_history
  in access exclusive mode;

do $preflight$
declare
  history_oid oid;
  expected_columns integer;
  expected_constraints integer;
  expected_indexes integer;
  external_dependencies integer;
  role_name text;
  privilege_name text;
begin
  select relation.oid
  into history_oid
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'psdeals_stage_price_history'
    and relation.relkind = 'r'
    and relation.relpersistence = 'p';

  if history_oid is null then
    raise exception 'PSDEALS_006_HISTORY_OBJECT_IDENTITY_MISMATCH';
  end if;

  select count(*)::integer
  into expected_columns
  from (
    values
      ('id', 'uuid', 'NO', 'gen_random_uuid()'),
      ('item_id', 'uuid', 'NO', null),
      ('price_kind', 'text', 'NO', null),
      ('observed_at', 'timestamp with time zone', 'NO', null),
      ('price_amount', 'numeric', 'NO', null),
      ('currency_code', 'text', 'NO', '''USD''::text'),
      ('source_name', 'text', 'NO', '''psdeals''::text'),
      ('created_at', 'timestamp with time zone', 'NO', 'now()')
  ) as expected(
    column_name,
    data_type,
    is_nullable,
    column_default
  )
  join information_schema.columns as actual
    on actual.table_schema = 'public'
    and actual.table_name = 'psdeals_stage_price_history'
    and actual.column_name = expected.column_name
    and actual.data_type = expected.data_type
    and actual.is_nullable = expected.is_nullable
    and actual.column_default is not distinct from expected.column_default;

  if expected_columns <> 8
    or (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'psdeals_stage_price_history'
    ) <> 8 then
    raise exception 'PSDEALS_006_HISTORY_COLUMNS_MISMATCH';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'psdeals_stage_price_history'
      and column_name = 'price_amount'
      and numeric_precision = 10
      and numeric_scale = 2
  ) then
    raise exception 'PSDEALS_006_HISTORY_PRICE_TYPE_MISMATCH';
  end if;

  select count(*)::integer
  into expected_constraints
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = history_oid
    and (
      (
        constraint_row.contype = 'p'
        and pg_catalog.pg_get_constraintdef(
          constraint_row.oid
        ) = 'PRIMARY KEY (id)'
      )
      or (
        constraint_row.contype = 'u'
        and pg_catalog.pg_get_constraintdef(
          constraint_row.oid
        ) = 'UNIQUE (item_id, price_kind, observed_at, price_amount)'
      )
      or (
        constraint_row.contype = 'c'
        and pg_catalog.pg_get_constraintdef(
          constraint_row.oid
        ) ilike '%price_kind%'
        and pg_catalog.pg_get_constraintdef(
          constraint_row.oid
        ) ilike '%regular%'
        and pg_catalog.pg_get_constraintdef(
          constraint_row.oid
        ) ilike '%ps_plus%'
      )
      or (
        constraint_row.contype = 'f'
        and constraint_row.confrelid =
          'public.psdeals_stage_items'::regclass
        and constraint_row.confdeltype = 'c'
        and pg_catalog.pg_get_constraintdef(
          constraint_row.oid
        ) ilike 'FOREIGN KEY (item_id)%'
      )
    );

  if expected_constraints <> 4
    or (
      select count(*)
      from pg_catalog.pg_constraint
      where conrelid = history_oid
    ) <> 4 then
    raise exception 'PSDEALS_006_HISTORY_CONSTRAINTS_MISMATCH';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where confrelid = history_oid
      and conrelid <> history_oid
  ) then
    raise exception 'PSDEALS_006_INCOMING_FOREIGN_KEY_PRESENT';
  end if;

  select count(*)::integer
  into expected_indexes
  from pg_catalog.pg_index as index_row
  join pg_catalog.pg_class as index_relation
    on index_relation.oid = index_row.indexrelid
  where index_row.indrelid = history_oid
    and index_relation.relname in (
      'psdeals_stage_price_history_pkey',
      'psdeals_stage_price_history_unique_point',
      'psdeals_stage_price_history_item_idx',
      'psdeals_stage_price_history_kind_idx'
    );

  if expected_indexes <> 4
    or (
      select count(*)
      from pg_catalog.pg_index
      where indrelid = history_oid
    ) <> 4 then
    raise exception 'PSDEALS_006_HISTORY_INDEXES_MISMATCH';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = history_oid
      and not tgisinternal
  ) then
    raise exception 'PSDEALS_006_USER_TRIGGER_PRESENT';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_rewrite
    where ev_class = history_oid
      and rulename <> '_RETURN'
  ) then
    raise exception 'PSDEALS_006_USER_RULE_PRESENT';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_views
    where definition ilike '%psdeals_stage_price_history%'
  ) or exists (
    select 1
    from pg_catalog.pg_matviews
    where definition ilike '%psdeals_stage_price_history%'
  ) then
    raise exception 'PSDEALS_006_VIEW_CONSUMER_PRESENT';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname not in (
        'pg_catalog',
        'information_schema'
      )
      and procedure.prokind in ('f', 'p')
      and pg_catalog.pg_get_functiondef(procedure.oid)
      ilike '%psdeals_stage_price_history%'
  ) then
    raise exception 'PSDEALS_006_STORED_ROUTINE_REFERENCE_PRESENT';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_publication_rel
    where prrelid = history_oid
  ) then
    raise exception 'PSDEALS_006_PUBLICATION_PRESENT';
  end if;

  select count(*)::integer
  into external_dependencies
  from pg_catalog.pg_depend as dependency
  where dependency.refobjid = history_oid
    and not (
      dependency.classid = 'pg_catalog.pg_class'::regclass
      and dependency.objid in (
        select indexrelid
        from pg_catalog.pg_index
        where indrelid = history_oid
        union all
        select reltoastrelid
        from pg_catalog.pg_class
        where oid = history_oid
          and reltoastrelid <> 0
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_type'::regclass
      and dependency.objid in (
        select type_row.oid
        from pg_catalog.pg_type as type_row
        where type_row.typrelid = history_oid
          or type_row.typelem in (
            select row_type.oid
            from pg_catalog.pg_type as row_type
            where row_type.typrelid = history_oid
          )
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_trigger'::regclass
      and dependency.objid in (
        select oid
        from pg_catalog.pg_trigger
        where tgrelid = history_oid
          and tgisinternal
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_constraint'::regclass
      and dependency.objid in (
        select oid
        from pg_catalog.pg_constraint
        where conrelid = history_oid
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_rewrite'::regclass
      and dependency.objid in (
        select oid
        from pg_catalog.pg_rewrite
        where ev_class = history_oid
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_policy'::regclass
      and dependency.objid in (
        select oid
        from pg_catalog.pg_policy
        where polrelid = history_oid
      )
    )
    and not (
      dependency.classid = 'pg_catalog.pg_attrdef'::regclass
      and dependency.objid in (
        select oid
        from pg_catalog.pg_attrdef
        where adrelid = history_oid
      )
    );

  if external_dependencies <> 0 then
    raise exception
      'PSDEALS_006_EXTERNAL_DEPENDENCY_PRESENT: %',
      external_dependencies;
  end if;

  if not (
    select relrowsecurity and not relforcerowsecurity
    from pg_catalog.pg_class
    where oid = history_oid
  ) then
    raise exception 'PSDEALS_006_RLS_STATE_MISMATCH';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policy
    where polrelid = history_oid
      and polname = 'Public read psdeals price history'
      and polcmd = 'r'
      and polpermissive
      and polwithcheck is null
      and polroles = array[
        (select oid from pg_catalog.pg_roles where rolname = 'anon')
      ]
      and pg_catalog.pg_get_expr(polqual, polrelid)
        ilike '%psdeals_stage_items%'
      and pg_catalog.pg_get_expr(polqual, polrelid)
        ilike '%playstation%'
      and pg_catalog.pg_get_expr(polqual, polrelid)
        ilike '%us%'
  ) <> 1
    or (
      select count(*)
      from pg_catalog.pg_policy
      where polrelid = history_oid
    ) <> 1 then
    raise exception 'PSDEALS_006_POLICY_SURFACE_MISMATCH';
  end if;

  foreach role_name in array array[
    'anon',
    'authenticated',
    'service_role',
    'postgres'
  ]
  loop
    foreach privilege_name in array array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    ]
    loop
      if not pg_catalog.has_table_privilege(
        role_name,
        history_oid,
        privilege_name
      ) then
        raise exception
          'PSDEALS_006_EXPECTED_GRANT_MISSING: %.%',
          role_name,
          privilege_name;
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_class as relation,
      lateral pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) as acl
    where relation.oid = history_oid
      and acl.grantee = 0
  ) then
    raise exception 'PSDEALS_006_UNEXPECTED_PUBLIC_GRANT';
  end if;
end;
$preflight$;

drop policy "Public read psdeals price history"
  on public.psdeals_stage_price_history;

revoke all privileges
  on table public.psdeals_stage_price_history
  from public, anon, authenticated, service_role;

drop table public.psdeals_stage_price_history restrict;

commit;
