export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type SyncLogRow = {
  id: string
  job_type: string
  status: string
  started_at: string
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for internal public cache refresh')
  }

  return createClient(url, serviceRole)
}

function isAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const token = process.env.INTERNAL_REFRESH_TOKEN || ''

  if (!token) {
    throw new Error('Missing INTERNAL_REFRESH_TOKEN')
  }

  return authHeader === `Bearer ${token}`
}

async function createSyncLog(jobType: string, notes: string) {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('sync_logs')
    .insert({
      job_type: jobType,
      status: 'running',
      notes,
      items_processed: 0,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`createSyncLog failed: ${error.message}`)
  }

  return data as { id: string }
}

async function finishSyncLog(
  logId: string,
  status: 'success' | 'error' | 'skipped',
  notes: string
) {
  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('sync_logs')
    .update({
      status,
      notes,
      finished_at: new Date().toISOString(),
    })
    .eq('id', logId)

  if (error) {
    throw new Error(`finishSyncLog failed: ${error.message}`)
  }
}

async function findRunningPipelineJobs() {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('sync_logs')
    .select('id, job_type, status, started_at')
    .in('job_type', ['steam_appdetails_enrich', 'steam_price_backfill_us'])
    .eq('status', 'running')
    .gte('started_at', new Date(Date.now() - 1000 * 60 * 90).toISOString())
    .order('started_at', { ascending: false })

  if (error) {
    throw new Error(`findRunningPipelineJobs failed: ${error.message}`)
  }

  return Array.isArray(data) ? (data as SyncLogRow[]) : []
}

export async function POST(request: Request) {
  let logId: string | null = null

  try {
    const hasAuthHeader = !!request.headers.get('authorization')

    if (hasAuthHeader && !isAuthorized(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const runningJobs = await findRunningPipelineJobs()

    if (runningJobs.length > 0) {
      return Response.json({
        success: true,
        skipped: true,
        reason: 'Pipeline job still running',
        runningJobs,
      })
    }

    const log = await createSyncLog(
      'public_cache_refresh',
      'Public cache refresh started'
    )
    logId = log.id

    const supabase = getServiceSupabase()

    const { error: pcError } = await supabase.rpc('refresh_pc_public_catalog_cache')
    if (pcError) {
      throw new Error(`refresh_pc_public_catalog_cache failed: ${pcError.message}`)
    }

    const { error: catalogError } = await supabase.rpc('refresh_catalog_public_cache')
    if (catalogError) {
      throw new Error(`refresh_catalog_public_cache failed: ${catalogError.message}`)
    }

    await finishSyncLog(
      logId,
      'success',
      'Public cache refresh finished successfully'
    )

    return Response.json({
      success: true,
      skipped: false,
      refreshed: ['pc_public_catalog_cache', 'catalog_public_cache'],
    })
  } catch (error) {
    console.error('internal-refresh-public-caches error', error)

    if (logId) {
      try {
        await finishSyncLog(
          logId,
          'error',
          error instanceof Error ? error.message : 'Unknown public cache refresh error'
        )
      } catch {
        // no-op
      }
    }

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown public cache refresh error',
      },
      { status: 500 }
    )
  }
}