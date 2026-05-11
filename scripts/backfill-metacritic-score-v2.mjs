import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const METACRITIC_NEWEST_URL =
  'https://www.metacritic.com/browse/game/all/all/all-time/new/?platform=ps4&platform=ps5'

const DEFAULT_BROWSE_PAGES = 80
const DEFAULT_DELAY_MS = 750

const MONTHS = new Map([
  ['jan', '01'],
  ['feb', '02'],
  ['mar', '03'],
  ['apr', '04'],
  ['may', '05'],
  ['jun', '06'],
  ['jul', '07'],
  ['aug', '08'],
  ['sep', '09'],
  ['oct', '10'],
  ['nov', '11'],
  ['dec', '12'],
])

function nowIso() {
  return new Date().toISOString()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function getBooleanArg(args, key, defaultValue) {
  if (!args.has(key)) return defaultValue

  const value = String(args.get(key)).trim().toLowerCase()
  if (['1', 'true', 'yes', 'y'].includes(value)) return true
  if (['0', 'false', 'no', 'n'].includes(value)) return false

  throw new Error(`Invalid --${key} value. Use true or false.`)
}

function getNumberArg(args, key, defaultValue) {
  if (!args.has(key)) return defaultValue

  const value = Number(args.get(key))
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid --${key} value.`)
  }

  return value
}

function requireDateArg(args, key) {
  const value = args.get(key)
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Missing or invalid --${key}. Example: --${key}=2026-04-01`)
  }

  return value
}

function parseOptionalSlugFilter(args) {
  if (!args.has('slugs')) return []

  return String(args.get('slugs'))
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
}

function stripTags(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function stripVariantWords(input) {
  return decodeHtmlEntities(String(input || ''))
    .replace(/™|®/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bps4\s*&\s*ps5\b/gi, ' ')
    .replace(/\bps4\s*\+\s*ps5\b/gi, ' ')
    .replace(/\bps4\b/gi, ' ')
    .replace(/\bps5\b/gi, ' ')
    .replace(/\bplaystation\s*4(?:\s*edition)?\b/gi, ' ')
    .replace(/\bplaystation\s*5(?:\s*edition)?\b/gi, ' ')
    .replace(/\bplaystation4(?:\s*edition)?\b/gi, ' ')
    .replace(/\bplaystation5(?:\s*edition)?\b/gi, ' ')
    .replace(
      /\b(digital deluxe|deluxe|ultimate|gold|premium deluxe|premium|special|standard|collector.?s|complete|definitive|anniversary|founder.?s|starter|apex|tourist|brutal|r.?lyeh|feathered adventurer|fired up|essence)\s*edition\b/gi,
      ' '
    )
    .replace(
      /\b(digital deluxe|deluxe|ultimate|gold|premium deluxe|premium|special|standard|complete|definitive)\b/gi,
      ' '
    )
    .replace(/\b(bundle|pack|upgrade)\b/gi, ' ')
    .replace(/\bfree to play\b/gi, ' ')
    .replace(/\bpre[- ]order\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTitle(input) {
  return stripVariantWords(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(input) {
  return normalizeTitle(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
}

function stripOnlyDuplicateSuffix(slug) {
  return String(slug || '')
}

function parseMetacriticDate(monthName, day, year) {
  const month = MONTHS.get(String(monthName || '').slice(0, 3).toLowerCase())
  if (!month) return null

  const dayPadded = String(day).padStart(2, '0')
  return `${year}-${month}-${dayPadded}`
}

function isDateInRange(date, fromDate, toDate) {
  return date >= fromDate && date <= toDate
}

function buildBrowsePageUrl(page) {
  if (page <= 1) return METACRITIC_NEWEST_URL
  return `${METACRITIC_NEWEST_URL}&page=${page}`
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.9',
    },
  })

  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status} for ${url}`)
  }

  return await response.text()
}

function parseBrowseEntries(html) {
  const entries = []
  const seen = new Set()

  const regex = /<a[^>]+href="\/game\/([^"?#]+)\/"[^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(regex)) {
    const metacriticSlug = decodeHtmlEntities(match[1] || '').trim()
    const text = stripTags(match[2])

    if (!metacriticSlug || !text) continue

    const dateMatch = text.match(
      /^(.*?)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})\b/i
    )

    if (!dateMatch) continue

    const title = decodeHtmlEntities(dateMatch[1]).trim()
    const releaseDate = parseMetacriticDate(
      dateMatch[2],
      dateMatch[3],
      dateMatch[4]
    )

    if (!title || !releaseDate) continue

    const scoreMatch = text.match(/\b([0-9]{1,3})\s+Metascore\b/i)
    if (!scoreMatch) continue

    const metacriticScore = Number(scoreMatch[1])
    if (
      !Number.isInteger(metacriticScore) ||
      metacriticScore < 0 ||
      metacriticScore > 100
    ) {
      continue
    }

    const key = `${metacriticSlug}:${releaseDate}:${metacriticScore}:${title}`
    if (seen.has(key)) continue
    seen.add(key)

    entries.push({
      title,
      normalizedTitle: normalizeTitle(title),
      titleSlug: slugify(title),
      metacriticSlug,
      releaseDate,
      metacriticScore,
      metacriticUrl: `https://www.metacritic.com/game/${metacriticSlug}/`,
    })
  }

  return entries
}

async function collectMetacriticEntriesInRange({
  fromDate,
  toDate,
  browsePages,
  delayMs,
  slugFilter,
}) {
  const allEntries = []
  const dedupe = new Set()
  let sawInRange = false
  let emptyPages = 0
  let stopReason = null

  const slugFilterSet = new Set(slugFilter)

  for (let page = 1; page <= browsePages; page += 1) {
    const url = buildBrowsePageUrl(page)

    let pageEntries = []
    try {
      const html = await fetchHtml(url)
      pageEntries = parseBrowseEntries(html)
    } catch (error) {
      console.warn(`[BROWSE WARNING] page=${page} ${summarizeError(error)}`)
      pageEntries = []
    }

    if (pageEntries.length === 0) {
      emptyPages += 1
    } else {
      emptyPages = 0
    }

    const pageDates = pageEntries.map((entry) => entry.releaseDate).sort()
    const oldest = pageDates[0] || null
    const newest = pageDates[pageDates.length - 1] || null

    let pageInRange = 0
    let pageAdded = 0

    for (const entry of pageEntries) {
      if (!isDateInRange(entry.releaseDate, fromDate, toDate)) continue

      if (
        slugFilterSet.size > 0 &&
        !slugFilterSet.has(entry.metacriticSlug) &&
        !slugFilterSet.has(entry.titleSlug)
      ) {
        continue
      }

      pageInRange += 1
      sawInRange = true

      const key = `${entry.metacriticSlug}:${entry.releaseDate}:${entry.metacriticScore}`
      if (dedupe.has(key)) continue
      dedupe.add(key)

      allEntries.push(entry)
      pageAdded += 1
    }

    console.log(
      `[BROWSE] page=${page}/${browsePages} entries_with_score=${pageEntries.length} in_range=${pageInRange} added=${pageAdded} total=${allEntries.length} oldest=${oldest || 'none'} newest=${newest || 'none'}`
    )

    if (emptyPages >= 3) {
  console.warn(
    `[BROWSE WARNING] ${emptyPages} consecutive empty parsed pages; continuing because date-based stop is safer.`
  )
}

    if (sawInRange && oldest && oldest < fromDate) {
      stopReason = `stopped because browse reached dates older than ${fromDate}`
      break
    }

    if (delayMs > 0 && page < browsePages) {
      await sleep(delayMs)
    }
  }

  return {
    entries: allEntries,
    stopReason,
  }
}

async function fetchAllRows(buildQuery, pageSize = 1000) {
  const rows = []

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await buildQuery().range(from, to)

    if (error) throw error

    rows.push(...(data || []))

    if (!data || data.length < pageSize) break
  }

  return rows
}

function compactKey(input) {
  return slugify(input).replace(/-/g, '')
}

function indexBaseItems(items) {
  const bySlug = new Map()
  const byTitle = new Map()
  const byTitleSlug = new Map()
  const byCompactSlug = new Map()
  const byCompactTitle = new Map()

  function add(map, key, item) {
    if (!key) return

    if (!map.has(key)) {
      map.set(key, [])
    }

    map.get(key).push(item)
  }

  for (const item of items) {
    const cleanSlug = stripOnlyDuplicateSuffix(item.psdeals_slug)
    const normalizedTitle = normalizeTitle(item.title)
    const normalizedTitleSlug = slugify(item.title)
    const compactSlug = compactKey(cleanSlug)
    const compactTitle = compactKey(item.title)

    add(bySlug, cleanSlug, item)
    add(byTitle, normalizedTitle, item)
    add(byTitleSlug, normalizedTitleSlug, item)
    add(byCompactSlug, compactSlug, item)
    add(byCompactTitle, compactTitle, item)
  }

  return {
    bySlug,
    byTitle,
    byTitleSlug,
    byCompactSlug,
    byCompactTitle,
  }
}

function sameCalendarMonth(leftDate, rightDate) {
  if (!leftDate || !rightDate) return false
  return leftDate.slice(0, 7) === rightDate.slice(0, 7)
}

function findBaseMatches(entry, baseIndex) {
  const candidatesById = new Map()

  function addCandidates(candidates, reason) {
    for (const candidate of candidates || []) {
      if (!sameCalendarMonth(candidate.release_date, entry.releaseDate)) continue

      candidatesById.set(candidate.id, {
        ...candidate,
        match_reason: reason,
      })
    }
  }

  const compactMetacriticSlug = compactKey(entry.metacriticSlug)
  const compactTitleSlug = compactKey(entry.titleSlug)
  const compactTitle = compactKey(entry.title)

  addCandidates(baseIndex.bySlug.get(entry.metacriticSlug), 'slug_exact')
  addCandidates(baseIndex.bySlug.get(entry.titleSlug), 'title_slug_exact')
  addCandidates(baseIndex.byTitle.get(entry.normalizedTitle), 'title_exact')
  addCandidates(baseIndex.byTitleSlug.get(entry.titleSlug), 'title_slug_index')
  addCandidates(baseIndex.byCompactSlug.get(compactMetacriticSlug), 'compact_metacritic_slug')
  addCandidates(baseIndex.byCompactSlug.get(compactTitleSlug), 'compact_title_slug')
  addCandidates(baseIndex.byCompactTitle.get(compactTitle), 'compact_title')

  return [...candidatesById.values()]
}

function isClearEditionBundle(baseItem, candidate) {
  if (candidate.content_type !== 'bundle') return false
  if (candidate.item_type_label !== 'bundle') return false

  const baseSlug = stripOnlyDuplicateSuffix(baseItem.psdeals_slug)
  const candidateSlug = stripOnlyDuplicateSuffix(candidate.psdeals_slug)

  const suffix = candidateSlug.startsWith(`${baseSlug}-`)
    ? candidateSlug.slice(baseSlug.length + 1)
    : ''

  const allowedEditionSuffixes = [
    'digital-deluxe-edition',
    'deluxe-edition',
    'ultimate-edition',
    'gold-edition',
    'premium-edition',
    'premium-deluxe-edition',
    'special-edition',
    'standard-edition',
    'complete-edition',
    'definitive-edition',
    'anniversary-edition',
    'collectors-edition',
    'collector-s-edition',
    'founders-edition',
    'founder-s-edition',
    'tourist-edition',
    'brutal-edition',
    'rlyeh-edition',
    'feathered-adventurer-edition',
    'fired-up-edition',
    'essence-edition',
    'deluxe',
    'ultimate',
    'gold',
    'premium',
    'complete',
    'definitive',
  ]

  if (suffix && allowedEditionSuffixes.includes(suffix)) {
    return true
  }

  const normalizedBase = normalizeTitle(baseItem.title)
  const normalizedCandidate = normalizeTitle(candidate.title)
  const normalizedCandidateWithoutVariants = normalizeTitle(stripVariantWords(candidate.title))

  if (normalizedCandidate === normalizedBase) {
    return true
  }

  if (normalizedCandidateWithoutVariants === normalizedBase) {
    return true
  }

  return false
}

async function findEditionBundles(admin, baseItem) {
  const baseSlug = stripOnlyDuplicateSuffix(baseItem.psdeals_slug)
  const found = new Map()

  const queries = [
    admin
      .from('psdeals_stage_items')
      .select('id,title,psdeals_slug,content_type,item_type_label,metacritic_score')
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .eq('content_type', 'bundle')
      .eq('item_type_label', 'bundle')
      .ilike('psdeals_slug', `${baseSlug}-%`)
      .limit(100),
    admin
      .from('psdeals_stage_items')
      .select('id,title,psdeals_slug,content_type,item_type_label,metacritic_score')
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .eq('content_type', 'bundle')
      .eq('item_type_label', 'bundle')
      .ilike('title', `${baseItem.title}%`)
      .limit(100),
  ]

  for (const query of queries) {
    const { data, error } = await query
    if (error) throw error

    for (const row of data || []) {
      if (row.id === baseItem.id) continue
      if (!isClearEditionBundle(baseItem, row)) continue

      found.set(row.id, row)
    }
  }

  return [...found.values()]
}

async function updateMetacriticScore(admin, item, score, dryRun, onlyMissing) {
  const previous = item.metacritic_score

  if (previous === score) {
    return { changed: false, reason: 'same_score' }
  }

  if (onlyMissing && previous !== null && previous !== undefined) {
    return { changed: false, reason: 'skipped_existing_score' }
  }

  if (dryRun) {
    return { changed: true, reason: 'dry_run' }
  }

  const { error } = await admin
    .from('psdeals_stage_items')
    .update({ metacritic_score: score })
    .eq('id', item.id)

  if (error) throw error

  return { changed: true, reason: 'updated' }
}

async function main() {
  const args = parseArgs(process.argv)

  const fromDate = requireDateArg(args, 'from')
  const toDate = requireDateArg(args, 'to')
  const dryRun = getBooleanArg(args, 'dry-run', true)
  const onlyMissing = getBooleanArg(args, 'only-missing', false)
  const refreshCache = getBooleanArg(args, 'refresh-cache', false)
  const browsePages = getNumberArg(args, 'browse-pages', DEFAULT_BROWSE_PAGES)
  const delayMs = getNumberArg(args, 'delay-ms', DEFAULT_DELAY_MS)
  const limit = getNumberArg(args, 'limit', 0)
  const slugFilter = parseOptionalSlugFilter(args)

  if (browsePages < 1) {
    throw new Error('Invalid --browse-pages. Use 1 or more.')
  }

  if (delayMs < 0) {
    throw new Error('Invalid --delay-ms. Use 0 or more.')
  }

  if (limit < 0) {
    throw new Error('Invalid --limit. Use 0 for no limit, or a positive number.')
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

  console.log('=== LoboDeals Metacritic score backfill v2 browse-first ===')
  console.log(`Range: ${fromDate} to ${toDate}`)
  console.log(`Dry run: ${dryRun}`)
  console.log(`Only missing: ${onlyMissing}`)
  console.log(`Browse pages max: ${browsePages}`)
  console.log(`Delay: ${delayMs}ms`)
  console.log(`Limit: ${limit === 0 ? 'none' : limit}`)
  console.log(`Slug filter: ${slugFilter.length ? slugFilter.join(', ') : 'none'}`)
  console.log(`Source: ${METACRITIC_NEWEST_URL}`)
  console.log(`Started at: ${nowIso()}`)

  const { entries: collectedEntries, stopReason } = await collectMetacriticEntriesInRange({
    fromDate,
    toDate,
    browsePages,
    delayMs,
    slugFilter,
  })

  const metacriticEntries =
    limit > 0 ? collectedEntries.slice(0, limit) : collectedEntries

  console.log(`Metacritic entries in range with score: ${metacriticEntries.length}`)
  if (stopReason) {
    console.log(`[BROWSE STOP] ${stopReason}`)
  }

  if (metacriticEntries.length === 0) {
    console.log('No Metacritic scored entries found in range.')
    return
  }

  const baseItems = await fetchAllRows(() =>
    admin
      .from('psdeals_stage_items')
      .select(`
        id,
        title,
        psdeals_slug,
        platforms,
        release_date,
        content_type,
        item_type_label,
        metacritic_score
      `)
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .eq('content_type', 'game')
      .eq('item_type_label', 'game')
      .gte('release_date', fromDate)
      .lte('release_date', toDate)
      .order('release_date', { ascending: true })
      .order('title', { ascending: true })
  )

  console.log(`PSDeals base game candidates loaded: ${baseItems.length}`)

  const baseIndex = indexBaseItems(baseItems)

  const summary = {
    metacriticEntriesInRangeWithScore: metacriticEntries.length,
    matchedMetacriticEntries: 0,
    unmatchedMetacriticEntries: 0,
    baseRowsChanged: 0,
    baseRowsSameScore: 0,
    bundlesMatchedForPropagation: 0,
    bundleRowsChanged: 0,
    bundleRowsSameScore: 0,
    errors: 0,
  }

  const unmatchedEntries = []

  for (const entry of metacriticEntries) {
    try {
      console.log(
        `[MC] ${entry.title} | date=${entry.releaseDate} | score=${entry.metacriticScore} | slug=${entry.metacriticSlug}`
      )

      const baseMatches = findBaseMatches(entry, baseIndex)

      if (baseMatches.length === 0) {
        summary.unmatchedMetacriticEntries += 1
        unmatchedEntries.push(entry)

        console.log(
          `[UNMATCHED MC] ${entry.title} | date=${entry.releaseDate} | score=${entry.metacriticScore} | slug=${entry.metacriticSlug}`
        )
        continue
      }

      summary.matchedMetacriticEntries += 1

      for (const baseItem of baseMatches) {
        const baseUpdate = await updateMetacriticScore(
  admin,
  baseItem,
  entry.metacriticScore,
  dryRun,
  onlyMissing
)

        if (baseUpdate.changed) summary.baseRowsChanged += 1
        if (baseUpdate.reason === 'same_score') summary.baseRowsSameScore += 1

        console.log(
          `[BASE ${baseUpdate.reason.toUpperCase()}] ${baseItem.title} | ${baseItem.metacritic_score ?? 'null'} -> ${entry.metacriticScore} | psdeals=${baseItem.psdeals_slug} | match=${baseItem.match_reason}`
        )

        const bundles = await findEditionBundles(admin, baseItem)
        summary.bundlesMatchedForPropagation += bundles.length

        for (const bundle of bundles) {
          const bundleUpdate = await updateMetacriticScore(
  admin,
  bundle,
  entry.metacriticScore,
  dryRun,
  onlyMissing
)

          if (bundleUpdate.changed) summary.bundleRowsChanged += 1
          if (bundleUpdate.reason === 'same_score') summary.bundleRowsSameScore += 1

          console.log(
            `[BUNDLE ${bundleUpdate.reason.toUpperCase()}] ${bundle.title} | ${bundle.metacritic_score ?? 'null'} -> ${entry.metacriticScore} | base=${baseItem.title}`
          )
        }
      }
    } catch (error) {
      summary.errors += 1
      console.error(`[ERROR] ${entry.title} | ${summarizeError(error)}`)
    }
  }

  if (!dryRun && refreshCache) {
    const { data, error } = await admin.rpc('refresh_catalog_public_cache_v15')

    if (error) {
      throw error
    }

    console.log('[CACHE REFRESH] refresh_catalog_public_cache_v15 result:')
    console.log(JSON.stringify(data, null, 2))
  } else if (refreshCache && dryRun) {
    console.log('[CACHE REFRESH SKIPPED] dry-run=true')
  }

  if (unmatchedEntries.length > 0) {
    console.log('=== UNMATCHED METACRITIC ENTRIES ===')
    for (const entry of unmatchedEntries) {
      console.log(
        `${entry.releaseDate} | ${entry.metacriticScore} | ${entry.title} | ${entry.metacriticSlug}`
      )
    }
  }

  console.log('=== SUMMARY ===')
  console.log(JSON.stringify(summary, null, 2))
  console.log(`Finished at: ${nowIso()}`)

  if (dryRun) {
    console.log('No database rows were changed because --dry-run=true.')
  }
}

main().catch((error) => {
  console.error(summarizeError(error))
  process.exit(1)
})