export const runtime = 'nodejs'

type Deal = {
  dealID: string
  gameID?: string
  title: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  dealRating?: string
  metacriticScore?: string
}

export async function GET(request: Request) {
  try {
    const baseUrl = new URL(request.url).origin
    const res = await fetch(`${baseUrl}/api/deals`, {
      cache: 'no-store',
    })

    if (!res.ok) {
      return Response.json([])
    }

    const data = await res.json()
    const deals = Array.isArray(data) ? (data as Deal[]) : []

    return Response.json(deals.slice(0, 39))
  } catch (error) {
    console.error('api/deals/home error', error)
    return Response.json([])
  }
}