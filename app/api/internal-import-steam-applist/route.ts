export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import {
  makePcCanonicalKey,
  makePcCanonicalSlug,
  normalizeCanonicalTitle,
} from '@/lib/pcCanonical'

type SyncLogRow = {
  id: string
}

type ImportBody = {
  mode?: 'full' | 'incremental'
  if_modified_since?: number
  max_results?: number
  include_videos?: boolean
  include_hardware?: boolean
  page_limit?: number
  start_after_appid?: number
  categories?: Array<'game' | 'dlc' | 'software' | 'video' | 'hardware'>
}

type SteamStoreAppItem = {
  appid?: number
  name?: string
  last_modified?: number
  price_change_number?: number
}

type SteamStoreAppListResponse = {
  response?: {
    apps?: SteamStoreAppItem[]
    have_more_results?: boolean
    last_appid?: number
  }
  apps?: SteamStoreAppItem[]
  have_more_results?: boolean
  last_appid?: number
}

type InventoryCategory = {
  steamType: 'game' | 'dlc' | 'software' | 'video' | 'hardware'
  include_games: boolean
  include_dlc: boolean
  include_software: boolean
  include_videos: boolean
  include_hardware: boolean
}

const DEFAULT_MAX_RESULTS = 10000
const MAX_RESULTS_CAP = 50000
const UPSERT_CHUNK_SIZE = 250

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for steam applist import')
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

async function createSyncLog(jobType: string, notes: string) {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('sync_logs')
    .insert({
      job_type: jobType,
      status: 'running',
      notes,
      items_processed: 0,
    })
    .select('id')
    .single()

  if (error) throw error
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

  if (error) throw error
}

function buildBaseSlug(title: string) {
  return makePcCanonicalSlug(title)
}

function buildInventorySlug(
  title: string,
  steamAppID: string,
  existingSlugByAppId: Map<string, string>
) {
  const existing = String(existingSlugByAppId.get(steamAppID) || '').trim()

  if (existing) {
    return existing
  }

  const base = buildBaseSlug(title) || 'steam-app'
  return `${base}-${steamAppID}`
}

function toBoolString(value: boolean) {
  return value ? 'true' : 'false'
}

function normalizeSteamType(value: string) {
  const safe = String(value || '').trim().toLowerCase()

  if (safe === 'video' || safe === 'series' || safe === 'episode') return 'video'
  if (safe === 'hardware') return 'hardware'
  if (safe === 'software' || safe === 'application' || safe === 'tool') return 'software'
  if (safe === 'dlc') return 'dlc'
  return 'game'
}

function parseResponseShape(json: SteamStoreAppListResponse) {
  const root =
    json?.response && typeof json.response === 'object'
      ? json.response
      : json

  const apps = Array.isArray(root?.apps) ? root.apps : []
  const haveMoreResults =
    typeof root?.have_more_results === 'boolean'
      ? root.have_more_results
      : false
  const lastAppId =
    typeof root?.last_appid === 'number'
      ? root.last_appid
      : apps.length > 0
      ? Number(apps[apps.length - 1]?.appid || 0)
      : 0

  return {
    apps,
    haveMoreResults,
    lastAppId,
  }
}

async function fetchSteamStoreAppListPage(args: {
  apiKey: string
  category: InventoryCategory
  lastAppId?: number
  maxResults: number
  ifModifiedSince?: number
}) {
  const input = {
    max_results: args.maxResults,
    include_games: args.category.include_games,
    include_dlc: args.category.include_dlc,
    include_software: args.category.include_software,
    include_videos: args.category.include_videos,
    include_hardware: args.category.include_hardware,
    ...(args.lastAppId && args.lastAppId > 0 ? { last_appid: args.lastAppId } : {}),
    ...(args.ifModifiedSince && args.ifModifiedSince > 0
      ? { if_modified_since: args.ifModifiedSince }
      : {}),
  }

  const params = new URLSearchParams()
  params.set('key', args.apiKey)
  params.set('input_json', JSON.stringify(input))

  const url = `https://api.steampowered.com/IStoreService/GetAppList/v1/?${params.toString()}`

  const res = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LoboDeals/2.52j inventory sync',
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `IStoreService/GetAppList failed (${args.category.steamType}) with status ${res.status}: ${body}`
    )
  }

  const json = (await res.json()) as SteamStoreAppListResponse
  return parseResponseShape(json)
}

function getCategoriesFromBody(body: ImportBody): InventoryCategory[] {
  const requested = Array.isArray(body.categories) ? body.categories : null

  const categoryMap: Record<string, InventoryCategory> = {
    game: {
      steamType: 'game',
      include_games: true,
      include_dlc: false,
      include_software: false,
      include_videos: false,
      include_hardware: false,
    },
    dlc: {
      steamType: 'dlc',
      include_games: false,
      include_dlc: true,
      include_software: false,
      include_videos: false,
      include_hardware: false,
    },
    software: {
      steamType: 'software',
      include_games: false,
      include_dlc: false,
      include_software: true,
      include_videos: false,
      include_hardware: false,
    },
    video: {
      steamType: 'video',
      include_games: false,
      include_dlc: false,
      include_software: false,
      include_videos: true,
      include_hardware: false,
    },
    hardware: {
      steamType: 'hardware',
      include_games: false,
      include_dlc: false,
      include_software: false,
      include_videos: false,
      include_hardware: true,
    },
  }

  if (requested && requested.length > 0) {
    return requested
      .map((key) => categoryMap[key])
      .filter(Boolean)
  }

  const includeVideos = body.include_videos === true
  const includeHardware = body.include_hardware === true

  const categories: InventoryCategory[] = [
    categoryMap.game,
    categoryMap.dlc,
    categoryMap.software,
  ]

  if (includeVideos) categories.push(categoryMap.video)
  if (includeHardware) categories.push(categoryMap.hardware)

  return categories
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }

  return chunks
}

async function fetchExistingPcGamesByAppIds(appIds: string[]) {
  const supabase = getServiceSupabase()
  const uniqueIds = Array.from(
    new Set(
      appIds
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  )

  const chunks = chunkArray(uniqueIds, 500)
  const existingSlugByAppId = new Map<string, string>()

  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('pc_games')
      .select('steam_app_id, slug')
      .in('steam_app_id', chunk)

    if (error) {
      throw error
    }

    for (const row of data || []) {
      const steamAppID = String(row.steam_app_id || '').trim()
      const slug = String(row.slug || '').trim()

      if (steamAppID) {
        existingSlugByAppId.set(steamAppID, slug)
      }
    }
  }

  return existingSlugByAppId
}

async function upsertPcGamesInChunks(rows: Record<string, unknown>[]) {
  const supabase = getServiceSupabase()
  const chunks = chunkArray(rows, UPSERT_CHUNK_SIZE)

  let totalUpserted = 0

  for (const chunk of chunks) {
    const { error } = await supabase
      .from('pc_games')
      .upsert(chunk, {
        onConflict: 'steam_app_id',
      })

    if (error) {
      throw error
    }

    totalUpserted += chunk.length
  }

  return totalUpserted
}

export async function POST(request: Request) {
  let logId: string | null = null

  try {
    if (!isAuthorized(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as ImportBody

    const apiKey = String(process.env.STEAM_WEB_API_KEY || '').trim()
    if (!apiKey) {
      throw new Error('Missing STEAM_WEB_API_KEY')
    }

    const mode = body.mode === 'incremental' ? 'incremental' : 'full'
    const maxResults = Math.min(
      Math.max(Number(body.max_results || DEFAULT_MAX_RESULTS), 1),
      MAX_RESULTS_CAP
    )
    const pageLimit =
      Number(body.page_limit || 0) > 0 ? Number(body.page_limit) : null
    const categories = getCategoriesFromBody(body)

    if (categories.length === 0) {
      throw new Error('No inventory categories selected')
    }

    const note =
      mode === 'incremental'
        ? 'Steam official inventory sync started (incremental)'
        : 'Steam official inventory sync started (full)'

    const log = await createSyncLog('steam_applist_import', note)
    logId = log.id

    const supabase = getServiceSupabase()

    const nowIso = new Date().toISOString()
    let processed = 0
    let insertedOrUpdated = 0
    let pagesFetched = 0
    const categorySummaries: string[] = []
    let finalLastAppId = 0
    for (const category of categories) {
      let lastAppId =
  Number(body.start_after_appid || 0) > 0
    ? Number(body.start_after_appid)
    : 0
      let categoryProcessed = 0
      let keepGoing = true
      let categoryPages = 0

      while (keepGoing) {
        const page = await fetchSteamStoreAppListPage({
          apiKey,
          category,
          lastAppId,
          maxResults,
          ifModifiedSince:
            mode === 'incremental' && Number(body.if_modified_since || 0) > 0
              ? Number(body.if_modified_since)
              : undefined,
        })

        const apps = page.apps || []

        if (apps.length === 0) {
          break
        }

const pageAppIds = apps
  .map((app) => String(Number(app.appid || 0) || '').trim())
  .filter(Boolean)

const existingSlugByAppId = await fetchExistingPcGamesByAppIds(pageAppIds)

        const rows: Record<string, unknown>[] = []

        for (const app of apps) {
          const appid = Number(app.appid || 0)
          const rawName = String(app.name || '').trim()

          if (!appid || !rawName) {
            continue
          }

          const steamAppID = String(appid)
          const canonicalTitle = rawName
          const slug = buildInventorySlug(
  canonicalTitle,
  steamAppID,
  existingSlugByAppId
)

          const row: Record<string, unknown> = {
            steam_app_id: steamAppID,
            steam_name: canonicalTitle,
            canonical_title: canonicalTitle,
            normalized_title: normalizeCanonicalTitle(canonicalTitle),
            canonical_key: makePcCanonicalKey(canonicalTitle),
            slug,
            steam_type: normalizeSteamType(category.steamType),
            steam_catalog_last_modified: Number(app.last_modified || 0) || null,
            steam_price_change_number:
              Number(app.price_change_number || 0) || null,
            steam_catalog_last_seen_at: nowIso,
            steam_inventory_source: 'steam_istoreservice',
            steam_last_sync_at: nowIso,
            updated_at: nowIso,
          }

          if (!existingSlugByAppId.has(steamAppID)) {
  row.steam_catalog_first_seen_at = nowIso
}

          rows.push(row)
        }

        if (rows.length > 0) {
          const upserted = await upsertPcGamesInChunks(rows)
          insertedOrUpdated += upserted
          categoryProcessed += rows.length
          processed += rows.length
        }

        pagesFetched += 1
        categoryPages += 1
        lastAppId = Number(page.lastAppId || 0)
        finalLastAppId = lastAppId
        const hitPageLimit =
          pageLimit !== null && categoryPages >= pageLimit

        if (hitPageLimit) {
          keepGoing = false
        } else if (page.haveMoreResults === true && lastAppId > 0) {
          keepGoing = true
        } else if (apps.length >= maxResults && lastAppId > 0) {
          keepGoing = true
        } else {
          keepGoing = false
        }
      }

      categorySummaries.push(`${category.steamType}:${categoryProcessed}`)
    }

    await finishSyncLog(
      logId,
      'success',
      `Steam official inventory sync completed (processed ${processed}, upserted ${insertedOrUpdated}, pages ${pagesFetched}, mode ${mode}, categories ${categorySummaries.join(', ')})`,
      processed
    )

    return Response.json({
  ok: true,
  processed,
  upserted: insertedOrUpdated,
  pagesFetched,
  mode,
  categories: categorySummaries,
  lastAppId: finalLastAppId,
})
  } catch (error) {
    console.error('internal-import-steam-applist error', error)

    if (logId) {
      try {
        await finishSyncLog(
  logId,
  'error',
  error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message?: unknown }).message || 'Unknown import error')
    : JSON.stringify(error),
  0
)
      } catch (logError) {
        console.error('sync log update failed', logError)
      }
    }

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : JSON.stringify(error),
      },
      { status: 500 }
    )
  }
}