export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { normalizeCanonicalTitle } from '@/lib/pcCanonical'

type CatalogPublicRow = {
  pc_game_id: string
  steam_app_id?: string | null
  steam_type?: string | null
  slug?: string | null
  title?: string | null
  thumb?: string | null
  sale_price?: number | string | null
  normal_price?: number | string | null
  discount_percent?: number | string | null
  store_id?: string | null
  url?: string | null
  is_free_to_play?: boolean | null
  has_active_offer?: boolean | null
  is_catalog_ready?: boolean | null
  search_title_normalized?: string | null
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
  canOpenPage: boolean
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

function scoreRow(row: CatalogPublicRow, normalizedQuery: string) {
  const title = normalizeCanonicalTitle(String(row.title || ''))
  const steamType = String(row.steam_type || '').trim().toLowerCase()

  if (!title) return -1

  let score = 0

  if (title === normalizedQuery) score += 500
  if (title.startsWith(normalizedQuery)) score += 140
  if (title.includes(normalizedQuery)) score += 70

  if (steamType === 'game') score += 20
  if (row.has_active_offer) score += 15
  if (row.is_free_to_play) score += 8
  if (row.is_catalog_ready) score += 5

  return score
}

function getSafeTypeFilter(value: string) {
  const normalized = String(value || 'all').trim().toLowerCase()

  if (normalized === 'game') return 'game'
  if (normalized === 'dlc') return 'dlc'
  if (normalized === 'software') return 'software'
  return 'all'
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawTitle = searchParams.get('title')?.trim() || ''
    const typeFilter = getSafeTypeFilter(searchParams.get('type') || 'all')

    if (rawTitle.length < 2) {
      return Response.json([], { status: 200 })
    }

    const normalizedQuery = normalizeCanonicalTitle(rawTitle)
    if (!normalizedQuery) {
      return Response.json([], { status: 200 })
    }

    const supabase = getServiceSupabase()

    let query = supabase
      .from('catalog_public_cache')
      .select(
        'pc_game_id, steam_app_id, steam_type, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, is_free_to_play, has_active_offer, is_catalog_ready, search_title_normalized'
      )
      .or(
        [
          `title.ilike.%${rawTitle}%`,
          `search_title_normalized.ilike.%${normalizedQuery}%`,
        ].join(',')
      )
      .limit(60)

    if (typeFilter !== 'all') {
      query = query.eq('steam_type', typeFilter)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    const rows = Array.isArray(data) ? (data as CatalogPublicRow[]) : []

    const results = rows
      .map((row) => {
        const id = String(row.pc_game_id || '').trim()
        const steamType = String(row.steam_type || '').trim().toLowerCase()
        const title = String(row.title || '').trim()
        const slug = String(row.slug || '').trim()
        const thumb = String(row.thumb || '').trim()

        if (!id || !title || !slug) {
          return null
        }

        const score = scoreRow(row, normalizedQuery)

        return {
          score,
          item: {
            id,
            steamAppID: String(row.steam_app_id || '').trim(),
            slug,
            title,
            thumb,
            salePrice: formatMoney(row.sale_price),
            normalPrice: formatMoney(row.normal_price),
            savings: formatSavings(row.discount_percent),
            storeID: String(row.store_id || '1').trim(),
            url: String(row.url || '').trim(),
            isFreeToPlay: Boolean(row.is_free_to_play),
            hasActiveOffer: Boolean(row.has_active_offer),
            isCatalogReady: Boolean(row.is_catalog_ready),
            canOpenPage: steamType === 'game' && Boolean(slug),
          } satisfies CatalogSearchResult,
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b!.score !== a!.score) {
          return b!.score - a!.score
        }

        if (Number(b!.item.savings || 0) !== Number(a!.item.savings || 0)) {
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