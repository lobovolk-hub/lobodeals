create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),

  region_code text not null default 'us',
  storefront text not null default 'playstation',

  slug text null,
  public_slug_enabled boolean not null default false,

  parent_item_id uuid null references public.catalog_items(id) on delete set null,

  catalog_kind text not null,
  store_type_label_raw text null,

  title text not null,
  store_url text not null,

  ps_store_id_type text not null,
  ps_store_primary_id text not null,

  psdeals_id bigint null,
  metacritic_score integer null,

  main_image_url text not null,

  platforms text[] not null default '{}',
  release_date date null,
  publisher text null,
  genres text[] not null default '{}',
  short_description text null,
  voice_languages text[] not null default '{}',
  screen_languages text[] not null default '{}',

  availability_state text not null,
  canonical_price_amount numeric(10,2) null,
  canonical_price_currency text null default 'USD',

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz null,

  constraint catalog_items_catalog_kind_check
    check (
      catalog_kind in (
        'game',
        'bundle',
        'dlc',
        'add_on',
        'season_pass',
        'currency',
        'demo',
        'edition',
        'other'
      )
    ),

  constraint catalog_items_availability_state_check
    check (
      availability_state in (
        'priced',
        'free_to_play',
        'demo',
        'included',
        'not_available',
        'tba'
      )
    ),

  constraint catalog_items_ps_store_id_type_check
    check (
      ps_store_id_type in (
        'concept',
        'product'
      )
    ),

  constraint catalog_items_currency_check
    check (
      canonical_price_currency is null
      or length(canonical_price_currency) = 3
    ),

  constraint catalog_items_public_slug_rule_check
    check (
      (public_slug_enabled = true and slug is not null)
      or (public_slug_enabled = false)
    )
);

create unique index if not exists catalog_items_slug_unique_idx
  on public.catalog_items (region_code, storefront, lower(slug))
  where slug is not null;

create unique index if not exists catalog_items_store_url_unique_idx
  on public.catalog_items (store_url);

create unique index if not exists catalog_items_ps_store_unique_idx
  on public.catalog_items (ps_store_id_type, ps_store_primary_id, region_code);

create index if not exists catalog_items_parent_item_idx
  on public.catalog_items (parent_item_id);

create index if not exists catalog_items_public_kind_idx
  on public.catalog_items (public_slug_enabled, catalog_kind);

create index if not exists catalog_items_release_date_idx
  on public.catalog_items (release_date desc);

create index if not exists catalog_items_metacritic_idx
  on public.catalog_items (metacritic_score desc);

create trigger trg_catalog_items_set_updated_at
before update on public.catalog_items
for each row
execute function public.set_updated_at();

create table if not exists public.item_price_snapshots (
  id uuid primary key default gen_random_uuid(),

  item_id uuid not null references public.catalog_items(id) on delete cascade,

  captured_at timestamptz not null default now(),

  price_amount numeric(10,2) null,
  currency_code text null default 'USD',
  availability_state text not null,
  is_base_price boolean not null default false,

  source_name text not null,
  source_note text null,

  created_at timestamptz not null default now(),

  constraint item_price_snapshots_availability_state_check
    check (
      availability_state in (
        'priced',
        'free_to_play',
        'demo',
        'included',
        'not_available',
        'tba'
      )
    ),

  constraint item_price_snapshots_source_name_check
    check (
      source_name in (
        'playstation_store',
        'psdeals_backfill',
        'internal'
      )
    ),

  constraint item_price_snapshots_currency_check
    check (
      currency_code is null
      or length(currency_code) = 3
    )
);

create index if not exists item_price_snapshots_item_captured_idx
  on public.item_price_snapshots (item_id, captured_at desc);

create table if not exists public.user_tracked_items (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null,
  item_id uuid not null references public.catalog_items(id) on delete cascade,

  created_at timestamptz not null default now(),

  constraint user_tracked_items_unique_user_item
    unique (user_id, item_id)
);

create index if not exists user_tracked_items_item_idx
  on public.user_tracked_items (item_id);

create table if not exists public.catalog_public_cache (
  item_id uuid primary key references public.catalog_items(id) on delete cascade,

  region_code text not null,
  storefront text not null,
  slug text not null,
  title text not null,
  main_image_url text not null,

  platforms text[] not null default '{}',
  release_date date null,
  publisher text null,
  genres text[] not null default '{}',

  availability_state text not null,
  canonical_price_amount numeric(10,2) null,
  canonical_price_currency text null default 'USD',

  metacritic_score integer null,

  updated_at timestamptz not null default now(),

  constraint catalog_public_cache_availability_state_check
    check (
      availability_state in (
        'priced',
        'free_to_play',
        'demo',
        'included',
        'not_available',
        'tba'
      )
    )
);

create index if not exists catalog_public_cache_slug_idx
  on public.catalog_public_cache (region_code, storefront, lower(slug));

create index if not exists catalog_public_cache_release_date_idx
  on public.catalog_public_cache (release_date desc);

create index if not exists catalog_public_cache_metacritic_idx
  on public.catalog_public_cache (metacritic_score desc);