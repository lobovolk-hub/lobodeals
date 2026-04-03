export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for login api')
  }

  return createClient(url, serviceRole)
}

function getAuthSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    throw new Error('Missing Supabase env vars for auth login api')
  }

  return createClient(url, publishableKey)
}

function looksLikeEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const identifier = String(body?.identifier || '').trim()
    const password = String(body?.password || '')

    if (!identifier) {
      return Response.json(
        { success: false, error: 'Enter your username or email.' },
        { status: 400 }
      )
    }

    if (!password) {
      return Response.json(
        { success: false, error: 'Enter your password.' },
        { status: 400 }
      )
    }

    let email = identifier.toLowerCase()

    if (!looksLikeEmail(identifier)) {
      const serviceSupabase = getServiceSupabase()

      const { data, error } = await serviceSupabase
        .from('user_profiles')
        .select('email')
        .ilike('username', identifier)
        .maybeSingle()

      if (error) {
        return Response.json(
          { success: false, error: error.message || 'Could not resolve username.' },
          { status: 500 }
        )
      }

      if (!data?.email) {
        return Response.json(
          { success: false, error: 'Invalid username or password.' },
          { status: 401 }
        )
      }

      email = String(data.email).trim().toLowerCase()
    }

    const authSupabase = getAuthSupabase()

    const { data, error } = await authSupabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.session) {
      return Response.json(
        { success: false, error: error?.message || 'Invalid username/email or password.' },
        { status: 401 }
      )
    }

    return Response.json({
      success: true,
      session: data.session,
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
          }
        : null,
    })
  } catch (error) {
    console.error('api/auth/login error', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected login error',
      },
      { status: 500 }
    )
  }
}