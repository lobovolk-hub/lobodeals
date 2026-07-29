import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { auditLocalPriceHistoryDependencies } from './lib/price-history-dependency-audit.mjs'

export async function runPriceHistoryAuditCli(argv, io = {}) {
  const stdout = io.stdout || ((value) => process.stdout.write(value))
  const stderr = io.stderr || ((value) => process.stderr.write(value))
  const rootArg = argv.find((value) => value.startsWith('--root='))
  if (argv.includes('--help')) {
    stdout('Usage: node scripts/audit-price-history-dependencies-local.mjs [--root=<repository>] [--json]\nLocal read-only source audit; no SQL or services.\n')
    return 0
  }
  try {
    const result = await auditLocalPriceHistoryDependencies({
      root_dir: rootArg ? rootArg.slice('--root='.length) : process.cwd(),
    })
    if (argv.includes('--json')) stdout(`${JSON.stringify(result, null, 2)}\n`)
    else {
      stdout(`LOCAL_PRICE_HISTORY_AUDIT\nFiles scanned: ${result.files_scanned}\nReferences: ${result.reference_count}\n`)
      for (const [key, count] of Object.entries(result.counts)) stdout(`${key}: ${count}\n`)
      stdout('No writes, SQL, connections, or destructive actions were performed.\n')
    }
    return 0
  } catch (error) {
    stderr(`LOCAL_PRICE_HISTORY_AUDIT error: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

function isMain() {
  return Boolean(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
}
if (isMain()) process.exitCode = await runPriceHistoryAuditCli(process.argv.slice(2))
