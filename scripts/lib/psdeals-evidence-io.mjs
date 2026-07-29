import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  buildPsdealsArtifactReference,
  isPsdealsPortablePath,
  stablePsdealsEvidenceJson,
} from './psdeals-evidence-envelope.mjs'

function isWithinRoot(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  )
}
export async function sha256PsdealsFile(filePath) {
  const bytes = await fs.readFile(filePath)
  return {
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    size_bytes: bytes.byteLength,
  }
}

export async function inspectPsdealsArtifact({
  root_dir,
  file_path,
  portable_path,
  role,
  artifact_kind,
  final_state = 'final',
  local_cycle_id,
  run_token,
} = {}) {
  const rootPath = path.resolve(root_dir)
  const resolvedPath = path.resolve(file_path)
  if (!isWithinRoot(rootPath, resolvedPath)) {
    throw new Error('ARTIFACT_OUTSIDE_ROOT')
  }

  const relativePath = portable_path || path.relative(rootPath, resolvedPath)
  const normalizedPortablePath = String(relativePath).replaceAll('\\', '/')
  if (!isPsdealsPortablePath(normalizedPortablePath)) {
    throw new Error('ARTIFACT_PATH_NOT_PORTABLE')
  }

  const digest = await sha256PsdealsFile(resolvedPath)
  return buildPsdealsArtifactReference({
    role,
    path: normalizedPortablePath,
    artifact_kind,
    final_state,
    local_cycle_id,
    run_token,
    ...digest,
  })
}

export async function verifyPsdealsArtifactReference(reference, { root_dir } = {}) {
  if (!reference || !isPsdealsPortablePath(reference.path)) {
    return {
      valid: false,
      code: 'ARTIFACT_PATH_NOT_PORTABLE',
      actual_sha256: null,
      actual_size_bytes: null,
    }
  }

  const rootPath = path.resolve(root_dir)
  const resolvedPath = path.resolve(rootPath, reference.path)
  if (!isWithinRoot(rootPath, resolvedPath)) {
    return {
      valid: false,
      code: 'ARTIFACT_OUTSIDE_ROOT',
      actual_sha256: null,
      actual_size_bytes: null,
    }
  }

  try {
    const actual = await sha256PsdealsFile(resolvedPath)
    const valid =
      actual.sha256 === String(reference.sha256 || '').toLowerCase() &&
      actual.size_bytes === reference.size_bytes
    return {
      valid,
      code: valid ? null : 'ARTIFACT_BYTES_MISMATCH',
      actual_sha256: actual.sha256,
      actual_size_bytes: actual.size_bytes,
    }
  } catch (error) {
    return {
      valid: false,
      code: 'ARTIFACT_UNREADABLE',
      actual_sha256: null,
      actual_size_bytes: null,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function writePsdealsEvidenceJsonAtomic({
  output_path,
  envelope,
} = {}) {
  if (!output_path || typeof output_path !== 'string') {
    throw new Error('EVIDENCE_OUTPUT_PATH_REQUIRED')
  }

  const outputPath = path.resolve(output_path)
  const directory = path.dirname(outputPath)
  const temporaryPath = path.join(
    directory,
    `${path.basename(outputPath)}.${process.pid}.${Date.now()}.partial.tmp`
  )
  const serialized = stablePsdealsEvidenceJson(envelope)

  await fs.mkdir(directory, { recursive: true })
  if (await pathExists(outputPath)) {
    throw new Error(`EVIDENCE_OUTPUT_EXISTS: ${outputPath}`)
  }

  let temporaryCreated = false
  try {
    await fs.writeFile(temporaryPath, serialized, {
      encoding: 'utf8',
      flag: 'wx',
    })
    temporaryCreated = true

    if (await pathExists(outputPath)) {
      throw new Error(`EVIDENCE_OUTPUT_EXISTS: ${outputPath}`)
    }
    await fs.rename(temporaryPath, outputPath)
    temporaryCreated = false
  } finally {
    if (temporaryCreated) {
      await fs.rm(temporaryPath, { force: true }).catch(() => {})
    }
  }

  return {
    output_path: outputPath,
    ...(await sha256PsdealsFile(outputPath)),
  }
}
