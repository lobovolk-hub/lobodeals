-- LoboDeals 3.2
-- Cycle-bound, fail-closed compact price certification.
--
-- This migration is intentionally additive. It does not initialize compact
-- lows, read detailed price history, or execute a certification.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $preflight$
declare
  missing_stage_columns integer;
begin
  if current_user <> 'postgres' then
    raise exception 'PSDEALS_005_POSTGRES_OWNER_REQUIRED';
  end if;

  if to_regclass('public.psdeals_stage_items') is null
    or to_regclass('public.price_refresh_cycles') is null
    or to_regclass('public.psdeals_cycle_action_receipts') is null then
    raise exception 'PSDEALS_005_REQUIRED_TABLE_MISSING';
  end if;

  if to_regprocedure(
    'public.certify_price_refresh_cycle_v2(uuid,uuid,text,text,timestamp with time zone)'
  ) is null then
    raise exception 'PSDEALS_005_MIGRATION_004_NOT_READY';
  end if;

  select count(*)::integer
  into missing_stage_columns
  from (
    values
      ('id'),
      ('psdeals_id'),
      ('region_code'),
      ('storefront'),
      ('lobodeals_lowest_regular_price_amount'),
      ('lobodeals_lowest_regular_price_first_seen_at'),
      ('lobodeals_lowest_ps_plus_price_amount'),
      ('lobodeals_lowest_ps_plus_price_first_seen_at')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as actual
    where actual.table_schema = 'public'
      and actual.table_name = 'psdeals_stage_items'
      and actual.column_name = required.column_name
  );

  if missing_stage_columns <> 0 then
    raise exception 'PSDEALS_005_REQUIRED_STAGE_COLUMN_MISSING';
  end if;

  if exists (
    select 1
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
  ) then
    raise exception 'PSDEALS_005_COLUMN_ALREADY_EXISTS';
  end if;

  if to_regprocedure(
    'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
  ) is not null then
    raise exception 'PSDEALS_005_FUNCTION_ALREADY_EXISTS';
  end if;

  if to_regprocedure(
    'public._psdeals_certification_candidate_sha256_v1(jsonb)'
  ) is not null then
    raise exception 'PSDEALS_005_HASH_FUNCTION_ALREADY_EXISTS';
  end if;
end;
$preflight$;

alter table public.psdeals_stage_items
  add column regular_certification_cycle_id uuid null,
  add column regular_certification_observed_at timestamptz null,
  add column regular_certification_evidence_sha256 varchar(64) null,
  add column regular_certification_candidate jsonb null,
  add column ps_plus_certification_cycle_id uuid null,
  add column ps_plus_certification_observed_at timestamptz null,
  add column ps_plus_certification_evidence_sha256 varchar(64) null,
  add column ps_plus_certification_candidate jsonb null;

create function public._psdeals_certification_candidate_sha256_v1(
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
          case p_candidate ->> 'kind'
            when 'regular' then array[
              p_candidate ->> 'contract_version',
              p_candidate ->> 'kind',
              p_candidate ->> 'cycle_id',
              p_candidate ->> 'observed_at',
              p_candidate ->> 'evidence_sha256',
              p_candidate ->> 'psdeals_id',
              p_candidate ->> 'region_code',
              p_candidate ->> 'storefront',
              p_candidate ->> 'currency_code',
              p_candidate ->> 'current_price_amount',
              p_candidate ->> 'original_price_amount',
              p_candidate ->> 'discount_percent',
              p_candidate ->> 'is_active_discount',
              p_candidate ->> 'is_free_to_play',
              p_candidate ->> 'content_type',
              p_candidate ->> 'item_type_label',
              case p_candidate -> 'platforms'
                when '["PS5"]'::jsonb then 'PS5'
                when '["PS4"]'::jsonb then 'PS4'
                when '["PS5", "PS4"]'::jsonb then 'PS5,PS4'
                else null
              end
            ]
            when 'ps_plus' then array[
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
              p_candidate ->> 'current_price_amount',
              p_candidate ->> 'ps_plus_price_amount',
              p_candidate ->> 'is_active_discount',
              p_candidate ->> 'is_ps_plus_discount',
              p_candidate ->> 'is_free_to_play',
              p_candidate ->> 'parser_status',
              p_candidate ->> 'source_consistent',
              p_candidate ->> 'content_type',
              p_candidate ->> 'item_type_label',
              case p_candidate -> 'platforms'
                when '["PS5"]'::jsonb then 'PS5'
                when '["PS4"]'::jsonb then 'PS4'
                when '["PS5", "PS4"]'::jsonb then 'PS5,PS4'
                else null
              end
            ]
            else array[null::text]
          end,
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
  public._psdeals_certification_candidate_sha256_v1(jsonb)
from public, anon, authenticated;

grant execute on function
  public._psdeals_certification_candidate_sha256_v1(jsonb)
to service_role, postgres;

alter table public.psdeals_stage_items
  add constraint psdeals_stage_items_regular_certification_cycle_fkey
    foreign key (regular_certification_cycle_id)
    references public.price_refresh_cycles(id)
    on delete restrict,
  add constraint psdeals_stage_items_ps_plus_certification_cycle_fkey
    foreign key (ps_plus_certification_cycle_id)
    references public.price_refresh_cycles(id)
    on delete restrict,
  add constraint psdeals_stage_items_regular_certification_pair_check
    check (
      (
        regular_certification_cycle_id is null
        and regular_certification_observed_at is null
        and regular_certification_evidence_sha256 is null
        and regular_certification_candidate is null
      )
      or
      (
        regular_certification_cycle_id is not null
        and regular_certification_observed_at is not null
        and regular_certification_evidence_sha256
          ~ '^[a-f0-9]{64}$'
        and jsonb_typeof(regular_certification_candidate) = 'object'
        and regular_certification_candidate ->> 'kind' = 'regular'
        and regular_certification_candidate ->> 'contract_version' = '1'
        and regular_certification_candidate ->> 'cycle_id'
          = regular_certification_cycle_id::text
        and regular_certification_candidate ->> 'observed_at'
          ~ '^\d{4}-\d{2}-\d{2}T'
        and (
          regular_certification_candidate ->> 'observed_at'
        )::timestamptz = regular_certification_observed_at
        and regular_certification_candidate ->> 'evidence_sha256'
          = regular_certification_evidence_sha256
        and regular_certification_candidate ->> 'candidate_sha256'
          ~ '^[a-f0-9]{64}$'
        and regular_certification_candidate ->> 'candidate_sha256'
          = public._psdeals_certification_candidate_sha256_v1(
              regular_certification_candidate
            )
        and regular_certification_candidate ->> 'psdeals_id'
          = psdeals_id::text
        and regular_certification_candidate - array[
          'contract_version',
          'kind',
          'cycle_id',
          'observed_at',
          'evidence_sha256',
          'psdeals_id',
          'region_code',
          'storefront',
          'currency_code',
          'current_price_amount',
          'original_price_amount',
          'discount_percent',
          'is_active_discount',
          'is_free_to_play',
          'content_type',
          'item_type_label',
          'platforms',
          'candidate_sha256'
        ]::text[] = '{}'::jsonb
        and pg_catalog.octet_length(
          regular_certification_candidate::text
        ) <= 1024
      )
    ),
  add constraint psdeals_stage_items_ps_plus_certification_pair_check
    check (
      (
        ps_plus_certification_cycle_id is null
        and ps_plus_certification_observed_at is null
        and ps_plus_certification_evidence_sha256 is null
        and ps_plus_certification_candidate is null
      )
      or
      (
        ps_plus_certification_cycle_id is not null
        and ps_plus_certification_observed_at is not null
        and ps_plus_certification_evidence_sha256
          ~ '^[a-f0-9]{64}$'
        and jsonb_typeof(ps_plus_certification_candidate) = 'object'
        and ps_plus_certification_candidate ->> 'kind' = 'ps_plus'
        and ps_plus_certification_candidate ->> 'contract_version' = '1'
        and ps_plus_certification_candidate ->> 'cycle_id'
          = ps_plus_certification_cycle_id::text
        and ps_plus_certification_candidate ->> 'observed_at'
          ~ '^\d{4}-\d{2}-\d{2}T'
        and (
          ps_plus_certification_candidate ->> 'observed_at'
        )::timestamptz = ps_plus_certification_observed_at
        and ps_plus_certification_candidate ->> 'evidence_sha256'
          = ps_plus_certification_evidence_sha256
        and ps_plus_certification_candidate
          ->> 'input_artifact_sha256'
          ~ '^[a-f0-9]{64}$'
        and ps_plus_certification_candidate ->> 'candidate_sha256'
          ~ '^[a-f0-9]{64}$'
        and ps_plus_certification_candidate ->> 'candidate_sha256'
          = public._psdeals_certification_candidate_sha256_v1(
              ps_plus_certification_candidate
            )
        and ps_plus_certification_candidate ->> 'psdeals_id'
          = psdeals_id::text
        and ps_plus_certification_candidate - array[
          'contract_version',
          'kind',
          'cycle_id',
          'observed_at',
          'evidence_sha256',
          'input_artifact_sha256',
          'psdeals_id',
          'region_code',
          'storefront',
          'currency_code',
          'current_price_amount',
          'ps_plus_price_amount',
          'is_active_discount',
          'is_ps_plus_discount',
          'is_free_to_play',
          'parser_status',
          'source_consistent',
          'content_type',
          'item_type_label',
          'platforms',
          'candidate_sha256'
        ]::text[] = '{}'::jsonb
        and pg_catalog.octet_length(
          ps_plus_certification_candidate::text
        ) <= 1024
      )
    );

create index psdeals_stage_items_regular_certification_cycle_idx
  on public.psdeals_stage_items (regular_certification_cycle_id)
  where regular_certification_cycle_id is not null;

create index psdeals_stage_items_ps_plus_certification_cycle_idx
  on public.psdeals_stage_items (ps_plus_certification_cycle_id)
  where ps_plus_certification_cycle_id is not null;

comment on column
  public.psdeals_stage_items.regular_certification_candidate
is
  'Latest bounded regular-price candidate observed as one tuple by listing; not public price history.';

comment on column
  public.psdeals_stage_items.ps_plus_certification_candidate
is
  'Latest bounded PS Plus candidate observed as one tuple by detail; not public price history.';

create function public.certify_price_refresh_cycle_v3(
  p_cycle_id uuid,
  p_mark_succeeded_receipt_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_started_at timestamptz
)
returns table (
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
set search_path = ''
as $function$
declare
  cycle_row public.price_refresh_cycles%rowtype;
  mark_row public.psdeals_cycle_action_receipts%rowtype;
  receipt_row public.psdeals_cycle_action_receipts%rowtype;
  finished_receipt public.psdeals_cycle_action_receipts%rowtype;
  listing_observed_count integer;
  certification_time timestamptz;
  regular_initialized_value integer := 0;
  regular_lowered_value integer := 0;
  ps_plus_initialized_value integer := 0;
  ps_plus_lowered_value integer := 0;
  result_value jsonb;
begin
  select *
  into cycle_row
  from public.price_refresh_cycles
  where id = p_cycle_id
  for update;

  if not found then
    raise exception 'PSDEALS_CERTIFY_V3_CYCLE_NOT_FOUND';
  end if;

  select *
  into mark_row
  from public.psdeals_cycle_action_receipts
  where id = p_mark_succeeded_receipt_id;

  if not found
    or mark_row.cycle_id <> p_cycle_id
    or mark_row.action_kind <> 'mark_succeeded'
    or mark_row.status <> 'committed' then
    raise exception 'PSDEALS_CERTIFY_V3_MARK_RECEIPT_INVALID';
  end if;

  receipt_row := public._begin_psdeals_cycle_action_v1(
    p_cycle_id,
    p_mark_succeeded_receipt_id,
    'certify',
    p_idempotency_key,
    1,
    p_request_hash,
    cycle_row.manifest_hash,
    p_started_at
  );

  if receipt_row.status <> 'running' then
    return query select
      receipt_row.id,
      receipt_row.status,
      true,
      nullif(
        receipt_row.result ->> 'certification_timestamp',
        ''
      )::timestamptz,
      nullif(receipt_row.result ->> 'regular_initialized', '')::integer,
      nullif(receipt_row.result ->> 'regular_lowered', '')::integer,
      nullif(receipt_row.result ->> 'ps_plus_initialized', '')::integer,
      nullif(receipt_row.result ->> 'ps_plus_lowered', '')::integer,
      receipt_row.error_code;
    return;
  end if;

  begin
    if cycle_row.region_code <> 'us'
      or cycle_row.storefront <> 'playstation'
      or cycle_row.status <> 'succeeded'
      or cycle_row.finished_at is null
      or cycle_row.validation_passed is distinct from true
      or cycle_row.validation_completed_at is null
      or cycle_row.items_seen <= 0
      or cycle_row.items_failed <> 0
      or cycle_row.failure_reason is not null
      or cycle_row.listing_complete is distinct from true
      or cycle_row.listing_completed_at is null
      or cycle_row.details_completed_at is null
      or cycle_row.ended_discounts_completed_at is null
      or cycle_row.monthly_games_checked_at is null then
      raise exception 'PSDEALS_CERTIFY_V3_CYCLE_NOT_READY';
    end if;

    if cycle_row.finished_at < cycle_row.started_at
      or cycle_row.listing_completed_at < cycle_row.started_at
      or cycle_row.details_completed_at < cycle_row.started_at
      or cycle_row.ended_discounts_completed_at < cycle_row.started_at
      or cycle_row.monthly_games_checked_at < cycle_row.started_at
      or cycle_row.validation_completed_at < greatest(
        cycle_row.listing_completed_at,
        cycle_row.details_completed_at,
        cycle_row.ended_discounts_completed_at,
        cycle_row.monthly_games_checked_at
      )
      or cycle_row.validation_completed_at > cycle_row.finished_at then
      raise exception 'PSDEALS_CERTIFY_V3_TIMESTAMPS_INVALID';
    end if;

    select count(*)::integer
    into listing_observed_count
    from public.psdeals_stage_items as item
    where item.region_code = cycle_row.region_code
      and item.storefront = cycle_row.storefront
      and item.listing_last_seen_at = cycle_row.listing_completed_at;

    if listing_observed_count <> cycle_row.items_seen then
      raise exception 'PSDEALS_CERTIFY_V3_LISTING_COUNT_MISMATCH';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        cycle_row.region_code
          || ':'
          || cycle_row.storefront
          || ':certified-price-lows-v3',
        0
      )
    );

    certification_time := clock_timestamp();

    with regular_source as (
      select
        item.id,
        item.lobodeals_lowest_regular_price_amount as previous_amount,
        item.regular_certification_observed_at as observed_at,
        item.regular_certification_candidate as candidate,
        (item.regular_certification_candidate
          ->> 'current_price_amount')::numeric as candidate_amount,
        (item.regular_certification_candidate
          ->> 'original_price_amount')::numeric as original_amount,
        (item.regular_certification_candidate
          ->> 'discount_percent')::integer as candidate_percent
      from public.psdeals_stage_items as item
      where item.region_code = cycle_row.region_code
        and item.storefront = cycle_row.storefront
        and item.regular_certification_cycle_id = p_cycle_id
        and item.regular_certification_observed_at
          = cycle_row.listing_completed_at
        and item.regular_certification_candidate is not null
        and item.regular_certification_candidate
          ->> 'current_price_amount'
          ~ '^[0-9]+(\.[0-9]{1,2})?$'
        and item.regular_certification_candidate
          ->> 'original_price_amount'
          ~ '^[0-9]+(\.[0-9]{1,2})?$'
        and item.regular_certification_candidate
          ->> 'discount_percent'
          ~ '^[0-9]{1,2}$'
        and exists (
          select 1
          from public.psdeals_cycle_action_receipts as listing_receipt
          where listing_receipt.cycle_id = p_cycle_id
            and listing_receipt.action_kind = 'listing_validation'
            and listing_receipt.status = 'committed'
            and listing_receipt.input_artifact_hash
              = item.regular_certification_evidence_sha256
            and listing_receipt.result ->> 'complete' = 'true'
        )
    ),
    regular_candidates as (
      select source.*
      from regular_source as source
      where source.candidate ->> 'contract_version' = '1'
        and source.candidate ->> 'kind' = 'regular'
        and source.candidate ->> 'cycle_id' = p_cycle_id::text
        and source.candidate ->> 'region_code' = 'us'
        and source.candidate ->> 'storefront' = 'playstation'
        and source.candidate ->> 'currency_code' = 'USD'
        and source.candidate ->> 'is_active_discount' = 'true'
        and source.candidate ->> 'is_free_to_play' = 'false'
        and (
          (
            source.candidate ->> 'content_type' = 'game'
            and source.candidate ->> 'item_type_label' = 'game'
          )
          or (
            source.candidate ->> 'content_type' = 'bundle'
            and source.candidate ->> 'item_type_label' = 'bundle'
          )
        )
        and source.candidate -> 'platforms' in (
          '["PS4"]'::jsonb,
          '["PS5"]'::jsonb,
          '["PS5", "PS4"]'::jsonb
        )
        and source.candidate_amount > 0
        and source.original_amount > source.candidate_amount
        and source.original_amount / source.candidate_amount <= 20
        and source.candidate_percent between 1 and 99
        and source.candidate_percent = round(
          100 * (
            source.original_amount - source.candidate_amount
          ) / source.original_amount
        )::integer
    ),
    regular_updates as (
      update public.psdeals_stage_items as item
      set
        lobodeals_lowest_regular_price_amount =
          candidate.candidate_amount,
        lobodeals_lowest_regular_price_first_seen_at =
          candidate.observed_at
      from regular_candidates as candidate
      where item.id = candidate.id
        and (
          item.lobodeals_lowest_regular_price_amount is null
          or candidate.candidate_amount
            < item.lobodeals_lowest_regular_price_amount
        )
      returning candidate.previous_amount is null as initialized
    )
    select
      count(*) filter (where initialized)::integer,
      count(*) filter (where not initialized)::integer
    into regular_initialized_value, regular_lowered_value
    from regular_updates;

    with ps_plus_source as (
      select
        item.id,
        item.lobodeals_lowest_ps_plus_price_amount as previous_amount,
        item.ps_plus_certification_observed_at as observed_at,
        item.ps_plus_certification_candidate as candidate,
        (item.ps_plus_certification_candidate
          ->> 'ps_plus_price_amount')::numeric as candidate_amount,
        (item.ps_plus_certification_candidate
          ->> 'current_price_amount')::numeric as current_amount
      from public.psdeals_stage_items as item
      where item.region_code = cycle_row.region_code
        and item.storefront = cycle_row.storefront
        and item.ps_plus_certification_cycle_id = p_cycle_id
        and item.ps_plus_certification_observed_at
          between cycle_row.started_at and cycle_row.details_completed_at
        and item.ps_plus_certification_candidate is not null
        and item.ps_plus_certification_evidence_sha256
          ~ '^[a-f0-9]{64}$'
        and item.ps_plus_certification_candidate
          ->> 'ps_plus_price_amount'
          ~ '^[0-9]+(\.[0-9]{1,2})?$'
        and item.ps_plus_certification_candidate
          ->> 'current_price_amount'
          ~ '^[0-9]+(\.[0-9]{1,2})?$'
        and exists (
          select 1
          from public.psdeals_cycle_action_receipts as detail_receipt
          where detail_receipt.cycle_id = p_cycle_id
            and detail_receipt.action_kind in (
              'detail_import',
              'detail_retry'
            )
            and detail_receipt.status = 'committed'
            and detail_receipt.input_artifact_hash
              = item.ps_plus_certification_candidate
                ->> 'input_artifact_sha256'
            and coalesce(
              (detail_receipt.result ->> 'pending_failures')::integer,
              0
            ) = 0
        )
    ),
    ps_plus_candidates as (
      select source.*
      from ps_plus_source as source
      where source.candidate ->> 'contract_version' = '1'
        and source.candidate ->> 'kind' = 'ps_plus'
        and source.candidate ->> 'cycle_id' = p_cycle_id::text
        and source.candidate ->> 'region_code' = 'us'
        and source.candidate ->> 'storefront' = 'playstation'
        and source.candidate ->> 'currency_code' = 'USD'
        and source.candidate ->> 'is_active_discount' = 'true'
        and source.candidate ->> 'is_ps_plus_discount' = 'true'
        and source.candidate ->> 'is_free_to_play' = 'false'
        and source.candidate ->> 'parser_status'
          = 'parsed_current_discount'
        and source.candidate ->> 'source_consistent' = 'true'
        and (
          (
            source.candidate ->> 'content_type' = 'game'
            and source.candidate ->> 'item_type_label' = 'game'
          )
          or (
            source.candidate ->> 'content_type' = 'bundle'
            and source.candidate ->> 'item_type_label' = 'bundle'
          )
        )
        and source.candidate -> 'platforms' in (
          '["PS4"]'::jsonb,
          '["PS5"]'::jsonb,
          '["PS5", "PS4"]'::jsonb
        )
        and source.candidate_amount > 0
        and source.current_amount > source.candidate_amount
        and not exists (
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
    ),
    ps_plus_updates as (
      update public.psdeals_stage_items as item
      set
        lobodeals_lowest_ps_plus_price_amount =
          candidate.candidate_amount,
        lobodeals_lowest_ps_plus_price_first_seen_at =
          candidate.observed_at
      from ps_plus_candidates as candidate
      where item.id = candidate.id
        and (
          item.lobodeals_lowest_ps_plus_price_amount is null
          or candidate.candidate_amount
            < item.lobodeals_lowest_ps_plus_price_amount
        )
      returning candidate.previous_amount is null as initialized
    )
    select
      count(*) filter (where initialized)::integer,
      count(*) filter (where not initialized)::integer
    into ps_plus_initialized_value, ps_plus_lowered_value
    from ps_plus_updates;

    update public.price_refresh_cycles
    set
      status = 'certified',
      certified_at = certification_time,
      regular_lows_initialized = regular_initialized_value,
      regular_lows_lowered = regular_lowered_value,
      ps_plus_lows_initialized = ps_plus_initialized_value,
      ps_plus_lows_lowered = ps_plus_lowered_value
    where id = p_cycle_id;
  exception when others then
    finished_receipt := public._finish_psdeals_cycle_action_v1(
      receipt_row.id,
      p_cycle_id,
      p_idempotency_key,
      p_request_hash,
      'failed',
      clock_timestamp(),
      0,
      jsonb_build_object(
        'stage',
        'certify_v3',
        'contract_version',
        3
      ),
      'CERTIFY_V3_' || sqlstate
    );

    return query select
      finished_receipt.id,
      finished_receipt.status,
      false,
      null::timestamptz,
      null::integer,
      null::integer,
      null::integer,
      null::integer,
      finished_receipt.error_code;
    return;
  end;

  result_value := jsonb_build_object(
    'contract_version', 3,
    'certification_timestamp', certification_time,
    'regular_initialized', regular_initialized_value,
    'regular_lowered', regular_lowered_value,
    'ps_plus_initialized', ps_plus_initialized_value,
    'ps_plus_lowered', ps_plus_lowered_value
  );

  finished_receipt := public._finish_psdeals_cycle_action_v1(
    receipt_row.id,
    p_cycle_id,
    p_idempotency_key,
    p_request_hash,
    'committed',
    clock_timestamp(),
    regular_initialized_value + regular_lowered_value
      + ps_plus_initialized_value + ps_plus_lowered_value,
    result_value,
    null
  );

  return query select
    finished_receipt.id,
    finished_receipt.status,
    false,
    certification_time,
    regular_initialized_value,
    regular_lowered_value,
    ps_plus_initialized_value,
    ps_plus_lowered_value,
    null::text;
end;
$function$;

revoke all on function
  public.certify_price_refresh_cycle_v3(
    uuid,
    uuid,
    text,
    text,
    timestamptz
  )
from public, anon, authenticated;

grant execute on function
  public.certify_price_refresh_cycle_v3(
    uuid,
    uuid,
    text,
    text,
    timestamptz
  )
to service_role, postgres;

revoke execute on function
  public.certify_price_refresh_cycle_v2(
    uuid,
    uuid,
    text,
    text,
    timestamptz
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.certify_price_refresh_cycle_v2(
    uuid,
    uuid,
    text,
    text,
    timestamptz
  )
to postgres;

revoke execute on function
  public.certify_price_refresh_cycle(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.certify_price_refresh_cycle(uuid)
to postgres;

comment on function
  public.certify_price_refresh_cycle_v3(
    uuid,
    uuid,
    text,
    text,
    timestamptz
  )
is
  'Receipt-bound certification using only complete producer tuples tied to the same cycle.';

commit;
