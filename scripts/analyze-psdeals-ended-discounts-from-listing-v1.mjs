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

  return Math.trunc(numberValue)
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

async function fetchDiscountSignalStageItems(admin) {
  const allRows = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1

    const { data, error } = await admin
      .from('psdeals_stage_items')
      .select(`
        id,
        region_code,
        storefront,
        psdeals_id,
        psdeals_slug,
        psdeals_url,
        title,
        platforms,
        content_type,
        item_type_label,
        current_price_amount,
        original_price_amount,
        discount_percent,
        deal_ends_at,
        is_ps_plus_discount,
        listing_last_seen_at,
        detail_last_synced_at,
        updated_at
      `)
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .not('current_price_amount', 'is', null)
      .not('original_price_amount', 'is', null)
      .gte('discount_percent', 1)
      .lte('discount_percent', 99)
      .range(from, to)

    if (error) throw error

    for (const row of data || []) {
      const current = normalizeMoney(row.current_price_amount)
      const original = normalizeMoney(row.original_price_amount)
      const discount = normalizeInteger(row.discount_percent)

      if (
        current !== null &&
        original !== null &&
        original > current &&
        discount !== null &&
        discount >= 1 &&
        discount <= 99
      ) {
        allRows.push({
          ...row,
          current_price_amount: current,
          original_price_amount: original,
          discount_percent: discount,
          psdeals_id: normalizePsdealsId(row.psdeals_id),
        })
      }
    }

    if (!data || data.length < pageSize) break
  }

  return allRows
}

async function main() {
  const args = parseArgs(process.argv)

  const discountsJsonPath = getArg(args, 'discounts-json')
  const outputTxt = getArg(args, 'output-txt', null)
  const outputJson = getArg(args, 'output-json', null)
  const sampleLimit = Number(getArg(args, 'sample-limit', '80'))

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
  const activeDiscountIds = new Set()

  for (const item of discountsItems) {
    const psdealsId = normalizePsdealsId(item.psdeals_id)
    if (psdealsId !== null) activeDiscountIds.add(psdealsId)
  }

  const discountSignalStageItems = await fetchDiscountSignalStageItems(admin)

  const endedCandidates = discountSignalStageItems
    .filter((row) => row.psdeals_id !== null)
    .filter((row) => !activeDiscountIds.has(row.psdeals_id))
    .sort((a, b) => {
      const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : 0
      const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : 0

      return aUpdated - bUpdated || String(a.title).localeCompare(String(b.title))
    })

  const summary = {
    discounts_json_file: discountsJsonPath,
    discounts_json_items: discountsItems.length,
    discounts_json_unique_ids: activeDiscountIds.size,
    stage_items_with_discount_signal: discountSignalStageItems.length,
    ended_discount_candidates: endedCandidates.length,
    candidates_by_content_type: summarizeBy(endedCandidates, (row) => row.content_type),
    candidates_by_item_type_label: summarizeBy(endedCandidates, (row) => row.item_type_label),
    candidates_by_is_ps_plus_discount: summarizeBy(endedCandidates, (row) =>
      row.is_ps_plus_discount ? 'true' : 'false'
    ),
    candidates_by_deal_ends_at: summarizeBy(endedCandidates, (row) =>
      row.deal_ends_at ? 'has_deal_ends_at' : 'null_deal_ends_at'
    ),
  }

  console.log('=== LoboDeals ended discounts from PSDeals discounts listing analyzer v1 ===')
  console.log(JSON.stringify(summary, null, 2))

  console.log('=== ENDED DISCOUNT CANDIDATES SAMPLE ===')

  for (const row of endedCandidates.slice(0, sampleLimit)) {
    console.log(
      [
        row.psdeals_id,
        row.title,
        `slug=${row.psdeals_slug}`,
        `platforms=${JSON.stringify(row.platforms || [])}`,
        `price=${row.current_price_amount}`,
        `original=${row.original_price_amount}`,
        `discount=${row.discount_percent}`,
        `deal_ends_at=${row.deal_ends_at || 'null'}`,
        `is_ps_plus=${row.is_ps_plus_discount}`,
        `detail_last_synced_at=${row.detail_last_synced_at || 'null'}`,
        row.psdeals_url || buildPsdealsUrl(row.psdeals_id, row.psdeals_slug),
      ].join(' | ')
    )
  }

  if (endedCandidates.length > sampleLimit) {
    console.log(`... ${endedCandidates.length - sampleLimit} more rows not printed`)
  }

  if (outputTxt) {
    await fs.writeFile(path.resolve(process.cwd(), outputTxt), toTxt(endedCandidates), 'utf8')
    console.log(`ENDED_DISCOUNTS_TXT: ${outputTxt}`)
  }

  if (outputJson) {
    await fs.writeFile(
      path.resolve(process.cwd(), outputJson),
      JSON.stringify(
        {
          summary,
          ended_discount_candidates: endedCandidates,
        },
        null,
        2
      ),
      'utf8'
    )
    console.log(`ENDED_DISCOUNTS_JSON: ${outputJson}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
