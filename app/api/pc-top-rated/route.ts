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

type TopRatedPcGame = {
  steamAppID: string
  slug: string
  title: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  platform: 'pc'
  url: string
  metacritic: number
  isFreeToPlay: boolean
}

type TopRatedResponse = {
  items: TopRatedPcGame[]
  totalItems: number
  totalPages: number
  page: number
  pageSize: number
  hasNextPage: boolean
  mode: 'top-rated'
  source: 'pc_games+pc_public_catalog_cache'
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for pc-top-rated')
  }

  return createClient(url, serviceRole)
}

function normalizeSteamTitle(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™©]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[:\-–—_/.,+!?'""]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

function getSafeDiscountPercent(
  salePrice?: string | number,
  normalPrice?: string | number,
  savings?: string | number
) {
  const sale = Number(salePrice || 0)
  const normal = Number(normalPrice || 0)
  const rawSavings = Number(savings || 0)

  if (normal > 0 && sale >= 0 && normal > sale) {
    const computed = ((normal - sale) / normal) * 100
    return Math.max(0, Math.min(99, Math.round(computed)))
  }

  if (Number.isFinite(rawSavings) && rawSavings > 0) {
    return Math.max(0, Math.min(99, Math.round(rawSavings)))
  }

  return 0
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const requestedPage = Math.max(1, Number(searchParams.get('page') || '1'))
    const pageSize = Math.max(
      1,
      Math.min(60, Number(searchParams.get('pageSize') || '36'))
    )
    const rawQuery = searchParams.get('q') || ''
    const priceFilter = searchParams.get('price') || 'all'
    const normalizedQuery = normalizeSteamTitle(rawQuery)

    const supabase = getServiceSupabase()

    const { data: metaRows, error: metaError } = await supabase
      .from('pc_games')
      .select('id, metacritic')
      .eq('is_catalog_ready', true)
      .eq('steam_type', 'game')
      .gte('metacritic', 70)
      .limit(25000)

    if (metaError) {
      throw metaError
    }

    const eligibleMetaRows = Array.isArray(metaRows)
      ? (metaRows as PcGameMetaRow[])
      : []

    if (eligibleMetaRows.length === 0) {
      const emptyResponse: TopRatedResponse = {
        items: [],
        totalItems: 0,
        totalPages: 1,
        page: 1,
        pageSize,
        hasNextPage: false,
        mode: 'top-rated',
        source: 'pc_games+pc_public_catalog_cache',
      }

      return Response.json(emptyResponse, { status: 200 })
    }

    const metacriticByGameId = new Map<string, number>()
    const eligibleIds: string[] = []

    for (const row of eligibleMetaRows) {
      const gameId = String(row.id || '').trim()
      const metacritic = Number(row.metacritic || 0)

      if (!gameId) continue
      if (!Number.isFinite(metacritic) || metacritic < 70) continue

      metacriticByGameId.set(gameId, metacritic)
      eligibleIds.push(gameId)
    }

    if (eligibleIds.length === 0) {
      const emptyResponse: TopRatedResponse = {
        items: [],
        totalItems: 0,
        totalPages: 1,
        page: 1,
        pageSize,
        hasNextPage: false,
        mode: 'top-rated',
        source: 'pc_games+pc_public_catalog_cache',
      }

      return Response.json(emptyResponse, { status: 200 })
    }

    const { data: cacheRows, error: cacheError } = await supabase
      .from('pc_public_catalog_cache')
      .select(
        'pc_game_id, steam_app_id, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, is_free_to_play'
      )
      .in('pc_game_id', eligibleIds)

    if (cacheError) {
      throw cacheError
    }

    const joinedItems = ((Array.isArray(cacheRows) ? cacheRows : []) as CatalogCacheRow[])
      .map((row) => {
        const gameId = String(row.pc_game_id || '').trim()
        const metacritic = metacriticByGameId.get(gameId)

        if (!gameId || !metacritic) return null

        const title = String(row.title || '').trim()
        const thumb = String(row.thumb || '').trim()
        const slug = String(row.slug || '').trim()

        if (!title || !thumb || !slug) return null

        const salePrice = formatMoneyOrEmpty(row.sale_price)
        const normalPrice = formatMoneyOrEmpty(row.normal_price)
        const savings = formatSavings(row.discount_percent)

        return {
          steamAppID: String(row.steam_app_id || '').trim(),
          slug,
          title,
          salePrice,
          normalPrice,
          savings,
          thumb,
          storeID: String(row.store_id || '1').trim(),
          platform: 'pc' as const,
          url: String(row.url || '').trim(),
          metacritic,
          isFreeToPlay: Boolean(row.is_free_to_play),
        }
      })
      .filter(Boolean) as TopRatedPcGame[]

    const filteredItems = joinedItems.filter((item) => {
      const salePrice = Number(item.salePrice || 0)
      const safeSavings = getSafeDiscountPercent(
        item.salePrice,
        item.normalPrice,
        item.savings
      )

      if (priceFilter === 'under-5' && !(salePrice > 0 && salePrice < 5)) {
        return false
      }

      if (priceFilter === 'under-10' && !(salePrice > 0 && salePrice < 10)) {
        return false
      }

      if (priceFilter === 'over-80' && safeSavings < 80) {
        return false
      }

      if (normalizedQuery) {
        return normalizeSteamTitle(item.title).includes(normalizedQuery)
      }

      return true
    })

    const sortedItems = [...filteredItems].sort((a, b) => {
      if (b.metacritic !== a.metacritic) {
        return b.metacritic - a.metacritic
      }

      const savingsA = getSafeDiscountPercent(a.salePrice, a.normalPrice, a.savings)
      const savingsB = getSafeDiscountPercent(b.salePrice, b.normalPrice, b.savings)

      if (savingsB !== savingsA) {
        return savingsB - savingsA
      }

      return a.title.localeCompare(b.title)
    })

    const totalItems = sortedItems.length
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 1
    const safePage = totalItems > 0 ? Math.min(requestedPage, totalPages) : 1
    const from = (safePage - 1) * pageSize
    const items = sortedItems.slice(from, from + pageSize)

    const response: TopRatedResponse = {
      items,
      totalItems,
      totalPages,
      page: safePage,
      pageSize,
      hasNextPage: safePage < totalPages,
      mode: 'top-rated',
      source: 'pc_games+pc_public_catalog_cache',
    }

    return Response.json(response, { status: 200 })
  } catch (error) {
    console.error('api/pc-top-rated error', error)

    const fallback: TopRatedResponse = {
      items: [],
      totalItems: 0,
      totalPages: 1,
      page: 1,
      pageSize: 36,
      hasNextPage: false,
      mode: 'top-rated',
      source: 'pc_games+pc_public_catalog_cache',
    }

    return Response.json(fallback, { status: 200 })
  }
}