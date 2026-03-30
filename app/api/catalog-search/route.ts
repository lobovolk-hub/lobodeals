export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { normalizeCanonicalTitle } from '@/lib/pcCanonical'

type PcGameRow = {
  id: string
  steam_app_id?: string | null
  slug?: string | null
  steam_name?: string | null
  canonical_title?: string | null
  capsule_image?: string | null
  header_image?: string | null
  is_free_to_play?: boolean | null
  is_active?: boolean | null
  is_catalog_ready?: boolean | null
}

type PcStoreOfferRow = {
  pc_game_id: string
  sale_price?: number | string | null
  normal_price?: number | string | null
  discount_percent?: number | string | null
  store_id?: string | null
  url?: string | null
  is_available?: boolean | null
}

type CatalogSearchResult = {
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

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for catalog search')
  }

  return createClient(url, serviceRole)
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

function chooseBestOffer(current: PcStoreOfferRow | undefined, incoming: PcStoreOfferRow) {
  if (!current) return incoming

  const currentDiscount = Number(current.discount_percent || 0)
  const incomingDiscount = Number(incoming.discount_percent || 0)

  if (incomingDiscount > currentDiscount) return incoming
  if (incomingDiscount < currentDiscount) return current

  const currentSale = Number(current.sale_price || 999999)
  const incomingSale = Number(incoming.sale_price || 999999)

  if (incomingSale < currentSale) return incoming
  return current
}

function scoreGame(row: PcGameRow, normalizedQuery: string, hasOffer: boolean) {
  const steamName = normalizeCanonicalTitle(String(row.steam_name || ''))
  const canonicalTitle = normalizeCanonicalTitle(String(row.canonical_title || ''))
  const title = steamName || canonicalTitle

  if (!title) return -1

  let score = 0

  if (title === normalizedQuery) score += 500
  if (steamName === normalizedQuery) score += 150
  if (canonicalTitle === normalizedQuery) score += 120

  if (steamName.startsWith(normalizedQuery)) score += 120
  if (canonicalTitle.startsWith(normalizedQuery)) score += 100

  if (steamName.includes(normalizedQuery)) score += 60
  if (canonicalTitle.includes(normalizedQuery)) score += 50

  if (row.is_catalog_ready) score += 20
  if (row.capsule_image || row.header_image) score += 10
  if (hasOffer) score += 15
  if (row.is_free_to_play) score += 8

  return score
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawTitle = searchParams.get('title')?.trim() || ''

    if (rawTitle.length < 2) {
      return Response.json([], { status: 200 })
    }

    const normalizedQuery = normalizeCanonicalTitle(rawTitle)
    if (!normalizedQuery) {
      return Response.json([], { status: 200 })
    }

    const supabase = getServiceSupabase()

    const { data: matchedGames, error: gamesError } = await supabase
      .from('pc_games')
      .select(
        'id, steam_app_id, slug, steam_name, canonical_title, capsule_image, header_image, is_free_to_play, is_active, is_catalog_ready'
      )
      .eq('is_active', true)
      .or(
        [
          `steam_name.ilike.%${rawTitle}%`,
          `canonical_title.ilike.%${rawTitle}%`,
          `normalized_title.ilike.%${normalizedQuery}%`,
        ].join(',')
      )
      .limit(60)

    if (gamesError) {
      throw gamesError
    }

    const games = Array.isArray(matchedGames) ? (matchedGames as PcGameRow[]) : []

    if (!games.length) {
      return Response.json([], { status: 200 })
    }

    const gameIds = games
      .map((game) => String(game.id || '').trim())
      .filter(Boolean)

    let offersByGameId = new Map<string, PcStoreOfferRow>()

    if (gameIds.length > 0) {
      const { data: offers, error: offersError } = await supabase
        .from('pc_store_offers')
        .select(
          'pc_game_id, sale_price, normal_price, discount_percent, store_id, url, is_available'
        )
        .eq('store_id', '1')
        .eq('is_available', true)
        .in('pc_game_id', gameIds)

      if (offersError) {
        throw offersError
      }

      for (const row of (offers || []) as PcStoreOfferRow[]) {
        const key = String(row.pc_game_id || '').trim()
        if (!key) continue

        offersByGameId.set(key, chooseBestOffer(offersByGameId.get(key), row))
      }
    }

    const results = games
      .map((game) => {
        const id = String(game.id || '').trim()
        const offer = offersByGameId.get(id)
        const title = String(game.steam_name || game.canonical_title || '').trim()
        const slug = String(game.slug || '').trim()
        const thumb =
          String(game.capsule_image || '').trim() ||
          String(game.header_image || '').trim()

        if (!title || !slug) return null

        const hasActiveOffer = Boolean(offer)
        const score = scoreGame(game, normalizedQuery, hasActiveOffer)

        return {
          score,
          item: {
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
            isFreeToPlay: Boolean(game.is_free_to_play),
            hasActiveOffer,
            isCatalogReady: Boolean(game.is_catalog_ready),
          } satisfies CatalogSearchResult,
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b!.score !== a!.score) {
          return b!.score - a!.score
        }

        if (
          Number(b!.item.savings || 0) !== Number(a!.item.savings || 0)
        ) {
          return Number(b!.item.savings || 0) - Number(a!.item.savings || 0)
        }

        return a!.item.title.localeCompare(b!.item.title)
      })
      .slice(0, 24)
      .map((entry) => entry!.item)

    return Response.json(results, { status: 200 })
  } catch (error) {
    console.error('catalog search error', error)
    return Response.json([], { status: 200 })
  }
}