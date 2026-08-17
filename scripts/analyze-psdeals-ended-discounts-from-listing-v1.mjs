import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { selectEndedDiscountCandidatesFromListing } from './lib/psdeals-ended-discounts.mjs'
import { buildEndedDealsAnalysisEvidence } from './lib/psdeals-evidence-producers.mjs'
import {
  buildPsdealsRuntimeIdentity,
  buildPsdealsRuntimeProducer,
  emitPsdealsProducerEvidence,
  getPsdealsEvidenceCliOptions,
  referencePsdealsFile,
  requireLinkedPsdealsEvidence,
} from './lib/psdeals-evidence-runtime.mjs'

export { selectEndedDiscountCandidatesFromListing } from './lib/psdeals-ended-discounts.mjs'

function parseArgs(argv) {
  const args = new Map()

  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--')) continue

    const index = arg.indexOf('=')

    if (index === -1) {
      args.set(arg.slice(2), 'true')
    } else {
      args.set(arg.slice(2, index), arg.slice(index + 1))
    }
  }

  return args
}

function getArg(args, key, defaultValue = null) {
  return args.has(key) ? String(args.get(key)) : defaultValue
}

async function loadKeyValueFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')

    for (const originalLine of raw.split(/\r?\n/)) {
      const line = originalLine.trim()
      if (!line || line.startsWith('#')) continue

      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) continue

      const key = line.slice(0, separatorIndex).trim()
      let value = line.slice(separatorIndex + 1).trim()

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (!(key in process.env)) {
        process.env[key] = value
      }
    }
  } catch {
    // Missing env files are ignored. Required variables are validated later.
  }
}

function normalizePsdealsId(value) {
  if (value === null || value === undefined || value === '') return null

  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null

  return numberValue
}

function normalizeMoney(value) {
  if (value === null || value === undefined || value === '') return null

  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null

  return Number(numberValue.toFixed(2))
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') return null

  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null

  return Math.trunc(numberValue)
}

function chunkArray(items, size) {
  const chunks = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function buildPsdealsUrl(psdealsId, slug) {
  if (!psdealsId || !slug) return null
  return `https://psdeals.net/us-store/game/${psdealsId}/${slug}`
}

function toTxt(rows) {
  return (
    rows
      .map((row) => row.psdeals_url || buildPsdealsUrl(row.psdeals_id, row.psdeals_slug))
      .filter(Boolean)
      .join('\n') + '\n'
  )
}

function summarizeBy(rows, keyFn) {
  const map = new Map()

  for (const row of rows) {
    const key = keyFn(row) || 'unknown'
    map.set(key, (map.get(key) || 0) + 1)
  }

  return Object.fromEntries([...map.entries()].sort())
}

function summarizeBlockers(rows) {
  const counts = new Map()
  for (const row of rows) {
    for (const reason of row?.demotion_blockers || []) {
      counts.set(reason, (counts.get(reason) || 0) + 1)
    }
  }
  return Object.fromEntries([...counts.entries()].sort())
}

export function buildEndedDealsEvidenceForAnalyzer({
  identity,
  producer,
  timestamps,
  context,
  inputs,
  outputs,
  listing_complete_confirmed,
  candidates,
  blockers = [],
} = {}) {
  return buildEndedDealsAnalysisEvidence({
    identity,
    producer,
    timestamps,
    context,
    inputs,
    outputs,
    result: {
      listing_complete_confirmed,
      candidates,
      application_performed: false,
      blockers,
    },
  })
}

async function fetchDiscountSignalStageItems(admin) {
  const allRows = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1

    const { data, error } = await admin
      .from('psdeals_stage_items')
      .select(`
        id,
        region_code,
        storefront,
        psdeals_id,
        psdeals_slug,
        psdeals_url,
        title,
        platforms,
        content_type,
        item_type_label,
        current_price_amount,
        original_price_amount,
        discount_percent,
        deal_ends_at,
        is_ps_plus_discount,
        listing_last_seen_at,
        detail_last_synced_at,
        updated_at
      `)
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .not('current_price_amount', 'is', null)
      .not('original_price_amount', 'is', null)
      .gte('discount_percent', 1)
      .lte('discount_percent', 99)
      .order('psdeals_id', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)

    if (error) throw error

    for (const row of data || []) {
      const current = normalizeMoney(row.current_price_amount)
      const original = normalizeMoney(row.original_price_amount)
      const discount = normalizeInteger(row.discount_percent)

      if (
        current !== null &&
        original !== null &&
        original > current &&
        discount !== null &&
        discount >= 1 &&
        discount <= 99
      ) {
        allRows.push({
          ...row,
          current_price_amount: current,
          original_price_amount: original,
          discount_percent: discount,
          psdeals_id: normalizePsdealsId(row.psdeals_id),
        })
      }
    }

    if (!data || data.length < pageSize) break
  }

  return allRows
}

function monthlyBoundary(value, { end = false } = {}) {
  if (!value) return null
  const text = String(value)
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text)
  if (Number.isNaN(parsed.getTime())) return null
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    parsed.setUTCDate(parsed.getUTCDate() + 1)
  }
  return parsed
}

async function fetchActiveMonthlyItemIds(admin, observedAtInput) {
  const observedAt = new Date(observedAtInput)
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error('ENDED_DEALS_MONTHLY_OBSERVATION_TIMESTAMP_INVALID')
  }
  const activeIds = new Set()
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('ps_plus_monthly_games')
      .select('item_id,active_from,active_until,active_from_at,active_until_at,is_active')
      .eq('is_active', true)
      .range(from, from + pageSize - 1)

    if (error) throw error

    for (const row of data || []) {
      const activeFrom = monthlyBoundary(row.active_from_at || row.active_from)
      const activeUntil = monthlyBoundary(
        row.active_until_at || row.active_until,
        { end: !row.active_until_at }
      )
      if (
        (!activeFrom || activeFrom <= observedAt) &&
        (!activeUntil || activeUntil > observedAt)
      ) {
        activeIds.add(String(row.item_id))
      }
    }

    if (!data || data.length < pageSize) break
  }

  return activeIds
}

async function main() {
  const evidenceOptions = getPsdealsEvidenceCliOptions(process.argv)
  const evidenceStartedAt = new Date().toISOString()
  const args = parseArgs(process.argv)

  const discountsJsonPath = getArg(args, 'discounts-json')
  const outputTxt = getArg(args, 'output-txt', null)
  const outputJson = getArg(args, 'output-json', null)
  const listingEvidencePath = getArg(args, 'listing-evidence', null)
  const sampleLimit = Number(getArg(args, 'sample-limit', '80'))

  if (!discountsJsonPath) {
    throw new Error('Missing --discounts-json argument.')
  }

  if (evidenceOptions.tracked && (!outputJson || !listingEvidencePath)) {
    throw new Error(
      'EVIDENCE_OUTPUTS_INCOMPLETE: tracked ended-deals analysis requires --output-json and --listing-evidence.'
    )
  }

  let parentEvidence = null
  let trackedListingInput = null
  let listingEvidenceReference = null
  let listingComplete = false
  if (evidenceOptions.tracked) {
    const projectRoot = process.cwd()
    parentEvidence = await requireLinkedPsdealsEvidence({
      evidence_path: path.resolve(projectRoot, listingEvidencePath),
      expected_kind: 'listing_collection',
      local_cycle_id: evidenceOptions.local_cycle_id,
      run_token: evidenceOptions.run_token,
    })
    trackedListingInput = await referencePsdealsFile({
      project_root: projectRoot,
      file_path: path.resolve(projectRoot, discountsJsonPath),
      role: 'listing_json',
      artifact_kind: 'listing_json',
    })
    const expectedListing = parentEvidence.envelope.outputs.find(
      (reference) => reference.role === 'listing_json'
    )
    if (!expectedListing || expectedListing.sha256 !== trackedListingInput.sha256) {
      throw new Error('ENDED_DEALS_LISTING_HASH_MISMATCH')
    }
    listingEvidenceReference = await referencePsdealsFile({
      project_root: projectRoot,
      file_path: parentEvidence.absolute_path,
      role: 'listing_evidence',
      artifact_kind: 'evidence_envelope',
      local_cycle_id: evidenceOptions.local_cycle_id,
      run_token: evidenceOptions.run_token,
    })
    listingComplete =
      parentEvidence.envelope.status === 'succeeded' &&
      parentEvidence.envelope.payload?.collection_result === 'complete'
  }

  await loadKeyValueFile(path.resolve(process.cwd(), '.env.local'))
  await loadKeyValueFile(
    path.resolve(process.cwd(), '..', 'worker-playstation-ingest', '.dev.vars')
  )

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  }

  if (!secretKey) {
    throw new Error('Missing SUPABASE_SECRET_KEY')
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const discountsRaw = await fs.readFile(path.resolve(process.cwd(), discountsJsonPath), 'utf8')
  const discountsPayload = JSON.parse(discountsRaw)

  const discountsItems = Array.isArray(discountsPayload.items) ? discountsPayload.items : []

  const discountSignalStageItems = await fetchDiscountSignalStageItems(admin)
  const activeMonthlyItemIds = await fetchActiveMonthlyItemIds(admin, evidenceStartedAt)

  const endedSelection = selectEndedDiscountCandidatesFromListing(
    discountsItems,
    discountSignalStageItems,
    {
      listing_complete: listingComplete,
      monthly_evidence_verified: true,
      monthly_item_ids: [...activeMonthlyItemIds],
      observed_at: evidenceStartedAt,
    }
  )
  const endedCandidates = endedSelection.candidates
  const blockedCandidates = endedSelection.blocked_candidates

  const summary = {
    discounts_json_file: discountsJsonPath,
    discounts_json_items: discountsItems.length,
    discounts_json_unique_ids: endedSelection.active_discount_ids.length,
    stage_items_with_discount_signal: discountSignalStageItems.length,
    absent_discount_candidates: endedSelection.absent_candidates.length,
    ended_discount_candidates: endedCandidates.length,
    blocked_discount_candidates: blockedCandidates.length,
    blocked_candidates_by_reason: summarizeBlockers(blockedCandidates),
    active_monthly_item_ids_checked: activeMonthlyItemIds.size,
    candidates_by_content_type: summarizeBy(endedCandidates, (row) => row.content_type),
    candidates_by_item_type_label: summarizeBy(endedCandidates, (row) => row.item_type_label),
    candidates_by_is_ps_plus_discount: summarizeBy(endedCandidates, (row) =>
      row.is_ps_plus_discount ? 'true' : 'false'
    ),
    candidates_by_deal_ends_at: summarizeBy(endedCandidates, (row) =>
      row.deal_ends_at ? 'has_deal_ends_at' : 'null_deal_ends_at'
    ),
  }

  console.log('=== LoboDeals ended discounts from PSDeals discounts listing analyzer v1 ===')
  console.log(JSON.stringify(summary, null, 2))

  console.log('=== ENDED DISCOUNT CANDIDATES SAMPLE ===')

  for (const row of endedCandidates.slice(0, sampleLimit)) {
    console.log(
      [
        row.psdeals_id,
        row.title,
        `slug=${row.psdeals_slug}`,
        `platforms=${JSON.stringify(row.platforms || [])}`,
        `price=${row.current_price_amount}`,
        `original=${row.original_price_amount}`,
        `discount=${row.discount_percent}`,
        `deal_ends_at=${row.deal_ends_at || 'null'}`,
        `is_ps_plus=${row.is_ps_plus_discount}`,
        `detail_last_synced_at=${row.detail_last_synced_at || 'null'}`,
        row.psdeals_url || buildPsdealsUrl(row.psdeals_id, row.psdeals_slug),
      ].join(' | ')
    )
  }

  if (endedCandidates.length > sampleLimit) {
    console.log(`... ${endedCandidates.length - sampleLimit} more rows not printed`)
  }

  if (outputTxt) {
    await fs.writeFile(path.resolve(process.cwd(), outputTxt), toTxt(endedCandidates), 'utf8')
    console.log(`ENDED_DISCOUNTS_TXT: ${outputTxt}`)
  }

  if (outputJson) {
    await fs.writeFile(
      path.resolve(process.cwd(), outputJson),
      JSON.stringify(
        {
          summary,
          ended_discount_candidates: endedCandidates,
          blocked_discount_candidates: blockedCandidates,
        },
        null,
        2
      ),
      'utf8'
    )
    console.log(`ENDED_DISCOUNTS_JSON: ${outputJson}`)
  }

  if (evidenceOptions.tracked) {
    const projectRoot = process.cwd()
    const outputReference = await referencePsdealsFile({
      project_root: projectRoot,
      file_path: path.resolve(projectRoot, outputJson),
      role: 'ended_deals_analysis',
      artifact_kind: 'ended_deals_analysis',
    })
    const evidenceFinishedAt = new Date().toISOString()
    const blockers = []
    if (!listingComplete) blockers.push('listing_not_strongly_complete')
    if (endedSelection.invalid_listing_items.length > 0) {
      blockers.push('listing_contains_invalid_psdeals_ids')
    }
    if (blockedCandidates.length > 0) {
      blockers.push('ended_candidates_require_detail_revalidation')
    }
    const evidence = buildEndedDealsEvidenceForAnalyzer({
      identity: buildPsdealsRuntimeIdentity(evidenceOptions),
      producer: buildPsdealsRuntimeProducer(
        'analyze-psdeals-ended-discounts-from-listing-v1',
        evidenceOptions
      ),
      timestamps: {
        started_at: evidenceStartedAt,
        finished_at: evidenceFinishedAt,
        generated_at: new Date().toISOString(),
      },
      context: parentEvidence.envelope.context,
      inputs: [trackedListingInput, listingEvidenceReference],
      outputs: [outputReference],
      listing_complete_confirmed: listingComplete,
      candidates: endedCandidates.length,
      blockers,
    })
    await emitPsdealsProducerEvidence({
      output_path: path.resolve(projectRoot, evidenceOptions.evidence_output),
      envelope: evidence,
    })
    console.log(`EVIDENCE_JSON: ${evidenceOptions.evidence_output}`)
  }
}

function isMainModule() {
  return Boolean(
    process.argv[1] &&
      import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  )
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
