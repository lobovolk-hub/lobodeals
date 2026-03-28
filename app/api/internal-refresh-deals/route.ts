export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

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
    throw new Error('Missing Supabase env vars for internal refresh')
  }

  return createClient(url, serviceRole)
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
  const deals = Array.isArray(data) ? (data as CheapSharkDeal[]) : []

  return deals
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const expected = `Bearer ${process.env.INTERNAL_REFRESH_TOKEN}`

    if (!process.env.INTERNAL_REFRESH_TOKEN) {
      return Response.json(
        { error: 'Missing INTERNAL_REFRESH_TOKEN' },
        { status: 500 }
      )
    }

    if (authHeader !== expected) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const allDeals: CheapSharkDeal[] = []

    for (let page = 0; page < PAGE_COUNT; page += 1) {
      try {
        const pageDeals = await fetchDealsPage(page)
        allDeals.push(...pageDeals)
      } catch (error) {
        console.error(`Refresh page ${page} failed`, error)
      }
    }

    const cleaned = allDeals
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

    const supabase = getServiceSupabase()

    const { error } = await supabase.from('deals_cache').upsert(
      {
        cache_key: 'cheapshark_deals_main',
        payload: cleaned,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' }
    )

    if (error) {
      throw error
    }

    return Response.json({
      success: true,
      count: cleaned.length,
    })
  } catch (error) {
    console.error('internal-refresh-deals error', error)

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to refresh internal deals cache',
      },
      { status: 500 }
    )
  }
}