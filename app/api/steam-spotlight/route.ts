export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { makePcCanonicalKey } from '@/lib/pcCanonical'

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

type PcGameResolveRow = {
  steam_app_id?: string | null
  canonical_key?: string | null
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

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }

  return chunks
}

async function resolveLocally(items: SteamStoreItem[]) {
  const supabase = getServiceSupabase()

  const appIds = Array.from(
    new Set(
      items
        .map((item) => String(item.steamAppID || '').trim())
        .filter(Boolean)
    )
  )

  const canonicalKeys = Array.from(
    new Set(
      items
        .map((item) => makePcCanonicalKey(String(item.title || '').trim()))
        .filter(Boolean)
    )
  )

  const matchedAppIds = new Set<string>()
  const matchedCanonicalKeys = new Set<string>()

  for (const chunk of chunkArray(appIds, 200)) {
    const { data, error } = await supabase
      .from('pc_games')
      .select('steam_app_id')
      .eq('is_active', true)
      .in('steam_app_id', chunk)

    if (error) {
      throw error
    }

    for (const row of (Array.isArray(data) ? data : []) as PcGameResolveRow[]) {
      const value = String(row.steam_app_id || '').trim()
      if (value) matchedAppIds.add(value)
    }
  }

  for (const chunk of chunkArray(canonicalKeys, 200)) {
    const { data, error } = await supabase
      .from('pc_games')
      .select('canonical_key')
      .eq('is_active', true)
      .in('canonical_key', chunk)

    if (error) {
      throw error
    }

    for (const row of (Array.isArray(data) ? data : []) as PcGameResolveRow[]) {
      const value = String(row.canonical_key || '').trim()
      if (value) matchedCanonicalKeys.add(value)
    }
  }

  return items.filter((item) => {
    const appId = String(item.steamAppID || '').trim()
    const canonicalKey = makePcCanonicalKey(String(item.title || '').trim())

    if (appId && matchedAppIds.has(appId)) return true
    if (canonicalKey && matchedCanonicalKeys.has(canonicalKey)) return true

    return false
  })
}

export async function GET(request: Request) {
  const CACHE_TTL_MS = 1000 * 60 * 60 * 6

  try {
    const { searchParams } = new URL(request.url)
    const debug = searchParams.get('debug') === '1'
    const includeUnresolved = searchParams.get('includeUnresolved') === '1'
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

    if (limit && limit <= 12) {
      if (spotlightItems.length > 0) {
        selected = spotlightItems
        source = spotlightFresh ? 'spotlight-fresh' : 'spotlight-stale'
      } else if (salesItems.length > 0) {
        selected = salesItems
        source = salesFresh ? 'sales-fresh-fallback' : 'sales-stale-fallback'
      }
    } else {
      if (salesItems.length > 0) {
        selected = salesItems
        source = salesFresh ? 'sales-fresh' : 'sales-stale'
      } else if (spotlightItems.length > 0) {
        selected = spotlightItems
        source = spotlightFresh ? 'spotlight-fallback-fresh' : 'spotlight-fallback-stale'
      }
    }

    const locallyResolvable = includeUnresolved
      ? selected
      : await resolveLocally(selected)

    const output = limit ? locallyResolvable.slice(0, limit) : locallyResolvable

    if (debug) {
      return Response.json({
        source,
        selectedCountBeforeFilter: selected.length,
        selectedCountAfterFilter: locallyResolvable.length,
        outputCount: output.length,
        spotlightCount: spotlightItems.length,
        salesCount: salesItems.length,
        spotlightUpdatedAt: spotlightCache?.updated_at || null,
        salesUpdatedAt: salesCache?.updated_at || null,
        spotlightFresh,
        salesFresh,
        includeUnresolved,
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
        selectedCountBeforeFilter: 0,
        selectedCountAfterFilter: 0,
        outputCount: 0,
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