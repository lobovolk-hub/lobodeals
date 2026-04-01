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
    throw new Error('Missing Supabase env vars for public layer refresh')
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

function getSafeRowsInserted(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 0

  const value = (payload as Record<string, unknown>).rows_inserted
  const num = Number(value || 0)

  return Number.isFinite(num) ? num : 0
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

  let syncLogId: string | null = null

  try {
    const { data: startedLog, error: startedLogError } = await supabase
      .from('sync_logs')
      .insert({
        job_type: 'pc_public_layer_refresh',
        status: 'running',
        notes: 'Refreshing pc public catalog cache and storefront sections cache',
        items_processed: 0,
        started_at: startedAtIso,
      })
      .select('id')
      .single()

    if (!startedLogError && startedLog?.id) {
      syncLogId = String(startedLog.id)
    }

    const { data: catalogRefresh, error: catalogError } = await supabase.rpc(
      'refresh_pc_public_catalog_cache'
    )

    if (catalogError) {
      throw catalogError
    }

    const { data: storefrontRefresh, error: storefrontError } = await supabase.rpc(
      'refresh_public_storefront_sections_cache'
    )

    if (storefrontError) {
      throw storefrontError
    }

    const catalogPayload = Array.isArray(catalogRefresh)
      ? (catalogRefresh[0] as RefreshResult | undefined)
      : (catalogRefresh as RefreshResult | null)

    const storefrontPayload = Array.isArray(storefrontRefresh)
      ? (storefrontRefresh[0] as RefreshResult | undefined)
      : (storefrontRefresh as RefreshResult | null)

    const catalogRows = getSafeRowsInserted(catalogPayload)
    const storefrontRows = getSafeRowsInserted(storefrontPayload)
    const totalProcessed = catalogRows + storefrontRows
    const finishedAtIso = new Date().toISOString()

    if (syncLogId) {
      await supabase
        .from('sync_logs')
        .update({
          status: 'success',
          notes: `pc_public_catalog_cache=${catalogRows}; public_storefront_sections_cache=${storefrontRows}`,
          items_processed: totalProcessed,
          finished_at: finishedAtIso,
        })
        .eq('id', syncLogId)
    }

    return Response.json({
      success: true,
      catalogRefresh: catalogPayload,
      storefrontRefresh: storefrontPayload,
      itemsProcessed: totalProcessed,
      startedAt: startedAtIso,
      finishedAt: finishedAtIso,
    })
  } catch (error) {
    const finishedAtIso = new Date().toISOString()
    const message =
      error instanceof Error ? error.message : 'Unknown public layer refresh error'

    if (syncLogId) {
      await supabase
        .from('sync_logs')
        .update({
          status: 'error',
          notes: message,
          finished_at: finishedAtIso,
        })
        .eq('id', syncLogId)
    }

    console.error('internal-refresh-pc-public-layer error', error)

    return Response.json(
      {
        success: false,
        error: message,
        startedAt: startedAtIso,
        finishedAt: finishedAtIso,
      },
      { status: 500 }
    )
  }
}