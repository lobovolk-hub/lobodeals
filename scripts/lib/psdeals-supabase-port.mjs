const WRITE_RPC_ALLOWLIST = new Set([
  'certify_price_refresh_cycle',
  'refresh_catalog_public_cache_v15',
])
const CYCLE_UPDATE_FIELDS = new Set([
  'status', 'listing_completed_at', 'details_completed_at',
  'ended_discounts_completed_at', 'monthly_games_checked_at',
  'validation_completed_at', 'validation_passed', 'items_seen', 'items_updated',
  'items_failed', 'new_items_detected', 'ended_discounts_applied',
  'failure_reason', 'metrics', 'finished_at',
])
const READ_BATCH_SIZE = 500

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function redactError(error) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown Supabase error')
  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(password|secret|api[_-]?key|service[_-]?role|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
}

async function executeBuilder(builder, timeoutMs) {
  if (typeof builder?.abortSignal !== 'function') {
    throw new Error('SUPABASE_ABORT_SIGNAL_REQUIRED')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('SUPABASE_OPERATION_TIMEOUT')), timeoutMs)
  try {
    const query = builder.abortSignal(controller.signal)
    const result = await query
    if (result?.error) throw new Error(redactError(result.error))
    return result
  } catch (error) {
    throw new Error(redactError(error))
  } finally {
    clearTimeout(timer)
  }
}

export function createPsdealsSupabaseJsPort({ client, timeout_ms = 30000 } = {}) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw new Error('SUPABASE_CLIENT_REQUIRED')
  }
  if (!Number.isSafeInteger(timeout_ms) || timeout_ms < 1000 || timeout_ms > 120000) {
    throw new Error('SUPABASE_TIMEOUT_INVALID')
  }

  const read = Object.freeze({
    async selectExistingStageRows(psdealsIds) {
      const ids = [...new Set(psdealsIds)].filter((value) => Number.isSafeInteger(value) && value > 0)
      if (ids.length === 0) return []
      const rows = []
      for (let index = 0; index < ids.length; index += READ_BATCH_SIZE) {
        const result = await executeBuilder(
          client.from('psdeals_stage_items')
            .select('id,psdeals_id,region_code,storefront,listing_last_seen_at,updated_at')
            .eq('region_code', 'us')
            .eq('storefront', 'playstation')
            .in('psdeals_id', ids.slice(index, index + READ_BATCH_SIZE)),
          timeout_ms
        )
        rows.push(...(result.data || []))
      }
      return rows
    },

    async selectStageRowsForVerification(psdealsIds, columns) {
      const safeColumns = [...new Set(['psdeals_id', ...columns])]
      if (safeColumns.some((column) => !/^[a-z][a-z0-9_]*$/.test(column))) {
        throw new Error('SUPABASE_VERIFICATION_COLUMN_INVALID')
      }
      const rows = []
      for (let index = 0; index < psdealsIds.length; index += READ_BATCH_SIZE) {
        const result = await executeBuilder(
          client.from('psdeals_stage_items')
            .select(safeColumns.join(','))
            .eq('region_code', 'us')
            .eq('storefront', 'playstation')
            .in('psdeals_id', psdealsIds.slice(index, index + READ_BATCH_SIZE)),
          timeout_ms
        )
        rows.push(...(result.data || []))
      }
      return rows
    },

    async findCyclesByLocalIdentity({ local_cycle_id, run_token_sha256 }) {
      const result = await executeBuilder(
        client.from('price_refresh_cycles')
          .select('id,region_code,storefront,cycle_date,status,started_at,finished_at,certified_at,metrics')
          .eq('region_code', 'us')
          .eq('storefront', 'playstation')
          .eq('metrics->>lobodeals_local_cycle_id', local_cycle_id)
          .eq('metrics->>lobodeals_run_token_sha256', run_token_sha256),
        timeout_ms
      )
      return result.data || []
    },

    async readCycleById(remoteCycleId) {
      const result = await executeBuilder(
        client.from('price_refresh_cycles')
          .select('*')
          .eq('id', remoteCycleId)
          .maybeSingle(),
        timeout_ms
      )
      return result.data || null
    },
  })

  const write = Object.freeze({
    async insertCycle(payload) {
      const result = await executeBuilder(
        client.from('price_refresh_cycles').insert(payload).select('*').single(),
        timeout_ms
      )
      return result.data
    },

    async upsertStageBatch(batch) {
      if (batch?.conflict_target !== 'region_code,storefront,psdeals_id' ||
          !Array.isArray(batch?.rows) || batch.rows.length < 1 || batch.rows.length > 500) {
        throw new Error('SUPABASE_UPSERT_BATCH_INVALID')
      }
      const result = await executeBuilder(
        client.from('psdeals_stage_items').upsert(batch.rows, {
          onConflict: batch.conflict_target,
          ignoreDuplicates: false,
        }).select('id,psdeals_id'),
        timeout_ms
      )
      return result.data || []
    },

    async updateCycle(remoteCycleId, payload) {
      const fields = Object.keys(payload || {})
      if (fields.length === 0 || fields.some((field) => !CYCLE_UPDATE_FIELDS.has(field))) {
        throw new Error('SUPABASE_CYCLE_UPDATE_FIELDS_INVALID')
      }
      const result = await executeBuilder(
        client.from('price_refresh_cycles').update(payload).eq('id', remoteCycleId).select('*').single(),
        timeout_ms
      )
      return result.data
    },

    async invokeAllowedRpc(name, args = {}) {
      if (!WRITE_RPC_ALLOWLIST.has(name)) throw new Error('SUPABASE_RPC_NOT_ALLOWLISTED')
      const result = await executeBuilder(client.rpc(name, args), timeout_ms)
      return result.data
    },
  })

  return Object.freeze({
    port_version: 1,
    read,
    write,
    opens_connection_on_construction: false,
    credentials_logged: false,
  })
}

export async function loadPsdealsSupabaseOperationalPortFromEnvironment({
  env = process.env,
  timeout_ms = 30000,
} = {}) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SECRET_KEY
  if (!nonEmpty(url)) throw new Error('SUPABASE_URL_MISSING')
  if (!nonEmpty(key)) throw new Error('SUPABASE_SECRET_KEY_MISSING')
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  return createPsdealsSupabaseJsPort({ client, timeout_ms })
}
