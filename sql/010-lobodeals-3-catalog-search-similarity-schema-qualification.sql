-- LoboDeals 3.2
-- Durable catalog-search hotfix after the FASE 0 production deploy.
--
-- search_catalog_public_cache_v2() intentionally runs with search_path=''.
-- Its legacy delegate used four unqualified similarity(...) calls. PostgreSQL
-- could therefore fail to resolve pg_trgm similarity while v2 was executing.
--
-- This migration does not alter catalog data, cache data, Stage, Monthly,
-- certification, deals, or v2. It only schema-qualifies those four calls in
-- the already-deployed legacy search function.
--
-- It is deliberately safe to run both:
--   1. before the production hotfix, or
--   2. after the production hotfix has already been applied.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $catalog_similarity_hotfix$
declare
  v_legacy constant regprocedure :=
    'public.search_catalog_public_cache(text,text,text,text,integer,integer)'::regprocedure;

  v_v2 constant regprocedure :=
    'public.search_catalog_public_cache_v2(text,text,text,text,integer,integer)'::regprocedure;

  v_pre_hotfix_sha256 constant text :=
    '3ed338b1719d4581b24cddf9bd4ccd9803cafa96bc5cc045702e808d782b78af';

  v_post_hotfix_sha256 constant text :=
    'a2874b62dd6e796c8d3f01709a52f22cc0db02f6b852ba386648fe75fd5dfee2';

  v_expected_v2_sha256 constant text :=
    '0f3f77364e9c1406588b70a0f1f1463e1aa98be5edfa6475c4a713a07f69f0ea';

  v_definition text;
  v_definition_after text;
  v_sha256 text;
  v_sha256_after text;

  v_qualified_count integer;
  v_total_similarity_count integer;

  v_owner oid;
  v_owner_after oid;
  v_security_definer boolean;
  v_security_definer_after boolean;
  v_config text[];
  v_config_after text[];
  v_acl aclitem[];
  v_acl_after aclitem[];

  v_v2_sha256 text;
  v_v2_sha256_after text;
begin
  if current_user <> 'postgres' then
    raise exception
      'LOBODEALS_010_POSTGRES_OWNER_REQUIRED';
  end if;

  if to_regprocedure(
       'public.search_catalog_public_cache(text,text,text,text,integer,integer)'
     ) is null then
    raise exception
      'LOBODEALS_010_LEGACY_SEARCH_MISSING';
  end if;

  if to_regprocedure(
       'public.search_catalog_public_cache_v2(text,text,text,text,integer,integer)'
     ) is null then
    raise exception
      'LOBODEALS_010_V2_SEARCH_MISSING';
  end if;

  if to_regprocedure('public.similarity(text,text)') is null then
    raise exception
      'LOBODEALS_010_PUBLIC_SIMILARITY_MISSING';
  end if;

  select
    pg_catalog.pg_get_functiondef(p.oid),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(p.oid),
          'UTF8'
        )
      ),
      'hex'
    ),
    p.proowner,
    p.prosecdef,
    coalesce(p.proconfig, array[]::text[]),
    p.proacl
  into
    v_definition,
    v_sha256,
    v_owner,
    v_security_definer,
    v_config,
    v_acl
  from pg_catalog.pg_proc p
  where p.oid = v_legacy::oid;

  select pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid),
        'UTF8'
      )
    ),
    'hex'
  )
  into v_v2_sha256
  from pg_catalog.pg_proc p
  where p.oid = v_v2::oid;

  if v_v2_sha256 <> v_expected_v2_sha256 then
    raise exception
      'LOBODEALS_010_V2_DEFINITION_DRIFT:%',
      v_v2_sha256;
  end if;

  v_qualified_count :=
    (
      pg_catalog.length(v_definition)
      - pg_catalog.length(
          pg_catalog.replace(
            v_definition,
            'public.similarity(',
            ''
          )
        )
    )
    / pg_catalog.length('public.similarity(');

  v_total_similarity_count :=
    (
      pg_catalog.length(v_definition)
      - pg_catalog.length(
          pg_catalog.replace(
            v_definition,
            'similarity(',
            ''
          )
        )
    )
    / pg_catalog.length('similarity(');

  if v_sha256 = v_pre_hotfix_sha256 then
    if v_qualified_count <> 0
       or v_total_similarity_count <> 4 then
      raise exception
        'LOBODEALS_010_PRE_HOTFIX_TOKEN_MISMATCH:%:%',
        v_qualified_count,
        v_total_similarity_count;
    end if;

    v_definition_after :=
      pg_catalog.replace(
        v_definition,
        'similarity(',
        'public.similarity('
      );

    execute v_definition_after;

  elsif v_sha256 = v_post_hotfix_sha256 then
    if v_qualified_count <> 4
       or v_total_similarity_count <> 4 then
      raise exception
        'LOBODEALS_010_POST_HOTFIX_TOKEN_MISMATCH:%:%',
        v_qualified_count,
        v_total_similarity_count;
    end if;

  else
    raise exception
      'LOBODEALS_010_LEGACY_DEFINITION_DRIFT:%',
      v_sha256;
  end if;

  select
    pg_catalog.pg_get_functiondef(p.oid),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(p.oid),
          'UTF8'
        )
      ),
      'hex'
    ),
    p.proowner,
    p.prosecdef,
    coalesce(p.proconfig, array[]::text[]),
    p.proacl
  into
    v_definition_after,
    v_sha256_after,
    v_owner_after,
    v_security_definer_after,
    v_config_after,
    v_acl_after
  from pg_catalog.pg_proc p
  where p.oid = v_legacy::oid;

  if v_sha256_after <> v_post_hotfix_sha256 then
    raise exception
      'LOBODEALS_010_FINAL_DEFINITION_HASH_MISMATCH:%',
      v_sha256_after;
  end if;

  if v_owner_after is distinct from v_owner then
    raise exception
      'LOBODEALS_010_OWNER_CHANGED';
  end if;

  if v_security_definer_after is distinct from v_security_definer then
    raise exception
      'LOBODEALS_010_SECURITY_MODE_CHANGED';
  end if;

  if v_config_after is distinct from v_config then
    raise exception
      'LOBODEALS_010_CONFIG_CHANGED';
  end if;

  if v_acl_after is distinct from v_acl then
    raise exception
      'LOBODEALS_010_ACL_CHANGED';
  end if;

  if v_security_definer_after is distinct from false
     or v_config_after <> array[]::text[] then
    raise exception
      'LOBODEALS_010_LEGACY_SECURITY_CONTRACT_MISMATCH';
  end if;

  v_qualified_count :=
    (
      pg_catalog.length(v_definition_after)
      - pg_catalog.length(
          pg_catalog.replace(
            v_definition_after,
            'public.similarity(',
            ''
          )
        )
    )
    / pg_catalog.length('public.similarity(');

  v_total_similarity_count :=
    (
      pg_catalog.length(v_definition_after)
      - pg_catalog.length(
          pg_catalog.replace(
            v_definition_after,
            'similarity(',
            ''
          )
        )
    )
    / pg_catalog.length('similarity(');

  if v_qualified_count <> 4
     or v_total_similarity_count <> 4 then
    raise exception
      'LOBODEALS_010_FINAL_SIMILARITY_TOKEN_MISMATCH:%:%',
      v_qualified_count,
      v_total_similarity_count;
  end if;

  select pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid),
        'UTF8'
      )
    ),
    'hex'
  )
  into v_v2_sha256_after
  from pg_catalog.pg_proc p
  where p.oid = v_v2::oid;

  if v_v2_sha256_after <> v_expected_v2_sha256
     or v_v2_sha256_after is distinct from v_v2_sha256 then
    raise exception
      'LOBODEALS_010_V2_CHANGED:%',
      v_v2_sha256_after;
  end if;
end
$catalog_similarity_hotfix$;

do $catalog_similarity_verify$
declare
  v_expected_total bigint;
  v_rows bigint;
  v_total_min bigint;
  v_total_max bigint;

  v_legacy_upcoming integer;
  v_v2_upcoming integer;

  v_legacy_latest integer;
  v_v2_latest integer;
begin
  select count(*)
  into v_expected_total
  from public.catalog_public_cache
  where region_code = 'us'
    and storefront = 'playstation';

  select
    count(*),
    min(total_count),
    max(total_count)
  into
    v_rows,
    v_total_min,
    v_total_max
  from public.search_catalog_public_cache_v2(
    p_q => '',
    p_tab => 'all',
    p_letter => 'ALL',
    p_sort => 'title',
    p_limit => 36,
    p_offset => 0
  );

  if v_rows <> least(v_expected_total, 36::bigint)
     or v_total_min is distinct from v_expected_total
     or v_total_max is distinct from v_expected_total then
    raise exception
      'LOBODEALS_010_V2_CATALOG_POSTCHECK_FAILED:%:%:%:%',
      v_rows,
      v_total_min,
      v_total_max,
      v_expected_total;
  end if;

  select count(*)
  into v_legacy_upcoming
  from public.search_catalog_public_cache(
    p_q => '',
    p_tab => 'games',
    p_letter => 'ALL',
    p_sort => 'upcoming',
    p_limit => 6,
    p_offset => 0
  );

  select count(*)
  into v_v2_upcoming
  from public.search_catalog_public_cache_v2(
    p_q => '',
    p_tab => 'games',
    p_letter => 'ALL',
    p_sort => 'upcoming',
    p_limit => 6,
    p_offset => 0
  );

  if v_v2_upcoming <> v_legacy_upcoming then
    raise exception
      'LOBODEALS_010_UPCOMING_POSTCHECK_FAILED:%:%',
      v_v2_upcoming,
      v_legacy_upcoming;
  end if;

  select count(*)
  into v_legacy_latest
  from public.search_catalog_public_cache(
    p_q => '',
    p_tab => 'games',
    p_letter => 'ALL',
    p_sort => 'latest',
    p_limit => 6,
    p_offset => 0
  );

  select count(*)
  into v_v2_latest
  from public.search_catalog_public_cache_v2(
    p_q => '',
    p_tab => 'games',
    p_letter => 'ALL',
    p_sort => 'latest',
    p_limit => 6,
    p_offset => 0
  );

  if v_v2_latest <> v_legacy_latest then
    raise exception
      'LOBODEALS_010_LATEST_POSTCHECK_FAILED:%:%',
      v_v2_latest,
      v_legacy_latest;
  end if;
end
$catalog_similarity_verify$;

commit;
