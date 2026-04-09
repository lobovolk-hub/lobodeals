export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type SteamAppDetailsData = {
  name?: string
  type?: string
  short_description?: string
  detailed_description?: string
  header_image?: string
  capsule_image?: string
  background?: string
  website?: string
  is_free?: boolean
  screenshots?: Array<{
    id?: number
    path_thumbnail?: string
    path_full?: string
  }>
  price_overview?: {
    currency?: string
    initial?: number
    final?: number
    discount_percent?: number
    initial_formatted?: string
    final_formatted?: string
  }
  release_date?: {
    coming_soon?: boolean
    date?: string
  }
  metacritic?: {
    score?: number
    url?: string
  }
}

type SteamAppDetailsResponse = Record<
  string,
  {
    success?: boolean
    data?: SteamAppDetailsData
  }
>

type SyncLogRow = {
  id: string
}

type CandidateScope = 'visible' | 'full_games'

type EnrichCandidateRow = {
  pc_game_id?: string | null
  steam_app_id?: string | null
  title?: string | null
  slug?: string | null
  priority_order?: number | null
  priority_bucket?: string | null
  screenshot_count?: number | null
  release_date?: string | null
  metacritic?: number | null
  effective_price_last_synced_at?: string | null
}

type PcGameRow = {
  id: string
  steam_app_id?: string | null
  steam_name?: string | null
  canonical_title?: string | null
  slug?: string | null
  updated_at?: string | null
  steam_type?: string | null
}

const REGION_CODE = 'us'
const STORE_ID = '1'

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
  const token = process.env.INTERNAL_REFRESH_TOKEN || ''

  if (!token) {
    throw new Error('Missing INTERNAL_REFRESH_TOKEN')
  }

  return authHeader === `Bearer ${token}`
}

function normalizeScope(value: unknown): CandidateScope {
  return value === 'full_games' ? 'full_games' : 'visible'
}

function normalizeText(value: unknown) {
  const text = String(value || '').trim()
  return text || null
}

function centsToMoney(value?: number | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }

  return Number((amount / 100).toFixed(2))
}

function resolveDiscountPercent(params: {
  salePrice?: number | null
  normalPrice?: number | null
  apiDiscountPercent?: number | null
  isFree?: boolean
}) {
  const salePrice = Number(params.salePrice ?? NaN)
  const normalPrice = Number(params.normalPrice ?? NaN)
  const apiDiscount = Number(params.apiDiscountPercent ?? 0)

  if (params.isFree) {
    return 0
  }

  if (
    Number.isFinite(normalPrice) &&
    Number.isFinite(salePrice) &&
    normalPrice > 0 &&
    salePrice >= 0
  ) {
    if (salePrice >= normalPrice) {
      return 0
    }

    return Math.max(
      0,
      Math.min(100, Math.round(((normalPrice - salePrice) / normalPrice) * 100))
    )
  }

  if (!Number.isFinite(apiDiscount) || apiDiscount <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(apiDiscount)))
}

function parseSteamReleaseDate(rawValue?: string | null) {
  const raw = String(rawValue || '').trim()
  if (!raw) return null

  const safe = raw
    .replace(/\bSept\b/gi, 'Sep')
    .replace(/\s+/g, ' ')
    .trim()

  const direct = Date.parse(safe)
  if (Number.isFinite(direct)) {
    return new Date(direct).toISOString().slice(0, 10)
  }

  const noComma = safe.replace(',', '')
  const secondTry = Date.parse(noComma)
  if (Number.isFinite(secondTry)) {
    return new Date(secondTry).toISOString().slice(0, 10)
  }

  const monthYearMatch = noComma.match(/^([A-Za-z]{3,9})\s+(\d{4})$/)
  if (monthYearMatch) {
    const month = monthYearMatch[1]
    const year = monthYearMatch[2]
    const inferred = Date.parse(`${month} 1 ${year}`)
    if (Number.isFinite(inferred)) {
      return new Date(inferred).toISOString().slice(0, 10)
    }
  }

  const yearOnlyMatch = noComma.match(/^(\d{4})$/)
  if (yearOnlyMatch) {
    return `${yearOnlyMatch[1]}-01-01`
  }

  return null
}

function buildUniqueScreenshots(gameId: string, screenshots?: SteamAppDetailsData['screenshots']) {
  if (!Array.isArray(screenshots) || screenshots.length === 0) {
    return []
  }

  const seen = new Set<string>()
  const uniqueUrls: string[] = []

  for (const shot of screenshots) {
    const url =
      normalizeText(shot?.path_full) ||
      normalizeText(shot?.path_thumbnail)

    if (!url) continue
    if (seen.has(url)) continue

    seen.add(url)
    uniqueUrls.push(url)
  }

  return uniqueUrls.map((imageUrl, index) => ({
    pc_game_id: gameId,
    image_url: imageUrl,
    sort_order: index,
  }))
}

async function createSyncLog(jobType: string, notes: string) {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('sync_logs')
    .insert({
      job_type: jobType,
      status: 'running',
      notes,
      items_processed: 0,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`createSyncLog failed: ${error.message}`)
  }

  return data as SyncLogRow
}

async function finishSyncLog(
  logId: string,
  status: 'success' | 'error',
  notes: string,
  itemsProcessed: number
) {
  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('sync_logs')
    .update({
      status,
      notes,
      items_processed: itemsProcessed,
      finished_at: new Date().toISOString(),
    })
    .eq('id', logId)

  if (error) {
    throw new Error(`finishSyncLog failed: ${error.message}`)
  }
}

async function loadPriorityVisibleCandidates(
  supabase: ReturnType<typeof getServiceSupabase>,
  limit: number
) {
  const { data, error } = await supabase.rpc(
    'get_priority_visible_enrich_candidates',
    { p_limit: limit }
  )

  if (error) {
    throw new Error(
      `loadPriorityVisibleCandidates rpc failed: ${error.message}`
    )
  }

  const rows = Array.isArray(data) ? (data as EnrichCandidateRow[]) : []

  return rows
    .map((row) => ({
      id: String(row.pc_game_id || '').trim(),
      steam_app_id: String(row.steam_app_id || '').trim(),
      steam_name: normalizeText(row.title),
      canonical_title: normalizeText(row.title),
      slug: normalizeText(row.slug),
      updated_at: normalizeText(row.effective_price_last_synced_at),
      steam_type: 'game',
    }))
    .filter((row) => row.id && row.steam_app_id)
}

async function loadFullGameCandidates(
  supabase: ReturnType<typeof getServiceSupabase>,
  limit: number
) {
  const { data, error } = await supabase
    .from('pc_games')
    .select(
      'id, steam_app_id, steam_name, canonical_title, slug, updated_at, steam_type'
    )
    .eq('steam_type', 'game')
    .eq('steam_inventory_source', 'steam_istoreservice')
    .not('steam_app_id', 'is', null)
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  if (error) {
    throw new Error(`loadFullGameCandidates failed: ${error.message}`)
  }

  const rows = Array.isArray(data) ? (data as PcGameRow[]) : []

  return rows
    .map((row) => ({
      id: String(row.id || '').trim(),
      steam_app_id: String(row.steam_app_id || '').trim(),
      steam_name: normalizeText(row.steam_name),
      canonical_title: normalizeText(row.canonical_title),
      slug: normalizeText(row.slug),
      updated_at: normalizeText(row.updated_at),
      steam_type: normalizeText(row.steam_type),
    }))
    .filter((row) => row.id && row.steam_app_id)
}

async function loadCandidateGames(
  supabase: ReturnType<typeof getServiceSupabase>,
  limit: number,
  scope: CandidateScope
) {
  if (scope === 'visible') {
    return loadPriorityVisibleCandidates(supabase, limit)
  }

  return loadFullGameCandidates(supabase, limit)
}

export async function POST(request: Request) {
  let logId: string | null = null

  try {
    const hasAuthHeader = !!request.headers.get('authorization')

    if (hasAuthHeader && !isAuthorized(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const iterations = Math.max(1, Math.min(50, Number(body?.iterations || 1)))
    const batchSize = Math.max(1, Math.min(100, Number(body?.batchSize || 25)))
    const scope = normalizeScope(body?.scope)

    const log = await createSyncLog(
      'steam_appdetails_enrich',
      `Steam-only enrich started (scope ${scope}, iterations ${iterations}, batchSize ${batchSize})`
    )
    logId = log.id

    const supabase = getServiceSupabase()
    const processedIds = new Set<string>()

    let processed = 0
    let enriched = 0
    let screenshotsInserted = 0
    let rateLimited = 0
    let priceRowsUpserted = 0

    for (let i = 0; i < iterations; i += 1) {
      const rawCandidates = await loadCandidateGames(supabase, batchSize, scope)
      const candidates = rawCandidates
        .filter((game) => !processedIds.has(String(game.id || '').trim()))
        .slice(0, batchSize)

      if (!candidates.length) {
        break
      }

      for (const game of candidates) {
        const gameId = String(game.id || '').trim()
        const steamAppID = String(game.steam_app_id || '').trim()

        if (!gameId || !steamAppID) continue

        processedIds.add(gameId)
        processed += 1

        const appdetailsUrl =
          `https://store.steampowered.com/api/appdetails?appids=${steamAppID}` +
          `&cc=${REGION_CODE}&l=english`

        const response = await fetch(appdetailsUrl, {
          headers: {
            'User-Agent': 'LoboDeals/2.6 enrich',
          },
          cache: 'no-store',
        })

        if (response.status === 429) {
          rateLimited += 1
          continue
        }

        if (!response.ok) {
          continue
        }

        const json = (await response.json()) as SteamAppDetailsResponse
        const entry = json?.[steamAppID]

        if (!entry?.success || !entry.data) {
          continue
        }

        const data = entry.data
        const nowIso = new Date().toISOString()

        const resolvedType = normalizeText(data.type)?.toLowerCase() || 'game'
        const shortDescription = normalizeText(data.short_description)
        const detailedDescription = normalizeText(data.detailed_description)
        const headerImage = normalizeText(data.header_image)
        const capsuleImage = normalizeText(data.capsule_image)
        const heroImage = normalizeText(data.background)
        const steamName = normalizeText(data.name)
        const releaseDate = parseSteamReleaseDate(data.release_date?.date || null)
        const metacritic =
          Number.isFinite(Number(data.metacritic?.score))
            ? Number(data.metacritic?.score)
            : null
        const isFreeToPlay = Boolean(data.is_free)

        const gamePatch: Record<string, unknown> = {
          steam_type: resolvedType,
          is_free_to_play: isFreeToPlay,
          updated_at: nowIso,
        }

        if (steamName) gamePatch.steam_name = steamName
        if (shortDescription) gamePatch.short_description = shortDescription
        if (detailedDescription) gamePatch.description = detailedDescription
        if (headerImage) gamePatch.header_image = headerImage
        if (capsuleImage) gamePatch.capsule_image = capsuleImage
        if (heroImage) gamePatch.hero_image_url = heroImage
        if (releaseDate) gamePatch.release_date = releaseDate
        if (metacritic !== null && metacritic > 0) gamePatch.metacritic = metacritic

        const { error: gameError } = await supabase
          .from('pc_games')
          .update(gamePatch)
          .eq('id', gameId)

        if (gameError) {
          throw new Error(`pc_games update failed for ${steamAppID}: ${gameError.message}`)
        }

        const screenshots = buildUniqueScreenshots(gameId, data.screenshots)

        if (screenshots.length > 0) {
          const { error: deleteShotsError } = await supabase
            .from('pc_game_screenshots')
            .delete()
            .eq('pc_game_id', gameId)

          if (deleteShotsError) {
            throw new Error(
              `pc_game_screenshots delete failed for ${steamAppID}: ${deleteShotsError.message}`
            )
          }

          const { error: insertShotsError } = await supabase
            .from('pc_game_screenshots')
            .insert(screenshots)

          if (insertShotsError) {
            throw new Error(
              `pc_game_screenshots insert failed for ${steamAppID}: ${insertShotsError.message}`
            )
          }

          screenshotsInserted += screenshots.length
        }

        const priceOverview = data.price_overview
        const salePrice = centsToMoney(priceOverview?.final || null)
        const normalPrice = centsToMoney(priceOverview?.initial || null)
        const discountPercent = resolveDiscountPercent({
          salePrice,
          normalPrice,
          apiDiscountPercent: priceOverview?.discount_percent || 0,
          isFree: isFreeToPlay,
        })
        const isAvailable = Boolean(isFreeToPlay || salePrice || normalPrice)

        const offerPayload = {
          pc_game_id: gameId,
          store_id: STORE_ID,
          region_code: REGION_CODE,
          currency_code: normalizeText(priceOverview?.currency),
          sale_price: salePrice,
          normal_price: normalPrice,
          discount_percent: discountPercent,
          final_formatted: normalizeText(priceOverview?.final_formatted),
          initial_formatted: normalizeText(priceOverview?.initial_formatted),
          price_source: 'steam_appdetails_us',
          price_last_synced_at: nowIso,
          url: `https://store.steampowered.com/app/${steamAppID}/`,
          is_available: isAvailable,
        }

        const { error: offerError } = await supabase
          .from('pc_store_offers')
          .upsert([offerPayload], {
            onConflict: 'pc_game_id,store_id,region_code',
          })

        if (offerError) {
          throw new Error(
            `pc_store_offers upsert failed for ${steamAppID}: ${offerError.message}`
          )
        }

        priceRowsUpserted += 1
        enriched += 1
      }
    }

    await finishSyncLog(
      logId,
      'success',
      `Steam-only enrich finished (processed ${processed}, enriched ${enriched}, screenshotsInserted ${screenshotsInserted}, rateLimited ${rateLimited}, priceRowsUpserted ${priceRowsUpserted}, iterations ${iterations}, batchSize ${batchSize}, scope ${scope})`,
      processed
    )

    return Response.json({
      success: true,
      processed,
      enriched,
      screenshotsInserted,
      rateLimited,
      priceRowsUpserted,
      iterations,
      batchSize,
      scope,
    })
  } catch (error) {
    console.error('internal-enrich-steam-appdetails error', error)

    if (logId) {
      try {
        await finishSyncLog(
          logId,
          'error',
          error instanceof Error ? error.message : 'Unknown enrich error',
          0
        )
      } catch {
        // no-op
      }
    }

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown enrich error',
      },
      { status: 500 }
    )
  }
}