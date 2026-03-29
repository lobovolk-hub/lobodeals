export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type SteamStoreItem = {
  steamAppID: string
  title: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  platform: string
  url: string
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for steam cache')
  }

  return createClient(url, serviceRole)
}

function isFresh(updatedAt: string, maxAgeMs: number) {
  return Date.now() - new Date(updatedAt).getTime() <= maxAgeMs
}

async function readCache(cacheKey: string) {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('deals_cache')
    .select('payload, updated_at')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (error || !data) return null
  return data as { payload: SteamStoreItem[]; updated_at: string }
}

export async function GET(request: Request) {
  const CACHE_TTL_MS = 1000 * 60 * 60 * 6

  try {
    const { searchParams } = new URL(request.url)
    const debug = searchParams.get('debug') === '1'
    const limitParam = Number(searchParams.get('limit') || '')
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 1200)
        : null

    const [spotlightCache, salesCache] = await Promise.all([
      readCache('steam_spotlight_us'),
      readCache('steam_sales_us'),
    ])

    const spotlightItems = Array.isArray(spotlightCache?.payload)
      ? spotlightCache!.payload
      : []
    const salesItems = Array.isArray(salesCache?.payload)
      ? salesCache!.payload
      : []

    const spotlightFresh =
      !!spotlightCache && isFresh(spotlightCache.updated_at, CACHE_TTL_MS)
    const salesFresh =
      !!salesCache && isFresh(salesCache.updated_at, CACHE_TTL_MS)

    let selected: SteamStoreItem[] = []
    let source = 'none'

    // Home / catalog / tiny requests -> curated spotlight first
    if (limit && limit <= 12) {
      if (spotlightItems.length > 0) {
        selected = spotlightItems
        source = spotlightFresh ? 'spotlight-fresh' : 'spotlight-stale'
      } else if (salesItems.length > 0) {
        selected = salesItems
        source = salesFresh ? 'sales-fresh-fallback' : 'sales-stale-fallback'
      }
    } else {
      // PC steam mode / large requests -> sales first
      if (salesItems.length > 0) {
        selected = salesItems
        source = salesFresh ? 'sales-fresh' : 'sales-stale'
      } else if (spotlightItems.length > 0) {
        selected = spotlightItems
        source = spotlightFresh ? 'spotlight-fallback-fresh' : 'spotlight-fallback-stale'
      }
    }

    const output = limit ? selected.slice(0, limit) : selected

    if (debug) {
      return Response.json({
        source,
        selectedCount: output.length,
        spotlightCount: spotlightItems.length,
        salesCount: salesItems.length,
        spotlightUpdatedAt: spotlightCache?.updated_at || null,
        salesUpdatedAt: salesCache?.updated_at || null,
        spotlightFresh,
        salesFresh,
      })
    }

    return Response.json(output)
  } catch (error) {
    console.error('api/steam-spotlight error', error)

    const { searchParams } = new URL(request.url)
    const debug = searchParams.get('debug') === '1'

    if (debug) {
      return Response.json({
        source: 'error',
        selectedCount: 0,
        spotlightCount: 0,
        salesCount: 0,
        spotlightUpdatedAt: null,
        salesUpdatedAt: null,
        spotlightFresh: false,
        salesFresh: false,
        error: error instanceof Error ? error.message : 'Unknown steam cache error',
      })
    }

    return Response.json([])
  }
}