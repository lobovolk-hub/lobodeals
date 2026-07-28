import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  classifyFastRefreshItem,
  normalizeComparableDiscount,
  normalizeComparableMoney,
  selectFastRefreshQueues,
  summarizeCommercialClassifications,
} from './lib/psdeals-fast-refresh.mjs'

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

function toTxt(items) {
  const urls = [
    ...new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => item.psdeals_url)
        .filter(Boolean)
    ),
  ]

  return urls.length > 0 ? `${urls.join('\n')}\n` : ''
}

function toReportRow(row) {
  const listing = row.listing
  const db = row.db

  return [
    listing.psdeals_id,
    row.reasons.join(','),
    listing.title,
    `listing_price=${normalizeComparableMoney(listing.current_price_amount)}`,
    `db_price=${normalizeComparableMoney(db?.current_price_amount)}`,
    `listing_original=${normalizeComparableMoney(listing.original_price_amount)}`,
    `db_original=${normalizeComparableMoney(db?.original_price_amount)}`,
    `listing_discount=${normalizeComparableDiscount(listing.discount_percent)}`,
    `db_discount=${normalizeComparableDiscount(db?.discount_percent)}`,
    `db_ps_plus=${db?.is_ps_plus_discount ?? null}`,
    `db_raw_ps_plus=${normalizeComparableMoney(db?.raw_detail_json?.current_ps_plus_price_amount)}`,
    `commercial_state=${row.commercialState?.classification ?? 'unknown'}`,
    `detail_last_synced_at=${db?.detail_last_synced_at ?? null}`,
    listing.psdeals_url,
  ].join(' | ')
}

async function main() {
  const args = parseArgs(process.argv)

  const filePath = getArg(args, 'file')
  const outputTxt = getArg(args, 'output-txt')
  const mustOutputTxt = getArg(args, 'must-output-txt')
  const psPlusOutputTxt = getArg(args, 'ps-plus-output-txt')
  const staleOutputTxt = getArg(args, 'stale-output-txt')
  const skippedOutputTxt = getArg(args, 'skipped-output-txt')
  const staleLimit = Number(getArg(args, 'stale-limit', '500'))
  const staleHours = Number(getArg(args, 'stale-hours', '24'))
  const psPlusRecheckLimit = Number(
    getArg(args, 'ps-plus-recheck-limit', '500')
  )

  if (!filePath) {
    throw new Error('Missing --file argument.')
  }

  if (!Number.isFinite(staleLimit) || staleLimit < 0) {
    throw new Error('Invalid --stale-limit argument.')
  }

  if (!Number.isFinite(staleHours) || staleHours < 0) {
    throw new Error('Invalid --stale-hours argument.')
  }

  if (
    !Number.isFinite(psPlusRecheckLimit) ||
    psPlusRecheckLimit < 0
  ) {
    throw new Error('Invalid --ps-plus-recheck-limit argument.')
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
    const classification = classifyFastRefreshItem(item, dbItem)

    return {
      listing: item,
      db: dbItem,
      ...classification,
    }
  })

  const {
    mustRefresh,
    psPlusRecheckCandidates,
    staleCandidates,
    combined,
    skippedSafe,
    boundedStaleLimit,
    boundedPsPlusRecheckLimit,
  } = selectFastRefreshQueues(analyzed, {
    staleLimit,
    staleHours,
    psPlusRecheckLimit,
  })
  const commercialClassificationCounts =
    summarizeCommercialClassifications(analyzed)

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
  const psPlusRevalidation = psPlusRecheckCandidates

  console.log('=== PSDeals discounts fast refresh analyzer v1 ===')
  console.log(`File: ${filePath}`)
  console.log(`Collected items: ${rawItems.length}`)
  console.log(`Unique psdeals ids: ${uniqueItems.length}`)
  console.log(`Existing in DB: ${uniqueItems.length - newItems.length}`)
  console.log(`New in DB: ${newItems.length}`)
  console.log(`Must refresh: ${mustRefresh.length}`)
  console.log(`PS Plus recheck selected: ${psPlusRevalidation.length}`)
  console.log(`Stale selected: ${staleCandidates.length}`)
  console.log(`Combined refresh total: ${combined.length}`)
  console.log(`Skipped safe: ${skippedSafe.length}`)
  console.log(`- current_price_mismatch: ${priceMismatch.length}`)
  console.log(`- original_price_mismatch: ${originalMismatch.length}`)
  console.log(`- discount_percent_mismatch: ${discountMismatch.length}`)
  console.log(`- ps_plus_risk_listing_discount_without_regular_sale: ${psPlusListingRisk.length}`)
  console.log(`- ps_plus_risk_missing_raw_price: ${psPlusRawMissingRisk.length}`)
  console.log(`- ps_plus_revalidation: ${psPlusRevalidation.length}`)
  for (const [classification, count] of Object.entries(
    commercialClassificationCounts
  )) {
    console.log(`- commercial_state_${classification}: ${count}`)
  }
  console.log(`- stale_hours: ${staleHours}`)
  console.log(`- stale_limit: ${boundedStaleLimit}`)
  console.log(`- ps_plus_recheck_limit: ${boundedPsPlusRecheckLimit}`)

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

  if (psPlusOutputTxt) {
    await fs.writeFile(
      path.resolve(process.cwd(), psPlusOutputTxt),
      toTxt(psPlusRecheckCandidates.map((row) => row.listing)),
      'utf8'
    )
    console.log(`PS_PLUS_RECHECK_TXT: ${psPlusOutputTxt}`)
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
