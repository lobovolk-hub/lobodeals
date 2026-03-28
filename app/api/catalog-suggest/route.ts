export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type CheapSharkGame = {
  gameID: string
  external?: string
  thumb?: string
  cheapestDealID?: string
  cheapest?: string
}

const SUGGEST_TTL_MS = 1000 * 60 * 60 * 6

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for catalog suggest cache')
  }

  return createClient(url, serviceRole)
}

function makeCacheKey(title: string) {
  return `catalog_suggest::${title.toLowerCase().trim()}`
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
  return data as { payload: CheapSharkGame[]; updated_at: string }
}

async function writeCache(cacheKey: string, payload: CheapSharkGame[]) {
  const supabase = getServiceSupabase()

  const { error } = await supabase.from('deals_cache').upsert(
    {
      cache_key: cacheKey,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'cache_key' }
  )

  if (error) throw error
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawTitle = searchParams.get('title')?.trim() || ''

    if (rawTitle.length < 3) {
      return Response.json([], { status: 200 })
    }

    const cacheKey = makeCacheKey(rawTitle)
    const cached = await readCache(cacheKey)

    if (cached && isFresh(cached.updated_at, SUGGEST_TTL_MS)) {
      return Response.json(cached.payload, { status: 200 })
    }

    const url = `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(
      rawTitle
    )}&limit=5&exact=0`

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LoboDeals/1.0',
      },
    })

    if (!res.ok) {
      if (cached) return Response.json(cached.payload, { status: 200 })
      return Response.json([], { status: 200 })
    }

    const data = await res.json()
    const list = Array.isArray(data) ? (data as CheapSharkGame[]) : []

    const cleaned = list.filter((game) => {
      if (!game.gameID) return false
      if (!game.external || typeof game.external !== 'string') return false
      return true
    })

    const payload = cleaned.slice(0, 5)

    if (payload.length > 0) {
      await writeCache(cacheKey, payload)
    }

    return Response.json(payload, { status: 200 })
  } catch (error) {
    console.error('catalog suggest error', error)
    return Response.json([], { status: 200 })
  }
}