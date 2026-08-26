create table public.sales_campaigns (
  campaign_key text primary key,
  store_slug text not null,
  source_uid text not null,
  name text not null,
  market text not null default 'US',
  state text not null,
  lifecycle_basis text not null,
  starts_on date,
  starts_at timestamptz,
  ends_on date,
  ends_at timestamptz,
  official_url text not null,
  source_url text not null,
  first_seen_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_campaigns_campaign_key_format
    check (campaign_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint sales_campaigns_store_slug
    check (store_slug in (
      'playstation-store',
      'nintendo-eshop',
      'microsoft-store',
      'steam',
      'epic-games-store',
      'gog',
      'ea-app',
      'ubisoft-store',
      'battle-net',
      'rockstar-store'
    )),
  constraint sales_campaigns_source_uid_present
    check (length(btrim(source_uid)) > 0),
  constraint sales_campaigns_name_present
    check (length(btrim(name)) > 0),
  constraint sales_campaigns_market_us
    check (market = 'US'),
  constraint sales_campaigns_state
    check (state in ('live', 'upcoming', 'ended')),
  constraint sales_campaigns_lifecycle_basis
    check (lifecycle_basis in ('official-source', 'exact-time')),
  constraint sales_campaigns_start_precision
    check (starts_on is null or starts_at is null),
  constraint sales_campaigns_end_precision
    check (ends_on is null or ends_at is null),
  constraint sales_campaigns_exact_time_boundaries
    check (
      lifecycle_basis <> 'exact-time'
      or (
        starts_at is not null
        and ends_at is not null
        and ends_at > starts_at
      )
    ),
  constraint sales_campaigns_date_range
    check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint sales_campaigns_datetime_range
    check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint sales_campaigns_official_url_https
    check (official_url ~ '^https://[^[:space:]]+$'),
  constraint sales_campaigns_source_url_https
    check (source_url ~ '^https://[^[:space:]]+$'),
  constraint sales_campaigns_store_source_unique
    unique (store_slug, source_uid)
);

create index sales_campaigns_public_feed_idx
  on public.sales_campaigns (state, store_slug, ends_at, ends_on, starts_at, starts_on);

create table public.sales_source_health (
  store_slug text primary key,
  source_url text not null,
  adapter_version text not null default '1',
  status text not null default 'never-run',
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_succeeded_at timestamptz,
  campaigns_detected integer not null default 0,
  campaigns_upserted integer not null default 0,
  consecutive_failures integer not null default 0,
  last_error_code text,
  last_error_message text,
  updated_at timestamptz not null default now(),
  constraint sales_source_health_store_slug
    check (store_slug in (
      'playstation-store',
      'nintendo-eshop',
      'microsoft-store',
      'steam',
      'epic-games-store',
      'gog',
      'ea-app',
      'ubisoft-store',
      'battle-net',
      'rockstar-store'
    )),
  constraint sales_source_health_source_url_https
    check (source_url ~ '^https://[^[:space:]]+$'),
  constraint sales_source_health_status
    check (status in ('never-run', 'healthy', 'error', 'blocked')),
  constraint sales_source_health_nonnegative_counts
    check (
      campaigns_detected >= 0
      and campaigns_upserted >= 0
      and consecutive_failures >= 0
    )
);

insert into public.sales_source_health (store_slug, source_url)
values
  ('playstation-store', 'https://blog.playstation.com/category/ps-store/'),
  ('nintendo-eshop', 'https://www.nintendo.com/us/whatsnew/'),
  ('microsoft-store', 'https://www.xbox.com/en-US/promotions/sales/sales-and-specials'),
  ('steam', 'https://partner.steamgames.com/doc/marketing/upcoming_events?l=english'),
  ('epic-games-store', 'https://egs-platform-service.store.epicgames.com/api/v2/public/content/news'),
  ('gog', 'https://www.gog.com/en/'),
  ('ea-app', 'https://www.ea.com/summer-sale?isLocalized=true'),
  ('ubisoft-store', 'https://store.ubisoft.com/us/deals'),
  ('battle-net', 'https://news.blizzard.com/en-us/api/feed/blizzard?offset=0'),
  ('rockstar-store', 'https://www.rockstargames.com/newswire?tag_id=43');

alter table public.sales_campaigns enable row level security;
alter table public.sales_source_health enable row level security;

revoke all on table public.sales_campaigns from anon, authenticated;
revoke all on table public.sales_source_health from anon, authenticated;

grant select on table public.sales_campaigns to anon, authenticated;

create policy sales_campaigns_public_read
  on public.sales_campaigns
  for select
  to anon, authenticated
  using (market = 'US' and state in ('live', 'upcoming'));

grant all on table public.sales_campaigns to service_role;
grant all on table public.sales_source_health to service_role;

comment on table public.sales_campaigns is
  'Official US store sale campaigns detected by campaign-monitoring. No product deals or catalog rows.';
comment on table public.sales_source_health is
  'Per-store adapter health for the ten canonical LoboDeals sources.';
comment on column public.sales_campaigns.starts_on is
  'Official calendar date with date-only precision; no time may be inferred.';
comment on column public.sales_campaigns.starts_at is
  'Official exact instant supplied with a timezone.';
comment on column public.sales_campaigns.ends_on is
  'Official calendar date with date-only precision; no time may be inferred.';
comment on column public.sales_campaigns.ends_at is
  'Official exact instant supplied with a timezone.';

notify pgrst, 'reload schema';
