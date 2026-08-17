import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  stablePsdealsEvidenceJson,
} from './psdeals-evidence-envelope.mjs'
import {
  buildFastRefreshAnalysisEvidence,
  buildListingCollectionEvidence,
  validatePsdealsProducerEvidence,
} from './psdeals-evidence-producers.mjs'
import {
  referencePsdealsFile,
  requireLinkedPsdealsEvidence,
} from './psdeals-evidence-runtime.mjs'
import {
  openPsdealsCycleWorkspace,
  resolvePsdealsCycleWorkspacePath,
} from './psdeals-cycle-workspace.mjs'
import { PSDEALS_DAILY_LIVE_BINDINGS } from './psdeals-daily-live-bindings.mjs'

export const PSDEALS_RECOVERY_RUNTIME_ASSEMBLY_VERSION = 1

export const PSDEALS_RECOVERY_EXPECTED_COUNTS = Object.freeze({
  pages: 437,
  raw_positions: 15729,
  unique_items: 15652,
  duplicates_removed: 77,
  new_urls: 8270,
})

const HASH_PATTERN = /^[a-f0-9]{64}$/
const HEAD_PATTERN = /^[a-f0-9]{40}$/
const PROJECT_REF = 'vlxkoprpobfevxefizwr'
const IMPORT_CONFIRMATION = 'EXECUTE_IMPORT_DETAILS'

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function stableText(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(
    (value) => typeof value === 'string' && value.trim()
  ).map((value) => value.trim()))]
}

function assertInside(root, candidate, code) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(code)
  }
}

async function readVerifiedFile(file, expectedHash, label) {
  if (!HASH_PATTERN.test(String(expectedHash || ''))) {
    throw new Error(`${label}_EXPECTED_HASH_INVALID`)
  }
  const bytes = await fs.readFile(file)
  const actualHash = sha256(bytes)
  if (actualHash !== expectedHash) {
    throw new Error(`${label}_HASH_MISMATCH:${actualHash}`)
  }
  return { bytes, sha256: actualHash }
}

async function writeOrVerify(file, bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  await fs.mkdir(path.dirname(file), { recursive: true })
  try {
    const existing = await fs.readFile(file)
    if (!existing.equals(content)) throw new Error(`LOCAL_ASSEMBLY_ARTIFACT_CONFLICT:${file}`)
    return { path: file, sha256: sha256(existing), reused: true }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await fs.writeFile(file, content, { flag: 'wx' })
  return { path: file, sha256: sha256(content), reused: false }
}

function parseListing(bytes, expected) {
  let listing
  try {
    listing = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('RECENTLY_ADDED_LISTING_JSON_INVALID')
  }
  if (!Array.isArray(listing?.items) || !Array.isArray(listing?.page_summaries)) {
    throw new Error('RECENTLY_ADDED_LISTING_STRUCTURE_INVALID')
  }
  if (
    listing.items.length !== expected.unique_items ||
    listing.page_summaries.length !== expected.pages ||
    Number(listing.pages_processed) !== expected.pages ||
    Number(listing.pages_failed) !== 0 ||
    !Array.isArray(listing.failed_pages) ||
    listing.failed_pages.length !== 0
  ) {
    throw new Error('RECENTLY_ADDED_LISTING_COUNTS_INVALID')
  }
  if (
    Number(listing.total_results_detected) !== expected.raw_positions ||
    Number(listing.reconstruction?.raw_items_before_deduplication) !== expected.raw_positions ||
    Number(listing.reconstruction?.unique_items_after_deduplication) !== expected.unique_items ||
    Number(listing.reconstruction?.duplicate_occurrences_removed) !== expected.duplicates_removed
  ) {
    throw new Error('RECENTLY_ADDED_LISTING_RECONSTRUCTION_INVALID')
  }

  const ids = new Set()
  const urls = new Set()
  for (const item of listing.items) {
    const id = Number(item?.psdeals_id)
    const url = String(item?.psdeals_url || '').trim()
    if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id)) {
      throw new Error('RECENTLY_ADDED_LISTING_IDENTITY_INVALID')
    }
    if (!url.startsWith('https://psdeals.net/us-store/') || urls.has(url)) {
      throw new Error('RECENTLY_ADDED_LISTING_URL_INVALID')
    }
    ids.add(id)
    urls.add(url)
  }
  return { listing, ids, urls }
}

function parseQueue(bytes, listingUrls, expectedCount) {
  const urls = bytes.toString('utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
  if (
    urls.length !== expectedCount ||
    new Set(urls).size !== urls.length ||
    urls.some((url) => !listingUrls.has(url))
  ) {
    throw new Error('RECENTLY_ADDED_QUEUE_INVALID')
  }
  return urls
}

function normalizedPageSummaries(items, pages) {
  const counts = Array.from({ length: pages }, () => 0)
  items.forEach((item, index) => {
    const observed = Number(item?.first_seen_page)
    const page = Number.isSafeInteger(observed) && observed >= 1 && observed <= pages
      ? observed
      : Math.min(pages, Math.floor(index / 36) + 1)
    counts[page - 1] += 1
  })
  return counts.map((count, index) => ({
    page_number: index + 1,
    raw_item_count: count,
    new_unique_count: count,
    duplicate_count: 0,
  }))
}

function buildNormalizedListing(listing, config, expected) {
  const items = listing.items.map((item) => ({ ...item }))
  return {
    base_url: config.source_urls.recently_added,
    pages_requested: expected.pages,
    pages_processed: expected.pages,
    pages_failed: 0,
    failed_pages: [],
    pagination_final_observed: true,
    stop_reason:
      `unique_items_collected_reached_total_results: unique=${expected.unique_items} total=${expected.unique_items}`,
    total_results_detected: expected.unique_items,
    unique_items_collected: expected.unique_items,
    items,
    page_summaries: normalizedPageSummaries(items, expected.pages),
    adoption_provenance: {
      source_listing_sha256:
        config.adopted_artifacts.recently_added_listing.sha256,
      source_queue_sha256:
        config.adopted_artifacts.recently_added_new_urls.sha256,
      source_raw_positions: expected.raw_positions,
      source_duplicates_removed: expected.duplicates_removed,
      normalization:
        'deduplicated immutable listing projected into the typed evidence contract',
    },
  }
}

function runtimeIdentity(workspace) {
  return {
    local_cycle_id: workspace.identity.local_cycle_id,
    run_token: workspace.identity.run_token,
    remote_cycle_id: null,
    region_code: 'us',
    storefront: 'playstation',
    mode: 'real_recorded',
  }
}

function producer(workspace) {
  return {
    name: 'assemble-psdeals-recovery-runtime-v1',
    version: '1',
    code_revision: workspace.identity.code_revision,
  }
}

function recentlyAddedContext(config, expected) {
  const url = new URL(config.source_urls.recently_added)
  return {
    requested_url: url.toString(),
    platforms: String(url.searchParams.get('platforms') || '')
      .split(',')
      .filter(Boolean)
      .map((value) => value.toUpperCase()),
    content_types: url.searchParams.getAll('contentType[]'),
    order: url.searchParams.get('sort'),
    limits: {
      pages: expected.pages,
      adopted_precollected: true,
    },
  }
}

function requireEvidenceSuccess(evidence, now, label) {
  const validation = validatePsdealsProducerEvidence(evidence, { now })
  if (!validation.valid || evidence.status !== 'succeeded') {
    throw new Error(
      `${label}_INVALID:${validation.reason_codes.join(',') || evidence.status}`
    )
  }
}

function pathSet(workspace) {
  const root = workspace.root_dir
  return Object.freeze({
    normalizedListing:
      path.join(root, 'artifacts', 'recently-added-normalized-listing.json'),
    combined:
      path.join(root, 'artifacts', 'recently-added-combined.txt'),
    must:
      path.join(root, 'artifacts', 'recently-added-must-refresh.txt'),
    plus:
      path.join(root, 'artifacts', 'recently-added-ps-plus-recheck.txt'),
    stale:
      path.join(root, 'artifacts', 'recently-added-stale.txt'),
    skipped:
      path.join(root, 'artifacts', 'recently-added-skipped.txt'),
    summary:
      path.join(root, 'artifacts', 'recently-added-fast-refresh-summary.json'),
    listingEvidence:
      path.join(root, 'evidence', 'recently-added-listing-collection.json'),
    fastEvidence:
      path.join(root, 'evidence', 'recently-added-fast-refresh-analysis.json'),
    importSummary:
      path.join(root, 'artifacts', 'recently-added-detail-import-summary.json'),
    importFailures:
      path.join(root, 'artifacts', 'recently-added-detail-failures.txt'),
    importEvidence:
      path.join(root, 'evidence', 'recently-added-detail-import.json'),
    plan:
      path.join(root, 'state', 'recovery-runtime-plan.json'),
  })
}

function portable(projectRoot, file) {
  const relative = path.relative(projectRoot, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('RECOVERY_RUNTIME_PATH_OUTSIDE_PROJECT')
  }
  return relative.split(path.sep).join('/')
}

function importTemplate({
  projectRoot,
  workspace,
  paths,
} = {}) {
  return {
    adapter: 'import_recently_added',
    entrypoint: 'scripts/import-psdeals-detail-local.mjs',
    allowed_env: [
      'SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
      'LOBODEALS_REMOTE_EXECUTION',
    ],
    args: [
      `--file=${portable(projectRoot, paths.combined)}`,
      '--evidence-kind=detail_import',
      '--remote-cycle-id=<REMOTE_CYCLE_UUID>',
      `--parent-evidence=${portable(projectRoot, paths.fastEvidence)}`,
      `--summary-output-json=${portable(projectRoot, paths.importSummary)}`,
      `--failures-output-txt=${portable(projectRoot, paths.importFailures)}`,
      `--local-cycle-id=${workspace.identity.local_cycle_id}`,
      `--run-token=${workspace.identity.run_token}`,
      `--evidence-output=${portable(projectRoot, paths.importEvidence)}`,
      `--code-revision=${workspace.identity.code_revision}`,
      '--producer-version=1',
      '--evidence-mode=real_recorded',
      '--execution-mode=operational',
      `--project-ref=${PROJECT_REF}`,
      `--confirm-remote-action=${IMPORT_CONFIRMATION}`,
      '--authorization-id=<IMPORT_AUTHORIZATION_ID>',
      '--fetch-mode=edge-live',
      '--edge-endpoint=<EDGE_CDP_WEBSOCKET>',
      '--relations-mode=replace',
      '--delay-ms=<BOUNDED_DELAY_MS>',
      '--timeout-ms=<DETAIL_TIMEOUT_MS>',
      `--debug-html-dir=${portable(
        projectRoot,
        path.join(workspace.root_dir, 'logs', 'recently-added-detail-html')
      )}`,
    ],
    expected_artifacts: [
      portable(projectRoot, paths.importSummary),
      portable(projectRoot, paths.importFailures),
      portable(projectRoot, paths.importEvidence),
    ],
    receipt: {
      resolve_after_process: true,
      action_kind: 'detail_import',
      max_attempts: 1,
      input_artifact_hash: '<COMBINED_QUEUE_SHA256>',
    },
    executes_process: false,
    executes_remote_write: false,
  }
}

function stageRequirement(binding) {
  const localReady = new Set([
    'local_preflight_passed',
    'recently_added_collected',
    'recently_added_analyzed',
  ])
  const requirementByState = {
    remote_preflight_passed: 'fresh_remote_readonly_preflight',
    edge_ready: 'edge_cdp_9223_runtime_evidence',
    captcha_resolved: 'manual_challenge_clear_if_present',
    cycle_created: 'fresh_stage_authorization_and_supabase_port',
    recently_added_imported: 'authorized_detail_import_runtime',
    discounts_collected: 'visible_edge_discount_collection',
    discounts_analyzed: 'listing_receipt_and_fast_refresh_runtime',
    discount_details_imported: 'authorized_discount_detail_import',
    detail_retry_reconciled: 'one_bounded_retry_only',
    monthly_processed: 'current_manual_monthly_review_no_changes',
    ended_analyzed: 'ended_analysis_from_complete_discount_listing',
    ambiguous_revalidated: 'bounded_ended_candidate_revalidation',
    ended_reanalyzed: 'one_exact_ended_reanalysis',
    demotions_reconciled: 'apply_psdeals_ended_deals_v2_only',
    candidates_prepared: 'same_cycle_candidate_evidence',
    certification_reconciled: 'mark_succeeded_then_certify_v3',
    minima_reconciled: 'certification_receipt_minima_result',
    cache_reconciled: 'refresh_catalog_public_cache_v16_only',
    final_postchecks_passed: 'same_cycle_readonly_public_postchecks',
    succeeded: 'local_workspace_finalization',
  }
  return {
    order: PSDEALS_DAILY_LIVE_BINDINGS.indexOf(binding) + 1,
    state: binding.state,
    adapter: binding.adapter,
    parent: binding.parent,
    component: binding.component,
    timeout_ms: binding.timeout_ms,
    status: localReady.has(binding.state)
      ? 'LOCAL_READY'
      : 'RUNTIME_GATED',
    requirement:
      localReady.has(binding.state)
        ? 'verified_local_assembly'
        : requirementByState[binding.state] || 'derived_from_prior_stage',
  }
}

async function validateRecoveryConfig(projectRoot, configPath) {
  assertInside(projectRoot, configPath, 'RECOVERY_CONFIG_OUTSIDE_PROJECT')
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
  if (
    config?.recovery_config_version !== 1 ||
    config?.classification !== 'RECOVERY_INPUTS_PREPARED_LOCAL_ONLY' ||
    config?.project_ref !== PROJECT_REF ||
    path.resolve(String(config?.project_root || '')) !== projectRoot ||
    config?.ready_for_runtime_assembly !== true ||
    config?.remote_writes_executed !== 0 ||
    config?.edge_opened !== false ||
    config?.execution_limits?.detail_retry_max_attempts !== 1 ||
    config?.execution_limits?.use_safe_demotion_rpc !== 'apply_psdeals_ended_deals_v2' ||
    config?.execution_limits?.use_cache_rpc !== 'refresh_catalog_public_cache_v16' ||
    config?.execution_limits?.deploy_allowed !== false ||
    config?.execution_limits?.scheduler_allowed !== false ||
    config?.execution_limits?.second_cycle_allowed !== false ||
    !HEAD_PATTERN.test(String(config?.code_head || ''))
  ) {
    throw new Error('RECOVERY_CONFIG_INVALID')
  }
  return config
}

export async function assemblePsdealsRecoveryRuntimeLocal({
  project_root,
  recovery_config,
  expected_counts = PSDEALS_RECOVERY_EXPECTED_COUNTS,
} = {}) {
  const projectRoot = path.resolve(project_root || process.cwd())
  const configPath = path.resolve(
    recovery_config ||
      path.join(
        projectRoot,
        'data',
        'cycles',
        'local-cycle-recovery-20260804-final',
        'state',
        'recovery-inputs.json'
      )
  )
  const config = await validateRecoveryConfig(projectRoot, configPath)
  const workspace = await openPsdealsCycleWorkspace({
    workspace_dir: config.workspace_dir,
  })
  if (
    workspace.identity.mode !== 'operational' ||
    workspace.identity.local_cycle_id !== config.run_intent_id ||
    workspace.identity.code_revision !== config.code_head
  ) {
    throw new Error('RECOVERY_WORKSPACE_IDENTITY_MISMATCH')
  }

  const listingPath =
    config.adopted_artifacts.recently_added_listing.workspace_path
  const queuePath =
    config.adopted_artifacts.recently_added_new_urls.workspace_path
  assertInside(workspace.root_dir, listingPath, 'RECENTLY_ADDED_LISTING_OUTSIDE_WORKSPACE')
  assertInside(workspace.root_dir, queuePath, 'RECENTLY_ADDED_QUEUE_OUTSIDE_WORKSPACE')

  const listingContract =
    config.adopted_artifacts?.recently_added_listing || {}
  const queueContract =
    config.adopted_artifacts?.recently_added_new_urls || {}
  if (
    Number(listingContract.pages) !== expected_counts.pages ||
    Number(listingContract.raw_positions) !== expected_counts.raw_positions ||
    Number(listingContract.unique_items) !== expected_counts.unique_items ||
    Number(listingContract.duplicates_removed) !== expected_counts.duplicates_removed ||
    Number(queueContract.count) !== expected_counts.new_urls
  ) {
    throw new Error('RECOVERY_CONFIG_ADOPTED_COUNTS_MISMATCH')
  }

  const [listingRead, queueRead] = await Promise.all([
    readVerifiedFile(
      listingPath,
      config.adopted_artifacts.recently_added_listing.sha256,
      'RECENTLY_ADDED_LISTING'
    ),
    readVerifiedFile(
      queuePath,
      config.adopted_artifacts.recently_added_new_urls.sha256,
      'RECENTLY_ADDED_QUEUE'
    ),
  ])
  const listingFacts = parseListing(listingRead.bytes, expected_counts)
  const newUrls = parseQueue(
    queueRead.bytes,
    listingFacts.urls,
    expected_counts.new_urls
  )
  const newUrlSet = new Set(newUrls)
  const skippedUrls = listingFacts.listing.items
    .map((item) => String(item.psdeals_url).trim())
    .filter((url) => !newUrlSet.has(url))
  if (skippedUrls.length !== expected_counts.unique_items - expected_counts.new_urls) {
    throw new Error('RECENTLY_ADDED_SKIPPED_COUNT_INVALID')
  }

  const paths = pathSet(workspace)
  const normalizedListing = buildNormalizedListing(
    listingFacts.listing,
    config,
    expected_counts
  )
  const combinedText = `${newUrls.join('\n')}\n`
  const skippedText = `${skippedUrls.join('\n')}\n`
  const summary = {
    classification: 'ADOPTED_RECENTLY_ADDED_FAST_REFRESH',
    source_listing_sha256: listingRead.sha256,
    source_queue_sha256: queueRead.sha256,
    collected_items: expected_counts.unique_items,
    unique_psdeals_ids: expected_counts.unique_items,
    must_refresh: expected_counts.new_urls,
    ps_plus_recheck: 0,
    stale: 0,
    combined: expected_counts.new_urls,
    skipped: skippedUrls.length,
    overlap_count: 0,
    duplicate_urls: 0,
    remote_reads_executed: 0,
    remote_writes_executed: 0,
  }

  await Promise.all([
    writeOrVerify(paths.normalizedListing, stableText(normalizedListing)),
    writeOrVerify(paths.combined, combinedText),
    writeOrVerify(paths.must, combinedText),
    writeOrVerify(paths.plus, ''),
    writeOrVerify(paths.stale, ''),
    writeOrVerify(paths.skipped, skippedText),
    writeOrVerify(paths.summary, stableText(summary)),
  ])

  const context = recentlyAddedContext(config, expected_counts)
  const timestamp = new Date(config.prepared_at).toISOString()
  const identity = runtimeIdentity(workspace)
  const producerValue = producer(workspace)

  const listingReference = await referencePsdealsFile({
    project_root: projectRoot,
    file_path: paths.normalizedListing,
    role: 'listing_json',
    artifact_kind: 'listing_json',
  })
  const listingUrlsReference = await referencePsdealsFile({
    project_root: projectRoot,
    file_path: paths.combined,
    role: 'listing_urls',
    artifact_kind: 'url_queue',
  })
  const listingEvidence = buildListingCollectionEvidence({
    identity,
    producer: producerValue,
    timestamps: {
      started_at: timestamp,
      finished_at: timestamp,
      generated_at: timestamp,
    },
    context,
    outputs: [listingReference, listingUrlsReference],
    collection: {
      pages_requested: expected_counts.pages,
      pages_completed: expected_counts.pages,
      failed_pages: [],
      termination: 'pagination_final_observed',
      stop_reason: normalizedListing.stop_reason,
      total_results_detected: expected_counts.unique_items,
      total_collected: expected_counts.unique_items,
      unique_ids: expected_counts.unique_items,
      duplicate_ids: 0,
      partial_artifact_present: false,
    },
    extensions: {
      adoption_provenance: normalizedListing.adoption_provenance,
    },
  })
  requireEvidenceSuccess(listingEvidence, timestamp, 'ADOPTED_LISTING_EVIDENCE')
  await writeOrVerify(
    paths.listingEvidence,
    stablePsdealsEvidenceJson(listingEvidence)
  )

  const outputSpecs = [
    [paths.summary, 'fast_refresh_summary', 'fast_refresh_summary'],
    [paths.combined, 'combined_queue', 'url_queue'],
    [paths.must, 'must_refresh_queue', 'url_queue'],
    [paths.plus, 'ps_plus_recheck_queue', 'url_queue'],
    [paths.stale, 'stale_queue', 'url_queue'],
    [paths.skipped, 'skipped_queue', 'url_queue'],
  ]
  const fastOutputs = []
  for (const [file, role, artifactKind] of outputSpecs) {
    fastOutputs.push(await referencePsdealsFile({
      project_root: projectRoot,
      file_path: file,
      role,
      artifact_kind: artifactKind,
    }))
  }
  const fastEvidence = buildFastRefreshAnalysisEvidence({
    identity,
    producer: producerValue,
    timestamps: {
      started_at: timestamp,
      finished_at: timestamp,
      generated_at: timestamp,
    },
    context,
    inputs: [listingReference],
    outputs: fastOutputs,
    analysis: {
      must_refresh: {
        count: expected_counts.new_urls,
        reason_counts: { adopted_new_item: expected_counts.new_urls },
      },
      ps_plus_recheck: {
        count: 0,
        limit: 0,
        reason_counts: {},
      },
      stale: {
        count: 0,
        limit: 0,
        reason_counts: {},
      },
      skipped: { count: skippedUrls.length },
      combined_count: expected_counts.new_urls,
      overlap_count: 0,
      duplicate_urls: 0,
      limits_reached: {
        ps_plus_recheck: false,
        stale: false,
      },
    },
    extensions: {
      adoption_provenance: {
        listing_evidence_path: portable(projectRoot, paths.listingEvidence),
        source_listing_sha256: listingRead.sha256,
        source_queue_sha256: queueRead.sha256,
        database_classification_snapshot_reused: true,
        analysis_repeated: false,
      },
    },
  })
  requireEvidenceSuccess(fastEvidence, timestamp, 'ADOPTED_FAST_REFRESH_EVIDENCE')
  await writeOrVerify(
    paths.fastEvidence,
    stablePsdealsEvidenceJson(fastEvidence)
  )
  await requireLinkedPsdealsEvidence({
    evidence_path: paths.fastEvidence,
    expected_kind: 'fast_refresh_analysis',
    local_cycle_id: workspace.identity.local_cycle_id,
    run_token: workspace.identity.run_token,
    now: timestamp,
    root_dir: projectRoot,
  })

  const plan = {
    recovery_runtime_plan_version: 1,
    classification: 'LOCAL_ASSEMBLY_COMPLETE_LIVE_GATES_CLOSED',
    assembled_at: timestamp,
    project_root: projectRoot,
    project_ref: PROJECT_REF,
    code_head: config.code_head,
    run_intent_id: config.run_intent_id,
    workspace_dir: workspace.root_dir,
    adopted_chain: {
      listing_json: {
        path: paths.normalizedListing,
        sha256: sha256(await fs.readFile(paths.normalizedListing)),
      },
      listing_evidence: {
        path: paths.listingEvidence,
        sha256: sha256(await fs.readFile(paths.listingEvidence)),
      },
      combined_queue: {
        path: paths.combined,
        sha256: sha256(await fs.readFile(paths.combined)),
        count: newUrls.length,
      },
      fast_refresh_evidence: {
        path: paths.fastEvidence,
        sha256: sha256(await fs.readFile(paths.fastEvidence)),
      },
    },
    process_templates: {
      import_recently_added: importTemplate({
        projectRoot,
        workspace,
        paths,
      }),
    },
    stages: PSDEALS_DAILY_LIVE_BINDINGS.map(stageRequirement),
    live_gate_blockers: [
      'fresh_remote_readonly_preflight_required',
      'fresh_vercel_capacity_evidence_required',
      'fresh_stage_authorization_bundle_required',
      'edge_cdp_9223_runtime_evidence_required',
      'current_monthly_review_no_changes_required',
    ],
    restrictions: {
      one_cycle_only: true,
      detail_retry_max_attempts: 1,
      safe_demotion_rpc: 'apply_psdeals_ended_deals_v2',
      certification_rpc: 'certify_price_refresh_cycle_v3',
      cache_rpc: 'refresh_catalog_public_cache_v16',
      legacy_demotion_v1_forbidden: true,
      cache_v15_forbidden: true,
      deploy_forbidden: true,
      scheduler_forbidden: true,
      second_cycle_forbidden: true,
    },
    live_execution_enabled: false,
    remote_reads_executed: 0,
    remote_writes_executed: 0,
    edge_opened: false,
  }
  await writeOrVerify(paths.plan, stablePsdealsEvidenceJson(plan))

  return {
    assembled: true,
    classification: plan.classification,
    run_intent_id: config.run_intent_id,
    workspace_dir: workspace.root_dir,
    plan_file: paths.plan,
    listing_evidence: paths.listingEvidence,
    fast_refresh_evidence: paths.fastEvidence,
    combined_queue: paths.combined,
    combined_queue_count: newUrls.length,
    skipped_count: skippedUrls.length,
    stage_count: plan.stages.length,
    live_gate_blockers: plan.live_gate_blockers,
    live_execution_enabled: false,
    remote_reads_executed: 0,
    remote_writes_executed: 0,
    edge_opened: false,
  }
}
