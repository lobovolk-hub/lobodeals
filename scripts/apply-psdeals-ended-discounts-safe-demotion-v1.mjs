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
  return Number.isFinite(numberValue) ? numberValue : null
}

function normalizeMoney(value) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Number(numberValue.toFixed(2)) : null
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : null
}

function chunkArray(items, size) {
  const chunks = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function summarizeBy(rows, keyFn) {
  const map = new Map()

  for (const row of rows) {
    const key = keyFn(row) || 'unknown'
    map.set(key, (map.get(key) || 0) + 1)
  }

  return Object.fromEntries([...map.entries()].sort())
}

async function runLimited(items, limit, worker) {
  const results = []
  let index = 0

  async function next() {
    while (index < items.length) {
      const currentIndex = index
      index += 1

      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => next()
  )

  await Promise.all(workers)
  return results
}

function isSafeCandidate(row) {
  const current = normalizeMoney(row.current_price_amount)
  const original = normalizeMoney(row.original_price_amount)
  const discount = normalizeInteger(row.discount_percent)

  return (
    current !== null &&
    original !== null &&
    original > current &&
    discount !== null &&
    discount >= 1 &&
    discount <= 99
  )
}

function buildUpdatedRawDetailJson(row, demotionAt) {
  const raw =
    row.raw_detail_json && typeof row.raw_detail_json === 'object'
      ? { ...row.raw_detail_json }
      : {}

  raw.current_ps_plus_price_amount = null
  raw.current_ps_plus_buy_box_price_amount = null
  raw.ended_discount_safe_demotion = {
    demoted_at: demotionAt,
    reason: 'psdeals_id_missing_from_full_discounts_listing',
    previous_current_price_amount: normalizeMoney(row.current_price_amount),
    previous_original_price_amount: normalizeMoney(row.original_price_amount),
    previous_discount_percent: normalizeInteger(row.discount_percent),
    previous_deal_ends_at: row.deal_ends_at || null,
    previous_is_ps_plus_discount: row.is_ps_plus_discount === true,
  }

  return raw
}

async function fetchCurrentRows(admin, psdealsIds) {
  const rows = []

  for (const chunk of chunkArray(psdealsIds, 500)) {
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
        currency_code,
        deal_ends_at,
        is_ps_plus_discount,
        raw_detail_json,
        detail_last_synced_at,
        updated_at
      `)
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .in('psdeals_id', chunk)

    if (error) throw error

    rows.push(...(data || []))
  }

  return rows
}

async function main() {
  const args = parseArgs(process.argv)

  const candidatesJsonPath = getArg(args, 'candidates-json')
  const applyToken = getArg(args, 'apply', 'NO')
  const limitArg = getArg(args, 'limit', null)
  const concurrency = Number(getArg(args, 'concurrency', '6'))

  if (!candidatesJsonPath) {
    throw new Error('Missing --candidates-json argument.')
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

  const shouldApply = applyToken === 'YES_I_UNDERSTAND'
  const demotionAt = new Date().toISOString()

  const raw = await fs.readFile(path.resolve(process.cwd(), candidatesJsonPath), 'utf8')
  const payload = JSON.parse(raw)
  const candidates = Array.isArray(payload.ended_discount_candidates)
    ? payload.ended_discount_candidates
    : []

  const candidateIds = [
    ...new Set(
      candidates
        .map((row) => normalizePsdealsId(row.psdeals_id))
        .filter((value) => value !== null)
    ),
  ]

  const limitedIds =
    limitArg === null
      ? candidateIds
      : candidateIds.slice(0, Math.max(0, Number(limitArg)))

  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const currentRows = await fetchCurrentRows(admin, limitedIds)

  const safeRows = currentRows
    .filter(isSafeCandidate)
    .sort((a, b) => String(a.title).localeCompare(String(b.title)))

  const skippedRows = currentRows.filter((row) => !isSafeCandidate(row))

  const summary = {
    mode: shouldApply ? 'APPLY' : 'DRY_RUN',
    candidates_json_file: candidatesJsonPath,
    candidates_from_file: candidates.length,
    unique_candidate_ids_from_file: candidateIds.length,
    limited_candidate_ids: limitedIds.length,
    rows_found_in_db: currentRows.length,
    safe_rows_to_demote: safeRows.length,
    skipped_rows: skippedRows.length,
    safe_by_content_type: summarizeBy(safeRows, (row) => row.content_type),
    safe_by_item_type_label: summarizeBy(safeRows, (row) => row.item_type_label),
    safe_by_is_ps_plus_discount: summarizeBy(safeRows, (row) =>
      row.is_ps_plus_discount ? 'true' : 'false'
    ),
    demotion_observed_at: demotionAt,
  }

  console.log('=== LoboDeals ended discounts safe demotion v1 ===')
  console.log(JSON.stringify(summary, null, 2))

  console.log('=== SAMPLE TO DEMOTE ===')
  for (const row of safeRows.slice(0, 80)) {
    console.log(
      [
        row.psdeals_id,
        row.title,
        `slug=${row.psdeals_slug}`,
        `platforms=${JSON.stringify(row.platforms || [])}`,
        `current=${normalizeMoney(row.current_price_amount)}`,
        `restore_to=${normalizeMoney(row.original_price_amount)}`,
        `discount=${normalizeInteger(row.discount_percent)}`,
        `is_ps_plus=${row.is_ps_plus_discount === true}`,
        row.psdeals_url,
      ].join(' | ')
    )
  }

  if (!shouldApply) {
    console.log('DRY_RUN_ONLY: no database rows were changed.')
    return
  }

  let updated = 0
  let failed = 0
  const failures = []

  await runLimited(safeRows, concurrency, async (row, index) => {
    const restoredPrice = normalizeMoney(row.original_price_amount)

    const updatePayload = {
      current_price_amount: restoredPrice,
      original_price_amount: null,
      discount_percent: null,
      deal_ends_at: null,
      is_ps_plus_discount: false,
      raw_detail_json: buildUpdatedRawDetailJson(row, demotionAt),
      source_note: 'ended_discount_safe_demotion_from_full_psdeals_discounts_listing',
      updated_at: demotionAt,
    }

    const { error } = await admin
      .from('psdeals_stage_items')
      .update(updatePayload)
      .eq('id', row.id)

    if (error) {
      failed += 1
      failures.push({
        psdeals_id: row.psdeals_id,
        title: row.title,
        error: error.message,
      })
      return
    }

    updated += 1

    if ((index + 1) % 100 === 0 || index + 1 === safeRows.length) {
      console.log(`Updated ${index + 1}/${safeRows.length}`)
    }
  })

  console.log('=== APPLY RESULT ===')
  console.log(
    JSON.stringify(
      {
        updated_stage_rows: updated,
        failed_stage_rows: failed,
        demotion_observed_at: demotionAt,
        failures: failures.slice(0, 20),
      },
      null,
      2
    )
  )

  if (failed > 0) {
    process.exit(2)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

