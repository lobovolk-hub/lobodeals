export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import {
  makePcCanonicalKey,
  normalizeCanonicalTitle,
} from '@/lib/pcCanonical'

type PcGameRow = {
  id: string
  steam_app_id: string
  canonical_title: string
  slug: string
}

type SteamAppDetailsEnvelope = Record<
  string,
  {
    success?: boolean
    data?: {
      steam_appid?: number
      name?: string
      type?: string
      is_free?: boolean
      short_description?: string
      detailed_description?: string
      header_image?: string
      capsule_image?: string
      capsule_imagev5?: string
      background?: string
      website?: string
      release_date?: {
        coming_soon?: boolean
        date?: string
      }
      genres?: Array<{ id?: string; description?: string }>
      categories?: Array<{ id?: number; description?: string }>
      screenshots?: Array<{ id?: number; path_full?: string; path_thumbnail?: string }>
    }
  }
>

type SyncLogRow = {
  id: string
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for steam appdetails enrich')
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

async function createSyncLog(jobType: string) {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('sync_logs')
    .insert({
      job_type: jobType,
      status: 'running',
      notes: 'Steam appdetails enrich started',
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

function parseReleaseDate(raw?: string | null) {
  if (!raw) return null

  const normalized = raw.trim()
  if (!normalized) return null

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null

  return parsed.toISOString().slice(0, 10)
}

function isCatalogGameType(type?: string | null) {
  return String(type || '').trim().toLowerCase() === 'game'
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(request: Request) {
  let logId: string | null = null

  try {
    if (!isAuthorized(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const requestedBatchSize = Number(body?.batchSize || 50)
    const batchSize = Math.max(1, Math.min(100, requestedBatchSize))

    const log = await createSyncLog('steam_appdetails_enrich')
    logId = log.id

    const supabase = getServiceSupabase()

    const { data: pendingGames, error: pendingError } = await supabase
      .from('pc_games')
            .select('id, steam_app_id, canonical_title, slug')
      .eq('is_catalog_ready', false)
      .order('steam_app_id', { ascending: true })
      .limit(batchSize)

    if (pendingError) {
      throw pendingError
    }

    const rows = (pendingGames || []) as PcGameRow[]

    if (!rows.length) {
      await finishSyncLog(
        logId,
        'success',
        'No pending Steam apps to enrich',
        0
      )

      return Response.json({
        ok: true,
        processed: 0,
        updated: 0,
        screenshotsInserted: 0,
        note: 'No pending Steam apps to enrich',
      })
    }

        let updated = 0
    let screenshotsInserted = 0

    for (const row of rows) {
      const url = new URL('https://store.steampowered.com/api/appdetails')
      url.searchParams.set('appids', row.steam_app_id)
      url.searchParams.set('l', 'english')
      url.searchParams.set('cc', 'us')

      const res = await fetch(url.toString(), {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LoboDeals/2.5',
        },
      })

            if (!res.ok) {
        const text = await res.text().catch(() => '')

        if (res.status === 429) {
          await finishSyncLog(
            logId!,
            'success',
            `Rate limited at app ${row.steam_app_id}. Partial batch completed safely.`,
            updated
          )

          return Response.json({
            ok: true,
            processed: updated,
            updated,
            screenshotsInserted,
            note: `Rate limited at app ${row.steam_app_id}. Stop this batch and retry later.`,
            hitRateLimit: true,
          })
        }

        throw new Error(
          `Steam appdetails failed for app ${row.steam_app_id} with status ${res.status}: ${text}`
        )
      }

      const payload = (await res.json()) as SteamAppDetailsEnvelope
      const entry = payload?.[row.steam_app_id]
      const data = entry?.data

      if (!entry?.success || !data) {
        const { error } = await supabase
          .from('pc_games')
          .update({
            is_catalog_ready: true,
            is_active: false,
            steam_last_sync_at: new Date().toISOString(),
          })
          .eq('id', row.id)

        if (error) throw error
        updated += 1
        continue
      }

      const steamType = String(data.type || '').trim().toLowerCase()
      const steamName = String(data.name || row.canonical_title || '').trim()
      const shortDescription = String(data.short_description || '').trim()
      const detailedDescription = String(data.detailed_description || '').trim()
      const headerImage = String(data.header_image || '').trim()
      const capsuleImage = String(
        data.capsule_imagev5 || data.capsule_image || ''
      ).trim()

      const isFreeToPlay = Boolean(data.is_free)
      const isRealCatalogGame = isCatalogGameType(steamType)
      const isActive = isRealCatalogGame

      const { error: updateError } = await supabase
        .from('pc_games')
        .update({
                    steam_name: steamName || row.canonical_title,
          canonical_title: steamName || row.canonical_title,
          normalized_title: normalizeCanonicalTitle(steamName || row.canonical_title),
          canonical_key: makePcCanonicalKey(steamName || row.canonical_title),
          slug: row.slug,
          steam_type: steamType || null,
          is_free_to_play: isFreeToPlay,
          is_active: isActive,
          is_catalog_ready: true,
          release_date: parseReleaseDate(data.release_date?.date || null),
          short_description: shortDescription || null,
          description: detailedDescription || null,
          header_image: headerImage || null,
          capsule_image: capsuleImage || headerImage || null,
          steam_last_sync_at: new Date().toISOString(),
        })
        .eq('id', row.id)

      if (updateError) throw updateError

      const screenshots = Array.isArray(data.screenshots) ? data.screenshots : []

      if (screenshots.length > 0) {
        const screenshotRows = screenshots
          .map((shot, index) => {
            const imageUrl = String(shot?.path_full || '').trim()
            if (!imageUrl) return null

            return {
              pc_game_id: row.id,
              image_url: imageUrl,
              sort_order: index,
            }
          })
          .filter(Boolean)

        if (screenshotRows.length > 0) {
          const { error: screenshotError } = await supabase
            .from('pc_game_screenshots')
            .upsert(screenshotRows, {
              onConflict: 'pc_game_id,image_url',
            })

          if (screenshotError) throw screenshotError
          screenshotsInserted += screenshotRows.length
        }
      }

      updated += 1
    }

    await finishSyncLog(
      logId,
      'success',
      'Steam appdetails enrich completed',
      rows.length
    )

    return Response.json({
      ok: true,
      processed: rows.length,
      updated,
      screenshotsInserted,
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