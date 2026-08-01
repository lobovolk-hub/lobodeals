import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

import {
  PSDEALS_REMOTE_ENV_CONFIRMATION,
  PSDEALS_REMOTE_PROJECT_REF,
  validatePsdealsRemoteExecutionIntent,
} from '../scripts/lib/psdeals-remote-execution-gate.mjs'

function validIntent(overrides = {}) {
  return {
    execution_intent_version: 1,
    action: 'import_details',
    execution_mode: 'operational',
    project_ref: PSDEALS_REMOTE_PROJECT_REF,
    confirmation: 'EXECUTE_IMPORT_DETAILS',
    authorization_id: 'authorization-fixture',
    local_cycle_id: 'local-cycle-fixture-001',
    remote_cycle_id: '11111111-1111-4111-8111-111111111111',
    dry_run: false,
    ...overrides,
  }
}

const context = {
  env_confirmation: PSDEALS_REMOTE_ENV_CONFIRMATION,
  node_env: 'production',
}

test('explicit cycle-bound operational intent passes without creating a client', () => {
  const result = validatePsdealsRemoteExecutionIntent(validIntent(), context)
  assert.equal(result.valid, true)
  assert.equal(result.creates_client, false)
  assert.equal(result.executes_remote_operation, false)
})

test('missing flags, wrong project, incomplete config and test mode fail closed', () => {
  const missing = validatePsdealsRemoteExecutionIntent({}, {})
  assert.equal(missing.valid, false)
  assert.ok(missing.errors.includes('remote_execution_environment_confirmation_missing'))

  const wrongProject = validatePsdealsRemoteExecutionIntent(
    validIntent({ project_ref: 'wrong-project' }),
    context
  )
  assert.ok(wrongProject.errors.includes('remote_execution_project_mismatch'))

  const testMode = validatePsdealsRemoteExecutionIntent(validIntent(), {
    ...context,
    node_env: 'test',
  })
  assert.ok(testMode.errors.includes('remote_execution_forbidden_in_test'))
})

test('dry-run or read-only wording can never enable a mutable port', () => {
  for (const executionMode of ['dry-run', 'offline_validation', 'fixture', 'read_only']) {
    const result = validatePsdealsRemoteExecutionIntent(
      validIntent({ execution_mode: executionMode, dry_run: true }),
      context
    )
    assert.equal(result.valid, false)
    assert.ok(result.errors.includes('remote_execution_mode_not_operational'))
    assert.ok(result.errors.includes('remote_execution_dry_run_or_ambiguity_forbidden'))
  }
})

test('legacy direct demotion and cache v15 write paths are disabled before mutation', async () => {
  const [demoter, cache] = await Promise.all([
    fs.readFile('scripts/apply-psdeals-ended-discounts-safe-demotion-v1.mjs', 'utf8'),
    fs.readFile('scripts/refresh-catalog-public-cache-v15.mjs', 'utf8'),
  ])
  assert.ok(
    demoter.indexOf('LEGACY_DIRECT_DEMOTION_DISABLED') <
      demoter.indexOf("const admin = createClient")
  )
  assert.ok(
    cache.indexOf('LEGACY_CACHE_REFRESH_V15_DISABLED') <
      cache.indexOf("const admin = createClient")
  )
})

test('importer validates intent before loading credentials or creating Supabase client', async () => {
  const importer = await fs.readFile('scripts/import-psdeals-detail-local.mjs', 'utf8')
  assert.ok(
    importer.indexOf('assertPsdealsRemoteExecutionIntent({') <
      importer.indexOf("await loadKeyValueFile(path.resolve(process.cwd(), '.env.local'))")
  )
  assert.ok(
    importer.indexOf('assertPsdealsRemoteExecutionIntent({') <
      importer.indexOf('const admin = createClient')
  )
})
