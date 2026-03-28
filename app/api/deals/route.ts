export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type Deal = {
  dealID: string
  gameID?: string
  title: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  dealRating?: string
  metacriticScore?: string
}

type CheapSharkDeal = {
  dealID?: string
  gameID?: string
  title?: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
  storeID?: string
  dealRating?: string
  metacriticScore?: string
}

const ALLOWED_STORE_IDS = new Set(['1', '3', '7', '8', '11', '13', '15', '25'])
const PAGE_COUNT = 4

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for deals cache')
  }

  return createClient(url, serviceRole)
}

async function readCache() {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('deals_cache')
    .select('payload, updated_at')
    .eq('cache_key', 'cheapshark_deals_main')
    .maybeSingle()

  if (error || !data) return null

  return data as { payload: Deal[]; updated_at: string }
}

async function writeCache(payload: Deal[]) {
  const supabase = getServiceSupabase()

  const { error } = await supabase.from('deals_cache').upsert(
    {
      cache_key: 'cheapshark_deals_main',
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'cache_key' }
  )

  if (error) {
    throw error
  }
}

async function fetchDealsPage(pageNumber: number) {
  const url = `https://www.cheapshark.com/api/1.0/deals?pageNumber=${pageNumber}&pageSize=60&sortBy=DealRating&desc=1`

  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LoboDeals/1.0',
    },
  })

  if (!res.ok) {
    throw new Error(`CheapShark page ${pageNumber} failed with ${res.status}`)
  }

  const data = await res.json()
  return Array.isArray(data) ? (data as CheapSharkDeal[]) : []
}

function isFresh(updatedAt: string, maxAgeMs: number) {
  return Date.now() - new Date(updatedAt).getTime() <= maxAgeMs
}

export async function GET() {
  const CACHE_TTL_MS = 1000 * 60 * 30

  try {
    const cached = await readCache()

    if (cached && isFresh(cached.updated_at, CACHE_TTL_MS)) {
      return Response.json(cached.payload)
    }

    const allDeals: CheapSharkDeal[] = []

    for (let page = 0; page < PAGE_COUNT; page += 1) {
      try {
        const pageDeals = await fetchDealsPage(page)
        allDeals.push(...pageDeals)
      } catch (error) {
        console.error(`Deals page ${page} failed`, error)
      }
    }

    const cleaned: Deal[] = allDeals
      .filter((deal) => {
        if (!deal.dealID) return false
        if (!deal.title) return false
        if (!deal.storeID || !ALLOWED_STORE_IDS.has(deal.storeID)) return false
        return true
      })
      .map((deal) => ({
        dealID: deal.dealID || '',
        gameID: deal.gameID || '',
        title: deal.title || '',
        salePrice: deal.salePrice || '',
        normalPrice: deal.normalPrice || '',
        savings: deal.savings || '',
        thumb: deal.thumb || '',
        storeID: deal.storeID || '',
        dealRating: deal.dealRating || '',
        metacriticScore: deal.metacriticScore || '',
      }))

    if (cleaned.length > 0) {
      await writeCache(cleaned)
      return Response.json(cleaned)
    }

    if (cached) {
      return Response.json(cached.payload)
    }

    return Response.json([])
  } catch (error) {
    console.error('api/deals error', error)

    try {
      const cached = await readCache()
      if (cached) {
        return Response.json(cached.payload)
      }
    } catch {}

    return Response.json([])
  }
}