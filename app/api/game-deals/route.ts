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
  gameID?: string
  storeID?: string
  title?: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
  dealRating?: string
  metacriticScore?: string
}

type RelatedDeal = {
  dealID: string
  gameID?: string
  title?: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
  storeID?: string
  dealRating?: string
  metacriticScore?: string
  steamUrl?: string
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

function titleBase(value: string) {
  return normalizeTitle(value)
    .replace(/\b(deluxe edition|ultimate edition|complete edition|gold edition|definitive edition|remastered|season pass|deluxe pack|bundle|dlc|add on|addon)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleDistance(rawA: string, rawB: string) {
  const a = normalizeTitle(rawA)
  const b = normalizeTitle(rawB)
  if (a === b) return 100
  const baseA = titleBase(rawA)
  const baseB = titleBase(rawB)
  if (baseA && baseA === baseB) return 80
  if (a.startsWith(`${b} `) || b.startsWith(`${a} `)) return 40
  if (baseA.startsWith(`${baseB} `) || baseB.startsWith(`${baseA} `)) return 20
  return 0
}

function dedupeDeals(deals: RelatedDeal[]) {
  const bestByStore = new Map<string, RelatedDeal>()

  for (const deal of deals) {
    const key = `${deal.storeID || ''}`
    const existing = bestByStore.get(key)

    if (!existing) {
      bestByStore.set(key, deal)
      continue
    }

    const currentPrice = Number(deal.salePrice || 999999)
    const existingPrice = Number(existing.salePrice || 999999)

    if (currentPrice < existingPrice) {
      bestByStore.set(key, deal)
      continue
    }

    if (currentPrice === existingPrice) {
      const currentSavings = Number(deal.savings || 0)
      const existingSavings = Number(existing.savings || 0)
      if (currentSavings > existingSavings) {
        bestByStore.set(key, deal)
      }
    }
  }

  return Array.from(bestByStore.values())
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const gameID = searchParams.get('gameID')
    const title = searchParams.get('title')
    const steamAppID = searchParams.get('steamAppID')
    const steamUrl = searchParams.get('steamUrl')
    const steamSalePrice = searchParams.get('steamSalePrice')
    const steamNormalPrice = searchParams.get('steamNormalPrice')
    const steamSavings = searchParams.get('steamSavings')
    const thumb = searchParams.get('thumb')

    if (!gameID && !title && !steamAppID) {
      return Response.json({ error: 'Missing gameID, title or steamAppID' }, { status: 400 })
    }

    const results: RelatedDeal[] = []
    const requestedTitle = title || ''

    if (steamAppID) {
      results.push({
        dealID: `steam-${steamAppID}`,
        gameID: '',
        title: requestedTitle,
        salePrice: steamSalePrice || '',
        normalPrice: steamNormalPrice || '',
        savings: steamSavings || '',
        thumb: thumb || '',
        storeID: '1',
        dealRating: '',
        metacriticScore: '',
        steamUrl: steamUrl || '',
      })
    }

    if (gameID) {
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

      if (res.ok) {
        const data = (await res.json()) as CheapSharkGameDetail
        const infoTitle = data?.info?.title || requestedTitle || ''
        const infoThumb = data?.info?.thumb || thumb || ''
        const deals = Array.isArray(data?.deals) ? data.deals : []

        const approvedDeals = deals
          .filter((deal) => {
            if (!deal.storeID || !ALLOWED_STORE_IDS.has(deal.storeID)) return false
            if (steamAppID && deal.storeID === '1') return false
            return true
          })
          .map((deal) => ({
            dealID: deal.dealID || '',
            gameID,
            title: infoTitle,
            salePrice: deal.price || '',
            normalPrice: deal.retailPrice || '',
            savings: deal.savings || '',
            thumb: infoThumb,
            storeID: deal.storeID || '',
            steamUrl: undefined,
          }))

        results.push(...approvedDeals)
      }
    } else if (requestedTitle) {
      const res = await fetch(
        `https://www.cheapshark.com/api/1.0/deals?title=${encodeURIComponent(requestedTitle)}&pageSize=60&sortBy=Price`,
        {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'LoboDeals/1.0',
          },
        }
      )

      if (res.ok) {
        const data = await res.json()
        const deals = Array.isArray(data) ? (data as CheapSharkDealSearch[]) : []

        const filtered = deals
          .filter((deal) => {
            if (!deal.storeID || !ALLOWED_STORE_IDS.has(deal.storeID)) return false
            if (!deal.title) return false
            if (steamAppID && deal.storeID === '1') return false

            return titleDistance(requestedTitle, deal.title) >= 80
          })
          .map((deal) => ({
            dealID: deal.dealID || '',
            gameID: deal.gameID || '',
            title: deal.title || requestedTitle,
            salePrice: deal.salePrice || '',
            normalPrice: deal.normalPrice || '',
            savings: deal.savings || '',
            thumb: deal.thumb || thumb || '',
            storeID: deal.storeID || '',
            dealRating: deal.dealRating || '',
            metacriticScore: deal.metacriticScore || '',
            steamUrl: undefined,
          }))

        results.push(...filtered)
      }
    }

    const deduped = dedupeDeals(results).sort((a, b) => {
      const aPrice = Number(a.salePrice || 999999)
      const bPrice = Number(b.salePrice || 999999)
      return aPrice - bPrice
    })

    return Response.json(deduped)
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
