import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  assemblePsdealsRecoveryRuntimeLocal,
} from './lib/psdeals-recovery-runtime-assembly.mjs'

function parseArgs(argv) {
  const options = new Map()
  for (const value of argv) {
    if (!value.startsWith('--')) continue
    const split = value.indexOf('=')
    options.set(
      split < 0 ? value.slice(2) : value.slice(2, split),
      split < 0 ? true : value.slice(split + 1)
    )
  }
  return options
}

export async function runPsdealsRecoveryRuntimeAssemblyCli(
  argv,
  io = {},
  dependencies = {}
) {
  const stdout = io.stdout || ((value) => process.stdout.write(value))
  const stderr = io.stderr || ((value) => process.stderr.write(value))
  const options = parseArgs(argv)
  if (options.has('help')) {
    stdout(
      'Usage: node scripts/assemble-psdeals-recovery-runtime-v1.mjs ' +
      '[--project-root=<path>] [--config=<recovery-inputs.json>]\\n' +
      'Local-only: writes verified workspace artifacts and a gated runtime plan. ' +
      'It opens no network, Edge, Supabase, Vercel or remote write.\\n'
    )
    return 0
  }
  try {
    const projectRoot = path.resolve(
      String(
        options.get('project-root') ||
        dependencies.project_root ||
        process.cwd()
      )
    )
    const result = await (
      dependencies.assemble || assemblePsdealsRecoveryRuntimeLocal
    )({
      project_root: projectRoot,
      recovery_config:
        typeof options.get('config') === 'string'
          ? path.resolve(projectRoot, String(options.get('config')))
          : undefined,
    })
    stdout(`${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (error) {
    stderr(
      `RECOVERY_RUNTIME_ASSEMBLY_ERROR: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    )
    return 1
  }
}

const isMain = Boolean(
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)

if (isMain) {
  process.exitCode = await runPsdealsRecoveryRuntimeAssemblyCli(
    process.argv.slice(2)
  )
}
