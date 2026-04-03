export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for wishlist api')
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

    if (!body?.dealID || !body?.title) {
      return Response.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const userId = auth.userId
    const supabase = getServiceSupabase()

    const { data: existingRows, error: existingError } = await supabase
      .from('wishlist')
      .select('id')
      .eq('deal_id', body.dealID)
      .eq('user_id', userId)

    if (existingError) {
      return Response.json(
        { success: false, error: existingError.message },
        { status: 500 }
      )
    }

    if (existingRows && existingRows.length > 0) {
      const { error: deleteError } = await supabase
        .from('wishlist')
        .delete()
        .eq('deal_id', body.dealID)
        .eq('user_id', userId)

      if (deleteError) {
        return Response.json(
          { success: false, error: deleteError.message },
          { status: 500 }
        )
      }

      return Response.json({
        success: true,
        action: 'removed',
      })
    }

    const { error } = await supabase.from('wishlist').insert([
      {
        deal_id: body.dealID,
        title: body.title,
        sale_price: body.salePrice || null,
        normal_price: body.normalPrice || null,
        thumb: body.thumb || null,
        user_id: userId,
      },
    ])

    if (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      action: 'added',
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error interno wishlist',
      },
      { status: 500 }
    )
  }
}