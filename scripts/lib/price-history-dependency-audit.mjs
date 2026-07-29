import fs from 'node:fs/promises'
import path from 'node:path'

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.playwright-cli',
  '.vercel',
  'data',
  'logs',
  'node_modules',
])
const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.md', '.mjs', '.ps1', '.sql', '.ts', '.tsx', '.txt', '.json',
])

export const PRICE_HISTORY_REFERENCE_CLASSES = Object.freeze([
  'legacy_detailed_history',
  'v1_item_snapshots',
  'certified_compact_lows',
  'legacy_summary_lows',
  'generic_history_reference',
])

export function classifyPriceHistoryReference(line) {
  const value = String(line || '')
  if (/\bpsdeals_stage_price_history\b/i.test(value)) return 'legacy_detailed_history'
  if (/\bitem_price_snapshots\b/i.test(value)) return 'v1_item_snapshots'
  if (/\blobodeals_lowest_(?:regular|ps_plus)_price_/i.test(value)) return 'certified_compact_lows'
  if (/\blowest_(?:ps_plus_)?price_amount\b/i.test(value)) return 'legacy_summary_lows'
  if (/price[ _-]?history|historical[ _-]?price|price[ _-]?snapshots?/i.test(value)) return 'generic_history_reference'
  return null
}

function roleForPath(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/')
  if (normalized.startsWith('app/') || normalized.startsWith('components/')) return 'public_consumer'
  if (normalized.startsWith('sql/')) return 'local_sql_contract'
  if (normalized.startsWith('scripts/')) return 'local_script'
  if (normalized.startsWith('tests/')) return 'test_contract'
  if (normalized.endsWith('.md')) return 'documentation'
  return 'other'
}

async function listTextFiles(root, current = root, output = []) {
  const entries = await fs.readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        await listTextFiles(root, path.join(current, entry.name), output)
      }
      continue
    }
    if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      output.push(path.join(current, entry.name))
    }
  }
  return output
}

export async function auditLocalPriceHistoryDependencies({ root_dir } = {}) {
  if (typeof root_dir !== 'string' || !root_dir.trim()) throw new Error('AUDIT_ROOT_REQUIRED')
  const root = await fs.realpath(path.resolve(root_dir))
  const files = await listTextFiles(root)
  const references = []
  for (const file of files) {
    const relativePath = path.relative(root, file).replaceAll('\\', '/')
    const text = await fs.readFile(file, 'utf8')
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      const classification = classifyPriceHistoryReference(line)
      if (classification) {
        references.push({
          path: relativePath,
          line: index + 1,
          classification,
          role: roleForPath(relativePath),
          excerpt: line.trim().slice(0, 240),
        })
      }
    }
  }
  const counts = Object.fromEntries(
    PRICE_HISTORY_REFERENCE_CLASSES.map((classification) => [
      classification,
      references.filter((reference) => reference.classification === classification).length,
    ])
  )
  return {
    audit_version: 1,
    root_dir: '.',
    files_scanned: files.length,
    reference_count: references.length,
    counts,
    references,
    performs_writes: false,
    opens_connections: false,
    executes_sql: false,
    destructive_actions: [],
  }
}
