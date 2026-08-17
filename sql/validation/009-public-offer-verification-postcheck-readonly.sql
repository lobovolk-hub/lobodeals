with certification_definition as materialized (
  select pg_catalog.pg_get_functiondef(
    to_regprocedure(
      'public.certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamp with time zone)'
    )
  ) as value
)
select jsonb_build_object(
  'checked_at', statement_timestamp(),
  'migration_columns_present', (
    select count(*)=17
    from information_schema.columns
    where table_schema='public'
      and (
        (
          table_name='psdeals_stage_items'
          and column_name in (
            'public_offer_verification_cycle_id','public_offer_verified_at',
            'public_offer_verification_source','public_offer_evidence_sha256',
            'public_offer_input_artifact_sha256',
            'monthly_regular_certification_cycle_id',
            'monthly_regular_certification_observed_at',
            'monthly_regular_certification_evidence_sha256',
            'monthly_regular_certification_input_artifact_sha256',
            'monthly_regular_certification_candidate'
          )
        )
        or
        (
          table_name='catalog_public_cache'
          and column_name in (
            'has_verified_deal','has_verified_ps_plus_deal',
            'public_offer_verification_cycle_id','public_offer_verified_at',
            'public_offer_verification_source','public_offer_evidence_sha256',
            'public_offer_input_artifact_sha256'
          )
        )
      )
  ),
  'functions_present', jsonb_build_object(
    'certify_v4', to_regprocedure(
      'public.certify_price_refresh_cycle_v4(uuid,uuid,text,text,timestamp with time zone)'
    ) is not null,
    'cache_v19', to_regprocedure(
      'public.refresh_catalog_public_cache_v19(uuid,uuid,text,text,timestamp with time zone)'
    ) is not null,
    'search_v2', to_regprocedure(
      'public.search_catalog_public_cache_v2(text,text,text,text,integer,integer)'
    ) is not null,
    'preflight_v24', to_regprocedure(
      'public.lobodeals_daily_runner_v24_preflight()'
    ) is not null
  ),
  'ps_plus_minimum_semantics', (
    select jsonb_build_object(
      'monthly_membership_not_globally_excluded',
        position(
          'from public.ps_plus_monthly_games as monthly_game'
          in definition.value
        )=0,
      'positive_detail_buy_box_required',
        position(
          'current_ps_plus_buy_box_price_amount'
          in definition.value
        )>0,
      'temporary_free_promotion_excluded',
        position(
          'temporary_free_promotion_candidate'
          in definition.value
        )>0
    )
    from certification_definition definition
  ),
  'verified_offer_cycle_mismatches', (
    select count(*)
    from public.catalog_public_cache cache
    where (cache.has_verified_deal=true or cache.has_verified_ps_plus_deal=true)
      and not exists (
        select 1
        from public.price_refresh_cycles cycle
        where cycle.id=cache.public_offer_verification_cycle_id
          and cycle.status='certified'
          and cycle.cache_refreshed_at is not null
      )
  ),
  'monthly_commercial_leaks', (
    select count(*)
    from public.catalog_public_cache cache
    where cache.is_ps_plus_monthly_game=true
      and (
        (
          (cache.has_deal=true or cache.has_verified_deal=true)
          and (
            cache.current_price_amount > 0
            and cache.original_price_amount > cache.current_price_amount
            and cache.discount_percent between 1 and 99
          ) is not true
        )
        or (
          (
            cache.has_ps_plus_deal=true
            or cache.has_verified_ps_plus_deal=true
          )
          and (
            cache.ps_plus_price_amount > 0
            and cache.current_price_amount > 0
            and cache.ps_plus_price_amount < cache.current_price_amount
          ) is not true
        )
      )
  ),
  'monthly_independent_commercial_deals', (
    select count(*)
    from public.catalog_public_cache cache
    where cache.is_ps_plus_monthly_game=true
      and (
        (
          (cache.has_deal=true or cache.has_verified_deal=true)
          and cache.current_price_amount > 0
          and cache.original_price_amount > cache.current_price_amount
          and cache.discount_percent between 1 and 99
        )
        or (
          (
            cache.has_ps_plus_deal=true
            or cache.has_verified_ps_plus_deal=true
          )
          and cache.ps_plus_price_amount > 0
          and cache.current_price_amount > 0
          and cache.ps_plus_price_amount < cache.current_price_amount
        )
      )
  ),
  'monthly_zero_ps_plus_lows', (
    select count(*)
    from public.psdeals_stage_items item
    join public.ps_plus_monthly_games monthly_game on monthly_game.item_id=item.id
    where monthly_game.is_active=true
      and item.lobodeals_lowest_ps_plus_price_amount=0
  ),
  'current_cycle_ps_plus_low_source_leaks', (
    select count(*)
    from public.psdeals_stage_items item
    where item.ps_plus_certification_cycle_id is not null
      and item.lobodeals_lowest_ps_plus_price_amount is not null
      and item.lobodeals_lowest_ps_plus_price_first_seen_at
        = item.ps_plus_certification_observed_at
      and (
        item.ps_plus_certification_candidate ->> 'kind'='ps_plus'
        and item.ps_plus_certification_candidate ->> 'is_active_discount'='true'
        and item.ps_plus_certification_candidate ->> 'is_ps_plus_discount'='true'
        and item.ps_plus_certification_candidate ->> 'is_free_to_play'='false'
        and item.ps_plus_certification_candidate ->> 'parser_status'
          ='parsed_current_discount'
        and item.ps_plus_certification_candidate ->> 'source_consistent'='true'
        and case
          when item.ps_plus_certification_candidate
            ->> 'ps_plus_price_amount' ~ '^[0-9]+(\.[0-9]{1,2})?$'
          then (item.ps_plus_certification_candidate
            ->> 'ps_plus_price_amount')::numeric
          else null
        end > 0
        and case
          when item.raw_detail_json
            ->> 'current_ps_plus_buy_box_price_amount'
              ~ '^[0-9]+(\.[0-9]{1,2})?$'
          then (item.raw_detail_json
            ->> 'current_ps_plus_buy_box_price_amount')::numeric
          else null
        end = item.lobodeals_lowest_ps_plus_price_amount
        and item.raw_detail_json #>> '{commercial_state,classification}'
          is distinct from 'temporary_free_promotion_candidate'
      ) is not true
  ),
  'big_walk', (
    select jsonb_build_object(
      'stage_current',item.current_price_amount,
      'stage_lowest_regular',item.lobodeals_lowest_regular_price_amount,
      'stage_lowest_ps_plus',item.lobodeals_lowest_ps_plus_price_amount,
      'cache_current',cache.current_price_amount,
      'monthly',cache.is_ps_plus_monthly_game,
      'commercial_deal',cache.has_deal,
      'commercial_ps_plus_deal',cache.has_ps_plus_deal,
      'verified_deal',cache.has_verified_deal,
      'verified_ps_plus_deal',cache.has_verified_ps_plus_deal
    )
    from public.psdeals_stage_items item
    left join public.catalog_public_cache cache on cache.item_id=item.id
    where item.region_code='us'
      and item.storefront='playstation'
      and item.psdeals_id=3781017
  )
) as postcheck;
