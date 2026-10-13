-- OPTIONAL MANUAL RECOVERY ARTIFACT, NOT A MIGRATION. Separate approval required.
-- Restores the pre-visibility public projection for ALL US Live/Upcoming rows.
-- Inventory hidden rows first; this can intentionally expose stale campaigns.
-- No lifecycle/history fields, Epic membership or generation pointers are changed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.sales_source_health, public.sales_campaigns in access exclusive mode;
alter policy sales_campaigns_public_read on public.sales_campaigns
  using (market = 'US' and state in ('live', 'upcoming'));
create or replace function public.read_sales_public_snapshot()
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
revoke all on function public.read_sales_public_snapshot() from public, anon, authenticated;
grant execute on function public.read_sales_public_snapshot() to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
