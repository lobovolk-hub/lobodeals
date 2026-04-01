export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type RefreshResult = {
  success?: boolean
  rows_inserted?: number
  refreshed_at?: string
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for public catalog refresh')
  }

  return createClient(url, serviceRole)
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const prefix = 'Bearer '

  if (!authHeader.startsWith(prefix)) {
    return ''
  }

  return authHeader.slice(prefix.length).trim()
}

export async function POST(request: Request) {
  const expectedToken = process.env.INTERNAL_REFRESH_TOKEN

  if (!expectedToken) {
    return Response.json(
      { success: false, error: 'Missing INTERNAL_REFRESH_TOKEN on server' },
      { status: 500 }
    )
  }

  const providedToken = getBearerToken(request)

  if (!providedToken || providedToken !== expectedToken) {
    return Response.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const supabase = getServiceSupabase()
  const startedAtIso = new Date().toISOString()

  try {
    const { data, error } = await supabase.rpc('refresh_pc_public_catalog_cache')

    if (error) {
      throw error
    }

    const payload = Array.isArray(data)
      ? (data[0] as RefreshResult | undefined)
      : (data as RefreshResult | null)

    return Response.json({
      success: true,
      refresh: payload,
      startedAt: startedAtIso,
      finishedAt: new Date().toISOString(),
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown public catalog refresh error'

    console.error('internal-refresh-pc-public-catalog error', error)

    return Response.json(
      {
        success: false,
        error: message,
        startedAt: startedAtIso,
        finishedAt: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
