import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

async function loadKeyValueFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')

    for (const originalLine of raw.split(/\r?\n/)) {
      const line = originalLine.trim()
      if (!line || line.startsWith('#')) continue

      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) continue

      const key = line.slice(0, separatorIndex).trim()
      let value = line.slice(separatorIndex + 1).trim()

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (!(key in process.env)) {
        process.env[key] = value
      }
    }
  } catch {
    // ignore missing file
  }
}

await loadKeyValueFile(path.resolve(process.cwd(), '.env.local'))
await loadKeyValueFile(
  path.resolve(process.cwd(), '..', 'worker-playstation-ingest', '.dev.vars')
)

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl) {
  console.error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  process.exit(1)
}

if (!secretKey) {
  console.error('Missing SUPABASE_SECRET_KEY')
  process.exit(1)
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const cutoff = new Date(Date.now() - THIRTY_DAYS_MS)

let offset = 0
const readBatchSize = 1000
const upsertBatchSize = 500
let totalCatalogRead = 0
let totalQueued = 0

function isDue(item) {
  if (!item.public_slug_enabled) return false
  if (item.region_code !== 'us') return false
  if (item.storefront !== 'playstation') return false

  if (!item.metacritic_last_synced_at) return true
  if (item.metacritic_score == null) return true
  if (item.metacritic_match_status === 'manual_review') return true
  if (item.metacritic_match_status === 'not_found') return true

  const syncedAt = new Date(item.metacritic_last_synced_at)
  if (Number.isNaN(syncedAt.getTime())) return true

  return syncedAt < cutoff
}

while (true) {
  const { data, error } = await admin
    .from('catalog_items')
    .select(`
      id,
      title,
      slug,
      region_code,
      storefront,
      public_slug_enabled,
      metacritic_last_synced_at,
      metacritic_score,
      metacritic_match_status
    `)
    .order('id', { ascending: true })
    .range(offset, offset + readBatchSize - 1)

  if (error) {
    console.error(error)
    process.exit(1)
  }

  const rows = data || []
  if (rows.length === 0) break

  totalCatalogRead += rows.length

  const dueRows = rows.filter(isDue)

  for (let i = 0; i < dueRows.length; i += upsertBatchSize) {
    const chunk = dueRows.slice(i, i + upsertBatchSize)

    const payload = chunk.map((item) => ({
      item_id: item.id,
      title_snapshot: item.title,
      slug_snapshot: item.slug,
      status: 'pending',
      attempts: 0,
      locked_by: null,
      last_error: null,
      next_attempt_at: new Date().toISOString(),
    }))

    const { error: upsertError } = await admin
      .from('metacritic_queue')
      .upsert(payload, {
        onConflict: 'item_id',
        ignoreDuplicates: false,
      })

    if (upsertError) {
      console.error(upsertError)
      process.exit(1)
    }

    totalQueued += chunk.length
  }

  offset += readBatchSize
}

console.log(`Catalog rows scanned: ${totalCatalogRead}`)
console.log(`Metacritic queue rows seeded or refreshed: ${totalQueued}`)