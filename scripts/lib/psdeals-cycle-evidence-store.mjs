import fs from 'node:fs/promises'
import path from 'node:path'

import {
  buildPsdealsArtifactReference,
  sha256PsdealsBytes,
  stablePsdealsEvidenceJson,
} from './psdeals-evidence-envelope.mjs'
import {
  readPsdealsArtifact,
  verifyPsdealsArtifactReference,
} from './psdeals-evidence-io.mjs'
import { validatePsdealsProducerEvidence } from './psdeals-evidence-producers.mjs'
import { resolvePsdealsCycleWorkspacePath } from './psdeals-cycle-workspace.mjs'

export async function loadVerifiedPsdealsCycleEvidence({
  workspace,
  now,
  expected_kinds = null,
} = {}) {
  const evidenceDirectory = await resolvePsdealsCycleWorkspacePath(
    workspace,
    'evidence',
    { must_exist: true }
  )
  const entries = await fs.readdir(evidenceDirectory, { withFileTypes: true })
  const errors = []
  const records = []
  const kinds = new Set()

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink() || !entry.isFile()) {
      errors.push({ code: 'EVIDENCE_STORE_ENTRY_INVALID', path: `evidence/${entry.name}` })
      continue
    }
    if (!entry.name.endsWith('.json')) {
      errors.push({ code: 'EVIDENCE_STORE_NON_JSON_FILE', path: `evidence/${entry.name}` })
      continue
    }
    const portablePath = `evidence/${entry.name}`
    const loaded = await readPsdealsArtifact({
      root_dir: workspace.root_dir,
      file_path: path.join(evidenceDirectory, entry.name),
      portable_path: portablePath,
      role: 'evidence_envelope',
      artifact_kind: 'evidence_envelope',
      local_cycle_id: workspace.identity.local_cycle_id,
      run_token: workspace.identity.run_token,
    })
    let envelope
    try {
      envelope = JSON.parse(loaded.bytes.toString('utf8'))
    } catch {
      errors.push({ code: 'EVIDENCE_STORE_JSON_INVALID', path: portablePath })
      continue
    }
    const validation = validatePsdealsProducerEvidence(envelope, { now })
    if (!validation.valid) {
      errors.push({
        code: 'EVIDENCE_STORE_ENVELOPE_INVALID',
        path: portablePath,
        reasons: validation.reason_codes,
      })
      continue
    }
    if (
      envelope.local_cycle_id !== workspace.identity.local_cycle_id ||
      envelope.run_token !== workspace.identity.run_token ||
      envelope.region_code !== workspace.identity.region_code ||
      envelope.storefront !== workspace.identity.storefront ||
      envelope.context?.fingerprint !== workspace.identity.context.fingerprint
    ) {
      errors.push({ code: 'EVIDENCE_STORE_IDENTITY_MISMATCH', path: portablePath })
      continue
    }
    if (kinds.has(envelope.evidence_kind)) {
      errors.push({ code: 'EVIDENCE_STORE_DUPLICATE_KIND', path: portablePath })
      continue
    }
    kinds.add(envelope.evidence_kind)

    for (const reference of [...envelope.inputs, ...envelope.outputs]) {
      const verification = await verifyPsdealsArtifactReference(reference, {
        root_dir: workspace.root_dir,
      })
      if (!verification.valid) {
        errors.push({
          code: 'EVIDENCE_STORE_ARTIFACT_INVALID',
          path: `${portablePath}:${reference.role}`,
          reason: verification.code,
        })
      }
    }

    records.push({
      envelope,
      source_artifact: buildPsdealsArtifactReference({
        ...loaded.reference,
        role: `${envelope.evidence_kind}_evidence`,
        artifact_kind: 'evidence_envelope',
        final_state: 'final',
        local_cycle_id: envelope.local_cycle_id,
        run_token: envelope.run_token,
      }),
    })
  }

  if (Array.isArray(expected_kinds)) {
    for (const kind of expected_kinds) {
      if (!kinds.has(kind)) errors.push({ code: 'EVIDENCE_STORE_EXPECTED_KIND_MISSING', path: kind })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    records,
    evidence_kinds: [...kinds].sort(),
    evidence_index_sha256: sha256PsdealsBytes(stablePsdealsEvidenceJson(
      records.map((record) => ({
        kind: record.envelope.evidence_kind,
        sha256: record.source_artifact.sha256,
      }))
    )),
  }
}
