import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  const raw = fs.readFileSync(filePath, 'utf8')
  const env = {}

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

function loadProjectEnv() {
  const envLocal = loadEnvFile(path.join(PROJECT_ROOT, '.env.local'))
  const env = { ...envLocal, ...process.env }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local / environment'
    )
  }

  return {
    supabaseUrl,
    serviceRoleKey,
  }
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™©]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractReleaseYear(text) {
  const match = String(text || '').match(/\b(19|20)\d{2}\b/)
  return match ? Number(match[0]) : null
}

function absoluteMetacriticUrl(href) {
  const raw = String(href || '').trim()
  if (!raw) return null

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw
  }

  if (raw.startsWith('/')) {
    return `https://www.metacritic.com${raw}`
  }

  return null
}

function extractScoreFromAriaLabel(value) {
  const match = String(value || '').match(/Metascore\s+(\d{1,3})\s+out\s+of\s+100/i)
  if (!match) return null

  const score = Number(match[1])
  if (!Number.isFinite(score) || score < 0 || score > 100) return null

  return score
}

function collectEntriesFromHtml(html) {
  const $ = cheerio.load(html)
  const rows = []
  const seenUrls = new Set()

  $('div[data-testid="filter-results"]').each((_, card) => {
    const anchor = $(card).find('a[href^="/game/"]').first()
    if (!anchor.length) return

    const href = anchor.attr('href')
    const metacriticUrl = absoluteMetacriticUrl(href)
    if (!metacriticUrl) return
    if (seenUrls.has(metacriticUrl)) return

    let rawTitle =
      normalizeWhitespace($(card).find('div[data-title]').first().attr('data-title')) ||
      normalizeWhitespace(
        $(card)
          .find('h3[data-testid="product-title"] span')
          .last()
          .text()
      )

    if (!rawTitle) return

    const dateText = normalizeWhitespace(
      $(card)
        .find('div[class*="uppercase"] span')
        .first()
        .text()
    )

    const releaseYear = extractReleaseYear(dateText)

    let score =
      extractScoreFromAriaLabel(
        $(card)
          .find('[aria-label*="Metascore"]')
          .first()
          .attr('aria-label')
      ) ||
      null

    if (score === null) {
      const titleAttr = $(card)
        .find('[title*="Metascore"]')
        .first()
        .attr('title')

      score = extractScoreFromAriaLabel(titleAttr)
    }

    if (score === null) {
      const scoreText = normalizeWhitespace(
        $(card)
          .find('.c-siteReviewScore span')
          .first()
          .text()
      )

      if (/^\d{1,3}$/.test(scoreText)) {
        const parsed = Number(scoreText)
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
          score = parsed
        }
      }
    }

    if (score === null) return

    const imageUrl =
      normalizeWhitespace($(card).find('picture img').first().attr('src')) || null

    seenUrls.add(metacriticUrl)

    rows.push({
      source_type: 'metacritic_browse_pc',
      platform: 'pc',
      raw_title: rawTitle,
      normalized_title: normalizeTitle(rawTitle),
      release_year: releaseYear,
      metacritic_score: score,
      metacritic_url: metacriticUrl,
      image_url: imageUrl,
      source_last_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
  })

  return rows
}

async function fetchBrowsePage(year, page) {
  const url =
    page === 1
      ? `https://www.metacritic.com/browse/game/pc/all/${year}/metascore/`
      : `https://www.metacritic.com/browse/game/pc/all/${year}/metascore/?page=${page}`

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.metacritic.com/',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`Metacritic browse fetch failed (${res.status}) for ${url}`)
  }

  const html = await res.text()
  return { url, html }
}

async function upsertRows(supabase, rows) {
  if (!rows.length) return 0

  const { error } = await supabase
    .from('metacritic_pc_scores')
    .upsert(rows, {
      onConflict: 'metacritic_url',
      ignoreDuplicates: false,
    })

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`)
  }

  return rows.length
}

async function main() {
  const args = process.argv.slice(2)

  const currentYear = new Date().getUTCFullYear()
  const fromYear = Number(args[0] || 2020)
  const toYear = Number(args[1] || currentYear)
  const maxPagesPerYear = Number(args[2] || 15)

  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear) || fromYear > toYear) {
    throw new Error('Invalid year range. Usage: node seed-metacritic-pc.mjs 2020 2026 15')
  }

  const { supabaseUrl, serviceRoleKey } = loadProjectEnv()
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let totalPagesFetched = 0
  let totalRowsUpserted = 0

  for (let year = toYear; year >= fromYear; year -= 1) {
    console.log(`\n=== YEAR ${year} ===`)

    let emptyPagesInRow = 0

    for (let page = 1; page <= maxPagesPerYear; page += 1) {
      const { url, html } = await fetchBrowsePage(year, page)
      totalPagesFetched += 1

      const rows = collectEntriesFromHtml(html)

      console.log(
        JSON.stringify({
          year,
          page,
          url,
          found: rows.length,
        })
      )

      if (!rows.length) {
        emptyPagesInRow += 1

        if (emptyPagesInRow >= 2) {
          console.log(`Stopping year ${year} after ${emptyPagesInRow} empty pages.`)
          break
        }

        continue
      }

      emptyPagesInRow = 0

      const upserted = await upsertRows(supabase, rows)
      totalRowsUpserted += upserted

      await new Promise((resolve) => setTimeout(resolve, 1200))
    }
  }

  console.log(
    JSON.stringify({
      success: true,
      totalPagesFetched,
      totalRowsUpserted,
    })
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})