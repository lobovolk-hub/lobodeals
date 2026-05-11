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
const browsePagesArg = process.argv.find((arg) => arg.startsWith('--browse-pages='))

const limit = limitArg ? Number(limitArg.split('=')[1]) : 20
const browsePages = browsePagesArg ? Number(browsePagesArg.split('=')[1]) : 133

if (!Number.isFinite(limit) || limit <= 0) {
  console.error('Invalid --limit value. Example: --limit=20')
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
    .replace(/[:]/g, ' ')
    .replace(/[']/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bplaystation\s*4(?:\s*edition)?\b/gi, ' ')
    .replace(/\bplaystation\s*5(?:\s*edition)?\b/gi, ' ')
    .replace(/\bplaystation4(?:\s*edition)?\b/gi, ' ')
    .replace(/\bplaystation5(?:\s*edition)?\b/gi, ' ')
    .replace(/\bps4\s*&\s*ps5\b/gi, ' ')
    .replace(/\bps4\s*\+\s*ps5\b/gi, ' ')
    .replace(/\bps4\b/gi, ' ')
    .replace(/\bps5\b/gi, ' ')
    .replace(/\b(year one|year-one)\s*edition\b/gi, ' ')
    .replace(
      /\b(digital deluxe|deluxe|ultimate|gold|premium deluxe|premium|tourist|collector.?s|starter|complete|apex)\s*edition\b/gi,
      ' '
    )
    .replace(/\bbundle\b/gi, ' ')
    .replace(/\bfree access\b/gi, ' ')
    .replace(/\bsave the world\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTitle(input) {
  return stripVariantWords(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function slugify(input) {
  return normalizeTitle(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
}

function stripOnlyDuplicateSuffix(slug) {
  const value = String(slug || '')
  const match = value.match(/^(.*)-(\d{1,2})$/)
  if (!match) return value

  const n = Number(match[2])
  if (Number.isFinite(n) && n >= 1 && n <= 20) {
    return match[1]
  }

  return value
}

function titlesMatchLoosely(a, b) {
  const left = normalizeTitle(a)
  const right = normalizeTitle(b)

  if (!left || !right) return false
  if (left === right) return true
  if (left.includes(right)) return true
  if (right.includes(left)) return true

  return false
}

function buildCandidateSlugs(title, existingSlug) {
  const candidates = new Set()

  const rawTitle = decodeHtmlEntities(String(title || '')).trim()
  const strippedTitle = stripVariantWords(rawTitle)

  if (rawTitle) candidates.add(slugify(rawTitle))
  if (strippedTitle) candidates.add(slugify(strippedTitle))

  const existing = stripOnlyDuplicateSuffix(existingSlug)
  if (existing) candidates.add(existing)

  let current = existing
  const patterns = [
    /-ps4-and-ps5$/i,
    /-ps4-plus-ps5$/i,
    /-ps4$/i,
    /-ps5$/i,
    /-playstation4-edition$/i,
    /-playstation5-edition$/i,
    /-playstation-4-edition$/i,
    /-playstation-5-edition$/i,
    /-(digital-deluxe|deluxe|ultimate|gold|premium-deluxe|premium|tourist|starter|complete|apex|year-one)-edition$/i,
    /-bundle$/i,
    /-free-access$/i,
    /-save-the-world$/i,
  ]

  let changed = true
  while (current && changed) {
    changed = false

    for (const pattern of patterns) {
      const next = current.replace(pattern, '').replace(/-+$/g, '')
      if (next !== current) {
        current = next
        if (current) candidates.add(current)
        changed = true
        break
      }
    }
  }

  return [...candidates].filter(Boolean)
}

const SPECIAL_METACRITIC_SLUG_ALIASES = [
  {
    matchTitle: 'marvels spider-man miles morales',
    slugs: ['marvels-spider-man-miles-morales'],
  },
  {
    matchTitle: 'marvels spider man miles morales',
    slugs: ['marvels-spider-man-miles-morales'],
  },
  {
    matchTitle: 'no mans sky',
    slugs: ['no-mans-sky'],
  },
]

function getSpecialCandidateSlugs(item) {
  const found = new Set()
  const normalized = normalizeTitle(item.title)
  const existingSlug = stripOnlyDuplicateSuffix(item.slug)

  for (const entry of SPECIAL_METACRITIC_SLUG_ALIASES) {
    if (normalized.includes(entry.matchTitle)) {
      for (const slug of entry.slugs) {
        found.add(slug)
      }
    }
  }

  if (existingSlug.includes('marvel-s-spider-man-miles-morales')) {
    found.add('marvels-spider-man-miles-morales')
  }

  if (existingSlug.includes('no-man-s-sky')) {
    found.add('no-mans-sky')
  }

  return [...found]
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

function parseBrowseEntries(html) {
  const entries = []
  const regex = /<a[^>]+href="\/game\/([^"?#]+)\/"[^>]*>([\s\S]*?)<\/a>/gi
  const seen = new Set()

  for (const match of html.matchAll(regex)) {
    const slug = match[1]
    const text = stripTags(match[2])

    if (!slug || !text) continue

    const titleMatch = text.match(
      /^\d+\.\s+(.*?)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\s+•/i
    )
    const title = titleMatch?.[1]?.trim()

    if (!title || title.length < 2) continue

    const key = `${slug}:${title}`
    if (seen.has(key)) continue
    seen.add(key)

    const scoreMatch = text.match(/(\d{2})\s+Metascore\s*$/i)
    const browseScore = scoreMatch?.[1] ? Number(scoreMatch[1]) : null

    entries.push({
      browsePlatform: 'ps',
      slug,
      title,
      normalizedTitle: normalizeTitle(title),
      browseScore: Number.isFinite(browseScore) ? browseScore : null,
      url: `https://www.metacritic.com/game/${slug}/`,
    })
  }

  return entries
}

async function buildBrowseIndex() {
  const allEntries = []

  for (let page = 1; page <= browsePages; page += 1) {
    const url = `https://www.metacritic.com/browse/game/?platform=ps4&platform=ps5&page=${page}`
    const html = await fetchHtml(url)
    allEntries.push(...parseBrowseEntries(html))
  }

  const byNormalizedTitle = new Map()
  const bySlug = new Map()

  for (const entry of allEntries) {
    if (!byNormalizedTitle.has(entry.normalizedTitle)) {
      byNormalizedTitle.set(entry.normalizedTitle, [])
    }
    byNormalizedTitle.get(entry.normalizedTitle).push(entry)

    if (!bySlug.has(entry.slug)) {
      bySlug.set(entry.slug, [])
    }
    bySlug.get(entry.slug).push(entry)
  }

  return {
    allEntries,
    byNormalizedTitle,
    bySlug,
  }
}

function extractBasePageTitle(html) {
  const titleMatch =
    html.match(/<title>([^<]+)<\/title>/i) ||
    html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)

  if (!titleMatch?.[1]) return null

  return decodeHtmlEntities(titleMatch[1])
    .replace(/\s*(Critic Reviews|Reviews)\s*-\s*Metacritic\s*$/i, '')
    .replace(/\s*-\s*Metacritic\s*$/i, '')
    .replace(/\s+for\s+PlayStation\s*[45]\s*$/i, '')
    .trim()
}

function extractPlatformScoresFromBasePage(html) {
  const text = stripTags(html)
  const results = []
  const seen = new Set()

  const regexes = [
    /(PlayStation 4|PlayStation 5)\s+Based on\s+([0-9,]+)\s+Critic Reviews\s+(tbd|[0-9]{2})/gi,
    /(PlayStation 4|PlayStation 5)\s+(tbd|[0-9]{2})\s+Based on\s+([0-9,]+)\s+Critic Reviews/gi,
  ]

  for (const regex of regexes) {
    for (const match of text.matchAll(regex)) {
      let platformLabel
      let reviews
      let rawScore

      if (regex === regexes[0]) {
        platformLabel = match[1]
        reviews = Number(String(match[2]).replace(/,/g, ''))
        rawScore = String(match[3]).toLowerCase()
      } else {
        platformLabel = match[1]
        rawScore = String(match[2]).toLowerCase()
        reviews = Number(String(match[3]).replace(/,/g, ''))
      }

      const platformKey = platformLabel === 'PlayStation 5' ? 'ps5' : 'ps4'
      const key = `${platformKey}:${rawScore}:${reviews}`
      if (seen.has(key)) continue
      seen.add(key)

      results.push({
        platformLabel,
        platformKey,
        reviewsCount: Number.isFinite(reviews) ? reviews : null,
        score: rawScore === 'tbd' ? null : Number(rawScore),
      })
    }
  }

  return results
}

function pickRelevantPlatform(itemPlatforms, platformScores) {
  const hasPS5 = Array.isArray(itemPlatforms) && itemPlatforms.includes('PS5')
  const hasPS4 = Array.isArray(itemPlatforms) && itemPlatforms.includes('PS4')

  if (hasPS5) {
    const ps5 = platformScores.find((x) => x.platformKey === 'ps5' && x.score !== null)
    if (ps5) return ps5
  }

  if (hasPS4) {
    const ps4 = platformScores.find((x) => x.platformKey === 'ps4' && x.score !== null)
    if (ps4) return ps4
  }

  if (hasPS5) {
    const ps5Any = platformScores.find((x) => x.platformKey === 'ps5')
    if (ps5Any) return ps5Any
  }

  if (hasPS4) {
    const ps4Any = platformScores.find((x) => x.platformKey === 'ps4')
    if (ps4Any) return ps4Any
  }

  return platformScores[0] || null
}

async function tryDirectBasePageMatch(item, candidateSlug) {
  const url = `https://www.metacritic.com/game/${candidateSlug}/`
  const baseHtml = await fetchHtml(url)

  const basePageTitle = extractBasePageTitle(baseHtml)
  const platformScores = extractPlatformScoresFromBasePage(baseHtml)
  const basePageSlug = slugify(basePageTitle)
  const cleanedCandidateSlug = stripOnlyDuplicateSuffix(candidateSlug)

  const titleLooksRight =
    titlesMatchLoosely(item.title, basePageTitle) ||
    titlesMatchLoosely(stripVariantWords(item.title), basePageTitle) ||
    cleanedCandidateSlug === basePageSlug ||
    cleanedCandidateSlug.includes(basePageSlug) ||
    basePageSlug.includes(cleanedCandidateSlug)

  if (!titleLooksRight) {
    return null
  }

  const chosenPlatform = pickRelevantPlatform(item.platforms, platformScores)

  return {
    slug: candidateSlug,
    url,
    chosenPlatform,
    sourceNote: 'direct base page',
  }
}

async function setQueueStatus(queueId, values) {
  const { error } = await admin.from('metacritic_queue').update(values).eq('id', queueId)

  if (error) {
    throw new Error(`Queue update failed: ${summarizeError(error)}`)
  }
}

console.log('Building Metacritic browse index...')
const browseIndex = await buildBrowseIndex()
console.log(`Browse entries loaded: ${browseIndex.allEntries.length}`)

const { data: queueRows, error: queueError } = await admin
  .from('metacritic_queue')
  .select(`
    id,
    item_id,
    title_snapshot,
    slug_snapshot,
    attempts
  `)
  .eq('status', 'pending')
  .lte('next_attempt_at', nowIso())
  .order('created_at', { ascending: true })
  .limit(limit)

if (queueError) {
  console.error(queueError)
  process.exit(1)
}

const rows = queueRows || []

if (rows.length === 0) {
  console.log('No pending Metacritic rows found.')
  process.exit(0)
}

for (const row of rows) {
  await setQueueStatus(row.id, {
    status: 'processing',
    attempts: (row.attempts ?? 0) + 1,
    locked_by: 'node_local_metacritic_browse',
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
        platforms
      `)
      .eq('id', row.item_id)
      .single()

    if (itemError || !item) {
      throw itemError || new Error('Catalog item not found')
    }

    const normalizedTitle = normalizeTitle(item.title)
    const normalizedBaseTitle = normalizeTitle(stripVariantWords(item.title))

    let matched = false
    let lastCheckedUrl = null

    // 1) direct base-page attempt first
    const directCandidateSlugs = [
  ...new Set([
    ...getSpecialCandidateSlugs(item),
    ...buildCandidateSlugs(item.title, item.slug),
  ]),
]

    for (const candidateSlug of directCandidateSlugs) {
      try {
        const directMatch = await tryDirectBasePageMatch(item, candidateSlug)

        if (!directMatch) {
          lastCheckedUrl = `https://www.metacritic.com/game/${candidateSlug}/`
          continue
        }

        const { error: updateError } = await admin
          .from('catalog_items')
          .update({
            metacritic_slug: directMatch.slug,
            metacritic_platform: directMatch.chosenPlatform?.platformKey || null,
            metacritic_url: directMatch.url,
            metacritic_score: directMatch.chosenPlatform?.score ?? null,
            metacritic_reviews_count: directMatch.chosenPlatform?.reviewsCount ?? null,
            metacritic_match_status:
              directMatch.chosenPlatform?.score !== null ? 'matched' : 'manual_review',
            metacritic_last_synced_at: nowIso(),
            metacritic_source_note: directMatch.sourceNote,
          })
          .eq('id', item.id)

        if (updateError) throw updateError

        await setQueueStatus(row.id, {
          status: directMatch.chosenPlatform?.score !== null ? 'done' : 'manual_review',
          locked_by: null,
          last_error:
            directMatch.chosenPlatform?.score !== null
              ? null
              : 'Matched direct base page but no usable platform score.',
          next_attempt_at: nowIso(),
        })

        console.log(
          `${item.title} -> ${directMatch.slug} | platform=${directMatch.chosenPlatform?.platformKey || 'unknown'} | score=${directMatch.chosenPlatform?.score ?? 'null'} | status=${directMatch.chosenPlatform?.score !== null ? 'done' : 'manual_review'}`
        )

        matched = true
        break
      } catch {
        lastCheckedUrl = `https://www.metacritic.com/game/${candidateSlug}/`
      }
    }

    if (matched) {
      continue
    }

    // 2) browse index fallback
    const candidates = []
    const pushCandidateArray = (arr) => {
      for (const entry of arr || []) {
        candidates.push(entry)
      }
    }

    pushCandidateArray(browseIndex.byNormalizedTitle.get(normalizedTitle))
    if (normalizedBaseTitle !== normalizedTitle) {
      pushCandidateArray(browseIndex.byNormalizedTitle.get(normalizedBaseTitle))
    }

    for (const candidateSlug of [
  ...new Set([
    ...getSpecialCandidateSlugs(item),
    ...buildCandidateSlugs(item.title, item.slug),
  ]),
]) {
  pushCandidateArray(browseIndex.bySlug.get(candidateSlug))
}

    const deduped = []
    const seen = new Set()

    for (const entry of candidates) {
      const key = `${entry.browsePlatform}:${entry.slug}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(entry)
    }

    for (const candidate of deduped) {
      lastCheckedUrl = candidate.url

      const baseHtml = await fetchHtml(candidate.url)
      const basePageTitle = extractBasePageTitle(baseHtml)
      const basePageNormalizedTitle = normalizeTitle(basePageTitle)
      const platformScores = extractPlatformScoresFromBasePage(baseHtml)

      const titleLooksRight =
        basePageNormalizedTitle === normalizedTitle ||
        basePageNormalizedTitle === normalizedBaseTitle ||
        normalizedTitle === normalizeTitle(candidate.title) ||
        normalizedBaseTitle === normalizeTitle(candidate.title) ||
        titlesMatchLoosely(item.title, basePageTitle) ||
        titlesMatchLoosely(stripVariantWords(item.title), basePageTitle)

      if (!titleLooksRight) {
        continue
      }

      const chosenPlatform = pickRelevantPlatform(item.platforms, platformScores)

      const { error: updateError } = await admin
        .from('catalog_items')
        .update({
          metacritic_slug: candidate.slug,
          metacritic_platform: chosenPlatform?.platformKey || candidate.browsePlatform,
          metacritic_url: candidate.url,
          metacritic_score: chosenPlatform?.score ?? null,
          metacritic_reviews_count: chosenPlatform?.reviewsCount ?? null,
          metacritic_match_status:
            chosenPlatform?.score !== null ? 'matched' : 'manual_review',
          metacritic_last_synced_at: nowIso(),
          metacritic_source_note: `browse-index ${candidate.browsePlatform} + base page`,
        })
        .eq('id', item.id)

      if (updateError) throw updateError

      await setQueueStatus(row.id, {
        status: chosenPlatform?.score !== null ? 'done' : 'manual_review',
        locked_by: null,
        last_error:
          chosenPlatform?.score !== null
            ? null
            : 'Matched browse/base page but no usable platform score.',
        next_attempt_at: nowIso(),
      })

      console.log(
        `${item.title} -> ${candidate.slug} | platform=${chosenPlatform?.platformKey || candidate.browsePlatform} | score=${chosenPlatform?.score ?? 'null'} | status=${chosenPlatform?.score !== null ? 'done' : 'manual_review'}`
      )

      matched = true
      break
    }

    if (!matched) {
      await admin
        .from('catalog_items')
        .update({
          metacritic_match_status: 'not_found',
          metacritic_last_synced_at: nowIso(),
          metacritic_source_note: 'No browse/base-page Metacritic match found.',
        })
        .eq('id', row.item_id)

      await setQueueStatus(row.id, {
        status: 'manual_review',
        locked_by: null,
        last_error: `No Metacritic match found. Last checked: ${lastCheckedUrl || 'none'}`,
        next_attempt_at: nowIso(),
      })

      console.log(`${row.title_snapshot} -> manual_review`)
    }
  } catch (error) {
    const message = summarizeError(error)

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