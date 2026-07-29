import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { runPriceHistoryAuditCli } from '../scripts/audit-price-history-dependencies-local.mjs'
import {
  auditLocalPriceHistoryDependencies,
  classifyPriceHistoryReference,
} from '../scripts/lib/price-history-dependency-audit.mjs'

test('classifies detailed, snapshot, compact, and legacy summary contracts separately', () => {
  assert.equal(classifyPriceHistoryReference('public.psdeals_stage_price_history'), 'legacy_detailed_history')
  assert.equal(classifyPriceHistoryReference('public.item_price_snapshots'), 'v1_item_snapshots')
  assert.equal(classifyPriceHistoryReference('lobodeals_lowest_regular_price_amount'), 'certified_compact_lows')
  assert.equal(classifyPriceHistoryReference('lowest_ps_plus_price_amount'), 'legacy_summary_lows')
})

test('auditor scans a fixture tree without writes, SQL, or connections', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobodeals-history-audit-'))
  try {
    await fs.mkdir(path.join(root, 'app'))
    await fs.mkdir(path.join(root, 'sql'))
    await fs.writeFile(path.join(root, 'app', 'page.tsx'), 'select lowest_price_amount\n', 'utf8')
    await fs.writeFile(path.join(root, 'sql', 'schema.sql'), 'create table public.item_price_snapshots();\n', 'utf8')
    const result = await auditLocalPriceHistoryDependencies({ root_dir: root })
    assert.equal(result.reference_count, 2)
    assert.equal(result.performs_writes, false)
    assert.equal(result.opens_connections, false)
    assert.equal(result.executes_sql, false)
    assert.deepEqual(result.destructive_actions, [])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('CLI reports local audit guarantees', async () => {
  let output = ''
  const code = await runPriceHistoryAuditCli(['--root=.', '--json'], {
    stdout: (value) => { output += value },
    stderr: () => {},
  })
  assert.equal(code, 0)
  const parsed = JSON.parse(output)
  assert.equal(parsed.executes_sql, false)
  assert.deepEqual(parsed.destructive_actions, [])
})
