import crypto from 'node:crypto'

export const PSDEALS_EVIDENCE_VERSION = 1

export const PSDEALS_EVIDENCE_KINDS = Object.freeze([
  'listing_collection',
  'fast_refresh_analysis',
  'detail_import',
  'detail_retry',
  'ended_deals_analysis',
])

export const PSDEALS_EVIDENCE_STATUSES = Object.freeze([
  'succeeded',
  'partial',
  'failed',
  'indeterminate',
  'untracked',
])

export const PSDEALS_EVIDENCE_MODES = Object.freeze([
  'real_recorded',
  'offline_fixture',
  'legacy_untracked',
])

export const PSDEALS_ARTIFACT_FINAL_STATES = Object.freeze([
  'final',
  'partial',
  'failed',
])

export const PSDEALS_EVIDENCE_REASON_CODES = Object.freeze({
  VERSION_UNSUPPORTED: 'EVIDENCE_VERSION_UNSUPPORTED',
  KIND_UNSUPPORTED: 'EVIDENCE_KIND_UNSUPPORTED',
  IDENTITY_MISSING: 'EVIDENCE_IDENTITY_MISSING',
  RUN_TOKEN_MISSING: 'EVIDENCE_RUN_TOKEN_MISSING',
  REGION_INVALID: 'EVIDENCE_REGION_INVALID',
  STOREFRONT_INVALID: 'EVIDENCE_STOREFRONT_INVALID',
  TIMESTAMP_INVALID: 'EVIDENCE_TIMESTAMP_INVALID',
  TIMESTAMPS_INVERTED: 'EVIDENCE_TIMESTAMPS_INVERTED',
  TIMESTAMP_FUTURE: 'EVIDENCE_TIMESTAMP_FUTURE',
  ARTIFACT_INVALID: 'EVIDENCE_ARTIFACT_INVALID',
  ARTIFACT_HASH_INVALID: 'EVIDENCE_ARTIFACT_HASH_INVALID',
  ARTIFACT_PATH_NOT_PORTABLE: 'EVIDENCE_ARTIFACT_PATH_NOT_PORTABLE',
  FILTER_FINGERPRINT_MISMATCH: 'EVIDENCE_FILTER_FINGERPRINT_MISMATCH',
  SENSITIVE_FIELD_PRESENT: 'EVIDENCE_SENSITIVE_FIELD_PRESENT',
  UNDEFINED_VALUE_PRESENT: 'EVIDENCE_UNDEFINED_VALUE_PRESENT',
})

const HASH_PATTERN = /^[a-f0-9]{64}$/i
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000
const EXPECTED_PLATFORMS = ['PS5', 'PS4']
const EXPECTED_CONTENT_TYPES = ['games', 'bundles', 'dlc']

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function issue(code, path, message, kind = 'invalid') {
  return { code, path, message, kind }
}

function normalizeStringList(values, transform = (value) => value) {
  if (!Array.isArray(values)) return []
  return [
    ...new Set(
      values
        .filter((value) => typeof value === 'string')
        .map((value) => transform(value.trim()))
        .filter(Boolean)
    ),
  ]
}

export function sanitizePsdealsEvidenceValue(value) {
  if (value === undefined) return undefined
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizePsdealsEvidenceValue(entry))
      .filter((entry) => entry !== undefined)
  }
  if (!isObject(value)) return value

  const output = {}
  for (const [key, entry] of Object.entries(value)) {
    const sanitized = sanitizePsdealsEvidenceValue(entry)
    if (sanitized !== undefined) output[key] = sanitized
  }
  return output
}

export function canonicalizePsdealsEvidenceValue(value) {
  const sanitized = sanitizePsdealsEvidenceValue(value)
  if (Array.isArray(sanitized)) {
    return sanitized.map((entry) => canonicalizePsdealsEvidenceValue(entry))
  }
  if (!isObject(sanitized)) return sanitized

  return Object.fromEntries(
    Object.keys(sanitized)
      .sort()
      .map((key) => [key, canonicalizePsdealsEvidenceValue(sanitized[key])])
  )
}

export function stablePsdealsEvidenceJson(value, space = 2) {
  return `${JSON.stringify(canonicalizePsdealsEvidenceValue(value), null, space)}\n`
}

export function sha256PsdealsBytes(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

export function normalizePsdealsPortablePath(value) {
  if (!isNonEmptyString(value)) return null
  return value.trim().replaceAll('\\', '/').replace(/^\.\//, '')
}

export function isPsdealsPortablePath(value) {
  const normalized = normalizePsdealsPortablePath(value)
  if (!normalized) return false
  if (normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return false
  if (normalized.split('/').includes('..')) return false
  return !normalized.includes('\u0000')
}

export function buildPsdealsFilterContext({
  requested_url,
  platforms = [],
  content_types = [],
  order = null,
  limits = {},
} = {}) {
  const platformSet = new Set(
    normalizeStringList(platforms, (value) => value.toUpperCase())
  )
  const contentSet = new Set(
    normalizeStringList(content_types, (value) => value.toLowerCase())
  )
  const normalized = sanitizePsdealsEvidenceValue({
    requested_url: isNonEmptyString(requested_url) ? requested_url.trim() : null,
    platforms: [
      ...EXPECTED_PLATFORMS.filter((value) => platformSet.has(value)),
      ...[...platformSet]
        .filter((value) => !EXPECTED_PLATFORMS.includes(value))
        .sort(),
    ],
    content_types: [
      ...EXPECTED_CONTENT_TYPES.filter((value) => contentSet.has(value)),
      ...[...contentSet]
        .filter((value) => !EXPECTED_CONTENT_TYPES.includes(value))
        .sort(),
    ],
    order: isNonEmptyString(order) ? order.trim() : null,
    limits: isObject(limits) ? limits : {},
  })

  const filterIdentity = {
    requested_url: normalized.requested_url,
    platforms: normalized.platforms,
    content_types: normalized.content_types,
    order: normalized.order,
  }

  return {
    ...normalized,
    fingerprint: sha256PsdealsBytes(
      JSON.stringify(canonicalizePsdealsEvidenceValue(filterIdentity))
    ),
  }
}

export function buildPsdealsArtifactReference({
  role,
  path,
  sha256,
  size_bytes,
  artifact_kind,
  final_state = 'final',
  local_cycle_id,
  run_token,
} = {}) {
  return sanitizePsdealsEvidenceValue({
    role: isNonEmptyString(role) ? role.trim() : role,
    path: normalizePsdealsPortablePath(path),
    sha256: isNonEmptyString(sha256) ? sha256.trim().toLowerCase() : sha256,
    size_bytes,
    artifact_kind: isNonEmptyString(artifact_kind)
      ? artifact_kind.trim()
      : artifact_kind,
    final_state,
    local_cycle_id,
    run_token,
  })
}

export function buildPsdealsEvidenceEnvelope({
  evidence_kind,
  local_cycle_id,
  run_token,
  producer,
  producer_version,
  code_revision,
  region_code,
  storefront,
  mode,
  started_at,
  finished_at,
  generated_at,
  remote_cycle_id,
  context,
  inputs = [],
  outputs = [],
  status,
  payload = {},
  errors = [],
  warnings = [],
  reason_codes = [],
  extensions,
} = {}) {
  return sanitizePsdealsEvidenceValue({
    evidence_version: PSDEALS_EVIDENCE_VERSION,
    evidence_kind,
    local_cycle_id,
    run_token,
    remote_cycle_id,
    producer,
    producer_version,
    code_revision,
    region_code,
    storefront,
    mode,
    started_at,
    finished_at,
    generated_at,
    context,
    inputs,
    outputs,
    status,
    payload,
    errors,
    warnings,
    reason_codes: [...new Set(reason_codes.filter(isNonEmptyString))],
    extensions,
  })
}

function findUndefined(value, currentPath = '$', findings = []) {
  if (value === undefined) {
    findings.push(currentPath)
    return findings
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      findUndefined(entry, `${currentPath}[${index}]`, findings)
    )
    return findings
  }
  if (!isObject(value)) return findings
  for (const [key, entry] of Object.entries(value)) {
    findUndefined(entry, `${currentPath}.${key}`, findings)
  }
  return findings
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
      /(?:secret|password|api[_-]?key|service[_-]?role|access[_-]?token|bearer|authorization|cookie|headers?)/i.test(
        key
      )
    ) {
      findings.push(nextPath)
    }
    findSensitiveFields(entry, nextPath, findings)
  }
  return findings
}

function validateArtifactReference(reference, path, errors) {
  if (!isObject(reference)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.ARTIFACT_INVALID,
        path,
        'Artifact reference must be an object.'
      )
    )
    return
  }

  for (const field of ['role', 'artifact_kind']) {
    if (!isNonEmptyString(reference[field])) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_REASON_CODES.ARTIFACT_INVALID,
          `${path}.${field}`,
          `${field} is required.`
        )
      )
    }
  }
  if (!isPsdealsPortablePath(reference.path)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.ARTIFACT_PATH_NOT_PORTABLE,
        `${path}.path`,
        'Artifact path must be relative, portable, and must not escape its root.'
      )
    )
  }
  if (!isNonEmptyString(reference.sha256) || !HASH_PATTERN.test(reference.sha256)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.ARTIFACT_HASH_INVALID,
        `${path}.sha256`,
        'Artifact SHA-256 must contain 64 hexadecimal characters.'
      )
    )
  }
  if (!isNonNegativeInteger(reference.size_bytes)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.ARTIFACT_INVALID,
        `${path}.size_bytes`,
        'Artifact size must be a non-negative integer.'
      )
    )
  }
  if (!PSDEALS_ARTIFACT_FINAL_STATES.includes(reference.final_state)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.ARTIFACT_INVALID,
        `${path}.final_state`,
        'Artifact final state is invalid.'
      )
    )
  }
  if (reference.artifact_kind === 'evidence_envelope') {
    if (
      !isNonEmptyString(reference.local_cycle_id) ||
      !isNonEmptyString(reference.run_token)
    ) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_REASON_CODES.ARTIFACT_INVALID,
          path,
          'Evidence-envelope references must carry cycle and run identity.'
        )
      )
    }
  }
}

function parseTimestamp(value) {
  if (!isNonEmptyString(value)) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function validatePsdealsEvidenceEnvelope(envelopeInput, options = {}) {
  const envelope = sanitizePsdealsEvidenceValue(envelopeInput)
  const errors = []
  const warnings = []
  const now = parseTimestamp(options.now) || new Date()
  const futureToleranceMs = Number.isFinite(options.futureToleranceMs)
    ? options.futureToleranceMs
    : DEFAULT_FUTURE_TOLERANCE_MS

  if (!isObject(envelopeInput)) {
    errors.push(issue('EVIDENCE_NOT_OBJECT', '$', 'Evidence must be an object.'))
  }

  for (const path of findUndefined(envelopeInput)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.UNDEFINED_VALUE_PRESENT,
        path,
        'Undefined values must be omitted, not serialized as null.'
      )
    )
  }
  for (const path of findSensitiveFields(envelopeInput)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.SENSITIVE_FIELD_PRESENT,
        path,
        'Evidence must not contain secrets, credentials, cookies, or authentication headers.'
      )
    )
  }

  if (envelope?.evidence_version !== PSDEALS_EVIDENCE_VERSION) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.VERSION_UNSUPPORTED,
        'evidence_version',
        'Only evidence version 1 is supported.'
      )
    )
  }
  if (!PSDEALS_EVIDENCE_KINDS.includes(envelope?.evidence_kind)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.KIND_UNSUPPORTED,
        'evidence_kind',
        'Evidence kind is unsupported.'
      )
    )
  }
  if (!isNonEmptyString(envelope?.local_cycle_id)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.IDENTITY_MISSING,
        'local_cycle_id',
        'local_cycle_id must be supplied by the cycle creator.'
      )
    )
  }
  if (!isNonEmptyString(envelope?.run_token)) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.RUN_TOKEN_MISSING,
        'run_token',
        'run_token must be supplied by the cycle creator.'
      )
    )
  }
  if (envelope?.region_code !== 'us') {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.REGION_INVALID,
        'region_code',
        'Only region us is supported.'
      )
    )
  }
  if (envelope?.storefront !== 'playstation') {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.STOREFRONT_INVALID,
        'storefront',
        'Only storefront playstation is supported.'
      )
    )
  }
  if (!PSDEALS_EVIDENCE_MODES.includes(envelope?.mode)) {
    errors.push(issue('EVIDENCE_MODE_INVALID', 'mode', 'Evidence mode is invalid.'))
  }
  if (!PSDEALS_EVIDENCE_STATUSES.includes(envelope?.status)) {
    errors.push(
      issue('EVIDENCE_STATUS_INVALID', 'status', 'Evidence status is invalid.')
    )
  }
  if (!isNonEmptyString(envelope?.producer)) {
    errors.push(
      issue('EVIDENCE_PRODUCER_MISSING', 'producer', 'Producer name is required.')
    )
  }
  if (
    !isNonEmptyString(envelope?.producer_version) &&
    !isNonEmptyString(envelope?.code_revision)
  ) {
    errors.push(
      issue(
        'EVIDENCE_PRODUCER_REVISION_MISSING',
        'producer_version',
        'Producer version or code revision is required.'
      )
    )
  }
  if (
    envelope?.remote_cycle_id !== undefined &&
    envelope?.remote_cycle_id !== null &&
    (!UUID_PATTERN.test(String(envelope.remote_cycle_id)) ||
      envelope.mode !== 'real_recorded')
  ) {
    errors.push(
      issue(
        'EVIDENCE_REMOTE_CYCLE_ID_INVALID',
        'remote_cycle_id',
        'A remote cycle ID must be a real UUID attached to real recorded evidence.'
      )
    )
  }

  const startedAt = parseTimestamp(envelope?.started_at)
  const finishedAt = parseTimestamp(envelope?.finished_at)
  const generatedAt = parseTimestamp(envelope?.generated_at)
  for (const [field, parsed] of [
    ['started_at', startedAt],
    ['finished_at', finishedAt],
    ['generated_at', generatedAt],
  ]) {
    if (!parsed) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_REASON_CODES.TIMESTAMP_INVALID,
          field,
          `${field} must be an explicit ISO timestamp.`
        )
      )
    } else if (parsed.getTime() > now.getTime() + futureToleranceMs) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_REASON_CODES.TIMESTAMP_FUTURE,
          field,
          `${field} is beyond the allowed future tolerance.`
        )
      )
    }
  }
  if (
    startedAt &&
    finishedAt &&
    generatedAt &&
    (finishedAt < startedAt || generatedAt < finishedAt)
  ) {
    errors.push(
      issue(
        PSDEALS_EVIDENCE_REASON_CODES.TIMESTAMPS_INVERTED,
        'finished_at',
        'Evidence timestamps must satisfy started_at <= finished_at <= generated_at.'
      )
    )
  }

  if (!isObject(envelope?.context)) {
    errors.push(
      issue('EVIDENCE_CONTEXT_MISSING', 'context', 'Evidence context is required.')
    )
  } else {
    const recomputed = buildPsdealsFilterContext(envelope.context)
    if (envelope.context.fingerprint !== recomputed.fingerprint) {
      errors.push(
        issue(
          PSDEALS_EVIDENCE_REASON_CODES.FILTER_FINGERPRINT_MISMATCH,
          'context.fingerprint',
          'Filter fingerprint does not match the canonical context.'
        )
      )
    }
  }

  for (const collectionName of ['inputs', 'outputs']) {
    const references = envelope?.[collectionName]
    if (!Array.isArray(references)) {
      errors.push(
        issue(
          'EVIDENCE_ARTIFACT_COLLECTION_INVALID',
          collectionName,
          `${collectionName} must be an array.`
        )
      )
      continue
    }
    const roles = new Set()
    references.forEach((reference, index) => {
      validateArtifactReference(
        reference,
        `${collectionName}[${index}]`,
        errors
      )
      if (isNonEmptyString(reference?.role)) {
        if (roles.has(reference.role)) {
          errors.push(
            issue(
              'EVIDENCE_ARTIFACT_ROLE_DUPLICATE',
              `${collectionName}[${index}].role`,
              'Artifact roles must be unique within each collection.'
            )
          )
        }
        roles.add(reference.role)
      }
    })
  }

  if (!isObject(envelope?.payload)) {
    errors.push(issue('EVIDENCE_PAYLOAD_INVALID', 'payload', 'Payload is required.'))
  }
  for (const field of ['errors', 'warnings', 'reason_codes']) {
    if (!Array.isArray(envelope?.[field])) {
      errors.push(
        issue('EVIDENCE_DIAGNOSTICS_INVALID', field, `${field} must be an array.`)
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    reason_codes: [...new Set([...errors, ...warnings].map((entry) => entry.code))],
    normalized_envelope: envelope,
    is_success_evidence: errors.length === 0 && envelope?.status === 'succeeded',
  }
}
