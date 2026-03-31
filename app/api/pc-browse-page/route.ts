export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { makePcGameSlug } from '@/lib/pcCanonical'

type PcGameRow = {
  id: string
  steam_app_id?: string | null
  slug?: string | null
  steam_name?: string | null
  canonical_title?: string | null
  capsule_image?: string | null
  header_image?: string | null
  hero_image_url?: string | null
  description?: string | null
  short_description?: string | null
  rawg_description?: string | null
  is_free_to_play?: boolean | null
  steam_type?: string | null
}

type PcStoreOfferRow = {
  pc_game_id: string
  sale_price?: number | string | null
  normal_price?: number | string | null
  discount_percent?: number | string | null
  store_id?: string | null
  url?: string | null
  is_available?: boolean | null
  region_code?: string | null
  currency_code?: string | null
  price_source?: string | null
  price_last_synced_at?: string | null
  final_formatted?: string | null
  initial_formatted?: string | null
}

type PcBrowseItem = {
  id: string
  steamAppID: string
  slug: string
  title: string
  thumb: string
  salePrice: string
  normalPrice: string
  savings: string
  storeID: string
  url: string
  isFreeToPlay: boolean
  hasActiveOffer: boolean
  isCatalogReady: boolean
}

const SOURCE_PAGE_SIZE = 500

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for pc browse page')
  }

  return createClient(url, serviceRole)
}

function hasText(value?: string | null) {
  return String(value || '').trim().length > 0
}

function hasTitle(row: PcGameRow) {
  return hasText(row.steam_name) || hasText(row.canonical_title)
}

function hasImage(row: PcGameRow) {
  return (
    hasText(row.hero_image_url) ||
    hasText(row.header_image) ||
    hasText(row.capsule_image)
  )
}

function hasDescription(row: PcGameRow) {
  return (
    hasText(row.description) ||
    hasText(row.short_description) ||
    hasText(row.rawg_description)
  )
}

function isStructurallyPublicable(row: PcGameRow) {
  return (
    row.steam_type === 'game' &&
    hasText(row.slug) &&
    hasTitle(row) &&
    hasImage(row) &&
    hasDescription(row)
  )
}

function normalizeSteamTitle(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™©]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[:\-–—_/.,+!?'"]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatMoney(value?: number | string | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return ''
  }

  return amount.toFixed(2)
}

function formatSavings(value?: number | string | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return '0'
  }

  return String(Math.max(0, Math.min(99, Math.round(amount))))
}

function getSafeDiscountPercent(
  salePrice?: string | number | null,
  normalPrice?: string | number | null,
  savings?: string | number | null
) {
  const sale = Number(salePrice || 0)
  const normal = Number(normalPrice || 0)
  const rawSavings = Number(savings || 0)

  if (normal > 0 && sale >= 0 && normal > sale) {
    const computed = ((normal - sale) / normal) * 100
    return Math.max(0, Math.min(99, Math.round(computed)))
  }

  if (Number.isFinite(rawSavings) && rawSavings > 0) {
    return Math.max(0, Math.min(99, Math.round(rawSavings)))
  }

  return 0
}

function chooseBestOffer(
  current: PcStoreOfferRow | undefined,
  incoming: PcStoreOfferRow
) {
  if (!current) return incoming

  const currentModern =
    current.region_code === 'us' &&
    current.price_source === 'steam_appdetails_us' &&
    !!String(current.price_last_synced_at || '').trim()

  const incomingModern =
    incoming.region_code === 'us' &&
    incoming.price_source === 'steam_appdetails_us' &&
    !!String(incoming.price_last_synced_at || '').trim()

  if (incomingModern && !currentModern) return incoming
  if (!incomingModern && currentModern) return current

  const currentDiscount = Number(current.discount_percent || 0)
  const incomingDiscount = Number(incoming.discount_percent || 0)

  if (incomingDiscount > currentDiscount) return incoming
  if (incomingDiscount < currentDiscount) return current

  const currentSale = Number(current.sale_price || 999999)
  const incomingSale = Number(incoming.sale_price || 999999)

  if (incomingSale < currentSale) return incoming
  return current
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }

  return chunks
}

async function loadModernOffersForIds(
  supabase: ReturnType<typeof getServiceSupabase>,
  gameIds: string[]
) {
  const offersByGameId = new Map<string, PcStoreOfferRow>()

  const idChunks = chunkArray(gameIds, 200)

  for (const ids of idChunks) {
    const { data: offers, error: offersError } = await supabase
      .from('pc_store_offers')
      .select(
        'pc_game_id, sale_price, normal_price, discount_percent, store_id, url, is_available, region_code, currency_code, price_source, price_last_synced_at, final_formatted, initial_formatted'
      )
      .eq('store_id', '1')
      .eq('region_code', 'us')
      .eq('is_available', true)
      .in('pc_game_id', ids)

    if (offersError) {
      throw offersError
    }

    for (const row of (offers || []) as PcStoreOfferRow[]) {
      const key = String(row.pc_game_id || '').trim()
      if (!key) continue

      offersByGameId.set(key, chooseBestOffer(offersByGameId.get(key), row))
    }
  }

  return offersByGameId
}

async function loadAllPublicableGames(
  supabase: ReturnType<typeof getServiceSupabase>
) {
  const results: PcBrowseItem[] = []

  for (let page = 0; page < 80; page += 1) {
    const from = page * SOURCE_PAGE_SIZE
    const to = from + SOURCE_PAGE_SIZE - 1

    const { data: pcGames, error: gamesError } = await supabase
      .from('pc_games')
      .select(
        'id, steam_app_id, slug, steam_name, canonical_title, capsule_image, header_image, hero_image_url, description, short_description, rawg_description, is_free_to_play, steam_type'
      )
      .eq('steam_type', 'game')
      .order('steam_app_id', { ascending: false })
      .range(from, to)

    if (gamesError) {
      throw gamesError
    }

    const games = Array.isArray(pcGames) ? (pcGames as PcGameRow[]) : []

    if (!games.length) {
      break
    }

    const gameIds = games
      .map((game) => String(game.id || '').trim())
      .filter(Boolean)

    const offersByGameId = await loadModernOffersForIds(supabase, gameIds)

    for (const game of games) {
      const id = String(game.id || '').trim()
      const title = String(game.steam_name || game.canonical_title || '').trim()
      const slug =
        String(game.slug || '').trim() ||
        makePcGameSlug(
          String(game.steam_name || game.canonical_title || '').trim(),
          String(game.steam_app_id || '').trim()
        )

      if (!id || !slug || !title) continue
      if (!isStructurallyPublicable(game)) continue

      const offer = offersByGameId.get(id)
      const isFree = Boolean(game.is_free_to_play)

      if (!offer && !isFree) continue

      const thumb =
        String(game.hero_image_url || '').trim() ||
        String(game.header_image || '').trim() ||
        String(game.capsule_image || '').trim()

      results.push({
        id,
        steamAppID: String(game.steam_app_id || '').trim(),
        slug,
        title,
        thumb,
        salePrice: formatMoney(offer?.sale_price),
        normalPrice: formatMoney(offer?.normal_price),
        savings: formatSavings(offer?.discount_percent),
        storeID: String(offer?.store_id || '1').trim(),
        url: String(offer?.url || '').trim(),
        isFreeToPlay: isFree,
        hasActiveOffer: Boolean(offer),
        isCatalogReady: true,
      })
    }

    if (games.length < SOURCE_PAGE_SIZE) {
      break
    }
  }

  return results
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const page = Math.max(1, Number(searchParams.get('page') || '1'))
    const pageSize = Math.max(1, Math.min(60, Number(searchParams.get('pageSize') || '36')))
    const query = searchParams.get('q') || ''
    const sort = searchParams.get('sort') || 'all'
    const storeFilter = searchParams.get('store') || 'all'
    const priceFilter = searchParams.get('price') || 'all'

    const supabase = getServiceSupabase()
    const allGames = await loadAllPublicableGames(supabase)

    const normalizedQuery = normalizeSteamTitle(query)

    let filtered = allGames.filter((item) => {
      if (storeFilter !== 'all' && item.storeID !== storeFilter) return false

      const salePrice = Number(item.salePrice || 0)
      const savings = getSafeDiscountPercent(
        item.salePrice,
        item.normalPrice,
        item.savings
      )

      if (priceFilter === 'under-5' && !(salePrice > 0 && salePrice < 5)) return false
      if (priceFilter === 'under-10' && !(salePrice > 0 && salePrice < 10)) return false
      if (priceFilter === 'over-80' && savings < 80) return false

      if (normalizedQuery) {
        return normalizeSteamTitle(item.title).includes(normalizedQuery)
      }

      return true
    })

    if (sort === 'best') {
      filtered.sort((a, b) => {
        const discountA = getSafeDiscountPercent(a.salePrice, a.normalPrice, a.savings)
        const discountB = getSafeDiscountPercent(b.salePrice, b.normalPrice, b.savings)

        const saleA = Number(a.salePrice || 999999)
        const saleB = Number(b.salePrice || 999999)
        const normalA = Number(a.normalPrice || 0)
        const normalB = Number(b.normalPrice || 0)

        const priceAttractivenessA =
          saleA > 0 ? Math.max(0, 40 - saleA) : a.isFreeToPlay ? 24 : 0
        const priceAttractivenessB =
          saleB > 0 ? Math.max(0, 40 - saleB) : b.isFreeToPlay ? 24 : 0

        const scoreA =
          discountA * 1.6 +
          priceAttractivenessA * 1.2 +
          (a.hasActiveOffer ? 18 : 0) +
          (normalA >= 20 ? 8 : 0) +
          (a.isCatalogReady ? 6 : 0)

        const scoreB =
          discountB * 1.6 +
          priceAttractivenessB * 1.2 +
          (b.hasActiveOffer ? 18 : 0) +
          (normalB >= 20 ? 8 : 0) +
          (b.isCatalogReady ? 6 : 0)

        if (scoreB !== scoreA) return scoreB - scoreA
        if (discountB !== discountA) return discountB - discountA
        return saleA - saleB
      })
    } else if (sort === 'biggest-discount') {
      filtered.sort((a, b) => {
        const discountA = getSafeDiscountPercent(a.salePrice, a.normalPrice, a.savings)
        const discountB = getSafeDiscountPercent(b.salePrice, b.normalPrice, b.savings)

        if (discountB !== discountA) return discountB - discountA

        const saleA = Number(a.salePrice || 999999)
        const saleB = Number(b.salePrice || 999999)

        return saleA - saleB
      })
    } else if (sort === 'latest') {
      filtered.sort((a, b) => Number(b.steamAppID || 0) - Number(a.steamAppID || 0))
    } else {
      filtered.sort((a, b) => {
        if (b.hasActiveOffer !== a.hasActiveOffer) {
          return Number(b.hasActiveOffer) - Number(a.hasActiveOffer)
        }

        const savingsDiff =
          getSafeDiscountPercent(b.salePrice, b.normalPrice, b.savings) -
          getSafeDiscountPercent(a.salePrice, a.normalPrice, a.savings)

        if (savingsDiff !== 0) return savingsDiff

        return a.title.localeCompare(b.title)
      })
    }

    const totalItems = filtered.length
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
    const safePage = Math.min(page, totalPages)
    const startIndex = (safePage - 1) * pageSize
    const items = filtered.slice(startIndex, startIndex + pageSize)

    return Response.json({
      items,
      totalItems,
      totalPages,
      page: safePage,
      pageSize,
    })
  } catch (error) {
    console.error('pc browse page error', error)

    return Response.json({
      items: [],
      totalItems: 0,
      totalPages: 1,
      page: 1,
      pageSize: 36,
    })
  }
}