import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

import { evaluatePsdealsVercelManualEvidence } from '../scripts/lib/psdeals-vercel-manual-evidence.mjs'

const NOW = '2026-08-02T02:30:00-05:00'

function evidence(overrides = {}) {
  return {
    evidence_version: 1,
    observed_at: '2026-08-02T00:41:00-05:00',
    source: 'vercel_dashboard_manual',
    fluid_active_cpu_used_minutes: 211,
    fluid_active_cpu_limit_minutes: 240,
    isr_writes: 301000,
    function_invocations: 172000,
    fast_origin_transfer_gb: 5.02,
    edge_requests: 348000,
    approved_by: 'Johan',
    max_age_minutes: 180,
    ...overrides,
  }
}

test('accepts Johan manual dashboard evidence with 29 minutes of CPU margin', () => {
  const result = evaluatePsdealsVercelManualEvidence(evidence(), { now: NOW })
  assert.equal(result.valid, true)
  assert.equal(result.remaining_margin_minutes, 29)
  assert.equal(result.VERCEL_MANUAL_EVIDENCE_ACCEPTED, true)
  assert.equal(result.VERCEL_CAPACITY_WITHIN_THRESHOLD, true)
  assert.equal(result.requires_renewal_immediately_before_live_refresh, true)
})

test('rejects stale evidence, a changed limit, or CPU at the agreed threshold', () => {
  assert.ok(evaluatePsdealsVercelManualEvidence(evidence(), {
    now: '2026-08-02T03:42:00-05:00',
  }).blockers.includes('vercel_evidence_stale'))
  assert.ok(evaluatePsdealsVercelManualEvidence(evidence({
    fluid_active_cpu_limit_minutes: 300,
  }), { now: NOW }).blockers.includes('vercel_cpu_limit_invalid'))
  const threshold = evaluatePsdealsVercelManualEvidence(evidence({
    fluid_active_cpu_used_minutes: 225,
  }), { now: NOW })
  assert.ok(threshold.blockers.includes('vercel_cpu_threshold_exceeded'))
  assert.equal(threshold.VERCEL_CAPACITY_WITHIN_THRESHOLD, false)
})

test('a boolean alone can never certify Vercel capacity', () => {
  const result = evaluatePsdealsVercelManualEvidence({
    safe_margin: true,
    approved_capacity: true,
  }, { now: NOW })
  assert.equal(result.valid, false)
  assert.equal(result.VERCEL_MANUAL_EVIDENCE_ACCEPTED, false)
})

test('manual evidence template cannot pass before Johan supplies current dashboard values', async () => {
  const template = JSON.parse(await fs.readFile('config/psdeals-vercel-manual-evidence-template.json', 'utf8'))
  const result = evaluatePsdealsVercelManualEvidence(template, { now: '2026-08-02T12:00:00.000Z' })
  assert.equal(result.valid, false)
  assert.ok(result.blockers.includes('vercel_evidence_timestamp_invalid'))
  assert.ok(result.blockers.includes('vercel_cpu_used_invalid'))
})
