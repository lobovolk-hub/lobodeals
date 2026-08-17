-- LoboDeals 3.2
-- Optional one-time recovery for Big Walk after migration 009 is applied.
-- DO NOT run as part of the automatic migration path.
-- This file is intentionally exact-ID and exact-evidence bound.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.price_refresh_cycles in share mode;
lock table public.psdeals_cycle_action_receipts in share mode;
lock table public.psdeals_stage_items in row exclusive mode;
lock table public.ps_plus_monthly_games in share mode;
lock table public.catalog_public_cache in row exclusive mode;

do $precheck$
declare
  stage_count integer;
  monthly_count integer;
  cache_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'LOBODEALS_009_BIG_WALK_POSTGRES_OWNER_REQUIRED';
  end if;

  if exists (
    select 1 from public.price_refresh_cycles where status='running'
  ) or exists (
    select 1
    from public.psdeals_cycle_action_receipts
    where status in ('intent','running','indeterminate')
  ) then
    raise exception 'LOBODEALS_009_BIG_WALK_OPERATION_IN_PROGRESS';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='catalog_public_cache'
      and column_name='has_verified_deal'
  ) then
    raise exception 'LOBODEALS_009_BIG_WALK_MIGRATION_NOT_APPLIED';
  end if;

  select count(*)::integer into stage_count
  from public.psdeals_stage_items item
  where item.region_code='us'
    and item.storefront='playstation'
    and item.psdeals_id=3781017
    and item.title='Big Walk'
    and item.current_price_amount is null
    and item.original_price_amount is null
    and item.discount_percent is null
    and item.is_ps_plus_discount=false
    and item.lobodeals_lowest_regular_price_amount is null
    and item.lobodeals_lowest_ps_plus_price_amount is null
    and item.raw_detail_json #>> '{commercial_state,classification}'
      ='temporary_free_promotion_candidate'
    and item.raw_detail_json #>> '{commercial_state,source,current_price}'='0'
    and item.raw_detail_json #>> '{commercial_state,source,original_price}'='$19.99'
    and item.raw_detail_json #>> '{commercial_state,source,discount_percent}'='100%'
    and item.detail_last_synced_at is not null;

  select count(*)::integer into monthly_count
  from public.ps_plus_monthly_games monthly_game
  join public.psdeals_stage_items item on item.id=monthly_game.item_id
  where item.psdeals_id=3781017
    and monthly_game.month_key='2026-08'
    and monthly_game.title='Big Walk'
    and monthly_game.label='Free with PS Plus'
    and monthly_game.active_from='2026-08-04'::date
    and monthly_game.active_until='2026-08-31'::date
    and monthly_game.is_active=true;

  select count(*)::integer into cache_count
  from public.catalog_public_cache cache
  join public.psdeals_stage_items item on item.id=cache.item_id
  where item.psdeals_id=3781017
    and cache.slug='big-walk'
    and cache.current_price_amount is null
    and cache.original_price_amount is null
    and cache.discount_percent=0
    and cache.has_deal=false
    and cache.has_ps_plus_deal=false
    and cache.has_verified_deal=false
    and cache.has_verified_ps_plus_deal=false
    and cache.is_ps_plus_monthly_game=true
    and cache.ps_plus_monthly_label='Free with PS Plus';

  if stage_count <> 1 or monthly_count <> 1 or cache_count <> 1 then
    raise exception
      'LOBODEALS_009_BIG_WALK_PRECONDITION_FAILED:stage=% monthly=% cache=%',
      stage_count, monthly_count, cache_count;
  end if;
end;
$precheck$;

update public.psdeals_stage_items item
set
  current_price_amount=19.99,
  original_price_amount=19.99,
  discount_percent=0,
  is_ps_plus_discount=false,
  is_free_to_play=false,
  availability_state='priced',
  lobodeals_lowest_regular_price_amount=19.99,
  lobodeals_lowest_regular_price_first_seen_at=item.detail_last_synced_at
where item.region_code='us'
  and item.storefront='playstation'
  and item.psdeals_id=3781017;

update public.catalog_public_cache cache
set
  current_price_amount=19.99,
  original_price_amount=19.99,
  discount_percent=0,
  ps_plus_price_amount=null,
  best_price_amount=19.99,
  best_price_type='none',
  has_deal=false,
  has_ps_plus_deal=false,
  has_verified_deal=false,
  has_verified_ps_plus_deal=false,
  deal_ends_at=null
from public.psdeals_stage_items item
where cache.item_id=item.id
  and item.region_code='us'
  and item.storefront='playstation'
  and item.psdeals_id=3781017;

do $postcheck$
begin
  if not exists (
    select 1
    from public.psdeals_stage_items item
    join public.catalog_public_cache cache on cache.item_id=item.id
    join public.ps_plus_monthly_games monthly_game on monthly_game.item_id=item.id
    where item.psdeals_id=3781017
      and item.current_price_amount=19.99
      and item.original_price_amount=19.99
      and item.discount_percent=0
      and item.is_ps_plus_discount=false
      and item.lobodeals_lowest_regular_price_amount=19.99
      and item.lobodeals_lowest_ps_plus_price_amount is null
      and cache.current_price_amount=19.99
      and cache.has_deal=false
      and cache.has_ps_plus_deal=false
      and cache.has_verified_deal=false
      and cache.has_verified_ps_plus_deal=false
      and cache.is_ps_plus_monthly_game=true
      and monthly_game.month_key='2026-08'
      and monthly_game.is_active=true
  ) then
    raise exception 'LOBODEALS_009_BIG_WALK_POSTCONDITION_FAILED';
  end if;
end;
$postcheck$;

commit;
