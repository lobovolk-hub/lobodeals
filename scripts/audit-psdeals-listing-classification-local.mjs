import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  classifyPsdealsItemType,
  normalizePsdealsPlatforms,
} from './lib/psdeals-item-classification.mjs'

function summarizeBy(rows, keyFn) {
  const counts = new Map()

  for (const row of rows) {
    const key = String(keyFn(row) ?? '<null>')
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  return Object.fromEntries(
    [...counts.entries()].sort(
      ([leftKey, leftCount], [rightKey, rightCount]) =>
        rightCount - leftCount || leftKey.localeCompare(rightKey)
    )
  )
}

function representativeExamples(rows, keyFn) {
  const examples = new Map()

  for (const row of rows) {
    const key = String(keyFn(row) ?? '<null>')
    if (examples.has(key)) continue

    examples.set(key, {
      psdeals_id: row.item.psdeals_id ?? null,
      title: row.item.title ?? null,
      type_label: row.item.type_label ?? null,
      platform_label: row.item.platform_label ?? null,
    })
  }

  return Object.fromEntries([...examples.entries()].sort())
}

export function summarizePsdealsListingSnapshot(snapshot) {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : []
  const rows = items.map((item) => ({
    item,
    type: classifyPsdealsItemType(item?.type_label, {
      sourceContext: 'listing',
    }),
    platform: normalizePsdealsPlatforms(item?.platform_label, {
      sourceContext: 'listing',
    }),
  }))

  const detailCandidateIds = new Set(
    rows
      .filter(
        (row) =>
          row.type.requires_detail_revalidation ||
          row.platform.requires_detail_revalidation
      )
      .map((row) => row.item.psdeals_id)
      .filter((value) => value != null)
  )

  return {
    total_rows: rows.length,
    types: {
      raw_distribution: summarizeBy(rows, (row) => row.item.type_label),
      normalized_distribution: summarizeBy(
        rows,
        (row) => row.type.content_type || '<omitted>'
      ),
      confidence_distribution: summarizeBy(
        rows,
        (row) => row.type.confidence
      ),
      safe_rows: rows.filter(
        (row) => row.type.can_write && row.type.confidence === 'high'
      ).length,
      ambiguous_rows: rows.filter(
        (row) => row.type.can_write && row.type.confidence !== 'high'
      ).length,
      unknown_rows: rows.filter((row) => !row.type.can_write).length,
      requires_detail_rows: rows.filter(
        (row) => row.type.requires_detail_revalidation
      ).length,
      preserves_existing_rows: rows.filter(
        (row) => !row.type.can_replace_existing
      ).length,
      examples: representativeExamples(
        rows,
        (row) => row.type.content_type || '<omitted>'
      ),
    },
    platforms: {
      raw_distribution: summarizeBy(rows, (row) => row.item.platform_label),
      normalized_distribution: summarizeBy(
        rows,
        (row) => row.platform.target_platforms.join(' + ') || '<omitted>'
      ),
      classification_distribution: summarizeBy(
        rows,
        (row) => row.platform.classification
      ),
      safe_rows: rows.filter(
        (row) => row.platform.can_write && row.platform.confidence === 'high'
      ).length,
      ambiguous_rows: rows.filter(
        (row) => row.platform.can_write && row.platform.confidence !== 'high'
      ).length,
      unknown_or_legacy_only_rows: rows.filter(
        (row) => !row.platform.can_write
      ).length,
      requires_detail_rows: rows.filter(
        (row) => row.platform.requires_detail_revalidation
      ).length,
      preserves_existing_rows: rows.filter(
        (row) => !row.platform.can_replace_existing
      ).length,
      examples: representativeExamples(
        rows,
        (row) => row.platform.classification
      ),
    },
    distinct_rows_requiring_detail: detailCandidateIds.size,
    fast_refresh_queue_integration: 'none_metrics_only',
  }
}

function getSnapshotArg() {
  const prefix = '--snapshot='
  const arg = process.argv.find((value) => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

async function main() {
  const snapshotArg = getSnapshotArg()
  if (!snapshotArg) {
    throw new Error('Missing --snapshot=<local-json-path>')
  }

  const snapshotPath = path.resolve(process.cwd(), snapshotArg)
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'))

  console.log(
    JSON.stringify(
      {
        snapshot_file: snapshotPath,
        ...summarizePsdealsListingSnapshot(snapshot),
      },
      null,
      2
    )
  )
}

function isMainModule() {
  return Boolean(
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  )
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exitCode = 1
  })
}
