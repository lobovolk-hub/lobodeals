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

function normalizePsdealsId(value) {
  if (value === null || value === undefined || value === '') return null

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

function buildPsdealsUrl(psdealsId, slug) {
  if (!psdealsId || !slug) return null
  return `https://psdeals.net/us-store/game/${psdealsId}/${slug}`
}

function toTxt(rows) {
  return (
    rows
      .map((row) => row.psdeals_url || buildPsdealsUrl(row.psdeals_id, row.psdeals_slug))
      .filter(Boolean)
      .join('\n') + '\n'
  )
}

function summarizeBy(rows, keyFn) {
  const map = new Map()

  for (const row of rows) {
    const key = keyFn(row) || 'unknown'
    map.set(key, (map.get(key) || 0) + 1)
  }

  return Object.fromEntries([...map.entries()].sort())
}

async function fetchAllActiveCacheDeals(admin) {
  const allRows = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1

    const { data, error } = await admin
      .from('catalog_public_cache')
      .select(`
        item_id,
        title,
        slug,
        content_type,
        item_type_label,
        current_price_amount,
        original_price_amount,
        discount_percent,
        ps_plus_price_amount,
        best_price_amount,
        best_price_type,
        has_deal,
        has_ps_plus_deal,
        deal_ends_at
      `)
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .or('has_deal.eq.true,has_ps_plus_deal.eq.true')
      .range(from, to)

    if (error) throw error

    allRows.push(...(data || []))

    if (!data || data.length < pageSize) break
  }

  return allRows
}

async function fetchStageRowsByItemId(admin, itemIds) {
  const rowsByItemId = new Map()

  for (const chunk of chunkArray(itemIds, 100)) {
    const { data, error } = await admin
      .from('psdeals_stage_items')
      .select(`
        id,
        psdeals_id,
        psdeals_slug,
        psdeals_url,
        title,
        content_type,
        item_type_label,
        platforms,
        detail_last_synced_at
      `)
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .in('id', chunk)

    if (error) throw error

    for (const row of data || []) {
      rowsByItemId.set(row.id, row)
    }
  }

  return rowsByItemId
}

async function main() {
  const args = parseArgs(process.argv)

  const discountsJsonPath = getArg(args, 'discounts-json')
  const outputTxt = getArg(args, 'output-txt', null)
  const outputJson = getArg(args, 'output-json', null)

  if (!discountsJsonPath) {
    throw new Error('Missing --discounts-json argument.')
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

  const discountsRaw = await fs.readFile(path.resolve(process.cwd(), discountsJsonPath), 'utf8')
  const discountsPayload = JSON.parse(discountsRaw)

  const discountsItems = Array.isArray(discountsPayload.items) ? discountsPayload.items : []
  const discountsIds = new Set()

  for (const item of discountsItems) {
    const psdealsId = normalizePsdealsId(item.psdeals_id)
    if (psdealsId !== null) discountsIds.add(psdealsId)
  }

  const activeCacheDeals = await fetchAllActiveCacheDeals(admin)
  const itemIds = [...new Set(activeCacheDeals.map((row) => row.item_id).filter(Boolean))]
  const stageRowsByItemId = await fetchStageRowsByItemId(admin, itemIds)

  const joinedRows = activeCacheDeals.map((cache) => {
    const stage = stageRowsByItemId.get(cache.item_id) || null

    return {
      item_id: cache.item_id,
      psdeals_id: normalizePsdealsId(stage?.psdeals_id),
      psdeals_slug: stage?.psdeals_slug || cache.slug || null,
      psdeals_url:
        stage?.psdeals_url ||
        buildPsdealsUrl(normalizePsdealsId(stage?.psdeals_id), stage?.psdeals_slug || cache.slug),
      title: cache.title,
      slug: cache.slug,
      content_type: cache.content_type,
      item_type_label: cache.item_type_label,
      platforms: stage?.platforms || [],
      current_price_amount: cache.current_price_amount,
      original_price_amount: cache.original_price_amount,
      discount_percent: cache.discount_percent,
      ps_plus_price_amount: cache.ps_plus_price_amount,
      best_price_amount: cache.best_price_amount,
      best_price_type: cache.best_price_type,
      has_deal: cache.has_deal,
      has_ps_plus_deal: cache.has_ps_plus_deal,
      deal_ends_at: cache.deal_ends_at,
      detail_last_synced_at: stage?.detail_last_synced_at || null,
      present_in_discounts_json:
        normalizePsdealsId(stage?.psdeals_id) !== null
          ? discountsIds.has(normalizePsdealsId(stage?.psdeals_id))
          : false,
    }
  })

  const missingFromDiscounts = joinedRows
    .filter((row) => row.psdeals_id !== null)
    .filter((row) => !row.present_in_discounts_json)

  const missingWithoutPsdealsId = joinedRows.filter((row) => row.psdeals_id === null)

  const summary = {
    discounts_json_file: discountsJsonPath,
    discounts_json_items: discountsItems.length,
    discounts_json_unique_ids: discountsIds.size,
    active_cache_deals: activeCacheDeals.length,
    active_cache_deals_joined_with_psdeals_id: joinedRows.length - missingWithoutPsdealsId.length,
    active_cache_deals_missing_psdeals_id: missingWithoutPsdealsId.length,
    active_cache_deals_present_in_discounts_json:
      joinedRows.length - missingWithoutPsdealsId.length - missingFromDiscounts.length,
    active_cache_deals_missing_from_discounts_json: missingFromDiscounts.length,
    missing_by_best_price_type: summarizeBy(missingFromDiscounts, (row) => row.best_price_type),
    missing_by_has_deal_flags: summarizeBy(missingFromDiscounts, (row) => {
      if (row.has_deal && row.has_ps_plus_deal) return 'regular_and_ps_plus'
      if (row.has_deal) return 'regular_only'
      if (row.has_ps_plus_deal) return 'ps_plus_only'
      return 'none'
    }),
    missing_by_deal_ends_at: summarizeBy(missingFromDiscounts, (row) =>
      row.deal_ends_at ? 'has_deal_ends_at' : 'null_deal_ends_at'
    ),
  }

  console.log('=== LoboDeals active deals missing from PSDeals discounts analyzer v2 ===')
  console.log(JSON.stringify(summary, null, 2))

  console.log('=== MISSING FROM DISCOUNTS JSON ===')
  for (const row of missingFromDiscounts.slice(0, 300)) {
    console.log(
      [
        row.psdeals_id,
        row.title,
        `slug=${row.slug}`,
        `price=${row.current_price_amount}`,
        `original=${row.original_price_amount}`,
        `discount=${row.discount_percent}`,
        `has_deal=${row.has_deal}`,
        `has_ps_plus=${row.has_ps_plus_deal}`,
        `deal_ends_at=${row.deal_ends_at || 'null'}`,
        row.psdeals_url,
      ].join(' | ')
    )
  }

  if (missingFromDiscounts.length > 300) {
    console.log(`... ${missingFromDiscounts.length - 300} more rows not printed`)
  }

  if (outputTxt) {
    await fs.writeFile(path.resolve(process.cwd(), outputTxt), toTxt(missingFromDiscounts), 'utf8')
    console.log(`MISSING_FROM_DISCOUNTS_TXT: ${outputTxt}`)
  }

  if (outputJson) {
    await fs.writeFile(
      path.resolve(process.cwd(), outputJson),
      JSON.stringify(
        {
          summary,
          missing_from_discounts_json: missingFromDiscounts,
          missing_psdeals_id: missingWithoutPsdealsId,
        },
        null,
        2
      ),
      'utf8'
    )
    console.log(`MISSING_FROM_DISCOUNTS_JSON: ${outputJson}`)
  }
}

function summarizeError(error) {
  if (!error) return 'Unknown error'

  if (error instanceof Error) {
    return error.stack || error.message
  }

  try {
    return JSON.stringify(error, null, 2)
  } catch {
    return String(error)
  }
}

main().catch((error) => {
  console.error(summarizeError(error))
  process.exit(1)
})