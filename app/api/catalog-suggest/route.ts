export const runtime = 'nodejs'

type CheapSharkGame = {
  gameID: string
  external?: string
  thumb?: string
  cheapestDealID?: string
  cheapest?: string
}

const suggestionCache = new Map<string, { expiresAt: number; data: CheapSharkGame[] }>()
const SUGGEST_TTL_MS = 1000 * 60 * 5

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawTitle = searchParams.get('title')?.trim() || ''
    const title = rawTitle.toLowerCase()

    if (title.length < 3) {
      return Response.json([], { status: 200 })
    }

    const cached = suggestionCache.get(title)
    if (cached && cached.expiresAt > Date.now()) {
      return Response.json(cached.data, { status: 200 })
    }

    const url = `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(
      rawTitle
    )}&limit=5&exact=0`

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LoboDeals/1.0',
      },
    })

    if (!res.ok) {
      return Response.json([], { status: 200 })
    }

    const data = await res.json()
    const list = Array.isArray(data) ? (data as CheapSharkGame[]) : []

    const cleaned = list.filter((game) => {
      if (!game.gameID) return false
      if (!game.external || typeof game.external !== 'string') return false
      return true
    })

    suggestionCache.set(title, {
      expiresAt: Date.now() + SUGGEST_TTL_MS,
      data: cleaned.slice(0, 5),
    })

    return Response.json(cleaned.slice(0, 5), { status: 200 })
  } catch (error) {
    console.error('catalog suggest error', error)
    return Response.json([], { status: 200 })
  }
}