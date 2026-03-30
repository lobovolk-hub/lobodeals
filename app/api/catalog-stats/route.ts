export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for catalog stats')
  }

  return createClient(url, serviceRole)
}

export async function GET() {
  try {
    const supabase = getServiceSupabase()

    const { count, error } = await supabase
      .from('pc_games')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('steam_type', 'game')

    if (error) {
      throw error
    }

    return Response.json({
      steamCatalogSize: Number(count || 0),
      updatedAt: new Date().toISOString(),
      source: 'pc_games_base_games',
    })
  } catch (error) {
    console.error('catalog stats error', error)

    return Response.json({
      steamCatalogSize: 0,
      updatedAt: null,
      source: 'pc_games_base_games',
    })
  }
}