export async function GET() {
  try {
    const res = await fetch(
      'https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=60',
      {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LoboDeals/1.0',
        },
      }
    )

    const text = await res.text()

    if (!res.ok) {
      return Response.json(
        {
          error: 'CheapShark respondió con error',
          status: res.status,
          body: text.slice(0, 500),
        },
        { status: 500 }
      )
    }

    const data = JSON.parse(text)

    return Response.json(Array.isArray(data) ? data.slice(0, 36) : [])
  } catch (error) {
    return Response.json(
      {
        error: 'Error real al obtener deals',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    )
  }
}