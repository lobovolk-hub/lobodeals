export const runtime = 'nodejs'

type CheapSharkDeal = {
  dealID: string
  [key: string]: unknown
}

export async function GET() {
  try {
    const baseUrl = 'https://www.cheapshark.com/api/1.0/deals'

    const requests = [0, 1, 2].map((pageNumber) =>
      fetch(
        `${baseUrl}?storeID=1&pageSize=60&pageNumber=${pageNumber}&sortBy=Deal%20Rating&desc=1&lowerPrice=0`,
        {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'LoboDeals/1.0',
          },
        }
      )
    )

    const settled = await Promise.allSettled(requests)

    const successfulResponses = settled
      .filter(
        (result): result is PromiseFulfilledResult<Response> =>
          result.status === 'fulfilled' && result.value.ok
      )
      .map((result) => result.value)

    if (successfulResponses.length === 0) {
      return Response.json(
        { error: 'Failed to load deals from CheapShark' },
        { status: 500 }
      )
    }

    const jsonArrays = await Promise.all(
      successfulResponses.map(async (res) => {
        const data = await res.json()
        return Array.isArray(data) ? data : []
      })
    )

    const merged = jsonArrays.flat() as CheapSharkDeal[]

    const deduped = Array.from(
      new Map(
        merged
          .filter((deal) => typeof deal?.dealID === 'string' && deal.dealID)
          .map((deal) => [deal.dealID, deal])
      ).values()
    )

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