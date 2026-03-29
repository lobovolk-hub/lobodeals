export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type CheapSharkGame = {
  gameID: string
  steamAppID?: string
  cheapest?: string
  cheapestDealID?: string
  external?: string
  internalName?: string
  thumb?: string
}

type CheapSharkGameDeal = {
  dealID?: string
  storeID?: string
  price?: string
  retailPrice?: string
  savings?: string
}

type CheapSharkGameDetail = {
  info?: {
    title?: string
    thumb?: string
  }
  deals?: CheapSharkGameDeal[]
}

type CatalogSearchResult = {
  gameID: string
  steamAppID?: string
  cheapest?: string
  cheapestDealID?: string
  external?: string
  internalName?: string
  thumb?: string
  normalPrice?: string
  storeID?: string
  savings?: string
}

const ALLOWED_STORE_IDS = new Set(['1', '3', '7', '8', '11', '13', '15', '25'])
const SEARCH_TTL_MS = 1000 * 60 * 60 * 6

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for catalog search cache')
  }

  return createClient(url, serviceRole)
}

function makeCacheKey(title: string) {
  return `catalog_search_v2::${title.toLowerCase().trim()}`
}

function isFresh(updatedAt: string, maxAgeMs: number) {
  return Date.now() - new Date(updatedAt).getTime() <= maxAgeMs
}

async function readCache(cacheKey: string) {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('deals_cache')
    .select('payload, updated_at')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (error || !data) return null
  return data as { payload: CatalogSearchResult[]; updated_at: string }
}

async function writeCache(cacheKey: string, payload: CatalogSearchResult[]) {
  const supabase = getServiceSupabase()

  const { error } = await supabase.from('deals_cache').upsert(
    {
      cache_key: cacheKey,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'cache_key' }
  )

  if (error) throw error
}

function stripUnapprovedDealFields(game: CheapSharkGame): CatalogSearchResult {
  return {
    gameID: game.gameID,
    steamAppID: game.steamAppID || '',
    external: game.external || '',
    internalName: game.internalName || '',
    thumb: game.thumb || '',
    cheapest: '',
    cheapestDealID: '',
    normalPrice: '',
    storeID: '',
    savings: '',
  }
}

async function enrichGame(game: CheapSharkGame): Promise<CatalogSearchResult> {
  try {
    const res = await fetch(
      `https://www.cheapshark.com/api/1.0/games?id=${encodeURIComponent(
        game.gameID
      )}`,
      {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LoboDeals/1.0',
        },
      }
    )

    if (!res.ok) {
      return stripUnapprovedDealFields(game)
    }

    const detail = (await res.json()) as CheapSharkGameDetail
    const deals = Array.isArray(detail?.deals) ? detail.deals : []

    const approvedDeals = deals
      .filter((deal) => deal.storeID && ALLOWED_STORE_IDS.has(deal.storeID))
      .sort((a, b) => Number(a.price || 999999) - Number(b.price || 999999))

    const bestApprovedDeal = approvedDeals[0]

    if (!bestApprovedDeal) {
      return stripUnapprovedDealFields(game)
    }

    return {
      gameID: game.gameID,
      steamAppID: game.steamAppID || '',
      external: game.external || '',
      internalName: game.internalName || '',
      thumb: game.thumb || '',
      cheapest: bestApprovedDeal.price || '',
      cheapestDealID: bestApprovedDeal.dealID || '',
      normalPrice: bestApprovedDeal.retailPrice || '',
      storeID: bestApprovedDeal.storeID || '',
      savings: bestApprovedDeal.savings || '',
    }
  } catch {
    return stripUnapprovedDealFields(game)
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawTitle = searchParams.get('title')?.trim() || ''

    if (rawTitle.length < 2) {
      return Response.json([], { status: 200 })
    }

    const cacheKey = makeCacheKey(rawTitle)
    const cached = await readCache(cacheKey)

    if (cached && isFresh(cached.updated_at, SEARCH_TTL_MS)) {
      return Response.json(cached.payload, { status: 200 })
    }

    const url = `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(
      rawTitle
    )}&limit=24&exact=0`

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LoboDeals/1.0',
      },
    })

    if (!res.ok) {
      if (cached) return Response.json(cached.payload, { status: 200 })
      return Response.json([], { status: 200 })
    }

    const data = await res.json()
    const list = Array.isArray(data) ? (data as CheapSharkGame[]) : []

    const cleaned = list.filter((game) => {
      if (!game.gameID) return false
      if (!game.external || typeof game.external !== 'string') return false
      return true
    })

    const limited = cleaned.slice(0, 8)
    const enriched = await Promise.all(limited.map(enrichGame))

    if (enriched.length > 0) {
      await writeCache(cacheKey, enriched)
    }

    return Response.json(enriched, { status: 200 })
  } catch (error) {
    console.error('catalog search error', error)
    return Response.json([], { status: 200 })
  }
}