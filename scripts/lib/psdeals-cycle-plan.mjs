export const PSDEALS_DAILY_CYCLE_STEPS = Object.freeze([
  {
    name: 'create_cycle',
    scope: 'supabase',
    requires_future_authorization: true,
    critical_gate: null,
  },
  {
    name: 'collect_listing',
    scope: 'external_local',
    requires_future_authorization: true,
    critical_gate: null,
  },
  {
    name: 'validate_listing',
    scope: 'local',
    requires_future_authorization: false,
    critical_gate: null,
  },
  {
    name: 'build_partial_payload',
    scope: 'local',
    requires_future_authorization: false,
    critical_gate: 'listing_complete',
  },
  {
    name: 'upsert_listing',
    scope: 'supabase',
    requires_future_authorization: true,
    critical_gate: 'listing_complete',
  },
  {
    name: 'analyze_detail_candidates',
    scope: 'local_and_supabase',
    requires_future_authorization: true,
    critical_gate: 'listing_complete',
  },
  {
    name: 'import_details',
    scope: 'external_and_supabase',
    requires_future_authorization: true,
    critical_gate: 'listing_complete',
  },
  {
    name: 'retry_details',
    scope: 'external_and_supabase',
    requires_future_authorization: true,
    critical_gate: null,
  },
  {
    name: 'check_monthly_games',
    scope: 'external_and_supabase',
    requires_future_authorization: true,
    critical_gate: null,
  },
  {
    name: 'analyze_ended_deals',
    scope: 'local_and_supabase',
    requires_future_authorization: true,
    critical_gate: 'listing_complete',
  },
  {
    name: 'apply_ended_deals',
    scope: 'supabase',
    requires_future_authorization: true,
    critical_gate: 'can_demote',
  },
  {
    name: 'validate_cycle',
    scope: 'local_and_supabase',
    requires_future_authorization: true,
    critical_gate: null,
  },
  {
    name: 'mark_succeeded',
    scope: 'supabase',
    requires_future_authorization: true,
    critical_gate: 'can_mark_succeeded',
  },
  {
    name: 'certify',
    scope: 'supabase',
    requires_future_authorization: true,
    critical_gate: 'can_certify',
  },
  {
    name: 'refresh_cache',
    scope: 'production_supabase',
    requires_future_authorization: true,
    critical_gate: 'can_refresh_cache',
  },
  {
    name: 'validate_public',
    scope: 'production_readonly',
    requires_future_authorization: true,
    critical_gate: 'can_refresh_cache',
  },
  {
    name: 'record_metrics',
    scope: 'supabase',
    requires_future_authorization: true,
    critical_gate: 'can_refresh_cache',
  },
])

function namesSet(values) {
  return new Set(Array.isArray(values) ? values.filter((value) => typeof value === 'string') : [])
}

export function buildPsdealsDailyCyclePlan({
  completed_steps: completedInput = [],
  failed_steps: failedInput = [],
  gates = {},
} = {}) {
  const completed = namesSet(completedInput)
  const failed = namesSet(failedInput)
  const knownNames = new Set(PSDEALS_DAILY_CYCLE_STEPS.map((step) => step.name))
  const unknownSteps = [...new Set([...completed, ...failed])].filter(
    (name) => !knownNames.has(name)
  )
  const plan = []
  let previousCompleted = true
  let blockedBy = null

  for (const [index, definition] of PSDEALS_DAILY_CYCLE_STEPS.entries()) {
    const gateOpen =
      definition.critical_gate == null || gates[definition.critical_gate] === true
    let status = 'blocked'
    let reason_code = null

    if (!previousCompleted) {
      status = 'blocked'
      reason_code = blockedBy ? 'blocked_by_previous_step' : 'previous_step_not_completed'
    } else if (!gateOpen) {
      status = 'blocked'
      reason_code = `gate_${definition.critical_gate}_closed`
      previousCompleted = false
      blockedBy = definition.name
    } else if (failed.has(definition.name)) {
      status = 'failed'
      reason_code = 'step_reported_failed'
      previousCompleted = false
      blockedBy = definition.name
    } else if (completed.has(definition.name)) {
      status = 'completed'
    } else {
      status = 'ready'
      reason_code = 'awaiting_execution'
      previousCompleted = false
      blockedBy = definition.name
    }

    plan.push({
      order: index + 1,
      ...definition,
      status,
      reason_code,
    })
  }

  return {
    valid_input: unknownSteps.length === 0,
    unknown_steps: unknownSteps,
    executes_commands: false,
    opens_connections: false,
    plan,
  }
}
