import fs from 'node:fs/promises'

import { PSDEALS_DAILY_CYCLE_STEPS } from './psdeals-cycle-plan.mjs'
import {
  sha256PsdealsBytes,
  stablePsdealsEvidenceJson,
} from './psdeals-evidence-envelope.mjs'
import { writePsdealsArtifactAtomic } from './psdeals-evidence-io.mjs'
import { inspectPsdealsCycleLock } from './psdeals-cycle-lock.mjs'
import { resolvePsdealsCycleWorkspacePath } from './psdeals-cycle-workspace.mjs'

export const PSDEALS_CYCLE_LEDGER_VERSION = 1
export const PSDEALS_CYCLE_STAGE_STATUSES = Object.freeze([
  'pending',
  'ready',
  'running',
  'succeeded',
  'partial',
  'failed',
  'blocked',
  'skipped',
  'awaiting_authorization',
])

const TERMINAL_STATUSES = new Set([
  'succeeded',
  'partial',
  'failed',
  'blocked',
  'skipped',
  'awaiting_authorization',
])
const HASH_PATTERN = /^[a-f0-9]{64}$/
const STAGE_NAMES = PSDEALS_DAILY_CYCLE_STEPS.map((stage) => stage.name)
const STAGE_INDEX = new Map(STAGE_NAMES.map((stage, index) => [stage, index]))
const SKIP_REASONS = Object.freeze({
  retry_details: new Set(['no_initial_failures']),
})

function parseTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))]
}

function hashes(values) {
  return uniqueStrings(values).map((value) => value.toLowerCase())
}

export function redactPsdealsCycleDiagnostic(value, extraSecrets = []) {
  let output = value instanceof Error ? value.message : String(value ?? '')
  for (const secret of uniqueStrings(extraSecrets)) {
    output = output.split(secret).join('[REDACTED]')
  }
  output = output.replace(
    /\b(password|secret|api[_-]?key|service[_-]?role|access[_-]?token|authorization|cookie)\s*[=:]\s*[^\s,;]+/gi,
    '$1=[REDACTED]'
  )
  output = output.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
  return output
}

function entryBody(input, { sequence, previousHash, workspace }) {
  const status = input.status
  const stage = input.stage
  return {
    ledger_version: PSDEALS_CYCLE_LEDGER_VERSION,
    sequence,
    previous_entry_sha256: previousHash,
    local_cycle_id: workspace.identity.local_cycle_id,
    run_token: workspace.identity.run_token,
    stage,
    attempt: input.attempt,
    started_at: input.started_at,
    finished_at: input.finished_at ?? null,
    recorded_at: input.recorded_at,
    status,
    mode: workspace.identity.mode,
    input_hashes: hashes(input.input_hashes),
    output_hashes: hashes(input.output_hashes),
    evidence_path: input.evidence_path ?? null,
    exit_code: input.exit_code ?? null,
    reason_codes: uniqueStrings(input.reason_codes),
    errors: (Array.isArray(input.errors) ? input.errors : []).map((value) =>
      redactPsdealsCycleDiagnostic(value, input.redact_values)
    ),
    warnings: (Array.isArray(input.warnings) ? input.warnings : []).map((value) =>
      redactPsdealsCycleDiagnostic(value, input.redact_values)
    ),
    authorization_required: input.authorization_required === true,
    authorization_id: input.authorization_id ?? null,
    authorization_permission: input.authorization_permission ?? null,
    external_action_requested: input.external_action_requested ?? null,
    external_action_performed: input.external_action_performed === true,
    simulation_performed: input.simulation_performed === true,
    action_receipt_path: input.action_receipt_path ?? null,
  }
}

function validateEntryShape(entry, workspace) {
  const errors = []
  if (entry?.ledger_version !== PSDEALS_CYCLE_LEDGER_VERSION) errors.push('LEDGER_VERSION_INVALID')
  if (!Number.isSafeInteger(entry?.sequence) || entry.sequence < 1) errors.push('LEDGER_SEQUENCE_INVALID')
  if (entry?.previous_entry_sha256 !== null && !HASH_PATTERN.test(String(entry?.previous_entry_sha256 || ''))) errors.push('LEDGER_PREVIOUS_HASH_INVALID')
  if (entry?.local_cycle_id !== workspace.identity.local_cycle_id) errors.push('LEDGER_CYCLE_MISMATCH')
  if (entry?.run_token !== workspace.identity.run_token) errors.push('LEDGER_RUN_TOKEN_MISMATCH')
  if (!STAGE_INDEX.has(entry?.stage)) errors.push('LEDGER_STAGE_INVALID')
  if (!Number.isSafeInteger(entry?.attempt) || entry.attempt < 1) errors.push('LEDGER_ATTEMPT_INVALID')
  if (!PSDEALS_CYCLE_STAGE_STATUSES.includes(entry?.status)) errors.push('LEDGER_STATUS_INVALID')
  if (!parseTimestamp(entry?.started_at) || !parseTimestamp(entry?.recorded_at)) errors.push('LEDGER_TIMESTAMP_INVALID')
  if (entry?.finished_at !== null && !parseTimestamp(entry.finished_at)) errors.push('LEDGER_FINISHED_AT_INVALID')
  if (entry?.status === 'running' && entry?.finished_at !== null) errors.push('LEDGER_RUNNING_HAS_FINISH')
  if (TERMINAL_STATUSES.has(entry?.status) && !parseTimestamp(entry?.finished_at)) errors.push('LEDGER_TERMINAL_FINISH_MISSING')
  if ((entry?.input_hashes || []).some((value) => !HASH_PATTERN.test(value))) errors.push('LEDGER_INPUT_HASH_INVALID')
  if ((entry?.output_hashes || []).some((value) => !HASH_PATTERN.test(value))) errors.push('LEDGER_OUTPUT_HASH_INVALID')
  if (entry?.status === 'skipped' && !SKIP_REASONS[entry.stage]?.has(entry.reason_codes?.[0])) errors.push('LEDGER_SKIP_REASON_INVALID')
  if (entry?.external_action_performed === true && entry?.authorization_required !== true) errors.push('LEDGER_EXTERNAL_ACTION_WITHOUT_AUTHORIZATION_CONTRACT')
  if (entry?.external_action_performed === true && !entry?.authorization_id) errors.push('LEDGER_EXTERNAL_ACTION_WITHOUT_AUTHORIZATION_ID')
  if (entry?.external_action_performed === true && !entry?.action_receipt_path) errors.push('LEDGER_EXTERNAL_ACTION_WITHOUT_RECEIPT')
  return errors
}

function calculateEntryHash(entryWithoutHash) {
  return sha256PsdealsBytes(stablePsdealsEvidenceJson(entryWithoutHash))
}

function derive(entries, workspace) {
  const errors = []
  const stages = Object.fromEntries(
    STAGE_NAMES.map((stage) => [stage, { status: 'pending', attempts: [], latest: null }])
  )
  let expectedPrevious = null
  let running = null

  for (const [index, entry] of entries.entries()) {
    const shapeErrors = validateEntryShape(entry, workspace)
    errors.push(...shapeErrors.map((code) => ({ code, sequence: index + 1 })))
    if (entry.sequence !== index + 1) errors.push({ code: 'LEDGER_SEQUENCE_GAP', sequence: entry.sequence })
    if (entry.previous_entry_sha256 !== expectedPrevious) errors.push({ code: 'LEDGER_HASH_CHAIN_BROKEN', sequence: entry.sequence })
    const { entry_sha256: declaredHash, ...body } = entry
    const actualHash = calculateEntryHash(body)
    if (declaredHash !== actualHash) errors.push({ code: 'LEDGER_ENTRY_HASH_MISMATCH', sequence: entry.sequence })
    expectedPrevious = declaredHash

    const stageState = stages[entry.stage]
    if (!stageState) continue
    const attempt = stageState.attempts.find((value) => value.attempt === entry.attempt)
    if (entry.status === 'running') {
      if (running) errors.push({ code: 'LEDGER_MULTIPLE_RUNNING', sequence: entry.sequence })
      if (attempt) errors.push({ code: 'LEDGER_ATTEMPT_REUSED', sequence: entry.sequence })
      const priorStage = STAGE_NAMES[STAGE_INDEX.get(entry.stage) - 1]
      if (priorStage && !['succeeded', 'skipped'].includes(stages[priorStage].status)) {
        errors.push({ code: 'LEDGER_DEPENDENCY_UNSATISFIED', sequence: entry.sequence })
      }
      if (stageState.status === 'succeeded') errors.push({ code: 'LEDGER_SUCCEEDED_STAGE_RESTARTED', sequence: entry.sequence })
      stageState.attempts.push({ attempt: entry.attempt, entries: [entry] })
      running = { stage: entry.stage, attempt: entry.attempt }
    } else {
      if (!attempt || !running || running.stage !== entry.stage || running.attempt !== entry.attempt) {
        errors.push({ code: 'LEDGER_TERMINAL_WITHOUT_RUNNING', sequence: entry.sequence })
      } else {
        attempt.entries.push(entry)
        running = null
      }
    }
    stageState.status = entry.status
    stageState.latest = entry
  }

  for (const stage of STAGE_NAMES) {
    const index = STAGE_INDEX.get(stage)
    const previousComplete = index === 0 || ['succeeded', 'skipped'].includes(stages[STAGE_NAMES[index - 1]].status)
    if (stages[stage].status === 'pending' && previousComplete) stages[stage].status = 'ready'
  }

  const lastSucceeded = [...STAGE_NAMES].reverse().find((stage) => stages[stage].status === 'succeeded') || null
  const nextStage = STAGE_NAMES.find((stage) => ['ready', 'running', 'awaiting_authorization', 'blocked', 'partial', 'failed'].includes(stages[stage].status)) || null
  return {
    valid: errors.length === 0,
    errors,
    entries,
    stages,
    running,
    last_succeeded_stage: lastSucceeded,
    next_stage: nextStage,
    last_entry_sha256: expectedPrevious,
  }
}

export async function readPsdealsCycleLedger({ workspace } = {}) {
  const stateDirectory = await resolvePsdealsCycleWorkspacePath(workspace, 'state', { must_exist: true })
  const names = (await fs.readdir(stateDirectory))
    .filter((name) => /^ledger-\d{6}\.json$/.test(name))
    .sort()
  const entries = []
  for (const name of names) {
    const portable = `state/${name}`
    const filePath = await resolvePsdealsCycleWorkspacePath(workspace, portable, { must_exist: true })
    try {
      entries.push(JSON.parse(await fs.readFile(filePath, 'utf8')))
    } catch {
      return {
        valid: false,
        errors: [{ code: 'LEDGER_JSON_CORRUPT', path: portable }],
        entries,
        stages: {},
        running: null,
        last_succeeded_stage: null,
        next_stage: null,
        last_entry_sha256: null,
      }
    }
  }
  return derive(entries, workspace)
}

async function requireOwnedLock(workspace, ownerToken) {
  const inspected = await inspectPsdealsCycleLock({ workspace })
  if (inspected.status === 'absent') throw new Error('LEDGER_LOCK_REQUIRED')
  if (inspected.status === 'corrupt') throw new Error('LEDGER_LOCK_CORRUPT')
  if (inspected.lock.owner_token !== ownerToken) throw new Error('LEDGER_LOCK_NOT_OWNED')
}

export async function appendPsdealsCycleLedgerEntry({ workspace, owner_token, entry } = {}) {
  await requireOwnedLock(workspace, owner_token)
  const ledger = await readPsdealsCycleLedger({ workspace })
  if (!ledger.valid) throw new Error(`LEDGER_CORRUPT: ${ledger.errors.map((value) => value.code).join(',')}`)

  const sequence = ledger.entries.length + 1
  const body = entryBody(entry || {}, {
    sequence,
    previousHash: ledger.last_entry_sha256,
    workspace,
  })
  const candidate = { ...body, entry_sha256: calculateEntryHash(body) }
  const derived = derive([...ledger.entries, candidate], workspace)
  if (!derived.valid) {
    const newErrors = derived.errors.slice(ledger.errors.length)
    throw new Error(`LEDGER_TRANSITION_INVALID: ${newErrors.map((value) => value.code).join(',')}`)
  }
  const outputPath = await resolvePsdealsCycleWorkspacePath(
    workspace,
    `state/ledger-${String(sequence).padStart(6, '0')}.json`
  )
  await writePsdealsArtifactAtomic({
    output_path: outputPath,
    root_dir: workspace.root_dir,
    content: stablePsdealsEvidenceJson(candidate),
  })
  return { entry: candidate, state: derived }
}

export async function beginPsdealsCycleStage({
  workspace,
  owner_token,
  stage,
  started_at,
  input_hashes = [],
  authorization_required = false,
  authorization_id = null,
  authorization_permission = null,
  external_action_requested = null,
} = {}) {
  const ledger = await readPsdealsCycleLedger({ workspace })
  if (!ledger.valid) throw new Error('LEDGER_CORRUPT')
  const attempt = (ledger.stages[stage]?.attempts.length || 0) + 1
  return appendPsdealsCycleLedgerEntry({
    workspace,
    owner_token,
    entry: {
      stage,
      attempt,
      started_at,
      recorded_at: started_at,
      status: 'running',
      input_hashes,
      authorization_required,
      authorization_id,
      authorization_permission,
      external_action_requested,
    },
  })
}

export async function finishPsdealsCycleStage({
  workspace,
  owner_token,
  stage,
  status,
  finished_at,
  input_hashes = null,
  output_hashes = [],
  evidence_path = null,
  exit_code = null,
  reason_codes = [],
  errors = [],
  warnings = [],
  redact_values = [],
  authorization_required = false,
  authorization_id = null,
  authorization_permission = null,
  external_action_requested = null,
  external_action_performed = false,
  simulation_performed = false,
  action_receipt_path = null,
} = {}) {
  const ledger = await readPsdealsCycleLedger({ workspace })
  if (!ledger.valid || !ledger.running || ledger.running.stage !== stage) {
    throw new Error('LEDGER_STAGE_NOT_RUNNING')
  }
  const runningEntry = ledger.stages[stage].latest
  return appendPsdealsCycleLedgerEntry({
    workspace,
    owner_token,
    entry: {
      stage,
      attempt: ledger.running.attempt,
      started_at: runningEntry.started_at,
      finished_at,
      recorded_at: finished_at,
      status,
      input_hashes: Array.isArray(input_hashes)
        ? input_hashes
        : runningEntry.input_hashes,
      output_hashes,
      evidence_path,
      exit_code,
      reason_codes,
      errors,
      warnings,
      redact_values,
      authorization_required,
      authorization_id,
      authorization_permission,
      external_action_requested,
      external_action_performed,
      simulation_performed,
      action_receipt_path,
    },
  })
}

export async function recoverInterruptedPsdealsCycleStage({
  workspace,
  owner_token,
  recovered_at,
} = {}) {
  const ledger = await readPsdealsCycleLedger({ workspace })
  if (!ledger.valid) throw new Error('LEDGER_CORRUPT')
  if (!ledger.running) return { recovered: false, state: ledger }
  const result = await finishPsdealsCycleStage({
    workspace,
    owner_token,
    stage: ledger.running.stage,
    status: 'failed',
    finished_at: recovered_at,
    reason_codes: ['process_interrupted'],
    errors: ['The previous process ended before recording a terminal stage result.'],
  })
  return { recovered: true, ...result }
}
