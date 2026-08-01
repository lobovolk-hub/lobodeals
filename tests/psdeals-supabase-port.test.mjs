import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createPsdealsSupabaseJsPort,
  loadPsdealsSupabaseOperationalPortFromEnvironment,
} from '../scripts/lib/psdeals-supabase-port.mjs'

function fakeClient() {
  const calls = []
  const client = {
    calls,
    from(table) {
      const call = { kind: 'table', table, methods: [] }
      calls.push(call)
      const builder = {
        select(value) { call.methods.push(['select', value]); return builder },
        eq(name, value) { call.methods.push(['eq', name, value]); return builder },
        in(name, values) { call.methods.push(['in', name, values]); call.data = values.map((id) => ({ psdeals_id: id })); return builder },
        insert(value) { call.methods.push(['insert', value]); call.data = value; return builder },
        upsert(value, options) { call.methods.push(['upsert', value, options]); call.data = value; return builder },
        update(value) { call.methods.push(['update', value]); call.data = value; return builder },
        single() { call.methods.push(['single']); return builder },
        maybeSingle() { call.methods.push(['maybeSingle']); call.data = null; return builder },
        abortSignal() { call.methods.push(['abortSignal']); return builder },
        then(resolve) { resolve({ data: call.data || [], error: null }) },
      }
      return builder
    },
    rpc(name, args) {
      const call = { kind: 'rpc', name, args, methods: [] }
      calls.push(call)
      return {
        abortSignal() { call.methods.push(['abortSignal']); return this },
        then(resolve) { resolve({ data: [{ ok: true }], error: null }) },
      }
    },
  }
  return client
}

test('Supabase port construction opens no connection and keeps read/write surfaces separate', () => {
  const client = fakeClient()
  const port = createPsdealsSupabaseJsPort({ client })
  assert.equal(client.calls.length, 0)
  assert.equal(port.opens_connection_on_construction, false)
  assert.equal(typeof port.read.readCycleById, 'function')
  assert.equal(typeof port.read.readActionReceiptById, 'function')
  assert.equal(port.write.insertCycle, undefined)
  assert.equal(port.write.updateCycle, undefined)
})

test('stage lookup is bounded into batches of 500', async () => {
  const client = fakeClient()
  const port = createPsdealsSupabaseJsPort({ client })
  const ids = Array.from({ length: 1001 }, (_, index) => index + 1)
  const rows = await port.read.selectExistingStageRows(ids)
  assert.equal(rows.length, 1001)
  assert.equal(client.calls.length, 3)
  assert.deepEqual(client.calls.map((call) => call.methods.find((entry) => entry[0] === 'in')[2].length), [500, 500, 1])
})

test('write port rejects arbitrary conflict targets and direct legacy lifecycle RPC names', async () => {
  const port = createPsdealsSupabaseJsPort({ client: fakeClient() })
  await assert.rejects(
    port.write.upsertStageBatch({ conflict_target: 'id', rows: [{ id: 1 }] }),
    /UPSERT_BATCH_INVALID/
  )
  await assert.rejects(port.write.invokeAllowedRpc('arbitrary_rpc'), /RPC_NOT_ALLOWLISTED/)
  await assert.rejects(port.write.invokeAllowedRpc('certify_price_refresh_cycle'), /RPC_NOT_ALLOWLISTED/)
  await assert.rejects(port.write.invokeAllowedRpc('refresh_catalog_public_cache_v15'), /RPC_NOT_ALLOWLISTED/)
  await assert.rejects(port.write.invokeAllowedRpc('apply_psdeals_ended_deals_v1'), /RPC_NOT_ALLOWLISTED/)
  assert.deepEqual(
    await port.write.invokeAllowedRpc('refresh_catalog_public_cache_v16', { p_cycle_id: 'fixture' }),
    [{ ok: true }]
  )
  assert.deepEqual(
    await port.write.invokeAllowedRpc('apply_psdeals_ended_deals_v2', { p_cycle_id: 'fixture' }),
    [{ ok: true }]
  )
})

test('environment loader fails before client creation without explicit remote intent', async () => {
  await assert.rejects(
    loadPsdealsSupabaseOperationalPortFromEnvironment({
      env: {
        SUPABASE_URL: 'https://example.invalid',
        SUPABASE_SECRET_KEY: 'not-used',
      },
    }),
    /PSDEALS_REMOTE_EXECUTION_BLOCKED/
  )
})
