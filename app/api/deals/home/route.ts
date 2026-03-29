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

function normalizeTitle(title: string) {
  return title.toLowerCase().trim()
}

function isLowValueContent(title: string) {
  const t = normalizeTitle(title)

  const badTerms = [
    'soundtrack',
    'ost',
    'dlc',
    'season pass',
    'expansion pass',
    'booster',
    'coins',
    'points',
    'credits',
    'skin',
    'skins',
    'cosmetic',
    'avatar',
    'avatars',
    'wallpaper',
    'artbook',
    'editor',
    'server',
    'dedicated server',
    'demo',
    'playtest',
    'beta',
    'test server',
    'character pass',
    'starter pack',
    'supporter pack',
    'weapon pack',
    'voice pack',
    'costume pack',
    'music pack',
    'map pack',
  ]

  return badTerms.some((term) => t.includes(term))
}

function dedupeByGame(deals: Deal[]) {
  const seen = new Set<string>()
  const result: Deal[] = []

  for (const deal of deals) {
    const key = deal.gameID || deal.title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(deal)
  }

  return result
}

function pickUnique(source: Deal[], count: number, usedKeys: Set<string>) {
  const picked: Deal[] = []

  for (const deal of source) {
    const key = deal.gameID || deal.title.toLowerCase()
    if (usedKeys.has(key)) continue
    usedKeys.add(key)
    picked.push(deal)
    if (picked.length >= count) break
  }

  return picked
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
    const rawDeals = Array.isArray(data) ? (data as Deal[]) : []

    const deals = dedupeByGame(rawDeals).filter(
      (deal) => !isLowValueContent(deal.title)
    )

    const bestOverall = [...deals].sort((a, b) => {
      const aScore =
        Number(a.dealRating || 0) * 12 +
        Number(a.metacriticScore || 0) * 3 +
        Number(a.savings || 0) * 1.1
      const bScore =
        Number(b.dealRating || 0) * 12 +
        Number(b.metacriticScore || 0) * 3 +
        Number(b.savings || 0) * 1.1
      return bScore - aScore
    })

    const bestRated = [...deals]
      .filter((deal) => Number(deal.metacriticScore || 0) >= 70)
      .sort(
        (a, b) =>
          Number(b.metacriticScore || 0) - Number(a.metacriticScore || 0)
      )

    const biggestDiscounts = [...deals].sort(
      (a, b) => Number(b.savings || 0) - Number(a.savings || 0)
    )

    const latestish = [...deals]

    const usedKeys = new Set<string>()

    const curated = [
      ...pickUnique(bestOverall, 12, usedKeys),
      ...pickUnique(bestRated, 10, usedKeys),
      ...pickUnique(biggestDiscounts, 10, usedKeys),
      ...pickUnique(latestish, 7, usedKeys),
    ]

    return Response.json(curated.slice(0, 39))
  } catch (error) {
    console.error('api/deals/home error', error)
    return Response.json([])
  }
}