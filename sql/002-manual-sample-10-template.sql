-- Manual sample import template for LoboDeals 1.0
-- Use one block per item.
-- public_slug_enabled = true only for items that already deserve a public page.

with inserted_item as (
  insert into public.catalog_items (
    region_code,
    storefront,
    slug,
    public_slug_enabled,
    parent_item_id,
    catalog_kind,
    store_type_label_raw,
    title,
    store_url,
    ps_store_id_type,
    ps_store_primary_id,
    psdeals_id,
    metacritic_url,
    metacritic_score,
    main_image_url,
    platforms,
    release_date,
    publisher,
    genres,
    short_description,
    voice_languages,
    screen_languages,
    availability_state,
    canonical_price_amount,
    canonical_price_currency,
    is_active,
    last_synced_at
  )
  values (
    'us',
    'playstation',
    '<slug>',
    true,
    null,
    'game',
    '<store_type_label_raw>',
    '<title>',
    '<store_url>',
    '<concept_or_product>',
    '<ps_store_primary_id>',
    null,
    null,
    null,
    '<main_image_url>',
    array['PS4'],
    null,
    '<publisher>',
    array['<genre_1>'],
    '<short_description>',
    array[]::text[],
    array[]::text[],
    'tba',
    null,
    'USD',
    true,
    now()
  )
  returning id
)
insert into public.item_price_snapshots (
  item_id,
  captured_at,
  price_amount,
  currency_code,
  availability_state,
  is_base_price,
  source_name,
  source_note
)
select
  id,
  now(),
  null,
  'USD',
  'tba',
  true,
  'playstation_store',
  'initial manual sample import'
from inserted_item;