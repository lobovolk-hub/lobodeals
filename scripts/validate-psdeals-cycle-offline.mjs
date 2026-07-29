import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  buildPsdealsCycleManifestFromListingArtifact,
  validatePsdealsCycleManifest,
} from './lib/psdeals-cycle-manifest.mjs'

export const OFFLINE_VALIDATION_EXIT_CODES = Object.freeze({
  valid: 0,
  usage_or_io_error: 1,
  invalid: 2,
  indeterminate: 3,
})

function parseArgs(argv) {
  const result = new Map()

  for (const value of argv) {
    if (!value.startsWith('--')) continue
    const separator = value.indexOf('=')
    if (separator === -1) result.set(value.slice(2), true)
    else result.set(value.slice(2, separator), value.slice(separator + 1))
  }

  return result
}

function helpText() {
  return `LoboDeals PSDeals cycle validator

OFFLINE_VALIDATION only. This command never runs collectors, importers,
demoters, Supabase operations, certification, cache refreshes, or network calls.

Usage:
  node scripts/validate-psdeals-cycle-offline.mjs --manifest=<path> [--json] [--now=<iso>]
  node scripts/validate-psdeals-cycle-offline.mjs --listing-artifact=<path> [--json] [--now=<iso>]

Options:
  --manifest=<path>          Validate a versioned cycle manifest and its local files.
  --listing-artifact=<path>  Classify one existing listing JSON without combining runs.
  --code-revision=<sha>      Optional local Git revision for listing-only inspection.
  --run-token=<value>        Only use when the artifact itself proves this run token.
  --now=<iso>                Override validation time for a reproducible check.
  --json                     Emit structured JSON only.
  --help                     Show this help.

Fixture examples:
  node scripts/validate-psdeals-cycle-offline.mjs --manifest=tests/fixtures/psdeals-cycle/valid-manifest.json
  node scripts/validate-psdeals-cycle-offline.mjs --manifest=tests/fixtures/psdeals-cycle/invalid-manifest.json --json

Exit codes:
  0  valid manifest state
  1  CLI usage, read, parse, or local file error
  2  invalid or contradictory cycle evidence
  3  indeterminate because mandatory evidence is absent
`
}

function collectArtifactReferences(value, currentPath = '$', output = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectArtifactReferences(entry, `${currentPath}[${index}]`, output)
    )
    return output
  }

  if (!value || typeof value !== 'object') return output

  if ('path' in value && 'sha256' in value && 'run_token' in value) {
    output.push({ artifact: value, path: currentPath })
  }

  for (const [key, entry] of Object.entries(value)) {
    collectArtifactReferences(entry, `${currentPath}.${key}`, output)
  }

  return output
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(await fs.readFile(filePath))
  return hash.digest('hex')
}

async function verifyManifestFiles(manifest, baseDirectory) {
  const errors = []
  const seen = new Set()

  for (const reference of collectArtifactReferences(manifest)) {
    const relativePath = reference.artifact.path
    if (typeof relativePath !== 'string' || !relativePath.trim()) continue

    const resolved = path.isAbsolute(relativePath)
      ? path.normalize(relativePath)
      : path.resolve(baseDirectory, relativePath)
    const key = `${resolved}\u0000${reference.artifact.sha256}`
    if (seen.has(key)) continue
    seen.add(key)

    try {
      const actualHash = await sha256File(resolved)
      if (actualHash.toLowerCase() !== String(reference.artifact.sha256).toLowerCase()) {
        errors.push({
          code: 'ARTIFACT_FILE_HASH_MISMATCH',
          path: `${reference.path}.sha256`,
          message: `SHA-256 does not match ${resolved}.`,
          kind: 'invalid',
        })
      }
    } catch (error) {
      errors.push({
        code: 'ARTIFACT_FILE_UNREADABLE',
        path: `${reference.path}.path`,
        message: `Could not read ${resolved}: ${error instanceof Error ? error.message : String(error)}`,
        kind: 'invalid',
      })
    }
  }

  return errors
}

function withFileErrors(result, fileErrors) {
  if (fileErrors.length === 0) return result

  return {
    ...result,
    valid: false,
    classification: 'invalid',
    errors: [...result.errors, ...fileErrors],
    can_demote: false,
    can_mark_succeeded: false,
    can_certify: false,
    can_refresh_cache: false,
    reason_codes: [
      ...new Set([
        ...result.reason_codes,
        ...fileErrors.map((entry) => entry.code),
      ]),
    ],
  }
}

function humanOutput(result, sourcePath) {
  const lines = [
    'OFFLINE_VALIDATION',
    `Source: ${sourcePath}`,
    `Classification: ${result.classification.toUpperCase()}`,
    `Listing completeness: ${String(result.listing_completeness || 'indeterminate').toUpperCase()}`,
    `Detail complete: ${result.detail_complete ? 'YES' : 'NO'}`,
    `Monthly complete: ${result.monthly_complete ? 'YES' : 'NO'}`,
    `Ended deals complete: ${result.ended_deals_complete ? 'YES' : 'NO'}`,
    `CAN_DEMOTE: ${result.can_demote ? 'YES' : 'NO'}`,
    `CAN_MARK_SUCCEEDED: ${result.can_mark_succeeded ? 'YES' : 'NO'}`,
    `CAN_CERTIFY: ${result.can_certify ? 'YES' : 'NO'}`,
    `CAN_REFRESH_CACHE: ${result.can_refresh_cache ? 'YES' : 'NO'}`,
  ]

  if (result.errors.length > 0) {
    lines.push('Blocking reasons:')
    for (const entry of result.errors) {
      lines.push(`- [${entry.code}] ${entry.path}: ${entry.message}`)
    }
  }

  if (result.warnings.length > 0) {
    lines.push('Warnings:')
    for (const entry of result.warnings) {
      lines.push(`- [${entry.code}] ${entry.path}: ${entry.message}`)
    }
  }

  lines.push('No action was applied.')
  return `${lines.join('\n')}\n`
}

function exitCodeFor(result) {
  if (result.classification === 'valid') return OFFLINE_VALIDATION_EXIT_CODES.valid
  if (result.classification === 'indeterminate') {
    return OFFLINE_VALIDATION_EXIT_CODES.indeterminate
  }
  return OFFLINE_VALIDATION_EXIT_CODES.invalid
}

export async function runOfflineValidationCli(
  argv,
  {
    cwd = process.cwd(),
    stdout = (value) => process.stdout.write(value),
    stderr = (value) => process.stderr.write(value),
  } = {}
) {
  const args = parseArgs(argv)

  if (args.has('help')) {
    stdout(helpText())
    return OFFLINE_VALIDATION_EXIT_CODES.valid
  }

  const manifestArg = args.get('manifest')
  const listingArg = args.get('listing-artifact')
  if ((manifestArg ? 1 : 0) + (listingArg ? 1 : 0) !== 1) {
    stderr('Choose exactly one of --manifest=<path> or --listing-artifact=<path>.\n')
    stderr(helpText())
    return OFFLINE_VALIDATION_EXIT_CODES.usage_or_io_error
  }

  try {
    let manifest
    let sourcePath
    let artifactBaseDirectory

    if (manifestArg) {
      sourcePath = path.resolve(cwd, String(manifestArg))
      artifactBaseDirectory = path.dirname(sourcePath)
      manifest = JSON.parse(await fs.readFile(sourcePath, 'utf8'))
    } else {
      sourcePath = path.resolve(cwd, String(listingArg))
      artifactBaseDirectory = path.dirname(sourcePath)
      const raw = await fs.readFile(sourcePath, 'utf8')
      const listingArtifact = JSON.parse(raw)
      manifest = buildPsdealsCycleManifestFromListingArtifact(listingArtifact, {
        artifactName: path.basename(sourcePath),
        artifactPath: sourcePath,
        artifactSha256: crypto.createHash('sha256').update(raw).digest('hex'),
        runToken: args.get('run-token') || null,
        codeRevision: args.get('code-revision') || null,
        generatedAt: args.get('now') || new Date().toISOString(),
      })
    }

    let result = validatePsdealsCycleManifest(manifest, {
      now: args.get('now') || undefined,
    })
    result = withFileErrors(
      result,
      await verifyManifestFiles(manifest, artifactBaseDirectory)
    )

    if (args.has('json')) stdout(`${JSON.stringify(result, null, 2)}\n`)
    else stdout(humanOutput(result, sourcePath))

    return exitCodeFor(result)
  } catch (error) {
    stderr(`OFFLINE_VALIDATION error: ${error instanceof Error ? error.message : String(error)}\n`)
    return OFFLINE_VALIDATION_EXIT_CODES.usage_or_io_error
  }
}

function isMainModule() {
  return Boolean(
    process.argv[1] &&
      import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  )
}

if (isMainModule()) {
  process.exitCode = await runOfflineValidationCli(process.argv.slice(2))
}
