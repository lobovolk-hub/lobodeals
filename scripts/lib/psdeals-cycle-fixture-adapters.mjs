import fs from 'node:fs/promises'

import { assemblePsdealsCycleManifest } from './psdeals-evidence-assembly.mjs'
import {
  stablePsdealsEvidenceJson,
} from './psdeals-evidence-envelope.mjs'
import {
  readPsdealsArtifact,
  writePsdealsArtifactAtomic,
} from './psdeals-evidence-io.mjs'
import {
  buildDetailImportEvidence,
  buildEndedDealsAnalysisEvidence,
  buildFastRefreshAnalysisEvidence,
  buildListingCollectionEvidence,
  buildMonthlyGamesCheckEvidence,
  validatePsdealsProducerEvidence,
} from './psdeals-evidence-producers.mjs'
import { loadVerifiedPsdealsCycleEvidence } from './psdeals-cycle-evidence-store.mjs'
import { validatePsdealsCycleManifest } from './psdeals-cycle-manifest.mjs'
import { normalizePsdealsCommercialState } from './psdeals-commercial-state.mjs'
import {
  classifyPsdealsItemType,
  normalizePsdealsPlatforms,
} from './psdeals-item-classification.mjs'
import { buildPsdealsListingInsertPayload } from './psdeals-stage-payload.mjs'
import { resolvePsdealsCycleWorkspacePath } from './psdeals-cycle-workspace.mjs'

const FIXTURE_REMOTE_CYCLE_ID = '11111111-1111-4111-8111-111111111111'

async function writeOrVerify(workspace, portablePath, content) {
  const outputPath = await resolvePsdealsCycleWorkspacePath(workspace, portablePath)
  const expected = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')
  try {
    const existing = await fs.readFile(outputPath)
    if (!existing.equals(expected)) throw new Error(`FIXTURE_ARTIFACT_INCOMPATIBLE: ${portablePath}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    await writePsdealsArtifactAtomic({
      output_path: outputPath,
      root_dir: workspace.root_dir,
      content: expected,
    })
  }
  return outputPath
}

async function artifact(workspace, portablePath, role, artifactKind, content) {
  const outputPath = await writeOrVerify(workspace, portablePath, content)
  return (await readPsdealsArtifact({
    root_dir: workspace.root_dir,
    file_path: outputPath,
    portable_path: portablePath,
    role,
    artifact_kind: artifactKind,
  })).reference
}

function evidenceIdentity(workspace) {
  return {
    local_cycle_id: workspace.identity.local_cycle_id,
    run_token: workspace.identity.run_token,
    remote_cycle_id: null,
    region_code: workspace.identity.region_code,
    storefront: workspace.identity.storefront,
    mode: 'offline_fixture',
  }
}

function producer(workspace, name) {
  return { name, version: 'fixture-v1', code_revision: workspace.identity.code_revision }
}

function timestamps(startedAt, finishedAt) {
  return { started_at: startedAt, finished_at: finishedAt, generated_at: finishedAt }
}

async function writeEvidence(workspace, fileName, envelope, now) {
  const validation = validatePsdealsProducerEvidence(envelope, { now })
  if (!validation.valid) {
    throw new Error(`FIXTURE_EVIDENCE_INVALID: ${validation.reason_codes.join(',')}`)
  }
  const portablePath = `evidence/${fileName}`
  const outputPath = await writeOrVerify(
    workspace,
    portablePath,
    stablePsdealsEvidenceJson(envelope)
  )
  const source = (await readPsdealsArtifact({
    root_dir: workspace.root_dir,
    file_path: outputPath,
    portable_path: portablePath,
    role: `${envelope.evidence_kind}_evidence`,
    artifact_kind: 'evidence_envelope',
    local_cycle_id: envelope.local_cycle_id,
    run_token: envelope.run_token,
  })).reference
  return { envelope, source, portablePath }
}

async function receipt(workspace, name, value) {
  const portablePath = `receipts/${name}.json`
  const outputPath = await writeOrVerify(
    workspace,
    portablePath,
    stablePsdealsEvidenceJson(value)
  )
  const loaded = await readPsdealsArtifact({
    root_dir: workspace.root_dir,
    file_path: outputPath,
    portable_path: portablePath,
    role: 'cycle_receipt',
    artifact_kind: 'cycle_receipt',
  })
  return { portablePath, reference: loaded.reference }
}

function success(result = {}) {
  return {
    status: 'succeeded',
    reason_codes: [],
    errors: [],
    warnings: [],
    simulation_performed: result.simulation_performed === true,
    external_action_performed: false,
    ...result,
  }
}

function fixtureListingItem() {
  return {
    psdeals_id: 900001,
    psdeals_slug: 'fixture-game',
    psdeals_url: 'https://psdeals.net/us-store/game/900001/fixture-game',
    title: 'Fixture Game',
    image_url: 'https://cdn.psdeals.net/fixture-game.png',
    current_price_raw: '$9.99',
    original_price_raw: '$19.99',
    discount_percent_raw: '-50%',
    item_type_label_raw: 'Full Game',
    platforms_raw: 'PS5 / PS4',
    commercial_state: normalizePsdealsCommercialState({
      current_price: '$9.99',
      original_price: '$19.99',
      source_discount_percent: '-50%',
    }),
    type_classification: classifyPsdealsItemType('Full Game'),
    platform_classification: normalizePsdealsPlatforms('PS5 / PS4'),
  }
}

export function createPsdealsFixtureAdapters() {
  return {
    async create_cycle(context) {
      const value = await receipt(context.workspace, 'create-cycle-fixture', {
        action: 'create_cycle',
        simulated: true,
        local_cycle_id: context.workspace.identity.local_cycle_id,
        remote_cycle_id: FIXTURE_REMOTE_CYCLE_ID,
        performed_at: context.finished_at,
      })
      return success({
        finished_at: context.finished_at,
        output_hashes: [value.reference.sha256],
        evidence_path: value.portablePath,
        action_receipt_path: value.portablePath,
        external_action_requested: 'create_price_refresh_cycle',
        simulation_performed: true,
        gate_updates: { remote_cycle_created: true },
      })
    },

    async collect_listing(context) {
      const listingItem = fixtureListingItem()
      const listing = await artifact(
        context.workspace,
        'artifacts/listing.json',
        'listing_json',
        'psdeals_listing_json',
        `${JSON.stringify({ meta: { fixture: true }, items: [listingItem] }, null, 2)}\n`
      )
      const envelope = buildListingCollectionEvidence({
        identity: evidenceIdentity(context.workspace),
        producer: producer(context.workspace, 'fixture-listing-collector'),
        timestamps: timestamps(context.started_at, context.finished_at),
        context: context.workspace.identity.context,
        outputs: [listing],
        collection: {
          pages_requested: 1,
          pages_completed: 1,
          failed_pages: [],
          termination: 'exact_total_reached',
          stop_reason: 'unique_items_collected_reached_total_results: unique=1 total=1',
          total_results_detected: 1,
          total_collected: 1,
          unique_ids: 1,
          duplicate_ids: 0,
          partial_artifact_present: false,
        },
      })
      const evidence = await writeEvidence(
        context.workspace,
        'listing-collection.json',
        envelope,
        context.finished_at
      )
      return success({
        finished_at: context.finished_at,
        output_hashes: [listing.sha256, evidence.source.sha256],
        evidence_path: evidence.portablePath,
      })
    },

    async validate_listing(context) {
      const store = await loadVerifiedPsdealsCycleEvidence({
        workspace: context.workspace,
        now: context.finished_at,
        expected_kinds: ['listing_collection'],
      })
      if (!store.valid) throw new Error(`LISTING_EVIDENCE_INVALID: ${store.errors.map((value) => value.code).join(',')}`)
      const listing = store.records.find((record) => record.envelope.evidence_kind === 'listing_collection')
      if (listing.envelope.status !== 'succeeded') throw new Error('LISTING_NOT_COMPLETE')
      const value = await receipt(context.workspace, 'validate-listing-fixture', {
        valid: true,
        listing_evidence_sha256: listing.source_artifact.sha256,
        performed_at: context.finished_at,
      })
      return success({
        finished_at: context.finished_at,
        input_hashes: [listing.source_artifact.sha256],
        output_hashes: [value.reference.sha256],
        evidence_path: value.portablePath,
        gate_updates: { listing_complete: true },
      })
    },

    async build_partial_payload(context) {
      const built = buildPsdealsListingInsertPayload(fixtureListingItem(), {
        listingObservedAt: context.finished_at,
      })
      if (!built.is_valid) throw new Error(`FIXTURE_LISTING_PAYLOAD_INVALID: ${built.reason_codes.join(',')}`)
      const payload = await artifact(
        context.workspace,
        'artifacts/listing-payload.json',
        'listing_partial_payload',
        'listing_partial_payload',
        stablePsdealsEvidenceJson([built.payload])
      )
      return success({
        finished_at: context.finished_at,
        output_hashes: [payload.sha256],
        evidence_path: payload.path,
      })
    },

    async upsert_listing(context) {
      const payloadPath = await resolvePsdealsCycleWorkspacePath(context.workspace, 'artifacts/listing-payload.json', { must_exist: true })
      const payload = (await readPsdealsArtifact({
        root_dir: context.workspace.root_dir,
        file_path: payloadPath,
        portable_path: 'artifacts/listing-payload.json',
        role: 'listing_partial_payload',
        artifact_kind: 'listing_partial_payload',
      })).reference
      const value = await receipt(context.workspace, 'upsert-listing-fixture', {
        simulated: true,
        attempted: 1,
        succeeded: 1,
        failed: 0,
        input_sha256: payload.sha256,
        performed_at: context.finished_at,
      })
      return success({
        finished_at: context.finished_at,
        input_hashes: [payload.sha256],
        output_hashes: [value.reference.sha256],
        evidence_path: value.portablePath,
        action_receipt_path: value.portablePath,
        external_action_requested: 'upsert_listing_stage_rows',
        simulation_performed: true,
      })
    },

    async analyze_detail_candidates(context) {
      const listingPath = await resolvePsdealsCycleWorkspacePath(context.workspace, 'artifacts/listing.json', { must_exist: true })
      const listing = (await readPsdealsArtifact({
        root_dir: context.workspace.root_dir,
        file_path: listingPath,
        portable_path: 'artifacts/listing.json',
        role: 'listing_json',
        artifact_kind: 'psdeals_listing_json',
      })).reference
      const outputs = []
      for (const [role, fileName, body] of [
        ['fast_refresh_summary', 'fast-refresh-summary.json', '{"fixture":true,"combined_count":1}\n'],
        ['combined_queue', 'combined.txt', 'https://psdeals.net/us-store/game/900001/fixture-game\n'],
        ['must_refresh_queue', 'must-refresh.txt', 'https://psdeals.net/us-store/game/900001/fixture-game\n'],
        ['ps_plus_recheck_queue', 'ps-plus-recheck.txt', ''],
        ['stale_queue', 'stale.txt', ''],
        ['skipped_queue', 'skipped.txt', ''],
      ]) {
        outputs.push(await artifact(context.workspace, `artifacts/${fileName}`, role, role.includes('queue') ? 'url_queue' : 'fast_refresh_summary', body))
      }
      const envelope = buildFastRefreshAnalysisEvidence({
        identity: evidenceIdentity(context.workspace),
        producer: producer(context.workspace, 'fixture-fast-refresh-analyzer'),
        timestamps: timestamps(context.started_at, context.finished_at),
        context: context.workspace.identity.context,
        inputs: [listing],
        outputs,
        analysis: {
          must_refresh: { count: 1, limit: null, reason_counts: { fixture_price_revalidation: 1 } },
          ps_plus_recheck: { count: 0, limit: 5, reason_counts: {} },
          stale: { count: 0, limit: 5, reason_counts: {} },
          skipped: { count: 0 },
          combined_count: 1,
          overlap_count: 0,
          duplicate_urls: 0,
          limits_reached: { ps_plus_recheck: false, stale: false },
        },
      })
      const evidence = await writeEvidence(context.workspace, 'fast-refresh-analysis.json', envelope, context.finished_at)
      return success({
        finished_at: context.finished_at,
        input_hashes: [listing.sha256],
        output_hashes: [...outputs.map((value) => value.sha256), evidence.source.sha256],
        evidence_path: evidence.portablePath,
      })
    },

    async import_details(context) {
      const combinedPath = await resolvePsdealsCycleWorkspacePath(context.workspace, 'artifacts/combined.txt', { must_exist: true })
      const combined = (await readPsdealsArtifact({
        root_dir: context.workspace.root_dir,
        file_path: combinedPath,
        portable_path: 'artifacts/combined.txt',
        role: 'combined_queue',
        artifact_kind: 'url_queue',
      })).reference
      const summary = await artifact(context.workspace, 'artifacts/detail-import-summary.json', 'detail_import_summary', 'detail_import_summary', '{"attempted":1,"succeeded":1,"failed":0}\n')
      const failures = await artifact(context.workspace, 'artifacts/detail-failures.txt', 'detail_failures', 'url_queue', '')
      const envelope = buildDetailImportEvidence({
        identity: evidenceIdentity(context.workspace),
        producer: producer(context.workspace, 'fixture-detail-importer'),
        timestamps: timestamps(context.started_at, context.finished_at),
        context: context.workspace.identity.context,
        inputs: [combined],
        outputs: [summary, failures],
        result: {
          attempted: 1,
          succeeded: 1,
          failed: 0,
          skipped: 0,
          failed_urls: [],
          reported_status: 'succeeded',
          exit_code: 0,
          import_run_id: '22222222-2222-4222-8222-222222222222',
        },
      })
      const evidence = await writeEvidence(context.workspace, 'detail-import.json', envelope, context.finished_at)
      return success({
        finished_at: context.finished_at,
        input_hashes: [combined.sha256],
        output_hashes: [summary.sha256, failures.sha256, evidence.source.sha256],
        evidence_path: evidence.portablePath,
        external_action_requested: 'import_detail_stage_rows',
        simulation_performed: true,
      })
    },

    async retry_details(context) {
      return {
        status: 'skipped',
        finished_at: context.finished_at,
        reason_codes: ['no_initial_failures'],
        errors: [],
        warnings: [],
        output_hashes: [],
        external_action_requested: 'retry_failed_detail_urls',
        external_action_performed: false,
        simulation_performed: true,
      }
    },

    async check_monthly_games(context) {
      const review = await artifact(context.workspace, 'artifacts/monthly-games-review.json', 'monthly_games_review', 'monthly_games_review', '{"fixture":true,"result":"no_changes"}\n')
      const envelope = buildMonthlyGamesCheckEvidence({
        identity: evidenceIdentity(context.workspace),
        producer: producer(context.workspace, 'fixture-monthly-review'),
        timestamps: timestamps(context.started_at, context.finished_at),
        context: context.workspace.identity.context,
        outputs: [review],
        review: {
          source_type: 'fixture_manual_official_source_review',
          source_reference: 'fixture://official-monthly-review',
          procedure: 'compare-active-monthly-allowlist',
          procedure_version: '1',
          result: 'no_changes',
          proposed_changes: [],
          application_performed: false,
        },
      })
      const evidence = await writeEvidence(context.workspace, 'monthly-games-check.json', envelope, context.finished_at)
      return success({
        finished_at: context.finished_at,
        output_hashes: [review.sha256, evidence.source.sha256],
        evidence_path: evidence.portablePath,
      })
    },

    async analyze_ended_deals(context) {
      const listingPath = await resolvePsdealsCycleWorkspacePath(context.workspace, 'artifacts/listing.json', { must_exist: true })
      const listing = (await readPsdealsArtifact({
        root_dir: context.workspace.root_dir,
        file_path: listingPath,
        portable_path: 'artifacts/listing.json',
        role: 'listing_json',
        artifact_kind: 'psdeals_listing_json',
      })).reference
      const analysis = await artifact(context.workspace, 'artifacts/ended-deals-analysis.json', 'ended_deals_analysis', 'ended_deals_analysis', '{"fixture":true,"candidates":0,"application_performed":false}\n')
      const envelope = buildEndedDealsAnalysisEvidence({
        identity: evidenceIdentity(context.workspace),
        producer: producer(context.workspace, 'fixture-ended-deals-analyzer'),
        timestamps: timestamps(context.started_at, context.finished_at),
        context: context.workspace.identity.context,
        inputs: [listing],
        outputs: [analysis],
        result: {
          listing_complete_confirmed: true,
          candidates: 0,
          application_performed: false,
          blockers: [],
        },
      })
      const evidence = await writeEvidence(context.workspace, 'ended-deals-analysis.json', envelope, context.finished_at)
      return success({
        finished_at: context.finished_at,
        input_hashes: [listing.sha256],
        output_hashes: [analysis.sha256, evidence.source.sha256],
        evidence_path: evidence.portablePath,
        gate_updates: { can_demote: true },
      })
    },

    async apply_ended_deals(context) {
      return {
        status: 'skipped',
        finished_at: context.finished_at,
        reason_codes: ['no_ended_deal_candidates'],
        errors: [],
        warnings: [],
        output_hashes: [],
        external_action_requested: 'apply_ended_deal_demotions',
        external_action_performed: false,
        simulation_performed: true,
      }
    },

    async validate_cycle(context) {
      const store = await loadVerifiedPsdealsCycleEvidence({
        workspace: context.workspace,
        now: context.finished_at,
        expected_kinds: [
          'listing_collection',
          'fast_refresh_analysis',
          'detail_import',
          'monthly_games_check',
          'ended_deals_analysis',
        ],
      })
      if (!store.valid) throw new Error(`CYCLE_EVIDENCE_INVALID: ${store.errors.map((value) => value.code).join(',')}`)
      const assembled = assemblePsdealsCycleManifest(store.records, {
        generated_at: context.finished_at,
        now: context.finished_at,
      })
      if (!assembled.assembled || !assembled.manifest) {
        throw new Error(`CYCLE_ASSEMBLY_FAILED: ${assembled.reason_codes.join(',')}`)
      }
      const validatedManifest = {
        ...assembled.manifest,
        cycle_state: {
          ...assembled.manifest.cycle_state,
          validation_passed: true,
          validation_completed_at: context.finished_at,
        },
      }
      const validation = validatePsdealsCycleManifest(validatedManifest, { now: context.finished_at })
      if (!validation.can_mark_succeeded) {
        throw new Error(`CYCLE_NOT_READY_TO_MARK_SUCCEEDED: ${validation.reason_codes.join(',')}`)
      }
      const manifest = await artifact(context.workspace, 'manifest/cycle-manifest.json', 'cycle_manifest', 'cycle_manifest', stablePsdealsEvidenceJson(validatedManifest))
      const validationReceipt = await receipt(context.workspace, 'validate-cycle-fixture', {
        classification: validation.classification,
        can_demote: validation.can_demote,
        can_mark_succeeded: validation.can_mark_succeeded,
        can_certify: validation.can_certify,
        can_refresh_cache: validation.can_refresh_cache,
        manifest_sha256: manifest.sha256,
        performed_at: context.finished_at,
      })
      return success({
        finished_at: context.finished_at,
        input_hashes: [store.evidence_index_sha256],
        output_hashes: [manifest.sha256, validationReceipt.reference.sha256],
        evidence_path: manifest.path,
        action_receipt_path: validationReceipt.portablePath,
        gate_updates: {
          listing_complete: validation.listing_complete,
          can_demote: validation.can_demote,
          can_mark_succeeded: validation.can_mark_succeeded,
        },
      })
    },

    async mark_succeeded(context) {
      const value = await receipt(context.workspace, 'mark-succeeded-fixture', {
        action: 'mark_succeeded',
        simulated: true,
        remote_cycle_id: FIXTURE_REMOTE_CYCLE_ID,
        performed_at: context.finished_at,
      })
      return success({
        finished_at: context.finished_at,
        output_hashes: [value.reference.sha256],
        evidence_path: value.portablePath,
        action_receipt_path: value.portablePath,
        external_action_requested: 'mark_price_refresh_cycle_succeeded',
        simulation_performed: true,
        gate_updates: { remote_cycle_succeeded: true, can_certify: true },
      })
    },

    async certify(context) {
      const value = await receipt(context.workspace, 'certify-fixture', {
        action: 'certify',
        simulated: true,
        remote_cycle_id: FIXTURE_REMOTE_CYCLE_ID,
        performed_at: context.finished_at,
      })
      return success({
        finished_at: context.finished_at,
        output_hashes: [value.reference.sha256],
        evidence_path: value.portablePath,
        action_receipt_path: value.portablePath,
        external_action_requested: 'certify_price_refresh_cycle_v3',
        simulation_performed: true,
        gate_updates: { certified: true, can_refresh_cache: true },
      })
    },

    async refresh_cache(context) {
      const value = await receipt(context.workspace, 'refresh-cache-fixture', {
        action: 'refresh_cache', simulated: true, performed_at: context.finished_at,
      })
      return success({
        finished_at: context.finished_at,
        output_hashes: [value.reference.sha256],
        evidence_path: value.portablePath,
        action_receipt_path: value.portablePath,
        external_action_requested: 'refresh_catalog_public_cache_v16',
        simulation_performed: true,
        gate_updates: { cache_refreshed: true },
      })
    },

    async validate_public(context) {
      const value = await receipt(context.workspace, 'validate-public-fixture', {
        action: 'validate_public', simulated: true, result: 'passed', performed_at: context.finished_at,
      })
      return success({
        finished_at: context.finished_at,
        output_hashes: [value.reference.sha256],
        evidence_path: value.portablePath,
        action_receipt_path: value.portablePath,
        external_action_requested: 'validate_public_catalog',
        simulation_performed: true,
        gate_updates: { public_validation_passed: true },
      })
    },

    async record_metrics(context) {
      const value = await receipt(context.workspace, 'record-metrics-fixture', {
        action: 'record_metrics', simulated: true, result: 'recorded', performed_at: context.finished_at,
      })
      return success({
        finished_at: context.finished_at,
        output_hashes: [value.reference.sha256],
        evidence_path: value.portablePath,
        action_receipt_path: value.portablePath,
        external_action_requested: 'record_cycle_metrics',
        simulation_performed: true,
      })
    },
  }
}

export const PSDEALS_FIXTURE_REMOTE_CYCLE_ID = FIXTURE_REMOTE_CYCLE_ID
