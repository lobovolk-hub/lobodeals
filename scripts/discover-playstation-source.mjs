import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const sourceArg = process.argv.find((arg) => arg.startsWith('--source='))
const pageLimitArg = process.argv.find((arg) => arg.startsWith('--pages='))

const sourceKey = sourceArg ? sourceArg.split('=')[1] : 'browse_all_games'
const pageLimit = pageLimitArg ? Number(pageLimitArg.split('=')[1]) : 5

if (!Number.isFinite(pageLimit) || pageLimit <= 0) {
  console.error('Invalid --pages value. Example: --pages=3')
  process.exit(1)
}

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

function buildPageUrl(sourceUrl, pageNumber) {
  if (sourceUrl.includes('/category/')) {
    return sourceUrl.replace(/\/\d+$/, `/${pageNumber}`)
  }

  if (sourceUrl.includes('/pages/browse')) {
    const url = new URL(sourceUrl)
    url.searchParams.set('page', String(pageNumber))
    return url.toString()
  }

  return sourceUrl
}

function summarizeError(error) {
  if (!error) return 'Unknown error'
  if (error instanceof Error) return error.message
  return String(error)
}

function extractPlayStationTargets(html) {
  const patterns = [
    /(?:https:\/\/store\.playstation\.com)?\/en-us\/(product|concept)\/([^"'\\\s<]+)/gi,
    /"(?:https:\\\/\\\/store\.playstation\.com)?\\\/en-us\\\/(product|concept)\\\/([^"\\]+)"/gi
  ]

  const found = new Map()

  for (const regex of patterns) {
    for (const match of html.matchAll(regex)) {
      const idType = match[1]
      const primaryId = match[2]
        .replace(/\\u002F/g, '/')
        .replace(/\\\//g, '/')
        .replace(/\/+$/, '')

      const fullUrl = `https://store.playstation.com/en-us/${idType}/${primaryId}`
      const key = `${idType}:${primaryId}`

      if (!found.has(key)) {
        found.set(key, {
          store_url: fullUrl,
          ps_store_id_type: idType,
          ps_store_primary_id: primaryId,
        })
      }
    }
  }

  return [...found.values()]
}

const { data: progressRow, error: progressError } = await admin
  .from('ps_discovery_progress')
  .select('*')
  .eq('source_key', sourceKey)
  .maybeSingle()

if (progressError || !progressRow) {
  console.error(`Discovery source not found: ${sourceKey}`)
  process.exit(1)
}

if (progressRow.status === 'done') {
  console.log(`Source ${sourceKey} is already marked as done.`)
  process.exit(0)
}

const baseFound = progressRow.urls_found_total ?? 0
const baseInserted = progressRow.urls_inserted_total ?? 0
const baseIgnored = progressRow.urls_ignored_total ?? 0

await admin
  .from('ps_discovery_progress')
  .update({
    status: 'running',
    runs_started: (progressRow.runs_started ?? 0) + 1,
    last_run_started_at: new Date().toISOString(),
    last_error: null,
  })
  .eq('source_key', sourceKey)

let currentPage = progressRow.current_page || 1
let processedPages = 0
let urlsFoundThisRun = 0
let urlsInsertedThisRun = 0
let urlsIgnoredThisRun = 0
let stoppedBecauseNoResults = false

try {
  while (processedPages < pageLimit) {
    const pageUrl = buildPageUrl(progressRow.source_url, currentPage)

    console.log(`Fetching page ${currentPage}: ${pageUrl}`)

    const response = await fetch(pageUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
    })

    if (!response.ok) {
      throw new Error(`Fetch failed on page ${currentPage} with status ${response.status}`)
    }

    const html = await response.text()
    const targets = extractPlayStationTargets(html)

    if (targets.length === 0) {
  if (currentPage === 1 && processedPages === 0) {
    throw new Error(
      `No targets found on the first page for source "${sourceKey}". Extraction likely failed or the page shape changed.`
    )
  }

  stoppedBecauseNoResults = true
  console.log(`No targets found on page ${currentPage}. Stopping source.`)
  break
}

    urlsFoundThisRun += targets.length

    for (const target of targets) {
      const { error: insertError } = await admin
        .from('ps_ingest_queue')
        .insert({
          region_code: 'us',
          storefront: 'playstation',
          store_url: target.store_url,
          ps_store_id_type: target.ps_store_id_type,
          ps_store_primary_id: target.ps_store_primary_id,
          status: 'pending',
          priority: 100,
          source_name: 'playstation_discovery',
          next_attempt_at: new Date().toISOString(),
        })

      if (!insertError) {
        urlsInsertedThisRun += 1
        continue
      }

      if (insertError.code === '23505') {
        urlsIgnoredThisRun += 1
        continue
      }

      throw insertError
    }

    processedPages += 1

    await admin
      .from('ps_discovery_progress')
      .update({
        current_page: currentPage + 1,
        last_page_seen: currentPage,
        urls_found_total: baseFound + urlsFoundThisRun,
        urls_inserted_total: baseInserted + urlsInsertedThisRun,
        urls_ignored_total: baseIgnored + urlsIgnoredThisRun,
        last_error: null,
      })
      .eq('source_key', sourceKey)

    currentPage += 1
  }

  await admin
    .from('ps_discovery_progress')
    .update({
      status: stoppedBecauseNoResults ? 'done' : 'running',
      current_page: currentPage,
      last_page_seen: currentPage - 1,
      urls_found_total: baseFound + urlsFoundThisRun,
      urls_inserted_total: baseInserted + urlsInsertedThisRun,
      urls_ignored_total: baseIgnored + urlsIgnoredThisRun,
      last_run_finished_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('source_key', sourceKey)

  console.log('Discovery run completed.')
  console.log(`Source: ${sourceKey}`)
  console.log(`Pages processed: ${processedPages}`)
  console.log(`URLs found this run: ${urlsFoundThisRun}`)
  console.log(`URLs inserted this run: ${urlsInsertedThisRun}`)
  console.log(`URLs ignored this run: ${urlsIgnoredThisRun}`)
  console.log(`Next page: ${currentPage}`)
  console.log(`Stopped because no results: ${stoppedBecauseNoResults}`)
} catch (error) {
  const message = summarizeError(error)

  await admin
    .from('ps_discovery_progress')
    .update({
      status: 'failed',
      current_page: currentPage,
      last_run_finished_at: new Date().toISOString(),
      last_error: message,
      urls_found_total: baseFound + urlsFoundThisRun,
      urls_inserted_total: baseInserted + urlsInsertedThisRun,
      urls_ignored_total: baseIgnored + urlsIgnoredThisRun,
    })
    .eq('source_key', sourceKey)

  console.error('Discovery run failed:')
  console.error(message)
  process.exit(1)
}