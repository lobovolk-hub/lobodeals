import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPsdealsStageAuthorization,
  findPsdealsStageAuthorization,
  hashPsdealsRunToken,
  PSDEALS_OPERATIONAL_STAGE_PERMISSIONS,
} from '../scripts/lib/psdeals-operational-authorization.mjs'

const workspace = {
  identity: {
    local_cycle_id: 'local-cycle-authorization-fixture',
    run_token: 'run_authorization_fixture_token_1234',
  },
}

function grant(overrides = {}) {
  return buildPsdealsStageAuthorization({
    authorization_id: 'authorization-create-cycle-fixture',
    local_cycle_id: workspace.identity.local_cycle_id,
    run_token: workspace.identity.run_token,
    stage: 'create_cycle',
    approved_by: 'Johan',
    issued_at: '2026-07-29T18:00:00.000Z',
    expires_at: '2026-07-29T19:00:00.000Z',
    ...overrides,
  })
}

test('stage authorization is cycle-bound, stage-specific, and time-bounded', () => {
  const result = findPsdealsStageAuthorization([grant()], {
    workspace,
    stage: 'create_cycle',
    now: '2026-07-29T18:30:00.000Z',
  })
  assert.equal(result.valid, true)
  assert.equal(result.authorization.permission, 'allow_create_remote_cycle')
  assert.equal(
    result.authorization.run_token_sha256,
    hashPsdealsRunToken(workspace.identity.run_token)
  )
})

test('authorization from another cycle, token, stage, or time fails closed', () => {
  const cases = [
    grant({ local_cycle_id: 'local-cycle-another-fixture' }),
    grant({ run_token: 'run_another_fixture_token_123456' }),
    grant({
      stage: 'certify',
      permission: PSDEALS_OPERATIONAL_STAGE_PERMISSIONS.certify,
    }),
  ]
  for (const value of cases) {
    assert.equal(findPsdealsStageAuthorization([value], {
      workspace,
      stage: 'create_cycle',
      now: '2026-07-29T18:30:00.000Z',
    }).valid, false)
  }
  assert.ok(findPsdealsStageAuthorization([grant()], {
    workspace,
    stage: 'create_cycle',
    now: '2026-07-29T19:00:00.000Z',
  }).errors.includes('authorization_expired'))
})

test('missing and duplicate stage grants are rejected', () => {
  assert.deepEqual(findPsdealsStageAuthorization([], {
    workspace,
    stage: 'create_cycle',
    now: '2026-07-29T18:30:00.000Z',
  }).errors, ['stage_specific_authorization_missing'])
  assert.deepEqual(findPsdealsStageAuthorization([grant(), grant()], {
    workspace,
    stage: 'create_cycle',
    now: '2026-07-29T18:30:00.000Z',
  }).errors, ['stage_specific_authorization_ambiguous'])
})
