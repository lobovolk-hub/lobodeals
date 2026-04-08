export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type CatalogSuggestRow = {
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
  sort_latest?: number | null
}

type CatalogSuggestItem = {
  id: string
  steamAppID: string
  steamType: string
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
  sortLatest: number
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for catalog suggest')
  }

  return createClient(url, serviceRole)
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

function mapRowToItem(row: CatalogSuggestRow): CatalogSuggestItem {
  const steamType = String(row.steam_type || '').trim().toLowerCase()

  return {
    id: String(row.pc_game_id || '').trim(),
    steamAppID: String(row.steam_app_id || '').trim(),
    steamType,
    slug: String(row.slug || '').trim(),
    title: String(row.title || '').trim(),
    thumb: String(row.thumb || '').trim(),
    salePrice: formatMoney(row.sale_price),
    normalPrice: formatMoney(row.normal_price),
    savings: formatSavings(row.discount_percent),
    storeID: String(row.store_id || '1').trim(),
    url: String(row.url || '').trim(),
    isFreeToPlay: Boolean(row.is_free_to_play),
    hasActiveOffer: Boolean(row.has_active_offer),
    isCatalogReady: Boolean(row.is_catalog_ready),
    canOpenPage: steamType === 'game' && Boolean(String(row.slug || '').trim()),
    sortLatest: Number(row.sort_latest || 0),
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const title = String(searchParams.get('title') || '').trim()
    const type = String(searchParams.get('type') || 'all').trim().toLowerCase()

    if (title.length < 2) {
      return Response.json([])
    }

    const normalizedTitle = normalizeSteamTitle(title)
    const supabase = getServiceSupabase()

    let query = supabase
      .from('catalog_public_cache')
      .select(
        'pc_game_id, steam_app_id, steam_type, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, is_free_to_play, has_active_offer, is_catalog_ready, sort_latest'
      )
      .ilike('search_title_normalized', `%${normalizedTitle}%`)

    if (type === 'game' || type === 'dlc' || type === 'software') {
      query = query.eq('steam_type', type)
    }

    const { data, error } = await query
      .order('has_active_offer', { ascending: false })
      .order('discount_percent', { ascending: false })
      .order('sort_latest', { ascending: false })
      .limit(5)

    if (error) {
      throw error
    }

    const rows = Array.isArray(data) ? (data as CatalogSuggestRow[]) : []
    return Response.json(rows.map(mapRowToItem))
  } catch (error) {
    console.error('catalog suggest error', error)
    return Response.json([])
  }
}