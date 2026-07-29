import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import {
  MONTHLY_EVIDENCE_EXIT_CODES,
  runMonthlyEvidenceCli,
} from '../scripts/record-psdeals-monthly-evidence-offline.mjs'
import { buildPsdealsArtifactReference } from '../scripts/lib/psdeals-evidence-envelope.mjs'
import {
  buildMonthlyGamesCheckEvidence,
  validatePsdealsProducerEvidence,
} from '../scripts/lib/psdeals-evidence-producers.mjs'
import { initializePsdealsCycleWorkspace } from '../scripts/lib/psdeals-cycle-workspace.mjs'

const NOW = '2026-07-29T18:05:00.000Z'
const CONTEXT = {
  requested_url: 'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc',
  platforms: ['PS5', 'PS4'],
  content_types: ['games', 'bundles', 'dlc'],
  order: 'best-new-deals',
}
let root

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobodeals-monthly-'))
})
after(async () => fs.rm(root, { recursive: true, force: true }))

function input(overrides = {}) {
  return {
    identity: {
      local_cycle_id: 'local-cycle-monthly-0001',
      run_token: 'run_monthly_fixture_token_0001',
      remote_cycle_id: null,
      region_code: 'us',
      storefront: 'playstation',
      mode: 'offline_fixture',
    },
    producer: { name: 'monthly-review', version: '1', code_revision: 'fixture' },
    timestamps: {
      started_at: '2026-07-29T18:01:00.000Z',
      finished_at: '2026-07-29T18:02:00.000Z',
      generated_at: '2026-07-29T18:02:00.000Z',
    },
    context: CONTEXT,
    outputs: [
      buildPsdealsArtifactReference({
        role: 'monthly_games_review',
        path: 'artifacts/monthly-review.json',
        sha256: 'a'.repeat(64),
        size_bytes: 10,
        artifact_kind: 'monthly_games_review',
        final_state: 'final',
      }),
    ],
    review: {
      source_type: 'manual_official_source_review',
      source_reference: 'fixture://official-source-review',
      procedure: 'compare-active-monthly-allowlist',
      procedure_version: '1',
      result: 'no_changes',
      proposed_changes: [],
      application_performed: false,
    },
    ...overrides,
  }
}

test('valid no-changes review is semantic evidence and never applies changes', () => {
  const evidence = buildMonthlyGamesCheckEvidence(input())
  const validation = validatePsdealsProducerEvidence(evidence, { now: NOW })
  assert.equal(validation.valid, true)
  assert.equal(evidence.status, 'succeeded')
  assert.equal(evidence.payload.application_performed, false)
})

test('a timestamp without source, procedure, and artifact is indeterminate', () => {
  const evidence = buildMonthlyGamesCheckEvidence(input({
    outputs: [],
    review: {
      result: 'indeterminate',
      proposed_changes: [],
      application_performed: false,
    },
  }))
  assert.equal(evidence.status, 'indeterminate')
  assert.ok(evidence.reason_codes.includes('MONTHLY_SEMANTIC_EVIDENCE_MISSING'))
  assert.ok(evidence.reason_codes.includes('MONTHLY_EVIDENCE_ARTIFACT_MISSING'))
})

test('proposed changes remain pending and do not claim application', () => {
  const value = input()
  value.review.result = 'proposed_changes'
  value.review.proposed_changes = [{ action: 'review_only_fixture' }]
  const evidence = buildMonthlyGamesCheckEvidence(value)
  assert.equal(evidence.status, 'partial')
  assert.equal(evidence.payload.proposed_change_count, 1)
  assert.equal(evidence.payload.application_performed, false)
  assert.ok(evidence.reason_codes.includes('MONTHLY_CHANGES_PENDING_APPLICATION'))
})

test('attempting to claim application makes producer evidence inconsistent', () => {
  const value = input()
  value.review.application_performed = true
  const evidence = buildMonthlyGamesCheckEvidence(value)
  assert.equal(evidence.payload.application_performed, false)
  assert.equal(validatePsdealsProducerEvidence(evidence, { now: NOW }).valid, false)
})

test('offline CLI records a hashed review already inside the workspace', async () => {
  const workspace = await initializePsdealsCycleWorkspace({
    cycles_root: path.join(root, 'cycles'),
    mode: 'fixture',
    code_revision: 'fixture',
    context: CONTEXT,
    now: () => new Date('2026-07-29T18:00:00.000Z'),
    generate_local_cycle_id: () => 'local-cycle-monthly-cli-0001',
    generate_run_token: () => 'run_monthly_cli_fixture_token_0001',
  })
  await fs.writeFile(
    path.join(workspace.root_dir, 'artifacts', 'monthly-review.json'),
    '{"fixture":true}\n',
    'utf8'
  )
  let output = ''
  let error = ''
  const code = await runMonthlyEvidenceCli([
    `--workspace=${workspace.root_dir}`,
    '--review=artifacts/monthly-review.json',
    '--output=evidence/monthly-games-check.json',
    '--started-at=2026-07-29T18:01:00.000Z',
    '--finished-at=2026-07-29T18:02:00.000Z',
    '--generated-at=2026-07-29T18:02:00.000Z',
    '--source-type=manual_official_source_review',
    '--source-reference=fixture://official-source-review',
    '--procedure=compare-active-monthly-allowlist',
    '--procedure-version=1',
    '--result=no_changes',
  ], {
    stdout: (value) => { output += value },
    stderr: (value) => { error += value },
  })
  assert.equal(code, MONTHLY_EVIDENCE_EXIT_CODES.success, error)
  assert.match(output, /"application_performed": false/)
  const evidence = JSON.parse(
    await fs.readFile(path.join(workspace.root_dir, 'evidence', 'monthly-games-check.json'), 'utf8')
  )
  assert.equal(evidence.status, 'succeeded')
  assert.equal(evidence.outputs[0].sha256.length, 64)
})
