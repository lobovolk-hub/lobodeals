export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type PcGameRow = {
  id: string
  steam_app_id?: string | null
  metacritic?: number | null
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for visible priority enrich')
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

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  )
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const maxTargets = Math.max(1, Math.min(200, Number(body?.maxTargets || 80)))
    const chunkSize = Math.max(1, Math.min(25, Number(body?.chunkSize || 20)))

    const supabase = getServiceSupabase()

    const [
      { data: storefrontRows, error: storefrontError },
      { data: topRatedRows, error: topRatedError },
    ] = await Promise.all([
      supabase
        .from('public_storefront_sections_cache')
        .select('steam_app_id')
        .not('steam_app_id', 'is', null),

      supabase
        .from('pc_games')
        .select('steam_app_id')
        .eq('is_catalog_ready', true)
        .eq('steam_type', 'game')
        .not('steam_app_id', 'is', null)
        .not('metacritic', 'is', null)
        .order('metacritic', { ascending: false })
        .limit(100),
    ])

    if (storefrontError) throw storefrontError
    if (topRatedError) throw topRatedError

    const candidateSteamAppIDs = dedupeStrings([
      ...((storefrontRows || []) as Array<{ steam_app_id?: string | null }>).map((row) => row.steam_app_id),
      ...((topRatedRows || []) as Array<{ steam_app_id?: string | null }>).map((row) => row.steam_app_id),
    ])

    if (candidateSteamAppIDs.length === 0) {
      return Response.json({
        success: true,
        targetedSteamAppIDs: [],
        processedChunks: 0,
        runs: [],
      })
    }

    const { data: games, error: gamesError } = await supabase
      .from('pc_games')
      .select('id, steam_app_id, metacritic')
      .eq('is_catalog_ready', true)
      .in('steam_app_id', candidateSteamAppIDs)

    if (gamesError) throw gamesError

    const typedGames = Array.isArray(games) ? (games as PcGameRow[]) : []

    const gameIds = typedGames.map((row) => String(row.id || '').trim()).filter(Boolean)

    const { data: screenshotRows, error: screenshotError } = await supabase
      .from('pc_game_screenshots')
      .select('pc_game_id')
      .in('pc_game_id', gameIds)

    if (screenshotError) throw screenshotError

    const screenshotSet = new Set(
      (Array.isArray(screenshotRows) ? screenshotRows : []).map((row: any) =>
        String(row.pc_game_id || '').trim()
      )
    )

    const targets = typedGames
      .filter((game) => {
        const hasScreenshots = screenshotSet.has(String(game.id || '').trim())
        const hasMetacritic = Number(game.metacritic || 0) > 0
        return !hasScreenshots || !hasMetacritic
      })
      .map((game) => String(game.steam_app_id || '').trim())
      .filter(Boolean)
      .slice(0, maxTargets)

    const origin = new URL(request.url).origin
    const authHeader = request.headers.get('authorization') || ''

    const runs: Array<{
      chunk: number
      ok: boolean
      targetedSteamAppIDs: string[]
      enriched?: number
      screenshotsInserted?: number
      error?: string
    }> = []

    for (let i = 0; i < targets.length; i += chunkSize) {
      const chunk = targets.slice(i, i + chunkSize)

      const res = await fetch(`${origin}/api/internal-enrich-steam-appdetails`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          steamAppIDs: chunk,
          batchSize: chunk.length,
          iterations: 1,
        }),
        cache: 'no-store',
      })

      const data = await res.json().catch(() => ({}))

      runs.push({
        chunk: Math.floor(i / chunkSize) + 1,
        ok: Boolean(res.ok && data?.success),
        targetedSteamAppIDs: chunk,
        enriched: Number(data?.enriched || 0),
        screenshotsInserted: Number(data?.screenshotsInserted || 0),
        error: !res.ok || !data?.success ? data?.error || 'Chunk failed' : undefined,
      })
    }

    return Response.json({
      success: true,
      targetedSteamAppIDs: targets,
      processedChunks: runs.length,
      runs,
    })
  } catch (error) {
    console.error('internal-run-visible-priority-enrich error', error)

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown internal-run-visible-priority-enrich error',
      },
      { status: 500 }
    )
  }
}