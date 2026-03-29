
export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import {
  makePcCanonicalKey,
  makePcCanonicalSlug,
  normalizeCanonicalTitle,
} from '@/lib/pcCanonical'

type SteamAppListItem = {
  appid?: number
  name?: string
}

type SteamAppListResponse = {
  applist?: {
    apps?: SteamAppListItem[]
  }
}

type SyncLogRow = {
  id: string
}

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

function buildBaseSlug(title: string) {
  return makePcCanonicalSlug(title)
}

function buildUniqueSlug(
  title: string,
  steamAppID: string,
  usedSlugs: Set<string>,
  existingSlugByAppId: Map<string, string>
) {
  const existing = existingSlugByAppId.get(steamAppID)
  if (existing) {
    usedSlugs.add(existing)
    return existing
  }

  const base = buildBaseSlug(title) || `steam-app-${steamAppID}`

  if (!usedSlugs.has(base)) {
    usedSlugs.add(base)
    return base
  }

  const withAppId = `${base}-${steamAppID}`

  if (!usedSlugs.has(withAppId)) {
    usedSlugs.add(withAppId)
    return withAppId
  }

  let counter = 2
  while (usedSlugs.has(`${withAppId}-${counter}`)) {
    counter += 1
  }

  const finalSlug = `${withAppId}-${counter}`
  usedSlugs.add(finalSlug)
  return finalSlug
}

async function createSyncLog(jobType: string) {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('sync_logs')
    .insert({
      job_type: jobType,
      status: 'running',
      notes: 'Steam app list import started',
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

async function fetchSteamAppList(): Promise<Array<{ appid: number; name: string }>> {
  const res = await fetch(
    'https://raw.githubusercontent.com/jsnli/steamappidlist/master/data/games_appid.json',
    {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LoboDeals/2.5',
      },
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Steam bootstrap list failed with status ${res.status}: ${body}`)
  }

  const rawApps = await res.json()

  if (!Array.isArray(rawApps)) {
    throw new Error('Steam bootstrap list returned invalid JSON format')
  }

  return rawApps
    .map((item: { appid?: number; name?: string }) => ({
      appid: Number(item.appid || 0),
      name: String(item.name || '').trim(),
    }))
    .filter((item: { appid: number; name: string }) => item.appid > 0 && item.name.length > 0)
}

export async function POST(request: Request) {
  let logId: string | null = null

  try {
    if (!isAuthorized(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const log = await createSyncLog('steam_applist_import')
    logId = log.id

    const supabase = getServiceSupabase()
    const apps = await fetchSteamAppList()

    const { data: existingGames, error: existingError } = await supabase
      .from('pc_games')
      .select('steam_app_id, slug')

    if (existingError) {
      throw existingError
    }

    const existingSlugByAppId = new Map<string, string>()
    const usedSlugs = new Set<string>()

    for (const row of existingGames || []) {
      const steamAppID = String(row.steam_app_id || '').trim()
      const slug = String(row.slug || '').trim()

      if (steamAppID && slug) {
        existingSlugByAppId.set(steamAppID, slug)
        usedSlugs.add(slug)
      }
    }

    const rows = apps.map((app: { appid: number; name: string }) => {
      const steamAppID = String(app.appid)
      const title = app.name
      const slug = buildUniqueSlug(title, steamAppID, usedSlugs, existingSlugByAppId)

      return {
        steam_app_id: steamAppID,
        slug,
        canonical_title: title,
        normalized_title: normalizeCanonicalTitle(title),
        canonical_key: makePcCanonicalKey(title),
        is_free_to_play: false,
        is_active: false,
        steam_type: null,
        is_catalog_ready: false,
        steam_last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    })

    const chunkSize = 1000
    let processed = 0

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize)

      const { error } = await supabase
        .from('pc_games')
        .upsert(chunk, {
          onConflict: 'steam_app_id',
        })

      if (error) {
        throw error
      }

      processed += chunk.length
    }

    await finishSyncLog(
      logId,
      'success',
      'Steam app list imported into pc_games',
      processed
    )

    return Response.json({
      ok: true,
      importedApps: processed,
    })
  } catch (error) {
    console.error('internal-import-steam-applist error', error)

    if (logId) {
      try {
        await finishSyncLog(
          logId,
          'error',
          error instanceof Error ? error.message : 'Unknown import error',
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