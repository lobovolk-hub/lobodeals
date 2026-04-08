export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type CatalogPublicRow = {
  pc_game_id: string
  steam_app_id?: string | null
  steam_type?: string | null
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
}

type CatalogBrowseItem = {
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
    throw new Error('Missing Supabase env vars for catalog browse page')
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

function mapRowToItem(row: CatalogPublicRow): CatalogBrowseItem {
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

function applyCommonFilters(
  query: any,
  normalizedQuery: string,
  typeFilter: string,
  storeFilter: string,
  priceFilter: string
) {
  if (typeFilter !== 'all') {
    query = query.eq('steam_type', typeFilter)
  }

  if (storeFilter !== 'all') {
    query = query.eq('store_id', storeFilter)
  }

  if (priceFilter === 'under-5') {
    query = query.gt('sale_price', 0).lt('sale_price', 5)
  } else if (priceFilter === 'under-10') {
    query = query.gt('sale_price', 0).lt('sale_price', 10)
  } else if (priceFilter === 'over-80') {
    query = query.gte('discount_percent', 80)
  }

  if (normalizedQuery) {
    query = query.ilike('search_title_normalized', `%${normalizedQuery}%`)
  }

  return query
}

function applySort(query: any, sort: string) {
  if (sort === 'biggest-discount') {
    return query
      .order('discount_percent', { ascending: false })
      .order('sale_price', { ascending: true, nullsFirst: false })
      .order('sort_latest', { ascending: false })
  }

  if (sort === 'latest') {
    return query
      .order('sort_latest', { ascending: false })
      .order('discount_percent', { ascending: false })
      .order('title', { ascending: true })
  }

  if (sort === 'latest-discounts') {
    return query
      .gt('discount_percent', 0)
      .order('price_last_synced_at', { ascending: false, nullsFirst: false })
      .order('discount_percent', { ascending: false })
      .order('sort_latest', { ascending: false })
  }

  if (sort === 'best') {
    return query
      .order('has_active_offer', { ascending: false })
      .order('discount_percent', { ascending: false })
      .order('sale_price', { ascending: true, nullsFirst: false })
      .order('sort_latest', { ascending: false })
  }

  return query
    .order('has_active_offer', { ascending: false })
    .order('discount_percent', { ascending: false })
    .order('title', { ascending: true })
}

function isBaseBrowseView(
  normalizedQuery: string,
  typeFilter: string,
  storeFilter: string,
  priceFilter: string
) {
  return (
    !normalizedQuery &&
    typeFilter === 'all' &&
    storeFilter === 'all' &&
    priceFilter === 'all'
  )
}

async function getCachedBaseTotal(supabase: any) {
  const { data, error } = await supabase
    .from('catalog_public_meta')
    .select('total_items')
    .eq('key', 'default')
    .maybeSingle()

  if (error) {
    throw error
  }

  return Number(data?.total_items || 0)
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

    const requestedPage = Math.max(1, Number(searchParams.get('page') || '1'))
    const pageSize = Math.max(
      1,
      Math.min(60, Number(searchParams.get('pageSize') || '36'))
    )
    const query = searchParams.get('q') || ''
    const sort = searchParams.get('sort') || 'all'
    const typeFilter = getSafeTypeFilter(searchParams.get('type') || 'all')
    const storeFilter = searchParams.get('store') || 'all'
    const priceFilter = searchParams.get('price') || 'all'

    const normalizedQuery = normalizeSteamTitle(query)
    const baseView = isBaseBrowseView(
      normalizedQuery,
      typeFilter,
      storeFilter,
      priceFilter
    )

    const supabase = getServiceSupabase()

    let totalItems = 0

    if (baseView) {
      totalItems = await getCachedBaseTotal(supabase)
    } else {
      let countQuery = supabase
        .from('catalog_public_cache')
        .select('pc_game_id', { count: 'exact', head: true })

      countQuery = applyCommonFilters(
        countQuery,
        normalizedQuery,
        typeFilter,
        storeFilter,
        priceFilter
      )

      if (sort === 'latest-discounts') {
        countQuery = countQuery.gt('discount_percent', 0)
      }

      const { count, error: countError } = await countQuery

      if (countError) {
        throw countError
      }

      totalItems = Number(count || 0)
    }

    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 1
    const safePage = totalItems > 0 ? Math.min(requestedPage, totalPages) : 1
    const safeFrom = (safePage - 1) * pageSize

    let dataQuery = supabase
      .from('catalog_public_cache')
      .select(
        'pc_game_id, steam_app_id, steam_type, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, is_free_to_play, has_active_offer, is_catalog_ready, sort_latest'
      )

    dataQuery = applyCommonFilters(
      dataQuery,
      normalizedQuery,
      typeFilter,
      storeFilter,
      priceFilter
    )

    dataQuery = applySort(dataQuery, sort).range(safeFrom, safeFrom + pageSize - 1)

    const { data, error: dataError } = await dataQuery

    if (dataError) {
      throw dataError
    }

    const rawItems = Array.isArray(data) ? (data as CatalogPublicRow[]) : []
    const items = rawItems.slice(0, pageSize).map(mapRowToItem)

    return Response.json({
      items,
      totalItems,
      totalPages,
      page: safePage,
      pageSize,
      hasNextPage: safePage < totalPages,
      mode: 'cache',
      source: 'catalog_public_cache',
    })
  } catch (error) {
    console.error('catalog browse page error', error)

    return Response.json({
      items: [],
      totalItems: 0,
      totalPages: 1,
      page: 1,
      pageSize: 36,
      hasNextPage: false,
      mode: 'error',
      source: 'catalog_public_cache',
    })
  }
}