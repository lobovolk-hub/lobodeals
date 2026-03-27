export const runtime = 'nodejs'

type CheapSharkDeal = {
  dealID: string
  title?: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
  storeID?: string
  gameID?: string
  dealRating?: string
  metacriticScore?: string
  [key: string]: unknown
}

async function fetchDealsPage(pageNumber: number) {
  const baseUrl = 'https://www.cheapshark.com/api/1.0/deals'

  const res = await fetch(
    `${baseUrl}?pageSize=60&pageNumber=${pageNumber}&sortBy=Deal%20Rating&desc=1&lowerPrice=0`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LoboDeals/1.0',
      },
    }
  )

  if (!res.ok) {
    throw new Error(`CheapShark page ${pageNumber} failed with ${res.status}`)
  }

  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function GET() {
  try {
    // Bajamos a 6 páginas, pero más estable.
    // 6 x 60 = hasta 360 deals brutos.
    const pageNumbers = Array.from({ length: 6 }, (_, i) => i)

    const allResults: CheapSharkDeal[] = []
    let successCount = 0

    for (const pageNumber of pageNumbers) {
      try {
        const pageData = (await fetchDealsPage(pageNumber)) as CheapSharkDeal[]
        allResults.push(...pageData)
        successCount += 1
      } catch (error) {
        console.error(`Deals page ${pageNumber} failed`, error)
      }
    }

    if (successCount === 0) {
      return Response.json(
        { error: 'Failed to load deals from CheapShark' },
        { status: 500 }
      )
    }

    const cleaned = allResults.filter((deal) => {
      if (!deal?.dealID) return false
      if (!deal?.title || typeof deal.title !== 'string') return false
      if (!deal?.storeID || typeof deal.storeID !== 'string') return false
      if (!deal?.salePrice || !deal?.normalPrice) return false
      if (!deal?.thumb || typeof deal.thumb !== 'string') return false

      const salePrice = Number(deal.salePrice)
      const normalPrice = Number(deal.normalPrice)

      if (Number.isNaN(salePrice) || Number.isNaN(normalPrice)) return false
      if (normalPrice <= 0) return false
      if (salePrice < 0) return false

      return true
    })

    const deduped = Array.from(
      new Map(cleaned.map((deal) => [deal.dealID, deal])).values()
    )

    deduped.sort((a, b) => {
      const aRating = Number(a.dealRating || 0)
      const bRating = Number(b.dealRating || 0)

      if (aRating !== bRating) {
        return bRating - aRating
      }

      const aSavings = Number(a.savings || 0)
      const bSavings = Number(b.savings || 0)

      return bSavings - aSavings
    })

    return Response.json(deduped, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load deals',
      },
      { status: 500 }
    )
  }
}