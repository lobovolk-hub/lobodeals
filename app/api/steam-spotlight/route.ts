export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type SteamSpotlightCacheRow = {
  steam_app_id: string
  title: string
  slug: string
  thumb: string
  sale_price?: number | string | null
  normal_price?: number | string | null
  discount_percent?: number | string | null
  store_id?: string | null
  url?: string | null
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for steam spotlight')
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || '36')))

    const supabase = getServiceSupabase()

    const { data, error } = await supabase
      .from('steam_spotlight_cache')
      .select(
        'steam_app_id, title, slug, thumb, sale_price, normal_price, discount_percent, store_id, url'
      )
      .order('discount_percent', { ascending: false })
      .order('sale_price', { ascending: true })
      .limit(limit)

    if (error) {
      throw error
    }

    const items = Array.isArray(data)
      ? (data as SteamSpotlightCacheRow[]).map((row) => ({
          steamAppID: String(row.steam_app_id || '').trim(),
          title: String(row.title || '').trim(),
          slug: String(row.slug || '').trim(),
          salePrice: formatMoney(row.sale_price),
          normalPrice: formatMoney(row.normal_price),
          savings: formatSavings(row.discount_percent),
          thumb: String(row.thumb || '').trim(),
          storeID: String(row.store_id || '1').trim(),
          platform: 'pc',
          url: String(row.url || '').trim(),
        }))
      : []

    return Response.json(items)
  } catch (error) {
    console.error('steam spotlight error', error)
    return Response.json([], { status: 500 })
  }
}