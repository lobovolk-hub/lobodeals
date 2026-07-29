import assert from 'node:assert/strict'
import test from 'node:test'

import { assessPsdealsLifecycleContracts } from '../scripts/lib/psdeals-cycle-operational-adapters.mjs'
import { evaluatePsdealsControlledLiveReadiness } from '../scripts/lib/psdeals-live-readiness.mjs'
import {
  buildPsdealsPublicValidationPlan,
  executePsdealsPublicValidation,
} from '../scripts/lib/psdeals-public-validation.mjs'

test('public validation uses a bounded read-only sample and fake HTTP port', async () => {
  const plan = buildPsdealsPublicValidationPlan({
    detail_slugs: ['fixture-one', 'fixture-two'],
  })
  assert.equal(plan.executes_requests, false)
  assert.equal(plan.requests.length, 5)
  const result = await executePsdealsPublicValidation(plan, {
    fetch_page: async ({ url }) => ({
      status: 200,
      body: url.includes('/deals') ? '<main>Deals</main>' : '<main>OK</main>',
      body_bytes: 20,
    }),
  })
  assert.equal(result.status, 'succeeded')
  assert.equal(result.external_action_performed, false)
})

test('failed status or missing marker blocks public validation', async () => {
  const plan = buildPsdealsPublicValidationPlan()
  const result = await executePsdealsPublicValidation(plan, {
    fetch_page: async ({ url }) => ({ status: url.includes('/catalog') ? 500 : 200, body: '' }),
  })
  assert.equal(result.status, 'failed')
  assert.equal(result.failed > 0, true)
})

test('live readiness stays NOT_READY even after successful read-only verification', () => {
  const lifecycle = assessPsdealsLifecycleContracts({
    objects: { price_refresh_cycles: { exists: true } },
    functions: {
      certify_price_refresh_cycle: { definition_verified: true },
      refresh_catalog_public_cache_v15: { independent_receipt_supported: false },
    },
  })
  const result = evaluatePsdealsControlledLiveReadiness({
    preflight: {
      valid: true,
      read_only_verified: true,
      blockers: [
        { code: 'PREFLIGHT_CREATE_CYCLE_RECONCILIATION_CONTRACT_MISSING' },
        { code: 'PREFLIGHT_CACHE_RECONCILIATION_CONTRACT_MISSING' },
      ],
    },
    lifecycle_contracts: lifecycle,
    producer_specs_ready: true,
    wrapper_ready: true,
    public_validation_ready: true,
  })
  assert.equal(result.classification, 'NOT_READY')
  assert.equal(result.authorizes_execution, false)
  assert.ok(result.blockers.includes('monthly_source_not_authorized'))
  assert.ok(result.blockers.includes('demotion_reconciliation_contract_not_ready'))
})
