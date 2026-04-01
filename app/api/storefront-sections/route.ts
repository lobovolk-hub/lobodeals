export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type StorefrontSectionRow = {
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

function mapRow(row: StorefrontSectionRow): StorefrontSectionItem {
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const perSection = Math.max(
      1,
      Math.min(24, Number(searchParams.get('limit') || '8'))
    )

    const supabase = getServiceSupabase()

    const { data, error } = await supabase
      .from('public_storefront_sections_cache')
      .select(
        'section_key, position, pc_game_id, steam_app_id, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, platform, updated_at'
      )
      .in('section_key', [
        'steam_spotlight',
        'best_deals',
        'latest_discounts',
        'new_releases',
      ])
      .order('section_key', { ascending: true })
      .order('position', { ascending: true })

    if (error) {
      throw error
    }

    const rows = Array.isArray(data) ? (data as StorefrontSectionRow[]) : []

    const grouped: StorefrontSectionsResponse = {
      steam_spotlight: [],
      best_deals: [],
      latest_discounts: [],
      new_releases: [],
      updatedAt: rows.length > 0 ? rows[0].updated_at : null,
    }

    for (const row of rows) {
      const mapped = mapRow(row)

      if (
        row.section_key === 'steam_spotlight' &&
        grouped.steam_spotlight.length < perSection
      ) {
        grouped.steam_spotlight.push(mapped)
        continue
      }

      if (
        row.section_key === 'best_deals' &&
        grouped.best_deals.length < perSection
      ) {
        grouped.best_deals.push(mapped)
        continue
      }

      if (
        row.section_key === 'latest_discounts' &&
        grouped.latest_discounts.length < perSection
      ) {
        grouped.latest_discounts.push(mapped)
        continue
      }

      if (
        row.section_key === 'new_releases' &&
        grouped.new_releases.length < perSection
      ) {
        grouped.new_releases.push(mapped)
      }
    }

    return Response.json(grouped)
  } catch (error) {
    console.error('storefront sections error', error)

    return Response.json(
      {
        steam_spotlight: [],
        best_deals: [],
        latest_discounts: [],
        new_releases: [],
        updatedAt: null,
      },
      { status: 500 }
    )
  }
}

