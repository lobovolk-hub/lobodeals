-- LoboDeals 3.2
-- Fail-closed safe-demotion hardening.
--
-- This migration is additive. It creates a stricter v2 entrypoint, removes
-- service-role access to v1, and performs no deal demotion or data backfill.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Serializes the zero-cycle precondition with create-cycle. Without this lock,
-- a cycle could be inserted after the count below and before the ACL switch.
lock table public.price_refresh_cycles in access exclusive mode;

do $preflight$
declare
  current_v1_sha256 text;
  v1_oid oid;
  v1_owner text;
  v1_security_definer boolean;
  v1_proconfig text[];
  cycle_count bigint;
  receipt_count bigint;
  missing_stage_columns integer;
  missing_monthly_columns integer;
begin
  if current_user <> 'postgres' then
    raise exception 'PSDEALS_007_POSTGRES_OWNER_REQUIRED';
  end if;

  if to_regclass('public.psdeals_stage_items') is null
    or to_regclass('public.price_refresh_cycles') is null
    or to_regclass('public.psdeals_cycle_action_receipts') is null
    or to_regclass('public.ps_plus_monthly_games') is null then
    raise exception 'PSDEALS_007_REQUIRED_TABLE_MISSING';
  end if;

  if to_regprocedure(
    'public.apply_psdeals_ended_deals_v1(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamp with time zone)'
  ) is null then
    raise exception 'PSDEALS_007_V1_FUNCTION_MISSING';
  end if;

  v1_oid := to_regprocedure(
    'public.apply_psdeals_ended_deals_v1(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamp with time zone)'
  );

  if to_regprocedure(
    'public.apply_psdeals_ended_deals_v2(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamp with time zone)'
  ) is not null then
    raise exception 'PSDEALS_007_V2_FUNCTION_ALREADY_EXISTS';
  end if;

  select pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(
          v1_oid
        ),
        'UTF8'
      )
    ),
    'hex'
  )
  into current_v1_sha256;

  if current_v1_sha256 <> 'e2809e095b09088af405416151f39c6081ac0dd34b981d619e74db5377f6863e' then
    raise exception 'PSDEALS_007_V1_FUNCTION_HASH_MISMATCH';
  end if;

  select
    owner_role.rolname,
    procedure.prosecdef,
    coalesce(procedure.proconfig, array[]::text[])
  into v1_owner, v1_security_definer, v1_proconfig
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  where procedure.oid = v1_oid;

  if v1_owner <> 'postgres'
    or v1_security_definer is distinct from true
    or v1_proconfig <> array['search_path=""']::text[]
    or not pg_catalog.has_function_privilege('service_role', v1_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v1_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v1_oid, 'EXECUTE') then
    raise exception 'PSDEALS_007_V1_SECURITY_CONTRACT_MISMATCH';
  end if;

  select count(*) into cycle_count from public.price_refresh_cycles;
  if cycle_count <> 0 then
    raise exception 'PSDEALS_007_REQUIRES_ZERO_CYCLES';
  end if;

  select count(*) into receipt_count
  from public.psdeals_cycle_action_receipts;
  if receipt_count <> 0 then
    raise exception 'PSDEALS_007_REQUIRES_ZERO_RECEIPTS';
  end if;

  select count(*)::integer
  into missing_stage_columns
  from (
    values
      ('id'),
      ('region_code'),
      ('storefront'),
      ('psdeals_id'),
      ('psdeals_slug'),
      ('psdeals_url'),
      ('content_type'),
      ('item_type_label'),
      ('current_price_amount'),
      ('original_price_amount'),
      ('discount_percent'),
      ('deal_ends_at'),
      ('is_ps_plus_discount'),
      ('raw_detail_json'),
      ('source_note'),
      ('updated_at')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as actual
    where actual.table_schema = 'public'
      and actual.table_name = 'psdeals_stage_items'
      and actual.column_name = required.column_name
  );

  if missing_stage_columns <> 0 then
    raise exception 'PSDEALS_007_REQUIRED_STAGE_COLUMN_MISSING';
  end if;

  select count(*)::integer
  into missing_monthly_columns
  from (
    values
      ('item_id'),
      ('is_active'),
      ('active_from'),
      ('active_until'),
      ('active_from_at'),
      ('active_until_at')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as actual
    where actual.table_schema = 'public'
      and actual.table_name = 'ps_plus_monthly_games'
      and actual.column_name = required.column_name
  );

  if missing_monthly_columns <> 0 then
    raise exception 'PSDEALS_007_REQUIRED_MONTHLY_COLUMN_MISSING';
  end if;
end;
$preflight$;

create function public.apply_psdeals_ended_deals_v2(
  p_cycle_id uuid,
  p_ended_analysis_receipt_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_listing_artifact_hash text,
  p_analysis_evidence_hash text,
  p_candidate_set_hash text,
  p_candidate_psdeals_ids bigint[],
  p_expected_count integer,
  p_applied_at timestamptz
)
returns public.psdeals_cycle_action_receipts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  canonical_ids bigint[];
  rows_found integer := 0;
  ineligible_rows integer := 0;
begin
  select *
  into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id
  for update;

  if not found
    or cycle_row.status <> 'running'
    or cycle_row.listing_complete is distinct from true
    or cycle_row.listing_completed_at is null then
    raise exception 'PSDEALS_DEMOTION_V2_CYCLE_NOT_READY';
  end if;

  select coalesce(
    array_agg(distinct candidate_id order by candidate_id),
    '{}'::bigint[]
  )
  into canonical_ids
  from unnest(p_candidate_psdeals_ids) as candidate(candidate_id);

  if p_candidate_psdeals_ids is null
    or p_expected_count is null
    or canonical_ids <> p_candidate_psdeals_ids
    or cardinality(canonical_ids) <> p_expected_count
    or p_expected_count < 0
    or p_expected_count > 500
    or exists (
      select 1
      from unnest(canonical_ids) as candidate(candidate_id)
      where candidate_id <= 0
    ) then
    raise exception 'PSDEALS_DEMOTION_V2_CANDIDATES_NOT_CANONICAL';
  end if;

  lock table public.ps_plus_monthly_games in share mode;

  perform 1
  from public.psdeals_stage_items as item
  where item.region_code = cycle_row.region_code
    and item.storefront = cycle_row.storefront
    and item.psdeals_id = any(canonical_ids)
  for update;

  select
    count(*)::integer,
    count(*) filter (
      where item.current_price_amount is null
        or item.original_price_amount is null
        or item.current_price_amount <= 0
        or item.original_price_amount <= 0
        or item.original_price_amount <= item.current_price_amount
        or item.discount_percent is null
        or item.discount_percent not between 1 and 99
        or item.discount_percent <> round(
          100 * (
            item.original_price_amount - item.current_price_amount
          ) / item.original_price_amount
        )::integer
        or item.is_ps_plus_discount is distinct from false
        or item.psdeals_slug is null
        or btrim(item.psdeals_slug) = ''
        or item.psdeals_url is null
        or item.psdeals_url not like
          'https://psdeals.net/us-store/game/'
          || item.psdeals_id::text
          || '/%'
        or not (
          (item.content_type = 'game' and item.item_type_label = 'game')
          or (item.content_type = 'bundle' and item.item_type_label = 'bundle')
          or (item.content_type = 'dlc' and item.item_type_label = 'addon')
        )
        or (
          item.deal_ends_at is not null
          and item.deal_ends_at > p_applied_at
        )
        or exists (
          select 1
          from public.ps_plus_monthly_games as monthly_game
          where monthly_game.item_id = item.id
            and monthly_game.is_active = true
            and coalesce(
              monthly_game.active_from_at,
              monthly_game.active_from::timestamptz,
              '-infinity'::timestamptz
            ) <= p_applied_at
            and coalesce(
              monthly_game.active_until_at,
              (monthly_game.active_until + interval '1 day')::timestamptz,
              'infinity'::timestamptz
            ) > p_applied_at
        )
    )::integer
  into rows_found, ineligible_rows
  from public.psdeals_stage_items as item
  where item.region_code = cycle_row.region_code
    and item.storefront = cycle_row.storefront
    and item.psdeals_id = any(canonical_ids);

  if rows_found <> p_expected_count or ineligible_rows <> 0 then
    raise exception 'PSDEALS_DEMOTION_V2_EXACT_SET_NOT_ELIGIBLE';
  end if;

  return public.apply_psdeals_ended_deals_v1(
    p_cycle_id,
    p_ended_analysis_receipt_id,
    p_idempotency_key,
    p_request_hash,
    p_listing_artifact_hash,
    p_analysis_evidence_hash,
    p_candidate_set_hash,
    p_candidate_psdeals_ids,
    p_expected_count,
    p_applied_at
  );
end;
$function$;

comment on function public.apply_psdeals_ended_deals_v2(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
) is
  'Strict receipt-bound safe demotion. Rejects PS Plus, active Monthly, future deals, incoherent prices, invalid family, doubtful identity, and incomplete listings before delegating atomically to v1.';

revoke all on function public.apply_psdeals_ended_deals_v1(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
) from service_role;

revoke all on function public.apply_psdeals_ended_deals_v2(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
) from public, anon, authenticated;

grant execute on function public.apply_psdeals_ended_deals_v2(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
) to service_role;

commit;
