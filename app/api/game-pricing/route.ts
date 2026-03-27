export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const gameID = searchParams.get('gameID')

    if (!gameID) {
      return Response.json({ error: 'Missing gameID' }, { status: 400 })
    }

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

    if (!res.ok) {
      return Response.json(
        { error: 'Failed to load game pricing data' },
        { status: 500 }
      )
    }

    const data = await res.json()

    return Response.json({
      cheapestPriceEver: data?.cheapestPriceEver?.price ?? null,
      cheapestPriceEverDate: data?.cheapestPriceEver?.date ?? null,
    })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Unknown pricing error',
      },
      { status: 500 }
    )
  }
}