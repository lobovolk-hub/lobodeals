export async function GET() {
  try {
    const baseUrl = 'https://www.cheapshark.com/api/1.0/deals'

    const requests = [0, 1, 2].map((pageNumber) =>
      fetch(
        `${baseUrl}?storeID=1&pageSize=60&pageNumber=${pageNumber}&sortBy=Deal%20Rating&desc=1&lowerPrice=0`,
        {
          cache: 'no-store',
        }
      )
    )

    const responses = await Promise.all(requests)
    const jsonArrays = await Promise.all(responses.map((res) => res.json()))

    const merged = jsonArrays.flat()

    const deduped = Array.from(
      new Map(merged.map((deal: any) => [deal.dealID, deal])).values()
    )

    return Response.json(deduped)
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load deals',
      },
      { status: 500 }
    )
  }
}