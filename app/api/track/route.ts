export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for track api')
  }

  return createClient(url, serviceRole)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      userId,
      dealID,
      gameID,
      title,
      thumb,
      salePrice,
      normalPrice,
      storeID,
    } = body ?? {}

    if (!userId || !dealID || !title) {
      return Response.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    const { data: existing, error: existingError } = await supabase
      .from('tracked_games')
      .select('id')
      .eq('user_id', userId)
      .eq('deal_id', dealID)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    if (existing) {
      const { error: deleteError } = await supabase
        .from('tracked_games')
        .delete()
        .eq('user_id', userId)
        .eq('deal_id', dealID)

      if (deleteError) {
        throw deleteError
      }

      return Response.json({
        success: true,
        action: 'removed',
      })
    }

    const { error: insertError } = await supabase.from('tracked_games').insert({
      user_id: userId,
      deal_id: dealID,
      game_id: gameID || null,
      title,
      thumb: thumb || null,
      sale_price: salePrice || null,
      normal_price: normalPrice || null,
      store_id: storeID || null,
      updated_at: new Date().toISOString(),
    })

    if (insertError) {
      throw insertError
    }

    return Response.json({
      success: true,
      action: 'added',
    })
  } catch (error) {
    console.error('api/track error', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Track request failed',
      },
      { status: 500 }
    )
  }
}