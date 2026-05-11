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

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : 10

if (!Number.isFinite(limit) || limit <= 0) {
  console.error('Invalid --limit value. Example: --limit=10')
  process.exit(1)
}

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

function nowIso() {
  return new Date().toISOString()
}

function summarizeError(error) {
  if (!error) return 'Unknown error'
  if (error instanceof Error) return error.message

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function decodeHtmlEntities(text) {
  return String(text || '')
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

function parseMoneyString(value) {
  if (!value) return null
  const cleaned = String(value).replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeMoneyNumber(value) {
  if (value == null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null

  if (parsed >= 1000 && Number.isInteger(parsed)) {
    return Number((parsed / 100).toFixed(2))
  }

  return Number(parsed.toFixed(2))
}

function parseDiscountPercent(value) {
  if (!value) return null
  const match = String(value).match(/-?(\d{1,3})%/)
  if (!match?.[1]) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

function extractString(source, key) {
  const regex = new RegExp(`"${key}":"((?:\\\\.|[^"])*)"`, 'i')
  const match = source.match(regex)
  return match?.[1] ? decodeHtmlEntities(match[1]) : null
}

function extractNumber(source, key) {
  const regex = new RegExp(`"${key}":(-?\\d+(?:\\.\\d+)?)`, 'i')
  const match = source.match(regex)
  if (!match?.[1]) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

function extractStringArray(source, key) {
  const regex = new RegExp(`"${key}":\\[(.*?)\\]`, 'i')
  const match = source.match(regex)
  if (!match?.[1]) return []

  const raw = match[1]
  const values = [...raw.matchAll(/"((?:\\.|[^"])*)"/g)].map((m) =>
    decodeHtmlEntities(m[1])
  )

  return values
}

function extractJsonLdOffer(html) {
  const match = html.match(
    /<script id="mfe-jsonld-tags" type="application\/ld\+json">([\s\S]*?)<\/script>/i
  )
  if (!match?.[1]) {
    return {
      price: null,
      currency: 'USD',
    }
  }

  try {
    const parsed = JSON.parse(match[1])
    return {
      price: Number.isFinite(Number(parsed?.offers?.price))
        ? Number(parsed.offers.price)
        : null,
      currency: parsed?.offers?.priceCurrency || 'USD',
    }
  } catch {
    return {
      price: null,
      currency: 'USD',
    }
  }
}

function collectOfferWindows(html) {
  const markers = [
    '"discountText"',
    '"offerLabel"',
    '"offerBranding"',
    '"serviceBranding"',
    '"basePrice"',
    '"discountedPrice"',
    '"basePriceValue"',
    '"discountedValue"',
    '"UPSELL_PS_PLUS_DISCOUNT"',
    '"PS_PLUS"',
  ]

  const windows = []
  const seen = new Set()

  for (const marker of markers) {
    let searchFrom = 0

    while (true) {
      const index = html.indexOf(marker, searchFrom)
      if (index === -1) break

      const start = Math.max(0, index - 1000)
      const end = Math.min(html.length, index + 1600)
      const key = `${start}:${end}`

      if (!seen.has(key)) {
        seen.add(key)
        windows.push(html.slice(start, end))
      }

      searchFrom = index + marker.length
    }
  }

  return windows
}

function parseStoreTimestamp(value) {
  if (value == null || value === '') return null

  const raw = String(value).trim()

  if (/^\d{13}$/.test(raw)) {
    const parsed = new Date(Number(raw))
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  if (/^\d{10}$/.test(raw)) {
    const parsed = new Date(Number(raw) * 1000)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function isReasonableOfferCandidate(candidate, canonicalPriceAmount) {
  if (!candidate) return false

  const base = candidate.basePriceValue
  const discounted = candidate.discountedValue
  const canonical = Number(canonicalPriceAmount)

  if (base == null || discounted == null) return false
  if (!(discounted < base)) return false

  // Reject free/near-free weird captures in this phase
  if (discounted <= 0) return false

  // If canonical price is missing, only apply structural checks
  if (!Number.isFinite(canonical) || canonical <= 0) {
    return true
  }

  // Base price must be reasonably close to the canonical/base item price
  const ratio = base / canonical

  // Conservative tolerance for this validation phase
  return ratio >= 0.75 && ratio <= 1.25
}

function parseOfferCandidate(windowText, fallbackCurrency, fallbackBasePrice) {
  const offerLabel = extractString(windowText, 'offerLabel')
  const offerBranding = extractString(windowText, 'offerBranding')
  const type = extractString(windowText, 'type')
  const discountText = extractString(windowText, 'discountText')
  const serviceBranding = extractStringArray(windowText, 'serviceBranding')

  const rawBaseNumber = extractNumber(windowText, 'basePriceValue')
  const rawDiscountedNumber = extractNumber(windowText, 'discountedValue')

  const basePriceValue =
    normalizeMoneyNumber(rawBaseNumber) ??
    normalizeMoneyNumber(parseMoneyString(extractString(windowText, 'basePrice'))) ??
    normalizeMoneyNumber(fallbackBasePrice)

  const discountedValue =
    normalizeMoneyNumber(rawDiscountedNumber) ??
    normalizeMoneyNumber(parseMoneyString(extractString(windowText, 'discountedPrice')))

  const currency =
    extractString(windowText, 'currencyCode') ||
    extractString(windowText, 'currency') ||
    fallbackCurrency ||
    'USD'

    const startsAt = parseStoreTimestamp(
    extractString(windowText, 'startTime') ||
      extractString(windowText, 'startDate') ||
      extractString(windowText, 'availabilityStartDate')
  )

  const endsAt = parseStoreTimestamp(
    extractString(windowText, 'endTime') ||
      extractString(windowText, 'endDate') ||
      extractString(windowText, 'availabilityEndDate')
  )

  const isPlus =
    serviceBranding.includes('PS_PLUS') ||
    offerBranding === 'PS_PLUS' ||
    String(type || '').includes('PS_PLUS') ||
    /playstation plus/i.test(offerLabel || '')

  const hasDiscount =
    discountedValue != null &&
    basePriceValue != null &&
    discountedValue < basePriceValue

  if (!offerLabel && !offerBranding && !discountText && !type && !hasDiscount) {
    return null
  }

  const computedDiscountPercent =
    basePriceValue != null &&
    discountedValue != null &&
    basePriceValue > 0 &&
    discountedValue < basePriceValue
      ? Math.round(((basePriceValue - discountedValue) / basePriceValue) * 100)
      : null

  return {
    offerLabel,
    offerBranding,
    type,
    discountText,
    serviceBranding,
    basePriceValue,
    discountedValue,
    currency,
    startsAt,
    endsAt,
    isPlus,
    hasDiscount,
    discountPercent: parseDiscountPercent(discountText) ?? computedDiscountPercent,
  }
}

function pickBestCandidate(candidates, kind, canonicalPriceAmount) {
  const filtered = candidates.filter((candidate) => {
    if (!candidate) return false
    if (kind === 'ps_plus_sale' && !candidate.isPlus) return false
    if (kind === 'public_sale' && candidate.isPlus) return false

    return isReasonableOfferCandidate(candidate, canonicalPriceAmount)
  })

  if (filtered.length === 0) return null

  filtered.sort((a, b) => {
    const aPrice = a.discountedValue ?? Number.POSITIVE_INFINITY
    const bPrice = b.discountedValue ?? Number.POSITIVE_INFINITY
    return aPrice - bPrice
  })

  return filtered[0]
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.9',
    },
  })

  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status} for ${url}`)
  }

  return await response.text()
}

async function setQueueStatus(queueId, values) {
  const { error } = await admin
    .from('price_offer_queue')
    .update(values)
    .eq('id', queueId)

  if (error) {
    throw new Error(`Queue update failed: ${summarizeError(error)}`)
  }
}

async function maybeInsertOfferSnapshot(itemId, offerKind, currentRow, nextSnapshot) {
  const previousActive =
    offerKind === 'public_sale'
      ? currentRow.public_offer_is_active
      : currentRow.ps_plus_offer_is_active

  const previousPrice =
    offerKind === 'public_sale'
      ? currentRow.public_offer_price_amount
      : currentRow.ps_plus_offer_price_amount

  const previousOriginal =
    offerKind === 'public_sale'
      ? currentRow.public_offer_original_price_amount
      : currentRow.ps_plus_offer_original_price_amount

  const previousPercent =
    offerKind === 'public_sale'
      ? currentRow.public_offer_discount_percent
      : currentRow.ps_plus_offer_discount_percent

  const previousCurrency =
    offerKind === 'public_sale'
      ? currentRow.public_offer_currency
      : currentRow.ps_plus_offer_currency

  const changed =
    Boolean(previousActive) !== Boolean(nextSnapshot.offer_is_active) ||
    Number(previousPrice ?? null) !== Number(nextSnapshot.offer_price_amount ?? null) ||
    Number(previousOriginal ?? null) !== Number(nextSnapshot.original_price_amount ?? null) ||
    Number(previousPercent ?? null) !== Number(nextSnapshot.discount_percent ?? null) ||
    String(previousCurrency ?? 'USD') !== String(nextSnapshot.currency_code ?? 'USD')

  if (!changed) return

  const { error } = await admin
    .from('item_offer_snapshots')
    .insert({
      item_id: itemId,
      offer_kind: offerKind,
      captured_at: nowIso(),
      offer_is_active: nextSnapshot.offer_is_active,
      offer_price_amount: nextSnapshot.offer_price_amount,
      original_price_amount: nextSnapshot.original_price_amount,
      discount_percent: nextSnapshot.discount_percent,
      currency_code: nextSnapshot.currency_code,
      label_raw: nextSnapshot.label_raw,
      starts_at: nextSnapshot.starts_at,
      ends_at: nextSnapshot.ends_at,
      source_name: 'playstation_store',
      source_note: nextSnapshot.source_note,
    })

  if (error) {
    throw new Error(`Snapshot insert failed: ${summarizeError(error)}`)
  }
}

const { data: queueRows, error: queueError } = await admin
  .from('price_offer_queue')
  .select(`
    id,
    item_id,
    title_snapshot,
    slug_snapshot,
    store_url_snapshot,
    attempts
  `)
  .eq('status', 'pending')
  .lte('next_attempt_at', nowIso())
  .order('priority', { ascending: true })
  .order('created_at', { ascending: true })
  .limit(limit)

if (queueError) {
  console.error(queueError)
  process.exit(1)
}

const rows = queueRows || []

if (rows.length === 0) {
  console.log('No pending price offer rows found.')
  process.exit(0)
}

for (const row of rows) {
  await setQueueStatus(row.id, {
    status: 'processing',
    attempts: (row.attempts ?? 0) + 1,
    locked_by: 'node_local_price_offers',
  })
}

for (const row of rows) {
  try {
    const { data: item, error: itemError } = await admin
      .from('catalog_items')
      .select(`
        id,
        title,
        slug,
        canonical_price_amount,
        canonical_price_currency,
        public_offer_is_active,
        public_offer_price_amount,
        public_offer_original_price_amount,
        public_offer_discount_percent,
        public_offer_currency,
        ps_plus_offer_is_active,
        ps_plus_offer_price_amount,
        ps_plus_offer_original_price_amount,
        ps_plus_offer_discount_percent,
        ps_plus_offer_currency
      `)
      .eq('id', row.item_id)
      .single()

    if (itemError || !item) {
      throw itemError || new Error('Catalog item not found')
    }

    const html = await fetchHtml(row.store_url_snapshot)
    const jsonLd = extractJsonLdOffer(html)
    const windows = collectOfferWindows(html)

    const candidates = windows
      .map((windowText) =>
        parseOfferCandidate(
          windowText,
          jsonLd.currency || item.canonical_price_currency || 'USD',
          jsonLd.price || item.canonical_price_amount || null
        )
      )
      .filter(Boolean)

        const bestPublic = pickBestCandidate(
      candidates,
      'public_sale',
      item.canonical_price_amount
    )

    const bestPlus = pickBestCandidate(
      candidates,
      'ps_plus_sale',
      item.canonical_price_amount
    )

    const publicPayload = bestPublic
      ? {
          public_offer_is_active: true,
          public_offer_price_amount: bestPublic.discountedValue,
          public_offer_original_price_amount:
            bestPublic.basePriceValue ?? item.canonical_price_amount ?? null,
          public_offer_discount_percent: bestPublic.discountPercent,
          public_offer_currency:
            bestPublic.currency || jsonLd.currency || item.canonical_price_currency || 'USD',
          public_offer_label_raw: bestPublic.offerLabel,
          public_offer_starts_at: bestPublic.startsAt,
          public_offer_ends_at: bestPublic.endsAt,
          public_offer_last_synced_at: nowIso(),
        }
      : {
          public_offer_is_active: false,
          public_offer_price_amount: null,
          public_offer_original_price_amount: null,
          public_offer_discount_percent: null,
          public_offer_currency: null,
          public_offer_label_raw: null,
          public_offer_starts_at: null,
          public_offer_ends_at: null,
          public_offer_last_synced_at: nowIso(),
        }

    const plusPayload = bestPlus
      ? {
          ps_plus_offer_is_active: true,
          ps_plus_offer_price_amount: bestPlus.discountedValue,
          ps_plus_offer_original_price_amount:
            bestPlus.basePriceValue ?? item.canonical_price_amount ?? null,
          ps_plus_offer_discount_percent: bestPlus.discountPercent,
          ps_plus_offer_currency:
            bestPlus.currency || jsonLd.currency || item.canonical_price_currency || 'USD',
          ps_plus_offer_label_raw: bestPlus.offerLabel,
          ps_plus_offer_starts_at: bestPlus.startsAt,
          ps_plus_offer_ends_at: bestPlus.endsAt,
          ps_plus_offer_last_synced_at: nowIso(),
        }
      : {
          ps_plus_offer_is_active: false,
          ps_plus_offer_price_amount: null,
          ps_plus_offer_original_price_amount: null,
          ps_plus_offer_discount_percent: null,
          ps_plus_offer_currency: null,
          ps_plus_offer_label_raw: null,
          ps_plus_offer_starts_at: null,
          ps_plus_offer_ends_at: null,
          ps_plus_offer_last_synced_at: nowIso(),
        }

        const hadAnyDiscountLikeCandidate = candidates.some((candidate) => candidate?.hasDiscount)

    const noteParts = []
    if (bestPublic) noteParts.push('public_sale_detected')
    if (bestPlus) noteParts.push('ps_plus_sale_detected')
    if (bestPublic && bestPlus) noteParts.push('dual_offer_detected_plus_is_primary_callout')
    if (!bestPublic && !bestPlus && hadAnyDiscountLikeCandidate) {
      noteParts.push('offers_detected_but_failed_sanity_check')
    }
    if (!bestPublic && !bestPlus && !hadAnyDiscountLikeCandidate) {
      noteParts.push('no_offer_detected')
    }

    const { error: updateError } = await admin
      .from('catalog_items')
      .update({
        ...publicPayload,
        ...plusPayload,
                price_offer_match_status:
          !bestPublic && !bestPlus && hadAnyDiscountLikeCandidate
            ? 'manual_review'
            : 'matched',
        price_offer_source_note: noteParts.join(' | '),
      })
      .eq('id', item.id)

    if (updateError) {
      throw updateError
    }

    await maybeInsertOfferSnapshot(item.id, 'public_sale', item, {
      offer_is_active: publicPayload.public_offer_is_active,
      offer_price_amount: publicPayload.public_offer_price_amount,
      original_price_amount: publicPayload.public_offer_original_price_amount,
      discount_percent: publicPayload.public_offer_discount_percent,
      currency_code: publicPayload.public_offer_currency || 'USD',
      label_raw: publicPayload.public_offer_label_raw,
      starts_at: publicPayload.public_offer_starts_at,
      ends_at: publicPayload.public_offer_ends_at,
      source_note: 'collect-playstation-offers-local public sale',
    })

    await maybeInsertOfferSnapshot(item.id, 'ps_plus_sale', item, {
      offer_is_active: plusPayload.ps_plus_offer_is_active,
      offer_price_amount: plusPayload.ps_plus_offer_price_amount,
      original_price_amount: plusPayload.ps_plus_offer_original_price_amount,
      discount_percent: plusPayload.ps_plus_offer_discount_percent,
      currency_code: plusPayload.ps_plus_offer_currency || 'USD',
      label_raw: plusPayload.ps_plus_offer_label_raw,
      starts_at: plusPayload.ps_plus_offer_starts_at,
      ends_at: plusPayload.ps_plus_offer_ends_at,
      source_note: 'collect-playstation-offers-local ps plus sale',
    })

    await setQueueStatus(row.id, {
      status: 'done',
      locked_by: null,
      last_error: null,
      next_attempt_at: nowIso(),
    })

    console.log(
      `${item.title} | public=${publicPayload.public_offer_is_active ? publicPayload.public_offer_price_amount : 'none'} | plus=${plusPayload.ps_plus_offer_is_active ? plusPayload.ps_plus_offer_price_amount : 'none'}`
    )
  } catch (error) {
    const message = summarizeError(error)

    try {
      await admin
        .from('catalog_items')
        .update({
          price_offer_match_status: 'manual_review',
          price_offer_source_note: message,
        })
        .eq('id', row.item_id)
    } catch {
      // ignore secondary update error
    }

    await setQueueStatus(row.id, {
      status: 'failed',
      locked_by: null,
      last_error: message,
      next_attempt_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })

    console.error(`FAILED: ${row.title_snapshot}`)
    console.error(message)
  }
}