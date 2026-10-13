-- Johan, 2026-10-12: visibility and operational closure, NOT official end dates.
-- Additive proposal. Existing campaigns retain NULL metadata; no age-based backfill.
alter table public.sales_campaigns
  add column absence_started_at timestamptz,
  add column operational_closed_at timestamptz,
  add constraint sales_campaigns_absence_scope check (
    absence_started_at is null or (state = 'live' and ends_on is null and ends_at is null)
  ),
  add constraint sales_campaigns_operational_closure check (
    operational_closed_at is null or (absence_started_at is not null and
      operational_closed_at >= absence_started_at + interval '72 hours')
  );

alter table public.sales_source_health
  add column visibility_scan_counter bigint,
  add column visibility_scan_pointer bigint,
  add constraint sales_visibility_generations check (
    (visibility_scan_counter is null or visibility_scan_counter > 0) and
    (visibility_scan_pointer is null or (visibility_scan_counter is not null and
      visibility_scan_pointer > 0 and visibility_scan_pointer <= visibility_scan_counter))
  );

-- Same short-lock reservation/publication protocol as Epic. No lock across HTTP.
-- Epic retains its existing dedicated protocol and membership contract.
create function public.reserve_sales_visibility_scan(p_store_slug text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare generation bigint; pointer bigint; known jsonb;
begin
  if p_store_slug = 'epic-games-store' then raise exception 'Use Epic reservation'; end if;
  update public.sales_source_health
    set visibility_scan_counter = coalesce(visibility_scan_counter, 0) + 1
    where store_slug = p_store_slug
    returning visibility_scan_counter, visibility_scan_pointer into generation, pointer;
  if not found then raise exception 'Unknown store'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.campaign_key), '[]'::jsonb) into known
    from public.sales_campaigns c where store_slug = p_store_slug and state in ('live', 'upcoming');
  return jsonb_build_object('generation', generation::text, 'base_pointer', pointer::text, 'campaigns', known);
end;
$$;

create function public.finalize_sales_visibility_scan(
  p_store_slug text, p_generation text, p_base_pointer text, p_campaigns jsonb,
  p_end_keys text[], p_absent_source_uids text[], p_confirmed_at timestamptz
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  generation bigint; base_pointer bigint; pointer bigint; counter bigint;
  item jsonb; written integer; ended integer; hidden integer; closed integer;
begin
  if p_store_slug = 'epic-games-store' or p_generation is null or p_generation !~ '^[1-9][0-9]*$' or
    (p_base_pointer is not null and p_base_pointer !~ '^[1-9][0-9]*$') then
    raise exception 'Invalid visibility generation';
  end if;
  generation := p_generation::bigint; base_pointer := p_base_pointer::bigint;
  select visibility_scan_pointer, visibility_scan_counter into pointer, counter
    from public.sales_source_health where store_slug = p_store_slug for update;
  if not found or counter is null or generation > counter or
    (base_pointer is not null and base_pointer >= generation) then raise exception 'Unreserved scan'; end if;
  if pointer = generation then return jsonb_build_object('status','already-published'); end if;
  if pointer > generation then return jsonb_build_object('status','obsolete'); end if;
  if pointer is distinct from base_pointer then return jsonb_build_object('status','baseline-conflict'); end if;

  if jsonb_typeof(p_campaigns) is distinct from 'array' or p_end_keys is null or
    p_absent_source_uids is null or p_confirmed_at is null or not isfinite(p_confirmed_at) then
    raise exception 'Invalid publication payload';
  end if;
  -- Fail closed until each adapter has its own audited absence contract.
  if cardinality(p_absent_source_uids) > 0 and p_store_slug <> 'playstation-store' then
    raise exception 'Store has no enabled absence contract';
  end if;
  for item in select value from jsonb_array_elements(p_campaigns) loop
    if jsonb_typeof(item) is distinct from 'object' or item->>'store_slug' is distinct from p_store_slug or
      item->>'market' is distinct from 'US' or item->>'campaign_key' is null or
      item->>'campaign_key' !~ ('^' || p_store_slug || '-[a-f0-9]{24}$') or
      item->>'source_uid' is null or item->>'state' not in ('live','upcoming') then
      raise exception 'Invalid campaign publication';
    end if;
  end loop;
  if exists (
    select 1 from unnest(p_end_keys) k where not exists (
      select 1 from public.sales_campaigns c where c.campaign_key=k and c.store_slug=p_store_slug and c.state in ('live','upcoming')
    )
  ) or exists (
    select 1 from unnest(p_absent_source_uids) u where not exists (
      select 1 from public.sales_campaigns c where c.source_uid=u and c.store_slug=p_store_slug
        and c.state='live' and c.ends_on is null and c.ends_at is null
    )
  ) or exists (
    select 1 from jsonb_array_elements(p_campaigns) c where c->>'source_uid'=any(p_absent_source_uids)
      or c->>'campaign_key'=any(p_end_keys)
  ) or exists (
    select 1 from public.sales_campaigns c where c.store_slug=p_store_slug
      and c.source_uid=any(p_absent_source_uids) and c.campaign_key=any(p_end_keys)
  ) then raise exception 'Invalid or contradictory evidence targets'; end if;

  insert into public.sales_campaigns as existing (
    campaign_key,store_slug,source_uid,name,market,state,lifecycle_basis,
    starts_on,starts_at,ends_on,ends_at,official_url,source_url,last_confirmed_at,updated_at,artwork_url
  ) select r.campaign_key,r.store_slug,r.source_uid,r.name,r.market,r.state,r.lifecycle_basis,
    r.starts_on,r.starts_at,r.ends_on,r.ends_at,r.official_url,r.source_url,p_confirmed_at,p_confirmed_at,r.artwork_url
    from jsonb_to_recordset(p_campaigns) as r(
      campaign_key text,store_slug text,source_uid text,name text,market text,state text,lifecycle_basis text,
      starts_on date,starts_at timestamptz,ends_on date,ends_at timestamptz,official_url text,source_url text,artwork_url text
    ) on conflict(campaign_key) do update set
      source_uid=excluded.source_uid,name=excluded.name,market=excluded.market,state=excluded.state,
      lifecycle_basis=excluded.lifecycle_basis,starts_on=excluded.starts_on,starts_at=excluded.starts_at,
      ends_on=excluded.ends_on,ends_at=excluded.ends_at,official_url=excluded.official_url,source_url=excluded.source_url,
      last_confirmed_at=excluded.last_confirmed_at,updated_at=excluded.updated_at,
      artwork_url=coalesce(excluded.artwork_url,existing.artwork_url),
      absence_started_at=null,operational_closed_at=null
    where existing.store_slug=p_store_slug and existing.source_uid=excluded.source_uid;
  get diagnostics written=row_count;
  if written <> jsonb_array_length(p_campaigns) then raise exception 'Campaign identity collision'; end if;

  update public.sales_campaigns set state='ended',updated_at=p_confirmed_at,
    absence_started_at=null,operational_closed_at=null
    where store_slug=p_store_slug and campaign_key=any(p_end_keys);
  get diagnostics ended=row_count;

  -- Only a new successful, explicit absence observation starts/confirms the clock.
  update public.sales_campaigns set absence_started_at=p_confirmed_at,updated_at=p_confirmed_at
    where store_slug=p_store_slug and source_uid=any(p_absent_source_uids) and absence_started_at is null;
  get diagnostics hidden=row_count;
  update public.sales_campaigns set operational_closed_at=p_confirmed_at,updated_at=p_confirmed_at
    where store_slug=p_store_slug and source_uid=any(p_absent_source_uids) and operational_closed_at is null
      and p_confirmed_at >= absence_started_at + interval '72 hours';
  get diagnostics closed=row_count;
  update public.sales_source_health set visibility_scan_pointer=generation where store_slug=p_store_slug;
  return jsonb_build_object('status','published','upserted',written,'ended',ended,'hidden',hidden,'operationallyClosed',closed);
end;
$$;

-- Protect both the direct table surface and the shared EN/ES public snapshot.
alter policy sales_campaigns_public_read on public.sales_campaigns
  using (market='US' and state in ('live','upcoming') and absence_started_at is null and operational_closed_at is null);

create or replace function public.read_sales_public_snapshot()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'epic_public_scan_generation',h.epic_public_scan_generation::text,
    'campaigns',(
      select coalesce(jsonb_agg(to_jsonb(c) order by c.campaign_key),'[]'::jsonb) from (
        select campaign_key,store_slug,source_uid,source_url,name,market,state,lifecycle_basis,
          starts_on,starts_at,ends_on,ends_at,official_url,artwork_url,epic_public_scan_generation::text
        from public.sales_campaigns where market='US' and state in ('live','upcoming')
          and absence_started_at is null and operational_closed_at is null
      ) c
    )
  ) from public.sales_source_health h where h.store_slug='epic-games-store';
$$;

revoke all on function public.reserve_sales_visibility_scan(text) from public,anon,authenticated;
revoke all on function public.finalize_sales_visibility_scan(text,text,text,jsonb,text[],text[],timestamptz) from public,anon,authenticated;
grant execute on function public.reserve_sales_visibility_scan(text) to service_role;
grant execute on function public.finalize_sales_visibility_scan(text,text,text,jsonb,text[],text[],timestamptz) to service_role;

comment on column public.sales_campaigns.absence_started_at is 'First verified absence in the current observation period. NULL preserves bootstrap visibility.';
comment on column public.sales_campaigns.operational_closed_at is 'Operational closure after 72h and a fresh verified absence; NOT an official end instant. Fresh presence resets both fields.';
notify pgrst,'reload schema';
