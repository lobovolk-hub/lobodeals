import { sha256PsdealsBytes } from './psdeals-evidence-envelope.mjs'

export const PSDEALS_OPERATIONAL_AUTHORIZATION_VERSION = 1

export const PSDEALS_OPERATIONAL_STAGE_PERMISSIONS = Object.freeze({
  create_cycle: 'allow_create_remote_cycle',
  collect_listing: 'allow_collect_listing',
  upsert_listing: 'allow_stage_upsert',
  analyze_detail_candidates: 'allow_analyze_detail_candidates',
  import_details: 'allow_detail_import',
  retry_details: 'allow_detail_retry',
  check_monthly_games: 'allow_monthly_record',
  analyze_ended_deals: 'allow_analyze_ended_deals',
  validate_cycle: 'allow_remote_cycle_validation',
  mark_succeeded: 'allow_mark_succeeded',
  certify: 'allow_certify',
  refresh_cache: 'allow_refresh_cache',
  validate_public: 'allow_public_validation',
  record_metrics: 'allow_record_metrics',
})

const HASH_PATTERN = /^[a-f0-9]{64}$/

function timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function hashPsdealsRunToken(runToken) {
  if (!nonEmpty(runToken)) throw new Error('AUTHORIZATION_RUN_TOKEN_REQUIRED')
  return sha256PsdealsBytes(runToken)
}

export function buildPsdealsStageAuthorization({
  authorization_id,
  local_cycle_id,
  run_token,
  stage,
  permission = PSDEALS_OPERATIONAL_STAGE_PERMISSIONS[stage],
  approved_by,
  issued_at,
  expires_at,
  source = 'operator_input',
} = {}) {
  return {
    authorization_version: PSDEALS_OPERATIONAL_AUTHORIZATION_VERSION,
    authorization_id,
    local_cycle_id,
    run_token_sha256: hashPsdealsRunToken(run_token),
    stage,
    permission,
    approved_by,
    issued_at,
    expires_at,
    source,
  }
}

export function validatePsdealsStageAuthorization(
  authorization,
  { workspace, stage, now } = {}
) {
  const errors = []
  const permission = PSDEALS_OPERATIONAL_STAGE_PERMISSIONS[stage]
  const nowDate = timestamp(now)
  const issuedAt = timestamp(authorization?.issued_at)
  const expiresAt = timestamp(authorization?.expires_at)

  if (authorization?.authorization_version !== PSDEALS_OPERATIONAL_AUTHORIZATION_VERSION) {
    errors.push('authorization_version_invalid')
  }
  if (!nonEmpty(authorization?.authorization_id)) errors.push('authorization_id_missing')
  if (!permission || authorization?.stage !== stage) errors.push('authorization_stage_mismatch')
  if (authorization?.permission !== permission) errors.push('authorization_permission_mismatch')
  if (authorization?.local_cycle_id !== workspace?.identity?.local_cycle_id) {
    errors.push('authorization_cycle_mismatch')
  }
  const expectedTokenHash = workspace?.identity?.run_token
    ? hashPsdealsRunToken(workspace.identity.run_token)
    : null
  if (!HASH_PATTERN.test(String(authorization?.run_token_sha256 || '')) ||
      authorization?.run_token_sha256 !== expectedTokenHash) {
    errors.push('authorization_run_token_mismatch')
  }
  if (!issuedAt || !expiresAt || !nowDate || expiresAt <= issuedAt) {
    errors.push('authorization_timestamp_invalid')
  } else {
    if (nowDate < issuedAt) errors.push('authorization_not_yet_valid')
    if (nowDate >= expiresAt) errors.push('authorization_expired')
  }
  if (!nonEmpty(authorization?.approved_by)) errors.push('authorization_approver_missing')
  if (authorization?.source !== 'operator_input') errors.push('authorization_source_invalid')

  return {
    valid: errors.length === 0,
    stage,
    permission,
    authorization_id: authorization?.authorization_id || null,
    errors,
  }
}

export function findPsdealsStageAuthorization(
  authorizations,
  { workspace, stage, now } = {}
) {
  const candidates = Array.isArray(authorizations)
    ? authorizations.filter((value) => value?.stage === stage)
    : []
  if (candidates.length !== 1) {
    return {
      valid: false,
      authorization: null,
      errors: [
        candidates.length === 0
          ? 'stage_specific_authorization_missing'
          : 'stage_specific_authorization_ambiguous',
      ],
    }
  }
  const validation = validatePsdealsStageAuthorization(candidates[0], {
    workspace,
    stage,
    now,
  })
  return {
    ...validation,
    authorization: validation.valid ? candidates[0] : null,
  }
}
