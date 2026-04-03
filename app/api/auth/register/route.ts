export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for register api')
  }

  return createClient(url, serviceRole)
}

function getAuthSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    throw new Error('Missing Supabase env vars for auth register api')
  }

  return createClient(url, publishableKey)
}

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value)
}

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(value)
}

function isValidPassword(value: string) {
  return value.length >= 8 && value.length <= 12
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com').trim()
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const email = String(body?.email || '').trim().toLowerCase()
    const username = String(body?.username || '').trim()
    const password = String(body?.password || '')

    if (!isValidEmail(email)) {
      return Response.json(
        { success: false, error: 'Enter a valid email address.' },
        { status: 400 }
      )
    }

    if (!isValidUsername(username)) {
      return Response.json(
        {
          success: false,
          error: 'Username must be 3 to 20 characters and only use letters, numbers, underscores, or hyphens.',
        },
        { status: 400 }
      )
    }

    if (!isValidPassword(password)) {
      return Response.json(
        { success: false, error: 'Password must be between 8 and 12 characters.' },
        { status: 400 }
      )
    }

    const serviceSupabase = getServiceSupabase()

    const { data: existingUsername } = await serviceSupabase
      .from('user_profiles')
      .select('user_id')
      .ilike('username', username)
      .limit(1)

    if (existingUsername && existingUsername.length > 0) {
      return Response.json(
        { success: false, error: 'That username is already taken.' },
        { status: 409 }
      )
    }

    const { data: existingEmail } = await serviceSupabase
      .from('user_profiles')
      .select('user_id')
      .ilike('email', email)
      .limit(1)

    if (existingEmail && existingEmail.length > 0) {
      return Response.json(
        { success: false, error: 'That email is already registered.' },
        { status: 409 }
      )
    }

    const authSupabase = getAuthSupabase()

    const { data, error } = await authSupabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${getSiteUrl()}/login?verified=1`,
        data: {
          username,
        },
      },
    })

    if (error) {
      return Response.json(
        { success: false, error: error.message || 'Unable to create account.' },
        { status: 400 }
      )
    }

    if (!data.user?.id) {
      return Response.json(
        { success: false, error: 'Account created but no user id was returned.' },
        { status: 500 }
      )
    }

    const { error: profileError } = await serviceSupabase.from('user_profiles').upsert(
      {
        user_id: data.user.id,
        email,
        username,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    )

    if (profileError) {
      try {
        await serviceSupabase.auth.admin.deleteUser(data.user.id)
      } catch (rollbackError) {
        console.error('register rollback failed', rollbackError)
      }

      return Response.json(
        { success: false, error: profileError.message || 'Could not save user profile.' },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      needsEmailVerification: !data.session,
      session: data.session || null,
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
          }
        : null,
    })
  } catch (error) {
    console.error('api/auth/register error', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected register error',
      },
      { status: 500 }
    )
  }
}