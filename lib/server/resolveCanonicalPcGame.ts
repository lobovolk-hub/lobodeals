import { createClient } from '@supabase/supabase-js'
import {
  buildCanonicalPcGames,
  isAllowedPcStore,
  makeDealCanonicalOffer,
  makePcCanonicalKey,
  makePcCanonicalSlug,
  makeSteamCanonicalOffer,
  normalizeCanonicalTitle,
  type CanonicalPcGame,
  type CanonicalPcOffer,
} from '@/lib/pcCanonical'

type SteamCacheItem = {
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

type ResolveCanonicalPcGameInput = {
  slug: string
  titleHint?: string
  steamAppIDHint?: string
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for canonical pc resolver')
  }

  return createClient(url, serviceRole)
}

async function readCachePayload(cacheKey: string) {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('deals_cache')
    .select('payload')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (error) {
    throw error
  }

  return Array.isArray(data?.payload) ? data.payload : []
}

function dedupeSteamCache(items: SteamCacheItem[]) {
  const byApp = new Map<string, SteamCacheItem>()

  for (const item of items) {
    const key = String(item.steamAppID || makePcCanonicalKey(item.title))

    const current = byApp.get(key)

    if (!current) {
      byApp.set(key, item)
      continue
    }

    const currentPrice = Number(current.salePrice || 999999)
    const nextPrice = Number(item.salePrice || 999999)

    if (nextPrice < currentPrice) {
      byApp.set(key, item)
    }
  }

  return Array.from(byApp.values())
}

function findSteamSeed(
  steamItems: SteamCacheItem[],
  slug: string,
  titleHint?: string,
  steamAppIDHint?: string
) {
  const canonicalSlug = makePcCanonicalSlug(slug)
  const canonicalHintKey = titleHint ? makePcCanonicalKey(titleHint) : ''

  if (steamAppIDHint) {
    const byApp = steamItems.find(
      (item) => String(item.steamAppID) === String(steamAppIDHint)
    )
    if (byApp) return byApp
  }

  const exactSlug = steamItems.find(
    (item) => makePcCanonicalSlug(item.title) === canonicalSlug
  )
  if (exactSlug) return exactSlug

  if (canonicalHintKey) {
    const byHint = steamItems.find(
      (item) => makePcCanonicalKey(item.title) === canonicalHintKey
    )
    if (byHint) return byHint
  }

  const normalizedSlug = normalizeCanonicalTitle(slug)

  const relaxed = steamItems.find((item) => {
    const itemSlug = makePcCanonicalSlug(item.title)
    const itemKey = makePcCanonicalKey(item.title)
    return itemSlug === canonicalSlug || itemKey === normalizedSlug
  })

  return relaxed || null
}

async function searchCheapSharkDeals(title: string) {
  const res = await fetch(
    `https://www.cheapshark.com/api/1.0/deals?title=${encodeURIComponent(
      title
    )}&pageSize=60&sortBy=Price`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LoboDeals/1.0',
      },
    }
  )

  if (!res.ok) {
    return [] as CheapSharkDealSearch[]
  }

  const data = await res.json()
  return Array.isArray(data) ? (data as CheapSharkDealSearch[]) : []
}

function titlesBelongToSameCanonicalGame(a: string, b: string) {
  const slugA = makePcCanonicalSlug(a)
  const slugB = makePcCanonicalSlug(b)

  if (slugA && slugB && slugA === slugB) return true

  const keyA = makePcCanonicalKey(a)
  const keyB = makePcCanonicalKey(b)

  if (keyA && keyB && keyA === keyB) return true

  return false
}

export async function resolveCanonicalPcGame({
  slug,
  titleHint,
  steamAppIDHint,
}: ResolveCanonicalPcGameInput): Promise<CanonicalPcGame | null> {
  const normalizedSlug = makePcCanonicalSlug(slug)

  if (!normalizedSlug) {
    return null
  }

  const [steamSpotlightRaw, steamSalesRaw] = await Promise.all([
    readCachePayload('steam_spotlight_us'),
    readCachePayload('steam_sales_us'),
  ])

  const steamItems = dedupeSteamCache(
    [...steamSpotlightRaw, ...steamSalesRaw].filter(
      (item): item is SteamCacheItem =>
        !!item &&
        typeof item.title === 'string' &&
        !!item.title &&
        isAllowedPcStore(item.storeID)
    )
  )

  const steamSeed = findSteamSeed(
    steamItems,
    normalizedSlug,
    titleHint,
    steamAppIDHint
  )

  const fallbackTitle =
    steamSeed?.title ||
    titleHint ||
    normalizedSlug.replace(/-/g, ' ').trim()

  const canonicalOffers: CanonicalPcOffer[] = []

  if (steamSeed) {
    canonicalOffers.push(
      makeSteamCanonicalOffer({
        steamAppID: steamSeed.steamAppID,
        title: steamSeed.title,
        salePrice: steamSeed.salePrice,
        normalPrice: steamSeed.normalPrice,
        savings: steamSeed.savings,
        thumb: steamSeed.thumb,
        storeID: steamSeed.storeID,
        url: steamSeed.url,
      })
    )
  }

  const cheapSharkDeals = await searchCheapSharkDeals(fallbackTitle)

  const relatedDeals = cheapSharkDeals.filter((deal) => {
    if (!deal.title) return false
    if (!deal.storeID || !isAllowedPcStore(deal.storeID)) return false
    if (deal.storeID === '1') return false

    return titlesBelongToSameCanonicalGame(fallbackTitle, deal.title)
  })

    for (const deal of relatedDeals) {
    const redirectUrl =
      deal.dealID && deal.title
        ? `/api/redirect?dealID=${encodeURIComponent(
            deal.dealID
          )}&title=${encodeURIComponent(deal.title)}&salePrice=${encodeURIComponent(
            deal.salePrice || ''
          )}&normalPrice=${encodeURIComponent(deal.normalPrice || '')}`
        : ''

    canonicalOffers.push(
      makeDealCanonicalOffer({
        gameID: deal.gameID || '',
        dealID: deal.dealID || '',
        title: deal.title || fallbackTitle,
        salePrice: deal.salePrice || '',
        normalPrice: deal.normalPrice || '',
        savings: deal.savings || '',
        thumb: deal.thumb || steamSeed?.thumb || '',
        storeID: deal.storeID || '',
        steamAppID: steamSeed?.steamAppID || '',
        url: redirectUrl,
        metacriticScore: deal.metacriticScore || '',
      })
    )
  }

  if (!canonicalOffers.length) {
    return null
  }

  const games = buildCanonicalPcGames(canonicalOffers)

  const exact = games.find((game) => game.slug === normalizedSlug)
  if (exact) return exact

  const bySteamApp = steamSeed?.steamAppID
    ? games.find((game) => String(game.steamAppID) === String(steamSeed.steamAppID))
    : null

  if (bySteamApp) return bySteamApp

  const byKey = games.find(
    (game) => game.canonicalKey === makePcCanonicalKey(fallbackTitle)
  )

  return byKey || null
}