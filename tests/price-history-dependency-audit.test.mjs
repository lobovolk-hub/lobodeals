import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { runPriceHistoryAuditCli } from '../scripts/audit-price-history-dependencies-local.mjs'
import {
  auditLocalPriceHistoryDependencies,
  classifyDetailedHistoryPath,
  classifyPriceHistoryReference,
  containsDetailedPriceHistoryReference,
} from '../scripts/lib/price-history-dependency-audit.mjs'

test('classifies detailed, snapshot, compact, and legacy summary contracts separately', () => {
  assert.equal(classifyPriceHistoryReference('public.psdeals_stage_price_history'), 'legacy_detailed_history')
  assert.equal(classifyPriceHistoryReference('public.item_price_snapshots'), 'v1_item_snapshots')
  assert.equal(classifyPriceHistoryReference('lobodeals_lowest_regular_price_amount'), 'certified_compact_lows')
  assert.equal(classifyPriceHistoryReference('lowest_ps_plus_price_amount'), 'legacy_summary_lows')
})

test('detects direct and same-line constructed detailed-history names', () => {
  assert.equal(containsDetailedPriceHistoryReference('psdeals_stage_price_history'), true)
  assert.equal(containsDetailedPriceHistoryReference("'psdeals_stage_' + 'price_history'"), true)
  assert.equal(containsDetailedPriceHistoryReference('hasPriceHistory'), false)
  assert.equal(classifyDetailedHistoryPath('scripts/import-psdeals-detail-local.mjs'), 'runtime_violation')
  assert.equal(classifyDetailedHistoryPath('sql/006-lobodeals-3-restrictive-price-history-retirement.sql'), 'historical_sql_contract')
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

test('auditor fails closed on a runtime reference outside the contractual allowlist', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobodeals-history-runtime-audit-'))
  try {
    await fs.mkdir(path.join(root, 'scripts'))
    await fs.writeFile(
      path.join(root, 'scripts', 'runtime.mjs'),
      "const table = 'psdeals_stage_' + 'price_history'\n",
      'utf8'
    )
    const result = await auditLocalPriceHistoryDependencies({ root_dir: root })
    assert.equal(result.runtime_violations.length, 1)
    assert.equal(result.runtime_violations[0].disposition, 'runtime_violation')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('repository contains no runtime reader or writer for retired detailed history', async () => {
  const result = await auditLocalPriceHistoryDependencies({ root_dir: '.' })
  assert.deepEqual(result.runtime_violations, [])
  assert.deepEqual(result.runtime_readers, [])
  assert.deepEqual(result.runtime_writers, [])
  assert.ok(result.detailed_history_references.length > 0)
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
