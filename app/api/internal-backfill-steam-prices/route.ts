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
  has_active_offer?: boolean | null
  discount_percent?: number | null
  sale_price?: number | null
  normal_price?: number | null
}

type OfferRow = {
  pc_game_id?: string | null
  price_source?: string | null
  price_last_synced_at?: string | null
  region_code?: string | null
  sale_price?: number | null
  normal_price?: number | null
  discount_percent?: number | null
  is_available?: boolean | null
}

type SyncLogRow = {
  id: string
}

type BackfillScope = 'visible' | 'full_games' | 'ready_backlog'

type CandidateScoreRow = PcGameRow & {
  current_sync_at?: string | null
  priority: number
  lane: 'discount_hot' | 'priced_warm' | 'fallback_cold'
}

const REGION_CODE = 'us'
const STORE_ID = '1'

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
  if (value === 'full_games') return 'full_games'
  if (value === 'ready_backlog') return 'ready_backlog'
  return 'visible'
}

function normalizeText(value: unknown) {
  const text = String(value || '').trim()
  return text || null
}

function parseDateMs(value?: string | null) {
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) ? ms : null
}

function compareSyncAsc(a?: string | null, b?: string | null) {
  const aMs = parseDateMs(a)
  const bMs = parseDateMs(b)

  if (aMs === null && bMs === null) return 0
  if (aMs === null) return -1
  if (bMs === null) return 1

  return aMs - bMs
}

function getAgeHours(syncAt?: string | null) {
  const ms = parseDateMs(syncAt)

  if (!ms) return Number.POSITIVE_INFINITY

  return (Date.now() - ms) / (1000 * 60 * 60)
}

function hasKnownPrice(
  salePrice?: number | null,
  normalPrice?: number | null
) {
  const sale = Number(salePrice ?? NaN)
  const normal = Number(normalPrice ?? NaN)

  return (
    (Number.isFinite(sale) && sale > 0) || (Number.isFinite(normal) && normal > 0)
  )
}

function getVisiblePriority(params: {
  syncAt?: string | null
  discountPercent?: number | null
  salePrice?: number | null
  normalPrice?: number | null
  hasActiveOffer?: boolean | null
}) {
  const ageHours = getAgeHours(params.syncAt)
  const discountPercent = Number(params.discountPercent ?? 0)
  const knownPrice = hasKnownPrice(params.salePrice, params.normalPrice)
  const hasActiveOffer = Boolean(params.hasActiveOffer)

  // Hot lane: visible discounted rows first.
  if (discountPercent > 0 && hasActiveOffer) {
    if (ageHours >= 48) return 0
    if (ageHours >= 24) return 1
    if (ageHours >= 12) return 2
    if (ageHours >= 6) return 3
    if (ageHours >= 1) return 4
    return 99
  }

  // Warm lane: visible rows with known price but no discount.
  if (knownPrice && hasActiveOffer) {
    if (ageHours >= 120) return 10
    if (ageHours >= 72) return 11
    if (ageHours >= 48) return 12
    if (ageHours >= 24) return 13
    if (ageHours >= 6) return 14
    return 99
  }

  // Cold lane: available rows with weak/empty pricing state.
  if (ageHours >= 168) return 20
  if (ageHours >= 120) return 21
  if (ageHours >= 72) return 22
  if (ageHours >= 24) return 23
  if (ageHours >= 6) return 24

  return 99
}

function getVisibleLane(params: {
  discountPercent?: number | null
  salePrice?: number | null
  normalPrice?: number | null
  hasActiveOffer?: boolean | null
}): CandidateScoreRow['lane'] {
  const discountPercent = Number(params.discountPercent ?? 0)
  const knownPrice = hasKnownPrice(params.salePrice, params.normalPrice)
  const hasActiveOffer = Boolean(params.hasActiveOffer)

  if (discountPercent > 0 && hasActiveOffer) {
    return 'discount_hot'
  }

  if (knownPrice && hasActiveOffer) {
    return 'priced_warm'
  }

  return 'fallback_cold'
}

function getFullGamesPriority(syncAt?: string | null) {
  const ms = parseDateMs(syncAt)

  if (!ms) return 0

  const ageHours = (Date.now() - ms) / (1000 * 60 * 60)

  if (ageHours >= 24 * 30) return 1
  if (ageHours >= 24 * 7) return 2
  if (ageHours >= 24) return 3
  if (ageHours >= 6) return 4

  return 99
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

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }

  return chunks
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

async function loadOfferMap(
  supabase: ReturnType<typeof getServiceSupabase>,
  gameIds: string[]
) {
  const offers = new Map<string, OfferRow>()
  const chunkSize = 200

  for (let i = 0; i < gameIds.length; i += chunkSize) {
    const idChunk = gameIds.slice(i, i + chunkSize)

    const { data, error } = await supabase
      .from('pc_store_offers')
      .select(
        'pc_game_id, price_source, price_last_synced_at, region_code, sale_price, normal_price, discount_percent, is_available'
      )
      .eq('store_id', STORE_ID)
      .eq('region_code', REGION_CODE)
      .in('pc_game_id', idChunk)

    if (error) {
      throw new Error(`loadOfferMap pc_store_offers failed: ${error.message}`)
    }

    for (const row of (Array.isArray(data) ? data : []) as OfferRow[]) {
      const gameId = String(row.pc_game_id || '').trim()
      if (!gameId) continue

      const existing = offers.get(gameId)
      if (!existing) {
        offers.set(gameId, row)
        continue
      }

      if (
        compareSyncAsc(
          existing.price_last_synced_at || null,
          row.price_last_synced_at || null
        ) < 0
      ) {
        offers.set(gameId, row)
      }
    }
  }

  return offers
}

async function loadVisibleIdSet(
  supabase: ReturnType<typeof getServiceSupabase>,
  gameIds: string[]
) {
  const visibleIds = new Set<string>()
  const chunkSize = 200

  for (let i = 0; i < gameIds.length; i += chunkSize) {
    const idChunk = gameIds.slice(i, i + chunkSize)

    const { data, error } = await supabase
      .from('pc_public_catalog_cache')
      .select('pc_game_id')
      .in('pc_game_id', idChunk)

    if (error) {
      throw new Error(`loadVisibleIdSet pc_public_catalog_cache failed: ${error.message}`)
    }

    for (const row of Array.isArray(data) ? data : []) {
      const gameId = String((row as { pc_game_id?: string | null }).pc_game_id || '').trim()
      if (!gameId) continue
      visibleIds.add(gameId)
    }
  }

  return visibleIds
}

async function loadVisibleRowsByQuery(
  supabase: ReturnType<typeof getServiceSupabase>,
  limit: number,
  mode: 'discount_hot' | 'priced_warm' | 'fallback_cold'
) {
  let query: any = supabase
    .from('pc_public_catalog_cache')
    .select(
      'pc_game_id, steam_app_id, title, slug, price_last_synced_at, has_active_offer, discount_percent, sale_price, normal_price'
    )
    .not('steam_app_id', 'is', null)
    .order('price_last_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  if (mode === 'discount_hot') {
    query = query.eq('has_active_offer', true).gt('discount_percent', 0)
  } else if (mode === 'priced_warm') {
    query = query
      .eq('has_active_offer', true)
      .eq('discount_percent', 0)
      .or('sale_price.not.is.null,normal_price.not.is.null')
  }

  const { data, error } = await query

  if (error) {
    throw new Error(
      `loadVisibleRowsByQuery pc_public_catalog_cache failed: ${error.message}`
    )
  }

  return Array.isArray(data) ? (data as VisibleCatalogRow[]) : []
}

async function loadVisibleCandidates(
  supabase: ReturnType<typeof getServiceSupabase>,
  desiredCount: number
) {
  const discountFetchCount = Math.min(
    Math.max(desiredCount * 10, 500),
    2500
  )
  const pricedFetchCount = Math.min(
    Math.max(desiredCount * 8, 500),
    2000
  )
  const fallbackFetchCount = Math.min(
    Math.max(desiredCount * 8, 500),
    2000
  )

  const [discountRows, pricedRows, fallbackRows] = await Promise.all([
    loadVisibleRowsByQuery(supabase, discountFetchCount, 'discount_hot'),
    loadVisibleRowsByQuery(supabase, pricedFetchCount, 'priced_warm'),
    loadVisibleRowsByQuery(supabase, fallbackFetchCount, 'fallback_cold'),
  ])

  const mergedRows = [...discountRows, ...pricedRows, ...fallbackRows]
  const uniqueRows: VisibleCatalogRow[] = []
  const seenIds = new Set<string>()

  for (const row of mergedRows) {
    const gameId = String(row.pc_game_id || '').trim()
    const steamAppID = String(row.steam_app_id || '').trim()

    if (!gameId || !steamAppID) continue
    if (seenIds.has(gameId)) continue

    seenIds.add(gameId)
    uniqueRows.push(row)
  }

  const gameIds = uniqueRows
    .map((row) => String(row.pc_game_id || '').trim())
    .filter(Boolean)

  const offerMap = await loadOfferMap(supabase, gameIds)
  const scored: CandidateScoreRow[] = []

  for (const row of uniqueRows) {
    const gameId = String(row.pc_game_id || '').trim()
    const steamAppID = String(row.steam_app_id || '').trim()

    if (!gameId || !steamAppID) continue

    const offer = offerMap.get(gameId)

    const syncAt = offer?.price_last_synced_at || row.price_last_synced_at || null
    const discountPercent =
      offer?.discount_percent ?? row.discount_percent ?? 0
    const salePrice = offer?.sale_price ?? row.sale_price ?? null
    const normalPrice = offer?.normal_price ?? row.normal_price ?? null
    const hasActiveOffer =
      offer?.is_available ?? row.has_active_offer ?? false

    const priority = getVisiblePriority({
      syncAt,
      discountPercent,
      salePrice,
      normalPrice,
      hasActiveOffer,
    })

    if (priority >= 99) {
      continue
    }

    const lane = getVisibleLane({
      discountPercent,
      salePrice,
      normalPrice,
      hasActiveOffer,
    })

    scored.push({
      id: gameId,
      steam_app_id: steamAppID,
      steam_name: normalizeText(row.title),
      canonical_title: normalizeText(row.title),
      slug: normalizeText(row.slug),
      steam_type: 'game',
      current_sync_at: syncAt,
      priority,
      lane,
    })
  }

  scored.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority

    const laneOrder = {
      discount_hot: 0,
      priced_warm: 1,
      fallback_cold: 2,
    } as const

    if (laneOrder[a.lane] !== laneOrder[b.lane]) {
      return laneOrder[a.lane] - laneOrder[b.lane]
    }

    const syncCompare = compareSyncAsc(
      a.current_sync_at || null,
      b.current_sync_at || null
    )
    if (syncCompare !== 0) return syncCompare

    return String(a.steam_name || a.canonical_title || '').localeCompare(
      String(b.steam_name || b.canonical_title || '')
    )
  })

  return scored.slice(0, desiredCount)
}

async function loadFullGameCandidates(
  supabase: ReturnType<typeof getServiceSupabase>,
  desiredCount: number
) {
  const pageSize = 200
  const maxScanPages = 12
  const seenIds = new Set<string>()
  const scored: CandidateScoreRow[] = []

  for (
    let page = 0;
    page < maxScanPages && scored.length < desiredCount * 4;
    page += 1
  ) {
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
    const offerMap = await loadOfferMap(supabase, gameIds)

    for (const game of games) {
      const gameId = String(game.id || '').trim()
      const steamAppID = String(game.steam_app_id || '').trim()

      if (!gameId || !steamAppID) continue
      if (seenIds.has(gameId)) continue
      seenIds.add(gameId)

      const offer = offerMap.get(gameId)
      const syncAt = offer?.price_last_synced_at || null
      const priority = getFullGamesPriority(syncAt)

      if (priority >= 99) {
        continue
      }

      scored.push({
        ...game,
        current_sync_at: syncAt,
        priority,
        lane: 'fallback_cold',
      })
    }

    if (games.length < pageSize) {
      break
    }
  }

  scored.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority

    const syncCompare = compareSyncAsc(
      a.current_sync_at || null,
      b.current_sync_at || null
    )
    if (syncCompare !== 0) return syncCompare

    return compareSyncAsc(a.updated_at || null, b.updated_at || null)
  })

  return scored.slice(0, desiredCount)
}

async function loadReadyBacklogCandidates(
  supabase: ReturnType<typeof getServiceSupabase>,
  desiredCount: number
) {
  const pageSize = 200
  const maxScanPages = 20
  const seenIds = new Set<string>()
  const scored: CandidateScoreRow[] = []

  for (
    let page = 0;
    page < maxScanPages && scored.length < desiredCount * 4;
    page += 1
  ) {
    const from = page * pageSize
    const to = from + pageSize - 1

    const { data, error } = await supabase
      .from('pc_games')
      .select(
        'id, steam_app_id, steam_name, canonical_title, slug, updated_at, is_active, steam_type'
      )
      .eq('steam_type', 'game')
      .eq('steam_inventory_source', 'steam_istoreservice')
      .eq('is_catalog_ready', true)
      .eq('is_free_to_play', false)
      .not('steam_app_id', 'is', null)
      .order('updated_at', { ascending: true, nullsFirst: true })
      .range(from, to)

    if (error) {
      throw new Error(`loadReadyBacklogCandidates pc_games failed: ${error.message}`)
    }

    const games = Array.isArray(data) ? (data as PcGameRow[]) : []
    if (!games.length) {
      break
    }

    const gameIds = games.map((game) => String(game.id || '').trim()).filter(Boolean)
    const [offerMap, visibleIds] = await Promise.all([
      loadOfferMap(supabase, gameIds),
      loadVisibleIdSet(supabase, gameIds),
    ])

    for (const game of games) {
      const gameId = String(game.id || '').trim()
      const steamAppID = String(game.steam_app_id || '').trim()

      if (!gameId || !steamAppID) continue
      if (seenIds.has(gameId)) continue
      seenIds.add(gameId)

      if (visibleIds.has(gameId)) {
        continue
      }

      const offer = offerMap.get(gameId)
      if (offer?.is_available) {
        continue
      }

      const syncAt = offer?.price_last_synced_at || null
      const priority = getFullGamesPriority(syncAt)

      if (priority >= 99) {
        continue
      }

      scored.push({
        ...game,
        current_sync_at: syncAt,
        priority,
        lane: 'fallback_cold',
      })
    }

    if (games.length < pageSize) {
      break
    }
  }

  scored.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority

    const syncCompare = compareSyncAsc(
      a.current_sync_at || null,
      b.current_sync_at || null
    )
    if (syncCompare !== 0) return syncCompare

    return compareSyncAsc(a.updated_at || null, b.updated_at || null)
  })

  return scored.slice(0, desiredCount)
}

async function loadCandidateGames(
  supabase: ReturnType<typeof getServiceSupabase>,
  desiredCount: number,
  scope: BackfillScope
) {
  if (scope === 'visible') {
    return loadVisibleCandidates(supabase, desiredCount)
  }

  if (scope === 'ready_backlog') {
    return loadReadyBacklogCandidates(supabase, desiredCount)
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
        `No stale or missing US price candidates found for scope ${scope}`,
        0
      )

      return Response.json({
        success: true,
        processed: 0,
        updated: 0,
        rateLimited: 0,
        target: desiredCount,
        scope,
        note: `No stale or missing US price candidates found for scope ${scope}`,
      })
    }

    let processed = 0
    let updated = 0
    let rateLimited = 0

    for (const game of candidates) {
      const steamAppID = String(game.steam_app_id || '').trim()
      if (!steamAppID) continue

      processed += 1

      const response = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${steamAppID}&cc=${REGION_CODE}&l=english`,
        {
          headers: {
            'User-Agent': 'LoboDeals/2.5k',
          },
          cache: 'no-store',
        }
      )

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
      const resolvedType = normalizeText(data.type)?.toLowerCase() || 'game'

      if (scope === 'full_games' && resolvedType !== 'game') {
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

      const salePrice = centsToMoney(data.price_overview?.final || null)
      const normalPrice = centsToMoney(data.price_overview?.initial || null)
      const isFree = Boolean(data.is_free)
      const discountPercent = resolveDiscountPercent({
        salePrice,
        normalPrice,
        apiDiscountPercent: data.price_overview?.discount_percent || 0,
        isFree,
      })

      const nowIso = new Date().toISOString()

      const offerPayload = {
        pc_game_id: game.id,
        store_id: STORE_ID,
        region_code: REGION_CODE,
        currency_code: normalizeText(data.price_overview?.currency),
        sale_price: salePrice,
        normal_price: normalPrice,
        discount_percent: discountPercent,
        final_formatted: normalizeText(data.price_overview?.final_formatted),
        initial_formatted: normalizeText(data.price_overview?.initial_formatted),
        price_source: 'steam_appdetails_us',
        price_last_synced_at: nowIso,
        url: `https://store.steampowered.com/app/${steamAppID}/`,
        is_available: Boolean(isFree || salePrice || normalPrice),
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

      const gamePatch: Record<string, unknown> = {
        steam_type: resolvedType,
        is_free_to_play: isFree,
        updated_at: nowIso,
      }

      const steamName = normalizeText(data.name)
      const shortDescription = normalizeText(data.short_description)
      const headerImage = normalizeText(data.header_image)
      const capsuleImage = normalizeText(data.capsule_image)

      if (steamName) gamePatch.steam_name = steamName
      if (shortDescription) gamePatch.short_description = shortDescription
      if (headerImage) gamePatch.header_image = headerImage
      if (capsuleImage) gamePatch.capsule_image = capsuleImage

      const { error: gameError } = await supabase
        .from('pc_games')
        .update(gamePatch)
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