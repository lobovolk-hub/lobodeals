export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type SteamAppDetailsResponse = Record<
  string,
  {
    success?: boolean
    data?: {
      name?: string
      type?: string
      short_description?: string
      header_image?: string
      capsule_image?: string
      is_free?: boolean
      price_overview?: {
        currency?: string
        initial?: number
        final?: number
        discount_percent?: number
        initial_formatted?: string
        final_formatted?: string
      }
    }
  }
>

type PcGameRow = {
  id: string
  steam_app_id?: string | null
  steam_name?: string | null
  canonical_title?: string | null
  slug?: string | null
  updated_at?: string | null
  is_active?: boolean | null
  steam_type?: string | null
}

type VisibleCatalogRow = {
  pc_game_id?: string | null
  steam_app_id?: string | null
  title?: string | null
  slug?: string | null
  price_last_synced_at?: string | null
}

type OfferRow = {
  pc_game_id?: string | null
  price_source?: string | null
  price_last_synced_at?: string | null
  region_code?: string | null
}

type SyncLogRow = {
  id: string
}

type BackfillScope = 'visible' | 'full_games'

const REGION_CODE = 'us'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for steam price backfill')
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

function centsToMoney(value?: number | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }

  return Number((amount / 100).toFixed(2))
}

function normalizeScope(value: unknown): BackfillScope {
  return value === 'full_games' ? 'full_games' : 'visible'
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

async function loadVisibleCandidates(
  supabase: ReturnType<typeof getServiceSupabase>,
  desiredCount: number
) {
  const fetchCount = Math.min(Math.max(desiredCount * 3, 200), 1000)

  const { data, error } = await supabase
    .from('pc_public_catalog_cache')
    .select('pc_game_id, steam_app_id, title, slug, price_last_synced_at')
    .eq('steam_type', 'game')
    .not('steam_app_id', 'is', null)
    .order('price_last_synced_at', { ascending: true, nullsFirst: true })
    .limit(fetchCount)

  if (error) {
    throw new Error(`loadVisibleCandidates pc_public_catalog_cache failed: ${error.message}`)
  }

  const rows = Array.isArray(data) ? (data as VisibleCatalogRow[]) : []
  const results: PcGameRow[] = []
  const seenIds = new Set<string>()

  for (const row of rows) {
    const gameId = String(row.pc_game_id || '').trim()
    const steamAppID = String(row.steam_app_id || '').trim()

    if (!gameId || !steamAppID) continue
    if (seenIds.has(gameId)) continue

    seenIds.add(gameId)

    results.push({
      id: gameId,
      steam_app_id: steamAppID,
      steam_name: String(row.title || '').trim() || null,
      canonical_title: String(row.title || '').trim() || null,
      slug: String(row.slug || '').trim() || null,
      steam_type: 'game',
    })

    if (results.length >= desiredCount) {
      break
    }
  }

  return results
}

async function loadFullGameCandidates(
  supabase: ReturnType<typeof getServiceSupabase>,
  desiredCount: number
) {
  const results: PcGameRow[] = []
  const seenIds = new Set<string>()

  const pageSize = 250
  const maxScanPages = 20

  for (let page = 0; page < maxScanPages && results.length < desiredCount; page += 1) {
    const from = page * pageSize
    const to = from + pageSize - 1

    const { data, error } = await supabase
      .from('pc_games')
      .select(
        'id, steam_app_id, steam_name, canonical_title, slug, updated_at, is_active, steam_type'
      )
      .eq('steam_type', 'game')
      .eq('steam_inventory_source', 'steam_istoreservice')
      .not('steam_app_id', 'is', null)
      .order('updated_at', { ascending: true, nullsFirst: true })
      .range(from, to)

    if (error) {
      throw new Error(`loadFullGameCandidates pc_games failed: ${error.message}`)
    }

    const games = Array.isArray(data) ? (data as PcGameRow[]) : []
    if (!games.length) {
      break
    }

    const gameIds = games.map((game) => String(game.id || '').trim()).filter(Boolean)
    const modernSyncedIds = new Set<string>()
    const chunkSize = 100

    for (let i = 0; i < gameIds.length; i += chunkSize) {
      const idChunk = gameIds.slice(i, i + chunkSize)

      const { data: offerRows, error: offerError } = await supabase
        .from('pc_store_offers')
        .select('pc_game_id, price_source, price_last_synced_at, region_code')
        .eq('store_id', '1')
        .eq('region_code', REGION_CODE)
        .in('pc_game_id', idChunk)

      if (offerError) {
        throw new Error(
          `loadFullGameCandidates pc_store_offers failed: ${offerError.message}`
        )
      }

      for (const row of (Array.isArray(offerRows) ? offerRows : []) as OfferRow[]) {
        const gameId = String(row.pc_game_id || '').trim()
        const hasModernPrice =
          row.region_code === REGION_CODE &&
          row.price_source === 'steam_appdetails_us' &&
          !!String(row.price_last_synced_at || '').trim()

        if (gameId && hasModernPrice) {
          modernSyncedIds.add(gameId)
        }
      }
    }

    for (const game of games) {
      const gameId = String(game.id || '').trim()
      if (!gameId) continue
      if (seenIds.has(gameId)) continue
      seenIds.add(gameId)

      if (modernSyncedIds.has(gameId)) continue

      results.push(game)

      if (results.length >= desiredCount) {
        break
      }
    }

    if (games.length < pageSize) {
      break
    }
  }

  return results.slice(0, desiredCount)
}

async function loadCandidateGames(
  supabase: ReturnType<typeof getServiceSupabase>,
  desiredCount: number,
  scope: BackfillScope
) {
  if (scope === 'visible') {
    return loadVisibleCandidates(supabase, desiredCount)
  }

  return loadFullGameCandidates(supabase, desiredCount)
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
    const desiredCount = iterations * batchSize
    const scope = normalizeScope(body?.scope)

    const log = await createSyncLog(
      'steam_price_backfill_us',
      `Steam price backfill US started (target ${desiredCount}, scope ${scope})`
    )
    logId = log.id

    const supabase = getServiceSupabase()
    const candidates = await loadCandidateGames(supabase, desiredCount, scope)

    if (!candidates.length) {
      await finishSyncLog(
        logId,
        'success',
        `No candidate games without modern US price found for scope ${scope}`,
        0
      )

      return Response.json({
        success: true,
        processed: 0,
        updated: 0,
        rateLimited: 0,
        target: desiredCount,
        scope,
        note: `No candidate games without modern US price found for scope ${scope}`,
      })
    }

    let processed = 0
    let updated = 0
    let rateLimited = 0

    for (const game of candidates) {
      const steamAppID = String(game.steam_app_id || '').trim()
      if (!steamAppID) continue

      processed += 1

      const appdetailsUrl =
        `https://store.steampowered.com/api/appdetails?appids=${steamAppID}` +
        `&cc=${REGION_CODE}&l=english`

      const response = await fetch(appdetailsUrl, {
        headers: {
          'User-Agent': 'LoboDeals/2.5k',
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
      const resolvedType = String(data.type || '').trim().toLowerCase()

      if (scope === 'full_games' && resolvedType && resolvedType !== 'game') {
        const { error: classifyError } = await supabase
          .from('pc_games')
          .update({
            steam_type: resolvedType,
            updated_at: new Date().toISOString(),
          })
          .eq('id', game.id)

        if (classifyError) {
          throw new Error(
            `pc_games classify failed for ${steamAppID}: ${classifyError.message}`
          )
        }

        continue
      }

      const priceOverview = data.price_overview
      const salePrice = centsToMoney(priceOverview?.final || null)
      const normalPrice = centsToMoney(priceOverview?.initial || null)
      const discountPercent = Number(priceOverview?.discount_percent || 0)
      const isAvailable = Boolean(data.is_free || salePrice || normalPrice)

      const offerPayload = {
        pc_game_id: game.id,
        store_id: '1',
        region_code: REGION_CODE,
        currency_code: String(priceOverview?.currency || '').trim() || null,
        sale_price: salePrice,
        normal_price: normalPrice,
        discount_percent: discountPercent,
        final_formatted: String(priceOverview?.final_formatted || '').trim() || null,
        initial_formatted: String(priceOverview?.initial_formatted || '').trim() || null,
        price_source: 'steam_appdetails_us',
        price_last_synced_at: new Date().toISOString(),
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

      const { error: gameError } = await supabase
        .from('pc_games')
        .update({
          steam_type: String(data.type || '').trim() || 'game',
          is_free_to_play: Boolean(data.is_free),
          short_description: String(data.short_description || '').trim() || null,
          header_image: String(data.header_image || '').trim() || null,
          capsule_image: String(data.capsule_image || '').trim() || null,
          is_catalog_ready: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', game.id)

      if (gameError) {
        throw new Error(
          `pc_games update failed for ${steamAppID}: ${gameError.message}`
        )
      }

      updated += 1
    }

    await finishSyncLog(
      logId,
      'success',
      `Steam price backfill US completed (processed ${processed}, updated ${updated}, rateLimited ${rateLimited}, scope ${scope})`,
      processed
    )

    return Response.json({
      success: true,
      processed,
      updated,
      rateLimited,
      target: desiredCount,
      scope,
    })
  } catch (error) {
    console.error('steam price backfill error', error)

    if (logId) {
      try {
        await finishSyncLog(
          logId,
          'error',
          error instanceof Error ? error.message : 'Unknown backfill error',
          0
        )
      } catch {
        // no-op
      }
    }

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown backfill error',
      },
      { status: 500 }
    )
  }
}