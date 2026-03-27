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

type DealsCache = {
  data: CheapSharkDeal[]
  fetchedAt: number
}

const CACHE_TTL_MS = 1000 * 60 * 5

declare global {
  // eslint-disable-next-line no-var
  var __lobodeals_home_cache__: DealsCache | undefined
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
    throw new Error(`CheapShark home page ${pageNumber} failed with ${res.status}`)
  }

  const data = await res.json()
  return Array.isArray(data) ? data : []
}

function cleanDeals(deals: CheapSharkDeal[]) {
  const cleaned = deals.filter((deal) => {
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

  return deduped
}

export async function GET() {
  try {
    const cached = global.__lobodeals_home_cache__
    const now = Date.now()

    if (cached && now - cached.fetchedAt < CACHE_TTL_MS && cached.data.length > 0) {
      return Response.json(cached.data)
    }

    const pageNumbers = [0]

    const allResults: CheapSharkDeal[] = []
    let successCount = 0

    for (const pageNumber of pageNumbers) {
      try {
        const pageData = (await fetchDealsPage(pageNumber)) as CheapSharkDeal[]
        allResults.push(...pageData)
        successCount += 1
      } catch (error) {
        console.error(`Home deals page ${pageNumber} failed`, error)
      }
    }

    if (successCount === 0) {
      if (cached?.data?.length) {
        return Response.json(cached.data)
      }

      return Response.json(
        { error: 'Failed to load home deals from CheapShark' },
        { status: 500 }
      )
    }

    const finalDeals = cleanDeals(allResults)

    global.__lobodeals_home_cache__ = {
      data: finalDeals,
      fetchedAt: now,
    }

    return Response.json(finalDeals)
  } catch (error) {
    const cached = global.__lobodeals_home_cache__

    if (cached?.data?.length) {
      return Response.json(cached.data)
    }

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load home deals',
      },
      { status: 500 }
    )
  }
}