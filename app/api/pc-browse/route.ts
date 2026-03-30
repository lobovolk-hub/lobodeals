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
  is_free_to_play?: boolean | null
  is_active?: boolean | null
  is_catalog_ready?: boolean | null
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

const PAGE_CHUNK_SIZE = 1000

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for pc browse')
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

function chooseBestOffer(
  current: PcStoreOfferRow | undefined,
  incoming: PcStoreOfferRow
) {
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

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }

  return chunks
}

async function loadGames(
  supabase: ReturnType<typeof getServiceSupabase>,
  limit: number,
  includeNonGames: boolean
) {
  const results: PcGameRow[] = []
  let from = 0

  while (results.length < limit) {
    let query = supabase
      .from('pc_games')
      .select(
        'id, steam_app_id, slug, steam_name, canonical_title, capsule_image, header_image, hero_image_url, is_free_to_play, is_active, is_catalog_ready, steam_type'
      )
      .eq('is_active', true)
      .order('steam_app_id', { ascending: false })
      .range(from, from + PAGE_CHUNK_SIZE - 1)

    if (!includeNonGames) {
      query = query.eq('steam_type', 'game')
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    const rows = Array.isArray(data) ? (data as PcGameRow[]) : []

    if (rows.length === 0) {
      break
    }

    results.push(...rows)

    if (rows.length < PAGE_CHUNK_SIZE) {
      break
    }

    from += PAGE_CHUNK_SIZE
  }

  return results.slice(0, limit)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedLimit = Number(searchParams.get('limit') || '1200')
    const includeNonGames = searchParams.get('includeNonGames') === '1'
    const limit = Math.max(1, Math.min(20000, requestedLimit))

    const supabase = getServiceSupabase()

    const games = await loadGames(supabase, limit, includeNonGames)

    if (!games.length) {
      return Response.json([], { status: 200 })
    }

    const gameIds = games
      .map((game) => String(game.id || '').trim())
      .filter(Boolean)

    const offersByGameId = new Map<string, PcStoreOfferRow>()

    if (gameIds.length > 0) {
      const idChunks = chunkArray(gameIds, 200)

      for (const ids of idChunks) {
        const { data: offers, error: offersError } = await supabase
          .from('pc_store_offers')
          .select(
            'pc_game_id, sale_price, normal_price, discount_percent, store_id, url, is_available'
          )
          .eq('store_id', '1')
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
    }

    const results = games
      .map((game) => {
        const id = String(game.id || '').trim()
                const slug =
          String(game.slug || '').trim() ||
          makePcGameSlug(
            String(game.steam_name || game.canonical_title || '').trim(),
            String(game.steam_app_id || '').trim()
          )
        const title = String(game.steam_name || game.canonical_title || '').trim()
        const thumb =
          String(game.hero_image_url || '').trim() ||
          String(game.header_image || '').trim() ||
          String(game.capsule_image || '').trim()

        if (!id || !slug || !title) return null

        const offer = offersByGameId.get(id)

        return {
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
          hasActiveOffer: Boolean(offer),
          isCatalogReady: Boolean(game.is_catalog_ready),
        } satisfies PcBrowseItem
      })
      .filter(Boolean)

    return Response.json(results, { status: 200 })
  } catch (error) {
    console.error('pc browse error', error)
    return Response.json([], { status: 200 })
  }
}