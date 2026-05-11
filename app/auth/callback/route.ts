import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/profile'

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=missing_auth_code', requestUrl.origin)
    )
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      new URL('/login?error=auth_callback_failed', requestUrl.origin)
    )
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}