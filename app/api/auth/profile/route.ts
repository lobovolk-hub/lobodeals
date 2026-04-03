export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

const ALLOWED_REGIONS = ['US', 'PE'] as const
type RegionCode = (typeof ALLOWED_REGIONS)[number]

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for profile api')
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

async function getAuthenticatedUser(request: Request) {
  const token = getBearerToken(request)

  if (!token) {
    return {
      user: null,
      error: 'Missing bearer token',
      status: 401,
    }
  }

  const authSupabase = getAuthSupabase()
  const { data, error } = await authSupabase.auth.getUser(token)

  if (error || !data.user) {
    return {
      user: null,
      error: error?.message || 'Invalid session',
      status: 401,
    }
  }

  return {
    user: data.user,
    error: null,
    status: 200,
  }
}

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(value)
}

function isValidRegion(value: string): value is RegionCode {
  return ALLOWED_REGIONS.includes(value as RegionCode)
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request)

    if (!auth.user) {
      return Response.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: auth.status || 401 }
      )
    }

    const supabase = getServiceSupabase()

    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, email, username, preferred_region, created_at, updated_at')
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      profile: data || {
        user_id: auth.user.id,
        email: auth.user.email || null,
        username: '',
        preferred_region: 'US',
        created_at: null,
        updated_at: null,
      },
    })
  } catch (error) {
    console.error('api/auth/profile GET error', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected profile error',
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request)

    if (!auth.user) {
      return Response.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: auth.status || 401 }
      )
    }

    const body = await request.json()
    const rawUsername = body?.username
    const rawPreferredRegion = String(body?.preferredRegion || 'US').trim().toUpperCase()
    const email = String(auth.user.email || '').trim().toLowerCase()

    if (!isValidRegion(rawPreferredRegion)) {
      return Response.json(
        { success: false, error: 'Invalid preferred region.' },
        { status: 400 }
      )
    }

    let username: string | null = null

    if (typeof rawUsername === 'string') {
      const cleanUsername = rawUsername.trim()

      if (!isValidUsername(cleanUsername)) {
        return Response.json(
          {
            success: false,
            error: 'Username must be 3 to 20 characters and only use letters, numbers, underscores, or hyphens.',
          },
          { status: 400 }
        )
      }

      username = cleanUsername
    }

    const supabase = getServiceSupabase()

    if (username) {
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('user_id, username')
        .ilike('username', username)
        .limit(1)

      if (existing && existing.length > 0) {
        const conflict = existing.find((row) => row.user_id !== auth.user!.id)
        if (conflict) {
          return Response.json(
            { success: false, error: 'That username is already taken.' },
            { status: 409 }
          )
        }
      }
    }

    const updatePayload: {
      user_id: string
      email: string
      preferred_region: RegionCode
      updated_at: string
      username?: string
    } = {
      user_id: auth.user.id,
      email,
      preferred_region: rawPreferredRegion,
      updated_at: new Date().toISOString(),
    }

    if (username) {
      updatePayload.username = username
    }

    const { error } = await supabase.from('user_profiles').upsert(updatePayload, {
      onConflict: 'user_id',
    })

    if (error) {
      return Response.json(
        { success: false, error: error.message || 'Could not update profile.' },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      username: username ?? null,
      preferredRegion: rawPreferredRegion,
    })
  } catch (error) {
    console.error('api/auth/profile PATCH error', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected profile update error',
      },
      { status: 500 }
    )
  }
}