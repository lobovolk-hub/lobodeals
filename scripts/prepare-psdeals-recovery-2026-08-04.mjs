import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import {
  initializePsdealsCycleWorkspace,
  openPsdealsCycleWorkspace,
} from './lib/psdeals-cycle-workspace.mjs'

const RECENTLY_ADDED_URL = 'https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'
const DISCOUNTS_URL = 'https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc'
const DEFAULT_RUN_INTENT_ID = 'local-cycle-recovery-20260804-final'
const EXPECTED = Object.freeze({
  pages: 437,
  raw_positions: 15729,
  unique_items: 15652,
  duplicate_occurrences: 77,
  new_urls: 8270,
})

function parseArgs(argv) {
  const options = new Map()
  for (const value of argv) {
    if (!value.startsWith('--')) continue
    const split = value.indexOf('=')
    options.set(split < 0 ? value.slice(2) : value.slice(2, split), split < 0 ? true : value.slice(split + 1))
  }
  return options
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}_REQUIRED`)
  return value.trim()
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function readBytes(file) {
  const bytes = await fs.readFile(file)
  if (bytes.length === 0) throw new Error(`EMPTY_FILE:${file}`)
  return bytes
}

function assertInside(root, file, label) {
  const relative = path.relative(root, file)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label}_OUTSIDE_PROJECT:${file}`)
  }
}

function validateListing(listing) {
  if (!Array.isArray(listing?.items)) throw new Error('LISTING_ITEMS_MISSING')
  if (!Array.isArray(listing?.page_summaries)) throw new Error('LISTING_PAGE_SUMMARIES_MISSING')
  if (listing.items.length !== EXPECTED.unique_items) {
    throw new Error(`LISTING_UNIQUE_COUNT_MISMATCH:${listing.items.length}`)
  }
  if (listing.page_summaries.length !== EXPECTED.pages) {
    throw new Error(`LISTING_PAGE_COUNT_MISMATCH:${listing.page_summaries.length}`)
  }
  if (Number(listing.pages_processed) !== EXPECTED.pages || Number(listing.pages_failed) !== 0) {
    throw new Error('LISTING_COMPLETION_CONTRACT_INVALID')
  }
  if (!Array.isArray(listing.failed_pages) || listing.failed_pages.length !== 0) {
    throw new Error('LISTING_FAILED_PAGES_PRESENT')
  }
  if (!['final_short_page'].includes(listing.stop_reason) || !['final_short_page'].includes(listing.auto_stop_reason)) {
    throw new Error('LISTING_TERMINATION_NOT_CERTIFIED')
  }
  if (Number(listing.total_results_detected) !== EXPECTED.raw_positions) {
    throw new Error(`LISTING_RAW_POSITION_COUNT_MISMATCH:${listing.total_results_detected}`)
  }
  if (Number(listing.reconstruction?.pages_reconstructed) !== EXPECTED.pages ||
      Number(listing.reconstruction?.raw_items_before_deduplication) !== EXPECTED.raw_positions ||
      Number(listing.reconstruction?.unique_items_after_deduplication) !== EXPECTED.unique_items ||
      Number(listing.reconstruction?.duplicate_occurrences_removed) !== EXPECTED.duplicate_occurrences) {
    throw new Error('LISTING_RECONSTRUCTION_CONTRACT_INVALID')
  }

  const pages = listing.page_summaries.map((row) => Number(row?.page_number))
  if (pages.some((page, index) => page !== index + 1)) throw new Error('LISTING_PAGE_SEQUENCE_INVALID')

  const ids = new Set()
  const urls = new Set()
  for (const item of listing.items) {
    const id = Number(item?.psdeals_id)
    const url = String(item?.psdeals_url || '').trim()
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('LISTING_ITEM_ID_INVALID')
    if (ids.has(id)) throw new Error(`LISTING_DUPLICATE_ID:${id}`)
    if (!url.startsWith('https://psdeals.net/us-store/')) throw new Error(`LISTING_ITEM_URL_INVALID:${id}`)
    ids.add(id)
    urls.add(url)
  }
  return { ids, urls }
}

function validateNewUrls(text, listingUrls) {
  const lines = text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  const unique = [...new Set(lines)]
  if (lines.length !== unique.length) throw new Error('NEW_URL_FILE_CONTAINS_DUPLICATES')
  if (unique.length !== EXPECTED.new_urls) throw new Error(`NEW_URL_COUNT_MISMATCH:${unique.length}`)
  for (const url of unique) {
    if (!url.startsWith('https://psdeals.net/us-store/')) throw new Error(`NEW_URL_INVALID:${url}`)
    if (!listingUrls.has(url)) throw new Error(`NEW_URL_NOT_IN_LISTING:${url}`)
  }
  return unique
}

async function copyVerified(source, target, expectedSha) {
  await fs.mkdir(path.dirname(target), { recursive: true })
  try {
    const existing = await fs.readFile(target)
    if (sha256(existing) !== expectedSha) throw new Error(`TARGET_ARTIFACT_CONFLICT:${target}`)
    return
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await fs.copyFile(source, target)
  const copied = await fs.readFile(target)
  if (sha256(copied) !== expectedSha) throw new Error(`TARGET_ARTIFACT_HASH_MISMATCH:${target}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const projectRoot = path.resolve(options.get('project-root') || process.cwd())
  const runIntentId = requireString(options.get('run-intent-id') || DEFAULT_RUN_INTENT_ID, 'RUN_INTENT_ID')
  if (!/^local-cycle-[a-z0-9][a-z0-9_-]{7,}$/.test(runIntentId)) throw new Error('RUN_INTENT_ID_INVALID')

  const listingSource = path.resolve(projectRoot, options.get('listing-file') || 'data/import/psdeals-recently-added-complete-2026-08-04-11-17-00.json')
  const newUrlsSource = path.resolve(projectRoot, options.get('new-urls-file') || 'data/import/psdeals-recently-added-complete-2026-08-04-11-17-00-new.txt')
  assertInside(projectRoot, listingSource, 'LISTING_SOURCE')
  assertInside(projectRoot, newUrlsSource, 'NEW_URL_SOURCE')

  const [listingBytes, newUrlBytes] = await Promise.all([readBytes(listingSource), readBytes(newUrlsSource)])
  const listing = JSON.parse(listingBytes.toString('utf8').replace(/^\uFEFF/, ''))
  const listingFacts = validateListing(listing)
  const newUrls = validateNewUrls(newUrlBytes.toString('utf8').replace(/^\uFEFF/, ''), listingFacts.urls)

  const codeRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim()
  if (!/^[a-f0-9]{40}$/.test(codeRevision)) throw new Error('GIT_HEAD_INVALID')

  const cyclesRoot = path.resolve(projectRoot, 'data/cycles')
  const workspaceDir = path.join(cyclesRoot, runIntentId)
  let workspace
  try {
    workspace = await openPsdealsCycleWorkspace({ workspace_dir: workspaceDir })
    if (workspace.identity.mode !== 'operational' || workspace.identity.code_revision !== codeRevision) {
      throw new Error('EXISTING_WORKSPACE_IDENTITY_MISMATCH')
    }
  } catch (error) {
    if (!['ENOENT', 'WORKSPACE_DIRECTORY_REQUIRED'].includes(error?.code) &&
        !String(error?.message || '').includes('ENOENT')) throw error
    workspace = await initializePsdealsCycleWorkspace({
      cycles_root: cyclesRoot,
      mode: 'operational',
      code_revision: codeRevision,
      context: {
        requested_url: DISCOUNTS_URL,
        platforms: ['PS5', 'PS4'],
        content_types: ['games', 'bundles', 'dlc'],
        order: 'best-new-deals',
      },
      generate_local_cycle_id: () => runIntentId,
    })
  }

  const listingSha = sha256(listingBytes)
  const newUrlsSha = sha256(newUrlBytes)
  const adoptedListing = path.join(workspace.root_dir, 'artifacts', 'recently-added-listing.json')
  const adoptedNewUrls = path.join(workspace.root_dir, 'artifacts', 'recently-added-new-urls.txt')
  await copyVerified(listingSource, adoptedListing, listingSha)
  await copyVerified(newUrlsSource, adoptedNewUrls, newUrlsSha)

  const preparedAt = new Date().toISOString()
  const recoveryConfig = {
    recovery_config_version: 1,
    classification: 'RECOVERY_INPUTS_PREPARED_LOCAL_ONLY',
    prepared_at: preparedAt,
    project_root: projectRoot,
    project_ref: 'vlxkoprpobfevxefizwr',
    code_head: codeRevision,
    run_intent_id: runIntentId,
    workspace_dir: workspace.root_dir,
    source_urls: {
      recently_added: RECENTLY_ADDED_URL,
      discounts: DISCOUNTS_URL,
    },
    adopted_artifacts: {
      recently_added_listing: {
        source_path: listingSource,
        workspace_path: adoptedListing,
        sha256: listingSha,
        pages: EXPECTED.pages,
        raw_positions: EXPECTED.raw_positions,
        unique_items: EXPECTED.unique_items,
        duplicates_removed: EXPECTED.duplicate_occurrences,
      },
      recently_added_new_urls: {
        source_path: newUrlsSource,
        workspace_path: adoptedNewUrls,
        sha256: newUrlsSha,
        count: newUrls.length,
      },
    },
    execution_limits: {
      detail_retry_max_attempts: 1,
      use_safe_demotion_rpc: 'apply_psdeals_ended_deals_v2',
      use_cache_rpc: 'refresh_catalog_public_cache_v16',
      deploy_allowed: false,
      scheduler_allowed: false,
      second_cycle_allowed: false,
    },
    remote_writes_executed: 0,
    edge_opened: false,
    ready_for_runtime_assembly: true,
  }
  const configPath = path.join(workspace.root_dir, 'state', 'recovery-inputs.json')
  await fs.writeFile(configPath, stableJson(recoveryConfig), { encoding: 'utf8', flag: 'wx' }).catch(async (error) => {
    if (error?.code !== 'EEXIST') throw error
    const existing = JSON.parse(await fs.readFile(configPath, 'utf8'))
    if (existing.code_head !== codeRevision || existing.adopted_artifacts?.recently_added_listing?.sha256 !== listingSha ||
        existing.adopted_artifacts?.recently_added_new_urls?.sha256 !== newUrlsSha) {
      throw new Error('EXISTING_RECOVERY_CONFIG_CONFLICT')
    }
  })

  console.log(JSON.stringify({
    prepared: true,
    run_intent_id: runIntentId,
    workspace_dir: workspace.root_dir,
    recovery_config: configPath,
    listing_sha256: listingSha,
    new_urls_sha256: newUrlsSha,
    counts: EXPECTED,
    remote_writes_executed: 0,
    edge_opened: false,
  }, null, 2))
}

main().catch((error) => {
  console.error(`RECOVERY_PREPARE_ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
