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
const FALLBACK_PAGE_COUNT = 4
const FALLBACK_PAGE_SIZE = 60

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

  if (error) throw error
}

async function fetchDealsPage(pageNumber: number) {
  const url = `https://www.cheapshark.com/api/1.0/deals?pageNumber=${pageNumber}&pageSize=${FALLBACK_PAGE_SIZE}&sortBy=DealRating&desc=1`

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

function normalizeTitle(title: string) {
  return title.toLowerCase().trim()
}

function penalizeLowValueContent(title: string) {
  const t = normalizeTitle(title)

  let penalty = 0

  const hardBadTerms = [
    'soundtrack',
    'ost',
    'dlc',
    'season pass',
    'expansion pass',
    'booster',
    'coins',
    'points',
    'credits',
    'skin',
    'skins',
    'cosmetic',
    'avatar',
    'avatars',
    'wallpaper',
    'artbook',
    'editor',
    'server',
    'dedicated server',
    'demo',
    'playtest',
    'beta',
    'test server',
    'character pass',
  ]

  const mediumBadTerms = [
    'pack',
    'bundle',
    'starter pack',
    'supporter pack',
    'weapon pack',
    'voice pack',
    'costume pack',
    'music pack',
    'map pack',
  ]

  for (const term of hardBadTerms) {
    if (t.includes(term)) penalty += 80
  }

  for (const term of mediumBadTerms) {
    if (t.includes(term)) penalty += 40
  }

  return penalty
}

function scoreDeal(deal: {
  metacriticScore?: string
  dealRating?: string
  savings?: string
  title?: string
  normalPrice?: string
  salePrice?: string
}) {
  const metacritic = Number(deal.metacriticScore || 0)
  const dealRating = Number(deal.dealRating || 0)
  const savings = Number(deal.savings || 0)
  const normalPrice = Number(deal.normalPrice || 0)
  const salePrice = Number(deal.salePrice || 0)
  const title = deal.title || ''

  let score = 0

  score += metacritic * 3
  score += dealRating * 12
  score += Math.min(savings, 95) * 1.1

  if (metacritic >= 90) score += 60
  else if (metacritic >= 85) score += 40
  else if (metacritic >= 80) score += 20

  if (normalPrice >= 20) score += 10
  if (normalPrice >= 40) score += 8
  if (salePrice > 0 && salePrice <= 2) score -= 8

  score -= penalizeLowValueContent(title)

  return score
}

function applyLimit(payload: Deal[], limitParam: string | null) {
  const limit = Number(limitParam || '')

  if (!Number.isFinite(limit) || limit <= 0) {
    return payload
  }

  return payload.slice(0, limit)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')

    const cached = await readCache()

    if (cached && Array.isArray(cached.payload)) {
      return Response.json(applyLimit(cached.payload, limitParam))
    }

    const allDeals: CheapSharkDeal[] = []

    for (let page = 0; page < FALLBACK_PAGE_COUNT; page += 1) {
      try {
        const pageDeals = await fetchDealsPage(page)
        allDeals.push(...pageDeals)
      } catch (error) {
        console.error(`Deals fallback page ${page} failed`, error)
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
      .sort((a, b) => scoreDeal(b) - scoreDeal(a))

    if (cleaned.length > 0) {
      await writeCache(cleaned)
      return Response.json(applyLimit(cleaned, limitParam))
    }

    return Response.json([])
  } catch (error) {
    console.error('api/deals error', error)

    try {
      const cached = await readCache()
      if (cached) return Response.json(cached.payload)
    } catch {}

    return Response.json([])
  }
}