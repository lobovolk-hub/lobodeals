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

function getAuthSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    throw new Error('Missing Supabase env vars for auth validation')
  }

  return createClient(url, publishableKey)
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!authHeader) return null

  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

async function getAuthenticatedUserId(request: Request) {
  const token = getBearerToken(request)

  if (!token) {
    return {
      userId: null,
      error: 'Missing bearer token',
      status: 401,
    }
  }

  const authSupabase = getAuthSupabase()
  const { data, error } = await authSupabase.auth.getUser(token)

  if (error || !data.user) {
    return {
      userId: null,
      error: error?.message || 'Invalid session',
      status: 401,
    }
  }

  return {
    userId: data.user.id,
    error: null,
    status: 200,
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedUserId(request)

    if (!auth.userId) {
      return Response.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: auth.status || 401 }
      )
    }

    const body = await request.json()

    const {
      dealID,
      gameID,
      title,
      thumb,
      salePrice,
      normalPrice,
      storeID,
    } = body ?? {}

    if (!dealID || !title) {
      return Response.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const userId = auth.userId
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