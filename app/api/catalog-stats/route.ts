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
      .from('pc_public_catalog_cache')
      .select('pc_game_id', { count: 'exact', head: true })

    if (error) {
      throw error
    }

    return Response.json({
      steamCatalogSize: Number(count || 0),
      source: 'pc_public_catalog_cache',
      mode: 'cache',
    })
  } catch (error) {
    console.error('catalog stats error', error)

    return Response.json(
      {
        steamCatalogSize: 0,
        source: 'pc_public_catalog_cache',
        mode: 'error',
      },
      { status: 500 }
    )
  }
}