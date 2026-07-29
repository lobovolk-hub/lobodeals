import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'

import { stablePsdealsEvidenceJson } from './psdeals-evidence-envelope.mjs'
import {
  readPsdealsArtifact,
  writePsdealsArtifactAtomic,
} from './psdeals-evidence-io.mjs'
import { resolvePsdealsCycleWorkspacePath } from './psdeals-cycle-workspace.mjs'

export const PSDEALS_CYCLE_LOCK_VERSION = 1
export const PSDEALS_STALE_LOCK_CONFIRMATION = 'CONFIRM_STALE_LOCK_TAKEOVER'

function parseTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function defaultOwnerToken() {
  return `owner_${crypto.randomBytes(18).toString('base64url')}`
}

function defaultOwnerLabel() {
  return `${os.hostname()}:${process.pid}`
}

async function lockPath(workspace) {
  return resolvePsdealsCycleWorkspacePath(workspace, 'locks/active.json')
}

function validateLock(lock, workspace) {
  const errors = []
  if (lock?.lock_version !== PSDEALS_CYCLE_LOCK_VERSION) {
    errors.push('LOCK_VERSION_INVALID')
  }
  if (lock?.local_cycle_id !== workspace.identity.local_cycle_id) {
    errors.push('LOCK_CYCLE_MISMATCH')
  }
  if (lock?.run_token !== workspace.identity.run_token) {
    errors.push('LOCK_RUN_TOKEN_MISMATCH')
  }
  if (!/^owner_[A-Za-z0-9_-]{12,}$/.test(String(lock?.owner_token || ''))) {
    errors.push('LOCK_OWNER_TOKEN_INVALID')
  }
  if (!parseTimestamp(lock?.acquired_at) || !parseTimestamp(lock?.heartbeat_at)) {
    errors.push('LOCK_TIMESTAMP_INVALID')
  }
  return { valid: errors.length === 0, errors }
}

export async function inspectPsdealsCycleLock({
  workspace,
  now = () => new Date(),
  stale_after_ms = 30 * 60 * 1000,
} = {}) {
  const filePath = await lockPath(workspace)
  try {
    const loaded = await readPsdealsArtifact({
      root_dir: workspace.root_dir,
      file_path: filePath,
      role: 'cycle_lock',
      artifact_kind: 'cycle_lock',
    })
    let lock
    try {
      lock = JSON.parse(loaded.bytes.toString('utf8'))
    } catch {
      return { status: 'corrupt', lock: null, errors: ['LOCK_JSON_INVALID'] }
    }
    const validation = validateLock(lock, workspace)
    if (!validation.valid) {
      return { status: 'corrupt', lock, errors: validation.errors }
    }
    const nowValue = now()
    const nowDate = nowValue instanceof Date ? nowValue : new Date(nowValue)
    const heartbeat = parseTimestamp(lock.heartbeat_at)
    const ageMs = nowDate.getTime() - heartbeat.getTime()
    return {
      status: ageMs > stale_after_ms ? 'stale' : 'active',
      lock,
      age_ms: ageMs,
      errors: [],
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { status: 'absent', lock: null, errors: [] }
    }
    throw error
  }
}

export async function acquirePsdealsCycleLock({
  workspace,
  now = () => new Date(),
  generate_owner_token = defaultOwnerToken,
  owner_label = defaultOwnerLabel(),
} = {}) {
  const filePath = await lockPath(workspace)
  const nowValue = now()
  const acquiredAt =
    nowValue instanceof Date ? nowValue.toISOString() : new Date(nowValue).toISOString()
  const lock = {
    lock_version: PSDEALS_CYCLE_LOCK_VERSION,
    local_cycle_id: workspace.identity.local_cycle_id,
    run_token: workspace.identity.run_token,
    owner_token: generate_owner_token(),
    owner_label,
    acquired_at: acquiredAt,
    heartbeat_at: acquiredAt,
  }
  const validation = validateLock(lock, workspace)
  if (!validation.valid) {
    throw new Error(`LOCK_INVALID: ${validation.errors.join(',')}`)
  }

  let handle
  try {
    handle = await fs.open(filePath, 'wx')
    await handle.writeFile(stablePsdealsEvidenceJson(lock), 'utf8')
    await handle.sync()
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('CYCLE_LOCK_ACTIVE')
    throw error
  } finally {
    await handle?.close()
  }
  return lock
}

export async function releasePsdealsCycleLock({
  workspace,
  owner_token,
} = {}) {
  const inspected = await inspectPsdealsCycleLock({ workspace })
  if (inspected.status === 'absent') return { released: false, reason: 'absent' }
  if (inspected.status === 'corrupt') throw new Error('CYCLE_LOCK_CORRUPT')
  if (inspected.lock.owner_token !== owner_token) {
    throw new Error('CYCLE_LOCK_NOT_OWNED')
  }
  await fs.unlink(await lockPath(workspace))
  return { released: true }
}

export async function takeOverStalePsdealsCycleLock({
  workspace,
  expected_owner_token,
  confirmation,
  now = () => new Date(),
  stale_after_ms = 30 * 60 * 1000,
  generate_owner_token = defaultOwnerToken,
  owner_label = defaultOwnerLabel(),
} = {}) {
  if (confirmation !== PSDEALS_STALE_LOCK_CONFIRMATION) {
    throw new Error('STALE_LOCK_CONFIRMATION_REQUIRED')
  }
  const inspected = await inspectPsdealsCycleLock({
    workspace,
    now,
    stale_after_ms,
  })
  if (inspected.status !== 'stale') throw new Error('LOCK_NOT_VERIFIED_STALE')
  if (inspected.lock.owner_token !== expected_owner_token) {
    throw new Error('STALE_LOCK_OWNER_CHANGED')
  }

  const activePath = await lockPath(workspace)
  const performedAtValue = now()
  const performedAt =
    performedAtValue instanceof Date
      ? performedAtValue.toISOString()
      : new Date(performedAtValue).toISOString()
  const receiptName = `receipts/stale-lock-${inspected.lock.acquired_at.replaceAll(':', '-')}.json`
  const receiptPath = await resolvePsdealsCycleWorkspacePath(
    workspace,
    receiptName
  )
  await writePsdealsArtifactAtomic({
    output_path: receiptPath,
    root_dir: workspace.root_dir,
    content: stablePsdealsEvidenceJson({
      action: 'stale_lock_takeover',
      performed_at: performedAt,
      previous_lock: inspected.lock,
    }),
  })
  const current = await inspectPsdealsCycleLock({
    workspace,
    now: () => new Date(performedAt),
    stale_after_ms,
  })
  if (
    current.status !== 'stale' ||
    current.lock?.owner_token !== expected_owner_token
  ) {
    throw new Error('STALE_LOCK_OWNER_CHANGED')
  }
  await fs.unlink(activePath)
  return acquirePsdealsCycleLock({
    workspace,
    now,
    generate_owner_token,
    owner_label,
  })
}
