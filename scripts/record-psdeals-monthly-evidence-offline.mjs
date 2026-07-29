import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  openPsdealsCycleWorkspace,
  resolvePsdealsCycleWorkspacePath,
} from './lib/psdeals-cycle-workspace.mjs'
import { readPsdealsArtifact, writePsdealsEvidenceJsonAtomic } from './lib/psdeals-evidence-io.mjs'
import { buildMonthlyGamesCheckEvidence, validatePsdealsProducerEvidence } from './lib/psdeals-evidence-producers.mjs'

export const MONTHLY_EVIDENCE_EXIT_CODES = Object.freeze({
  success: 0,
  usage_or_io_error: 1,
  invalid_evidence: 2,
})

function argsMap(argv) {
  const result = new Map()
  for (const value of argv) {
    if (!value.startsWith('--')) continue
    const split = value.indexOf('=')
    result.set(split === -1 ? value.slice(2) : value.slice(2, split), split === -1 ? true : value.slice(split + 1))
  }
  return result
}

function help() {
  return `LoboDeals monthly PS Plus evidence recorder

LOCAL EVIDENCE ONLY. It never contacts a source, updates monthly games, or opens Supabase.

Usage:
  node scripts/record-psdeals-monthly-evidence-offline.mjs \\
    --workspace=<cycle-directory> --review=<portable-artifact-path> \\
    --output=evidence/monthly-games-check.json \\
    --started-at=<iso> --finished-at=<iso> --generated-at=<iso> \\
    --source-type=<type> --source-reference=<reference> \\
    --procedure=<name> --procedure-version=<version> \\
    --result=no_changes|proposed_changes|indeterminate|failed \\
    [--proposed-changes-json=<json-array>] [--reviewer=<non-sensitive-label>]

The review artifact must already exist inside the explicit workspace. Changes are
recorded only as proposals; application_performed is always false.
`
}

export async function runMonthlyEvidenceCli(argv, io = {}) {
  const stdout = io.stdout || ((value) => process.stdout.write(value))
  const stderr = io.stderr || ((value) => process.stderr.write(value))
  const args = argsMap(argv)
  if (args.has('help')) {
    stdout(help())
    return MONTHLY_EVIDENCE_EXIT_CODES.success
  }
  const required = ['workspace', 'review', 'output', 'started-at', 'finished-at', 'generated-at', 'source-type', 'source-reference', 'procedure', 'procedure-version', 'result']
  const missing = required.filter((key) => typeof args.get(key) !== 'string' || !args.get(key).trim())
  if (missing.length > 0) {
    stderr(`Missing required options: ${missing.join(', ')}\n`)
    return MONTHLY_EVIDENCE_EXIT_CODES.usage_or_io_error
  }
  try {
    const workspace = await openPsdealsCycleWorkspace({ workspace_dir: path.resolve(String(args.get('workspace'))) })
    const reviewPath = await resolvePsdealsCycleWorkspacePath(
      workspace,
      String(args.get('review')),
      { must_exist: true }
    )
    const review = await readPsdealsArtifact({
      root_dir: workspace.root_dir,
      file_path: reviewPath,
      role: 'monthly_games_review',
      artifact_kind: 'monthly_games_review',
    })
    const proposedChanges = args.has('proposed-changes-json')
      ? JSON.parse(String(args.get('proposed-changes-json')))
      : []
    if (!Array.isArray(proposedChanges)) throw new Error('proposed changes must be a JSON array')
    const evidence = buildMonthlyGamesCheckEvidence({
      identity: {
        ...workspace.identity,
        mode: workspace.identity.mode === 'operational' ? 'real_recorded' : 'offline_fixture',
      },
      producer: { name: 'monthly-ps-plus-manual-review', version: '1', code_revision: workspace.identity.code_revision },
      timestamps: {
        started_at: args.get('started-at'),
        finished_at: args.get('finished-at'),
        generated_at: args.get('generated-at'),
      },
      context: workspace.identity.context,
      outputs: [review.reference],
      review: {
        source_type: args.get('source-type'),
        source_reference: args.get('source-reference'),
        procedure: args.get('procedure'),
        procedure_version: args.get('procedure-version'),
        result: args.get('result'),
        proposed_changes: proposedChanges,
        reviewer: args.get('reviewer'),
        application_performed: false,
      },
    })
    const validation = validatePsdealsProducerEvidence(evidence, { now: args.get('generated-at') })
    if (!validation.valid) {
      stderr(`${JSON.stringify(validation, null, 2)}\n`)
      return MONTHLY_EVIDENCE_EXIT_CODES.invalid_evidence
    }
    const output = await writePsdealsEvidenceJsonAtomic({
      output_path: await resolvePsdealsCycleWorkspacePath(
        workspace,
        String(args.get('output'))
      ),
      root_dir: workspace.root_dir,
      envelope: evidence,
    })
    stdout(`${JSON.stringify({ recorded: true, application_performed: false, output_path: output.output_path, sha256: output.sha256 }, null, 2)}\n`)
    return MONTHLY_EVIDENCE_EXIT_CODES.success
  } catch (error) {
    stderr(`MONTHLY_EVIDENCE error: ${error instanceof Error ? error.message : String(error)}\n`)
    return MONTHLY_EVIDENCE_EXIT_CODES.usage_or_io_error
  }
}

function isMain() {
  return Boolean(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
}

if (isMain()) process.exitCode = await runMonthlyEvidenceCli(process.argv.slice(2))
