import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs/promises'
import path from 'node:path'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const outputArg = process.argv[2]

if (!outputArg) {
  console.error('Usage: node scripts/export-catalog-items.mjs <output-json-path>')
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

const outputPath = path.resolve(process.cwd(), outputArg)

const { data, error } = await admin
  .from('catalog_items')
  .select(`
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
    is_active
  `)
  .eq('region_code', 'us')
  .eq('storefront', 'playstation')
  .order('title', { ascending: true })

if (error) {
  console.error('Export failed:')
  console.error(error)
  process.exit(1)
}

const payload = {
  items: data ?? [],
}

await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8')

console.log('Export completed successfully.')
console.log(`Items exported: ${data?.length ?? 0}`)
console.log(`Output file: ${outputPath}`)