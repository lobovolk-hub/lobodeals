export const runtime = 'nodejs'

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

type CheapSharkDealSearch = {
  dealID?: string
  gameID?: string
  storeID?: string
  title?: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
  dealRating?: string
  metacriticScore?: string
}

type RelatedDeal = {
  dealID: string
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

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[:\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeDeals(deals: RelatedDeal[]) {
  const seen = new Set<string>()
  const result: RelatedDeal[] = []

  for (const deal of deals) {
    const key = `${deal.storeID || ''}-${deal.dealID || ''}-${deal.salePrice || ''}`

    if (seen.has(key)) continue
    seen.add(key)
    result.push(deal)
  }

  return result
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const gameID = searchParams.get('gameID')
    const title = searchParams.get('title')
    const steamAppID = searchParams.get('steamAppID')
    const steamUrl = searchParams.get('steamUrl')
    const steamSalePrice = searchParams.get('steamSalePrice')
    const steamNormalPrice = searchParams.get('steamNormalPrice')
    const steamSavings = searchParams.get('steamSavings')
    const thumb = searchParams.get('thumb')

    if (!gameID && !title && !steamAppID) {
      return Response.json(
        { error: 'Missing gameID, title or steamAppID' },
        { status: 400 }
      )
    }

    const results: RelatedDeal[] = []

    if (steamAppID) {
      results.push({
        dealID: `steam-${steamAppID}`,
        gameID: '',
        title: title || '',
        salePrice: steamSalePrice || '',
        normalPrice: steamNormalPrice || '',
        savings: steamSavings || '',
        thumb: thumb || '',
        storeID: '1',
        dealRating: '',
        metacriticScore: '',
      })
    }

    if (gameID) {
      const res = await fetch(
        `https://www.cheapshark.com/api/1.0/games?id=${encodeURIComponent(gameID)}`,
        {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'LoboDeals/1.0',
          },
        }
      )

      if (res.ok) {
        const data = (await res.json()) as CheapSharkGameDetail
        const infoTitle = data?.info?.title || title || ''
        const infoThumb = data?.info?.thumb || thumb || ''
        const deals = Array.isArray(data?.deals) ? data.deals : []

        const approvedDeals = deals
  .filter((deal) => {
    if (!deal.storeID || !ALLOWED_STORE_IDS.has(deal.storeID)) return false

    // Si ya tenemos una fila Steam interna para este juego,
    // no duplicamos la fila de Steam que venga de CheapShark.
    if (steamAppID && deal.storeID === '1') return false

    return true
  })
  .map((deal) => ({
    dealID: deal.dealID || '',
    gameID,
    title: infoTitle,
    salePrice: deal.price || '',
    normalPrice: deal.retailPrice || '',
    savings: deal.savings || '',
    thumb: infoThumb,
    storeID: deal.storeID || '',
  }))

        results.push(...approvedDeals)
      }
    } else if (title) {
      const rawTitle = title || ''
      const normalizedBase = normalizeTitle(rawTitle)

      const res = await fetch(
        `https://www.cheapshark.com/api/1.0/deals?title=${encodeURIComponent(
          rawTitle
        )}&pageSize=60&sortBy=Price`,
        {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'LoboDeals/1.0',
          },
        }
      )

      if (res.ok) {
        const data = await res.json()
        const deals = Array.isArray(data) ? (data as CheapSharkDealSearch[]) : []

        const filtered = deals
  .filter((deal) => {
    if (!deal.storeID || !ALLOWED_STORE_IDS.has(deal.storeID)) return false
    if (!deal.title) return false

    // Si ya tenemos una fila Steam interna para este juego,
    // no duplicamos la fila de Steam que venga de CheapShark.
    if (steamAppID && deal.storeID === '1') return false

    const normalizedDeal = normalizeTitle(deal.title)

    return (
      normalizedDeal === normalizedBase ||
      normalizedDeal.startsWith(`${normalizedBase} `) ||
      normalizedBase.startsWith(`${normalizedDeal} `)
    )
  })
  .map((deal) => ({
    dealID: deal.dealID || '',
    gameID: deal.gameID || '',
    title: deal.title || rawTitle,
    salePrice: deal.salePrice || '',
    normalPrice: deal.normalPrice || '',
    savings: deal.savings || '',
    thumb: deal.thumb || thumb || '',
    storeID: deal.storeID || '',
    dealRating: deal.dealRating || '',
    metacriticScore: deal.metacriticScore || '',
  }))

        results.push(...filtered)
      }
    }

    const deduped = dedupeDeals(results).sort((a, b) => {
      const aPrice = Number(a.salePrice || 999999)
      const bPrice = Number(b.salePrice || 999999)
      return aPrice - bPrice
    })

    return Response.json(
      deduped.map((deal) => ({
        ...deal,
        steamUrl:
          deal.dealID === `steam-${steamAppID}` && steamUrl ? steamUrl : undefined,
      }))
    )
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load game deals',
      },
      { status: 500 }
    )
  }
}