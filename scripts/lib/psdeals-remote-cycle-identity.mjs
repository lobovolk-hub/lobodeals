import path from 'node:path'

import { stablePsdealsEvidenceJson } from './psdeals-evidence-envelope.mjs'
import {
  readPsdealsArtifact,
  writePsdealsArtifactAtomic,
} from './psdeals-evidence-io.mjs'

export const PSDEALS_REMOTE_CYCLE_IDENTITY_VERSION = 1
export const PSDEALS_REMOTE_CYCLE_IDENTITY_PATH = 'state/remote-cycle-identity.json'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LOCAL_CYCLE_PATTERN = /^local-cycle-[a-z0-9][a-z0-9_-]{7,}$/

function timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function validatePsdealsRemoteCycleIdentity(bindingInput, { workspace } = {}) {
  const binding = bindingInput && typeof bindingInput === 'object' ? bindingInput : {}
  const blockers = []
  if (binding.identity_version !== PSDEALS_REMOTE_CYCLE_IDENTITY_VERSION) {
    blockers.push('remote_cycle_identity_version_invalid')
  }
  if (!LOCAL_CYCLE_PATTERN.test(String(binding.local_cycle_id || ''))) {
    blockers.push('remote_cycle_local_identity_invalid')
  }
  if (workspace?.identity?.local_cycle_id &&
      binding.local_cycle_id !== workspace.identity.local_cycle_id) {
    blockers.push('remote_cycle_local_identity_mismatch')
  }
  if (!UUID_PATTERN.test(String(binding.remote_cycle_id || ''))) {
    blockers.push('remote_cycle_uuid_invalid')
  }
  if (typeof binding.authorization_id !== 'string' || !binding.authorization_id.trim()) {
    blockers.push('remote_cycle_authorization_id_missing')
  }
  if (binding.idempotency_key !== `create-cycle:${binding.local_cycle_id || 'missing'}`) {
    blockers.push('remote_cycle_idempotency_key_mismatch')
  }
  if (typeof binding.remote_receipt_id !== 'string' || !binding.remote_receipt_id.trim()) {
    blockers.push('remote_cycle_receipt_id_missing')
  }
  if (!timestamp(binding.bound_at)) blockers.push('remote_cycle_bound_at_invalid')
  return {
    valid: blockers.length === 0,
    blockers: [...new Set(blockers)],
    binding,
  }
}

async function readBinding(workspace) {
  const filePath = path.join(workspace.root_dir, ...PSDEALS_REMOTE_CYCLE_IDENTITY_PATH.split('/'))
  try {
    const loaded = await readPsdealsArtifact({
      root_dir: workspace.root_dir,
      file_path: filePath,
      portable_path: PSDEALS_REMOTE_CYCLE_IDENTITY_PATH,
      role: 'remote_cycle_identity',
      artifact_kind: 'remote_cycle_identity',
    })
    return {
      exists: true,
      binding: JSON.parse(loaded.bytes.toString('utf8')),
      reference: loaded.reference,
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, binding: null, reference: null }
    throw error
  }
}

export async function readPsdealsRemoteCycleIdentity({ workspace } = {}) {
  if (!workspace?.root_dir || !workspace?.identity?.local_cycle_id) {
    throw new Error('REMOTE_CYCLE_WORKSPACE_REQUIRED')
  }
  const loaded = await readBinding(workspace)
  if (!loaded.exists) {
    return { exists: false, valid: true, blockers: [], binding: null, reference: null }
  }
  const validation = validatePsdealsRemoteCycleIdentity(loaded.binding, { workspace })
  return { ...loaded, ...validation }
}

export async function bindPsdealsRemoteCycleIdentity({
  workspace,
  remote_cycle_id,
  authorization_id,
  remote_receipt_id,
  bound_at,
} = {}) {
  if (!workspace?.root_dir || !workspace?.identity?.local_cycle_id) {
    throw new Error('REMOTE_CYCLE_WORKSPACE_REQUIRED')
  }
  const proposed = {
    identity_version: PSDEALS_REMOTE_CYCLE_IDENTITY_VERSION,
    local_cycle_id: workspace.identity.local_cycle_id,
    remote_cycle_id,
    authorization_id,
    idempotency_key: `create-cycle:${workspace.identity.local_cycle_id}`,
    remote_receipt_id,
    bound_at,
  }
  const validation = validatePsdealsRemoteCycleIdentity(proposed, { workspace })
  if (!validation.valid) {
    throw new Error(`REMOTE_CYCLE_IDENTITY_INVALID: ${validation.blockers.join(',')}`)
  }

  const existing = await readBinding(workspace)
  if (existing.exists) {
    const existingValidation = validatePsdealsRemoteCycleIdentity(existing.binding, { workspace })
    if (!existingValidation.valid) {
      throw new Error(`REMOTE_CYCLE_IDENTITY_CORRUPT: ${existingValidation.blockers.join(',')}`)
    }
    const sameImmutableIdentity = [
      'local_cycle_id',
      'remote_cycle_id',
      'authorization_id',
      'idempotency_key',
      'remote_receipt_id',
    ].every((key) => existing.binding[key] === proposed[key])
    if (!sameImmutableIdentity) throw new Error('REMOTE_CYCLE_IDENTITY_ALREADY_BOUND')
    return { created: false, reconciled: true, ...existing }
  }

  const outputPath = path.join(workspace.root_dir, ...PSDEALS_REMOTE_CYCLE_IDENTITY_PATH.split('/'))
  await writePsdealsArtifactAtomic({
    output_path: outputPath,
    root_dir: workspace.root_dir,
    content: stablePsdealsEvidenceJson(proposed),
  })
  const created = await readBinding(workspace)
  return { created: true, reconciled: false, ...created }
}

export async function attachPsdealsRemoteCycleIdentity(workspace) {
  const loaded = await readPsdealsRemoteCycleIdentity({ workspace })
  if (!loaded.valid) {
    throw new Error(`REMOTE_CYCLE_IDENTITY_CORRUPT: ${loaded.blockers.join(',')}`)
  }
  return {
    ...workspace,
    remote_cycle_id: loaded.binding?.remote_cycle_id || null,
    remote_cycle_identity: loaded.binding,
    remote_cycle_identity_reference: loaded.reference,
  }
}
