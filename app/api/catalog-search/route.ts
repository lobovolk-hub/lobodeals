export const runtime = 'nodejs'

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
const searchCache = new Map<string, { expiresAt: number; data: CatalogSearchResult[] }>()
const SEARCH_TTL_MS = 1000 * 60 * 5

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
      return {
        ...game,
      }
    }

    const detail = (await res.json()) as CheapSharkGameDetail
    const deals = Array.isArray(detail?.deals) ? detail.deals : []

    const approvedDeals = deals
      .filter((deal) => deal.storeID && ALLOWED_STORE_IDS.has(deal.storeID))
      .sort((a, b) => Number(a.price || 999999) - Number(b.price || 999999))

    const bestApprovedDeal = approvedDeals[0]

    if (!bestApprovedDeal) {
      return {
        ...game,
      }
    }

    return {
      ...game,
      cheapest: bestApprovedDeal.price || game.cheapest || '',
      cheapestDealID: bestApprovedDeal.dealID || game.cheapestDealID || '',
      normalPrice: bestApprovedDeal.retailPrice || '',
      storeID: bestApprovedDeal.storeID || '',
      savings: bestApprovedDeal.savings || '',
    }
  } catch {
    return {
      ...game,
    }
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawTitle = searchParams.get('title')?.trim() || ''
    const title = rawTitle.toLowerCase()

    if (title.length < 2) {
      return Response.json([], { status: 200 })
    }

    const cached = searchCache.get(title)
    if (cached && cached.expiresAt > Date.now()) {
      return Response.json(cached.data, { status: 200 })
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

    searchCache.set(title, {
      expiresAt: Date.now() + SEARCH_TTL_MS,
      data: enriched,
    })

    return Response.json(enriched, { status: 200 })
  } catch (error) {
    console.error('catalog search error', error)
    return Response.json([], { status: 200 })
  }
}