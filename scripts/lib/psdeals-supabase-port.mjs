const WRITE_RPC_ALLOWLIST = new Set([
  'begin_psdeals_cycle_action_v1',
  'finish_psdeals_cycle_action_v1',
  'create_or_reconcile_price_refresh_cycle_v1',
  'record_psdeals_listing_completion_v1',
  'record_psdeals_monthly_check_v1',
  'apply_psdeals_ended_deals_v1',
  'mark_psdeals_price_refresh_cycle_succeeded_v1',
  'certify_price_refresh_cycle_v3',
  'refresh_catalog_public_cache_v16',
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
      if (!/^local-cycle-[a-z0-9][a-z0-9_-]{7,}$/.test(String(local_cycle_id || '')) ||
          !/^[a-f0-9]{64}$/.test(String(run_token_sha256 || ''))) {
        throw new Error('SUPABASE_CYCLE_LOCAL_IDENTITY_INVALID')
      }
      const rows = []
      for (const [column, value] of [
        ['local_cycle_id', local_cycle_id],
        ['run_token_sha256', run_token_sha256],
      ]) {
        const result = await executeBuilder(
          client.from('price_refresh_cycles')
            .select('id,local_cycle_id,run_token_sha256,code_revision,filter_fingerprint,manifest_hash,mode,region_code,storefront,cycle_date,status,started_at,finished_at,certified_at')
            .eq('region_code', 'us')
            .eq('storefront', 'playstation')
            .eq(column, value),
          timeout_ms
        )
        rows.push(...(result.data || []))
      }
      return [...new Map(rows.map((row) => [row.id, row])).values()]
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

    async readActionReceiptById(receiptId) {
      const result = await executeBuilder(
        client.from('psdeals_cycle_action_receipts')
          .select('*')
          .eq('id', receiptId)
          .maybeSingle(),
        timeout_ms
      )
      return result.data || null
    },

    async findActionReceiptByIdempotencyKey(idempotencyKey) {
      const result = await executeBuilder(
        client.from('psdeals_cycle_action_receipts')
          .select('*')
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle(),
        timeout_ms
      )
      return result.data || null
    },
  })

  const write = Object.freeze({
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
  execution_intent,
} = {}) {
  assertPsdealsRemoteExecutionIntent(execution_intent, {
    env_confirmation: env.LOBODEALS_REMOTE_EXECUTION,
    node_env: env.NODE_ENV,
  })
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
import { assertPsdealsRemoteExecutionIntent } from './psdeals-remote-execution-gate.mjs'
