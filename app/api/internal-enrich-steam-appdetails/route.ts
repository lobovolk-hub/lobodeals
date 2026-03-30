export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import {
  makePcCanonicalKey,
  makePcGameSlug,
} from '@/lib/pcCanonical'

type SteamAppDetailsResponse = Record<
  string,
  {
    success?: boolean
    data?: {
      name?: string
      type?: string
      short_description?: string
      detailed_description?: string
      header_image?: string
      capsule_image?: string
      is_free?: boolean
      release_date?: {
        date?: string
      }
      price_overview?: {
        currency?: string
        initial?: number
        final?: number
        discount_percent?: number
        initial_formatted?: string
        final_formatted?: string
      }
      packages?: number[]
      screenshots?: Array<{
        id?: number
        path_full?: string
      }>
      movies?: Array<{
        id?: number
        name?: string
        thumbnail?: string
        mp4?: {
          max?: string
          '480'?: string
        }
        webm?: {
          max?: string
          '480'?: string
        }
        highlight?: boolean
      }>
    }
  }
>

type RawgSearchResult = {
  id?: number
  slug?: string
  name?: string
  background_image?: string | null
  background_image_additional?: string | null
  metacritic?: number | null
  released?: string | null
}

type RawgSearchResponse = {
  results?: RawgSearchResult[]
}

type RawgGameDetail = {
  id?: number
  slug?: string
  name?: string
  description?: string | null
  background_image?: string | null
  background_image_additional?: string | null
  metacritic?: number | null
  released?: string | null
  genres?: Array<{ name?: string | null }>
  platforms?: Array<{
    platform?: {
      name?: string | null
    } | null
  }>
  clip?:
    | string
    | {
        clip?: string | null
        clips?: {
          '320'?: string | null
          '640'?: string | null
          full?: string | null
        } | null
        preview?: string | null
        video?: string | null
      }
    | null
}

type PcGameRow = {
  id: string
  steam_app_id?: string | null
  steam_name?: string | null
  canonical_title?: string | null
  steam_type?: string | null
  hero_image_url?: string | null
  metacritic?: number | null
  clip_url?: string | null
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for steam enrich')
  }

  return createClient(url, serviceRole)
}

function getRawgApiKey() {
  return (
    process.env.RAWG_API_KEY ||
    process.env.NEXT_PUBLIC_RAWG_API_KEY ||
    ''
  ).trim()
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  )
}

function normalizeRawgGenres(value?: Array<{ name?: string | null }>) {
  if (!Array.isArray(value)) return []

  return dedupeStrings(value.map((item) => String(item?.name || '')))
}

function normalizeRawgPlatforms(
  value?: Array<{
    platform?: {
      name?: string | null
    } | null
  }>
) {
  if (!Array.isArray(value)) return []

  return dedupeStrings(
    value.map((item) => String(item?.platform?.name || ''))
  )
}

function extractRawgClipUrl(rawg: RawgGameDetail | null) {
  if (!rawg?.clip) return ''

  if (typeof rawg.clip === 'string') {
    return rawg.clip.trim()
  }

  return String(
    rawg.clip.clip ||
      rawg.clip.video ||
      rawg.clip.clips?.full ||
      rawg.clip.clips?.['640'] ||
      rawg.clip.clips?.['320'] ||
      rawg.clip.preview ||
      ''
  ).trim()
}

function extractSteamMovieUrl(
  movies?: Array<{
    mp4?: {
      max?: string
      '480'?: string
    }
    webm?: {
      max?: string
      '480'?: string
    }
    highlight?: boolean
  }>
) {
  if (!Array.isArray(movies) || movies.length === 0) return ''

  const preferred =
    movies.find((movie) => movie?.highlight) ||
    movies[0]

  return String(
    preferred?.mp4?.max ||
      preferred?.mp4?.['480'] ||
      preferred?.webm?.max ||
      preferred?.webm?.['480'] ||
      ''
  ).trim()
}

function normalizeRawgCacheKey(title: string) {
  return `rawg_meta::${title.toLowerCase().trim()}::1`
}

function normalizeTitleForMatch(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™©]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[:\-–—_/.,+!?'"]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function chooseBestRawgSearchResult(
  results: RawgSearchResult[],
  targetTitle: string
) {
  if (!results.length) return null

  const target = normalizeTitleForMatch(targetTitle)

  const ranked = [...results].sort((a, b) => {
    const aName = normalizeTitleForMatch(String(a.name || ''))
    const bName = normalizeTitleForMatch(String(b.name || ''))

    const aExact = aName === target ? 1 : 0
    const bExact = bName === target ? 1 : 0
    if (bExact !== aExact) return bExact - aExact

    const aContains = aName.includes(target) || target.includes(aName) ? 1 : 0
    const bContains = bName.includes(target) || target.includes(bName) ? 1 : 0
    if (bContains !== aContains) return bContains - aContains

    const aMeta = Number(a.metacritic || 0)
    const bMeta = Number(b.metacritic || 0)
    return bMeta - aMeta
  })

  return ranked[0] || null
}

async function fetchRawgGameByTitle(title: string) {
  const apiKey = getRawgApiKey()
  if (!apiKey) return null

  const searchUrl =
    `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}` +
    `&search=${encodeURIComponent(title)}` +
    `&page_size=5`

  const searchRes = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'LoboDeals/2.5',
    },
    cache: 'no-store',
  })

  if (!searchRes.ok) {
    return null
  }

  const searchJson = (await searchRes.json()) as RawgSearchResponse
  const results = Array.isArray(searchJson.results) ? searchJson.results : []

  const best = chooseBestRawgSearchResult(results, title)
  if (!best?.slug) return null

  const detailUrl =
    `https://api.rawg.io/api/games/${encodeURIComponent(best.slug)}?key=${encodeURIComponent(apiKey)}`

  const detailRes = await fetch(detailUrl, {
    headers: {
      'User-Agent': 'LoboDeals/2.5',
    },
    cache: 'no-store',
  })

  if (!detailRes.ok) {
    return null
  }

  const detail = (await detailRes.json()) as RawgGameDetail
  return detail
}

async function upsertRawgCache(
  supabase: ReturnType<typeof getServiceSupabase>,
  title: string,
  rawg: RawgGameDetail
) {
  const payload = {
    name: rawg.name || title,
    description: String(rawg.description || '').trim() || null,
    background_image:
      String(rawg.background_image || '').trim() ||
      String(rawg.background_image_additional || '').trim() ||
      null,
    metacritic:
      Number(rawg.metacritic || 0) > 0 ? Number(rawg.metacritic) : null,
    released: String(rawg.released || '').trim() || null,
    genres: normalizeRawgGenres(rawg.genres),
    platforms: normalizeRawgPlatforms(rawg.platforms),
    clip: extractRawgClipUrl(rawg) || null,
  }

  await supabase.from('deals_cache').upsert(
    [
      {
        cache_key: normalizeRawgCacheKey(title),
        payload,
        updated_at: new Date().toISOString(),
      },
    ],
    {
      onConflict: 'cache_key',
    }
  )
}

async function upsertSyncLog(
  supabase: ReturnType<typeof getServiceSupabase>,
  status: 'success' | 'error',
  message: string,
  meta: Record<string, unknown>
) {
  await supabase.from('sync_logs').insert([
    {
      source: 'steam_appdetails_enrich',
      status,
      message,
      meta,
    },
  ])
}

async function loadTargetedGames(
  supabase: ReturnType<typeof getServiceSupabase>,
  steamAppIDs: string[],
  titles: string[]
) {
  const collected = new Map<string, PcGameRow>()

  if (steamAppIDs.length > 0) {
    const { data, error } = await supabase
      .from('pc_games')
      .select('id, steam_app_id, steam_name, canonical_title, steam_type, hero_image_url, metacritic, clip_url')
      .in('steam_app_id', steamAppIDs)
      .eq('is_active', true)

    if (error) throw error

    for (const row of (Array.isArray(data) ? data : []) as PcGameRow[]) {
      collected.set(String(row.id), row)
    }
  }

  for (const title of titles) {
    const { data, error } = await supabase
      .from('pc_games')
      .select('id, steam_app_id, steam_name, canonical_title, steam_type, hero_image_url, metacritic, clip_url')
      .eq('is_active', true)
      .or(
        [
          `steam_name.ilike.%${title}%`,
          `canonical_title.ilike.%${title}%`,
        ].join(',')
      )
      .limit(15)

    if (error) throw error

    for (const row of (Array.isArray(data) ? data : []) as PcGameRow[]) {
      collected.set(String(row.id), row)
    }
  }

  return Array.from(collected.values())
}

async function loadPriorityGames(
  supabase: ReturnType<typeof getServiceSupabase>,
  limit: number
) {
  const { data, error } = await supabase
    .from('pc_games')
    .select('id, steam_app_id, steam_name, canonical_title, steam_type, hero_image_url, metacritic, clip_url, updated_at')
    .eq('is_active', true)
    .eq('steam_type', 'game')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(Math.max(limit * 6, 120))

  if (error) throw error

  const candidateGames = Array.isArray(data) ? (data as PcGameRow[]) : []
  if (candidateGames.length === 0) return []

  const candidateIds = candidateGames.map((row) => String(row.id || '')).filter(Boolean)

  const { data: offerRows, error: offerError } = await supabase
    .from('pc_store_offers')
    .select('pc_game_id, sale_price, region_code, is_available')
    .eq('store_id', '1')
    .eq('region_code', 'us')
    .eq('is_available', true)
    .in('pc_game_id', candidateIds)

  if (offerError) throw offerError

  const offerByGameId = new Map<string, { sale_price?: number | string | null }>()

  for (const row of Array.isArray(offerRows) ? offerRows : []) {
    const key = String((row as any)?.pc_game_id || '').trim()
    if (!key) continue
    offerByGameId.set(key, row as any)
  }

  const ranked = [...candidateGames].sort((a, b) => {
    const aHasPrice = offerByGameId.has(String(a.id))
    const bHasPrice = offerByGameId.has(String(b.id))

    if (aHasPrice !== bHasPrice) {
      return Number(aHasPrice) - Number(bHasPrice)
    }

    const aMissingMeta =
      Number(!String(a.hero_image_url || '').trim()) +
      Number(!(Number(a.metacritic || 0) > 0)) +
      Number(!String(a.clip_url || '').trim())

    const bMissingMeta =
      Number(!String(b.hero_image_url || '').trim()) +
      Number(!(Number(b.metacritic || 0) > 0)) +
      Number(!String(b.clip_url || '').trim())

    if (bMissingMeta !== aMissingMeta) {
      return bMissingMeta - aMissingMeta
    }

    return 0
  })

  return ranked.slice(0, limit)
}

function centsToMoney(value?: number | null) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Number((amount / 100).toFixed(2))
}

export async function POST(request: Request) {
  const supabase = getServiceSupabase()

  try {
    const body = await request.json().catch(() => ({}))
    const iterations = Math.max(1, Math.min(50, Number(body?.iterations || 1)))
    const batchSize = Math.max(1, Math.min(50, Number(body?.batchSize || 10)))
    const steamAppIDs = Array.isArray(body?.steamAppIDs)
      ? dedupeStrings(body.steamAppIDs.map((value: unknown) => String(value)))
      : []
    const titles = Array.isArray(body?.titles)
      ? dedupeStrings(body.titles.map((value: unknown) => String(value)))
      : []

    let processed = 0
    let enriched = 0
    let screenshotsInserted = 0
    let rateLimited = 0
    let rawgMatched = 0
    let priceRowsUpserted = 0

    let targetedGames: PcGameRow[] | null = null

    if (steamAppIDs.length > 0 || titles.length > 0) {
      targetedGames = await loadTargetedGames(supabase, steamAppIDs, titles)
    }

    for (let i = 0; i < iterations; i += 1) {
      let games: PcGameRow[] = []

      if (targetedGames) {
        const start = i * batchSize
        games = targetedGames.slice(start, start + batchSize)
      } else {
        games = await loadPriorityGames(supabase, batchSize)
      }

      if (games.length === 0) break

      for (const game of games) {
        const steamAppID = String(game.steam_app_id || '').trim()
        if (!steamAppID) continue

        processed += 1

        const appdetailsUrl =
          `https://store.steampowered.com/api/appdetails?appids=${steamAppID}` +
          `&cc=us&l=english`

        const response = await fetch(appdetailsUrl, {
          headers: {
            'User-Agent': 'LoboDeals/2.5',
          },
          cache: 'no-store',
        })

        if (response.status === 429) {
          rateLimited += 1
          await upsertSyncLog(supabase, 'error', 'Steam returned 429 during enrich', {
            steamAppID,
            iteration: i + 1,
          })
          continue
        }

        if (!response.ok) {
          await upsertSyncLog(supabase, 'error', 'Steam appdetails request failed', {
            steamAppID,
            status: response.status,
          })
          continue
        }

        const json = (await response.json()) as SteamAppDetailsResponse
        const entry = json?.[steamAppID]

        if (!entry?.success || !entry.data) {
          continue
        }

        const data = entry.data

        const canonicalTitle = String(
          data.name || game.steam_name || game.canonical_title || ''
        ).trim()

        const rawg = canonicalTitle
          ? await fetchRawgGameByTitle(canonicalTitle)
          : null

        if (rawg) {
          rawgMatched += 1
          await upsertRawgCache(supabase, canonicalTitle, rawg)
        }

        const steamMovieUrl = extractSteamMovieUrl(data.movies)
        const rawgClipUrl = extractRawgClipUrl(rawg)

        const heroImageUrl =
          String(rawg?.background_image || '').trim() ||
          String(rawg?.background_image_additional || '').trim() ||
          String(data.header_image || '').trim()

        const clipUrl = rawgClipUrl || steamMovieUrl
        const metacritic = Number(rawg?.metacritic || 0)
        const rawgDescription = String(rawg?.description || '').trim()
        const rawgGenres = normalizeRawgGenres(rawg?.genres)
        const rawgPlatforms = normalizeRawgPlatforms(rawg?.platforms)

        const { error: updateError } = await supabase
          .from('pc_games')
          .update({
            steam_name: canonicalTitle || null,
            canonical_title: canonicalTitle || null,
            canonical_key: canonicalTitle ? makePcCanonicalKey(canonicalTitle) : null,
            normalized_title: canonicalTitle ? canonicalTitle.toLowerCase().trim() : null,
            slug: canonicalTitle
              ? makePcGameSlug(canonicalTitle, steamAppID)
              : null,
            steam_type: String(data.type || '').trim() || null,
            short_description: String(data.short_description || '').trim() || null,
            description:
              String(data.detailed_description || '').trim() ||
              rawgDescription ||
              null,
            header_image: String(data.header_image || '').trim() || null,
            capsule_image: String(data.capsule_image || '').trim() || null,
            is_free_to_play: Boolean(data.is_free),
            is_catalog_ready: true,
            release_date:
              String(data.release_date?.date || '').trim() ||
              String(rawg?.released || '').trim() ||
              null,
            hero_image_url: heroImageUrl || null,
            clip_url: clipUrl || null,
            metacritic: metacritic > 0 ? metacritic : null,
            rawg_description: rawgDescription || null,
            rawg_genres: rawgGenres.length > 0 ? rawgGenres : null,
            rawg_platforms: rawgPlatforms.length > 0 ? rawgPlatforms : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', game.id)

        if (updateError) {
          await upsertSyncLog(supabase, 'error', 'Could not update pc_games during enrich', {
            steamAppID,
            error: updateError.message,
          })
          continue
        }

        const priceOverview = data.price_overview
        const salePrice = centsToMoney(priceOverview?.final || null)
        const normalPrice = centsToMoney(priceOverview?.initial || null)
        const discountPercent = Number(priceOverview?.discount_percent || 0)

        const offerPayload = {
          pc_game_id: game.id,
          store_id: '1',
          region_code: 'us',
          currency_code: String(priceOverview?.currency || '').trim() || null,
          sale_price: salePrice,
          normal_price: normalPrice,
          discount_percent: discountPercent,
          final_formatted: String(priceOverview?.final_formatted || '').trim() || null,
          initial_formatted: String(priceOverview?.initial_formatted || '').trim() || null,
          price_source: 'steam_appdetails_us',
          price_last_synced_at: new Date().toISOString(),
          url: `https://store.steampowered.com/app/${steamAppID}/`,
          is_available: Boolean(data.is_free || salePrice || normalPrice),
        }

        const { error: offerError } = await supabase
          .from('pc_store_offers')
          .upsert([offerPayload], {
            onConflict: 'pc_game_id,store_id,region_code',
          })

        if (!offerError) {
          priceRowsUpserted += 1
        }

        enriched += 1

        const screenshotRows = Array.isArray(data.screenshots)
          ? data.screenshots
              .map((shot, index) => ({
                pc_game_id: game.id,
                image_url: String(shot?.path_full || '').trim(),
                sort_order: index,
              }))
              .filter((row) => row.image_url)
          : []

        if (screenshotRows.length > 0) {
          await supabase
            .from('pc_game_screenshots')
            .delete()
            .eq('pc_game_id', game.id)

          const { error: screenshotsError } = await supabase
            .from('pc_game_screenshots')
            .insert(screenshotRows)

          if (!screenshotsError) {
            screenshotsInserted += screenshotRows.length
          }
        }
      }

      if (targetedGames) {
        const consumed = (i + 1) * batchSize
        if (consumed >= targetedGames.length) {
          break
        }
      }
    }

    await upsertSyncLog(supabase, 'success', 'Steam + RAWG enrich finished', {
      processed,
      enriched,
      screenshotsInserted,
      rateLimited,
      rawgMatched,
      priceRowsUpserted,
      iterations,
      batchSize,
      targetedSteamAppIDs: steamAppIDs,
      targetedTitles: titles,
    })

    return Response.json({
      success: true,
      processed,
      enriched,
      screenshotsInserted,
      rateLimited,
      rawgMatched,
      priceRowsUpserted,
      iterations,
      batchSize,
      targetedSteamAppIDs: steamAppIDs,
      targetedTitles: titles,
    })
  } catch (error) {
    console.error('internal enrich error', error)

    await upsertSyncLog(
      supabase,
      'error',
      'Steam + RAWG enrich crashed',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    )

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}