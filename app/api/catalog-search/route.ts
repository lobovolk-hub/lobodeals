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
    const title = searchParams.get('title')?.trim()

    if (!title) {
      return Response.json({ error: 'Missing title' }, { status: 400 })
    }

    const url = `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(
      title
    )}&limit=24&exact=0`

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LoboDeals/1.0',
      },
    })

    if (!res.ok) {
      return Response.json(
        { error: `CheapShark catalog search failed with ${res.status}` },
        { status: 500 }
      )
    }

    const data = await res.json()
    const list = Array.isArray(data) ? (data as CheapSharkGame[]) : []

    const cleaned = list.filter((game) => {
      if (!game.gameID) return false
      if (!game.external || typeof game.external !== 'string') return false
      return true
    })

    // Limitamos el enriquecimiento para no castigar demasiado la API.
    const limited = cleaned.slice(0, 12)

    const enriched = await Promise.all(limited.map(enrichGame))

    return Response.json(enriched)
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Catalog search failed',
      },
      { status: 500 }
    )
  }
}