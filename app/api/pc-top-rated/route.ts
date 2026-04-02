export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type CatalogCacheRow = {
  pc_game_id: string
  steam_app_id?: string | null
  slug?: string | null
  title?: string | null
  thumb?: string | null
  sale_price?: number | string | null
  normal_price?: number | string | null
  discount_percent?: number | string | null
  store_id?: string | number | null
  url?: string | null
  is_free_to_play?: boolean | null
}

type PcGameMetaRow = {
  id: string
  metacritic?: number | null
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for pc-top-rated')
  }

  return createClient(url, serviceRole)
}

function formatMoneyOrEmpty(value?: number | string | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return ''
  }

  return amount.toFixed(2)
}

function formatSavings(value?: number | string | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return '0'
  }

  return String(Math.max(0, Math.min(99, Math.round(amount))))
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedLimit = Number(searchParams.get('limit') || '300')
    const limit = Math.max(1, Math.min(1000, requestedLimit))

    const supabase = getServiceSupabase()

    const [{ data: cacheRows, error: cacheError }, { data: metaRows, error: metaError }] =
      await Promise.all([
        supabase
          .from('pc_public_catalog_cache')
          .select(
            'pc_game_id, steam_app_id, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, is_free_to_play'
          )
          .limit(25000),

        supabase
          .from('pc_games')
          .select('id, metacritic')
          .eq('is_catalog_ready', true)
          .eq('steam_type', 'game')
          .not('metacritic', 'is', null)
          .limit(25000),
      ])

    if (cacheError) throw cacheError
    if (metaError) throw metaError

    const metacriticByGameId = new Map<string, number>()

    for (const row of (Array.isArray(metaRows) ? metaRows : []) as PcGameMetaRow[]) {
      const gameId = String(row.id || '').trim()
      const metacritic = Number(row.metacritic || 0)

      if (!gameId) continue
      if (!Number.isFinite(metacritic) || metacritic < 70) continue

      metacriticByGameId.set(gameId, metacritic)
    }

    const topRated = ((Array.isArray(cacheRows) ? cacheRows : []) as CatalogCacheRow[])
      .map((row) => {
        const gameId = String(row.pc_game_id || '').trim()
        const metacritic = metacriticByGameId.get(gameId)

        if (!gameId || !metacritic) return null

        const title = String(row.title || '').trim()
        const thumb = String(row.thumb || '').trim()

        if (!title || !thumb) return null

        const salePrice = formatMoneyOrEmpty(row.sale_price)
        const normalPrice = formatMoneyOrEmpty(row.normal_price)

        return {
          steamAppID: String(row.steam_app_id || '').trim(),
          slug: String(row.slug || '').trim(),
          title,
          salePrice,
          normalPrice,
          savings: formatSavings(row.discount_percent),
          thumb,
          storeID: String(row.store_id || '1').trim(),
          platform: 'pc',
          url: String(row.url || '').trim(),
          metacritic,
          isFreeToPlay: Boolean(row.is_free_to_play),
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b!.metacritic !== a!.metacritic) {
          return b!.metacritic - a!.metacritic
        }

        const savingsA = Number(a!.savings || 0)
        const savingsB = Number(b!.savings || 0)

        if (savingsB !== savingsA) {
          return savingsB - savingsA
        }

        return a!.title.localeCompare(b!.title)
      })
      .slice(0, limit)

    return Response.json(topRated, { status: 200 })
  } catch (error) {
    console.error('api/pc-top-rated error', error)
    return Response.json([], { status: 200 })
  }
}