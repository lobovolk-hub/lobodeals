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
    throw new Error('Missing Supabase env vars for steam game api')
  }

  return createClient(url, serviceRole)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const steamAppID = searchParams.get('steamAppID')

    if (!steamAppID) {
      return Response.json(
        { error: 'Missing steamAppID' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    const { data, error } = await supabase
      .from('deals_cache')
      .select('payload')
      .eq('cache_key', 'steam_spotlight_us')
      .maybeSingle()

    if (error) {
      throw error
    }

    const payload = Array.isArray(data?.payload) ? data.payload : []

    const match = payload.find(
      (item: SteamSpotlightItem) => String(item.steamAppID) === String(steamAppID)
    )

    if (!match) {
      return Response.json(
        { error: 'Steam game not found in spotlight cache' },
        { status: 404 }
      )
    }

    return Response.json(match)
  } catch (error) {
    console.error('api/steam-game error', error)

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load steam game',
      },
      { status: 500 }
    )
  }
}