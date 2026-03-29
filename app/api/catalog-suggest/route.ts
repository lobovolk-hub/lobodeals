export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type CheapSharkGame = {
  gameID: string
  steamAppID?: string
  external?: string
  thumb?: string
  internalName?: string
}

type CheapSharkGameDeal = {
  dealID?: string
  storeID?: string
  price?: string
  retailPrice?: string
  savings?: string
}

type CheapSharkGameDetail = {
  deals?: CheapSharkGameDeal[]
}

type CatalogSuggestResult = {
  gameID: string
  steamAppID?: string
  external?: string
  thumb?: string
  cheapestDealID?: string
  cheapest?: string
  normalPrice?: string
  storeID?: string
  savings?: string
}

const ALLOWED_STORE_IDS = new Set(['1', '3', '7', '8', '11', '13', '15', '25'])
const SUGGEST_TTL_MS = 1000 * 60 * 60 * 6

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for catalog suggest cache')
  }

  return createClient(url, serviceRole)
}

function makeCacheKey(title: string) {
  return `catalog_suggest_v2::${title.toLowerCase().trim()}`
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
  return data as { payload: CatalogSuggestResult[]; updated_at: string }
}

async function writeCache(cacheKey: string, payload: CatalogSuggestResult[]) {
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

function stripUnapprovedDealFields(game: CheapSharkGame): CatalogSuggestResult {
  return {
    gameID: game.gameID,
    steamAppID: game.steamAppID || '',
    external: game.external || '',
    thumb: game.thumb || '',
    cheapestDealID: '',
    cheapest: '',
    normalPrice: '',
    storeID: '',
    savings: '',
  }
}

async function enrichGame(game: CheapSharkGame): Promise<CatalogSuggestResult> {
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
      thumb: game.thumb || '',
      cheapestDealID: bestApprovedDeal.dealID || '',
      cheapest: bestApprovedDeal.price || '',
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

    if (rawTitle.length < 3) {
      return Response.json([], { status: 200 })
    }

    const cacheKey = makeCacheKey(rawTitle)
    const cached = await readCache(cacheKey)

    if (cached && isFresh(cached.updated_at, SUGGEST_TTL_MS)) {
      return Response.json(cached.payload, { status: 200 })
    }

    const url = `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(
      rawTitle
    )}&limit=5&exact=0`

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

    const enriched = await Promise.all(cleaned.slice(0, 5).map(enrichGame))

    if (enriched.length > 0) {
      await writeCache(cacheKey, enriched)
    }

    return Response.json(enriched, { status: 200 })
  } catch (error) {
    console.error('catalog suggest error', error)
    return Response.json([], { status: 200 })
  }
}