export const PSDEALS_VERCEL_MANUAL_EVIDENCE_VERSION = 1
export const PSDEALS_VERCEL_CPU_LIMIT_MINUTES = 240
export const PSDEALS_VERCEL_CPU_THRESHOLD_MINUTES = 225
export const PSDEALS_VERCEL_MINIMUM_MARGIN_MINUTES = 15

function timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0
}

function suppliedNumber(value) {
  if (value === null || value === undefined) return Number.NaN
  if (typeof value === 'string' && !value.trim()) return Number.NaN
  return Number(value)
}

export function evaluatePsdealsVercelManualEvidence(
  evidenceInput,
  { now = new Date().toISOString() } = {}
) {
  const evidence = evidenceInput && typeof evidenceInput === 'object' ? evidenceInput : {}
  const blockers = []
  const observedAt = timestamp(evidence.observed_at)
  const nowDate = timestamp(now)
  const maxAge = suppliedNumber(evidence.max_age_minutes)
  const used = suppliedNumber(evidence.fluid_active_cpu_used_minutes)
  const limit = suppliedNumber(evidence.fluid_active_cpu_limit_minutes)
  const margin = limit - used

  if (evidence.evidence_version !== PSDEALS_VERCEL_MANUAL_EVIDENCE_VERSION) {
    blockers.push('vercel_evidence_version_invalid')
  }
  if (evidence.source !== 'vercel_dashboard_manual') blockers.push('vercel_evidence_source_invalid')
  if (evidence.approved_by !== 'Johan') blockers.push('vercel_evidence_approver_invalid')
  if (!observedAt || !nowDate || observedAt > nowDate) blockers.push('vercel_evidence_timestamp_invalid')
  if (!Number.isSafeInteger(maxAge) || maxAge < 1 || maxAge > 180) {
    blockers.push('vercel_evidence_max_age_invalid')
  } else if (observedAt && nowDate && nowDate - observedAt > maxAge * 60_000) {
    blockers.push('vercel_evidence_stale')
  }
  if (!Number.isSafeInteger(used) || used < 0) blockers.push('vercel_cpu_used_invalid')
  if (limit !== PSDEALS_VERCEL_CPU_LIMIT_MINUTES) blockers.push('vercel_cpu_limit_invalid')
  if (Number.isSafeInteger(used) && used >= PSDEALS_VERCEL_CPU_THRESHOLD_MINUTES) {
    blockers.push('vercel_cpu_threshold_exceeded')
  }
  if (Number.isFinite(margin) && margin < PSDEALS_VERCEL_MINIMUM_MARGIN_MINUTES) {
    blockers.push('vercel_cpu_margin_insufficient')
  }
  for (const field of [
    'isr_writes',
    'function_invocations',
    'fast_origin_transfer_gb',
    'edge_requests',
  ]) {
    if (!finiteNonNegative(suppliedNumber(evidence[field]))) blockers.push(`vercel_${field}_invalid`)
  }

  const uniqueBlockers = [...new Set(blockers)]
  return {
    evidence_version: PSDEALS_VERCEL_MANUAL_EVIDENCE_VERSION,
    valid: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    observed_at: evidence.observed_at || null,
    age_minutes: observedAt && nowDate ? Math.floor((nowDate - observedAt) / 60_000) : null,
    max_age_minutes: Number.isFinite(maxAge) ? maxAge : null,
    fluid_active_cpu_used_minutes: Number.isFinite(used) ? used : null,
    fluid_active_cpu_limit_minutes: Number.isFinite(limit) ? limit : null,
    fluid_active_cpu_threshold_minutes: PSDEALS_VERCEL_CPU_THRESHOLD_MINUTES,
    remaining_margin_minutes: Number.isFinite(margin) ? margin : null,
    VERCEL_MANUAL_EVIDENCE_ACCEPTED: uniqueBlockers.length === 0,
    VERCEL_CAPACITY_WITHIN_THRESHOLD:
      uniqueBlockers.length === 0 && used < PSDEALS_VERCEL_CPU_THRESHOLD_MINUTES &&
      margin >= PSDEALS_VERCEL_MINIMUM_MARGIN_MINUTES,
    requires_renewal_immediately_before_live_refresh: true,
    executes_remote_operation: false,
  }
}
