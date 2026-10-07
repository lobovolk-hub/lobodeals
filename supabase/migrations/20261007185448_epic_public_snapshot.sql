-- Public membership metadata only. Existing rows keep NULL; no backfill.
alter table public.sales_campaigns
  add column epic_public_scan_generation bigint null default null,
  add constraint sales_campaigns_epic_generation_scope check (
    epic_public_scan_generation is null or
    (store_slug = 'epic-games-store' and epic_public_scan_generation > 0)
  );

alter table public.sales_source_health
  add column epic_scan_generation_counter bigint null default null,
  add column epic_public_scan_generation bigint null default null,
  add constraint sales_source_health_epic_counter_scope check (
    epic_scan_generation_counter is null or
    (store_slug = 'epic-games-store' and epic_scan_generation_counter > 0)
  ),
  add constraint sales_source_health_epic_pointer_scope check (
    epic_public_scan_generation is null or
    (store_slug = 'epic-games-store' and epic_public_scan_generation > 0
      and epic_scan_generation_counter is not null
      and epic_public_scan_generation <= epic_scan_generation_counter)
  );

-- All Epic core writers use this same source-row lock. It is released before HTTP.
create function public.reserve_epic_public_scan()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  generation bigint;
  pointer bigint;
  known jsonb;
begin
  update public.sales_source_health
    set epic_scan_generation_counter = coalesce(epic_scan_generation_counter, 0) + 1
    where store_slug = 'epic-games-store'
    returning epic_scan_generation_counter, epic_public_scan_generation
      into generation, pointer;
  if not found then raise exception 'Epic source state missing'; end if;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.campaign_key), '[]'::jsonb)
    into known
    from (
      select campaign_key, source_uid, name, state, official_url, source_url,
        starts_on, starts_at, ends_on, ends_at
      from public.sales_campaigns
      where store_slug = 'epic-games-store' and state in ('live', 'upcoming')
    ) c;
  return jsonb_build_object('generation', generation::text,
    'base_pointer', pointer::text, 'campaigns', known);
end;
$$;

-- Receives final rows and independent END decisions prepared by TypeScript.
-- No source parsing, identity matching, or lifecycle inference occurs in SQL.
create function public.finalize_epic_public_scan(
  p_generation text,
  p_base_pointer text,
  p_campaigns jsonb,
  p_end_keys text[],
  p_confirmed_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  generation bigint;
  base_pointer bigint;
  pointer bigint;
  counter bigint;
  item jsonb;
  affected integer;
begin
  if p_generation is null or p_generation !~ '^[1-9][0-9]*$' or
    (p_base_pointer is not null and p_base_pointer !~ '^[1-9][0-9]*$') then
    raise exception 'Invalid Epic generation';
  end if;
  generation := p_generation::bigint;
  base_pointer := p_base_pointer::bigint;
  select epic_public_scan_generation, epic_scan_generation_counter
    into pointer, counter from public.sales_source_health
    where store_slug = 'epic-games-store' for update;
  if not found then raise exception 'Epic source state missing'; end if;
  if counter is null or generation > counter or generation <= 0 or
    (base_pointer is not null and base_pointer >= generation) then
    raise exception 'Unreserved or invalid Epic generation';
  end if;
  if pointer = generation then return 'already-published'; end if;
  if pointer > generation then return 'obsolete'; end if;
  if pointer is distinct from base_pointer then return 'baseline-conflict'; end if;

  if jsonb_typeof(p_campaigns) is distinct from 'array' or
    p_end_keys is null or p_confirmed_at is null then
    raise exception 'Invalid Epic publication payload';
  end if;
  for item in select value from jsonb_array_elements(p_campaigns) loop
    if jsonb_typeof(item) is distinct from 'object' or
      item->>'store_slug' is distinct from 'epic-games-store' or
      item->>'market' is distinct from 'US' or
      item->>'campaign_key' is null or
      item->>'campaign_key' !~ '^epic-games-store-[a-f0-9]{24}$' or
      not (item ? 'epic_public_scan_generation') or
      ((item->'epic_public_scan_generation') <> 'null'::jsonb and
        (jsonb_typeof(item->'epic_public_scan_generation') is distinct from 'string' or
          item->>'epic_public_scan_generation' is distinct from p_generation)) then
      raise exception 'Campaign outside prepared Epic publication contract';
    end if;
  end loop;
  if exists (
    select 1 from unnest(p_end_keys) k(campaign_key)
    where not exists (
      select 1 from public.sales_campaigns c
      where c.campaign_key = k.campaign_key and c.store_slug = 'epic-games-store'
        and c.state in ('live', 'upcoming')
    )
  ) then raise exception 'END target outside known Epic campaigns'; end if;

  insert into public.sales_campaigns as existing (
    campaign_key, store_slug, source_uid, name, market, state, lifecycle_basis,
    starts_on, starts_at, ends_on, ends_at, official_url, source_url,
    last_confirmed_at, updated_at, epic_public_scan_generation
  )
  select r.campaign_key, r.store_slug, r.source_uid, r.name, r.market, r.state,
    r.lifecycle_basis, r.starts_on, r.starts_at, r.ends_on, r.ends_at,
    r.official_url, r.source_url, p_confirmed_at, p_confirmed_at,
    r.epic_public_scan_generation::bigint
  from jsonb_to_recordset(p_campaigns) as r(
    campaign_key text, store_slug text, source_uid text, name text, market text,
    state text, lifecycle_basis text, starts_on date, starts_at timestamptz,
    ends_on date, ends_at timestamptz, official_url text, source_url text,
    epic_public_scan_generation text
  )
  on conflict (campaign_key) do update set
    source_uid = excluded.source_uid, name = excluded.name, market = excluded.market,
    state = excluded.state, lifecycle_basis = excluded.lifecycle_basis,
    starts_on = excluded.starts_on, starts_at = excluded.starts_at,
    ends_on = excluded.ends_on, ends_at = excluded.ends_at,
    official_url = excluded.official_url, source_url = excluded.source_url,
    last_confirmed_at = excluded.last_confirmed_at, updated_at = excluded.updated_at,
    epic_public_scan_generation = excluded.epic_public_scan_generation
  where existing.store_slug = 'epic-games-store';
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(p_campaigns) then
    raise exception 'Epic campaign key collision';
  end if;

  update public.sales_campaigns set state = 'ended', updated_at = p_confirmed_at
    where store_slug = 'epic-games-store' and campaign_key = any(p_end_keys);
  update public.sales_source_health set epic_public_scan_generation = generation
    where store_slug = 'epic-games-store';
  return 'published';
end;
$$;

-- Optional artwork follows publication, but an older scan cannot overwrite it.
create function public.apply_epic_scan_artwork(p_generation text, p_patches jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  pointer bigint;
begin
  select epic_public_scan_generation into pointer from public.sales_source_health
    where store_slug = 'epic-games-store' for update;
  if p_generation is null or p_generation !~ '^[1-9][0-9]*$' then
    raise exception 'Invalid Epic artwork generation';
  end if;
  if pointer is distinct from p_generation::bigint then return false; end if;
  if jsonb_typeof(p_patches) is distinct from 'array' then
    raise exception 'Invalid artwork patches';
  end if;
  update public.sales_campaigns c set artwork_url = p.artwork_url
    from jsonb_to_recordset(p_patches) as p(campaign_key text, artwork_url text)
    where c.store_slug = 'epic-games-store' and c.campaign_key = p.campaign_key
      and p.artwork_url is not null;
  return true;
end;
$$;

-- Explicit public projection of existing public fields plus membership metadata.
-- A single SQL statement reads rows and pointer from the same MVCC snapshot.
-- Definer access is limited to this read because health itself stays private.
create function public.read_sales_public_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'epic_public_scan_generation', h.epic_public_scan_generation::text,
    'campaigns', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.campaign_key), '[]'::jsonb)
      from (
        select campaign_key, store_slug, source_uid, source_url, name, market,
          state, lifecycle_basis, starts_on, starts_at, ends_on, ends_at,
          official_url, artwork_url, epic_public_scan_generation::text
        from public.sales_campaigns
        where market = 'US' and state in ('live', 'upcoming')
      ) c
    )
  ) from public.sales_source_health h where h.store_slug = 'epic-games-store';
$$;

revoke all on function public.reserve_epic_public_scan() from public, anon, authenticated;
revoke all on function public.finalize_epic_public_scan(text, text, jsonb, text[], timestamptz)
  from public, anon, authenticated;
revoke all on function public.apply_epic_scan_artwork(text, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_epic_public_scan() to service_role;
grant execute on function public.finalize_epic_public_scan(text, text, jsonb, text[], timestamptz)
  to service_role;
grant execute on function public.apply_epic_scan_artwork(text, jsonb) to service_role;

revoke all on function public.read_sales_public_snapshot() from public, anon, authenticated;
grant execute on function public.read_sales_public_snapshot() to anon, authenticated, service_role;

comment on column public.sales_campaigns.epic_public_scan_generation is
  'Public Epic tag-only membership generation, not lifecycle or END evidence.';
comment on column public.sales_source_health.epic_scan_generation_counter is
  'Epic reservation counter; gaps are allowed and do not publish a snapshot.';
comment on column public.sales_source_health.epic_public_scan_generation is
  'Last atomically published Epic generation; NULL preserves pre-snapshot visibility.';

notify pgrst, 'reload schema';
