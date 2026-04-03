export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for reset api')
  }

  return createClient(url, serviceRole)
}

function getAuthSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    throw new Error('Missing Supabase env vars for auth reset api')
  }

  return createClient(url, publishableKey)
}

function looksLikeEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value)
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com').trim()
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const identifier = String(body?.identifier || '').trim()

    if (!identifier) {
      return Response.json(
        { success: false, error: 'Enter your email or username.' },
        { status: 400 }
      )
    }

    let email = identifier.toLowerCase()

    if (!looksLikeEmail(identifier)) {
      const serviceSupabase = getServiceSupabase()

      const { data } = await serviceSupabase
        .from('user_profiles')
        .select('email')
        .ilike('username', identifier)
        .maybeSingle()

      if (data?.email) {
        email = String(data.email).trim().toLowerCase()
      } else {
        return Response.json({
          success: true,
          message:
            'If that account exists, a recovery email has been sent. You can also sign in directly using your email.',
        })
      }
    }

    const authSupabase = getAuthSupabase()

    await authSupabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getSiteUrl()}/reset-password`,
    })

    return Response.json({
      success: true,
      message:
        'If that account exists, a recovery email has been sent. You can also sign in directly using your email.',
    })
  } catch (error) {
    console.error('api/auth/request-reset error', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected recovery error',
      },
      { status: 500 }
    )
  }
}