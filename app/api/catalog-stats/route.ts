export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type PcGameRow = {
  id: string
  slug?: string | null
  steam_name?: string | null
  canonical_title?: string | null
  hero_image_url?: string | null
  header_image?: string | null
  capsule_image?: string | null
  description?: string | null
  short_description?: string | null
  rawg_description?: string | null
  is_free_to_play?: boolean | null
  steam_type?: string | null
  steam_app_id?: string | null
}

type OfferRow = {
  pc_game_id?: string | null
}

const PAGE_SIZE = 1000

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for catalog stats')
  }

  return createClient(url, serviceRole)
}

function hasText(value?: string | null) {
  return String(value || '').trim().length > 0
}

function hasTitle(row: PcGameRow) {
  return hasText(row.steam_name) || hasText(row.canonical_title)
}

function hasImage(row: PcGameRow) {
  return (
    hasText(row.hero_image_url) ||
    hasText(row.header_image) ||
    hasText(row.capsule_image)
  )
}

function hasDescription(row: PcGameRow) {
  return (
    hasText(row.description) ||
    hasText(row.short_description) ||
    hasText(row.rawg_description)
  )
}

function isStructurallyPublicable(row: PcGameRow) {
  return (
    row.steam_type === 'game' &&
    hasText(row.slug) &&
    hasTitle(row) &&
    hasImage(row) &&
    hasDescription(row)
  )
}

async function loadModernOfferGameIds(
  supabase: ReturnType<typeof getServiceSupabase>
) {
  const ids = new Set<string>()

  for (let page = 0; page < 50; page += 1) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('pc_store_offers')
      .select('pc_game_id')
      .eq('store_id', '1')
      .eq('region_code', 'us')
      .eq('price_source', 'steam_appdetails_us')
      .not('price_last_synced_at', 'is', null)
      .eq('is_available', true)
      .range(from, to)

    if (error) {
      throw error
    }

    const rows = Array.isArray(data) ? (data as OfferRow[]) : []

    if (!rows.length) break

    for (const row of rows) {
      const id = String(row.pc_game_id || '').trim()
      if (id) ids.add(id)
    }

    if (rows.length < PAGE_SIZE) break
  }

  return ids
}

async function countPublishableGames(
  supabase: ReturnType<typeof getServiceSupabase>,
  modernOfferIds: Set<string>
) {
  let total = 0

  for (let page = 0; page < 100; page += 1) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('pc_games')
      .select(
        'id, slug, steam_name, canonical_title, hero_image_url, header_image, capsule_image, description, short_description, rawg_description, is_free_to_play, steam_type, steam_app_id'
      )
      .eq('steam_type', 'game')
      .order('steam_app_id', { ascending: false })
      .range(from, to)

    if (error) {
      throw error
    }

    const rows = Array.isArray(data) ? (data as PcGameRow[]) : []

    if (!rows.length) break

    for (const row of rows) {
      const id = String(row.id || '').trim()
      const hasModernPrice = modernOfferIds.has(id)
      const isFree = Boolean(row.is_free_to_play)

      if (!isStructurallyPublicable(row)) continue
      if (!hasModernPrice && !isFree) continue

      total += 1
    }

    if (rows.length < PAGE_SIZE) break
  }

  return total
}

export async function GET() {
  try {
    const supabase = getServiceSupabase()
    const modernOfferIds = await loadModernOfferGameIds(supabase)
    const steamCatalogSize = await countPublishableGames(
      supabase,
      modernOfferIds
    )

    return Response.json({
      steamCatalogSize,
      updatedAt: new Date().toISOString(),
      source: 'pc_games_publishable',
    })
  } catch (error) {
    console.error('catalog stats error', error)

    return Response.json({
      steamCatalogSize: 0,
      updatedAt: null,
      source: 'pc_games_publishable',
    })
  }
}