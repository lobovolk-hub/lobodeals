export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  buildPcBrowseCountQuery,
  buildPcBrowseDataQuery,
  type PcBrowseRow,
  PC_PUBLIC_BROWSE_SELECT,
} from '@/lib/server/pcBrowseShared'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase env vars for /api/pc-browse-page')
  }

  return createClient(url, key)
}

function clampPage(value: string | null) {
  const page = Number(value || 1)
  if (!Number.isFinite(page) || page < 1) return 1
  return Math.floor(page)
}

function clampPageSize(value: string | null) {
  const size = Number(value || 36)
  if (!Number.isFinite(size) || size < 1) return 36
  return Math.min(Math.floor(size), 100)
}

function toPriceString(value: number | string | null) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return num.toFixed(2)
}

function toSavingsString(value: number | string | null) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return String(Math.round(num))
}

function applyPriceFilter(query: any, price: string | null) {
  const safe = String(price || '')
    .trim()
    .toLowerCase()

  if (safe === 'under-5') {
    return query.or('sale_price.lte.5,and(sale_price.is.null,normal_price.lte.5)')
  }

  if (safe === 'under-10') {
    return query.or(
      'sale_price.lte.10,and(sale_price.is.null,normal_price.lte.10)'
    )
  }

  if (safe === '80-plus') {
    return query.gte('discount_percent', 80)
  }

  return query
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)

    const requestedPage = clampPage(searchParams.get('page'))
    const pageSize = clampPageSize(searchParams.get('pageSize'))
    const sort = searchParams.get('sort')
    const q = String(searchParams.get('q') || '').trim()
    const price = searchParams.get('price')

    let countQuery: any = supabase
      .from('pc_public_catalog_cache')
      .select('pc_game_id', { count: 'exact', head: true })

    countQuery = buildPcBrowseCountQuery(countQuery, {
      sort,
      query: q,
    })
    countQuery = applyPriceFilter(countQuery, price)

    const { count, error: countError } = await countQuery

    if (countError) {
      throw new Error(`pc-browse-page count failed: ${countError.message}`)
    }

    const totalItems = Number(count || 0)
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 1
    const page = Math.min(requestedPage, totalPages)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let dataQuery: any = supabase
      .from('pc_public_catalog_cache')
      .select(PC_PUBLIC_BROWSE_SELECT)

    dataQuery = buildPcBrowseDataQuery(dataQuery, {
      sort,
      query: q,
    })
    dataQuery = applyPriceFilter(dataQuery, price)
    dataQuery = dataQuery.range(from, to)

    const { data, error } = await dataQuery

    if (error) {
      throw new Error(`pc-browse-page failed: ${error.message}`)
    }

    const rows = Array.isArray(data) ? (data as PcBrowseRow[]) : []

    return NextResponse.json({
      items: rows.map((row) => ({
        id: row.pc_game_id,
        steamAppID: row.steam_app_id,
        slug: row.slug,
        title: row.title,
        thumb: row.thumb,
        salePrice: toPriceString(row.sale_price),
        normalPrice: toPriceString(row.normal_price),
        savings: toSavingsString(row.discount_percent),
        storeID: row.store_id,
        url: row.url,
        isFreeToPlay: Boolean(row.is_free_to_play),
        hasActiveOffer: Boolean(row.has_active_offer),
        isCatalogReady: Boolean(row.is_catalog_ready),
        sortLatest: Number(row.sort_latest || 0),
        metacritic:
          row.metacritic !== null && row.metacritic !== undefined
            ? Number(row.metacritic)
            : null,
      })),
      totalItems,
      totalPages,
      page,
      pageSize,
      hasNextPage: page < totalPages,
      mode: 'cache',
      source: 'pc_public_catalog_cache',
      appliedSort: sort,
    })
  } catch (error) {
    console.error('/api/pc-browse-page error', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown /api/pc-browse-page error',
      },
      { status: 500 }
    )
  }
}