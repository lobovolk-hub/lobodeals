import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const index = trimmed.indexOf('=')
    if (index === -1) continue

    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '')

    process.env[key] = value
  }
}

function parsePsDealsId(url) {
  const match = url.match(/\/game\/(\d+)\//)
  return match ? Number(match[1]) : null
}

function chunkArray(items, size) {
  const chunks = []

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }

  return chunks
}

loadEnv('.env.local')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local')
}

const input = process.argv[2] || 'data/import/psdeals-detail-batch-005001-end.txt'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')

const rawUrls = fs
  .readFileSync(input, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)

const rows = rawUrls.map((url, index) => ({
  index,
  lineNumber: index + 1,
  url,
  psdeals_id: parsePsDealsId(url),
}))

const invalidRows = rows.filter((row) => row.psdeals_id === null)
const expectedIds = [...new Set(rows.map((row) => row.psdeals_id).filter(Boolean))]

const supabase = createClient(supabaseUrl, supabaseKey)

const foundIds = new Set()
const chunks = chunkArray(expectedIds, 200)

for (let i = 0; i < chunks.length; i += 1) {
  const chunk = chunks[i]

  const { data, error } = await supabase
    .from('psdeals_stage_items')
    .select('psdeals_id')
    .eq('region_code', 'us')
    .eq('storefront', 'playstation')
    .in('psdeals_id', chunk)

  if (error) {
    console.error('Supabase error in chunk', i + 1, error)
    process.exit(1)
  }

  for (const item of data || []) {
    foundIds.add(Number(item.psdeals_id))
  }

  if ((i + 1) % 10 === 0 || i + 1 === chunks.length) {
    console.log(`[CHECK] chunks=${i + 1}/${chunks.length} found=${foundIds.size}`)
  }
}

let lastImportedIndex = -1

for (const row of rows) {
  if (row.psdeals_id !== null && foundIds.has(row.psdeals_id)) {
    lastImportedIndex = Math.max(lastImportedIndex, row.index)
  }
}

const imported = rows.filter(
  (row) => row.psdeals_id !== null && foundIds.has(row.psdeals_id)
)

const likelyFailedBeforeStop = rows.filter(
  (row) =>
    row.index <= lastImportedIndex &&
    row.psdeals_id !== null &&
    !foundIds.has(row.psdeals_id)
)

const notYetReached = rows.filter(
  (row) =>
    row.index > lastImportedIndex &&
    row.psdeals_id !== null &&
    !foundIds.has(row.psdeals_id)
)

const outputDir = path.dirname(input)
const base = path.basename(input, '.txt')

const failedPath = path.join(outputDir, `${base}-likely-failed-before-stop-${stamp}.txt`)
const notYetPath = path.join(outputDir, `${base}-not-yet-reached-${stamp}.txt`)
const importedPath = path.join(outputDir, `${base}-already-imported-${stamp}.txt`)
const summaryPath = path.join(outputDir, `${base}-reconcile-summary-${stamp}.json`)

fs.writeFileSync(
  failedPath,
  likelyFailedBeforeStop.map((row) => row.url).join('\n') + (likelyFailedBeforeStop.length ? '\n' : ''),
  'utf8'
)

fs.writeFileSync(
  notYetPath,
  notYetReached.map((row) => row.url).join('\n') + (notYetReached.length ? '\n' : ''),
  'utf8'
)

fs.writeFileSync(
  importedPath,
  imported.map((row) => row.url).join('\n') + (imported.length ? '\n' : ''),
  'utf8'
)

const summary = {
  input,
  total_urls: rows.length,
  invalid_urls: invalidRows.length,
  expected_unique_ids: expectedIds.length,
  found_in_db: foundIds.size,
  last_imported_line_number: lastImportedIndex >= 0 ? lastImportedIndex + 1 : null,
  last_imported_url: lastImportedIndex >= 0 ? rows[lastImportedIndex].url : null,
  likely_failed_before_stop: likelyFailedBeforeStop.length,
  not_yet_reached: notYetReached.length,
  outputs: {
    likely_failed_before_stop: failedPath,
    not_yet_reached: notYetPath,
    already_imported: importedPath,
    summary: summaryPath,
  },
}

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8')

console.log(summary)
