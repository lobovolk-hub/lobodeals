import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : 5

if (!Number.isFinite(limit) || limit <= 0) {
  console.error('Invalid --limit value. Example: --limit=5')
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

function cleanText(value) {
  if (!value) return null
  return String(value)
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function firstMatch(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return cleanText(match[1])
    }
  }
  return null
}

function extractMetaContent(html, attr, name) {
  const safeName = escapeRegExp(name)
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${safeName}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${safeName}["']`, 'i'),
  ]
  return firstMatch(html, patterns)
}

function extractTitle(html) {
  return (
    extractMetaContent(html, 'property', 'og:title') ||
    extractMetaContent(html, 'name', 'twitter:title') ||
    firstMatch(html, [/<title>([^<]+)<\/title>/i])
  )
}

function extractDescription(html) {
  return (
    extractMetaContent(html, 'property', 'og:description') ||
    extractMetaContent(html, 'name', 'description') ||
    extractMetaContent(html, 'name', 'twitter:description')
  )
}

function extractMasterImage(html) {
  return (
    firstMatch(html, [
      /"role":"MASTER","type":"IMAGE","url":"([^"]+)"/i,
      /"type":"IMAGE","role":"MASTER","url":"([^"]+)"/i,
    ]) ||
    extractMetaContent(html, 'property', 'og:image')
  )
}

function extractDate(html) {
  return (
    firstMatch(html, [
      /"releaseDate":"(\d{4}-\d{2}-\d{2})"/i,
      /"release_date":"(\d{4}-\d{2}-\d{2})"/i,
      /"datePublished":"(\d{4}-\d{2}-\d{2})"/i,
    ]) || null
  )
}

function extractPriceAmount(html) {
  const directMeta =
    extractMetaContent(html, 'property', 'product:price:amount') ||
    extractMetaContent(html, 'name', 'product:price:amount')

  if (directMeta) {
    const num = Number(directMeta)
    return Number.isFinite(num) ? num : null
  }

  const regexPatterns = [
    /"basePrice"[^0-9]{0,40}([0-9]+(?:\.[0-9]{2})?)/i,
    /"price"[^0-9]{0,40}([0-9]+(?:\.[0-9]{2})?)/i,
  ]

  for (const pattern of regexPatterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      const num = Number(match[1])
      if (Number.isFinite(num)) return num
    }
  }

  return null
}

function extractCurrency(html) {
  return (
    extractMetaContent(html, 'property', 'product:price:currency') ||
    extractMetaContent(html, 'name', 'product:price:currency') ||
    'USD'
  )
}

function inferAvailabilityState(html, extractedPrice, existingState) {
  if (extractedPrice !== null) return 'priced'

  if (/Free Demo/i.test(html)) return 'demo'
  if (/Free to Play/i.test(html)) return 'free_to_play'
  if (/Not available for purchase/i.test(html)) return 'not_available'
  if (/\bTBA\b/i.test(html)) return 'tba'

  return existingState
}

function inferPlatforms(html, existingPlatforms) {
  const found = []
  if (/\bPS5\b/.test(html)) found.push('PS5')
  if (/\bPS4\b/.test(html)) found.push('PS4')

  if (found.length > 0) {
    return [...new Set(found)]
  }

  return Array.isArray(existingPlatforms) ? existingPlatforms : []
}

function extractPublisher(html, existingPublisher) {
  const publisher =
    firstMatch(html, [
      /"publisherName":"([^"]+)"/i,
      /"publisher":"([^"]+)"/i,
      /"brand":"([^"]+)"/i,
    ]) || null

  return publisher || existingPublisher || null
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((v) => String(v).trim()).filter(Boolean))]
}

function summarizeError(error) {
  if (!error) return 'Unknown error'
  if (error instanceof Error) return error.message
  return String(error)
}

const { data: runRow, error: runInsertError } = await admin
  .from('automation_runs')
  .insert({
    runner_name: 'collect_playstation_queue',
    mode: 'local_manual',
    status: 'started',
    notes: `Limit ${limit}`,
  })
  .select('id')
  .single()

if (runInsertError || !runRow) {
  console.error('Failed to create automation run:')
  console.error(runInsertError)
  process.exit(1)
}

const runId = runRow.id

const nowIso = new Date().toISOString()

const { data: queueRows, error: queueError } = await admin
  .from('ps_ingest_queue')
  .select(`
    id,
    region_code,
    storefront,
    store_url,
    ps_store_id_type,
    ps_store_primary_id,
    status,
    attempts
  `)
  .eq('status', 'pending')
  .lte('next_attempt_at', nowIso)
  .order('priority', { ascending: true })
  .order('created_at', { ascending: true })
  .limit(limit)

if (queueError) {
  console.error('Failed to read queue:')
  console.error(queueError)

  await admin
    .from('automation_runs')
    .update({
      status: 'failed',
      notes: summarizeError(queueError),
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)

  process.exit(1)
}

const claimedRows = queueRows ?? []

if (claimedRows.length === 0) {
  await admin
    .from('automation_runs')
    .update({
      status: 'succeeded',
      notes: 'No pending items found.',
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)

  console.log('No pending queue items found.')
  process.exit(0)
}

for (const row of claimedRows) {
  await admin
    .from('ps_ingest_queue')
    .update({
      status: 'processing',
      locked_by: runId,
      attempts: (row.attempts ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
    })
    .eq('id', row.id)
}

let itemsSucceeded = 0
let itemsFailed = 0

for (const row of claimedRows) {
  try {
    const { data: existingItem, error: existingError } = await admin
      .from('catalog_items')
      .select(`
        id,
        slug,
        title,
        store_type_label_raw,
        publisher,
        genres,
        short_description,
        voice_languages,
        screen_languages,
        platforms,
        availability_state,
        canonical_price_amount,
        canonical_price_currency,
        public_slug_enabled,
        catalog_kind,
        is_active
      `)
      .eq('region_code', row.region_code)
      .eq('storefront', row.storefront)
      .eq('ps_store_id_type', row.ps_store_id_type)
      .eq('ps_store_primary_id', row.ps_store_primary_id)
      .maybeSingle()

    if (existingError || !existingItem) {
      throw new Error(`Catalog item not found for ${row.store_url}`)
    }

    const response = await fetch(row.store_url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
    })

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`)
    }

    const html = await response.text()

    const extractedTitle = extractTitle(html)
    const extractedDescription = extractDescription(html)
    const extractedImage = extractMasterImage(html)
    const extractedDate = extractDate(html)
    const extractedPrice = extractPriceAmount(html)
    const extractedCurrency = extractCurrency(html)
    const inferredAvailability = inferAvailabilityState(
      html,
      extractedPrice,
      existingItem.availability_state
    )
    const inferredPlatforms = inferPlatforms(html, existingItem.platforms)
    const inferredPublisher = extractPublisher(html, existingItem.publisher)

    if (!extractedImage) {
      throw new Error('MASTER image could not be extracted.')
    }

    const payload = {
      region_code: row.region_code,
      storefront: row.storefront,
      slug: existingItem.slug,
      public_slug_enabled: existingItem.public_slug_enabled,
      parent_item_id: null,
      catalog_kind: existingItem.catalog_kind,
      store_type_label_raw: existingItem.store_type_label_raw,
      title: extractedTitle || existingItem.title,
      store_url: row.store_url,
      ps_store_id_type: row.ps_store_id_type,
      ps_store_primary_id: row.ps_store_primary_id,
      psdeals_id: null,
      metacritic_score: null,
      main_image_url: extractedImage,
      platforms: uniqueStrings(inferredPlatforms),
      release_date: extractedDate || null,
      publisher: inferredPublisher,
      genres: Array.isArray(existingItem.genres) ? existingItem.genres : [],
      short_description: extractedDescription || existingItem.short_description,
      voice_languages: Array.isArray(existingItem.voice_languages)
        ? existingItem.voice_languages
        : [],
      screen_languages: Array.isArray(existingItem.screen_languages)
        ? existingItem.screen_languages
        : [],
      availability_state: inferredAvailability,
      canonical_price_amount:
        extractedPrice !== null ? extractedPrice : existingItem.canonical_price_amount,
      canonical_price_currency:
        extractedPrice !== null
          ? extractedCurrency || 'USD'
          : existingItem.canonical_price_currency || 'USD',
      is_active: existingItem.is_active ?? true,
      last_synced_at: new Date().toISOString(),
    }

    const { data: upsertedRows, error: upsertError } = await admin
      .from('catalog_items')
      .upsert(payload, {
        onConflict: 'ps_store_id_type,ps_store_primary_id,region_code',
        ignoreDuplicates: false,
      })
      .select(
        'id, title, canonical_price_amount, canonical_price_currency, availability_state'
      )

    if (upsertError || !upsertedRows || upsertedRows.length === 0) {
      throw upsertError || new Error('Catalog upsert failed without returned row.')
    }

    const saved = upsertedRows[0]

    const { data: latestSnapshot, error: latestSnapshotError } = await admin
      .from('item_price_snapshots')
      .select(
        'price_amount, currency_code, availability_state, is_base_price, source_name'
      )
      .eq('item_id', saved.id)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestSnapshotError) {
      throw latestSnapshotError
    }

    const shouldInsertSnapshot =
      saved.canonical_price_amount !== null &&
      (!latestSnapshot ||
        Number(latestSnapshot.price_amount ?? null) !==
          Number(saved.canonical_price_amount ?? null) ||
        (latestSnapshot.currency_code ?? null) !==
          (saved.canonical_price_currency ?? null) ||
        latestSnapshot.availability_state !== saved.availability_state ||
        latestSnapshot.is_base_price !== true ||
        latestSnapshot.source_name !== 'internal')

    if (shouldInsertSnapshot) {
      const { error: snapshotError } = await admin
        .from('item_price_snapshots')
        .insert({
          item_id: saved.id,
          captured_at: new Date().toISOString(),
          price_amount: saved.canonical_price_amount,
          currency_code: saved.canonical_price_currency || 'USD',
          availability_state: saved.availability_state,
          is_base_price: true,
          source_name: 'internal',
          source_note: 'PlayStation queue collector',
        })

      if (snapshotError) {
        throw snapshotError
      }
    }

    await admin
      .from('ps_ingest_queue')
      .update({
        status: 'done',
        locked_by: null,
        last_success_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', row.id)

    itemsSucceeded += 1
    console.log(`OK: ${saved.title}`)
  } catch (error) {
    const message = summarizeError(error)

    await admin
      .from('ps_ingest_queue')
      .update({
        status: 'failed',
        locked_by: null,
        last_error: message,
        next_attempt_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .eq('id', row.id)

    itemsFailed += 1
    console.error(`FAILED: ${row.store_url}`)
    console.error(message)
  }
}

await admin
  .from('automation_runs')
  .update({
    status: itemsFailed > 0 ? 'failed' : 'succeeded',
    items_claimed: claimedRows.length,
    items_succeeded: itemsSucceeded,
    items_failed: itemsFailed,
    notes: `Processed ${claimedRows.length} queue items.`,
    finished_at: new Date().toISOString(),
  })
  .eq('id', runId)

console.log('Collector finished.')
console.log(`Claimed: ${claimedRows.length}`)
console.log(`Succeeded: ${itemsSucceeded}`)
console.log(`Failed: ${itemsFailed}`)
console.log(`Run ID: ${runId}`)