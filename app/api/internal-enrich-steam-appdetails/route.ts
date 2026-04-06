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
      about_the_game?: string
      header_image?: string
      capsule_image?: string
      background?: string
      background_raw?: string
      is_free?: boolean
      release_date?: {
        date?: string
        coming_soon?: boolean
      }
      metacritic?: {
        score?: number
        url?: string
      }
      reviews?: string
      genres?: Array<{
        id?: string | number
        description?: string
      }>
      developers?: string[]
      publishers?: string[]
      price_overview?: {
        currency?: string
        initial?: number
        final?: number
        discount_percent?: number
        initial_formatted?: string
        final_formatted?: string
      }
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

type PcGameRow = {
  id: string
  steam_app_id?: string | null
  steam_name?: string | null
  canonical_title?: string | null
  steam_type?: string | null
  hero_image_url?: string | null
  metacritic?: number | null
  clip_url?: string | null
  slug?: string | null
}

type OfferRow = {
  pc_game_id?: string | null
  sale_price?: number | string | null
  normal_price?: number | string | null
  currency_code?: string | null
  price_source?: string | null
  price_last_synced_at?: string | null
  region_code?: string | null
  is_available?: boolean | null
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for steam enrich')
  }

  return createClient(url, serviceRole)
}



function isAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const token = String(process.env.INTERNAL_REFRESH_TOKEN || '').trim()

  if (!token) {
    throw new Error('Missing INTERNAL_REFRESH_TOKEN')
  }

  return authHeader === `Bearer ${token}`
}

function maskAuthorization(request: Request) {
  const authHeader = String(request.headers.get('authorization') || '').trim()
  if (!authHeader) return '(missing)'

  const compact = authHeader.replace(/\s+/g, ' ').trim()
  if (compact.length <= 20) return compact

  return `${compact.slice(0, 12)}...${compact.slice(-6)}`
}

function getHeaderValue(request: Request, name: string) {
  return String(request.headers.get(name) || '').trim() || null
}

function buildRequestTraceNotes(request: Request) {
  const details = {
    method: request.method,
    host: getHeaderValue(request, 'host'),
    origin: getHeaderValue(request, 'origin'),
    referer: getHeaderValue(request, 'referer'),
    user_agent: getHeaderValue(request, 'user-agent'),
    x_forwarded_for: getHeaderValue(request, 'x-forwarded-for'),
    x_real_ip: getHeaderValue(request, 'x-real-ip'),
    x_forwarded_host: getHeaderValue(request, 'x-forwarded-host'),
    x_forwarded_proto: getHeaderValue(request, 'x-forwarded-proto'),
    x_vercel_id: getHeaderValue(request, 'x-vercel-id'),
    x_vercel_ip_country: getHeaderValue(request, 'x-vercel-ip-country'),
    x_vercel_forwarded_for: getHeaderValue(request, 'x-vercel-forwarded-for'),
    cf_ray: getHeaderValue(request, 'cf-ray'),
    auth: maskAuthorization(request),
  }

  return `request_trace ${JSON.stringify(details)}`
}

async function postponeFailedGameRetry(
  supabase: ReturnType<typeof getServiceSupabase>,
  gameId: string
) {
  const safeId = String(gameId || '').trim()
  if (!safeId) return

  const { error } = await supabase
    .from('pc_games')
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq('id', safeId)

  if (error) {
    console.error('postponeFailedGameRetry failed', error)
  }
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

function normalizeSteamGenres(
  value?: Array<{
    id?: string | number
    description?: string
  }>
) {
  if (!Array.isArray(value)) return []

  return dedupeStrings(value.map((item) => String(item?.description || '')))
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

function extractMetacriticFromReviews(reviews?: string | null) {
  const raw = String(reviews || '').trim()
  if (!raw) return null

  const normalized = raw.replace(/\u2013|\u2014/g, '-')
  const match = normalized.match(/(\d{2,3})\s*-\s*metacritic/i)

  if (!match) {
    return null
  }

  const score = Number(match[1])
  if (!Number.isFinite(score)) {
    return null
  }

  if (score < 0 || score > 100) {
    return null
  }

  return score
}

function parseSteamReleaseDate(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return null

  const normalized = raw.toLowerCase()

  if (
    normalized === 'coming soon' ||
    normalized === 'to be announced' ||
    normalized === 'tba'
  ) {
    return null
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().slice(0, 10)
}

async function insertSyncLog(
  supabase: ReturnType<typeof getServiceSupabase>,
  params: {
    jobType: string
    status: 'success' | 'error'
    notes: string
    itemsProcessed?: number | null
    startedAt?: string
    finishedAt?: string
  }
) {
  const startedAt = params.startedAt || new Date().toISOString()
  const finishedAt = params.finishedAt || new Date().toISOString()

  const { error } = await supabase.from('sync_logs').insert([
    {
      job_type: params.jobType,
      status: params.status,
      notes: params.notes,
      items_processed:
        typeof params.itemsProcessed === 'number' ? params.itemsProcessed : null,
      started_at: startedAt,
      finished_at: finishedAt,
    },
  ])

  if (error) {
    console.error('sync_logs insert failed', error)
  }
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
      .select('id, steam_app_id, steam_name, canonical_title, steam_type, hero_image_url, metacritic, clip_url, slug')
      .in('steam_app_id', steamAppIDs)

    if (error) throw error

    for (const row of (Array.isArray(data) ? data : []) as PcGameRow[]) {
      collected.set(String(row.id), row)
    }
  }

  for (const title of titles) {
    const { data, error } = await supabase
      .from('pc_games')
      .select('id, steam_app_id, steam_name, canonical_title, steam_type, hero_image_url, metacritic, clip_url, slug')
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
    .select('id, steam_app_id, steam_name, canonical_title, steam_type, hero_image_url, metacritic, clip_url, updated_at, slug')
    .eq('is_catalog_ready', true)
    .eq('steam_type', 'game')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(Math.max(limit * 8, 200))

  if (error) throw error

  const candidateGames = Array.isArray(data) ? (data as PcGameRow[]) : []
  if (candidateGames.length === 0) return []

  const candidateIds = candidateGames.map((row) => String(row.id || '')).filter(Boolean)

  const { data: offerRows, error: offerError } = await supabase
    .from('pc_store_offers')
    .select('pc_game_id, sale_price, normal_price, currency_code, price_source, price_last_synced_at, region_code, is_available')
    .eq('store_id', '1')
    .eq('region_code', 'us')
    .in('pc_game_id', candidateIds)

  if (offerError) throw offerError

  const offerByGameId = new Map<string, OfferRow>()

  for (const row of Array.isArray(offerRows) ? offerRows : []) {
    const key = String((row as any)?.pc_game_id || '').trim()
    if (!key) continue
    offerByGameId.set(key, row as OfferRow)
  }

  const ranked = [...candidateGames].sort((a, b) => {
    const aOffer = offerByGameId.get(String(a.id))
    const bOffer = offerByGameId.get(String(b.id))

    const aHasModernPrice =
      !!aOffer &&
      aOffer.price_source === 'steam_appdetails_us' &&
      !!String(aOffer.price_last_synced_at || '').trim()

    const bHasModernPrice =
      !!bOffer &&
      bOffer.price_source === 'steam_appdetails_us' &&
      !!String(bOffer.price_last_synced_at || '').trim()

    if (aHasModernPrice !== bHasModernPrice) {
      return Number(aHasModernPrice) - Number(bHasModernPrice)
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
  const jobStartedAt = new Date().toISOString()

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
            'User-Agent': 'LoboDeals/2.52h',
          },
          cache: 'no-store',
        })

        if (response.status === 429) {
          rateLimited += 1
          await insertSyncLog(supabase, {
            jobType: 'steam_appdetails_enrich',
            status: 'error',
            notes: `Steam returned 429 during enrich for app ${steamAppID}`,
            itemsProcessed: 1,
          })
          continue
        }

        if (!response.ok) {
          await insertSyncLog(supabase, {
            jobType: 'steam_appdetails_enrich',
            status: 'error',
            notes: `Steam appdetails request failed for app ${steamAppID} with status ${response.status}`,
            itemsProcessed: 1,
          })
          continue
        }

        const json = (await response.json()) as SteamAppDetailsResponse
        const entry = json?.[steamAppID]

        if (!entry?.success || !entry.data) {
          await insertSyncLog(supabase, {
            jobType: 'steam_appdetails_enrich',
            status: 'error',
            notes: `Steam appdetails returned no usable data for app ${steamAppID}`,
            itemsProcessed: 1,
          })
          continue
        }

        const data = entry.data

        const canonicalTitle = String(
          data.name || game.steam_name || game.canonical_title || ''
        ).trim()

        const steamGenres = normalizeSteamGenres(data.genres)
        const steamDevelopers = dedupeStrings(Array.isArray(data.developers) ? data.developers : [])
        const steamPublishers = dedupeStrings(Array.isArray(data.publishers) ? data.publishers : [])

        const steamMovieUrl = extractSteamMovieUrl(data.movies)
        const steamMetacritic = Number(data.metacritic?.score || 0)
        const reviewsMetacritic = extractMetacriticFromReviews(data.reviews || null)

        const heroImageUrl =
          String(data.background_raw || '').trim() ||
          String(data.background || '').trim() ||
          String(data.header_image || '').trim()

        const clipUrl = steamMovieUrl || ''
        const metacritic =
          steamMetacritic > 0
            ? steamMetacritic
            : reviewsMetacritic && reviewsMetacritic > 0
            ? reviewsMetacritic
            : null

        const safeReleaseDate = parseSteamReleaseDate(data.release_date?.date || null)
        const existingSlug = String(game.slug || '').trim()
        const nextSlug =
          existingSlug ||
          (canonicalTitle ? makePcGameSlug(canonicalTitle, steamAppID) : '')

        const { error: updateError } = await supabase
          .from('pc_games')
          .update({
            steam_name: canonicalTitle || null,
            canonical_title: canonicalTitle || null,
            canonical_key: canonicalTitle ? makePcCanonicalKey(canonicalTitle) : null,
            normalized_title: canonicalTitle ? canonicalTitle.toLowerCase().trim() : null,
            slug: nextSlug || null,
            steam_type: String(data.type || '').trim() || null,
            short_description: String(data.short_description || '').trim() || null,
            description:
              String(data.about_the_game || '').trim() ||
              String(data.detailed_description || '').trim() ||
              null,
            header_image: String(data.header_image || '').trim() || null,
            capsule_image: String(data.capsule_image || '').trim() || null,
            is_free_to_play: Boolean(data.is_free),
            is_catalog_ready: true,
            release_date: safeReleaseDate,
            hero_image_url: heroImageUrl || null,
            clip_url: clipUrl || null,
            steam_movie_url: clipUrl || null,
            metacritic: metacritic,
            steam_genres: steamGenres.length > 0 ? steamGenres : null,
            steam_developers: steamDevelopers.length > 0 ? steamDevelopers : null,
            steam_publishers: steamPublishers.length > 0 ? steamPublishers : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', game.id)

        if (updateError) {
          await insertSyncLog(supabase, {
            jobType: 'steam_appdetails_enrich',
            status: 'error',
            notes: `Could not update pc_games during enrich for app ${steamAppID}: ${updateError.message}`,
            itemsProcessed: 1,
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

        const screenshotRows = Array.isArray(data.screenshots)
          ? data.screenshots
              .map((shot, index) => ({
                pc_game_id: game.id,
                image_url: String(shot?.path_full || '').trim(),
                sort_order: index,
              }))
              .filter((row) => row.image_url)
          : []

        await supabase
          .from('pc_game_screenshots')
          .delete()
          .eq('pc_game_id', game.id)

        if (screenshotRows.length > 0) {
          const { error: screenshotsError } = await supabase
            .from('pc_game_screenshots')
            .insert(screenshotRows)

          if (!screenshotsError) {
            screenshotsInserted += screenshotRows.length
          }
        }

        enriched += 1
      }

      if (targetedGames) {
        const consumed = (i + 1) * batchSize
        if (consumed >= targetedGames.length) {
          break
        }
      }
    }

    await insertSyncLog(supabase, {
      jobType: 'steam_appdetails_enrich',
      status: 'success',
      notes:
        `Steam-only enrich finished ` +
        `(processed ${processed}, enriched ${enriched}, screenshotsInserted ${screenshotsInserted}, ` +
        `rateLimited ${rateLimited}, priceRowsUpserted ${priceRowsUpserted}, ` +
        `iterations ${iterations}, batchSize ${batchSize})`,
      itemsProcessed: processed,
      startedAt: jobStartedAt,
      finishedAt: new Date().toISOString(),
    })

    return Response.json({
      success: true,
      processed,
      enriched,
      screenshotsInserted,
      rateLimited,
      priceRowsUpserted,
      iterations,
      batchSize,
      targetedSteamAppIDs: steamAppIDs,
      targetedTitles: titles,
    })
  } catch (error) {
    console.error('internal enrich error', error)

    await insertSyncLog(supabase, {
      jobType: 'steam_appdetails_enrich',
      status: 'error',
      notes:
        `Steam-only enrich crashed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      itemsProcessed: 0,
      startedAt: jobStartedAt,
      finishedAt: new Date().toISOString(),
    })

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}