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

function getNumberArg(args, key, defaultValue) {
  if (!args.has(key)) return defaultValue

  const value = Number(args.get(key))
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid --${key} value.`)
  }

  return value
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
    // ignore missing env files
  }
}

function chunkArray(items, size) {
  const chunks = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function normalizePsdealsId(value) {
  if (value === null || value === undefined) return null

  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null

  return numberValue
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

async function fetchExistingIds(admin, psdealsIds) {
  const existing = new Set()
  const chunks = chunkArray(psdealsIds, 500)

  for (const chunk of chunks) {
    const { data, error } = await admin
      .from('psdeals_stage_items')
      .select('psdeals_id')
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .in('psdeals_id', chunk)

    if (error) throw error

    for (const row of data || []) {
      const id = normalizePsdealsId(row.psdeals_id)
      if (id !== null) existing.add(id)
    }
  }

  return existing
}

function pageGroups(items, pageSize) {
  return items.map((item, index) => ({
    ...item,
    inferred_page: Math.floor(index / pageSize) + 1,
    inferred_position: (index % pageSize) + 1,
  }))
}

function toTxt(items) {
  return items
    .map((item) => item.psdeals_url)
    .filter(Boolean)
    .join('\n') + '\n'
}

async function main() {
  const args = parseArgs(process.argv)

  const filePath = getArg(args, 'file')
  const pageSize = getNumberArg(args, 'page-size', 36)
  const outputTxt = getArg(args, 'output-txt', null)

  if (!filePath) {
    throw new Error('Missing --file argument.')
  }

  if (pageSize <= 0) {
    throw new Error('Invalid --page-size. Use a positive number.')
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

  const existingIds = await fetchExistingIds(admin, ids)

  const enriched = pageGroups(uniqueItems, pageSize).map((item) => ({
    ...item,
    exists_in_db: existingIds.has(item.psdeals_id),
  }))

  const newItems = enriched.filter((item) => !item.exists_in_db)
  const existingItems = enriched.filter((item) => item.exists_in_db)

  const pages = new Map()

  for (const item of enriched) {
    if (!pages.has(item.inferred_page)) {
      pages.set(item.inferred_page, {
        page: item.inferred_page,
        total: 0,
        existing: 0,
        new: 0,
      })
    }

    const page = pages.get(item.inferred_page)
    page.total += 1

    if (item.exists_in_db) {
      page.existing += 1
    } else {
      page.new += 1
    }
  }

  const pageSummaries = [...pages.values()].sort((a, b) => a.page - b.page)
  const firstFullyKnownPage = pageSummaries.find(
    (page) => page.total > 0 && page.new === 0
  )

  console.log('=== PSDeals listing new-items analyzer v2 ===')
  console.log(`File: ${filePath}`)
  console.log(`Collected items: ${rawItems.length}`)
  console.log(`Unique psdeals ids: ${uniqueItems.length}`)
  console.log(`Existing in DB: ${existingItems.length}`)
  console.log(`New in DB: ${newItems.length}`)
  console.log(`Page size used: ${pageSize}`)

  console.log('=== PAGE SUMMARY ===')
  for (const page of pageSummaries) {
    console.log(
      `page=${page.page} total=${page.total} existing=${page.existing} new=${page.new}`
    )
  }

  if (firstFullyKnownPage) {
    console.log(
      `[STOP RECOMMENDATION] First fully known page: ${firstFullyKnownPage.page}`
    )
  } else {
    console.log('[STOP RECOMMENDATION] No fully known page found in this sample.')
  }

  console.log('=== NEW ITEMS ===')
  for (const item of newItems) {
    console.log(
      `${item.psdeals_id} | page=${item.inferred_page} | ${item.title} | ${item.type_label} | ${item.platform_label} | ${item.psdeals_url}`
    )
  }

  if (outputTxt) {
    await fs.writeFile(path.resolve(process.cwd(), outputTxt), toTxt(newItems), 'utf8')
    console.log(`NEW_URLS_TXT: ${outputTxt}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})