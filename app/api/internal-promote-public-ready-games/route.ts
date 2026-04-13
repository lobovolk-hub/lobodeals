export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type PcGameRow = {
  id: string
  steam_type?: string | null
  slug?: string | null
  steam_name?: string | null
  canonical_title?: string | null
  header_image?: string | null
  capsule_image?: string | null
  hero_image_url?: string | null
  is_free_to_play?: boolean | null
  is_catalog_ready?: boolean | null
}

type OfferRow = {
  pc_game_id?: string | null
  is_available?: boolean | null
  price_last_synced_at?: string | null
}

type SyncLogRow = {
  id: string
}

const REGION_CODE = 'us'
const STORE_ID = '1'
const PAGE_SIZE = 2000
const UPDATE_CHUNK_SIZE = 500

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for public-ready games promoter')
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

function normalizeText(value: unknown) {
  const text = String(value || '').trim()
  return text || null
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

async function loadAllGameRows() {
  const supabase = getServiceSupabase()
  const rows: PcGameRow[] = []

  let from = 0

  for (;;) {
    const to = from + PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('pc_games')
      .select(
        'id, steam_type, slug, steam_name, canonical_title, header_image, capsule_image, hero_image_url, is_free_to_play, is_catalog_ready'
      )
      .eq('steam_type', 'game')
      .order('id', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(`loadAllGameRows failed: ${error.message}`)
    }

    const chunk = Array.isArray(data) ? (data as PcGameRow[]) : []

    if (chunk.length === 0) {
      break
    }

    rows.push(...chunk)

    if (chunk.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return rows
}

async function loadAvailableOfferGameIds(gameIds: string[]) {
  const supabase = getServiceSupabase()
  const availableIds = new Set<string>()

  for (const chunk of chunkArray(gameIds, 500)) {
    const { data, error } = await supabase
      .from('pc_store_offers')
      .select('pc_game_id, is_available, price_last_synced_at')
      .eq('store_id', STORE_ID)
      .eq('region_code', REGION_CODE)
      .eq('is_available', true)
      .in('pc_game_id', chunk)

    if (error) {
      throw new Error(`loadAvailableOfferGameIds failed: ${error.message}`)
    }

    for (const row of (Array.isArray(data) ? data : []) as OfferRow[]) {
      const gameId = String(row.pc_game_id || '').trim()
      if (!gameId) continue
      availableIds.add(gameId)
    }
  }

  return availableIds
}

function computeShouldBeReady(
  row: PcGameRow,
  availableOfferGameIds: Set<string>
) {
  const hasSlug = Boolean(normalizeText(row.slug))
  const hasTitle = Boolean(
    normalizeText(row.steam_name) || normalizeText(row.canonical_title)
  )
  const hasThumb = Boolean(
    normalizeText(row.header_image) ||
      normalizeText(row.capsule_image) ||
      normalizeText(row.hero_image_url)
  )
  const isFree = Boolean(row.is_free_to_play)
  const hasAvailableUsOffer = availableOfferGameIds.has(
    String(row.id || '').trim()
  )

  return hasSlug && hasTitle && hasThumb && (isFree || hasAvailableUsOffer)
}

async function updateReadyFlags(ids: string[], nextValue: boolean) {
  const supabase = getServiceSupabase()
  let updated = 0

  for (const chunk of chunkArray(ids, UPDATE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('pc_games')
      .update({
        is_catalog_ready: nextValue,
        updated_at: new Date().toISOString(),
      })
      .in('id', chunk)
      .select('id')

    if (error) {
      throw new Error(`updateReadyFlags failed: ${error.message}`)
    }

    updated += Array.isArray(data) ? data.length : 0
  }

  return updated
}

async function countGamesState() {
  const supabase = getServiceSupabase()

  const { count: totalGames, error: totalError } = await supabase
    .from('pc_games')
    .select('id', { count: 'exact', head: true })
    .eq('steam_type', 'game')

  if (totalError) {
    throw new Error(`countGamesState total failed: ${totalError.message}`)
  }

  const { count: readyGames, error: readyError } = await supabase
    .from('pc_games')
    .select('id', { count: 'exact', head: true })
    .eq('steam_type', 'game')
    .eq('is_catalog_ready', true)

  if (readyError) {
    throw new Error(`countGamesState ready failed: ${readyError.message}`)
  }

  const { count: visibleGames, error: visibleError } = await supabase
    .from('pc_public_catalog_cache')
    .select('pc_game_id', { count: 'exact', head: true })
    .eq('steam_type', 'game')

  if (visibleError) {
    throw new Error(`countGamesState visible failed: ${visibleError.message}`)
  }

  return {
    totalGames: totalGames || 0,
    readyGames: readyGames || 0,
    visibleGames: visibleGames || 0,
  }
}

export async function POST(request: Request) {
  let logId: string | null = null

  try {
    if (!isAuthorized(request)) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const log = await createSyncLog(
      'promote_public_ready_games',
      'Promote public-ready games started'
    )
    logId = log.id

    const rows = await loadAllGameRows()
    const gameIds = rows.map((row) => row.id).filter(Boolean)
    const availableOfferGameIds = await loadAvailableOfferGameIds(gameIds)

    const promoteIds: string[] = []
    const demoteIds: string[] = []

    for (const row of rows) {
      const shouldBeReady = computeShouldBeReady(row, availableOfferGameIds)
      const isReady = Boolean(row.is_catalog_ready)

      if (shouldBeReady && !isReady) {
        promoteIds.push(row.id)
      } else if (!shouldBeReady && isReady) {
        demoteIds.push(row.id)
      }
    }

    const promoted =
      promoteIds.length > 0 ? await updateReadyFlags(promoteIds, true) : 0
    const demoted =
      demoteIds.length > 0 ? await updateReadyFlags(demoteIds, false) : 0

    const supabase = getServiceSupabase()

    const { error: pcError } = await supabase.rpc(
      'refresh_pc_public_catalog_cache'
    )
    if (pcError) {
      throw new Error(
        `refresh_pc_public_catalog_cache failed: ${pcError.message}`
      )
    }

    const { error: catalogError } = await supabase.rpc(
      'refresh_catalog_public_cache'
    )
    if (catalogError) {
      throw new Error(
        `refresh_catalog_public_cache failed: ${catalogError.message}`
      )
    }

    const counts = await countGamesState()
    const notes = `Public-ready games promotion finished (promoted ${promoted}, demoted ${demoted}, totalGames ${counts.totalGames}, readyGames ${counts.readyGames}, visibleGames ${counts.visibleGames})`

    await finishSyncLog(logId, 'success', notes, promoted + demoted)

    return Response.json({
      success: true,
      promoted,
      demoted,
      totalGames: counts.totalGames,
      readyGames: counts.readyGames,
      visibleGames: counts.visibleGames,
    })
  } catch (error) {
    console.error('internal-promote-public-ready-games error', error)

    if (logId) {
      try {
        await finishSyncLog(
          logId,
          'error',
          error instanceof Error
            ? error.message
            : 'Unknown public-ready games promotion error',
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
          error instanceof Error
            ? error.message
            : 'Unknown public-ready games promotion error',
      },
      { status: 500 }
    )
  }
}
