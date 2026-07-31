import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import {
  buildPsdealsProducerProcessSpec,
  executePsdealsProducerProcessSpec,
  PSDEALS_PRODUCER_PROCESS_STAGES,
  validatePsdealsProducerProcessSpec,
} from '../scripts/lib/psdeals-producer-process-specs.mjs'

const projectRoot = path.resolve('.')
const workspace = {
  root_dir: path.join(projectRoot, 'data', 'cycles', 'local-cycle-process-fixture'),
  identity: {
    local_cycle_id: 'local-cycle-process-fixture',
    run_token: 'run_process_fixture_token_123456',
    code_revision: 'fixture',
    remote_cycle_id: '11111111-1111-4111-8111-111111111111',
    context: {
      requested_url: 'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4',
    },
  },
}

test('all five producer specs use exact entrypoints, argument arrays, and shell=false', () => {
  for (const stage of PSDEALS_PRODUCER_PROCESS_STAGES) {
    const spec = buildPsdealsProducerProcessSpec({ stage, project_root: projectRoot, workspace })
    assert.equal(spec.shell, false)
    assert.equal(spec.inherit_all_environment, false)
    assert.equal(spec.parses_logs_as_evidence, false)
    assert.equal(Array.isArray(spec.args), true)
    assert.equal(spec.args.some((value) => value.includes(workspace.identity.local_cycle_id)), true)
    assert.equal(spec.args.some((value) => value.includes(workspace.identity.run_token)), true)
    assert.equal(spec.executes_process, false)
  }
})

test('collector spec pins exact listing artifacts instead of timestamp inference', () => {
  const spec = buildPsdealsProducerProcessSpec({
    stage: 'collect_listing', project_root: projectRoot, workspace,
  })
  assert.ok(spec.args.includes(`--output-json=${path.join(workspace.root_dir, 'artifacts', 'listing.json')}`))
  assert.ok(spec.args.includes(`--output-txt=${path.join(workspace.root_dir, 'artifacts', 'listing-urls.txt')}`))
  assert.equal(spec.args.some((value) => value.startsWith('--output-prefix=')), false)
})

test('spec validation rejects shell execution, arbitrary entrypoints, and outside evidence', () => {
  const spec = buildPsdealsProducerProcessSpec({
    stage: 'import_details', project_root: projectRoot, workspace,
  })
  const invalid = validatePsdealsProducerProcessSpec({
    ...spec,
    shell: true,
    entrypoint: path.resolve('arbitrary.mjs'),
    evidence_path: path.resolve('outside.json'),
    inherit_all_environment: true,
  }, { project_root: projectRoot, workspace })
  assert.equal(invalid.valid, false)
  assert.ok(invalid.errors.includes('process_shell_must_be_false'))
  assert.ok(invalid.errors.includes('process_entrypoint_mismatch'))
  assert.ok(invalid.errors.includes('process_evidence_outside_workspace'))
})

test('exit zero without valid succeeded evidence fails closed', async () => {
  const spec = buildPsdealsProducerProcessSpec({
    stage: 'analyze_detail_candidates', project_root: projectRoot, workspace,
  })
  const missing = await executePsdealsProducerProcessSpec(spec, {
    run_process: async () => ({ exit_code: 0, stdout_bytes: 10, stderr_bytes: 0 }),
    verify_evidence: async () => ({ valid: false }),
  })
  assert.equal(missing.status, 'failed')

  const partial = await executePsdealsProducerProcessSpec(spec, {
    run_process: async () => ({ exit_code: 0, stdout_bytes: 10, stderr_bytes: 0 }),
    verify_evidence: async () => ({ valid: true, status: 'partial' }),
  })
  assert.equal(partial.status, 'partial')
})

test('timeouts and output limits cannot become succeeded', async () => {
  const spec = buildPsdealsProducerProcessSpec({
    stage: 'retry_details', project_root: projectRoot, workspace,
  })
  const timeout = await executePsdealsProducerProcessSpec(spec, {
    run_process: async () => ({ exit_code: 0, timed_out: true }),
    verify_evidence: async () => ({ valid: true, status: 'succeeded' }),
  })
  assert.equal(timeout.status, 'failed')
  assert.ok(timeout.reason_codes.includes('process_timeout'))

  const oversized = await executePsdealsProducerProcessSpec(spec, {
    run_process: async () => ({ exit_code: 0, stdout_bytes: spec.stdout_limit_bytes + 1 }),
    verify_evidence: async () => ({ valid: true, status: 'succeeded' }),
  })
  assert.equal(oversized.status, 'failed')
})
