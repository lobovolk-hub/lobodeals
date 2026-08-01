-- LoboDeals 3.2 migration 007 post-application certificate.
-- Exactly one read-only PostgreSQL statement and one machine-readable result set.

with
certificate_context as materialized (
  select
    pg_catalog.pg_backend_pid() as backend_pid,
    pg_catalog.pg_current_snapshot()::text as snapshot,
    statement_timestamp() as checked_at,
    current_database() as database_name,
    current_user as current_user_name,
    current_setting('server_version_num')::integer as server_version_num
),
migration_history as materialized (
  select
    count(*) filter (where name = 'lobodeals_3_reconciliable_cycle_actions')::integer as migration_004_count,
    count(*) filter (where name = 'lobodeals_3_cycle_bound_price_certification')::integer as migration_005_count,
    count(*) filter (where name = 'lobodeals_3_restrictive_price_history_retirement')::integer as migration_006_count,
    count(*) filter (where name = 'lobodeals_3_safe_demotion_hardening')::integer as migration_007_count
  from supabase_migrations.schema_migrations
),
relation_catalog as materialized (
  select
    to_regclass('public.psdeals_stage_items') as stage_oid,
    to_regclass('public.price_refresh_cycles') as cycles_oid,
    to_regclass('public.psdeals_cycle_action_receipts') as receipts_oid,
    to_regclass('public.ps_plus_monthly_games') as monthly_oid,
    to_regclass('public.catalog_public_cache') as cache_oid,
    to_regclass('public.psdeals_stage_price_history') as history_oid
),
operational_counts as materialized (
  select
    (select count(*) from public.price_refresh_cycles)::bigint as cycles,
    (select count(*) from public.psdeals_cycle_action_receipts)::bigint as receipts,
    (select count(*) from public.psdeals_stage_items)::bigint as stage_rows,
    (select count(*) from public.psdeals_stage_items where regular_certification_candidate is not null)::bigint as regular_candidates,
    (select count(*) from public.psdeals_stage_items where ps_plus_certification_candidate is not null)::bigint as plus_candidates,
    (select count(*) from public.psdeals_stage_items where lobodeals_lowest_regular_price_amount is not null)::bigint as regular_minima,
    (select count(*) from public.psdeals_stage_items where lobodeals_lowest_ps_plus_price_amount is not null)::bigint as plus_minima,
    (select count(*) from public.ps_plus_monthly_games)::bigint as monthly_rows,
    (select count(*) from public.ps_plus_monthly_games where is_active)::bigint as active_monthly_rows,
    (select count(*) from public.catalog_public_cache)::bigint as cache_rows
),
required_stage_columns(column_name) as (
  values
    ('id'), ('region_code'), ('storefront'), ('psdeals_id'), ('psdeals_slug'),
    ('psdeals_url'), ('content_type'), ('item_type_label'),
    ('current_price_amount'), ('original_price_amount'), ('discount_percent'),
    ('deal_ends_at'), ('is_ps_plus_discount'), ('raw_detail_json'),
    ('source_note'), ('updated_at'), ('regular_certification_candidate'),
    ('ps_plus_certification_candidate')
),
stage_columns as materialized (
  select count(*)::integer as expected_count,
    count(*) filter (where actual.column_name is not null)::integer as present_count
  from required_stage_columns as required
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
   and actual.table_name = 'psdeals_stage_items'
   and actual.column_name = required.column_name
),
required_monthly_columns(column_name) as (
  values ('item_id'), ('is_active'), ('active_from'), ('active_until'),
    ('active_from_at'), ('active_until_at')
),
monthly_columns as materialized (
  select count(*)::integer as expected_count,
    count(*) filter (where actual.column_name is not null)::integer as present_count
  from required_monthly_columns as required
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
   and actual.table_name = 'ps_plus_monthly_games'
   and actual.column_name = required.column_name
),
required_cycle_columns(column_name) as (
  values ('local_cycle_id'), ('run_token_sha256'), ('code_revision'),
    ('filter_fingerprint'), ('manifest_hash'), ('mode'), ('listing_complete'),
    ('cache_refreshed_at'), ('public_validation_completed_at'), ('metrics_recorded_at')
),
cycle_columns as materialized (
  select count(*)::integer as expected_count,
    count(*) filter (where actual.column_name is not null)::integer as present_count
  from required_cycle_columns as required
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
   and actual.table_name = 'price_refresh_cycles'
   and actual.column_name = required.column_name
),
required_receipt_columns(column_name) as (
  values ('id'), ('cycle_id'), ('parent_receipt_id'), ('action_kind'),
    ('idempotency_key'), ('attempt'), ('request_hash'), ('input_artifact_hash'),
    ('status'), ('started_at'), ('finished_at'), ('affected_rows'), ('result'),
    ('error_code'), ('created_at'), ('updated_at')
),
receipt_columns as materialized (
  select count(*)::integer as expected_count,
    count(*) filter (where actual.column_name is not null)::integer as present_count
  from required_receipt_columns as required
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
   and actual.table_name = 'psdeals_cycle_action_receipts'
   and actual.column_name = required.column_name
),
receipt_security as materialized (
  select
    relation.relrowsecurity as rls_enabled,
    relation.relforcerowsecurity as force_rls,
    owner_role.rolname as owner_name,
    (select count(*) from pg_catalog.pg_policy where polrelid = relation.oid)::integer as policy_count
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  join pg_catalog.pg_roles as owner_role on owner_role.oid = relation.relowner
  where namespace.nspname = 'public' and relation.relname = 'psdeals_cycle_action_receipts'
),
ended_functions as materialized (
  select
    procedure.proname,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments,
    owner_role.rolname as owner_name,
    procedure.prosecdef as security_definer,
    coalesce(procedure.proconfig, array[]::text[]) as proconfig,
    procedure.proacl::text as acl_text,
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(procedure.oid), 'UTF8')),
      'hex'
    ) as definition_sha256,
    pg_catalog.obj_description(procedure.oid, 'pg_proc') as function_comment,
    pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
    pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
    pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_roles as owner_role on owner_role.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname in ('apply_psdeals_ended_deals_v1', 'apply_psdeals_ended_deals_v2')
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
      'p_cycle_id uuid, p_ended_analysis_receipt_id uuid, p_idempotency_key text, p_request_hash text, p_listing_artifact_hash text, p_analysis_evidence_hash text, p_candidate_set_hash text, p_candidate_psdeals_ids bigint[], p_expected_count integer, p_applied_at timestamp with time zone'
),
lifecycle_functions as materialized (
  select count(*)::integer as exact_count,
    count(*) filter (
      where procedure.prosecdef
        and coalesce(procedure.proconfig, array[]::text[]) = array['search_path=""']::text[]
        and owner_role.rolname = 'postgres'
        and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
    )::integer as secured_count
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_roles as owner_role on owner_role.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname in (
      'begin_psdeals_cycle_action_v1', 'finish_psdeals_cycle_action_v1',
      'create_or_reconcile_price_refresh_cycle_v1',
      'record_psdeals_listing_completion_v1', 'record_psdeals_monthly_check_v1',
      'apply_psdeals_ended_deals_v1', 'apply_psdeals_ended_deals_v2',
      'mark_psdeals_price_refresh_cycle_succeeded_v1',
      'certify_price_refresh_cycle_v2', 'refresh_catalog_public_cache_v16'
    )
),
index_summary as materialized (
  select
    count(*) filter (where indexname in (
      'price_refresh_cycles_local_cycle_id_unique_idx',
      'price_refresh_cycles_run_token_sha256_unique_idx',
      'price_refresh_cycles_local_identity_unique_idx'
    ))::integer as cycle_indexes,
    count(*) filter (where indexname in (
      'psdeals_cycle_action_receipts_pkey',
      'psdeals_cycle_action_receipts_idempotency_unique',
      'psdeals_cycle_action_receipts_cycle_kind_status_idx',
      'psdeals_cycle_action_receipts_parent_idx'
    ))::integer as receipt_indexes,
    count(*) filter (where indexname = 'psdeals_stage_items_unique_psdeals')::integer as stage_identity_indexes
  from pg_catalog.pg_indexes
  where schemaname = 'public'
),
lock_summary as materialized (
  select
    count(*) filter (where lock_row.granted)::integer as granted_locks,
    count(*) filter (where not lock_row.granted)::integer as waiting_locks
  from pg_catalog.pg_locks as lock_row
  where lock_row.pid <> pg_catalog.pg_backend_pid()
    and lock_row.relation in (
      'public.price_refresh_cycles'::regclass,
      'public.psdeals_cycle_action_receipts'::regclass,
      'public.psdeals_stage_items'::regclass,
      'public.ps_plus_monthly_games'::regclass
    )
),
activity_summary as materialized (
  select count(*)::integer as relevant_active_backends
  from pg_catalog.pg_stat_activity as activity
  where activity.pid <> pg_catalog.pg_backend_pid()
    and activity.backend_type = 'client backend'
    and activity.state is distinct from 'idle'
    and activity.query ~* '(price_refresh_cycles|psdeals_cycle_action_receipts|psdeals_stage_items|ps_plus_monthly_games)'
),
checks(check_id, check_name, severity, passed, observed, expected) as (
  select 1, 'database_and_postgresql_17', 'blocker',
    context.database_name = 'postgres' and context.server_version_num >= 170000,
    jsonb_build_object('database', context.database_name, 'server_version_num', context.server_version_num),
    jsonb_build_object('database', 'postgres', 'server_version_num_min', 170000)
  from certificate_context as context
  union all select 2, 'migrations_004_005_006_registered', 'blocker',
    history.migration_004_count = 1 and history.migration_005_count = 1 and history.migration_006_count = 1,
    to_jsonb(history), jsonb_build_object('migration_004_count', 1, 'migration_005_count', 1, 'migration_006_count', 1)
  from migration_history as history
  union all select 3, 'migration_007_registered_once', 'blocker', history.migration_007_count = 1,
    jsonb_build_object('migration_007_count', history.migration_007_count), jsonb_build_object('migration_007_count', 1)
  from migration_history as history
  union all select 4, 'required_relations_present', 'blocker',
    catalog.stage_oid is not null and catalog.cycles_oid is not null and catalog.receipts_oid is not null and catalog.monthly_oid is not null and catalog.cache_oid is not null,
    to_jsonb(catalog), jsonb_build_object('all_required_relations_present', true)
  from relation_catalog as catalog
  union all select 5, 'detailed_history_absent', 'blocker', catalog.history_oid is null,
    jsonb_build_object('history_oid', catalog.history_oid), jsonb_build_object('history_oid', null)
  from relation_catalog as catalog
  union all select 6, 'zero_cycles', 'blocker', counts.cycles = 0,
    jsonb_build_object('cycles', counts.cycles), jsonb_build_object('cycles', 0)
  from operational_counts as counts
  union all select 7, 'zero_receipts', 'blocker', counts.receipts = 0,
    jsonb_build_object('receipts', counts.receipts), jsonb_build_object('receipts', 0)
  from operational_counts as counts
  union all select 8, 'stage_columns', 'blocker', columns.present_count = columns.expected_count,
    to_jsonb(columns), jsonb_build_object('present_equals_expected', true)
  from stage_columns as columns
  union all select 9, 'monthly_columns', 'blocker', columns.present_count = columns.expected_count,
    to_jsonb(columns), jsonb_build_object('present_equals_expected', true)
  from monthly_columns as columns
  union all select 10, 'cycle_columns', 'blocker', columns.present_count = columns.expected_count,
    to_jsonb(columns), jsonb_build_object('present_equals_expected', true)
  from cycle_columns as columns
  union all select 11, 'receipt_columns', 'blocker', columns.present_count = columns.expected_count,
    to_jsonb(columns), jsonb_build_object('present_equals_expected', true)
  from receipt_columns as columns
  union all select 12, 'required_indexes', 'blocker',
    indexes.cycle_indexes = 3 and indexes.receipt_indexes = 4 and indexes.stage_identity_indexes = 1,
    to_jsonb(indexes), jsonb_build_object('cycle_indexes', 3, 'receipt_indexes', 4, 'stage_identity_indexes', 1)
  from index_summary as indexes
  union all select 13, 'receipt_rls_and_policies', 'blocker',
    security.rls_enabled and not security.force_rls and security.owner_name = 'postgres' and security.policy_count = 0,
    to_jsonb(security), jsonb_build_object('rls_enabled', true, 'force_rls', false, 'owner_name', 'postgres', 'policy_count', 0)
  from receipt_security as security
  union all select 14, 'v1_exact_definition', 'blocker',
    count(*) = 1 and bool_and(definition_sha256 = 'e2809e095b09088af405416151f39c6081ac0dd34b981d619e74db5377f6863e'),
    jsonb_build_object('count', count(*), 'sha256', min(definition_sha256)),
    jsonb_build_object('count', 1, 'sha256', 'e2809e095b09088af405416151f39c6081ac0dd34b981d619e74db5377f6863e')
  from ended_functions where proname = 'apply_psdeals_ended_deals_v1'
  union all select 15, 'v1_revoked_security_contract', 'blocker',
    count(*) = 1 and bool_and(owner_name = 'postgres' and security_definer
      and proconfig = array['search_path=""']::text[] and acl_text = '{postgres=X/postgres}'
      and not service_role_execute and not anon_execute and not authenticated_execute),
    jsonb_build_object('count', count(*), 'owner', min(owner_name), 'acl', min(acl_text), 'service_role_execute', bool_or(service_role_execute)),
    jsonb_build_object('count', 1, 'owner', 'postgres', 'acl', '{postgres=X/postgres}', 'service_role_execute', false)
  from ended_functions where proname = 'apply_psdeals_ended_deals_v1'
  union all select 16, 'v2_exact_definition', 'blocker',
    count(*) = 1 and bool_and(definition_sha256 = '6d1c5266784bc309eb3f06e49648875e668a89bef5c9c500cc61349a002cf07a'),
    jsonb_build_object('count', count(*), 'sha256', min(definition_sha256)),
    jsonb_build_object('count', 1, 'sha256', '6d1c5266784bc309eb3f06e49648875e668a89bef5c9c500cc61349a002cf07a')
  from ended_functions where proname = 'apply_psdeals_ended_deals_v2'
  union all select 17, 'v2_security_acl_and_comment', 'blocker',
    count(*) = 1 and bool_and(owner_name = 'postgres' and security_definer
      and proconfig = array['search_path=""']::text[]
      and acl_text = '{postgres=X/postgres,service_role=X/postgres}'
      and service_role_execute and not anon_execute and not authenticated_execute
      and function_comment = 'Strict receipt-bound safe demotion. Rejects PS Plus, active Monthly, future deals, incoherent prices, invalid family, doubtful identity, and incomplete listings before delegating atomically to v1.'),
    jsonb_build_object('count', count(*), 'owner', min(owner_name), 'acl', min(acl_text), 'comment', min(function_comment)),
    jsonb_build_object('count', 1, 'owner', 'postgres', 'acl', '{postgres=X/postgres,service_role=X/postgres}', 'comment_matches', true)
  from ended_functions where proname = 'apply_psdeals_ended_deals_v2'
  union all select 18, 'lifecycle_function_count', 'blocker', functions.exact_count = 10,
    to_jsonb(functions), jsonb_build_object('exact_count', 10)
  from lifecycle_functions as functions
  union all select 19, 'lifecycle_function_security', 'blocker', functions.secured_count = 10,
    to_jsonb(functions), jsonb_build_object('secured_count', 10)
  from lifecycle_functions as functions
  union all select 20, 'candidates_and_minima_empty', 'blocker',
    counts.regular_candidates = 0 and counts.plus_candidates = 0 and counts.regular_minima = 0 and counts.plus_minima = 0,
    jsonb_build_object('regular_candidates', counts.regular_candidates, 'plus_candidates', counts.plus_candidates, 'regular_minima', counts.regular_minima, 'plus_minima', counts.plus_minima),
    jsonb_build_object('regular_candidates', 0, 'plus_candidates', 0, 'regular_minima', 0, 'plus_minima', 0)
  from operational_counts as counts
  union all select 21, 'monthly_and_cache_observable', 'informational',
    counts.monthly_rows >= 0 and counts.active_monthly_rows >= 0 and counts.cache_rows >= 0 and counts.stage_rows > 0,
    jsonb_build_object('stage_rows', counts.stage_rows, 'monthly_rows', counts.monthly_rows, 'active_monthly_rows', counts.active_monthly_rows, 'cache_rows', counts.cache_rows),
    jsonb_build_object('observable_nonnegative_counts', true, 'stage_rows_positive', true)
  from operational_counts as counts
  union all select 22, 'no_target_waiters_or_active_clients', 'blocker',
    locks.waiting_locks = 0 and activity.relevant_active_backends = 0,
    jsonb_build_object('granted_locks', locks.granted_locks, 'waiting_locks', locks.waiting_locks, 'relevant_active_backends', activity.relevant_active_backends),
    jsonb_build_object('waiting_locks', 0, 'relevant_active_backends', 0)
  from lock_summary as locks cross join activity_summary as activity
  union all select 23, 'migration_007_post_application_contract', 'blocker',
    context.current_user_name = 'postgres' and history.migration_007_count = 1
      and counts.cycles = 0 and counts.receipts = 0
      and coalesce((select not service_role_execute from ended_functions where proname = 'apply_psdeals_ended_deals_v1'), false)
      and coalesce((select service_role_execute from ended_functions where proname = 'apply_psdeals_ended_deals_v2'), false),
    jsonb_build_object('current_user', context.current_user_name, 'migration_007_count', history.migration_007_count, 'cycles', counts.cycles, 'receipts', counts.receipts),
    jsonb_build_object('current_user', 'postgres', 'migration_007_count', 1, 'cycles', 0, 'receipts', 0)
  from certificate_context as context
  cross join migration_history as history
  cross join operational_counts as counts
)
select
  checks.check_id::integer,
  checks.check_name::text,
  checks.severity::text,
  checks.passed::boolean,
  checks.observed::jsonb,
  checks.expected::jsonb,
  (checks.severity = 'blocker' and not checks.passed)::boolean as blocker,
  context.checked_at::timestamptz,
  context.backend_pid::integer,
  context.snapshot::text
from checks
cross join certificate_context as context
order by checks.check_id;
