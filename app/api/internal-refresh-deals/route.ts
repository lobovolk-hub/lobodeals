export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type CheapSharkDeal = {
  dealID?: string
  gameID?: string
  title?: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
  storeID?: string
  dealRating?: string
  metacriticScore?: string
}

type SteamFeaturedItem = {
  id?: number
  name?: string
  discount_percent?: number
  original_price?: number
  final_price?: number
  large_capsule_image?: string
  small_capsule_image?: string
  header_image?: string
  windows_available?: boolean
  mac_available?: boolean
  linux_available?: boolean
}

type SteamFeaturedBucket = {
  items?: SteamFeaturedItem[]
}

type SteamFeaturedResponse = {
  specials?: SteamFeaturedBucket
  top_sellers?: SteamFeaturedBucket
  new_releases?: SteamFeaturedBucket
}

type SteamSpotlightItem = {
  steamAppID: string
  title: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  platform: string
  url: string
}

const ALLOWED_STORE_IDS = new Set(['1', '3', '7', '8', '11', '13', '15', '25'])
const PAGE_COUNT = 24
const PAGE_SIZE = 60
const FETCH_DELAY_MS = 350
const STEAM_SPOTLIGHT_LIMIT = 60

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for internal refresh')
  }

  return createClient(url, serviceRole)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchDealsPage(pageNumber: number) {
  const url = `https://www.cheapshark.com/api/1.0/deals?pageNumber=${pageNumber}&pageSize=${PAGE_SIZE}&sortBy=DealRating&desc=1`

  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LoboDeals/1.0',
    },
  })

  if (res.status === 429) {
    throw new Error(`CheapShark rate limited page ${pageNumber}`)
  }

  if (!res.ok) {
    throw new Error(`CheapShark page ${pageNumber} failed with ${res.status}`)
  }

  const data = await res.json()
  return Array.isArray(data) ? (data as CheapSharkDeal[]) : []
}

function normalizeTitle(title: string) {
  return title.toLowerCase().trim()
}

function penalizeLowValueContent(title: string) {
  const t = normalizeTitle(title)

  let penalty = 0

  const hardBadTerms = [
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
  ]

  const mediumBadTerms = [
    'pack',
    'bundle',
    'starter pack',
    'supporter pack',
    'weapon pack',
    'voice pack',
    'costume pack',
    'music pack',
    'map pack',
  ]

  for (const term of hardBadTerms) {
    if (t.includes(term)) penalty += 80
  }

  for (const term of mediumBadTerms) {
    if (t.includes(term)) penalty += 40
  }

  return penalty
}

function scoreDeal(deal: {
  metacriticScore?: string
  dealRating?: string
  savings?: string
  title?: string
  normalPrice?: string
  salePrice?: string
}) {
  const metacritic = Number(deal.metacriticScore || 0)
  const dealRating = Number(deal.dealRating || 0)
  const savings = Number(deal.savings || 0)
  const normalPrice = Number(deal.normalPrice || 0)
  const salePrice = Number(deal.salePrice || 0)
  const title = deal.title || ''

  let score = 0

  score += metacritic * 3
  score += dealRating * 12
  score += Math.min(savings, 95) * 1.1

  if (metacritic >= 90) score += 60
  else if (metacritic >= 85) score += 40
  else if (metacritic >= 80) score += 20

  if (normalPrice >= 20) score += 10
  if (normalPrice >= 40) score += 8
  if (salePrice > 0 && salePrice <= 2) score -= 8

  score -= penalizeLowValueContent(title)

  return score
}

function buildSteamThumb(item: SteamFeaturedItem) {
  return (
    item.large_capsule_image ||
    item.header_image ||
    item.small_capsule_image ||
    ''
  )
}

function getSteamPlatforms(item: SteamFeaturedItem) {
  const platforms: string[] = []

  if (item.windows_available) platforms.push('Windows')
  if (item.mac_available) platforms.push('Mac')
  if (item.linux_available) platforms.push('Linux')

  if (!platforms.length) return 'PC'
  return platforms.join(' / ')
}

function scoreSteamItem(
  item: SteamSpotlightItem,
  source: 'specials' | 'top_sellers' | 'new_releases'
) {
  const savings = Number(item.savings || 0)
  const normalPrice = Number(item.normalPrice || 0)
  const salePrice = Number(item.salePrice || 0)
  const penalty = penalizeLowValueContent(item.title || '')

  let score = 0

  score += Math.min(savings, 95) * 1.5
  score += Math.min(normalPrice, 70) * 0.6

  if (normalPrice >= 20) score += 10
  if (normalPrice >= 40) score += 10
  if (salePrice > 0 && salePrice <= 3) score -= 6

  if (source === 'top_sellers') score += 26
  if (source === 'specials') score += 20
  if (source === 'new_releases') score += 12

  score -= penalty

  return score
}

function toSteamSpotlightItem(item: SteamFeaturedItem): SteamSpotlightItem | null {
  if (!item.id || !item.name) return null

  const discountPercent = Number(item.discount_percent || 0)
  const originalPrice = Number(item.original_price || 0)
  const finalPrice = Number(item.final_price || 0)

  if (discountPercent <= 0) return null
  if (originalPrice <= 0) return null

  const result: SteamSpotlightItem = {
    steamAppID: String(item.id),
    title: item.name || '',
    salePrice: (finalPrice / 100).toFixed(2),
    normalPrice: (originalPrice / 100).toFixed(2),
    savings: String(discountPercent),
    thumb: buildSteamThumb(item),
    storeID: '1',
    platform: getSteamPlatforms(item),
    url: `https://store.steampowered.com/app/${item.id}`,
  }

  if (!result.title) return null
  if (penalizeLowValueContent(result.title) >= 80) return null

  return result
}

function extractSteamItems(
  items: SteamFeaturedItem[] | undefined,
  source: 'specials' | 'top_sellers' | 'new_releases'
) {
  const list = Array.isArray(items) ? items : []

  return list
    .map(toSteamSpotlightItem)
    .filter((item): item is SteamSpotlightItem => !!item)
    .map((item) => ({
      ...item,
      __score: scoreSteamItem(item, source),
      __source: source,
    }))
}

async function fetchSteamSpotlightUS(): Promise<SteamSpotlightItem[]> {
  try {
    const res = await fetch(
      'https://store.steampowered.com/api/featuredcategories?cc=us&l=en',
      {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LoboDeals/1.0',
        },
      }
    )

    if (!res.ok) {
      throw new Error(`Steam featured categories failed with ${res.status}`)
    }

    const data = (await res.json()) as SteamFeaturedResponse

    const allCandidates = [
      ...extractSteamItems(data?.specials?.items, 'specials'),
      ...extractSteamItems(data?.top_sellers?.items, 'top_sellers'),
      ...extractSteamItems(data?.new_releases?.items, 'new_releases'),
    ]

    const bestByApp = new Map<
      string,
      SteamSpotlightItem & { __score: number; __source: string }
    >()

    for (const item of allCandidates) {
      const existing = bestByApp.get(item.steamAppID)

      if (!existing || item.__score > existing.__score) {
        bestByApp.set(item.steamAppID, item)
      }
    }

    return [...bestByApp.values()]
      .sort((a, b) => b.__score - a.__score)
      .slice(0, STEAM_SPOTLIGHT_LIMIT)
      .map(({ __score, __source, ...item }) => item)
  } catch (error) {
    console.error('Steam spotlight refresh failed', error)
    return []
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const expected = `Bearer ${process.env.INTERNAL_REFRESH_TOKEN}`

    if (!process.env.INTERNAL_REFRESH_TOKEN) {
      return Response.json(
        { error: 'Missing INTERNAL_REFRESH_TOKEN' },
        { status: 500 }
      )
    }

    if (authHeader !== expected) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const allDeals: CheapSharkDeal[] = []
let consecutiveFailures = 0
let consecutiveShortPages = 0

for (let page = 0; page < PAGE_COUNT; page += 1) {
  try {
    const pageDeals = await fetchDealsPage(page)

    allDeals.push(...pageDeals)
    consecutiveFailures = 0

    if (pageDeals.length < PAGE_SIZE * 0.5) {
      consecutiveShortPages += 1
    } else {
      consecutiveShortPages = 0
    }

    if (consecutiveShortPages >= 2) {
      break
    }
  } catch (error) {
    console.error(`Refresh page ${page} failed`, error)
    consecutiveFailures += 1

    if (consecutiveFailures >= 2) {
      break
    }
  }

  if (page < PAGE_COUNT - 1) {
    await sleep(FETCH_DELAY_MS)
  }
}

    const cleaned = allDeals
      .filter((deal) => {
        if (!deal.dealID) return false
        if (!deal.title) return false
        if (!deal.storeID || !ALLOWED_STORE_IDS.has(deal.storeID)) return false
        return true
      })
      .map((deal) => ({
        dealID: deal.dealID || '',
        gameID: deal.gameID || '',
        title: deal.title || '',
        salePrice: deal.salePrice || '',
        normalPrice: deal.normalPrice || '',
        savings: deal.savings || '',
        thumb: deal.thumb || '',
        storeID: deal.storeID || '',
        dealRating: deal.dealRating || '',
        metacriticScore: deal.metacriticScore || '',
      }))
      .sort((a, b) => scoreDeal(b) - scoreDeal(a))

    const steamSpotlight = await fetchSteamSpotlightUS()

    const supabase = getServiceSupabase()

    const { error: dealsError } = await supabase.from('deals_cache').upsert(
      {
        cache_key: 'cheapshark_deals_main',
        payload: cleaned,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' }
    )

    if (dealsError) throw dealsError

    const { error: steamError } = await supabase.from('deals_cache').upsert(
      {
        cache_key: 'steam_spotlight_us',
        payload: steamSpotlight,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' }
    )

    if (steamError) throw steamError

    return Response.json({
  success: true,
  cheapsharkCount: cleaned.length,
  steamSpotlightCount: steamSpotlight.length,
  pagesAttempted: PAGE_COUNT,
  pageSize: PAGE_SIZE,
})
  } catch (error) {
    console.error('internal-refresh-deals error', error)

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to refresh internal caches',
      },
      { status: 500 }
    )
  }
}