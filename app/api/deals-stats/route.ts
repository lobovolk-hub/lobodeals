export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type Deal = {
  dealID: string
}

type SteamStoreItem = {
  steamAppID: string
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for deals stats')
  }

  return createClient(url, serviceRole)
}

export async function GET() {
  try {
    const supabase = getServiceSupabase()

    const [{ data: dealsCache }, { data: steamSpotlightCache }, { data: steamSalesCache }] =
      await Promise.all([
        supabase
          .from('deals_cache')
          .select('payload, updated_at')
          .eq('cache_key', 'cheapshark_deals_main')
          .maybeSingle(),
        supabase
          .from('deals_cache')
          .select('payload, updated_at')
          .eq('cache_key', 'steam_spotlight_us')
          .maybeSingle(),
        supabase
          .from('deals_cache')
          .select('payload, updated_at')
          .eq('cache_key', 'steam_sales_us')
          .maybeSingle(),
      ])

    const deals = Array.isArray(dealsCache?.payload)
      ? (dealsCache.payload as Deal[])
      : []

    const steamSpotlight = Array.isArray(steamSpotlightCache?.payload)
      ? (steamSpotlightCache.payload as SteamStoreItem[])
      : []

    const steamSales = Array.isArray(steamSalesCache?.payload)
      ? (steamSalesCache.payload as SteamStoreItem[])
      : []

    return Response.json({
      dealsIndexed: deals.length,
      steamIndexed: steamSales.length,
      steamSpotlightIndexed: steamSpotlight.length,
      dealsUpdatedAt: dealsCache?.updated_at || null,
      steamUpdatedAt: steamSalesCache?.updated_at || null,
      steamSpotlightUpdatedAt: steamSpotlightCache?.updated_at || null,
    })
  } catch (error) {
    console.error('api/deals-stats error', error)

    return Response.json({
      dealsIndexed: 0,
      steamIndexed: 0,
      steamSpotlightIndexed: 0,
      dealsUpdatedAt: null,
      steamUpdatedAt: null,
      steamSpotlightUpdatedAt: null,
    })
  }
}