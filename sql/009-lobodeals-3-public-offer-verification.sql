-- LoboDeals 3.2
-- Cycle-bound public-offer verification and Monthly regular-price recovery.
--
-- This migration is additive except for correcting the deployed v3 PS Plus
-- minimum source gate and replacing the v4 certification wrapper and v18 async
-- cache executor with compatible hardened definitions. It does not run a cycle,
-- certify prices, rebuild cache, or repair existing rows.

begin;

set local lock_timeout = '30s';
set local statement_timeout = '120s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'LOBODEALS_009_POSTGRES_OWNER_REQUIRED';
  end if;

  if to_regclass('public.psdeals_stage_items') is null
    or to_regclass('public.catalog_public_cache') is null
    or to_regclass('public.ps_plus_monthly_games') is null
    or to_regclass('public.price_refresh_cycles') is null
    or to_regclass('public.psdeals_cycle_action_receipts') is null then
    raise exception 'LOBODEALS_009_REQUIRED_TABLE_MISSING';
  end if;

  if to_regprocedure(
    'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
  ) is null
    or to_regprocedure(
      'public.refresh_catalog_public_cache_v17(uuid,uuid,text,text,timestamp with time zone)'
    ) is null
    or to_regprocedure(
      'public.enqueue_lobodeals_catalog_cache_refresh_v18(uuid,uuid,text,text,timestamp with time zone)'
    ) is null then
    raise exception 'LOBODEALS_009_MIGRATION_008_NOT_READY';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name in ('psdeals_stage_items','catalog_public_cache')
      and column_name in (
        'public_offer_verification_cycle_id',
        'public_offer_verified_at',
        'public_offer_verification_source',
        'public_offer_evidence_sha256',
        'public_offer_input_artifact_sha256',
        'monthly_regular_certification_cycle_id',
        'monthly_regular_certification_observed_at',
        'monthly_regular_certification_evidence_sha256',
        'monthly_regular_certification_input_artifact_sha256',
        'monthly_regular_certification_candidate',
        'has_verified_deal',
        'has_verified_ps_plus_deal'
      )
  ) then
    raise exception 'LOBODEALS_009_COLUMN_ALREADY_EXISTS';
  end if;
end;
$preflight$;

-- Migration 005 excluded every active Monthly title from PS Plus minima. Patch
-- that deployed v3 definition in place: Monthly membership is not the source
-- gate; a positive, coherent Detail buy-box candidate is. The exact anchors
-- make unexpected remote definition drift abort the whole migration.
do $patch_ps_plus_minimum$
declare
  v_def text;
  v_source_anchor constant text := pg_catalog.replace($source_anchor$        item.ps_plus_certification_observed_at as observed_at,
        item.ps_plus_certification_candidate as candidate,
        (item.ps_plus_certification_candidate
$source_anchor$, pg_catalog.chr(13), '');
  v_source_with_raw constant text := pg_catalog.replace($source_with_raw$        item.ps_plus_certification_observed_at as observed_at,
        item.ps_plus_certification_candidate as candidate,
        item.raw_detail_json as raw_detail_json,
        (item.ps_plus_certification_candidate
$source_with_raw$, pg_catalog.chr(13), '');
  v_monthly_guard constant text := pg_catalog.replace($monthly_guard$        and not exists (
          select 1
          from public.ps_plus_monthly_games as monthly_game
          where monthly_game.item_id = source.id
            and monthly_game.is_active = true
            and coalesce(
              monthly_game.active_from_at,
              monthly_game.active_from::timestamptz,
              '-infinity'::timestamptz
            ) <= source.observed_at
            and coalesce(
              monthly_game.active_until_at,
              (
                monthly_game.active_until
                + interval '1 day'
              )::timestamptz,
              'infinity'::timestamptz
            ) > source.observed_at
        )
$monthly_guard$, pg_catalog.chr(13), '');
  v_commercial_source_guard constant text := pg_catalog.replace($commercial_source_guard$        and source.raw_detail_json #>> '{commercial_state,classification}'
          is distinct from 'temporary_free_promotion_candidate'
        and source.raw_detail_json
          ->> 'current_ps_plus_buy_box_price_amount'
          ~ '^[0-9]+(\.[0-9]{1,2})?$'
        and (
          source.raw_detail_json
            ->> 'current_ps_plus_buy_box_price_amount'
        )::numeric > 0
        and (
          source.raw_detail_json
            ->> 'current_ps_plus_buy_box_price_amount'
        )::numeric = source.candidate_amount
$commercial_source_guard$, pg_catalog.chr(13), '');
begin
  select pg_catalog.pg_get_functiondef(procedure.oid)
  into v_def
  from pg_catalog.pg_proc procedure
  where procedure.oid=to_regprocedure(
    'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
  );

  if v_def is null then
    raise exception 'LOBODEALS_009_CERTIFY_V3_DEFINITION_MISSING';
  end if;
  if position(v_source_anchor in v_def)=0
    or position(v_monthly_guard in v_def)=0
    or position(v_source_with_raw in v_def)>0
    or position(v_commercial_source_guard in v_def)>0 then
    raise exception 'LOBODEALS_009_CERTIFY_V3_SEMANTIC_DRIFT:%',
      pg_catalog.md5(v_def);
  end if;

  v_def=replace(v_def,v_source_anchor,v_source_with_raw);
  v_def=replace(v_def,v_monthly_guard,v_commercial_source_guard);
  execute v_def;

  select pg_catalog.pg_get_functiondef(procedure.oid)
  into v_def
  from pg_catalog.pg_proc procedure
  where procedure.oid=to_regprocedure(
    'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
  );

  if position(v_monthly_guard in v_def)>0
    or position(v_source_with_raw in v_def)=0
    or position(v_commercial_source_guard in v_def)=0 then
    raise exception 'LOBODEALS_009_CERTIFY_V3_PATCH_ASSERTION_FAILED';
  end if;
end;
$patch_ps_plus_minimum$;

alter table public.psdeals_stage_items
  add column public_offer_verification_cycle_id uuid null,
  add column public_offer_verified_at timestamptz null,
  add column public_offer_verification_source text null,
  add column public_offer_evidence_sha256 varchar(64) null,
  add column public_offer_input_artifact_sha256 varchar(64) null,
  add column monthly_regular_certification_cycle_id uuid null,
  add column monthly_regular_certification_observed_at timestamptz null,
  add column monthly_regular_certification_evidence_sha256 varchar(64) null,
  add column monthly_regular_certification_input_artifact_sha256 varchar(64) null,
  add column monthly_regular_certification_candidate jsonb null;

alter table public.catalog_public_cache
  add column has_verified_deal boolean not null default false,
  add column has_verified_ps_plus_deal boolean not null default false,
  add column public_offer_verification_cycle_id uuid null,
  add column public_offer_verified_at timestamptz null,
  add column public_offer_verification_source text null,
  add column public_offer_evidence_sha256 varchar(64) null,
  add column public_offer_input_artifact_sha256 varchar(64) null;

create function public._psdeals_monthly_regular_candidate_sha256_v1(
  p_candidate jsonb
)
returns text
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $function$
  select pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.array_to_string(
          array[
            p_candidate ->> 'contract_version',
            p_candidate ->> 'kind',
            p_candidate ->> 'cycle_id',
            p_candidate ->> 'observed_at',
            p_candidate ->> 'evidence_sha256',
            p_candidate ->> 'input_artifact_sha256',
            p_candidate ->> 'psdeals_id',
            p_candidate ->> 'region_code',
            p_candidate ->> 'storefront',
            p_candidate ->> 'currency_code',
            p_candidate ->> 'regular_price_amount',
            p_candidate ->> 'entitlement_price_amount',
            p_candidate ->> 'discount_percent',
            p_candidate ->> 'classification',
            p_candidate ->> 'content_type',
            p_candidate ->> 'item_type_label',
            case p_candidate -> 'platforms'
              when '["PS5"]'::jsonb then 'PS5'
              when '["PS4"]'::jsonb then 'PS4'
              when '["PS5", "PS4"]'::jsonb then 'PS5,PS4'
              else null
            end
          ],
          pg_catalog.chr(31),
          '<null>'
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$function$;

revoke all on function
  public._psdeals_monthly_regular_candidate_sha256_v1(jsonb)
from public, anon, authenticated;
grant execute on function
  public._psdeals_monthly_regular_candidate_sha256_v1(jsonb)
to service_role, postgres;

alter table public.psdeals_stage_items
  add constraint psdeals_stage_items_public_offer_cycle_fkey
    foreign key (public_offer_verification_cycle_id)
    references public.price_refresh_cycles(id)
    on delete restrict,
  add constraint psdeals_stage_items_monthly_regular_cycle_fkey
    foreign key (monthly_regular_certification_cycle_id)
    references public.price_refresh_cycles(id)
    on delete restrict,
  add constraint psdeals_stage_items_public_offer_verification_check
    check (
      (
        public_offer_verification_cycle_id is null
        and public_offer_verified_at is null
        and public_offer_verification_source is null
        and public_offer_evidence_sha256 is null
        and public_offer_input_artifact_sha256 is null
      )
      or
      (
        public_offer_verification_cycle_id is not null
        and public_offer_verified_at is not null
        and public_offer_verification_source in (
          'complete_listing',
          'strong_detail_revalidation'
        )
        and public_offer_evidence_sha256 ~ '^[a-f0-9]{64}$'
        and (
          (
            public_offer_verification_source='complete_listing'
            and public_offer_input_artifact_sha256 is null
          )
          or
          (
            public_offer_verification_source='strong_detail_revalidation'
            and public_offer_input_artifact_sha256 ~ '^[a-f0-9]{64}$'
          )
        )
      )
    ),
  add constraint psdeals_stage_items_monthly_regular_candidate_check
    check (
      (
        monthly_regular_certification_cycle_id is null
        and monthly_regular_certification_observed_at is null
        and monthly_regular_certification_evidence_sha256 is null
        and monthly_regular_certification_input_artifact_sha256 is null
        and monthly_regular_certification_candidate is null
      )
      or
      (
        monthly_regular_certification_cycle_id is not null
        and monthly_regular_certification_observed_at is not null
        and monthly_regular_certification_evidence_sha256 ~ '^[a-f0-9]{64}$'
        and monthly_regular_certification_input_artifact_sha256 ~ '^[a-f0-9]{64}$'
        and jsonb_typeof(monthly_regular_certification_candidate)='object'
        and monthly_regular_certification_candidate ->> 'kind'='monthly_regular'
        and monthly_regular_certification_candidate ->> 'contract_version'='1'
        and monthly_regular_certification_candidate ->> 'cycle_id'
          = monthly_regular_certification_cycle_id::text
        and (monthly_regular_certification_candidate ->> 'observed_at')::timestamptz
          = monthly_regular_certification_observed_at
        and monthly_regular_certification_candidate ->> 'evidence_sha256'
          = monthly_regular_certification_evidence_sha256
        and monthly_regular_certification_candidate ->> 'input_artifact_sha256'
          = monthly_regular_certification_input_artifact_sha256
        and monthly_regular_certification_candidate ->> 'psdeals_id'=psdeals_id::text
        and monthly_regular_certification_candidate ->> 'candidate_sha256'
          = public._psdeals_monthly_regular_candidate_sha256_v1(
              monthly_regular_certification_candidate
            )
        and monthly_regular_certification_candidate - array[
          'contract_version','kind','cycle_id','observed_at','evidence_sha256',
          'input_artifact_sha256','psdeals_id','region_code','storefront',
          'currency_code','regular_price_amount','entitlement_price_amount',
          'discount_percent','classification','content_type','item_type_label',
          'platforms','candidate_sha256'
        ]::text[] = '{}'::jsonb
        and pg_catalog.octet_length(
          monthly_regular_certification_candidate::text
        ) <= 1024
      )
    );

alter table public.catalog_public_cache
  add constraint catalog_public_cache_public_offer_cycle_fkey
    foreign key (public_offer_verification_cycle_id)
    references public.price_refresh_cycles(id)
    on delete restrict,
  add constraint catalog_public_cache_verified_deal_subset_check
    check (has_verified_deal is distinct from true or has_deal=true),
  add constraint catalog_public_cache_verified_ps_plus_subset_check
    check (
      has_verified_ps_plus_deal is distinct from true
      or has_ps_plus_deal=true
    ),
  add constraint catalog_public_cache_public_offer_verification_check
    check (
      (
        public_offer_verification_cycle_id is null
        and public_offer_verified_at is null
        and public_offer_verification_source is null
        and public_offer_evidence_sha256 is null
        and public_offer_input_artifact_sha256 is null
        and has_verified_deal=false
        and has_verified_ps_plus_deal=false
      )
      or
      (
        public_offer_verification_cycle_id is not null
        and public_offer_verified_at is not null
        and public_offer_verification_source in (
          'complete_listing',
          'strong_detail_revalidation'
        )
        and public_offer_evidence_sha256 ~ '^[a-f0-9]{64}$'
        and (
          public_offer_input_artifact_sha256 is null
          or public_offer_input_artifact_sha256 ~ '^[a-f0-9]{64}$'
        )
      )
    );

create index psdeals_stage_items_public_offer_cycle_idx
  on public.psdeals_stage_items (
    public_offer_verification_cycle_id,
    public_offer_verification_source,
    public_offer_verified_at
  )
  where public_offer_verification_cycle_id is not null;

create index psdeals_stage_items_monthly_regular_cycle_idx
  on public.psdeals_stage_items (monthly_regular_certification_cycle_id)
  where monthly_regular_certification_cycle_id is not null;

create index catalog_public_cache_verified_deals_idx
  on public.catalog_public_cache (
    region_code,
    storefront,
    has_verified_deal,
    has_verified_ps_plus_deal
  )
  where has_verified_deal=true or has_verified_ps_plus_deal=true;

comment on column public.psdeals_stage_items.public_offer_verification_cycle_id
is 'Cycle whose complete listing or strong Detail receipt can verify the public offer without demoting preserved commercial state.';

comment on column public.psdeals_stage_items.monthly_regular_certification_candidate
is 'Strong Detail evidence for a Monthly title regular price; the free entitlement is never a commercial or PS Plus low.';

comment on column public.catalog_public_cache.has_verified_deal
is 'Public regular-deal flag proven against the cache cycle; has_deal remains preserved commercial state.';

comment on column public.catalog_public_cache.has_verified_ps_plus_deal
is 'Public PS Plus commercial-deal flag proven against the cache cycle; Monthly entitlement is excluded.';

create or replace function public.certify_price_refresh_cycle_v4(
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
  v3_result record;
  monthly_initialized integer := 0;
  monthly_lowered integer := 0;
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
      raise exception 'PSDEALS_CERTIFY_V4_IDEMPOTENCY_MISMATCH';
    end if;
    if existing_receipt.status in ('intent','running','indeterminate') then
      raise exception 'PSDEALS_CERTIFY_V4_EXISTING_RECEIPT_NOT_TERMINAL';
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

  select * into v3_result
  from public.certify_price_refresh_cycle_v3(
    p_cycle_id,
    p_mark_succeeded_receipt_id,
    p_idempotency_key,
    p_request_hash,
    p_started_at
  );

  if v3_result.action_status='committed' then
    with eligible as (
      select
        item.id,
        item.monthly_regular_certification_observed_at as observed_at,
        (item.monthly_regular_certification_candidate ->> 'regular_price_amount')::numeric as regular_amount,
        item.lobodeals_lowest_regular_price_amount as previous_low,
        cycle.listing_completed_at
      from public.psdeals_stage_items item
      join public.price_refresh_cycles cycle on cycle.id=p_cycle_id
      where item.region_code=cycle.region_code
        and item.storefront=cycle.storefront
        and item.monthly_regular_certification_cycle_id=p_cycle_id
        and item.monthly_regular_certification_observed_at
          between cycle.started_at and cycle.details_completed_at
        and item.monthly_regular_certification_candidate ->> 'kind'='monthly_regular'
        and item.monthly_regular_certification_candidate ->> 'currency_code'='USD'
        and item.monthly_regular_certification_candidate ->> 'classification'
          ='temporary_free_promotion_candidate'
        and item.monthly_regular_certification_candidate ->> 'entitlement_price_amount'='0'
        and item.monthly_regular_certification_candidate ->> 'discount_percent'='100'
        and (item.monthly_regular_certification_candidate ->> 'regular_price_amount')::numeric > 0
        -- Monthly entitlement and an independent regular sale may coexist.
        -- Same-cycle regular evidence owns the commercial fields.
        and not exists (
          select 1
          from public.psdeals_cycle_action_receipts regular_listing_receipt
          where item.regular_certification_cycle_id=p_cycle_id
            and item.regular_certification_observed_at=cycle.listing_completed_at
            and item.regular_certification_candidate ->> 'kind'='regular'
            and item.regular_certification_candidate ->> 'cycle_id'=p_cycle_id::text
            and regular_listing_receipt.cycle_id=p_cycle_id
            and regular_listing_receipt.action_kind='listing_validation'
            and regular_listing_receipt.status='committed'
            and regular_listing_receipt.input_artifact_hash
              = item.regular_certification_evidence_sha256
            and regular_listing_receipt.result ->> 'complete'='true'
        )
        and not exists (
          select 1
          where item.public_offer_verification_cycle_id=p_cycle_id
            and item.public_offer_verification_source='complete_listing'
            and item.public_offer_verified_at=cycle.listing_completed_at
            and item.listing_last_seen_at=cycle.listing_completed_at
            and item.current_price_amount > 0
            and item.original_price_amount > item.current_price_amount
            and item.discount_percent between 1 and 99
        )
        and exists (
          select 1
          from public.psdeals_cycle_action_receipts detail_receipt
          where detail_receipt.cycle_id=p_cycle_id
            and detail_receipt.action_kind in ('detail_import','detail_retry')
            and detail_receipt.status='committed'
            and detail_receipt.input_artifact_hash
              = item.monthly_regular_certification_input_artifact_sha256
            and coalesce((detail_receipt.result ->> 'pending_failures')::integer,0)=0
        )
        and exists (
          select 1
          from public.psdeals_cycle_action_receipts monthly_receipt
          where monthly_receipt.cycle_id=p_cycle_id
            and monthly_receipt.action_kind='monthly_check_record'
            and monthly_receipt.status='committed'
            and monthly_receipt.result ->> 'application_performed'='false'
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
        current_price_amount=eligible.regular_amount,
        original_price_amount=eligible.regular_amount,
        discount_percent=0,
        is_ps_plus_discount=false,
        is_free_to_play=false,
        availability_state='priced',
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
        and not exists (
          select 1
          from public.psdeals_cycle_action_receipts regular_listing_receipt
          where item.regular_certification_cycle_id=p_cycle_id
            and item.regular_certification_observed_at=eligible.listing_completed_at
            and item.regular_certification_candidate ->> 'kind'='regular'
            and item.regular_certification_candidate ->> 'cycle_id'=p_cycle_id::text
            and regular_listing_receipt.cycle_id=p_cycle_id
            and regular_listing_receipt.action_kind='listing_validation'
            and regular_listing_receipt.status='committed'
            and regular_listing_receipt.input_artifact_hash
              = item.regular_certification_evidence_sha256
            and regular_listing_receipt.result ->> 'complete'='true'
        )
        and not exists (
          select 1
          where item.public_offer_verification_cycle_id=p_cycle_id
            and item.public_offer_verification_source='complete_listing'
            and item.public_offer_verified_at=eligible.listing_completed_at
            and item.listing_last_seen_at=eligible.listing_completed_at
            and item.current_price_amount > 0
            and item.original_price_amount > item.current_price_amount
            and item.discount_percent between 1 and 99
        )
      returning eligible.previous_low,
        eligible.regular_amount < eligible.previous_low as lowered
    )
    select
      count(*) filter (where previous_low is null)::integer,
      count(*) filter (where lowered is true)::integer
    into monthly_initialized, monthly_lowered
    from applied;

    update public.price_refresh_cycles
    set
      regular_lows_initialized=coalesce(regular_lows_initialized,0)+monthly_initialized,
      regular_lows_lowered=coalesce(regular_lows_lowered,0)+monthly_lowered
    where id=p_cycle_id;

    update public.psdeals_cycle_action_receipts
    set result=result || jsonb_build_object(
      'regular_initialized',coalesce(v3_result.regular_initialized,0)+monthly_initialized,
      'regular_lowered',coalesce(v3_result.regular_lowered,0)+monthly_lowered,
      'monthly_regular_initialized',monthly_initialized,
      'monthly_regular_lowered',monthly_lowered,
      'monthly_entitlement_excluded_from_ps_plus_low',true,
      'contract_version',4
    )
    where id=v3_result.receipt_id;
  end if;

  return query select
    v3_result.receipt_id::uuid,
    v3_result.action_status::text,
    false,
    v3_result.certification_timestamp::timestamptz,
    coalesce(v3_result.regular_initialized,0)::integer+monthly_initialized,
    coalesce(v3_result.regular_lowered,0)::integer+monthly_lowered,
    v3_result.ps_plus_initialized::integer,
    v3_result.ps_plus_lowered::integer,
    v3_result.error_code::text;
end;
$function$;

alter function public.certify_price_refresh_cycle_v4(
  uuid,uuid,text,text,timestamptz
) owner to postgres;
revoke all on function public.certify_price_refresh_cycle_v4(
  uuid,uuid,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.certify_price_refresh_cycle_v4(
  uuid,uuid,text,text,timestamptz
) to service_role;

create function public.refresh_catalog_public_cache_v19(
  p_cycle_id uuid,
  p_certification_receipt_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_started_at timestamptz
)
returns table(
  receipt_id uuid,
  action_status text,
  reconciled boolean,
  inserted_rows integer,
  active_regular_deals integer,
  active_ps_plus_deals integer,
  expired_deals_still_marked_active integer,
  monthly_null_price_rows_added integer,
  error_code text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  cache_result record;
  commercial_regular_count integer := 0;
  commercial_ps_plus_count integer := 0;
  verified_regular_count integer := 0;
  verified_ps_plus_count integer := 0;
begin
  perform pg_catalog.set_config('statement_timeout','0',true);

  select * into cycle_row
  from public.price_refresh_cycles
  where id=p_cycle_id;

  if not found
    or cycle_row.status <> 'certified'
    or cycle_row.listing_complete is distinct from true
    or cycle_row.listing_completed_at is null then
    raise exception 'PSDEALS_CACHE_V19_CYCLE_NOT_READY';
  end if;

  select * into cache_result
  from public.refresh_catalog_public_cache_v17(
    p_cycle_id,
    p_certification_receipt_id,
    p_idempotency_key,
    p_request_hash,
    p_started_at
  );

  if cache_result.action_status <> 'committed' then
    return query select
      cache_result.receipt_id::uuid,
      cache_result.action_status::text,
      cache_result.reconciled::boolean,
      cache_result.inserted_rows::integer,
      cache_result.active_regular_deals::integer,
      cache_result.active_ps_plus_deals::integer,
      cache_result.expired_deals_still_marked_active::integer,
      cache_result.monthly_null_price_rows_added::integer,
      cache_result.error_code::text;
    return;
  end if;

  select
    count(*) filter (where has_deal=true)::integer,
    count(*) filter (where has_ps_plus_deal=true)::integer
  into commercial_regular_count, commercial_ps_plus_count
  from public.catalog_public_cache;

  with verified_stage as (
    select item.*
    from public.psdeals_stage_items item
    where item.public_offer_verification_cycle_id=p_cycle_id
      and (
        (
          item.public_offer_verification_source='complete_listing'
          and item.public_offer_verified_at=cycle_row.listing_completed_at
          and item.listing_last_seen_at=cycle_row.listing_completed_at
          and exists (
            select 1
            from public.psdeals_cycle_action_receipts listing_receipt
            where listing_receipt.cycle_id=p_cycle_id
              and listing_receipt.action_kind='listing_validation'
              and listing_receipt.status='committed'
              and listing_receipt.input_artifact_hash=item.public_offer_evidence_sha256
              and listing_receipt.result ->> 'complete'='true'
          )
        )
        or
        (
          item.public_offer_verification_source='strong_detail_revalidation'
          and item.public_offer_verified_at
            between cycle_row.started_at and cycle_row.details_completed_at
          and exists (
            select 1
            from public.psdeals_cycle_action_receipts detail_receipt
            where detail_receipt.cycle_id=p_cycle_id
              and detail_receipt.action_kind in ('detail_import','detail_retry')
              and detail_receipt.status='committed'
              and detail_receipt.input_artifact_hash
                = item.public_offer_input_artifact_sha256
              and coalesce((detail_receipt.result ->> 'pending_failures')::integer,0)=0
          )
        )
      )
  )
  update public.catalog_public_cache cache
  set
    has_verified_deal=(
      cache.has_deal=true
      and cache.current_price_amount > 0
      and cache.original_price_amount > cache.current_price_amount
      and cache.discount_percent between 1 and 99
    ),
    has_verified_ps_plus_deal=(
      cache.has_ps_plus_deal=true
      and cache.ps_plus_price_amount > 0
      and cache.ps_plus_price_amount < coalesce(
        cache.current_price_amount,
        cache.original_price_amount
      )
    ),
    public_offer_verification_cycle_id=stage.public_offer_verification_cycle_id,
    public_offer_verified_at=stage.public_offer_verified_at,
    public_offer_verification_source=stage.public_offer_verification_source,
    public_offer_evidence_sha256=stage.public_offer_evidence_sha256,
    public_offer_input_artifact_sha256=stage.public_offer_input_artifact_sha256
  from verified_stage stage
  where cache.item_id=stage.id;

  select count(*)::integer into verified_regular_count
  from public.catalog_public_cache
  where has_verified_deal=true;

  select count(*)::integer into verified_ps_plus_count
  from public.catalog_public_cache
  where has_verified_ps_plus_deal=true;

  if exists (
    select 1
    from public.catalog_public_cache
    where (has_verified_deal=true or has_verified_ps_plus_deal=true)
      and public_offer_verification_cycle_id is distinct from p_cycle_id
  ) then
    raise exception 'PSDEALS_CACHE_V19_VERIFIED_OFFER_CYCLE_MISMATCH';
  end if;

  update public.psdeals_cycle_action_receipts
  set result=result || jsonb_build_object(
    'contract_version',19,
    'preserved_commercial_regular_deals',commercial_regular_count,
    'preserved_commercial_ps_plus_deals',commercial_ps_plus_count,
    'active_regular_deals',verified_regular_count,
    'active_ps_plus_deals',verified_ps_plus_count,
    'public_offer_verification_cycle_id',p_cycle_id
  )
  where id=cache_result.receipt_id;

  return query select
    cache_result.receipt_id::uuid,
    cache_result.action_status::text,
    cache_result.reconciled::boolean,
    cache_result.inserted_rows::integer,
    verified_regular_count,
    verified_ps_plus_count,
    cache_result.expired_deals_still_marked_active::integer,
    cache_result.monthly_null_price_rows_added::integer,
    cache_result.error_code::text;
end;
$function$;

alter function public.refresh_catalog_public_cache_v19(
  uuid,uuid,text,text,timestamptz
) owner to postgres;
revoke all on function public.refresh_catalog_public_cache_v19(
  uuid,uuid,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.refresh_catalog_public_cache_v19(
  uuid,uuid,text,text,timestamptz
) to service_role;

create or replace function public.run_lobodeals_catalog_cache_refresh_v18(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  job public.lobodeals_async_cache_jobs%rowtype;
  cache_result record;
  v_error_code text;
begin
  perform pg_catalog.set_config('statement_timeout','0',true);

  select * into job
  from public.lobodeals_async_cache_jobs
  where id=p_job_id
  for update;

  if not found then
    return;
  end if;

  if job.status in ('succeeded','failed') then
    perform cron.unschedule(job.cron_job_name);
    return;
  end if;

  update public.lobodeals_async_cache_jobs
  set status='running', started_at=coalesce(started_at,clock_timestamp()), updated_at=clock_timestamp()
  where id=p_job_id;

  begin
    select * into cache_result
    from public.refresh_catalog_public_cache_v19(
      p_cycle_id => job.cycle_id,
      p_certification_receipt_id => job.certification_receipt_id,
      p_idempotency_key => job.cache_idempotency_key,
      p_request_hash => job.cache_request_hash,
      p_started_at => job.cache_started_at
    );

    if cache_result.action_status <> 'committed' or cache_result.receipt_id is null then
      v_error_code := coalesce(cache_result.error_code::text,'CACHE_V18_V19_NOT_COMMITTED');
      update public.lobodeals_async_cache_jobs
      set status='failed',
          cache_receipt_id=cache_result.receipt_id,
          result=to_jsonb(cache_result),
          error_code=v_error_code,
          finished_at=clock_timestamp(),
          updated_at=clock_timestamp()
      where id=p_job_id;
      perform cron.unschedule(job.cron_job_name);
      return;
    end if;

    update public.lobodeals_async_cache_jobs
    set status='succeeded',
        cache_receipt_id=cache_result.receipt_id,
        inserted_rows=cache_result.inserted_rows,
        active_regular_deals=cache_result.active_regular_deals,
        active_ps_plus_deals=cache_result.active_ps_plus_deals,
        expired_deals_still_marked_active=cache_result.expired_deals_still_marked_active,
        monthly_null_price_rows_added=cache_result.monthly_null_price_rows_added,
        result=to_jsonb(cache_result),
        error_code=null,
        finished_at=clock_timestamp(),
        updated_at=clock_timestamp()
    where id=p_job_id;

  exception when others then
    update public.lobodeals_async_cache_jobs
    set status='failed',
        error_code='CACHE_V18_' || sqlstate,
        result=jsonb_build_object('message',sqlerrm,'sqlstate',sqlstate),
        finished_at=clock_timestamp(),
        updated_at=clock_timestamp()
    where id=p_job_id;
  end;

  perform cron.unschedule(job.cron_job_name);
end;
$function$;

alter function public.run_lobodeals_catalog_cache_refresh_v18(uuid) owner to postgres;
revoke all on function public.run_lobodeals_catalog_cache_refresh_v18(uuid) from public, anon, authenticated, service_role;

create function public.search_catalog_public_cache_v2(
  p_q text default '',
  p_tab text default 'all',
  p_letter text default 'ALL',
  p_sort text default 'title',
  p_limit integer default 36,
  p_offset integer default 0
)
returns table(
  id uuid,
  item_id uuid,
  slug text,
  title text,
  image_url text,
  platforms text[],
  content_type text,
  item_type_label text,
  release_date date,
  current_price_amount numeric,
  original_price_amount numeric,
  discount_percent integer,
  ps_plus_price_amount numeric,
  best_price_amount numeric,
  best_price_type text,
  has_deal boolean,
  has_ps_plus_deal boolean,
  has_verified_deal boolean,
  has_verified_ps_plus_deal boolean,
  is_ps_plus_monthly_game boolean,
  ps_plus_monthly_label text,
  ps_plus_monthly_note text,
  ps_plus_monthly_month text,
  ps_plus_monthly_until date,
  metacritic_score integer,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    legacy.id,
    legacy.item_id,
    legacy.slug,
    legacy.title,
    legacy.image_url,
    legacy.platforms,
    legacy.content_type,
    legacy.item_type_label,
    legacy.release_date,
    legacy.current_price_amount,
    legacy.original_price_amount,
    legacy.discount_percent,
    legacy.ps_plus_price_amount,
    legacy.best_price_amount,
    legacy.best_price_type,
    legacy.has_deal,
    legacy.has_ps_plus_deal,
    cache.has_verified_deal,
    cache.has_verified_ps_plus_deal,
    legacy.is_ps_plus_monthly_game,
    legacy.ps_plus_monthly_label,
    legacy.ps_plus_monthly_note,
    legacy.ps_plus_monthly_month,
    legacy.ps_plus_monthly_until,
    legacy.metacritic_score,
    legacy.total_count
  from public.search_catalog_public_cache(
    p_q,p_tab,p_letter,p_sort,p_limit,p_offset
  ) legacy
  join public.catalog_public_cache cache on cache.id=legacy.id;
$function$;

alter function public.search_catalog_public_cache_v2(
  text,text,text,text,integer,integer
) owner to postgres;
grant execute on function public.search_catalog_public_cache_v2(
  text,text,text,text,integer,integer
) to public, anon, authenticated, service_role;

create function public.lobodeals_daily_runner_v24_preflight()
returns table(
  contract_version integer,
  pg_cron_present boolean,
  async_cache_v18_present boolean,
  refresh_cache_v19_present boolean,
  verified_offer_columns_present boolean,
  monthly_regular_columns_present boolean,
  search_v2_present boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    24::integer,
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
        and column_name like 'monthly_regular_certification_%'
    ),
    to_regprocedure(
      'public.search_catalog_public_cache_v2(text,text,text,text,integer,integer)'
    ) is not null;
$function$;

alter function public.lobodeals_daily_runner_v24_preflight() owner to postgres;
revoke all on function public.lobodeals_daily_runner_v24_preflight()
from public, anon, authenticated;
grant execute on function public.lobodeals_daily_runner_v24_preflight()
to service_role;

commit;
