export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { makePcCanonicalKey } from '@/lib/pcCanonical'

type PcGameRow = {
  id: string
  steam_app_id: string
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
  url?: string | null
  is_available?: boolean | null
}

type DealsCacheRow = {
  cache_key: string
  payload: {
    name?: string | null
    metacritic?: number | null
  } | null
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for pc-top-rated')
  }

  return createClient(url, serviceRole)
}

function formatMoney(value?: number | string | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return '0.00'
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

function parseRawTitleFromCacheKey(cacheKey: string) {
  if (!cacheKey.startsWith('rawg_meta::')) return ''

  const withoutPrefix = cacheKey.slice('rawg_meta::'.length)
  const separatorIndex = withoutPrefix.lastIndexOf('::')

  if (separatorIndex === -1) {
    return withoutPrefix.trim()
  }

  return withoutPrefix.slice(0, separatorIndex).trim()
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedLimit = Number(searchParams.get('limit') || '300')
    const limit = Math.max(1, Math.min(1000, requestedLimit))

    const supabase = getServiceSupabase()

    const [
      { data: pcGames, error: gamesError },
      { data: offers, error: offersError },
      { data: rawgCache, error: rawgError },
    ] = await Promise.all([
      supabase
        .from('pc_games')
        .select(
          'id, steam_app_id, steam_name, canonical_title, capsule_image, header_image, is_free_to_play, is_active, is_catalog_ready'
        )
        .eq('is_active', true)
        .eq('is_catalog_ready', true)
        .order('steam_app_id', { ascending: true })
        .limit(5000),

      supabase
        .from('pc_store_offers')
        .select(
          'pc_game_id, sale_price, normal_price, discount_percent, url, is_available'
        )
        .eq('store_id', '1')
        .eq('is_available', true),

      supabase
        .from('deals_cache')
        .select('cache_key, payload')
        .like('cache_key', 'rawg_meta::%'),
    ])

    if (gamesError) throw gamesError
    if (offersError) throw offersError
    if (rawgError) throw rawgError

    const offerByGameId = new Map<string, PcStoreOfferRow>()

    for (const row of (offers || []) as PcStoreOfferRow[]) {
      const gameId = String(row.pc_game_id || '').trim()
      if (!gameId) continue

      const current = offerByGameId.get(gameId)

      if (!current) {
        offerByGameId.set(gameId, row)
        continue
      }

      const currentSale = Number(current.sale_price || 0)
      const incomingSale = Number(row.sale_price || 0)
      const currentDiscount = Number(current.discount_percent || 0)
      const incomingDiscount = Number(row.discount_percent || 0)

      if (incomingDiscount > currentDiscount) {
        offerByGameId.set(gameId, row)
        continue
      }

      if (
        incomingDiscount === currentDiscount &&
        incomingSale > 0 &&
        (currentSale <= 0 || incomingSale < currentSale)
      ) {
        offerByGameId.set(gameId, row)
      }
    }

    const metacriticByCanonicalKey = new Map<string, number>()

    for (const row of (rawgCache || []) as DealsCacheRow[]) {
      const payload = row.payload
      const metacritic = Number(payload?.metacritic || 0)

      if (!Number.isFinite(metacritic) || metacritic <= 0) continue

      const rawTitle = parseRawTitleFromCacheKey(String(row.cache_key || ''))
      const payloadTitle = String(payload?.name || '').trim()
      const title = payloadTitle || rawTitle

      if (!title) continue

      const key = makePcCanonicalKey(title)
      const current = metacriticByCanonicalKey.get(key) || 0

      if (metacritic > current) {
        metacriticByCanonicalKey.set(key, metacritic)
      }
    }

    const topRated = ((pcGames || []) as PcGameRow[])
      .map((game) => {
        const title = String(game.steam_name || game.canonical_title || '').trim()
        if (!title) return null

        const canonicalKey = makePcCanonicalKey(title)
        const metacritic = metacriticByCanonicalKey.get(canonicalKey) || 0

        if (metacritic < 70) return null

        const offer = offerByGameId.get(String(game.id || '').trim())
        const thumb =
          String(game.capsule_image || '').trim() ||
          String(game.header_image || '').trim()

        return {
          steamAppID: String(game.steam_app_id || '').trim(),
          title,
          salePrice: formatMoney(offer?.sale_price),
          normalPrice: formatMoney(offer?.normal_price),
          savings: formatSavings(offer?.discount_percent),
          thumb,
          storeID: '1',
          platform: 'pc',
          url: String(offer?.url || '').trim(),
          metacritic,
          isFreeToPlay: Boolean(game.is_free_to_play),
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b!.metacritic !== a!.metacritic) {
          return b!.metacritic - a!.metacritic
        }

        const savingsA = Number(a!.savings || 0)
        const savingsB = Number(b!.savings || 0)

        if (savingsB !== savingsA) {
          return savingsB - savingsA
        }

        const normalA = Number(a!.normalPrice || 0)
        const normalB = Number(b!.normalPrice || 0)

        if (normalB !== normalA) {
          return normalB - normalA
        }

        return a!.title.localeCompare(b!.title)
      })
      .slice(0, limit)

    return Response.json(topRated, { status: 200 })
  } catch (error) {
    console.error('api/pc-top-rated error', error)
    return Response.json([], { status: 200 })
  }
}