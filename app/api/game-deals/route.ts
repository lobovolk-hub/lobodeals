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
  storeID?: string
  title?: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const gameID = searchParams.get('gameID')
    const title = searchParams.get('title')

    if (!gameID && !title) {
      return Response.json(
        { error: 'Missing gameID or title' },
        { status: 400 }
      )
    }

    if (gameID) {
      const res = await fetch(
        `https://www.cheapshark.com/api/1.0/games?id=${encodeURIComponent(
          gameID
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
        return Response.json(
          { error: `CheapShark game lookup failed with ${res.status}` },
          { status: 500 }
        )
      }

      const data = (await res.json()) as CheapSharkGameDetail
      const infoTitle = data?.info?.title || ''
      const infoThumb = data?.info?.thumb || ''

      const deals = Array.isArray(data?.deals) ? data.deals : []

      const approvedDeals = deals
        .filter((deal) => deal.storeID && ALLOWED_STORE_IDS.has(deal.storeID))
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
        .sort((a, b) => Number(a.salePrice || 999999) - Number(b.salePrice || 999999))

      return Response.json(approvedDeals)
    }

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

    if (!res.ok) {
      return Response.json(
        { error: `CheapShark title lookup failed with ${res.status}` },
        { status: 500 }
      )
    }

    const data = await res.json()
    const deals = Array.isArray(data) ? (data as CheapSharkDealSearch[]) : []

    const filtered = deals
      .filter((deal) => {
        if (!deal.storeID || !ALLOWED_STORE_IDS.has(deal.storeID)) return false
        if (!deal.title) return false

        const normalizedDeal = normalizeTitle(deal.title)

        return (
          normalizedDeal === normalizedBase ||
          normalizedDeal.startsWith(`${normalizedBase} `) ||
          normalizedBase.startsWith(`${normalizedDeal} `)
        )
      })
      .sort((a, b) => Number(a.salePrice || 999999) - Number(b.salePrice || 999999))

    return Response.json(filtered)
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