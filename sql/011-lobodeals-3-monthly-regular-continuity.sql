-- LoboDeals 3.2
-- Additive Monthly regular-price continuity for the Daily Runner.
--
-- This migration does not backfill rows and never copies legacy lows into
-- certified lows. It adds certification v5 for a positive, same-cycle Detail
-- no-discount tuple belonging to an active official Monthly game. The free
-- Monthly entitlement and every zero-price signal remain outside commerce and
-- outside Lowest PS+ Price Ever.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $lobodeals_011_precheck$
declare
  v4_definition text;
  v5 regprocedure;
  v25 regprocedure;
  v5_source_sha256 text;
  v25_source_sha256 text;
  v_owner name;
  v_security_definer boolean;
  v_proconfig text[];
  v_language name;
  v_volatility "char";
  v_expected_v5_source_sha256 constant text := 'a5a285b6b181cf265ec2401bed9e4886e396e660cd159d013ba875e6bc099548';
  v_expected_v25_source_sha256 constant text := 'c7d056f2e70bfc85890e94661fb548f4f7c06107caeb9681ae31eebe85ee59f6';
begin
  if current_user <> 'postgres' then
    raise exception 'LOBODEALS_011_POSTGRES_OWNER_REQUIRED';
  end if;

  if to_regprocedure(
       'public.certify_price_refresh_cycle_v4(uuid,uuid,text,text,timestamp with time zone)'
     ) is null
     or to_regprocedure('public.lobodeals_daily_runner_v24_preflight()') is null then
    raise exception 'LOBODEALS_011_REQUIRED_009_CONTRACT_MISSING';
  end if;

  if to_regclass('public.psdeals_stage_items') is null
     or to_regclass('public.ps_plus_monthly_games') is null
     or to_regclass('public.price_refresh_cycles') is null
     or to_regclass('public.psdeals_cycle_action_receipts') is null then
    raise exception 'LOBODEALS_011_REQUIRED_RELATION_MISSING';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema='public'
      and table_name='psdeals_stage_items'
      and column_name in (
        'monthly_regular_certification_cycle_id',
        'monthly_regular_certification_observed_at',
        'monthly_regular_certification_evidence_sha256',
        'monthly_regular_certification_input_artifact_sha256',
        'monthly_regular_certification_candidate',
        'public_offer_verification_cycle_id',
        'public_offer_verified_at',
        'public_offer_verification_source',
        'public_offer_evidence_sha256',
        'public_offer_input_artifact_sha256',
        'lobodeals_lowest_regular_price_amount',
        'lobodeals_lowest_regular_price_first_seen_at',
        'lobodeals_lowest_ps_plus_price_amount'
      )
  ) <> 13 then
    raise exception 'LOBODEALS_011_REQUIRED_STAGE_COLUMNS_MISSING';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid)
  into v4_definition
  from pg_catalog.pg_proc p
  where p.oid=to_regprocedure(
    'public.certify_price_refresh_cycle_v4(uuid,uuid,text,text,timestamp with time zone)'
  )::oid;

  if v4_definition is null
     or position('monthly_entitlement_excluded_from_ps_plus_low' in v4_definition)=0
     or position('temporary_free_promotion_candidate' in v4_definition)=0 then
    raise exception 'LOBODEALS_011_CERTIFY_V4_SEMANTIC_DRIFT';
  end if;

  v5 := to_regprocedure(
    'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)'
  );
  v25 := to_regprocedure('public.lobodeals_daily_runner_v25_preflight()');

  -- A previous successful 011 install owns v5 and v25 as one atomic pair.
  -- Any partial or independently-created pair is drift, never replacement input.
  if (v5 is null) <> (v25 is null) then
    raise exception 'LOBODEALS_011_PREEXISTING_CONTRACT_PARTIAL';
  end if;

  if v5 is not null then
    select
      pg_catalog.pg_get_userbyid(procedure.proowner),
      procedure.prosecdef,
      coalesce(procedure.proconfig,array[]::text[]),
      language.lanname,
      procedure.provolatile,
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            pg_catalog.replace(
              procedure.prosrc,
              pg_catalog.chr(13),
              ''
            ),
            'UTF8'
          )
        ),
        'hex'
      )
    into
      v_owner,
      v_security_definer,
      v_proconfig,
      v_language,
      v_volatility,
      v5_source_sha256
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_language language on language.oid=procedure.prolang
    where procedure.oid=v5::oid;

    if v_owner <> 'postgres'
       or not v_security_definer
       or v_proconfig <> array['search_path=""']::text[]
       or v_language <> 'plpgsql'
       or v_volatility <> 'v'
       or v5_source_sha256 <> v_expected_v5_source_sha256
       or has_function_privilege(
         'public',
         'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)',
         'EXECUTE'
       )
       or has_function_privilege(
         'anon',
         'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)',
         'EXECUTE'
       )
       or has_function_privilege(
         'authenticated',
         'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)',
         'EXECUTE'
       )
       or not has_function_privilege(
         'service_role',
         'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)',
         'EXECUTE'
       )
       or exists (
         select 1
         from pg_catalog.pg_proc procedure,
         lateral pg_catalog.aclexplode(
           coalesce(
             procedure.proacl,
             pg_catalog.acldefault('f',procedure.proowner)
           )
         ) privilege
         where procedure.oid=v5::oid
           and (
             privilege.privilege_type <> 'EXECUTE'
             or privilege.grantee not in (
               procedure.proowner,
               (select oid from pg_catalog.pg_roles where rolname='service_role')
             )
             or (
               privilege.grantee=(
                 select oid from pg_catalog.pg_roles where rolname='service_role'
               )
               and privilege.is_grantable
             )
           )
       ) then
      raise exception 'LOBODEALS_011_PREEXISTING_V5_DRIFT:%',v5_source_sha256;
    end if;

    select
      pg_catalog.pg_get_userbyid(procedure.proowner),
      procedure.prosecdef,
      coalesce(procedure.proconfig,array[]::text[]),
      language.lanname,
      procedure.provolatile,
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            pg_catalog.replace(
              procedure.prosrc,
              pg_catalog.chr(13),
              ''
            ),
            'UTF8'
          )
        ),
        'hex'
      )
    into
      v_owner,
      v_security_definer,
      v_proconfig,
      v_language,
      v_volatility,
      v25_source_sha256
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_language language on language.oid=procedure.prolang
    where procedure.oid=v25::oid;

    if v_owner <> 'postgres'
       or not v_security_definer
       or v_proconfig <> array['search_path=""']::text[]
       or v_language <> 'sql'
       or v_volatility <> 's'
       or v25_source_sha256 <> v_expected_v25_source_sha256
       or has_function_privilege(
         'public','public.lobodeals_daily_runner_v25_preflight()','EXECUTE'
       )
       or has_function_privilege(
         'anon','public.lobodeals_daily_runner_v25_preflight()','EXECUTE'
       )
       or has_function_privilege(
         'authenticated','public.lobodeals_daily_runner_v25_preflight()','EXECUTE'
       )
       or not has_function_privilege(
         'service_role','public.lobodeals_daily_runner_v25_preflight()','EXECUTE'
       )
       or exists (
         select 1
         from pg_catalog.pg_proc procedure,
         lateral pg_catalog.aclexplode(
           coalesce(
             procedure.proacl,
             pg_catalog.acldefault('f',procedure.proowner)
           )
         ) privilege
         where procedure.oid=v25::oid
           and (
             privilege.privilege_type <> 'EXECUTE'
             or privilege.grantee not in (
               procedure.proowner,
               (select oid from pg_catalog.pg_roles where rolname='service_role')
             )
             or (
               privilege.grantee=(
                 select oid from pg_catalog.pg_roles where rolname='service_role'
               )
               and privilege.is_grantable
             )
           )
       ) then
      raise exception 'LOBODEALS_011_PREEXISTING_V25_DRIFT:%',v25_source_sha256;
    end if;
  end if;
end
$lobodeals_011_precheck$;

create or replace function public.certify_price_refresh_cycle_v5(
  p_cycle_id uuid,
  p_mark_succeeded_receipt_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_started_at timestamptz
)
returns table(
  receipt_id uuid,
  action_status text,
  reconciled boolean,
  certification_timestamp timestamptz,
  regular_initialized integer,
  regular_lowered integer,
  ps_plus_initialized integer,
  ps_plus_lowered integer,
  error_code text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  existing_receipt public.psdeals_cycle_action_receipts%rowtype;
  v4_result record;
  monthly_positive_initialized integer := 0;
  monthly_positive_lowered integer := 0;
begin
  perform pg_catalog.set_config('statement_timeout','0',true);

  select * into existing_receipt
  from public.psdeals_cycle_action_receipts
  where idempotency_key=p_idempotency_key;

  if found then
    if existing_receipt.cycle_id <> p_cycle_id
      or existing_receipt.parent_receipt_id is distinct from p_mark_succeeded_receipt_id
      or existing_receipt.action_kind <> 'certify'
      or existing_receipt.request_hash <> p_request_hash then
      raise exception 'PSDEALS_CERTIFY_V5_IDEMPOTENCY_MISMATCH';
    end if;
    if existing_receipt.status in ('intent','running','indeterminate') then
      raise exception 'PSDEALS_CERTIFY_V5_EXISTING_RECEIPT_NOT_TERMINAL';
    end if;
    if existing_receipt.status='committed'
       and coalesce((existing_receipt.result ->> 'contract_version')::integer,0) <> 5 then
      raise exception 'PSDEALS_CERTIFY_V5_EXISTING_RECEIPT_CONTRACT_MISMATCH';
    end if;

    return query select
      existing_receipt.id,
      existing_receipt.status,
      true,
      nullif(existing_receipt.result ->> 'certification_timestamp','')::timestamptz,
      nullif(existing_receipt.result ->> 'regular_initialized','')::integer,
      nullif(existing_receipt.result ->> 'regular_lowered','')::integer,
      nullif(existing_receipt.result ->> 'ps_plus_initialized','')::integer,
      nullif(existing_receipt.result ->> 'ps_plus_lowered','')::integer,
      existing_receipt.error_code::text;
    return;
  end if;

  select * into v4_result
  from public.certify_price_refresh_cycle_v4(
    p_cycle_id,
    p_mark_succeeded_receipt_id,
    p_idempotency_key,
    p_request_hash,
    p_started_at
  );

  if v4_result.action_status='committed' then
    with eligible as (
      select
        item.id,
        item.monthly_regular_certification_observed_at as observed_at,
        (item.monthly_regular_certification_candidate ->> 'regular_price_amount')::numeric as regular_amount,
        item.lobodeals_lowest_regular_price_amount as previous_low
      from public.psdeals_stage_items item
      join public.price_refresh_cycles cycle on cycle.id=p_cycle_id
      where item.region_code=cycle.region_code
        and item.storefront=cycle.storefront
        and item.monthly_regular_certification_cycle_id=p_cycle_id
        and item.monthly_regular_certification_observed_at
          between cycle.started_at and cycle.details_completed_at
        and item.monthly_regular_certification_candidate ->> 'kind'='monthly_regular'
        and item.monthly_regular_certification_candidate ->> 'contract_version'='1'
        and item.monthly_regular_certification_candidate ->> 'cycle_id'=p_cycle_id::text
        and item.monthly_regular_certification_candidate ->> 'psdeals_id'=item.psdeals_id::text
        and item.monthly_regular_certification_candidate ->> 'region_code'=cycle.region_code
        and item.monthly_regular_certification_candidate ->> 'storefront'=cycle.storefront
        and item.monthly_regular_certification_candidate ->> 'currency_code'='USD'
        and item.monthly_regular_certification_candidate ->> 'classification'='no_discount'
        and item.monthly_regular_certification_candidate ->> 'content_type'='game'
        and item.monthly_regular_certification_candidate ->> 'item_type_label'='game'
        and item.monthly_regular_certification_candidate -> 'platforms' in (
          '["PS4"]'::jsonb,
          '["PS5"]'::jsonb,
          '["PS5", "PS4"]'::jsonb
        )
        and item.monthly_regular_certification_candidate ->> 'regular_price_amount'
          ~ '^[0-9]+(\.[0-9]{1,2})?$'
        and (item.monthly_regular_certification_candidate ->> 'regular_price_amount')::numeric > 0
        and (item.monthly_regular_certification_candidate ->> 'regular_price_amount')::numeric <= 999
        and item.monthly_regular_certification_candidate -> 'entitlement_price_amount'='null'::jsonb
        and item.monthly_regular_certification_candidate -> 'discount_percent'
          in ('null'::jsonb,'0'::jsonb)
        and item.monthly_regular_certification_evidence_sha256 ~ '^[a-f0-9]{64}$'
        and item.monthly_regular_certification_evidence_sha256
          = item.monthly_regular_certification_candidate ->> 'evidence_sha256'
        and item.monthly_regular_certification_input_artifact_sha256
          = item.monthly_regular_certification_candidate ->> 'input_artifact_sha256'
        and item.monthly_regular_certification_input_artifact_sha256 ~ '^[a-f0-9]{64}$'
        and item.monthly_regular_certification_candidate ->> 'candidate_sha256' ~ '^[a-f0-9]{64}$'
        and item.current_price_amount
          =(item.monthly_regular_certification_candidate ->> 'regular_price_amount')::numeric
        and item.current_price_amount > 0
        and item.is_free_to_play=false
        and item.content_type='game'
        and item.item_type_label='game'
        and exists (
          select 1
          from public.psdeals_cycle_action_receipts detail_receipt
          where detail_receipt.cycle_id=p_cycle_id
            and detail_receipt.action_kind in ('detail_import','detail_retry')
            and detail_receipt.status='committed'
            and detail_receipt.input_artifact_hash
              =item.monthly_regular_certification_input_artifact_sha256
            and coalesce((detail_receipt.result ->> 'pending_failures')::integer,0)=0
        )
        and exists (
          select 1
          from public.psdeals_cycle_action_receipts monthly_receipt
          where monthly_receipt.cycle_id=p_cycle_id
            and monthly_receipt.action_kind='monthly_check_record'
            and monthly_receipt.status='committed'
        )
        and exists (
          select 1
          from public.ps_plus_monthly_games monthly_game
          where monthly_game.item_id=item.id
            and monthly_game.is_active=true
            and coalesce(
              monthly_game.active_from_at,
              monthly_game.active_from::timestamptz
            ) <= item.monthly_regular_certification_observed_at
            and coalesce(
              monthly_game.active_until_at,
              (monthly_game.active_until + 1)::timestamptz
            ) > item.monthly_regular_certification_observed_at
        )
    ),
    applied as (
      update public.psdeals_stage_items item
      set
        lobodeals_lowest_regular_price_amount=least(
          coalesce(item.lobodeals_lowest_regular_price_amount,eligible.regular_amount),
          eligible.regular_amount
        ),
        lobodeals_lowest_regular_price_first_seen_at=case
          when item.lobodeals_lowest_regular_price_amount is null
            or eligible.regular_amount < item.lobodeals_lowest_regular_price_amount
          then eligible.observed_at
          else item.lobodeals_lowest_regular_price_first_seen_at
        end
      from eligible
      where item.id=eligible.id
      returning eligible.previous_low,
        eligible.regular_amount < eligible.previous_low as lowered
    )
    select
      count(*) filter (where previous_low is null)::integer,
      count(*) filter (where lowered is true)::integer
    into monthly_positive_initialized, monthly_positive_lowered
    from applied;

    update public.price_refresh_cycles
    set
      regular_lows_initialized=coalesce(regular_lows_initialized,0)+monthly_positive_initialized,
      regular_lows_lowered=coalesce(regular_lows_lowered,0)+monthly_positive_lowered
    where id=p_cycle_id;

    update public.psdeals_cycle_action_receipts
    set result=result || jsonb_build_object(
      'regular_initialized',coalesce(v4_result.regular_initialized,0)+monthly_positive_initialized,
      'regular_lowered',coalesce(v4_result.regular_lowered,0)+monthly_positive_lowered,
      'monthly_positive_regular_initialized',monthly_positive_initialized,
      'monthly_positive_regular_lowered',monthly_positive_lowered,
      'monthly_positive_regular_source','cycle_bound_detail_no_discount',
      'monthly_entitlement_excluded_from_commerce',true,
      'monthly_entitlement_excluded_from_ps_plus_low',true,
      'legacy_lows_promoted_to_certified',false,
      'contract_version',5
    )
    where id=v4_result.receipt_id;
  end if;

  return query select
    v4_result.receipt_id::uuid,
    v4_result.action_status::text,
    false,
    v4_result.certification_timestamp::timestamptz,
    coalesce(v4_result.regular_initialized,0)::integer+monthly_positive_initialized,
    coalesce(v4_result.regular_lowered,0)::integer+monthly_positive_lowered,
    v4_result.ps_plus_initialized::integer,
    v4_result.ps_plus_lowered::integer,
    v4_result.error_code::text;
end;
$function$;

comment on function public.certify_price_refresh_cycle_v5(
  uuid,uuid,text,text,timestamptz
) is 'Extends v4 with cycle-bound positive regular-price continuity for active official Monthly games; no legacy-to-certified promotion and no Monthly entitlement PS+ low.';

alter function public.certify_price_refresh_cycle_v5(
  uuid,uuid,text,text,timestamptz
) owner to postgres;
revoke all on function public.certify_price_refresh_cycle_v5(
  uuid,uuid,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.certify_price_refresh_cycle_v5(
  uuid,uuid,text,text,timestamptz
) to service_role;

create or replace function public.lobodeals_daily_runner_v25_preflight()
returns table(
  contract_version integer,
  pg_cron_present boolean,
  async_cache_v18_present boolean,
  refresh_cache_v19_present boolean,
  verified_offer_columns_present boolean,
  monthly_regular_columns_present boolean,
  search_v2_present boolean,
  certify_v5_present boolean,
  monthly_positive_regular_contract_present boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    25::integer,
    exists(select 1 from pg_catalog.pg_extension where extname='pg_cron'),
    to_regprocedure(
      'public.enqueue_lobodeals_catalog_cache_refresh_v18(uuid,uuid,text,text,timestamp with time zone)'
    ) is not null
      and to_regprocedure(
        'public.get_lobodeals_catalog_cache_refresh_v18(uuid)'
      ) is not null,
    to_regprocedure(
      'public.refresh_catalog_public_cache_v19(uuid,uuid,text,text,timestamp with time zone)'
    ) is not null,
    (
      select count(*)=7
      from information_schema.columns
      where table_schema='public'
        and table_name='catalog_public_cache'
        and column_name in (
          'has_verified_deal','has_verified_ps_plus_deal',
          'public_offer_verification_cycle_id','public_offer_verified_at',
          'public_offer_verification_source','public_offer_evidence_sha256',
          'public_offer_input_artifact_sha256'
        )
    ),
    (
      select count(*)=5
      from information_schema.columns
      where table_schema='public'
        and table_name='psdeals_stage_items'
        and (
          (column_name='monthly_regular_certification_cycle_id' and data_type='uuid')
          or (
            column_name='monthly_regular_certification_observed_at'
            and data_type='timestamp with time zone'
          )
          or (
            column_name in (
              'monthly_regular_certification_evidence_sha256',
              'monthly_regular_certification_input_artifact_sha256'
            )
            and data_type='character varying'
            and udt_name='varchar'
            and character_maximum_length=64
          )
          or (
            column_name='monthly_regular_certification_candidate'
            and data_type='jsonb'
          )
        )
    ),
    to_regprocedure(
      'public.search_catalog_public_cache_v2(text,text,text,text,integer,integer)'
    ) is not null,
    to_regprocedure(
      'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)'
    ) is not null,
    exists (
      select 1
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_language language on language.oid=procedure.prolang
      where procedure.oid=to_regprocedure(
        'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)'
      )::oid
        and pg_catalog.pg_get_userbyid(procedure.proowner)='postgres'
        and procedure.prosecdef
        and coalesce(procedure.proconfig,array[]::text[])
          =array['search_path=""']::text[]
        and language.lanname='plpgsql'
        and procedure.provolatile='v'
        and pg_catalog.encode(
          pg_catalog.sha256(
            pg_catalog.convert_to(
              pg_catalog.replace(
                procedure.prosrc,
                pg_catalog.chr(13),
                ''
              ),
              'UTF8'
            )
          ),
          'hex'
        )='a5a285b6b181cf265ec2401bed9e4886e396e660cd159d013ba875e6bc099548'
        and not has_function_privilege(
          'public',
          'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)',
          'EXECUTE'
        )
        and not has_function_privilege(
          'anon',
          'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)',
          'EXECUTE'
        )
        and not has_function_privilege(
          'authenticated',
          'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)',
          'EXECUTE'
        )
        and has_function_privilege(
          'service_role',
          'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)',
          'EXECUTE'
        )
        and not exists (
          select 1
          from lateral pg_catalog.aclexplode(
            coalesce(
              procedure.proacl,
              pg_catalog.acldefault('f',procedure.proowner)
            )
          ) privilege
          where privilege.privilege_type <> 'EXECUTE'
             or privilege.grantee not in (
               procedure.proowner,
               (select oid from pg_catalog.pg_roles where rolname='service_role')
             )
             or (
               privilege.grantee=(
                 select oid from pg_catalog.pg_roles where rolname='service_role'
               )
               and privilege.is_grantable
             )
        )
        and to_regclass('public.ps_plus_monthly_games') is not null
        and (
          select count(*)=13
          from information_schema.columns
          where table_schema='public'
            and table_name='psdeals_stage_items'
            and column_name in (
              'monthly_regular_certification_cycle_id',
              'monthly_regular_certification_observed_at',
              'monthly_regular_certification_evidence_sha256',
              'monthly_regular_certification_input_artifact_sha256',
              'monthly_regular_certification_candidate',
              'public_offer_verification_cycle_id',
              'public_offer_verified_at',
              'public_offer_verification_source',
              'public_offer_evidence_sha256',
              'public_offer_input_artifact_sha256',
              'lobodeals_lowest_regular_price_amount',
              'lobodeals_lowest_regular_price_first_seen_at',
              'lobodeals_lowest_ps_plus_price_amount'
            )
        )
        and (
          select count(*)=5
          from information_schema.columns
          where table_schema='public'
            and table_name='psdeals_stage_items'
            and (
              (column_name='monthly_regular_certification_cycle_id' and data_type='uuid')
              or (
                column_name='monthly_regular_certification_observed_at'
                and data_type='timestamp with time zone'
              )
              or (
                column_name in (
                  'monthly_regular_certification_evidence_sha256',
                  'monthly_regular_certification_input_artifact_sha256'
                )
                and data_type='character varying'
                and udt_name='varchar'
                and character_maximum_length=64
              )
              or (
                column_name='monthly_regular_certification_candidate'
                and data_type='jsonb'
              )
            )
        )
    );
$function$;

comment on function public.lobodeals_daily_runner_v25_preflight()
is 'Read-only Daily Runner preflight for certification v5 and the existing verified-offer/cache contracts.';

alter function public.lobodeals_daily_runner_v25_preflight() owner to postgres;
revoke all on function public.lobodeals_daily_runner_v25_preflight()
from public, anon, authenticated;
grant execute on function public.lobodeals_daily_runner_v25_preflight()
to service_role;

do $lobodeals_011_install_verify$
declare
  result record;
  installed regprocedure;
  expected_source_sha256 text;
  expected_language name;
  expected_volatility "char";
begin
  foreach installed in array array[
    'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)'::regprocedure,
    'public.lobodeals_daily_runner_v25_preflight()'::regprocedure
  ] loop
    if installed::text like '%certify_price_refresh_cycle_v5%' then
      expected_source_sha256 := 'a5a285b6b181cf265ec2401bed9e4886e396e660cd159d013ba875e6bc099548';
      expected_language := 'plpgsql';
      expected_volatility := 'v';
    else
      expected_source_sha256 := 'c7d056f2e70bfc85890e94661fb548f4f7c06107caeb9681ae31eebe85ee59f6';
      expected_language := 'sql';
      expected_volatility := 's';
    end if;

    if not exists (
         select 1
         from pg_catalog.pg_proc procedure
         join pg_catalog.pg_language language on language.oid=procedure.prolang
         where procedure.oid=installed::oid
           and pg_catalog.pg_get_userbyid(procedure.proowner)='postgres'
           and procedure.prosecdef
           and coalesce(procedure.proconfig,array[]::text[])
             =array['search_path=""']::text[]
           and language.lanname=expected_language
           and procedure.provolatile=expected_volatility
           and pg_catalog.encode(
             pg_catalog.sha256(
               pg_catalog.convert_to(
                 pg_catalog.replace(
                   procedure.prosrc,
                   pg_catalog.chr(13),
                   ''
                 ),
                 'UTF8'
               )
             ),
             'hex'
           )=expected_source_sha256
       )
       or has_function_privilege('public',installed::text,'EXECUTE')
       or has_function_privilege('anon',installed::text,'EXECUTE')
       or has_function_privilege('authenticated',installed::text,'EXECUTE')
       or not has_function_privilege('service_role',installed::text,'EXECUTE')
       or exists (
         select 1
         from pg_catalog.pg_proc procedure,
         lateral pg_catalog.aclexplode(
           coalesce(
             procedure.proacl,
             pg_catalog.acldefault('f',procedure.proowner)
           )
         ) privilege
         where procedure.oid=installed::oid
           and (
             privilege.privilege_type <> 'EXECUTE'
             or privilege.grantee not in (
               procedure.proowner,
               (select oid from pg_catalog.pg_roles where rolname='service_role')
             )
             or (
               privilege.grantee=(
                 select oid from pg_catalog.pg_roles where rolname='service_role'
               )
               and privilege.is_grantable
             )
           )
       ) then
      raise exception 'LOBODEALS_011_INSTALLED_FUNCTION_CONTRACT_INVALID:%',installed;
    end if;
  end loop;

  select * into result
  from public.lobodeals_daily_runner_v25_preflight();

  if result.contract_version <> 25
     or not result.pg_cron_present
     or not result.async_cache_v18_present
     or not result.refresh_cache_v19_present
     or not result.verified_offer_columns_present
     or not result.monthly_regular_columns_present
     or not result.search_v2_present
     or not result.certify_v5_present
     or not result.monthly_positive_regular_contract_present then
    raise exception 'LOBODEALS_011_INSTALLED_PREFLIGHT_CONTRACT_INVALID';
  end if;
end
$lobodeals_011_install_verify$;

commit;
