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

type VisibleCatalogRow = {
  pc_game_id?: string | null
  steam_app_id?: string | null
  title?: string | null
  slug?: string | null
  has_active_offer?: boolean | null
  discount_percent?: number | null
  price_last_synced_at?: string | null
}

type PcGameMetaRow = {
  id?: string | null
  steam_app_id?: string | null
  steam_name?: string | null
  canonical_title?: string | null
  slug?: string | null
  updated_at?: string | null
  steam_type?: string | null
  release_date?: string | null
  metacritic?: number | null
}

type EnrichCandidate = {
  id: string
  steam_app_id: string
  steam_name?: string | null
  canonical_title?: string | null
  slug?: string | null
  updated_at?: string | null
  steam_type?: string | null
  has_active_offer?: boolean
  discount_percent?: number
  price_last_synced_at?: string | null
  release_date?: string | null
  metacritic?: number | null
  priority_order: number
  priority_bucket: string
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

function parseDateMs(value?: string | null) {
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) ? ms : null
}

function compareDateDesc(a?: string | null, b?: string | null) {
  const aMs = parseDateMs(a)
  const bMs = parseDateMs(b)

  if (aMs === null && bMs === null) return 0
  if (aMs === null) return 1
  if (bMs === null) return -1

  return bMs - aMs
}

function compareDateAsc(a?: string | null, b?: string | null) {
  const aMs = parseDateMs(a)
  const bMs = parseDateMs(b)

  if (aMs === null && bMs === null) return 0
  if (aMs === null) return -1
  if (bMs === null) return 1

  return aMs - bMs
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }

  return chunks
}

function classifyVisibleCandidate(params: {
  release_date?: string | null
  metacritic?: number | null
}) {
  const hasReleaseDate = Boolean(params.release_date)
  const metacritic = Number(params.metacritic || 0)

  if (!hasReleaseDate) {
    return {
      priority_order: 1,
      priority_bucket: 'P1_missing_release_date',
    }
  }

  if (metacritic <= 0) {
    return {
      priority_order: 2,
      priority_bucket: 'P2_missing_metacritic',
    }
  }

  return {
    priority_order: 3,
    priority_bucket: 'P3_catalog_maintenance',
  }
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

async function loadVisiblePool(
  supabase: ReturnType<typeof getServiceSupabase>,
  limit: number,
  mode: 'discounted_hot' | 'recent_visible' | 'oldest_visible'
) {
  let query: any = supabase
    .from('pc_public_catalog_cache')
    .select(
      'pc_game_id, steam_app_id, title, slug, has_active_offer, discount_percent, price_last_synced_at'
    )
    .not('steam_app_id', 'is', null)

  if (mode === 'discounted_hot') {
    query = query
      .eq('has_active_offer', true)
      .gt('discount_percent', 0)
      .order('discount_percent', { ascending: false })
      .order('price_last_synced_at', { ascending: false, nullsFirst: false })
      .order('title', { ascending: true })
  } else if (mode === 'recent_visible') {
    query = query
      .order('has_active_offer', { ascending: false })
      .order('price_last_synced_at', { ascending: false, nullsFirst: false })
      .order('discount_percent', { ascending: false })
      .order('title', { ascending: true })
  } else {
    query = query
      .order('price_last_synced_at', { ascending: true, nullsFirst: true })
      .order('title', { ascending: true })
  }

  query = query.limit(limit)

  const { data, error } = await query

  if (error) {
    throw new Error(`loadVisiblePool failed: ${error.message}`)
  }

  return Array.isArray(data) ? (data as VisibleCatalogRow[]) : []
}

async function loadPcGameMetaMap(
  supabase: ReturnType<typeof getServiceSupabase>,
  gameIds: string[]
) {
  const metaMap = new Map<string, PcGameMetaRow>()

  for (const chunk of chunkArray(gameIds, 500)) {
    const { data, error } = await supabase
      .from('pc_games')
      .select(
        'id, steam_app_id, steam_name, canonical_title, slug, updated_at, steam_type, release_date, metacritic'
      )
      .in('id', chunk)

    if (error) {
      throw new Error(`loadPcGameMetaMap failed: ${error.message}`)
    }

    for (const row of (Array.isArray(data) ? data : []) as PcGameMetaRow[]) {
      const id = String(row.id || '').trim()
      if (!id) continue
      metaMap.set(id, row)
    }
  }

  return metaMap
}

async function loadPriorityVisibleCandidates(
  supabase: ReturnType<typeof getServiceSupabase>,
  desiredCount: number
) {
  const discountedFetchCount = Math.min(Math.max(desiredCount * 8, 400), 2500)
  const recentFetchCount = Math.min(Math.max(desiredCount * 10, 600), 3000)
  const oldestFetchCount = Math.min(Math.max(desiredCount * 6, 300), 1800)

  const [discountedHot, recentVisible, oldestVisible] = await Promise.all([
    loadVisiblePool(supabase, discountedFetchCount, 'discounted_hot'),
    loadVisiblePool(supabase, recentFetchCount, 'recent_visible'),
    loadVisiblePool(supabase, oldestFetchCount, 'oldest_visible'),
  ])

  const merged = [...discountedHot, ...recentVisible, ...oldestVisible]
  const uniqueVisible: VisibleCatalogRow[] = []
  const seenIds = new Set<string>()

  for (const row of merged) {
    const gameId = String(row.pc_game_id || '').trim()
    const steamAppID = String(row.steam_app_id || '').trim()

    if (!gameId || !steamAppID) continue
    if (seenIds.has(gameId)) continue

    seenIds.add(gameId)
    uniqueVisible.push(row)
  }

  const gameIds = uniqueVisible
    .map((row) => String(row.pc_game_id || '').trim())
    .filter(Boolean)

  const metaMap = await loadPcGameMetaMap(supabase, gameIds)

  const candidates: EnrichCandidate[] = []

  for (const row of uniqueVisible) {
    const gameId = String(row.pc_game_id || '').trim()
    const steamAppID = String(row.steam_app_id || '').trim()
    const meta = metaMap.get(gameId)

    if (!gameId || !steamAppID || !meta) continue

    const releaseDate = normalizeText(meta.release_date)
    const metacritic =
      Number.isFinite(Number(meta.metacritic)) ? Number(meta.metacritic) : null

    const classified = classifyVisibleCandidate({
      release_date: releaseDate,
      metacritic,
    })

    candidates.push({
      id: gameId,
      steam_app_id: steamAppID,
      steam_name: normalizeText(meta.steam_name || row.title),
      canonical_title: normalizeText(meta.canonical_title || row.title),
      slug: normalizeText(meta.slug || row.slug),
      updated_at: normalizeText(meta.updated_at || row.price_last_synced_at),
      steam_type: 'game',
      has_active_offer: Boolean(row.has_active_offer),
      discount_percent: Number(row.discount_percent || 0),
      price_last_synced_at: normalizeText(row.price_last_synced_at),
      release_date: releaseDate,
      metacritic,
      priority_order: classified.priority_order,
      priority_bucket: classified.priority_bucket,
    })
  }

  candidates.sort((a, b) => {
    if (a.priority_order !== b.priority_order) {
      return a.priority_order - b.priority_order
    }

    if (Boolean(a.has_active_offer) !== Boolean(b.has_active_offer)) {
      return a.has_active_offer ? -1 : 1
    }

    const aDiscount = Number(a.discount_percent || 0)
    const bDiscount = Number(b.discount_percent || 0)

    if (aDiscount !== bDiscount) {
      return bDiscount - aDiscount
    }

    const priceSyncCompare = compareDateDesc(
      a.price_last_synced_at || null,
      b.price_last_synced_at || null
    )
    if (priceSyncCompare !== 0) {
      return priceSyncCompare
    }

    return String(a.steam_name || a.canonical_title || '').localeCompare(
      String(b.steam_name || b.canonical_title || '')
    )
  })

  return candidates.slice(0, desiredCount)
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

  const rows = Array.isArray(data) ? (data as PcGameMetaRow[]) : []

  return rows
    .map((row) => ({
      id: String(row.id || '').trim(),
      steam_app_id: String(row.steam_app_id || '').trim(),
      steam_name: normalizeText(row.steam_name),
      canonical_title: normalizeText(row.canonical_title),
      slug: normalizeText(row.slug),
      updated_at: normalizeText(row.updated_at),
      steam_type: normalizeText(row.steam_type),
      priority_order: 99,
      priority_bucket: 'full_games_fallback',
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

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  let index = 0

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const currentIndex = index
      index += 1

      if (currentIndex >= items.length) {
        return
      }

      await worker(items[currentIndex])
    }
  })

  await Promise.all(runners)
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
    const concurrency = Math.max(
      1,
      Math.min(8, Number(body?.concurrency || 4))
    )
    const scope = normalizeScope(body?.scope)

    const targetCount = iterations * batchSize

    const log = await createSyncLog(
      'steam_appdetails_enrich',
      `Steam-only enrich started (scope ${scope}, target ${targetCount}, concurrency ${concurrency})`
    )
    logId = log.id

    const supabase = getServiceSupabase()
    const candidates = await loadCandidateGames(supabase, targetCount, scope)

    if (!candidates.length) {
      await finishSyncLog(
        logId,
        'success',
        `No enrich candidates found (scope ${scope})`,
        0
      )

      return Response.json({
        success: true,
        processed: 0,
        enriched: 0,
        screenshotsInserted: 0,
        rateLimited: 0,
        priceRowsUpserted: 0,
        iterations,
        batchSize,
        concurrency,
        scope,
      })
    }

    let processed = 0
    let enriched = 0
    let rateLimited = 0
    let priceRowsUpserted = 0
    const screenshotsInserted = 0

    await runWithConcurrency(candidates, concurrency, async (game) => {
      const gameId = String(game.id || '').trim()
      const steamAppID = String(game.steam_app_id || '').trim()

      if (!gameId || !steamAppID) return

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
        return
      }

      if (!response.ok) {
        return
      }

      const json = (await response.json()) as SteamAppDetailsResponse
      const entry = json?.[steamAppID]

      if (!entry?.success || !entry.data) {
        return
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
        throw new Error(
          `pc_games update failed for ${steamAppID}: ${gameError.message}`
        )
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
    })

    await finishSyncLog(
      logId,
      'success',
      `Steam-only enrich finished (processed ${processed}, enriched ${enriched}, screenshotsInserted ${screenshotsInserted}, rateLimited ${rateLimited}, priceRowsUpserted ${priceRowsUpserted}, iterations ${iterations}, batchSize ${batchSize}, concurrency ${concurrency}, scope ${scope})`,
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
      concurrency,
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
        error:
          error instanceof Error ? error.message : 'Unknown enrich error',
      },
      { status: 500 }
    )
  }
}