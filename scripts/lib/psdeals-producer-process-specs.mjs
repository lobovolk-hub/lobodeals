import path from 'node:path'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PRODUCERS = Object.freeze({
  collect_listing: {
    entrypoint: 'scripts/collect-psdeals-listing-edge-live-cdp.mjs',
    authorization: 'allow_collect_listing',
    effects: ['opens_edge_cdp', 'reads_psdeals_network', 'writes_workspace_artifacts'],
    timeout_ms: 45 * 60 * 1000,
    stdout_limit_bytes: 2 * 1024 * 1024,
    stderr_limit_bytes: 512 * 1024,
    allowed_env: [],
  },
  analyze_detail_candidates: {
    entrypoint: 'scripts/analyze-psdeals-discounts-fast-refresh-v1.mjs',
    authorization: 'allow_analyze_detail_candidates',
    effects: ['reads_supabase', 'writes_workspace_artifacts'],
    timeout_ms: 15 * 60 * 1000,
    stdout_limit_bytes: 2 * 1024 * 1024,
    stderr_limit_bytes: 512 * 1024,
    allowed_env: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'],
  },
  import_details: {
    entrypoint: 'scripts/import-psdeals-detail-local.mjs',
    authorization: 'allow_detail_import',
    effects: ['opens_playwright_or_edge', 'reads_psdeals_network', 'writes_supabase', 'writes_workspace_artifacts'],
    timeout_ms: 6 * 60 * 60 * 1000,
    stdout_limit_bytes: 8 * 1024 * 1024,
    stderr_limit_bytes: 4 * 1024 * 1024,
    allowed_env: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'],
  },
  retry_details: {
    entrypoint: 'scripts/import-psdeals-detail-local.mjs',
    authorization: 'allow_detail_retry',
    effects: ['opens_playwright_or_edge', 'reads_psdeals_network', 'writes_supabase', 'writes_workspace_artifacts'],
    timeout_ms: 2 * 60 * 60 * 1000,
    stdout_limit_bytes: 4 * 1024 * 1024,
    stderr_limit_bytes: 2 * 1024 * 1024,
    allowed_env: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'],
  },
  analyze_ended_deals: {
    entrypoint: 'scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs',
    authorization: 'allow_analyze_ended_deals',
    effects: ['reads_supabase', 'writes_workspace_artifacts'],
    timeout_ms: 15 * 60 * 1000,
    stdout_limit_bytes: 2 * 1024 * 1024,
    stderr_limit_bytes: 512 * 1024,
    allowed_env: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'],
  },
})

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function option(name, value) {
  return `--${name}=${value}`
}

function commonTrackedArgs(workspace, evidencePath) {
  return [
    option('local-cycle-id', workspace.identity.local_cycle_id),
    option('run-token', workspace.identity.run_token),
    option('evidence-output', evidencePath),
    option('code-revision', workspace.identity.code_revision),
    option('producer-version', '1'),
    option('evidence-mode', 'real_recorded'),
  ]
}

function paths(workspace) {
  const root = workspace.root_dir
  return {
    listing: path.join(root, 'artifacts', 'listing.json'),
    listingUrls: path.join(root, 'artifacts', 'listing-urls.txt'),
    listingEvidence: path.join(root, 'evidence', 'listing-collection.json'),
    combined: path.join(root, 'artifacts', 'combined.txt'),
    must: path.join(root, 'artifacts', 'must-refresh.txt'),
    plus: path.join(root, 'artifacts', 'ps-plus-recheck.txt'),
    stale: path.join(root, 'artifacts', 'stale.txt'),
    skipped: path.join(root, 'artifacts', 'skipped.txt'),
    fastSummary: path.join(root, 'artifacts', 'fast-refresh-summary.json'),
    fastEvidence: path.join(root, 'evidence', 'fast-refresh-analysis.json'),
    importSummary: path.join(root, 'artifacts', 'detail-import-summary.json'),
    importFailures: path.join(root, 'artifacts', 'detail-failures.txt'),
    importEvidence: path.join(root, 'evidence', 'detail-import.json'),
    retrySummary: path.join(root, 'artifacts', 'detail-retry-summary.json'),
    retryFailures: path.join(root, 'artifacts', 'detail-pending-failures.txt'),
    retryEvidence: path.join(root, 'evidence', 'detail-retry.json'),
    endedAnalysis: path.join(root, 'artifacts', 'ended-deals-analysis.json'),
    endedEvidence: path.join(root, 'evidence', 'ended-deals-analysis.json'),
  }
}

export function buildPsdealsProducerProcessSpec({
  stage,
  project_root,
  workspace,
  node_executable = process.execPath,
  listing_url = workspace?.identity?.context?.requested_url,
  pages = 1000,
  stale_limit = 500,
  ps_plus_recheck_limit = 500,
  remote_cycle_id = workspace?.identity?.remote_cycle_id,
} = {}) {
  const definition = PRODUCERS[stage]
  if (!definition) throw new Error('PROCESS_SPEC_STAGE_UNKNOWN')
  const projectRoot = path.resolve(project_root)
  const workspaceRoot = path.resolve(workspace?.root_dir || '')
  if (!inside(projectRoot, path.join(projectRoot, definition.entrypoint))) {
    throw new Error('PROCESS_SPEC_ENTRYPOINT_OUTSIDE_PROJECT')
  }
  if (!workspace?.identity?.local_cycle_id || !inside(workspaceRoot, path.join(workspaceRoot, 'artifacts'))) {
    throw new Error('PROCESS_SPEC_WORKSPACE_INVALID')
  }
  if (
    ['import_details', 'retry_details'].includes(stage) &&
    !UUID_PATTERN.test(String(remote_cycle_id || ''))
  ) {
    throw new Error('PROCESS_SPEC_REMOTE_CYCLE_ID_REQUIRED')
  }
  const p = paths(workspace)
  let args = []
  let evidencePath
  if (stage === 'collect_listing') {
    evidencePath = p.listingEvidence
    args = [
      option('url', listing_url), option('pages', pages),
      option('output-json', p.listing), option('output-txt', p.listingUrls),
    ]
  } else if (stage === 'analyze_detail_candidates') {
    evidencePath = p.fastEvidence
    args = [
      option('file', p.listing), option('output-txt', p.combined),
      option('must-output-txt', p.must), option('ps-plus-output-txt', p.plus),
      option('stale-output-txt', p.stale), option('skipped-output-txt', p.skipped),
      option('summary-output-json', p.fastSummary), option('stale-limit', stale_limit),
      option('ps-plus-recheck-limit', ps_plus_recheck_limit),
    ]
  } else if (stage === 'import_details') {
    evidencePath = p.importEvidence
    args = [
      option('file', p.combined), option('evidence-kind', 'detail_import'),
      option('remote-cycle-id', remote_cycle_id),
      option('parent-evidence', p.fastEvidence), option('summary-output-json', p.importSummary),
      option('failures-output-txt', p.importFailures),
    ]
  } else if (stage === 'retry_details') {
    evidencePath = p.retryEvidence
    args = [
      option('file', p.importFailures), option('evidence-kind', 'detail_retry'),
      option('remote-cycle-id', remote_cycle_id),
      option('parent-evidence', p.importEvidence), option('summary-output-json', p.retrySummary),
      option('failures-output-txt', p.retryFailures),
    ]
  } else if (stage === 'analyze_ended_deals') {
    evidencePath = p.endedEvidence
    args = [
      option('discounts-json', p.listing), option('output-json', p.endedAnalysis),
      option('listing-evidence', p.listingEvidence),
    ]
  }
  args.push(...commonTrackedArgs(workspace, evidencePath))
  const spec = {
    process_spec_version: 1,
    stage,
    executable: path.resolve(node_executable),
    entrypoint: path.resolve(projectRoot, definition.entrypoint),
    args,
    cwd: projectRoot,
    shell: false,
    timeout_ms: definition.timeout_ms,
    stdout_limit_bytes: definition.stdout_limit_bytes,
    stderr_limit_bytes: definition.stderr_limit_bytes,
    allowed_env: definition.allowed_env,
    inherit_all_environment: false,
    sensitive_env: ['SUPABASE_SECRET_KEY'],
    evidence_path: evidencePath,
    expected_evidence_stage: stage,
    known_effects: definition.effects,
    required_authorization: definition.authorization,
    max_attempts: 1,
    parses_logs_as_evidence: false,
    executes_process: false,
  }
  const validation = validatePsdealsProducerProcessSpec(spec, { project_root: projectRoot, workspace })
  if (!validation.valid) throw new Error(`PROCESS_SPEC_INVALID: ${validation.errors.join(',')}`)
  return spec
}

export function validatePsdealsProducerProcessSpec(spec, { project_root, workspace } = {}) {
  const errors = []
  const definition = PRODUCERS[spec?.stage]
  const expectedEntrypoint = definition && path.resolve(project_root, definition.entrypoint)
  if (!definition) errors.push('process_stage_unknown')
  if (spec?.shell !== false) errors.push('process_shell_must_be_false')
  if (spec?.executable !== path.resolve(process.execPath)) errors.push('process_executable_invalid')
  if (spec?.entrypoint !== expectedEntrypoint) errors.push('process_entrypoint_mismatch')
  if (spec?.cwd !== path.resolve(project_root)) errors.push('process_cwd_mismatch')
  if (!Array.isArray(spec?.args) || spec.args.some((value) => typeof value !== 'string')) errors.push('process_args_invalid')
  if (spec?.inherit_all_environment !== false) errors.push('process_environment_inheritance_forbidden')
  if (spec?.parses_logs_as_evidence !== false) errors.push('process_logs_cannot_be_evidence')
  if (!inside(workspace?.root_dir, spec?.evidence_path || '')) errors.push('process_evidence_outside_workspace')
  if (!Number.isSafeInteger(spec?.timeout_ms) || spec.timeout_ms <= 0) errors.push('process_timeout_invalid')
  return { valid: errors.length === 0, errors }
}

export async function executePsdealsProducerProcessSpec(
  spec,
  { run_process, verify_evidence } = {}
) {
  if (typeof run_process !== 'function' || typeof verify_evidence !== 'function') {
    throw new Error('PROCESS_EXECUTION_PORT_INCOMPLETE')
  }
  const result = await run_process({ ...spec, executes_process: true })
  const outputExceeded = Number(result?.stdout_bytes || 0) > spec.stdout_limit_bytes ||
    Number(result?.stderr_bytes || 0) > spec.stderr_limit_bytes
  if (result?.timed_out === true || outputExceeded || result?.exit_code !== 0) {
    return {
      status: 'failed',
      reason_codes: [
        ...(result?.timed_out ? ['process_timeout'] : []),
        ...(outputExceeded ? ['process_output_limit_exceeded'] : []),
        ...(result?.exit_code !== 0 ? ['process_exit_nonzero'] : []),
      ],
      exit_code: result?.exit_code ?? null,
      evidence_valid: false,
    }
  }
  const evidence = await verify_evidence(spec.evidence_path, spec.expected_evidence_stage)
  if (!evidence?.valid || evidence?.status !== 'succeeded') {
    return {
      status: evidence?.status === 'partial' ? 'partial' : 'failed',
      reason_codes: ['process_evidence_missing_or_incomplete'],
      exit_code: result.exit_code,
      evidence_valid: evidence?.valid === true,
    }
  }
  return {
    status: 'succeeded',
    reason_codes: [],
    exit_code: 0,
    evidence_valid: true,
    evidence_path: spec.evidence_path,
  }
}

export const PSDEALS_PRODUCER_PROCESS_STAGES = Object.freeze(Object.keys(PRODUCERS))
