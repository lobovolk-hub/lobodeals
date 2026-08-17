-- LoboDeals 3.2 / FASE 0
-- Recovery quirúrgico de procedencia Detail para el ciclo certificado indicado.
-- NO es una migración y NO debe registrarse en schema_migrations.
-- NO ejecutar sin una autorización separada y una lectura previa de todos los
-- result sets de precheck. Este archivo no modifica precios ni estado comercial.

begin;
set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'lobodeals:fase0:restore-detail-provenance:60e1725f-8393-416c-a384-9581f8ab7ea0',
    0
  )
);

create temp table lobodeals_recovery_expected (
  psdeals_id bigint primary key,
  expected_title text not null,
  expected_current_price_amount numeric(10,2) not null,
  expected_original_price_amount numeric(10,2) not null,
  expected_discount_percent integer not null,
  public_offer_evidence_sha256 text not null,
  debug_html_file text not null
) on commit preserve rows;

insert into lobodeals_recovery_expected values
  (2348719,'35MM',4.99,9.99,50,'99bdfcca26cda7f7bfb1382cc6adbfc1df8c0a0effc2aea6150991c1d8803c04','psdeals-net-us-store-game-2348719-35mm.html'),
  (2480260,'41 Hours PS4 & PS5',6.99,19.99,65,'c124f13ccdf7d33163383eaf3da6fdab98ae2396849de911922243c4937c2246','psdeals-net-us-store-game-2480260-41-hours-ps4-ps5.html'),
  (3219484,'Menace from the Deep: Complete Edition',15.99,19.99,20,'d55236bae69d901a7c2b970934056ae055523b7240b80aecf294a715f5a0ad45','psdeals-net-us-store-game-3219484-menace-from-the-deep-complete-edition.html'),
  (3219485,'Menace from the Deep: Complete Edition',15.99,19.99,20,'e819be7e08ed498bb95aca11705893226ec93b15798aaeb285033101dc9b6f79','psdeals-net-us-store-game-3219485-menace-from-the-deep-complete-edition.html'),
  (3220064,'Pawbay',7.99,19.99,60,'59cc1acd7d81999cf07ded41afacd3d7c337de17cac267ad3126ea94c0ebe527','psdeals-net-us-store-game-3220064-pawbay.html'),
  (3858779,'Mafia: Definitive Edition for PS5®',5.99,39.99,85,'9e3e85061827d7da00a116f0c23f89d241ea67595a29dd618e271103fcf35c1d','psdeals-net-us-store-game-3858779-mafia-definitive-edition-for-ps5.html'),
  (3858780,'Mafia: The Old Country Definitive Edition',38.99,64.99,40,'c50fac1286130f8869e833f8c0a0a815afe705bc7bd684550a0f341a76bfd48a','psdeals-net-us-store-game-3858780-mafia-the-old-country-definitive-edition.html'),
  (3858781,'Mafia: The Omertà Collection',49.99,99.99,50,'ddfda3ddf24cb34acc6e5fa5b9531a91f37da82aae6bcc433a9333aecbf0c048','psdeals-net-us-store-game-3858781-mafia-the-omert-C3-A0-collection.html'),
  (3895116,'Buffet Boss & The Legend Of Fireball: Starter Bundle',2.99,5.99,50,'201cef84d6eec56846f467a9e45277ae62aea36a32641bae50bc48e96e761b7b','psdeals-net-us-store-game-3895116-buffet-boss-the-legend-of-fireball-starter-bundle.html'),
  (3897536,'Buffet Boss & Baking Time!: Complete Editions',6.99,13.99,50,'fec715a26e6a85c0ed2e4f6bdfde594667d801b5478d003dce163b265d37c1ac','psdeals-net-us-store-game-3897536-buffet-boss-baking-time-complete-editions.html'),
  (3897538,'Buffet Boss: Complete Edition',4.99,9.99,50,'3ad75254ac874b024aa8e6905ee2995b0507634afb298dd380d84a7063a5d4c9','psdeals-net-us-store-game-3897538-buffet-boss-complete-edition.html'),
  (3897539,'Buffet Boss: Platinum Supporter',2.99,5.99,50,'51364455fcd05875bdb9ae130c98dc616935dc683eff8460f54286cc19bc5131','psdeals-net-us-store-game-3897539-buffet-boss-platinum-supporter.html'),
  (3900733,'TCG Card Shop Simulator',16.99,19.99,15,'ba4a126a6d6b94f4a484e81e833c845616434b9fb40e4e6d2d7abbc381e45574','psdeals-net-us-store-game-3900733-tcg-card-shop-simulator.html'),
  (3900734,'TCG Card Shop Simulator',21.24,24.99,15,'cb65026fa72f2286104e581591e2390c4cb8de5e4c1e1e27aa9167fe6744e775','psdeals-net-us-store-game-3900734-tcg-card-shop-simulator.html');

do $recovery_precheck$
declare
  v_count integer;
begin
  if (select count(*) from lobodeals_recovery_expected) <> 14 then
    raise exception 'LOBODEALS_FASE0_RECOVERY_EXPECTED_SET_NOT_14';
  end if;

  if not exists (
    select 1
    from public.price_refresh_cycles cycle
    where cycle.id='60e1725f-8393-416c-a384-9581f8ab7ea0'::uuid
      and cycle.status='certified'
      and cycle.validation_passed=true
      and cycle.items_failed=0
      and cycle.listing_completed_at='2026-08-16T18:00:17.784Z'::timestamptz
      and cycle.details_completed_at is not null
      and cycle.certified_at is not null
  ) then
    raise exception 'LOBODEALS_FASE0_RECOVERY_CYCLE_GUARD_FAILED';
  end if;

  if not exists (
    select 1
    from public.psdeals_cycle_action_receipts receipt
    where receipt.id='21d2ba0b-dfe0-45a3-abd7-39043d5e1608'::uuid
      and receipt.cycle_id='60e1725f-8393-416c-a384-9581f8ab7ea0'::uuid
      and receipt.action_kind='detail_import'
      and receipt.status='committed'
      and receipt.input_artifact_hash='a343aa6fd28d7e2aa12ddcc70b368a960004235b685d705385f2fc8986c3624e'
      and receipt.started_at='2026-08-16T18:01:40.247Z'::timestamptz
      and receipt.finished_at='2026-08-16T18:04:41.397Z'::timestamptz
      and receipt.affected_rows=23
      and (receipt.result->>'attempted')::integer=23
      and (receipt.result->>'succeeded')::integer=23
      and coalesce((receipt.result->>'pending_failures')::integer,0)=0
  ) then
    raise exception 'LOBODEALS_FASE0_RECOVERY_DETAIL_RECEIPT_GUARD_FAILED';
  end if;

  select count(*) into v_count
  from public.psdeals_cycle_action_receipts receipt
  where receipt.cycle_id='60e1725f-8393-416c-a384-9581f8ab7ea0'::uuid
    and receipt.status in ('intent','running','indeterminate');
  if v_count <> 0 then
    raise exception 'LOBODEALS_FASE0_RECOVERY_UNRESOLVED_RECEIPTS:%',v_count;
  end if;

  perform stage.id
  from public.psdeals_stage_items stage
  join lobodeals_recovery_expected expected
    on expected.psdeals_id=stage.psdeals_id
  where stage.region_code='us'
    and stage.storefront='playstation'
  for update of stage;

  select count(*) into v_count
  from public.psdeals_stage_items stage
  join lobodeals_recovery_expected expected
    on expected.psdeals_id=stage.psdeals_id
  where stage.region_code='us'
    and stage.storefront='playstation'
    and stage.title=expected.expected_title
    and stage.current_price_amount is not distinct from expected.expected_current_price_amount
    and stage.original_price_amount is not distinct from expected.expected_original_price_amount
    and stage.discount_percent is not distinct from expected.expected_discount_percent
    and stage.currency_code='USD'
    and stage.listing_last_seen_at='2026-08-16T18:00:17.784Z'::timestamptz
    and stage.detail_last_synced_at is not null
    and stage.detail_last_synced_at between
      (select cycle.started_at from public.price_refresh_cycles cycle where cycle.id='60e1725f-8393-416c-a384-9581f8ab7ea0'::uuid)
      and
      (select cycle.details_completed_at from public.price_refresh_cycles cycle where cycle.id='60e1725f-8393-416c-a384-9581f8ab7ea0'::uuid)
    and (stage.raw_detail_json->>'imported_at')::timestamptz=stage.detail_last_synced_at
    and pg_catalog.replace(stage.raw_detail_json->>'debug_html_path',pg_catalog.chr(92),'/')
      like '%/' || expected.debug_html_file
    and stage.public_offer_verification_cycle_id='60e1725f-8393-416c-a384-9581f8ab7ea0'::uuid
    and stage.public_offer_verified_at='2026-08-16T18:00:17.784Z'::timestamptz
    and stage.public_offer_verification_source='complete_listing'
    and stage.public_offer_evidence_sha256='d04b411682651ec9885d785cb30844484f551115be3605dfe7b0303faa48a277'
    and stage.public_offer_input_artifact_sha256 is null;
  if v_count <> 14 then
    raise exception 'LOBODEALS_FASE0_RECOVERY_STAGE_PRECHECK_NOT_14:%',v_count;
  end if;

  perform cache.item_id
  from public.catalog_public_cache cache
  join public.psdeals_stage_items stage on stage.id=cache.item_id
  join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
  where stage.region_code='us'
    and stage.storefront='playstation'
  for update of cache;

  select count(*) into v_count
  from public.catalog_public_cache cache
  join public.psdeals_stage_items stage on stage.id=cache.item_id
  join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
  where stage.region_code='us'
    and stage.storefront='playstation'
    and cache.current_price_amount is not distinct from expected.expected_current_price_amount
    and cache.original_price_amount is not distinct from expected.expected_original_price_amount
    -- Cache.discount_percent puede representar el descuento del mejor precio
    -- PS+ y diferir legítimamente del regular de Stage; immutable_row lo protege.
    and cache.public_offer_verification_cycle_id='60e1725f-8393-416c-a384-9581f8ab7ea0'::uuid
    and cache.public_offer_verified_at='2026-08-16T18:00:17.784Z'::timestamptz
    and cache.public_offer_verification_source='complete_listing'
    and cache.public_offer_evidence_sha256='d04b411682651ec9885d785cb30844484f551115be3605dfe7b0303faa48a277'
    and cache.public_offer_input_artifact_sha256 is null;
  if v_count <> 14 then
    raise exception 'LOBODEALS_FASE0_RECOVERY_CACHE_PRECHECK_NOT_14:%',v_count;
  end if;

  select count(*) into v_count
  from public.psdeals_stage_items stage
  where stage.region_code='us'
    and stage.storefront='playstation'
    and stage.listing_last_seen_at='2026-08-16T18:00:17.784Z'::timestamptz;
  if v_count <> 1800 then
    raise exception 'LOBODEALS_FASE0_RECOVERY_LISTING_STAMP_PRECHECK_NOT_1800:%',v_count;
  end if;
end;
$recovery_precheck$;

create temp table lobodeals_recovery_stage_before on commit preserve rows as
select
  stage.id,
  stage.psdeals_id,
  stage.updated_at as updated_at_before,
  -- updated_at es metadata técnica modificada obligatoriamente por
  -- trg_psdeals_stage_items_set_updated_at y se valida por separado.
  to_jsonb(stage)-array[
    'public_offer_verification_cycle_id','public_offer_verified_at',
    'public_offer_verification_source','public_offer_evidence_sha256',
    'public_offer_input_artifact_sha256','updated_at'
  ]::text[] as immutable_row
from public.psdeals_stage_items stage
join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
where stage.region_code='us'
  and stage.storefront='playstation';

create temp table lobodeals_recovery_cache_before on commit preserve rows as
select
  cache.item_id,
  stage.psdeals_id,
  cache.has_deal,
  cache.has_ps_plus_deal,
  cache.has_verified_deal,
  cache.has_verified_ps_plus_deal,
  to_jsonb(cache)-array[
    'public_offer_verification_cycle_id','public_offer_verified_at',
    'public_offer_verification_source','public_offer_evidence_sha256',
    'public_offer_input_artifact_sha256'
  ]::text[] as immutable_row
from public.catalog_public_cache cache
join public.psdeals_stage_items stage on stage.id=cache.item_id
join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
where stage.region_code='us'
  and stage.storefront='playstation';

create temp table lobodeals_recovery_outside_fingerprint on commit preserve rows as
select
  'stage'::text as relation_name,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.jsonb_build_array(
      stage.psdeals_id,stage.public_offer_verification_cycle_id,
      stage.public_offer_verified_at,stage.public_offer_verification_source,
      stage.public_offer_evidence_sha256,stage.public_offer_input_artifact_sha256
    )::text,'|' order by stage.psdeals_id
  ),'')) as fingerprint
from public.psdeals_stage_items stage
where not exists (
  select 1 from lobodeals_recovery_expected expected
  where expected.psdeals_id=stage.psdeals_id
    and stage.region_code='us'
    and stage.storefront='playstation'
)
union all
select
  'cache'::text,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.jsonb_build_array(
      cache.item_id,cache.public_offer_verification_cycle_id,
      cache.public_offer_verified_at,cache.public_offer_verification_source,
      cache.public_offer_evidence_sha256,cache.public_offer_input_artifact_sha256
    )::text,'|' order by cache.item_id
  ),''))
from public.catalog_public_cache cache
where not exists (
  select 1
  from public.psdeals_stage_items stage
  join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
  where stage.id=cache.item_id
    and stage.region_code='us'
    and stage.storefront='playstation'
);

do $recovery_apply$
declare
  v_stage_updated integer;
  v_cache_updated integer;
  v_count integer;
  v_fingerprint text;
begin
  with updated as (
    update public.psdeals_stage_items stage
    set
      public_offer_verification_cycle_id='60e1725f-8393-416c-a384-9581f8ab7ea0'::uuid,
      public_offer_verified_at=stage.detail_last_synced_at,
      public_offer_verification_source='strong_detail_revalidation',
      public_offer_evidence_sha256=expected.public_offer_evidence_sha256,
      public_offer_input_artifact_sha256='a343aa6fd28d7e2aa12ddcc70b368a960004235b685d705385f2fc8986c3624e'
    from lobodeals_recovery_expected expected
    where stage.region_code='us'
      and stage.storefront='playstation'
      and stage.psdeals_id=expected.psdeals_id
    returning stage.psdeals_id
  )
  select count(*) into v_stage_updated from updated;
  if v_stage_updated <> 14 then
    raise exception 'LOBODEALS_FASE0_RECOVERY_STAGE_UPDATE_NOT_14:%',v_stage_updated;
  end if;

  with updated as (
    update public.catalog_public_cache cache
    set
      public_offer_verification_cycle_id=stage.public_offer_verification_cycle_id,
      public_offer_verified_at=stage.public_offer_verified_at,
      public_offer_verification_source=stage.public_offer_verification_source,
      public_offer_evidence_sha256=stage.public_offer_evidence_sha256,
      public_offer_input_artifact_sha256=stage.public_offer_input_artifact_sha256
    from public.psdeals_stage_items stage
    join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
    where cache.item_id=stage.id
      and stage.region_code='us'
      and stage.storefront='playstation'
    returning cache.item_id
  )
  select count(*) into v_cache_updated from updated;
  if v_cache_updated <> 14 then
    raise exception 'LOBODEALS_FASE0_RECOVERY_CACHE_UPDATE_NOT_14:%',v_cache_updated;
  end if;

  select count(*) into v_count
  from public.psdeals_stage_items stage
  join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
  where stage.region_code='us'
    and stage.storefront='playstation'
    and stage.public_offer_verification_cycle_id='60e1725f-8393-416c-a384-9581f8ab7ea0'::uuid
    and stage.public_offer_verified_at=stage.detail_last_synced_at
    and stage.public_offer_verification_source='strong_detail_revalidation'
    and stage.public_offer_evidence_sha256=expected.public_offer_evidence_sha256
    and stage.public_offer_input_artifact_sha256='a343aa6fd28d7e2aa12ddcc70b368a960004235b685d705385f2fc8986c3624e'
    and stage.public_offer_evidence_sha256 ~ '^[a-f0-9]{64}$'
    and stage.public_offer_input_artifact_sha256 ~ '^[a-f0-9]{64}$';
  if v_count <> 14 then
    raise exception 'LOBODEALS_FASE0_RECOVERY_STAGE_POSTCHECK_NOT_14:%',v_count;
  end if;

  select count(*) into v_count
  from public.catalog_public_cache cache
  join public.psdeals_stage_items stage on stage.id=cache.item_id
  join lobodeals_recovery_cache_before before_row on before_row.item_id=cache.item_id
  join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
  where stage.region_code='us'
    and stage.storefront='playstation'
    and cache.public_offer_verification_cycle_id=stage.public_offer_verification_cycle_id
    and cache.public_offer_verified_at=stage.public_offer_verified_at
    and cache.public_offer_verification_source=stage.public_offer_verification_source
    and cache.public_offer_evidence_sha256=stage.public_offer_evidence_sha256
    and cache.public_offer_input_artifact_sha256=stage.public_offer_input_artifact_sha256
    and cache.has_deal=before_row.has_deal
    and cache.has_ps_plus_deal=before_row.has_ps_plus_deal
    and cache.has_verified_deal=before_row.has_verified_deal
    and cache.has_verified_ps_plus_deal=before_row.has_verified_ps_plus_deal;
  if v_count <> 14 then
    raise exception 'LOBODEALS_FASE0_RECOVERY_CACHE_POSTCHECK_NOT_14:%',v_count;
  end if;

  if exists (
    select 1
    from public.psdeals_stage_items stage
    join lobodeals_recovery_stage_before before_row on before_row.id=stage.id
    where to_jsonb(stage)-array[
      'public_offer_verification_cycle_id','public_offer_verified_at',
      'public_offer_verification_source','public_offer_evidence_sha256',
      'public_offer_input_artifact_sha256','updated_at'
    ]::text[] is distinct from before_row.immutable_row
  ) then
    raise exception 'LOBODEALS_FASE0_RECOVERY_STAGE_NON_PUBLIC_FIELD_CHANGED';
  end if;

  select count(*) into v_count
  from public.psdeals_stage_items stage
  join lobodeals_recovery_stage_before before_row on before_row.id=stage.id
  where stage.updated_at=pg_catalog.transaction_timestamp()
    and stage.updated_at >= before_row.updated_at_before
    and stage.updated_at is distinct from before_row.updated_at_before;
  if v_count <> 14 then
    raise exception 'LOBODEALS_FASE0_RECOVERY_STAGE_UPDATED_AT_TRIGGER_NOT_14:%',v_count;
  end if;

  if exists (
    select 1
    from public.catalog_public_cache cache
    join lobodeals_recovery_cache_before before_row on before_row.item_id=cache.item_id
    where to_jsonb(cache)-array[
      'public_offer_verification_cycle_id','public_offer_verified_at',
      'public_offer_verification_source','public_offer_evidence_sha256',
      'public_offer_input_artifact_sha256'
    ]::text[] is distinct from before_row.immutable_row
  ) then
    raise exception 'LOBODEALS_FASE0_RECOVERY_CACHE_NON_PUBLIC_FIELD_CHANGED';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.jsonb_build_array(
      stage.psdeals_id,stage.public_offer_verification_cycle_id,
      stage.public_offer_verified_at,stage.public_offer_verification_source,
      stage.public_offer_evidence_sha256,stage.public_offer_input_artifact_sha256
    )::text,'|' order by stage.psdeals_id
  ),'')) into v_fingerprint
  from public.psdeals_stage_items stage
  where not exists (
    select 1 from lobodeals_recovery_expected expected
    where expected.psdeals_id=stage.psdeals_id
      and stage.region_code='us'
      and stage.storefront='playstation'
  );
  if v_fingerprint is distinct from (
    select fingerprint from lobodeals_recovery_outside_fingerprint where relation_name='stage'
  ) then
    raise exception 'LOBODEALS_FASE0_RECOVERY_OTHER_STAGE_ROW_CHANGED';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.jsonb_build_array(
      cache.item_id,cache.public_offer_verification_cycle_id,
      cache.public_offer_verified_at,cache.public_offer_verification_source,
      cache.public_offer_evidence_sha256,cache.public_offer_input_artifact_sha256
    )::text,'|' order by cache.item_id
  ),'')) into v_fingerprint
  from public.catalog_public_cache cache
  where not exists (
    select 1
    from public.psdeals_stage_items stage
    join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
    where stage.id=cache.item_id
      and stage.region_code='us'
      and stage.storefront='playstation'
  );
  if v_fingerprint is distinct from (
    select fingerprint from lobodeals_recovery_outside_fingerprint where relation_name='cache'
  ) then
    raise exception 'LOBODEALS_FASE0_RECOVERY_OTHER_CACHE_ROW_CHANGED';
  end if;

  select count(*) into v_count
  from public.psdeals_stage_items stage
  where stage.region_code='us'
    and stage.storefront='playstation'
    and stage.listing_last_seen_at='2026-08-16T18:00:17.784Z'::timestamptz;
  if v_count <> 1800 then
    raise exception 'LOBODEALS_FASE0_RECOVERY_LISTING_STAMP_POSTCHECK_NOT_1800:%',v_count;
  end if;
end;
$recovery_apply$;

commit;

-- Postchecks read-only. Deben devolver 14/14/14, 1800, certified y 0.
select
  count(*) as stage_target_rows,
  count(*) filter (
    where stage.public_offer_verification_source='strong_detail_revalidation'
      and stage.public_offer_verified_at=stage.detail_last_synced_at
  ) as stage_strong_detail_rows,
  count(*) filter (where stage.public_offer_evidence_sha256 ~ '^[a-f0-9]{64}$') as valid_evidence_hashes,
  count(*) filter (
    where stage.public_offer_input_artifact_sha256='a343aa6fd28d7e2aa12ddcc70b368a960004235b685d705385f2fc8986c3624e'
  ) as valid_input_hashes
from public.psdeals_stage_items stage
join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
where stage.region_code='us'
  and stage.storefront='playstation';

select
  count(*) as cache_target_rows,
  count(*) filter (
    where cache.public_offer_verification_cycle_id=stage.public_offer_verification_cycle_id
      and cache.public_offer_verified_at=stage.public_offer_verified_at
      and cache.public_offer_verification_source=stage.public_offer_verification_source
      and cache.public_offer_evidence_sha256=stage.public_offer_evidence_sha256
      and cache.public_offer_input_artifact_sha256=stage.public_offer_input_artifact_sha256
  ) as cache_public_offer_matches,
  count(*) filter (
    where cache.has_deal=before_row.has_deal
      and cache.has_ps_plus_deal=before_row.has_ps_plus_deal
      and cache.has_verified_deal=before_row.has_verified_deal
      and cache.has_verified_ps_plus_deal=before_row.has_verified_ps_plus_deal
  ) as cache_flags_unchanged
from public.catalog_public_cache cache
join public.psdeals_stage_items stage on stage.id=cache.item_id
join lobodeals_recovery_cache_before before_row on before_row.item_id=cache.item_id
join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
where stage.region_code='us'
  and stage.storefront='playstation';

select
  cycle.id,
  cycle.status,
  cycle.validation_passed,
  cycle.items_failed,
  (
    select count(*)
    from public.psdeals_stage_items stage
    where stage.region_code='us'
      and stage.storefront='playstation'
      and stage.listing_last_seen_at='2026-08-16T18:00:17.784Z'::timestamptz
  ) as listing_stamp_rows,
  (
    select count(*)
    from public.psdeals_cycle_action_receipts receipt
    where receipt.cycle_id=cycle.id
      and receipt.status in ('intent','running','indeterminate')
  ) as unresolved_receipts,
  exists (
    select 1
    from public.psdeals_cycle_action_receipts receipt
    where receipt.id='21d2ba0b-dfe0-45a3-abd7-39043d5e1608'::uuid
      and receipt.cycle_id=cycle.id
      and receipt.action_kind='detail_import'
      and receipt.status='committed'
      and receipt.input_artifact_hash='a343aa6fd28d7e2aa12ddcc70b368a960004235b685d705385f2fc8986c3624e'
      and receipt.affected_rows=23
      and (receipt.result->>'attempted')::integer=23
      and (receipt.result->>'succeeded')::integer=23
      and coalesce((receipt.result->>'pending_failures')::integer,0)=0
  ) as exact_detail_receipt_committed
from public.price_refresh_cycles cycle
where cycle.id='60e1725f-8393-416c-a384-9581f8ab7ea0'::uuid;

select
  stage.psdeals_id,
  stage.public_offer_verification_cycle_id,
  stage.public_offer_verified_at,
  stage.public_offer_verification_source,
  stage.public_offer_evidence_sha256,
  stage.public_offer_input_artifact_sha256,
  stage.current_price_amount,
  stage.original_price_amount,
  stage.discount_percent,
  cache.has_deal,
  cache.has_ps_plus_deal,
  cache.has_verified_deal,
  cache.has_verified_ps_plus_deal
from public.psdeals_stage_items stage
join lobodeals_recovery_expected expected on expected.psdeals_id=stage.psdeals_id
join public.catalog_public_cache cache on cache.item_id=stage.id
where stage.region_code='us'
  and stage.storefront='playstation'
order by stage.psdeals_id;
