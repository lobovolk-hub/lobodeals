import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs/promises'
import path from 'node:path'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const inputArg = process.argv[2]

if (!inputArg) {
  console.error('Usage: node scripts/import-catalog-items.mjs <path-to-json>')
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL in .env.local')
  process.exit(1)
}

if (!secretKey) {
  console.error('Missing SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

const inputPath = path.resolve(process.cwd(), inputArg)
const raw = await fs.readFile(inputPath, 'utf8')
const parsed = JSON.parse(raw)

const items = Array.isArray(parsed) ? parsed : parsed.items

if (!Array.isArray(items) || items.length === 0) {
  console.error('The JSON file must contain a non-empty array or an { items: [] } object.')
  process.exit(1)
}

const VALID_AVAILABILITY = new Set([
  'priced',
  'free_to_play',
  'demo',
  'included',
  'not_available',
  'tba',
])

const VALID_CATALOG_KIND = new Set([
  'game',
  'bundle',
  'dlc',
  'add_on',
  'season_pass',
  'currency',
  'demo',
  'edition',
  'other',
])

const VALID_ID_TYPE = new Set(['concept', 'product'])

function toText(value, fieldName, index) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Item ${index + 1}: "${fieldName}" must be a non-empty string.`)
  }
  return value.trim()
}

function toNullableText(value) {
  if (value === null || value === undefined || value === '') return null
  return String(value).trim()
}

function toTextArray(value, fieldName, index) {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) {
    throw new Error(`Item ${index + 1}: "${fieldName}" must be an array.`)
  }
  return [...new Set(value.map((v) => String(v).trim()).filter(Boolean))]
}

function toNullableDate(value, fieldName, index) {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Item ${index + 1}: "${fieldName}" must be YYYY-MM-DD or null.`)
  }
  return text
}

function toNullableNumber(value, fieldName, index) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) {
    throw new Error(`Item ${index + 1}: "${fieldName}" must be a valid number or null.`)
  }
  return num
}

const normalizedItems = items.map((item, index) => {
  const regionCode = toText(item.region_code ?? 'us', 'region_code', index).toLowerCase()
  const storefront = toText(item.storefront ?? 'playstation', 'storefront', index).toLowerCase()
  const slug = toText(item.slug, 'slug', index).toLowerCase()
  const title = toText(item.title, 'title', index)
  const storeUrl = toText(item.store_url, 'store_url', index)
  const psStoreIdType = toText(item.ps_store_id_type, 'ps_store_id_type', index).toLowerCase()
  const psStorePrimaryId = toText(item.ps_store_primary_id, 'ps_store_primary_id', index)
  const mainImageUrl = toText(item.main_image_url, 'main_image_url', index)
  const availabilityState = toText(item.availability_state, 'availability_state', index).toLowerCase()
  const catalogKind = toText(item.catalog_kind ?? 'game', 'catalog_kind', index).toLowerCase()

  if (!VALID_ID_TYPE.has(psStoreIdType)) {
    throw new Error(`Item ${index + 1}: invalid ps_store_id_type "${psStoreIdType}".`)
  }

  if (!VALID_AVAILABILITY.has(availabilityState)) {
    throw new Error(`Item ${index + 1}: invalid availability_state "${availabilityState}".`)
  }

  if (!VALID_CATALOG_KIND.has(catalogKind)) {
    throw new Error(`Item ${index + 1}: invalid catalog_kind "${catalogKind}".`)
  }

  return {
    region_code: regionCode,
    storefront,
    slug,
    public_slug_enabled: item.public_slug_enabled ?? true,
    parent_item_id: item.parent_item_id ?? null,
    catalog_kind: catalogKind,
    store_type_label_raw: toNullableText(item.store_type_label_raw),
    title,
    store_url: storeUrl,
    ps_store_id_type: psStoreIdType,
    ps_store_primary_id: psStorePrimaryId,
    psdeals_id: item.psdeals_id ?? null,
    metacritic_score: item.metacritic_score ?? null,
    main_image_url: mainImageUrl,
    platforms: toTextArray(item.platforms, 'platforms', index),
    release_date: toNullableDate(item.release_date, 'release_date', index),
    publisher: toNullableText(item.publisher),
    genres: toTextArray(item.genres, 'genres', index),
    short_description: toNullableText(item.short_description),
    voice_languages: toTextArray(item.voice_languages, 'voice_languages', index),
    screen_languages: toTextArray(item.screen_languages, 'screen_languages', index),
    availability_state: availabilityState,
    canonical_price_amount: toNullableNumber(
      item.canonical_price_amount,
      'canonical_price_amount',
      index
    ),
    canonical_price_currency: toNullableText(item.canonical_price_currency ?? 'USD'),
    is_active: item.is_active ?? true,
    last_synced_at: new Date().toISOString(),
  }
})

const { data: upsertedItems, error: upsertError } = await admin
  .from('catalog_items')
  .upsert(normalizedItems, {
    onConflict: 'ps_store_id_type,ps_store_primary_id,region_code',
    ignoreDuplicates: false,
  })
  .select(
    'id, slug, title, canonical_price_amount, canonical_price_currency, availability_state'
  )

if (upsertError) {
  console.error('Catalog upsert failed:')
  console.error(upsertError)
  process.exit(1)
}

let snapshotsInserted = 0

for (const row of upsertedItems ?? []) {
  const { data: latestSnapshot, error: latestError } = await admin
    .from('item_price_snapshots')
    .select(
      'price_amount, currency_code, availability_state, is_base_price, source_name'
    )
    .eq('item_id', row.id)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) {
    console.error(`Failed to read latest snapshot for ${row.title}:`)
    console.error(latestError)
    process.exit(1)
  }

  const isSameAsLatest =
    latestSnapshot &&
    Number(latestSnapshot.price_amount ?? null) === Number(row.canonical_price_amount ?? null) &&
    (latestSnapshot.currency_code ?? null) === (row.canonical_price_currency ?? null) &&
    latestSnapshot.availability_state === row.availability_state &&
    latestSnapshot.is_base_price === true &&
    latestSnapshot.source_name === 'internal'

  if (!isSameAsLatest) {
    const { error: snapshotError } = await admin
      .from('item_price_snapshots')
      .insert({
        item_id: row.id,
        captured_at: new Date().toISOString(),
        price_amount: row.canonical_price_amount,
        currency_code: row.canonical_price_currency,
        availability_state: row.availability_state,
        is_base_price: true,
        source_name: 'internal',
        source_note: `Manual import from ${path.basename(inputPath)}`,
      })

    if (snapshotError) {
      console.error(`Failed to insert snapshot for ${row.title}:`)
      console.error(snapshotError)
      process.exit(1)
    }

    snapshotsInserted += 1
  }
}

console.log('Import completed successfully.')
console.log(`Items processed: ${upsertedItems?.length ?? 0}`)
console.log(`Snapshots inserted: ${snapshotsInserted}`)
console.log('Processed titles:')
for (const row of upsertedItems ?? []) {
  console.log(`- ${row.title}`)
}