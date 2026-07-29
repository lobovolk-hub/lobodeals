import path from 'node:path'

import {
  inspectPsdealsArtifact,
  readPsdealsArtifact,
  verifyPsdealsArtifactReference,
  writePsdealsEvidenceJsonAtomic,
} from './psdeals-evidence-io.mjs'
import { validatePsdealsProducerEvidence } from './psdeals-evidence-producers.mjs'

export function getPsdealsCliArg(argv, name, defaultValue = null) {
  const prefix = `--${name}=`
  const value = (Array.isArray(argv) ? argv : []).find((entry) =>
    entry.startsWith(prefix)
  )
  return value ? value.slice(prefix.length) : defaultValue
}

export function getPsdealsEvidenceCliOptions(argv) {
  const localCycleId = getPsdealsCliArg(argv, 'local-cycle-id')
  const runToken = getPsdealsCliArg(argv, 'run-token')
  const evidenceOutput = getPsdealsCliArg(argv, 'evidence-output')
  const supplied = [localCycleId, runToken, evidenceOutput].filter(Boolean).length

  if (supplied > 0 && supplied < 3) {
    throw new Error(
      'EVIDENCE_IDENTITY_INCOMPLETE: --local-cycle-id, --run-token and --evidence-output must be supplied together.'
    )
  }

  return {
    tracked: supplied === 3,
    local_cycle_id: localCycleId,
    run_token: runToken,
    evidence_output: evidenceOutput,
    code_revision: getPsdealsCliArg(argv, 'code-revision'),
    producer_version: getPsdealsCliArg(argv, 'producer-version', '1'),
    mode: getPsdealsCliArg(argv, 'evidence-mode', 'real_recorded'),
  }
}

export function buildPsdealsRuntimeIdentity(options, overrides = {}) {
  return {
    local_cycle_id: options.local_cycle_id,
    run_token: options.run_token,
    region_code: 'us',
    storefront: 'playstation',
    mode: options.mode,
    ...overrides,
  }
}

export function buildPsdealsRuntimeProducer(name, options) {
  return {
    name,
    version: options.producer_version,
    code_revision: options.code_revision,
  }
}

export async function loadPsdealsEvidenceFile(
  filePath,
  { now, root_dir = process.cwd() } = {}
) {
  const absolutePath = path.resolve(filePath)
  const loadedArtifact = await readPsdealsArtifact({
    root_dir,
    file_path: absolutePath,
    role: 'loaded_evidence',
    artifact_kind: 'evidence_envelope',
    final_state: 'final',
  })
  const envelope = JSON.parse(loadedArtifact.bytes.toString('utf8'))
  const validation = validatePsdealsProducerEvidence(envelope, { now })
  return {
    absolute_path: loadedArtifact.real_path,
    source_artifact: loadedArtifact.reference,
    envelope,
    validation,
  }
}

export async function requireLinkedPsdealsEvidence({
  evidence_path,
  expected_kind,
  local_cycle_id,
  run_token,
  now,
  root_dir = process.cwd(),
} = {}) {
  if (!evidence_path) throw new Error('PARENT_EVIDENCE_PATH_REQUIRED')
  const loaded = await loadPsdealsEvidenceFile(evidence_path, { now, root_dir })
  if (!loaded.validation.valid) throw new Error('PARENT_EVIDENCE_INVALID')
  if (loaded.envelope.evidence_kind !== expected_kind) {
    throw new Error('PARENT_EVIDENCE_KIND_MISMATCH')
  }
  if (loaded.envelope.local_cycle_id !== local_cycle_id) {
    throw new Error('PARENT_EVIDENCE_CYCLE_MISMATCH')
  }
  if (loaded.envelope.run_token !== run_token) {
    throw new Error('PARENT_EVIDENCE_RUN_TOKEN_MISMATCH')
  }
  return loaded
}

export async function referencePsdealsFile({
  project_root,
  file_path,
  role,
  artifact_kind,
  final_state = 'final',
  local_cycle_id,
  run_token,
} = {}) {
  return inspectPsdealsArtifact({
    root_dir: project_root,
    file_path,
    role,
    artifact_kind,
    final_state,
    local_cycle_id,
    run_token,
  })
}

export async function verifyLinkedArtifact(reference, { project_root } = {}) {
  const verification = await verifyPsdealsArtifactReference(reference, {
    root_dir: project_root,
  })
  if (!verification.valid) {
    throw new Error(`LINKED_ARTIFACT_INVALID: ${verification.code}`)
  }
  return verification
}

export async function emitPsdealsProducerEvidence({
  output_path,
  envelope,
  now,
} = {}) {
  const validation = validatePsdealsProducerEvidence(envelope, { now })
  if (!validation.valid) {
    const reasons = validation.errors.map((entry) => entry.code).join(',')
    throw new Error(`PRODUCER_EVIDENCE_INVALID: ${reasons}`)
  }
  return writePsdealsEvidenceJsonAtomic({ output_path, envelope })
}
