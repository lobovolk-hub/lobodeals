import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  buildPsdealsFilterContext,
  stablePsdealsEvidenceJson,
} from './psdeals-evidence-envelope.mjs'
import {
  readPsdealsArtifact,
  writePsdealsArtifactAtomic,
} from './psdeals-evidence-io.mjs'

export const PSDEALS_CYCLE_WORKSPACE_VERSION = 1
export const PSDEALS_CYCLE_WORKSPACE_MODES = Object.freeze([
  'plan',
  'fixture',
  'offline_validation',
  'operational',
])
export const PSDEALS_CYCLE_WORKSPACE_DIRECTORIES = Object.freeze([
  'state',
  'artifacts',
  'evidence',
  'logs',
  'manifest',
  'locks',
  'receipts',
])

const LOCAL_CYCLE_PATTERN = /^local-cycle-[a-z0-9][a-z0-9_-]{7,}$/
const RUN_TOKEN_PATTERN = /^run_[A-Za-z0-9_-]{16,}$/

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function parseTimestamp(value) {
  if (!isNonEmptyString(value)) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function issue(code, pathValue, message) {
  return { code, path: pathValue, message }
}

function randomOpaqueToken(bytes = 18) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function defaultLocalCycleId(createdAt) {
  const compact = createdAt
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.\d{3}Z$/, 'z')
    .toLowerCase()
  return `local-cycle-${compact}-${randomOpaqueToken(6).toLowerCase()}`
}

function defaultRunToken() {
  return `run_${randomOpaqueToken(24)}`
}

function findSensitiveFields(value, currentPath = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      findSensitiveFields(entry, `${currentPath}[${index}]`, findings)
    )
    return findings
  }
  if (!isObject(value)) return findings
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${currentPath}.${key}`
    if (
      /(?:secret|password|api[_-]?key|service[_-]?role|access[_-]?token|bearer|authorization|cookie|headers?|environment)/i.test(
        key
      )
    ) {
      findings.push(nextPath)
    }
    findSensitiveFields(entry, nextPath, findings)
  }
  return findings
}

function sameStringArrays(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function normalizeForPathComparison(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isWithinRoot(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
}

export function validatePsdealsCycleWorkspaceIdentity(identityInput) {
  const identity = isObject(identityInput) ? identityInput : {}
  const errors = []

  if (identity.workspace_version !== PSDEALS_CYCLE_WORKSPACE_VERSION) {
    errors.push(
      issue(
        'WORKSPACE_VERSION_UNSUPPORTED',
        'workspace_version',
        'Only cycle workspace version 1 is supported.'
      )
    )
  }
  if (!LOCAL_CYCLE_PATTERN.test(String(identity.local_cycle_id || ''))) {
    errors.push(
      issue(
        'WORKSPACE_LOCAL_CYCLE_ID_INVALID',
        'local_cycle_id',
        'local_cycle_id must be visibly local and path-safe.'
      )
    )
  }
  if (!RUN_TOKEN_PATTERN.test(String(identity.run_token || ''))) {
    errors.push(
      issue(
        'WORKSPACE_RUN_TOKEN_INVALID',
        'run_token',
        'run_token must be an opaque non-secret correlation token.'
      )
    )
  }
  if (!parseTimestamp(identity.created_at)) {
    errors.push(
      issue(
        'WORKSPACE_CREATED_AT_INVALID',
        'created_at',
        'created_at must be an explicit ISO timestamp.'
      )
    )
  }
  if (!PSDEALS_CYCLE_WORKSPACE_MODES.includes(identity.mode)) {
    errors.push(
      issue('WORKSPACE_MODE_INVALID', 'mode', 'Workspace mode is unsupported.')
    )
  }
  if (identity.region_code !== 'us') {
    errors.push(
      issue('WORKSPACE_REGION_INVALID', 'region_code', 'Only region us is supported.')
    )
  }
  if (identity.storefront !== 'playstation') {
    errors.push(
      issue(
        'WORKSPACE_STOREFRONT_INVALID',
        'storefront',
        'Only storefront playstation is supported.'
      )
    )
  }
  if (identity.remote_cycle_id !== null) {
    errors.push(
      issue(
        'WORKSPACE_REMOTE_CYCLE_ID_MUST_START_NULL',
        'remote_cycle_id',
        'A local workspace cannot invent a remote cycle UUID.'
      )
    )
  }
  if (!isNonEmptyString(identity.code_revision)) {
    errors.push(
      issue(
        'WORKSPACE_CODE_REVISION_MISSING',
        'code_revision',
        'A code revision is required.'
      )
    )
  }

  const expectedContext = buildPsdealsFilterContext(identity.context || {})
  if (
    identity.context?.fingerprint !== expectedContext.fingerprint ||
    identity.context?.requested_url !== expectedContext.requested_url ||
    identity.context?.order !== expectedContext.order ||
    !sameStringArrays(identity.context?.platforms, expectedContext.platforms) ||
    !sameStringArrays(
      identity.context?.content_types,
      expectedContext.content_types
    )
  ) {
    errors.push(
      issue(
        'WORKSPACE_FILTER_FINGERPRINT_MISMATCH',
        'context',
        'Canonical filters or fingerprint do not match.'
      )
    )
  }

  for (const pathValue of findSensitiveFields(identityInput)) {
    errors.push(
      issue(
        'WORKSPACE_SENSITIVE_FIELD_PRESENT',
        pathValue,
        'Workspace identity must not contain secrets or environment data.'
      )
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    reason_codes: [...new Set(errors.map((entry) => entry.code))],
    normalized_identity: identity,
  }
}

export function buildPsdealsCycleWorkspaceIdentity({
  local_cycle_id,
  run_token,
  created_at,
  mode,
  code_revision,
  context,
} = {}) {
  return {
    workspace_version: PSDEALS_CYCLE_WORKSPACE_VERSION,
    local_cycle_id,
    run_token,
    remote_cycle_id: null,
    created_at,
    mode,
    region_code: 'us',
    storefront: 'playstation',
    context: buildPsdealsFilterContext(context),
    code_revision,
  }
}

async function ensurePhysicalWorkspaceRoot(workspacePath) {
  const resolved = path.resolve(workspacePath)
  const real = await fs.realpath(resolved)
  if (normalizeForPathComparison(resolved) !== normalizeForPathComparison(real)) {
    throw new Error('WORKSPACE_ROOT_REPARSE_POINT_NOT_ALLOWED')
  }
  return real
}

export async function resolvePsdealsCycleWorkspacePath(
  workspace,
  portablePath,
  { must_exist = false } = {}
) {
  if (!isNonEmptyString(portablePath)) {
    throw new Error('WORKSPACE_PATH_REQUIRED')
  }
  const normalized = portablePath.replaceAll('\\', '/')
  if (
    normalized.startsWith('/') ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.split('/').includes('..') ||
    normalized.includes('\u0000')
  ) {
    throw new Error('WORKSPACE_PATH_NOT_PORTABLE')
  }
  const root = await ensurePhysicalWorkspaceRoot(workspace.root_dir)
  const candidate = path.resolve(root, normalized)
  if (!isWithinRoot(root, candidate)) {
    throw new Error('WORKSPACE_PATH_OUTSIDE_ROOT')
  }
  if (must_exist) {
    const realCandidate = await fs.realpath(candidate)
    if (!isWithinRoot(root, realCandidate)) {
      throw new Error('WORKSPACE_REALPATH_OUTSIDE_ROOT')
    }
  }
  return candidate
}

export async function initializePsdealsCycleWorkspace({
  cycles_root,
  mode = 'plan',
  code_revision,
  context,
  now = () => new Date(),
  generate_local_cycle_id = defaultLocalCycleId,
  generate_run_token = defaultRunToken,
} = {}) {
  if (!isNonEmptyString(cycles_root)) {
    throw new Error('CYCLES_ROOT_REQUIRED')
  }
  const createdAtValue = now()
  const createdAt =
    createdAtValue instanceof Date
      ? createdAtValue.toISOString()
      : new Date(createdAtValue).toISOString()
  const localCycleId = generate_local_cycle_id(createdAt)
  const runToken = generate_run_token()
  const identity = buildPsdealsCycleWorkspaceIdentity({
    local_cycle_id: localCycleId,
    run_token: runToken,
    created_at: createdAt,
    mode,
    code_revision,
    context,
  })
  const validation = validatePsdealsCycleWorkspaceIdentity(identity)
  if (!validation.valid) {
    throw new Error(
      `WORKSPACE_IDENTITY_INVALID: ${validation.reason_codes.join(',')}`
    )
  }

  const cyclesRoot = path.resolve(cycles_root)
  await fs.mkdir(cyclesRoot, { recursive: true })
  const realCyclesRoot = await fs.realpath(cyclesRoot)
  const workspacePath = path.resolve(realCyclesRoot, localCycleId)
  if (!isWithinRoot(realCyclesRoot, workspacePath)) {
    throw new Error('WORKSPACE_PATH_OUTSIDE_CYCLES_ROOT')
  }
  await fs.mkdir(workspacePath, { recursive: false })
  for (const directory of PSDEALS_CYCLE_WORKSPACE_DIRECTORIES) {
    await fs.mkdir(path.join(workspacePath, directory), { recursive: false })
  }

  await writePsdealsArtifactAtomic({
    output_path: path.join(workspacePath, 'identity.json'),
    root_dir: workspacePath,
    content: stablePsdealsEvidenceJson(identity),
  })

  return openPsdealsCycleWorkspace({ workspace_dir: workspacePath })
}

export async function openPsdealsCycleWorkspace({ workspace_dir } = {}) {
  if (!isNonEmptyString(workspace_dir)) {
    throw new Error('WORKSPACE_DIRECTORY_REQUIRED')
  }
  const root = await ensurePhysicalWorkspaceRoot(workspace_dir)
  const identityFile = await readPsdealsArtifact({
    root_dir: root,
    file_path: path.join(root, 'identity.json'),
    role: 'workspace_identity',
    artifact_kind: 'cycle_workspace_identity',
  })
  const identity = JSON.parse(identityFile.bytes.toString('utf8'))
  const validation = validatePsdealsCycleWorkspaceIdentity(identity)
  if (!validation.valid) {
    throw new Error(
      `WORKSPACE_IDENTITY_CORRUPT: ${validation.reason_codes.join(',')}`
    )
  }
  if (path.basename(root) !== identity.local_cycle_id) {
    throw new Error('WORKSPACE_DIRECTORY_IDENTITY_MISMATCH')
  }

  for (const directory of PSDEALS_CYCLE_WORKSPACE_DIRECTORIES) {
    const directoryPath = path.join(root, directory)
    const stats = await fs.lstat(directoryPath)
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`WORKSPACE_DIRECTORY_INVALID: ${directory}`)
    }
    const realDirectory = await fs.realpath(directoryPath)
    if (!isWithinRoot(root, realDirectory)) {
      throw new Error(`WORKSPACE_DIRECTORY_OUTSIDE_ROOT: ${directory}`)
    }
  }

  return {
    root_dir: root,
    identity,
    identity_reference: identityFile.reference,
  }
}

async function inspectDirectory(workspace, directoryName) {
  const directory = await resolvePsdealsCycleWorkspacePath(
    workspace,
    directoryName,
    { must_exist: true }
  )
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(`WORKSPACE_REPARSE_POINT_NOT_ALLOWED: ${directoryName}/${entry.name}`)
    }
    if (entry.isFile()) {
      const filePath = path.join(directory, entry.name)
      const loaded = await readPsdealsArtifact({
        root_dir: workspace.root_dir,
        file_path: filePath,
        role: 'workspace_file',
        artifact_kind: directoryName,
      })
      files.push(loaded.reference)
    } else if (entry.isDirectory()) {
      throw new Error(
        `WORKSPACE_UNEXPECTED_NESTED_DIRECTORY: ${directoryName}/${entry.name}`
      )
    }
  }
  return files
}

export async function inspectPsdealsCycleWorkspace(workspaceInput) {
  const workspace = await openPsdealsCycleWorkspace({
    workspace_dir: workspaceInput.root_dir,
  })
  const directories = {}
  for (const directory of PSDEALS_CYCLE_WORKSPACE_DIRECTORIES) {
    directories[directory] = await inspectDirectory(workspace, directory)
  }
  return {
    valid: true,
    identity: workspace.identity,
    directories,
    artifact_count: Object.values(directories).reduce(
      (total, entries) => total + entries.length,
      0
    ),
  }
}

export async function finalizePsdealsCycleWorkspace({
  workspace,
  status,
  finished_at,
  manifest_reference = null,
  reason_codes = [],
} = {}) {
  const allowed = new Set([
    'fixture_complete',
    'operational_complete',
    'blocked',
    'failed',
    'ready_for_authorized_operation',
  ])
  if (!allowed.has(status) || !parseTimestamp(finished_at)) {
    throw new Error('WORKSPACE_FINALIZATION_INVALID')
  }
  const outputPath = await resolvePsdealsCycleWorkspacePath(
    workspace,
    'state/finalization.json'
  )
  return writePsdealsArtifactAtomic({
    output_path: outputPath,
    root_dir: workspace.root_dir,
    content: stablePsdealsEvidenceJson({
      local_cycle_id: workspace.identity.local_cycle_id,
      run_token: workspace.identity.run_token,
      status,
      finished_at,
      manifest_reference,
      reason_codes: [...new Set(reason_codes)],
    }),
  })
}
