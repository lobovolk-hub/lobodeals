-- LoboDeals 3.2
-- Recovery: clear 30 legacy LoboDeals Lowest PS+ values that were initialized
-- by the foundational certification cycle under the previous source contract,
-- but cannot be proven by the final positive Detail buy-box requirement.
--
-- This recovery intentionally preserves certification cycle IDs, timestamps,
-- candidate JSON, evidence hashes, raw Detail evidence, receipts, and cycle
-- counters as immutable audit evidence. It clears only the derived LoboDeals
-- Lowest PS+ amount and its first-seen timestamp.

begin;

set local lock_timeout = '30s';
set local statement_timeout = '120s';

do $recovery$
declare
  v_foundational_cycle constant uuid := '7a4b9b06-4b51-45af-bc93-945d15d1cff0'::uuid;
  v_target_count integer;
  v_updated_count integer;
  v_total_before integer;
  v_total_after integer;
begin
  -- Fail closed if any operational work is active.
  if exists (
    select 1
    from public.price_refresh_cycles
    where status = 'running'
  ) then
    raise exception 'LOBODEALS_009_PS_PLUS_LOW_RECOVERY_RUNNING_CYCLE';
  end if;

  if exists (
    select 1
    from public.psdeals_cycle_action_receipts
    where status in ('intent','running','indeterminate')
  ) then
    raise exception 'LOBODEALS_009_PS_PLUS_LOW_RECOVERY_OPEN_RECEIPT';
  end if;

  if exists (
    select 1
    from public.lobodeals_async_cache_jobs
    where status in ('queued','running')
  ) then
    raise exception 'LOBODEALS_009_PS_PLUS_LOW_RECOVERY_ACTIVE_CACHE_JOB';
  end if;

  if exists (
    select 1
    from public.lobodeals_async_demotion_jobs
    where status in ('queued','running')
  ) then
    raise exception 'LOBODEALS_009_PS_PLUS_LOW_RECOVERY_ACTIVE_DEMOTION_JOB';
  end if;

  -- The source cycle is immutable audit context for this exact recovery set.
  if not exists (
    select 1
    from public.price_refresh_cycles
    where id = v_foundational_cycle
      and status = 'certified'
      and ps_plus_lows_initialized = 1423
      and ps_plus_lows_lowered = 0
  ) then
    raise exception 'LOBODEALS_009_PS_PLUS_LOW_RECOVERY_FOUNDATIONAL_CYCLE_DRIFT';
  end if;

  select count(*)::integer
  into v_total_before
  from public.psdeals_stage_items
  where lobodeals_lowest_ps_plus_price_amount is not null;

  if v_total_before <> 1428 then
    raise exception 'LOBODEALS_009_PS_PLUS_LOW_RECOVERY_TOTAL_DRIFT:%', v_total_before;
  end if;

  -- Exact legacy set observed after migration 009:
  -- * initialized by the foundational cycle;
  -- * no previous LoboDeals PS+ low (first_seen == certification observation);
  -- * candidate itself was positive, active, source-consistent PS+ evidence;
  -- * candidate amount equals the stored LoboDeals low;
  -- * current raw Detail no longer contains a positive PS+ buy-box;
  -- * not an active Monthly title.
  select count(*)::integer
  into v_target_count
  from public.psdeals_stage_items item
  where item.ps_plus_certification_cycle_id = v_foundational_cycle
    and item.lobodeals_lowest_ps_plus_price_amount is not null
    and item.lobodeals_lowest_ps_plus_price_first_seen_at
      = item.ps_plus_certification_observed_at
    and item.ps_plus_certification_candidate ->> 'kind' = 'ps_plus'
    and item.ps_plus_certification_candidate ->> 'source_consistent' = 'true'
    and item.ps_plus_certification_candidate ->> 'is_active_discount' = 'true'
    and item.ps_plus_certification_candidate ->> 'is_ps_plus_discount' = 'true'
    and item.ps_plus_certification_candidate ->> 'ps_plus_price_amount'
      ~ '^[0-9]+(\.[0-9]{1,2})?$'
    and case
      when item.ps_plus_certification_candidate ->> 'ps_plus_price_amount'
        ~ '^[0-9]+(\.[0-9]{1,2})?$'
      then (item.ps_plus_certification_candidate ->> 'ps_plus_price_amount')::numeric
      else null
    end > 0
    and case
      when item.ps_plus_certification_candidate ->> 'ps_plus_price_amount'
        ~ '^[0-9]+(\.[0-9]{1,2})?$'
      then (item.ps_plus_certification_candidate ->> 'ps_plus_price_amount')::numeric
      else null
    end = item.lobodeals_lowest_ps_plus_price_amount
    and item.ps_plus_certification_evidence_sha256 ~ '^[a-f0-9]{64}$'
    and item.ps_plus_certification_candidate ->> 'input_artifact_sha256'
      ~ '^[a-f0-9]{64}$'
    and item.raw_detail_json #>> '{commercial_state,classification}'
      is distinct from 'temporary_free_promotion_candidate'
    and item.raw_detail_json ->> 'current_ps_plus_buy_box_price_amount' is null
    and not exists (
      select 1
      from public.ps_plus_monthly_games monthly_game
      where monthly_game.item_id = item.id
        and monthly_game.is_active = true
    );

  if v_target_count <> 30 then
    raise exception 'LOBODEALS_009_PS_PLUS_LOW_RECOVERY_TARGET_DRIFT:%', v_target_count;
  end if;

  update public.psdeals_stage_items item
  set
    lobodeals_lowest_ps_plus_price_amount = null,
    lobodeals_lowest_ps_plus_price_first_seen_at = null
  where item.ps_plus_certification_cycle_id = v_foundational_cycle
    and item.lobodeals_lowest_ps_plus_price_amount is not null
    and item.lobodeals_lowest_ps_plus_price_first_seen_at
      = item.ps_plus_certification_observed_at
    and item.ps_plus_certification_candidate ->> 'kind' = 'ps_plus'
    and item.ps_plus_certification_candidate ->> 'source_consistent' = 'true'
    and item.ps_plus_certification_candidate ->> 'is_active_discount' = 'true'
    and item.ps_plus_certification_candidate ->> 'is_ps_plus_discount' = 'true'
    and item.ps_plus_certification_candidate ->> 'ps_plus_price_amount'
      ~ '^[0-9]+(\.[0-9]{1,2})?$'
    and case
      when item.ps_plus_certification_candidate ->> 'ps_plus_price_amount'
        ~ '^[0-9]+(\.[0-9]{1,2})?$'
      then (item.ps_plus_certification_candidate ->> 'ps_plus_price_amount')::numeric
      else null
    end > 0
    and case
      when item.ps_plus_certification_candidate ->> 'ps_plus_price_amount'
        ~ '^[0-9]+(\.[0-9]{1,2})?$'
      then (item.ps_plus_certification_candidate ->> 'ps_plus_price_amount')::numeric
      else null
    end = item.lobodeals_lowest_ps_plus_price_amount
    and item.ps_plus_certification_evidence_sha256 ~ '^[a-f0-9]{64}$'
    and item.ps_plus_certification_candidate ->> 'input_artifact_sha256'
      ~ '^[a-f0-9]{64}$'
    and item.raw_detail_json #>> '{commercial_state,classification}'
      is distinct from 'temporary_free_promotion_candidate'
    and item.raw_detail_json ->> 'current_ps_plus_buy_box_price_amount' is null
    and not exists (
      select 1
      from public.ps_plus_monthly_games monthly_game
      where monthly_game.item_id = item.id
        and monthly_game.is_active = true
    );

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 30 then
    raise exception 'LOBODEALS_009_PS_PLUS_LOW_RECOVERY_UPDATED_COUNT_MISMATCH:%',
      v_updated_count;
  end if;

  select count(*)::integer
  into v_total_after
  from public.psdeals_stage_items
  where lobodeals_lowest_ps_plus_price_amount is not null;

  if v_total_after <> 1398 then
    raise exception 'LOBODEALS_009_PS_PLUS_LOW_RECOVERY_POST_TOTAL_MISMATCH:%',
      v_total_after;
  end if;

  if exists (
    select 1
    from public.psdeals_stage_items item
    where item.lobodeals_lowest_ps_plus_price_amount is not null
      and (
        item.raw_detail_json #>> '{commercial_state,classification}'
          = 'temporary_free_promotion_candidate'
        or item.raw_detail_json ->> 'current_ps_plus_buy_box_price_amount' is null
        or item.raw_detail_json ->> 'current_ps_plus_buy_box_price_amount'
          !~ '^[0-9]+(\.[0-9]{1,2})?$'
        or case
          when item.raw_detail_json ->> 'current_ps_plus_buy_box_price_amount'
            ~ '^[0-9]+(\.[0-9]{1,2})?$'
          then (item.raw_detail_json ->> 'current_ps_plus_buy_box_price_amount')::numeric
          else null
        end <= 0
      )
  ) then
    raise exception 'LOBODEALS_009_PS_PLUS_LOW_RECOVERY_POSTCHECK_FAILED';
  end if;
end;
$recovery$;

commit;

select jsonb_build_object(
  'recovery', 'clear_unprovable_legacy_ps_plus_lows',
  'foundational_cycle', '7a4b9b06-4b51-45af-bc93-945d15d1cff0',
  'remaining_lobodeals_ps_plus_lows', (
    select count(*)
    from public.psdeals_stage_items
    where lobodeals_lowest_ps_plus_price_amount is not null
  ),
  'remaining_unprovable_ps_plus_lows', (
    select count(*)
    from public.psdeals_stage_items item
    where item.lobodeals_lowest_ps_plus_price_amount is not null
      and (
        item.raw_detail_json #>> '{commercial_state,classification}'
          = 'temporary_free_promotion_candidate'
        or item.raw_detail_json ->> 'current_ps_plus_buy_box_price_amount' is null
        or item.raw_detail_json ->> 'current_ps_plus_buy_box_price_amount'
          !~ '^[0-9]+(\.[0-9]{1,2})?$'
        or case
          when item.raw_detail_json ->> 'current_ps_plus_buy_box_price_amount'
            ~ '^[0-9]+(\.[0-9]{1,2})?$'
          then (item.raw_detail_json ->> 'current_ps_plus_buy_box_price_amount')::numeric
          else null
        end <= 0
      )
  ),
  'checked_at', clock_timestamp()
) as recovery_postcheck;
