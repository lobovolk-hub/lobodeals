import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function parseArgs(argv) {
  const args = new Map()

  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--')) continue

    const index = arg.indexOf('=')
    if (index === -1) {
      args.set(arg.slice(2), 'true')
    } else {
      args.set(arg.slice(2, index), arg.slice(index + 1))
    }
  }

  return args
}

function getArg(args, key, defaultValue = null) {
  return args.has(key) ? String(args.get(key)) : defaultValue
}

function normalizePsdealsId(value) {
  if (value === null || value === undefined) return null

  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null

  return numberValue
}

function normalizeMoney(value) {
  if (value === null || value === undefined || value === '') return null

  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null

  return Number(numberValue.toFixed(2))
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') return null

  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null

  return Math.abs(Math.trunc(numberValue))
}

function moneyEqual(left, right) {
  const a = normalizeMoney(left)
  const b = normalizeMoney(right)

  if (a === null && b === null) return true
  if (a === null || b === null) return false

  return Math.abs(a - b) < 0.01
}

function integerEqual(left, right) {
  const a = normalizeInteger(left)
  const b = normalizeInteger(right)

  if (a === null && b === null) return true
  if (a === null || b === null) return false

  return a === b
}

function chunkArray(items, size) {
  const chunks = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function uniqueByPsdealsId(items) {
  const found = new Map()

  for (const item of items) {
    const psdealsId = normalizePsdealsId(item.psdeals_id)
    if (psdealsId === null) continue

    if (!found.has(psdealsId)) {
      found.set(psdealsId, {
        ...item,
        psdeals_id: psdealsId,
      })
    }
  }

  return [...found.values()]
}

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
    // Missing env files are ignored. Required variables are validated later.
  }
}

async function fetchDbItems(admin, psdealsIds) {
  const rowsById = new Map()

  for (const chunk of chunkArray(psdealsIds, 500)) {
    const { data, error } = await admin
      .from('psdeals_stage_items')
      .select(`
        id,
        psdeals_id,
        title,
        psdeals_slug,
        psdeals_url,
        content_type,
        item_type_label,
        platforms,
        current_price_amount,
        original_price_amount,
        discount_percent,
        deal_ends_at,
        is_ps_plus_discount,
        listing_last_seen_at,
        detail_last_synced_at,
        raw_detail_json
      `)
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .in('psdeals_id', chunk)

    if (error) throw error

    for (const row of data || []) {
      const id = normalizePsdealsId(row.psdeals_id)
      if (id !== null) rowsById.set(id, row)
    }
  }

  return rowsById
}

function getRawCurrentPsPlusPrice(dbItem) {
  const rawValue = dbItem?.raw_detail_json?.current_ps_plus_price_amount
  return normalizeMoney(rawValue)
}

function getAgeHours(value) {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  return (Date.now() - parsed.getTime()) / 1000 / 60 / 60
}

function classifyItem(listingItem, dbItem) {
  if (!dbItem) {
    return {
      shouldRefresh: true,
      reasons: ['new_item'],
    }
  }

  const reasons = []

  const listingCurrentPrice = normalizeMoney(listingItem.current_price_amount)
  const listingOriginalPrice = normalizeMoney(listingItem.original_price_amount)
  const listingDiscountPercent = normalizeInteger(listingItem.discount_percent)

  if (
    listingCurrentPrice !== null &&
    !moneyEqual(listingCurrentPrice, dbItem.current_price_amount)
  ) {
    reasons.push('current_price_mismatch')
  }

  if (
    listingOriginalPrice !== null &&
    !moneyEqual(listingOriginalPrice, dbItem.original_price_amount)
  ) {
    reasons.push('original_price_mismatch')
  }

  if (
    listingDiscountPercent !== null &&
    !integerEqual(listingDiscountPercent, dbItem.discount_percent)
  ) {
    reasons.push('discount_percent_mismatch')
  }

  if (!dbItem.detail_last_synced_at) {
    reasons.push('detail_never_synced')
  }

  const hasDiscountSignal =
    listingDiscountPercent !== null &&
    listingDiscountPercent > 0 &&
    listingDiscountPercent < 100

  const listingLooksLikePsPlusOnly =
    hasDiscountSignal &&
    (
      listingOriginalPrice === null ||
      (
        listingCurrentPrice !== null &&
        listingOriginalPrice !== null &&
        moneyEqual(listingCurrentPrice, listingOriginalPrice)
      )
    )

  const rawCurrentPsPlusPrice = getRawCurrentPsPlusPrice(dbItem)

  const dbLooksPsPlusButRawMissing =
    dbItem.is_ps_plus_discount === true &&
    rawCurrentPsPlusPrice === null

  if (listingLooksLikePsPlusOnly) {
    reasons.push('ps_plus_risk_listing_discount_without_regular_sale')
  }

  if (dbLooksPsPlusButRawMissing) {
    reasons.push('ps_plus_risk_missing_raw_price')
  }

  return {
    shouldRefresh: reasons.length > 0,
    reasons,
  }
}

function toTxt(items) {
  return items
    .map((item) => item.psdeals_url)
    .filter(Boolean)
    .join('\n') + '\n'
}

function toReportRow(row) {
  const listing = row.listing
  const db = row.db

  return [
    listing.psdeals_id,
    row.reasons.join(','),
    listing.title,
    `listing_price=${normalizeMoney(listing.current_price_amount)}`,
    `db_price=${normalizeMoney(db?.current_price_amount)}`,
    `listing_original=${normalizeMoney(listing.original_price_amount)}`,
    `db_original=${normalizeMoney(db?.original_price_amount)}`,
    `listing_discount=${normalizeInteger(listing.discount_percent)}`,
    `db_discount=${normalizeInteger(db?.discount_percent)}`,
    `db_ps_plus=${db?.is_ps_plus_discount ?? null}`,
    `db_raw_ps_plus=${getRawCurrentPsPlusPrice(db)}`,
    `detail_last_synced_at=${db?.detail_last_synced_at ?? null}`,
    listing.psdeals_url,
  ].join(' | ')
}

async function main() {
  const args = parseArgs(process.argv)

  const filePath = getArg(args, 'file')
  const outputTxt = getArg(args, 'output-txt')
  const mustOutputTxt = getArg(args, 'must-output-txt')
  const staleOutputTxt = getArg(args, 'stale-output-txt')
  const skippedOutputTxt = getArg(args, 'skipped-output-txt')
  const staleLimit = Number(getArg(args, 'stale-limit', '500'))
  const staleHours = Number(getArg(args, 'stale-hours', '24'))

  if (!filePath) {
    throw new Error('Missing --file argument.')
  }

  await loadKeyValueFile(path.resolve(process.cwd(), '.env.local'))
  await loadKeyValueFile(
    path.resolve(process.cwd(), '..', 'worker-playstation-ingest', '.dev.vars')
  )

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  }

  if (!secretKey) {
    throw new Error('Missing SUPABASE_SECRET_KEY')
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const raw = await fs.readFile(path.resolve(process.cwd(), filePath), 'utf8')
  const payload = JSON.parse(raw)

  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const uniqueItems = uniqueByPsdealsId(rawItems)
  const ids = uniqueItems.map((item) => item.psdeals_id)

  const dbItemsById = await fetchDbItems(admin, ids)

  const analyzed = uniqueItems.map((item) => {
    const dbItem = dbItemsById.get(item.psdeals_id) || null
    const classification = classifyItem(item, dbItem)

    return {
      listing: item,
      db: dbItem,
      ...classification,
    }
  })

  const mustRefresh = analyzed.filter((row) => row.shouldRefresh)
  const staleCandidates = analyzed
    .filter((row) => !row.shouldRefresh)
    .map((row) => ({
      ...row,
      detailAgeHours: getAgeHours(row.db?.detail_last_synced_at),
    }))
    .filter((row) => row.detailAgeHours === null || row.detailAgeHours >= staleHours)
    .sort((a, b) => {
      const aTime = a.db?.detail_last_synced_at
        ? new Date(a.db.detail_last_synced_at).getTime()
        : 0
      const bTime = b.db?.detail_last_synced_at
        ? new Date(b.db.detail_last_synced_at).getTime()
        : 0

      return aTime - bTime
    })
    .slice(0, Math.max(0, staleLimit))
    .map((row) => ({
      ...row,
      reasons: [...row.reasons, 'stale_rotation'],
    }))

  const combined = [...mustRefresh, ...staleCandidates]

  const skippedSafe = analyzed.filter((row) => {
    if (row.shouldRefresh) return false

    return !staleCandidates.some(
      (stale) => stale.listing.psdeals_id === row.listing.psdeals_id
    )
  })

  const newItems = analyzed.filter((row) => row.reasons.includes('new_item'))
  const priceMismatch = analyzed.filter((row) =>
    row.reasons.includes('current_price_mismatch')
  )
  const originalMismatch = analyzed.filter((row) =>
    row.reasons.includes('original_price_mismatch')
  )
  const discountMismatch = analyzed.filter((row) =>
    row.reasons.includes('discount_percent_mismatch')
  )
  const psPlusListingRisk = analyzed.filter((row) =>
    row.reasons.includes('ps_plus_risk_listing_discount_without_regular_sale')
  )
  const psPlusRawMissingRisk = analyzed.filter((row) =>
    row.reasons.includes('ps_plus_risk_missing_raw_price')
  )

  console.log('=== PSDeals discounts fast refresh analyzer v1 ===')
  console.log(`File: ${filePath}`)
  console.log(`Collected items: ${rawItems.length}`)
  console.log(`Unique psdeals ids: ${uniqueItems.length}`)
  console.log(`Existing in DB: ${uniqueItems.length - newItems.length}`)
  console.log(`New in DB: ${newItems.length}`)
  console.log(`Must refresh: ${mustRefresh.length}`)
  console.log(`Stale selected: ${staleCandidates.length}`)
  console.log(`Combined refresh total: ${combined.length}`)
  console.log(`Skipped safe: ${skippedSafe.length}`)
  console.log(`- current_price_mismatch: ${priceMismatch.length}`)
  console.log(`- original_price_mismatch: ${originalMismatch.length}`)
  console.log(`- discount_percent_mismatch: ${discountMismatch.length}`)
  console.log(`- ps_plus_risk_listing_discount_without_regular_sale: ${psPlusListingRisk.length}`)
  console.log(`- ps_plus_risk_missing_raw_price: ${psPlusRawMissingRisk.length}`)
  console.log(`- stale_hours: ${staleHours}`)
  console.log(`- stale_limit: ${staleLimit}`)

  console.log('=== COMBINED REFRESH SAMPLE ===')
  for (const row of combined.slice(0, 80)) {
    console.log(toReportRow(row))
  }

  if (outputTxt) {
    await fs.writeFile(
      path.resolve(process.cwd(), outputTxt),
      toTxt(combined.map((row) => row.listing)),
      'utf8'
    )
    console.log(`COMBINED_REFRESH_TXT: ${outputTxt}`)
  }

  if (mustOutputTxt) {
    await fs.writeFile(
      path.resolve(process.cwd(), mustOutputTxt),
      toTxt(mustRefresh.map((row) => row.listing)),
      'utf8'
    )
    console.log(`MUST_REFRESH_TXT: ${mustOutputTxt}`)
  }

  if (staleOutputTxt) {
    await fs.writeFile(
      path.resolve(process.cwd(), staleOutputTxt),
      toTxt(staleCandidates.map((row) => row.listing)),
      'utf8'
    )
    console.log(`STALE_REFRESH_TXT: ${staleOutputTxt}`)
  }

  if (skippedOutputTxt) {
    await fs.writeFile(
      path.resolve(process.cwd(), skippedOutputTxt),
      toTxt(skippedSafe.map((row) => row.listing)),
      'utf8'
    )
    console.log(`SKIPPED_SAFE_TXT: ${skippedOutputTxt}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})