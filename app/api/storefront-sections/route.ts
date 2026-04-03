export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type SpotlightRow = {
  section_key: string
  position: number
  pc_game_id: string
  steam_app_id: string | null
  slug: string
  title: string
  thumb: string
  sale_price: number | string | null
  normal_price: number | string | null
  discount_percent: number | string | null
  store_id: string | null
  url: string | null
  platform: string
  updated_at: string
}

type PcPublicCatalogRow = {
  pc_game_id: string
  steam_app_id?: string | null
  slug: string
  title: string
  thumb: string
  sale_price?: number | string | null
  normal_price?: number | string | null
  discount_percent?: number | string | null
  store_id?: string | null
  url?: string | null
  is_free_to_play?: boolean | null
  has_active_offer?: boolean | null
  is_catalog_ready?: boolean | null
  sort_latest?: number | null
  price_last_synced_at?: string | null
}

type StorefrontSectionItem = {
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
  platform: string
}

type StorefrontSectionsResponse = {
  steam_spotlight: StorefrontSectionItem[]
  best_deals: StorefrontSectionItem[]
  latest_discounts: StorefrontSectionItem[]
  new_releases: StorefrontSectionItem[]
  updatedAt: string | null
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for storefront sections')
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

function mapSpotlightRow(row: SpotlightRow): StorefrontSectionItem {
  return {
    id: String(row.pc_game_id || '').trim(),
    steamAppID: String(row.steam_app_id || '').trim(),
    slug: String(row.slug || '').trim(),
    title: String(row.title || '').trim(),
    thumb: String(row.thumb || '').trim(),
    salePrice: formatMoney(row.sale_price),
    normalPrice: formatMoney(row.normal_price),
    savings: formatSavings(row.discount_percent),
    storeID: String(row.store_id || '1').trim(),
    url: String(row.url || '').trim(),
    platform: String(row.platform || 'pc').trim(),
  }
}

function mapCatalogRow(row: PcPublicCatalogRow): StorefrontSectionItem {
  return {
    id: String(row.pc_game_id || '').trim(),
    steamAppID: String(row.steam_app_id || '').trim(),
    slug: String(row.slug || '').trim(),
    title: String(row.title || '').trim(),
    thumb: String(row.thumb || '').trim(),
    salePrice: formatMoney(row.sale_price),
    normalPrice: formatMoney(row.normal_price),
    savings: formatSavings(row.discount_percent),
    storeID: String(row.store_id || '1').trim(),
    url: String(row.url || '').trim(),
    platform: 'pc',
  }
}

async function getSpotlightItems(
  supabase: ReturnType<typeof getServiceSupabase>,
  perSection: number
) {
  const { data, error } = await supabase
    .from('public_storefront_sections_cache')
    .select(
      'section_key, position, pc_game_id, steam_app_id, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, platform, updated_at'
    )
    .eq('section_key', 'steam_spotlight')
    .order('position', { ascending: true })
    .limit(perSection)

  if (error) {
    throw error
  }

  const rows = Array.isArray(data) ? (data as SpotlightRow[]) : []

  return {
    items: rows.map(mapSpotlightRow),
    updatedAt: rows.length > 0 ? rows[0].updated_at : null,
  }
}

async function getBestDealsItems(
  supabase: ReturnType<typeof getServiceSupabase>,
  perSection: number
) {
  const { data, error } = await supabase
    .from('pc_public_catalog_cache')
    .select(
      'pc_game_id, steam_app_id, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, is_free_to_play, has_active_offer, is_catalog_ready, sort_latest'
    )
    .order('has_active_offer', { ascending: false })
    .order('discount_percent', { ascending: false })
    .order('sale_price', { ascending: true, nullsFirst: false })
    .order('sort_latest', { ascending: false })
    .limit(perSection)

  if (error) {
    throw error
  }

  const rows = Array.isArray(data) ? (data as PcPublicCatalogRow[]) : []
  return rows.map(mapCatalogRow)
}

async function getLatestDiscountsItems(
  supabase: ReturnType<typeof getServiceSupabase>,
  perSection: number
) {
  const { data, error } = await supabase
    .from('pc_public_catalog_cache')
    .select(
      'pc_game_id, steam_app_id, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, is_free_to_play, has_active_offer, is_catalog_ready, sort_latest, price_last_synced_at'
    )
    .gt('discount_percent', 0)
    .order('price_last_synced_at', { ascending: false, nullsFirst: false })
    .order('discount_percent', { ascending: false })
    .order('sort_latest', { ascending: false })
    .limit(perSection)

  if (error) {
    throw error
  }

  const rows = Array.isArray(data) ? (data as PcPublicCatalogRow[]) : []
  return rows.map(mapCatalogRow)
}

async function getLatestReleaseItems(
  supabase: ReturnType<typeof getServiceSupabase>,
  perSection: number
) {
  const { data, error } = await supabase
    .from('pc_public_catalog_cache')
    .select(
      'pc_game_id, steam_app_id, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, is_free_to_play, has_active_offer, is_catalog_ready, sort_latest'
    )
    .gt('sort_latest', 0)
    .order('sort_latest', { ascending: false })
    .order('discount_percent', { ascending: false })
    .order('title', { ascending: true })
    .limit(perSection)

  if (error) {
    throw error
  }

  const rows = Array.isArray(data) ? (data as PcPublicCatalogRow[]) : []
  return rows.map(mapCatalogRow)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const perSection = Math.max(1, Math.min(24, Number(searchParams.get('limit') || '8')))

    const supabase = getServiceSupabase()

    const [spotlightRes, bestDeals, latestDiscounts, latestReleases] =
      await Promise.all([
        getSpotlightItems(supabase, perSection),
        getBestDealsItems(supabase, perSection),
        getLatestDiscountsItems(supabase, perSection),
        getLatestReleaseItems(supabase, perSection),
      ])

    const grouped: StorefrontSectionsResponse = {
      steam_spotlight: spotlightRes.items,
      best_deals: bestDeals,
      latest_discounts: latestDiscounts,
      new_releases: latestReleases,
      updatedAt: spotlightRes.updatedAt,
    }

    return Response.json(grouped)
  } catch (error) {
    console.error('storefront sections error', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown storefront sections error',
      },
      { status: 500 }
    )
  }
}