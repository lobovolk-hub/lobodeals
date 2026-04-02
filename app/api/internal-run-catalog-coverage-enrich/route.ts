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
    throw new Error('Missing Supabase env vars for catalog coverage enrich')
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

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }

  return chunks
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const maxTargets = Math.max(1, Math.min(1000, Number(body?.maxTargets || 200)))
    const chunkSize = Math.max(1, Math.min(25, Number(body?.chunkSize || 20)))

    const supabase = getServiceSupabase()

    const { data: games, error: gamesError } = await supabase
      .from('pc_games')
      .select('id, steam_app_id, metacritic')
      .eq('is_catalog_ready', true)
      .eq('steam_type', 'game')
      .not('steam_app_id', 'is', null)
      .limit(25000)

    if (gamesError) {
      throw new Error(`games query failed: ${gamesError.message}`)
    }

    const typedGames = Array.isArray(games) ? (games as PcGameRow[]) : []
    const gameIds = typedGames
      .map((row) => String(row.id || '').trim())
      .filter(Boolean)

    const screenshotSet = new Set<string>()

    const idChunks = chunkArray(gameIds, 100)

    for (const ids of idChunks) {
      const { data: screenshotRows, error: screenshotError } = await supabase
        .from('pc_game_screenshots')
        .select('pc_game_id')
        .in('pc_game_id', ids)

      if (screenshotError) {
        throw new Error(`screenshots query failed: ${screenshotError.message}`)
      }

      for (const row of Array.isArray(screenshotRows) ? screenshotRows : []) {
        const key = String((row as any)?.pc_game_id || '').trim()
        if (key) screenshotSet.add(key)
      }
    }

    const targets = dedupeStrings(
      typedGames
        .filter((game) => {
          const gameId = String(game.id || '').trim()
          const hasScreenshots = screenshotSet.has(gameId)
          const hasMetacritic = Number(game.metacritic || 0) > 0
          return !hasScreenshots || !hasMetacritic
        })
        .map((game) => String(game.steam_app_id || '').trim())
    ).slice(0, maxTargets)

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
    console.error('internal-run-catalog-coverage-enrich error', error)

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown internal-run-catalog-coverage-enrich error',
      },
      { status: 500 }
    )
  }
}