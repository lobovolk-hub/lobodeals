import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

async function loadDevVars() {
  const devVarsPath = path.resolve(process.cwd(), '.dev.vars')
  const raw = await fs.readFile(devVarsPath, 'utf8')

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

    process.env[key] = value
  }
}

await loadDevVars()

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : 25

if (!Number.isFinite(limit) || limit <= 0) {
  console.error('Invalid --limit value. Example: --limit=25')
  process.exit(1)
}

const supabaseUrl = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl) {
  console.error('Missing SUPABASE_URL in .dev.vars')
  process.exit(1)
}

if (!secretKey) {
  console.error('Missing SUPABASE_SECRET_KEY in .dev.vars')
  process.exit(1)
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
}

function cleanText(value) {
  if (!value) return null
  return decodeHtmlEntities(
    String(value)
      .replace(/\\u002F/g, '/')
      .replace(/\\\//g, '/')
  )
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
  const raw =
    extractMetaContent(html, 'property', 'og:title') ||
    extractMetaContent(html, 'name', 'twitter:title') ||
    firstMatch(html, [/<title>([^<]+)<\/title>/i])

  if (!raw) return null

  return raw
    .replace(/\s*\|\s*Official PlayStation™Store US.*$/i, '')
    .trim()
}

function extractDescription(html) {
  const shortDescription =
    firstMatch(html, [
      /"__typename":"Description","type":"SHORT","subType":"NONE","value":"((?:\\.|[^"])*)"/i,
      /"type":"SHORT","subType":"NONE","value":"((?:\\.|[^"])*)"/i,
      /"type":"SHORT","value":"((?:\\.|[^"])*)"/i,
    ]) || null

  if (shortDescription) return shortDescription

  return (
    extractMetaContent(html, 'property', 'og:description') ||
    extractMetaContent(html, 'name', 'description') ||
    extractMetaContent(html, 'name', 'twitter:description')
  )
}

function extractCanonicalImage(html) {
  return (
    firstMatch(html, [
      /"image":"((?:\\.|[^"])*)"/i,
    ]) || null
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

function extractCurrency(html) {
  return (
    extractMetaContent(html, 'property', 'product:price:currency') ||
    extractMetaContent(html, 'name', 'product:price:currency') ||
    'USD'
  )
}

function extractOriginalPriceFormatted(html) {
  return (
    firstMatch(html, [
      /"originalPriceFormatted":"([^"]+)"/i,
    ]) || null
  )
}

function parseOriginalPriceFormatted(value) {
  if (!value) {
    return { amount: null, availability: null }
  }

  const cleaned = value.trim()

  if (/^Free$/i.test(cleaned)) {
    return { amount: 0, availability: 'free_to_play' }
  }

  const numeric = cleaned.replace(/[^0-9.,]/g, '').replace(/,/g, '')
  const amount = Number(numeric)

  if (Number.isFinite(amount)) {
    return { amount, availability: 'priced' }
  }

  return { amount: null, availability: null }
}

function stripHtmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function extractHeroPrice(html, extractedTitle) {
  const text = stripHtmlToText(html)

  if (!extractedTitle) {
    return { amount: null, availability: null }
  }

  const titleIndex = text.indexOf(extractedTitle)
  if (titleIndex === -1) {
    return { amount: null, availability: null }
  }

  const heroWindow = text.slice(titleIndex, titleIndex + 1200)

  if (/\bFree\b/i.test(heroWindow)) {
    return { amount: 0, availability: 'free_to_play' }
  }

  const match = heroWindow.match(/\$([0-9]+(?:\.[0-9]{2})?)/)
  if (match?.[1]) {
    return {
      amount: Number(match[1]),
      availability: 'priced',
    }
  }

  return { amount: null, availability: null }
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
  return found.length ? [...new Set(found)] : existingPlatforms
}

function extractPublisher(html, existingPublisher) {
  return (
    firstMatch(html, [
      /"publisherName":"([^"]+)"/i,
      /"publisher":"([^"]+)"/i,
      /"brand":"([^"]+)"/i,
    ]) ||
    existingPublisher ||
    null
  )
}

function summarizeError(error) {
  if (!error) return 'Unknown error'
  if (error instanceof Error) return error.message

  if (typeof error === 'object') {
    const maybe = error
    const parts = []

    if (maybe.code) parts.push(`code=${String(maybe.code)}`)
    if (maybe.message) parts.push(`message=${String(maybe.message)}`)
    if (maybe.details) parts.push(`details=${String(maybe.details)}`)
    if (maybe.hint) parts.push(`hint=${String(maybe.hint)}`)

    if (parts.length > 0) return parts.join(' | ')

    try {
      return JSON.stringify(error)
    } catch {
      return '[unserializable object error]'
    }
  }

  return String(error)
}

function slugify(input) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/™|®/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .toLowerCase()
}

async function ensureUniqueSlug(admin, slugBase, regionCode, storefront, currentId) {
  let candidate = slugBase
  let attempt = 1

  while (true) {
    const { data, error } = await admin
      .from('catalog_items')
      .select('id')
      .eq('region_code', regionCode)
      .eq('storefront', storefront)
      .eq('slug', candidate)
      .maybeSingle()

    if (error) throw error
    if (!data || data.id === currentId) return candidate

    candidate = `${slugBase}-${attempt}`
    attempt += 1
  }
}

async function setQueueStatus(admin, queueId, values) {
  const { error } = await admin
    .from('ps_ingest_queue')
    .update(values)
    .eq('id', queueId)

  if (error) {
    throw new Error(`Queue status update failed: ${summarizeError(error)}`)
  }
}

async function buildCatalogPayloadFromPage(admin, row, html, existingItem) {
  const extractedTitle = extractTitle(html)
  const extractedDescription = extractDescription(html)
  const extractedImage = extractCanonicalImage(html)
  const extractedDate = extractDate(html)

  const heroPrice = extractHeroPrice(html, extractedTitle)
  const originalPriceFormatted = extractOriginalPriceFormatted(html)
  const parsedOriginalPrice = parseOriginalPriceFormatted(originalPriceFormatted)

  const extractedPrice =
    heroPrice.amount !== null ? heroPrice.amount : parsedOriginalPrice.amount

  const extractedCurrency = extractCurrency(html)

  const inferredAvailability =
    heroPrice.availability ||
    parsedOriginalPrice.availability ||
    inferAvailabilityState(
      html,
      extractedPrice,
      existingItem?.availability_state || 'priced'
    )

  const inferredPlatforms = inferPlatforms(html, existingItem?.platforms || [])
  const inferredPublisher = extractPublisher(html, existingItem?.publisher || null)

  if (!extractedImage) {
    throw new Error('Canonical image could not be extracted from "image".')
  }

  const safeTitle =
    extractedTitle ||
    existingItem?.title ||
    row.ps_store_primary_id

  const slugBase = slugify(safeTitle) || row.ps_store_primary_id.toLowerCase()

  const slug = await ensureUniqueSlug(
    admin,
    existingItem?.slug || slugBase,
    row.region_code,
    row.storefront,
    existingItem?.id
  )

  return {
    region_code: row.region_code,
    storefront: row.storefront,
    slug,
    public_slug_enabled: existingItem?.public_slug_enabled ?? true,
    parent_item_id: null,
    catalog_kind: existingItem?.catalog_kind || 'game',
    store_type_label_raw: existingItem?.store_type_label_raw || 'Standard Edition',
    title: safeTitle,
    store_url: row.store_url,
    ps_store_id_type: row.ps_store_id_type,
    ps_store_primary_id: row.ps_store_primary_id,
    psdeals_id: null,
    metacritic_score: null,
    main_image_url: extractedImage,
    platforms: [...new Set((inferredPlatforms || []).map(String))],
    release_date: extractedDate || null,
    publisher: inferredPublisher,
    genres: Array.isArray(existingItem?.genres) ? existingItem.genres : [],
    short_description: extractedDescription || existingItem?.short_description || null,
    voice_languages: Array.isArray(existingItem?.voice_languages)
      ? existingItem.voice_languages
      : [],
    screen_languages: Array.isArray(existingItem?.screen_languages)
      ? existingItem.screen_languages
      : [],
    availability_state: inferredAvailability,
    canonical_price_amount:
      extractedPrice !== null
        ? extractedPrice
        : existingItem?.canonical_price_amount ?? null,
    canonical_price_currency:
      extractedPrice !== null
        ? extractedCurrency || 'USD'
        : existingItem?.canonical_price_currency || 'USD',
    is_active: existingItem?.is_active ?? true,
    last_synced_at: new Date().toISOString(),
  }
}

const { data: runRow, error: runInsertError } = await admin
  .from('automation_runs')
  .insert({
    runner_name: 'collect_playstation_queue_local',
    mode: 'node_local',
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

try {
  const { data: queueRows, error: queueError } = await admin
    .from('ps_ingest_queue')
    .select(`
      id,
      region_code,
      storefront,
      store_url,
      ps_store_id_type,
      ps_store_primary_id,
      attempts
    `)
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (queueError) throw queueError

  const claimedRows = queueRows || []

  if (claimedRows.length === 0) {
    await admin
      .from('automation_runs')
      .update({
        status: 'succeeded',
        items_claimed: 0,
        items_succeeded: 0,
        items_failed: 0,
        notes: 'No pending items found.',
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId)

    console.log('No pending items found.')
    process.exit(0)
  }

  for (const row of claimedRows) {
    await setQueueStatus(admin, row.id, {
      status: 'processing',
      locked_by: runId,
      attempts: (row.attempts ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
    })
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

      if (existingError) throw existingError

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

      const payload = await buildCatalogPayloadFromPage(
        admin,
        row,
        html,
        existingItem || null
      )

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

      if (latestSnapshotError) throw latestSnapshotError

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
            source_note: 'PlayStation queue collector local',
          })

        if (snapshotError) throw snapshotError
      }

      await setQueueStatus(admin, row.id, {
        status: 'done',
        locked_by: null,
        last_success_at: new Date().toISOString(),
        last_error: null,
      })

      itemsSucceeded += 1
      console.log(`OK: ${saved.title}`)
    } catch (error) {
      const message = summarizeError(error)

      try {
        await setQueueStatus(admin, row.id, {
          status: 'failed',
          locked_by: null,
          last_error: message,
          next_attempt_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
      } catch (queueUpdateError) {
        console.error(`FAILED: ${row.store_url}`)
        console.error(`${message} | secondary queue update error: ${summarizeError(queueUpdateError)}`)
        itemsFailed += 1
        continue
      }

      console.error(`FAILED: ${row.store_url}`)
      console.error(message)
      itemsFailed += 1
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
} catch (error) {
  const message = summarizeError(error)

  await admin
    .from('automation_runs')
    .update({
      status: 'failed',
      notes: message,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)

  console.error('Collector crashed:')
  console.error(message)
  process.exit(1)
}