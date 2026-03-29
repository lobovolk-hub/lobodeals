export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type SteamSpotlightItem = {
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
    throw new Error('Missing Supabase env vars for steam spotlight cache')
  }

  return createClient(url, serviceRole)
}

function isFresh(updatedAt: string, maxAgeMs: number) {
  return Date.now() - new Date(updatedAt).getTime() <= maxAgeMs
}

async function readCache() {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('deals_cache')
    .select('payload, updated_at')
    .eq('cache_key', 'steam_spotlight_us')
    .maybeSingle()

  if (error || !data) return null
  return data as { payload: SteamSpotlightItem[]; updated_at: string }
}

export async function GET(request: Request) {
  const CACHE_TTL_MS = 1000 * 60 * 60 * 6

  try {
    const { searchParams } = new URL(request.url)
    const limitParam = Number(searchParams.get('limit') || '')
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 60)
        : null

    const cached = await readCache()

    if (cached && isFresh(cached.updated_at, CACHE_TTL_MS)) {
      return Response.json(limit ? cached.payload.slice(0, limit) : cached.payload)
    }

    if (cached) {
      return Response.json(limit ? cached.payload.slice(0, limit) : cached.payload)
    }

    return Response.json([])
  } catch (error) {
    console.error('api/steam-spotlight error', error)
    return Response.json([])
  }
}