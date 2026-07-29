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

async function resolveExistingPathWithinRoot(rootDir, candidatePath) {
  const rootPath = path.resolve(rootDir)
  const resolvedPath = path.resolve(candidatePath)
  if (!isWithinRoot(rootPath, resolvedPath)) {
    throw new Error('ARTIFACT_OUTSIDE_ROOT')
  }

  const [realRoot, realCandidate] = await Promise.all([
    fs.realpath(rootPath),
    fs.realpath(resolvedPath),
  ])
  if (!isWithinRoot(realRoot, realCandidate)) {
    throw new Error('ARTIFACT_REALPATH_OUTSIDE_ROOT')
  }

  return { rootPath, resolvedPath, realRoot, realCandidate }
}

async function resolveWritableDirectoryWithinRoot(rootDir, directoryPath) {
  const rootPath = path.resolve(rootDir)
  const resolvedDirectory = path.resolve(directoryPath)
  if (!isWithinRoot(rootPath, resolvedDirectory)) {
    throw new Error('ARTIFACT_OUTPUT_OUTSIDE_ROOT')
  }
  await fs.mkdir(resolvedDirectory, { recursive: true })
  const [realRoot, realDirectory] = await Promise.all([
    fs.realpath(rootPath),
    fs.realpath(resolvedDirectory),
  ])
  if (!isWithinRoot(realRoot, realDirectory)) {
    throw new Error('ARTIFACT_OUTPUT_REALPATH_OUTSIDE_ROOT')
  }
  return { rootPath, resolvedDirectory, realRoot, realDirectory }
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
  const loaded = await readPsdealsArtifact({
    root_dir,
    file_path,
    portable_path,
    role,
    artifact_kind,
    final_state,
    local_cycle_id,
    run_token,
  })
  return loaded.reference
}

export async function readPsdealsArtifact({
  root_dir,
  file_path,
  portable_path,
  role,
  artifact_kind,
  final_state = 'final',
  local_cycle_id,
  run_token,
} = {}) {
  const { realRoot, realCandidate } = await resolveExistingPathWithinRoot(
    root_dir,
    file_path
  )

  const relativePath = portable_path || path.relative(realRoot, realCandidate)
  const normalizedPortablePath = String(relativePath).replaceAll('\\', '/')
  if (!isPsdealsPortablePath(normalizedPortablePath)) {
    throw new Error('ARTIFACT_PATH_NOT_PORTABLE')
  }

  if (portable_path) {
    const portableCandidate = path.resolve(realRoot, normalizedPortablePath)
    const portableRealPath = await fs.realpath(portableCandidate)
    if (portableRealPath !== realCandidate) {
      throw new Error('ARTIFACT_PORTABLE_PATH_MISMATCH')
    }
  }

  const bytes = await fs.readFile(realCandidate)
  const reference = buildPsdealsArtifactReference({
    role,
    path: normalizedPortablePath,
    artifact_kind,
    final_state,
    local_cycle_id,
    run_token,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    size_bytes: bytes.byteLength,
  })
  return { bytes, real_path: realCandidate, reference }
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

  try {
    const rootPath = path.resolve(root_dir)
    const resolvedPath = path.resolve(rootPath, reference.path)
    const { realCandidate } = await resolveExistingPathWithinRoot(
      rootPath,
      resolvedPath
    )
    const actual = await sha256PsdealsFile(realCandidate)
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
    const code =
      error instanceof Error &&
      [
        'ARTIFACT_OUTSIDE_ROOT',
        'ARTIFACT_REALPATH_OUTSIDE_ROOT',
      ].includes(error.message)
        ? error.message
        : 'ARTIFACT_UNREADABLE'
    return {
      valid: false,
      code,
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
  root_dir,
} = {}) {
  return writePsdealsArtifactAtomic({
    output_path,
    content: stablePsdealsEvidenceJson(envelope),
    root_dir,
  })
}

export async function writePsdealsArtifactAtomic({
  output_path,
  content,
  root_dir,
} = {}) {
  if (!output_path || typeof output_path !== 'string') {
    throw new Error('ARTIFACT_OUTPUT_PATH_REQUIRED')
  }

  const outputPath = path.resolve(output_path)
  const directory = path.dirname(outputPath)
  const temporaryPath = path.join(
    directory,
    `${path.basename(outputPath)}.${process.pid}.${Date.now()}.partial.tmp`
  )
  const serialized = Buffer.isBuffer(content)
    ? content
    : Buffer.from(String(content ?? ''), 'utf8')

  if (root_dir) {
    await resolveWritableDirectoryWithinRoot(root_dir, directory)
  } else {
    await fs.mkdir(directory, { recursive: true })
  }
  if (await pathExists(outputPath)) {
    throw new Error(`EVIDENCE_OUTPUT_EXISTS: ${outputPath}`)
  }

  let temporaryCreated = false
  try {
    await fs.writeFile(temporaryPath, serialized, { flag: 'wx' })
    temporaryCreated = true

    if (root_dir) {
      await resolveWritableDirectoryWithinRoot(root_dir, directory)
    }

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
