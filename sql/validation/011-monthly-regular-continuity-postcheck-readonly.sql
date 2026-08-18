begin transaction read only;

do $lobodeals_011_postcheck$
declare
  v5 regprocedure;
  v25 regprocedure;
  v5_definition text;
  v25_definition text;
  v5_source_sha256 text;
  v25_source_sha256 text;
  inspected regprocedure;
  preflight record;
begin
  v5 := to_regprocedure(
    'public.certify_price_refresh_cycle_v5(uuid,uuid,text,text,timestamp with time zone)'
  );
  v25 := to_regprocedure('public.lobodeals_daily_runner_v25_preflight()');

  if v5 is null or v25 is null then
    raise exception 'LOBODEALS_011_POSTCHECK_FUNCTION_MISSING';
  end if;

  select
    pg_catalog.pg_get_functiondef(procedure.oid),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(procedure.prosrc,'UTF8')
      ),
      'hex'
    )
  into v5_definition,v5_source_sha256
  from pg_catalog.pg_proc procedure
  where procedure.oid=v5::oid;

  select
    pg_catalog.pg_get_functiondef(procedure.oid),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(procedure.prosrc,'UTF8')
      ),
      'hex'
    )
  into v25_definition,v25_source_sha256
  from pg_catalog.pg_proc procedure
  where procedure.oid=v25::oid;

  if position('classification''=''no_discount' in v5_definition)=0
     or position('monthly_entitlement_excluded_from_ps_plus_low' in v5_definition)=0
     or position('legacy_lows_promoted_to_certified' in v5_definition)=0
     or lower(v5_definition) !~
       'detail_receipt\.action_kind[[:space:]]+in[[:space:]]*\(''detail_import'',[[:space:]]*''detail_retry''\)'
     or lower(v5_definition) !~
       'monthly_game\.is_active[[:space:]]*=[[:space:]]*true'
     or position('update public.psdeals_stage_items item' in v5_definition)=0
     or lower(v5_definition) ~ '(^|[^a-z0-9_])lowest_price_amount[[:space:]]*='
     or lower(v5_definition) ~ '(^|[^a-z0-9_])lowest_ps_plus_price_amount[[:space:]]*='
     or lower(v5_definition) ~ 'insert[[:space:]]+into[[:space:]]+public\.psdeals_stage_items'
     or position('lobodeals_lowest_ps_plus_price_amount=' in v5_definition)>0 then
    raise exception 'LOBODEALS_011_POSTCHECK_V5_SEMANTICS_INVALID';
  end if;

  if v5_source_sha256 <> 'a5a285b6b181cf265ec2401bed9e4886e396e660cd159d013ba875e6bc099548'
     or v25_source_sha256 <> '8081c9f1a695f2b5bcfcb2a03d8f2c3e166631941731e86ac0925892da9562cf' then
    raise exception 'LOBODEALS_011_POSTCHECK_DEFINITION_HASH_INVALID:%:%',
      v5_source_sha256,v25_source_sha256;
  end if;

  if not exists (
       select 1
       from pg_catalog.pg_proc procedure
       join pg_catalog.pg_language language on language.oid=procedure.prolang
       where procedure.oid=v5::oid
         and pg_catalog.pg_get_userbyid(procedure.proowner)='postgres'
         and procedure.prosecdef
         and coalesce(procedure.proconfig,array[]::text[])
           =array['search_path=""']::text[]
         and language.lanname='plpgsql'
         and procedure.provolatile='v'
     ) then
    raise exception 'LOBODEALS_011_POSTCHECK_V5_FUNCTION_CONTRACT_INVALID';
  end if;

  if not exists (
       select 1
       from pg_catalog.pg_proc procedure
       join pg_catalog.pg_language language on language.oid=procedure.prolang
       where procedure.oid=v25::oid
         and pg_catalog.pg_get_userbyid(procedure.proowner)='postgres'
         and procedure.prosecdef
         and coalesce(procedure.proconfig,array[]::text[])
           =array['search_path=""']::text[]
         and language.lanname='sql'
         and procedure.provolatile='s'
     ) then
    raise exception 'LOBODEALS_011_POSTCHECK_V25_FUNCTION_CONTRACT_INVALID';
  end if;

  foreach inspected in array array[v5,v25] loop
    if has_function_privilege('public',inspected::text,'EXECUTE')
       or has_function_privilege('anon',inspected::text,'EXECUTE')
       or has_function_privilege('authenticated',inspected::text,'EXECUTE')
       or not has_function_privilege('service_role',inspected::text,'EXECUTE')
       or exists (
         select 1
         from pg_catalog.pg_proc procedure,
         lateral pg_catalog.aclexplode(
           coalesce(
             procedure.proacl,
             pg_catalog.acldefault('f',procedure.proowner)
           )
         ) privilege
         where procedure.oid=inspected::oid
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
      raise exception 'LOBODEALS_011_POSTCHECK_FUNCTION_ACL_INVALID:%',inspected;
    end if;
  end loop;

  if (
    select count(*)
    from information_schema.columns
    where table_schema='public'
      and table_name='psdeals_stage_items'
      and column_name in (
        'monthly_regular_certification_evidence_sha256',
        'monthly_regular_certification_input_artifact_sha256'
      )
      and data_type='character varying'
      and udt_name='varchar'
      and character_maximum_length=64
  ) <> 2 then
    raise exception 'LOBODEALS_011_POSTCHECK_MONTHLY_REGULAR_HASH_COLUMNS_INVALID';
  end if;

  select * into preflight
  from public.lobodeals_daily_runner_v25_preflight();

  if preflight.contract_version <> 25
     or not preflight.pg_cron_present
     or not preflight.async_cache_v18_present
     or not preflight.refresh_cache_v19_present
     or not preflight.verified_offer_columns_present
     or not preflight.monthly_regular_columns_present
     or not preflight.search_v2_present
     or not preflight.certify_v5_present
     or not preflight.monthly_positive_regular_contract_present then
    raise exception 'LOBODEALS_011_POSTCHECK_V25_PREFLIGHT_FALSE';
  end if;

  if exists (
    select 1
    from public.catalog_public_cache cache
    where cache.is_ps_plus_monthly_game=true
      and coalesce(cache.ps_plus_price_amount,0) <= 0
      and cache.has_verified_ps_plus_deal=true
  ) then
    raise exception 'LOBODEALS_011_POSTCHECK_MONTHLY_ZERO_PS_PLUS_LEAK';
  end if;
end
$lobodeals_011_postcheck$;

select * from public.lobodeals_daily_runner_v25_preflight();

select
  count(*) filter (
    where is_ps_plus_monthly_game=true
      and ps_plus_price_amount=0
      and has_verified_ps_plus_deal=true
  ) as monthly_zero_verified_ps_plus_leaks
from public.catalog_public_cache;

select
  count(*) filter (
    where item.current_price_amount > 0
      and item.lobodeals_lowest_regular_price_amount is null
  ) as monthly_positive_regular_lows_pending_future_cycle
from public.psdeals_stage_items item
join public.ps_plus_monthly_games monthly_game
  on monthly_game.item_id=item.id
 and monthly_game.is_active=true;

rollback;
