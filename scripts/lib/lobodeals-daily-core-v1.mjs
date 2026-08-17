import crypto from 'node:crypto'

export const LOBODEALS_DAILY_CORE_VERSION = 1
export const ALLOWED_WRITE_RPCS = Object.freeze(new Set([
  'create_or_reconcile_price_refresh_cycle_v1',
  'record_psdeals_listing_completion_v1',
  'record_psdeals_monthly_check_v1',
  'begin_psdeals_cycle_action_v1',
  'finish_psdeals_cycle_action_v1',
  'finish_psdeals_ended_analysis_v2',
  'apply_psdeals_ended_deals_v3',
  'apply_psdeals_ended_deals_v4',
  'mark_psdeals_price_refresh_cycle_succeeded_v1',
  'certify_price_refresh_cycle_v3',
  'certify_price_refresh_cycle_v4',
  'refresh_catalog_public_cache_v16',
  'refresh_catalog_public_cache_v17',
  'enqueue_lobodeals_catalog_cache_refresh_v18',
  'enqueue_lobodeals_ended_demotion_v5',
]))

const MONTHS = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
})

export function assertAllowedWriteRpc(name) {
  if (!ALLOWED_WRITE_RPCS.has(name)) throw new Error(`WRITE_RPC_FORBIDDEN:${name}`)
  if (/v15|ended_deals_v1|ended_discounts_v1/i.test(name)) throw new Error(`LEGACY_RPC_FORBIDDEN:${name}`)
  return true
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value))
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function requestHash(value) {
  return sha256(Buffer.from(stableJson(value), 'utf8'))
}


function isNonnegativeInteger(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) >= 0
}

export function buildListingUpsertReceiptResult({ batch_index, attempted, affected_rows, label } = {}) {
  const batchIndex = Number(batch_index)
  const attemptedCount = Number(attempted)
  const affectedCount = Number(affected_rows)
  if (!isNonnegativeInteger(batchIndex)) throw new Error('LISTING_UPSERT_BATCH_INDEX_INVALID')
  if (!isNonnegativeInteger(attemptedCount)) throw new Error('LISTING_UPSERT_ATTEMPTED_INVALID')
  if (!isNonnegativeInteger(affectedCount) || affectedCount !== attemptedCount) throw new Error('LISTING_UPSERT_AFFECTED_COUNT_INVALID')
  return {
    affected_rows: affectedCount,
    batch_index: batchIndex,
    label: String(label || ''),
    attempted: attemptedCount,
    succeeded: affectedCount,
    failed: 0,
    skipped: 0,
  }
}

export function buildDetailImportReceiptResult({ attempted, succeeded, failed, skipped = 0, chunk_index } = {}) {
  const attemptedCount = Number(attempted)
  const succeededCount = Number(succeeded)
  const failedCount = Number(failed)
  const skippedCount = Number(skipped)
  const chunkIndex = Number(chunk_index)
  for (const [label, value] of [
    ['attempted', attemptedCount],
    ['succeeded', succeededCount],
    ['failed', failedCount],
    ['skipped', skippedCount],
    ['chunk_index', chunkIndex],
  ]) {
    if (!isNonnegativeInteger(value)) throw new Error(`DETAIL_RECEIPT_${label.toUpperCase()}_INVALID`)
  }
  if (attemptedCount !== succeededCount + failedCount + skippedCount) {
    throw new Error('DETAIL_RECEIPT_COUNTS_INCONSISTENT')
  }
  return {
    affected_rows: succeededCount,
    attempted: attemptedCount,
    succeeded: succeededCount,
    pending_failures: failedCount,
    failed: failedCount,
    skipped: skippedCount,
    chunk_index: chunkIndex,
  }
}

export function assertGenericReceiptResultContract(actionKind, result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(`GENERIC_RECEIPT_RESULT_NOT_OBJECT:${actionKind}`)
  const integer = (key) => {
    if (!isNonnegativeInteger(result[key])) throw new Error(`GENERIC_RECEIPT_FIELD_INVALID:${actionKind}:${key}`)
    return Number(result[key])
  }
  if (actionKind === 'listing_upsert_batch') {
    const attempted = integer('attempted')
    const succeeded = integer('succeeded')
    const failed = integer('failed')
    const skipped = integer('skipped')
    integer('batch_index')
    const affected = integer('affected_rows')
    if (attempted !== succeeded + failed + skipped || affected !== succeeded) throw new Error('GENERIC_RECEIPT_LISTING_COUNTS_INCONSISTENT')
  } else if (actionKind === 'fast_refresh_analysis') {
    integer('combined_count')
    integer('overlap_count')
    if (!/^[a-f0-9]{64}$/.test(String(result.combined_artifact_hash || ''))) throw new Error('GENERIC_RECEIPT_FAST_HASH_INVALID')
  } else if (actionKind === 'detail_import' || actionKind === 'detail_retry') {
    const attempted = integer('attempted')
    const succeeded = integer('succeeded')
    const pending = integer('pending_failures')
    const failed = result.failed == null ? pending : integer('failed')
    const skipped = result.skipped == null ? 0 : integer('skipped')
    if (attempted !== succeeded + failed + skipped || pending !== failed) throw new Error('GENERIC_RECEIPT_DETAIL_COUNTS_INCONSISTENT')
  } else if (actionKind === 'ended_deals_analysis') {
    if (result.listing_complete !== true) throw new Error('GENERIC_RECEIPT_ENDED_LISTING_INCOMPLETE')
    for (const key of ['listing_artifact_hash', 'analysis_evidence_hash', 'candidate_set_hash']) {
      if (!/^[a-f0-9]{64}$/.test(String(result[key] || ''))) throw new Error(`GENERIC_RECEIPT_ENDED_HASH_INVALID:${key}`)
    }
    const count = integer('candidate_count')
    if (count > 5000) throw new Error(`GENERIC_RECEIPT_ENDED_COUNT_LIMIT:${count}`)
  } else if (actionKind === 'public_validation') {
    if (result.passed !== true) throw new Error('GENERIC_RECEIPT_PUBLIC_VALIDATION_NOT_PASSED')
  }
  return true
}


export function canonicalCandidateIds(values = []) {
  return [...new Set(values.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))].sort((a, b) => a - b)
}

export function candidateSetHash(values = []) {
  return sha256(Buffer.from(canonicalCandidateIds(values).join('\n'), 'utf8'))
}

export function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/\b(playstation|ps5|ps4|cross gen|cross-gen|bundle|edition|standard|deluxe|complete|ultimate|remastered|reload(?:ed)?|game)\b/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function parsePsdealsId(value) {
  if (Number.isSafeInteger(Number(value)) && Number(value) > 0) return Number(value)
  const match = String(value || '').match(/\/us-store\/(?:game|add-ons|bundle|avatar|theme)\/(\d+)(?:\/|$)/i)
  return match ? Number(match[1]) : null
}

function nonemptyText(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned || null
}

function safePsdealsUrl(value) {
  const cleaned = nonemptyText(value)
  if (!cleaned) return null
  try {
    const parsed = new URL(cleaned)
    const host = parsed.hostname.toLowerCase()
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    if (host !== 'psdeals.net' && !host.endsWith('.psdeals.net')) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function slugFromPsdealsUrl(value) {
  const safe = safePsdealsUrl(value)
  if (!safe) return null
  try {
    const pathname = new URL(safe).pathname
    const match = pathname.match(/\/us-store\/(?:game|add-ons|bundle|avatar|theme)\/\d+\/([^/?#]+)\/?$/i)
    return match ? decodeURIComponent(match[1]).trim() || null : null
  } catch {
    return null
  }
}

export function hydrateListingIdentityFromExistingRows(listingItems = [], existingRows = []) {
  const existingById = new Map()
  for (const row of existingRows || []) {
    const id = parsePsdealsId(row?.psdeals_id)
    if (id) existingById.set(id, row)
  }

  const repairs = []
  const items = (listingItems || []).map((sourceItem, index) => {
    const item = sourceItem && typeof sourceItem === 'object' ? { ...sourceItem } : sourceItem
    if (!item || typeof item !== 'object') return item

    let id = parsePsdealsId(item.psdeals_id)
    if (!id) id = parsePsdealsId(item.psdeals_url)
    const existing = id ? existingById.get(id) : null
    const repairedFields = []

    if (id && parsePsdealsId(item.psdeals_id) !== id) {
      item.psdeals_id = id
      repairedFields.push('psdeals_id_from_url')
    }

    if (!nonemptyText(item.psdeals_slug)) {
      const sourceSlug = slugFromPsdealsUrl(item.psdeals_url)
      const existingSlug = nonemptyText(existing?.psdeals_slug)
      const replacement = sourceSlug || existingSlug
      if (replacement) {
        item.psdeals_slug = replacement
        repairedFields.push(sourceSlug ? 'psdeals_slug_from_url' : 'psdeals_slug_from_stage')
      }
    }

    if (!safePsdealsUrl(item.psdeals_url)) {
      const existingUrl = safePsdealsUrl(existing?.psdeals_url)
      if (existingUrl) {
        item.psdeals_url = existingUrl
        repairedFields.push('psdeals_url_from_stage')
      }
    }

    if (!nonemptyText(item.title)) {
      const existingTitle = nonemptyText(existing?.title)
      if (existingTitle) {
        item.title = existingTitle
        repairedFields.push('title_from_stage')
      }
    }

    if (repairedFields.length > 0) {
      repairs.push({ index, psdeals_id: id, fields: repairedFields })
    }
    return item
  })

  return {
    items,
    repair_count: repairs.length,
    repairs,
  }
}


export function planDeferredListingInsertRecovery({ prepared, listingItems = [], detailItems = [], maxDeferred = 20 } = {}) {
  if (!prepared || !Array.isArray(prepared.omitted)) throw new Error('DEFERRED_LISTING_PREPARED_INVALID')
  if (!Array.isArray(listingItems) || !Array.isArray(detailItems)) throw new Error('DEFERRED_LISTING_INPUT_INVALID')
  const safeLimit = Number.isSafeInteger(maxDeferred) && maxDeferred >= 0 ? maxDeferred : 20
  const detailIds = new Set(detailItems.map((item) => parsePsdealsId(item?.psdeals_id ?? item?.psdeals_url)).filter(Boolean))
  const forbidden = new Set([
    'psdeals_id_invalid',
    'psdeals_slug_missing',
    'psdeals_url_invalid',
    'listing_observed_at_invalid',
    'raw_listing_json_missing',
  ])
  const deferred = []
  const unsafe = []

  for (const omission of prepared.omitted) {
    const index = Number(omission?.index)
    const item = Number.isSafeInteger(index) && index >= 0 ? listingItems[index] : null
    const id = parsePsdealsId(item?.psdeals_id ?? item?.psdeals_url)
    const codes = Array.isArray(omission?.reason_codes) ? omission.reason_codes.map(String) : []
    const url = safePsdealsUrl(item?.psdeals_url)
    const slug = nonemptyText(item?.psdeals_slug) || slugFromPsdealsUrl(url)
    const canDefer =
      omission?.operation === 'insert' &&
      Boolean(id && url && slug) &&
      codes.includes('title_missing_for_insert') &&
      !codes.some((code) => forbidden.has(code)) &&
      detailIds.has(id)

    if (canDefer) {
      deferred.push({ index, psdeals_id: id, psdeals_url: url, psdeals_slug: slug, reason_codes: codes, item })
    } else {
      unsafe.push({ ...omission, psdeals_id: id || omission?.psdeals_id || null })
    }
  }

  if (deferred.length > safeLimit) throw new Error(`DEFERRED_LISTING_LIMIT_EXCEEDED:${deferred.length}:${safeLimit}`)
  const deferredIndexes = new Set(deferred.map((row) => row.index))
  const primaryItems = listingItems.filter((_, index) => !deferredIndexes.has(index))

  return {
    recoverable: unsafe.length === 0,
    deferred_count: deferred.length,
    deferred,
    unsafe_count: unsafe.length,
    unsafe,
    primary_items: primaryItems,
  }
}

export function assertExactListingBatchCoverage(prepared, expectedItems = []) {
  if (!prepared || !Array.isArray(prepared.batches)) throw new Error('LISTING_BATCH_PLAN_INVALID')
  const expectedIds = expectedItems.map((item) => parsePsdealsId(item?.psdeals_id ?? item?.psdeals_url))
  if (expectedIds.some((id) => !id)) throw new Error('LISTING_BATCH_EXPECTED_ID_INVALID')
  if (new Set(expectedIds).size !== expectedIds.length) throw new Error('LISTING_BATCH_EXPECTED_IDS_NOT_UNIQUE')

  const preparedIds = []
  for (const batch of prepared.batches) {
    if (!Array.isArray(batch?.rows)) throw new Error('LISTING_BATCH_ROWS_INVALID')
    for (const row of batch.rows) {
      const id = parsePsdealsId(row?.psdeals_id)
      if (!id) throw new Error('LISTING_BATCH_PREPARED_ID_INVALID')
      preparedIds.push(id)
    }
  }

  if (preparedIds.length !== expectedIds.length) {
    throw new Error(`LISTING_BATCH_COVERAGE_COUNT_MISMATCH:${preparedIds.length}:${expectedIds.length}`)
  }
  if (new Set(preparedIds).size !== preparedIds.length) throw new Error('LISTING_BATCH_PREPARED_IDS_NOT_UNIQUE')

  const preparedSet = new Set(preparedIds)
  const missing = expectedIds.filter((id) => !preparedSet.has(id))
  const expectedSet = new Set(expectedIds)
  const unexpected = preparedIds.filter((id) => !expectedSet.has(id))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`LISTING_BATCH_COVERAGE_SET_MISMATCH:missing=${missing.slice(0, 10).join(',')}:unexpected=${unexpected.slice(0, 10).join(',')}`)
  }
  return { expected_count: expectedIds.length, prepared_count: preparedIds.length }
}

export function buildFinalReconciliationDecision({
  initialListingObservedAt,
  decidedAt,
  maxAgeMs,
} = {}) {
  const initialMs = Date.parse(String(initialListingObservedAt || ''))
  const decidedMs = Date.parse(String(decidedAt || ''))
  const thresholdMs = Number(maxAgeMs)
  if (!Number.isFinite(initialMs)) throw new Error('FINAL_RECONCILIATION_INITIAL_LISTING_TIMESTAMP_INVALID')
  if (!Number.isFinite(decidedMs)) throw new Error('FINAL_RECONCILIATION_DECIDED_TIMESTAMP_INVALID')
  if (decidedMs < initialMs) throw new Error('FINAL_RECONCILIATION_DECISION_BEFORE_INITIAL_LISTING')
  if (!Number.isSafeInteger(thresholdMs) || thresholdMs <= 0) throw new Error('FINAL_RECONCILIATION_MAX_AGE_INVALID')

  const initialListingAgeMsAtDecision = decidedMs - initialMs
  return {
    decision_version: 1,
    final_fresh_required: initialListingAgeMsAtDecision >= thresholdMs,
    initial_listing_observed_at: new Date(initialMs).toISOString(),
    initial_listing_age_ms_at_decision: initialListingAgeMsAtDecision,
    decided_at: new Date(decidedMs).toISOString(),
    max_age_ms: thresholdMs,
  }
}

export function assertFinalReconciliationReferenceMode(decision, reference, label = 'reference') {
  if (!decision || typeof decision.final_fresh_required !== 'boolean') {
    throw new Error('FINAL_RECONCILIATION_DURABLE_DECISION_INVALID')
  }
  if (!reference || typeof reference.reused_initial_snapshot !== 'boolean') {
    throw new Error(`FINAL_RECONCILIATION_REFERENCE_MODE_MISSING:${label}`)
  }
  const expectedReused = !decision.final_fresh_required
  if (reference.reused_initial_snapshot !== expectedReused) {
    throw new Error(
      `FINAL_RECONCILIATION_REFERENCE_MODE_MISMATCH:${label}:expected_reused=${expectedReused}:actual_reused=${reference.reused_initial_snapshot}`,
    )
  }
  return true
}

export function buildFinalDiscountListingUpsertPlan({
  finalFreshRequired,
  listingObservedAt,
  listingHash,
  itemCount,
  prepared = null,
  recovery = null,
  identityRepairCount = 0,
  coverage = null,
} = {}) {
  const expectedCount = Number(itemCount)
  if (typeof finalFreshRequired !== 'boolean') throw new Error('FINAL_LISTING_FRESH_DECISION_REQUIRED')
  if (!isNonnegativeInteger(expectedCount)) throw new Error('FINAL_LISTING_ITEM_COUNT_INVALID')

  if (!finalFreshRequired) {
    return {
      plan_version: 1,
      listing_observed_at: listingObservedAt,
      listing_hash: listingHash,
      reused_initial_snapshot: true,
      expected_affected: 0,
      deferred_count: 0,
      deferred_items: [],
      identity_repair_count: 0,
      coverage: {
        expected_count: expectedCount,
        prepared_count: 0,
        deferred_count: 0,
        verification: 'final_stage_stamp',
      },
      batches: [],
    }
  }

  if (!prepared || !Array.isArray(prepared.batches)) throw new Error('FINAL_LISTING_PREPARED_PLAN_INVALID')
  if (!recovery || !Array.isArray(recovery.deferred)) throw new Error('FINAL_LISTING_RECOVERY_PLAN_INVALID')
  if (!coverage || !isNonnegativeInteger(coverage.prepared_count)) throw new Error('FINAL_LISTING_COVERAGE_INVALID')
  const preparedCount = Number(prepared.prepared)
  const deferredCount = Number(recovery.deferred_count)
  if (!isNonnegativeInteger(preparedCount) || !isNonnegativeInteger(deferredCount)) {
    throw new Error('FINAL_LISTING_PLAN_COUNTS_INVALID')
  }
  if (preparedCount + deferredCount !== expectedCount) {
    throw new Error(`FINAL_LISTING_TOTAL_COVERAGE_INVALID:${preparedCount}:${deferredCount}:${expectedCount}`)
  }

  return {
    plan_version: 1,
    listing_observed_at: listingObservedAt,
    listing_hash: listingHash,
    reused_initial_snapshot: false,
    expected_affected: preparedCount,
    deferred_count: deferredCount,
    deferred_items: recovery.deferred,
    identity_repair_count: Number(identityRepairCount) || 0,
    coverage,
    batches: prepared.batches,
  }
}

export function listingItemKey(item) {
  const id = parsePsdealsId(item?.psdeals_id ?? item?.psdeals_url)
  if (id) return `id:${id}`
  const url = String(item?.psdeals_url || '').trim()
  return url ? `url:${url}` : null
}

export function uniqueListingItems(items = []) {
  const map = new Map()
  for (const item of items) {
    const key = listingItemKey(item)
    if (key && !map.has(key)) map.set(key, item)
  }
  return [...map.values()]
}

export function planRecentPage({ page_items = [], known_ids = [], consecutive_known_pages = 0, stop_after = 3 } = {}) {
  const known = known_ids instanceof Set ? known_ids : new Set([...known_ids].map(Number))
  const items = uniqueListingItems(page_items)
  const missing = items.filter((item) => {
    const id = parsePsdealsId(item?.psdeals_id ?? item?.psdeals_url)
    return id && !known.has(id)
  })
  const pageAllKnown = items.length > 0 && missing.length === 0
  const nextConsecutive = pageAllKnown ? consecutive_known_pages + 1 : 0
  return {
    page_item_count: items.length,
    missing_items: missing,
    missing_ids: missing.map((item) => parsePsdealsId(item.psdeals_id ?? item.psdeals_url)),
    page_all_known: pageAllKnown,
    consecutive_known_pages: nextConsecutive,
    should_stop: nextConsecutive >= stop_after,
  }
}

export function mergeBacklogAndFresh(backlog = [], fresh = []) {
  return uniqueListingItems([...backlog, ...fresh])
}

export function isCanonicalDiscountTerminalClamp({ requested_page = null, active_page = null } = {}) {
  const requested = Number(requested_page)
  const active = Number(active_page)
  return (
    Number.isSafeInteger(requested) &&
    Number.isSafeInteger(active) &&
    requested > 1 &&
    active > 0 &&
    active === requested - 1
  )
}

export function classifyDiscountResumeSnapshot({
  checkpoint_total = null,
  fresh_total = null,
  next_page = 1,
  expected_page_size = 36,
} = {}) {
  const checkpointTotal = Number(checkpoint_total)
  const freshTotal = Number(fresh_total)
  const nextPage = Number(next_page)
  const pageSize = Number(expected_page_size)

  const checkpointValid = Number.isSafeInteger(checkpointTotal) && checkpointTotal > 0
  const freshValid = Number.isSafeInteger(freshTotal) && freshTotal > 0
  const nextValid = Number.isSafeInteger(nextPage) && nextPage > 0
  const pageSizeValid = Number.isSafeInteger(pageSize) && pageSize > 0

  if (!freshValid) {
    return {
      reset: false,
      reason: 'fresh_total_unavailable',
      checkpoint_total: checkpointValid ? checkpointTotal : null,
      fresh_total: null,
      expected_last_page: null,
    }
  }

  const expectedLastPage = pageSizeValid ? Math.max(1, Math.ceil(freshTotal / pageSize)) : null

  if (checkpointValid && checkpointTotal !== freshTotal) {
    return {
      reset: true,
      reason: 'total_results_changed_while_run_paused',
      checkpoint_total: checkpointTotal,
      fresh_total: freshTotal,
      expected_last_page: expectedLastPage,
    }
  }

  if (nextValid && expectedLastPage !== null && nextPage > expectedLastPage) {
    return {
      reset: true,
      reason: 'resume_page_out_of_range_for_fresh_total',
      checkpoint_total: checkpointValid ? checkpointTotal : null,
      fresh_total: freshTotal,
      expected_last_page: expectedLastPage,
    }
  }

  return {
    reset: false,
    reason: 'resume_snapshot_still_compatible',
    checkpoint_total: checkpointValid ? checkpointTotal : null,
    fresh_total: freshTotal,
    expected_last_page: expectedLastPage,
  }
}

export function classifyDiscountPage({ current_items = [], probe_items = [], expected_page_size = 36, total_results = null, unique_before = 0 } = {}) {
  const current = uniqueListingItems(current_items)
  const probe = uniqueListingItems(probe_items)
  const currentIds = new Set(current.map((item) => listingItemKey(item)))
  const probeNew = probe.filter((item) => !currentIds.has(listingItemKey(item)))
  const isShort = current.length > 0 && current.length < Math.max(1, Math.floor(expected_page_size * 0.8))
  const exactTotalReached = total_results !== null && total_results !== undefined && Number(total_results) > 0 && Number.isSafeInteger(Number(total_results)) && unique_before + current.length >= Number(total_results)
  if (!isShort) return { classification: 'normal', accept_current: true, terminal: exactTotalReached, probe_new_count: probeNew.length }
  if (exactTotalReached) return { classification: 'terminal_exact_total', accept_current: true, terminal: true, probe_new_count: probeNew.length }
  if (probe.length > 0 && probeNew.length === 0) return { classification: 'terminal_repeated_short_page', accept_current: true, terminal: true, probe_new_count: 0 }
  return { classification: 'suspicious_short_page', accept_current: false, terminal: false, probe_new_count: probeNew.length }
}

export function normalizeListingEvidenceTermination(stopReason) {
  const value = String(stopReason || '').trim()
  if (value === 'terminal_repeated_page' || value === 'terminal_repeated_short_page' || value === 'terminal_exact_total') return 'pagination_final_observed'
  return value
}


const PSDEALS_SPANISH_LISTING_TYPE_LABELS = new Set([
  'juego completo',
  'complemento',
  'disfraz',
  'articulo',
  'nivel',
  'personaje',
  'paquete de complementos',
  'lote de juegos',
  'vehiculo',
  'mapa',
  'edicion premium',
  'pista',
  'episodio',
  'pase de temporada',
  'armas',
  'moneda virtual',
  'entrada',
  'banda sonora',
  'paquete',
])

const PSDEALS_ENGLISH_LISTING_TYPE_LABELS = new Set([
  'full game',
  'game content',
  'psn game',
  'vr game',
  'add-on',
  'avatar',
  'avatars',
  'character',
  'costume',
  'dynamic theme',
  'extra episode',
  'item',
  'level',
  'map',
  'music track',
  'season pass',
  'soundtrack',
  'static theme',
  'theme',
  'vehicle',
  'vr add-on',
  'weapons',
  'bundle',
  'demo',
  'catalog',
  'combo',
  'subscription',
])

function normalizeLanguageSignal(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function classifyPsDealsLanguageSnapshot(snapshot = {}) {
  const htmlLang = normalizeLanguageSignal(snapshot.html_lang)
  const cookieText = normalizeLanguageSignal(snapshot.cookie_text)
  const navText = normalizeLanguageSignal(snapshot.nav_text)
  const title = normalizeLanguageSignal(snapshot.title)
  const bodyText = normalizeLanguageSignal(snapshot.body_text)
  const combined = `${navText}\n${title}\n${bodyText}`

  let englishScore = 0
  let spanishScore = 0
  const englishSignals = []
  const spanishSignals = []

  if (/^en(?:-|$)/.test(htmlLang)) { englishScore += 6; englishSignals.push(`html_lang:${htmlLang}`) }
  if (/^es(?:-|$)/.test(htmlLang)) { spanishScore += 6; spanishSignals.push(`html_lang:${htmlLang}`) }

  if (/(?:^|[;_\s-])(lang|locale|language)=(?:en|en-us)(?:[;_\s-]|$)/.test(cookieText)) {
    englishScore += 4; englishSignals.push('cookie:en')
  }
  if (/(?:^|[;_\s-])(lang|locale|language)=(?:es|es-es|es-us)(?:[;_\s-]|$)/.test(cookieText)) {
    spanishScore += 4; spanishSignals.push('cookie:es')
  }

  const englishMarkers = [
    ['all games', 3],
    ['discounts', 3],
    ['buy at', 2],
    ['when price drops', 2],
    ['add to my wish list', 2],
    ['own this game', 2],
    ['price history', 2],
    ['reviews', 1],
  ]
  const spanishMarkers = [
    ['todos los juegos', 3],
    ['descuentos', 3],
    ['comprar en', 2],
    ['cuando baje el precio', 2],
    ['lista de deseos', 2],
    ['historial de precios', 2],
    ['resenas', 1],
    ['juego completo', 1],
    ['complemento', 1],
    ['disfraz', 1],
  ]
  for (const [marker, weight] of englishMarkers) {
    if (combined.includes(marker)) { englishScore += weight; englishSignals.push(`text:${marker}`) }
  }
  for (const [marker, weight] of spanishMarkers) {
    if (combined.includes(marker)) { spanishScore += weight; spanishSignals.push(`text:${marker}`) }
  }

  const visibleEnglishNav = navText.includes('discounts') && navText.includes('all games')
  const visibleSpanishNav = navText.includes('descuentos') && navText.includes('todos los juegos')

  let state = 'unknown'
  if (visibleEnglishNav && !visibleSpanishNav) state = 'english'
  else if (visibleSpanishNav && !visibleEnglishNav) state = 'spanish'
  else if (englishScore >= 3 && spanishScore === 0) state = 'english'
  else if (spanishScore >= 3 && englishScore === 0) state = 'spanish'
  else if (englishScore >= spanishScore + 4) state = 'english'
  else if (spanishScore >= englishScore + 4) state = 'spanish'

  return {
    state,
    ready: state === 'english',
    english_score: englishScore,
    spanish_score: spanishScore,
    html_lang: snapshot.html_lang || null,
    english_signals: englishSignals,
    spanish_signals: spanishSignals,
  }
}

export function auditPsDealsListingLanguage(items = []) {
  const rows = Array.isArray(items) ? items : []
  const spanish = []
  const english = []
  const unknown = []
  for (const item of rows) {
    const raw = item?.type_label ?? item?.raw_listing_json?.type_label ?? null
    const normalized = normalizeLanguageSignal(raw)
    if (!normalized) { unknown.push(item); continue }
    if (PSDEALS_SPANISH_LISTING_TYPE_LABELS.has(normalized)) spanish.push(item)
    else if (PSDEALS_ENGLISH_LISTING_TYPE_LABELS.has(normalized)) english.push(item)
    else unknown.push(item)
  }
  return {
    total: rows.length,
    spanish_count: spanish.length,
    english_count: english.length,
    unknown_count: unknown.length,
    state: spanish.length > 0 ? 'spanish_detected' : english.length > 0 ? 'english_or_unknown' : 'unknown',
    spanish_ids: spanish.map((item) => Number(item?.psdeals_id)).filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 50),
  }
}

export function classifyEdgeSnapshot(snapshot = {}) {
  if (snapshot.cdp_available !== true) return { state: 'cdp_unavailable', ready: false }
  if (snapshot.tab_found !== true) return { state: 'wrong_tab', ready: false }
  const title = String(snapshot.title || '')
  const url = String(snapshot.url || '')
  const body = String(snapshot.body_text || '')
  const text = `${title}\n${body}`
  const explicitRateLimit =
    /too many requests|demasiadas solicitudes/i.test(text) ||
    /(?:^|\D)429(?:\D|$)/i.test(title)
  if (explicitRateLimit) return { state: 'rate_limited_429', ready: false }
  const explicitChallenge =
    snapshot.challenge_present === true ||
    /just a moment|un momento/i.test(title)
  if (explicitChallenge) return { state: 'challenge_present', ready: false }
  if (
    Number(snapshot.card_count || 0) > 0 ||
    snapshot.detail_ready === true ||
    snapshot.detail_route_ready === true
  ) return { state: 'page_ready', ready: true }
  if (/verify (?:that )?you are human|checking your browser|performing security verification|demuestra que no eres un robot|no eres un robot|incompatible browser extension or network configuration/i.test(body)) {
    return { state: 'challenge_present', ready: false }
  }
  return { state: 'page_not_ready', ready: false }
}

export function decodeHtml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
}

export function stripHtml(value) {
  const decoded = decodeHtml(String(value || ''))
  return decoded.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function parseDateParts(monthName, day, year) {
  const month = MONTHS[String(monthName || '').toLowerCase()]
  if (!month) return null
  const numericDay = Number(day)
  const numericYear = Number(year)
  if (!Number.isSafeInteger(numericDay) || numericDay < 1 || numericDay > 31 || !Number.isSafeInteger(numericYear)) return null
  return `${numericYear}-${String(month).padStart(2, '0')}-${String(numericDay).padStart(2, '0')}`
}

export function parseMonthlyArticle({ html, source_url, published_at } = {}) {
  const source = String(html || '')
  const headings = [...source.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match) => stripHtml(match[2]))
  const games = []
  for (const heading of headings) {
    if (/last chance|playstation plus|monthly games lineup|also available|catalog/i.test(heading) && !/\|\s*PS[45]/i.test(heading)) continue
    const match = heading.match(/^(.+?)\s*\|\s*((?:PS[45](?:\s*,\s*PS[45])?))\s*$/i)
    if (!match) continue
    const title = match[1].trim()
    const platforms = match[2].split(',').map((value) => value.trim().toUpperCase())
    if (title && !games.some((game) => normalizeTitle(game.title) === normalizeTitle(title))) games.push({ title, platforms })
  }
  const text = stripHtml(source)
  const publishedYear = new Date(published_at || Date.now()).getUTCFullYear()
  const monthPattern = '(January|February|March|April|May|June|July|August|September|October|November|December)'
  const optionalWeekday = '(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\\s+)?'
  const dayPattern = '(\\d{1,2})(?:st|nd|rd|th)?'
  const rangePatterns = [
    new RegExp(`available[^.]{0,180}?(?:from|on)\\s+${optionalWeekday}${monthPattern}\\s+${dayPattern}[^.]{0,140}?(?:until|through|to)\\s+${optionalWeekday}${monthPattern}\\s+${dayPattern}`, 'i'),
    new RegExp(`(?:from|on)\\s+${optionalWeekday}${monthPattern}\\s+${dayPattern}[^.]{0,140}?(?:until|through|to)\\s+${optionalWeekday}${monthPattern}\\s+${dayPattern}`, 'i'),
  ]
  let range = null
  for (const pattern of rangePatterns) {
    const match = text.match(pattern)
    if (match) { range = match; break }
  }
  let activeFrom = null
  let activeUntil = null
  if (range) {
    activeFrom = parseDateParts(range[1], range[2], publishedYear)
    const fromMonth = MONTHS[range[1].toLowerCase()]
    const untilMonth = MONTHS[range[3].toLowerCase()]
    activeUntil = parseDateParts(range[3], range[4], untilMonth < fromMonth ? publishedYear + 1 : publishedYear)
  }
  if (games.length < 2 || games.length > 5) throw new Error(`MONTHLY_GAME_COUNT_UNSAFE:${games.length}`)
  if (!activeFrom || !activeUntil) throw new Error('MONTHLY_AVAILABILITY_DATES_NOT_FOUND')
  const monthKey = activeFrom.slice(0, 7)
  return { source_url, published_at, month_key: monthKey, active_from: activeFrom, active_until: activeUntil, games }
}

export function parseMonthlyFeedCandidates(xml = '') {
  const items = [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1])
  const candidates = []
  for (const item of items) {
    const title = stripHtml(item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    if (!/^PlayStation Plus Monthly Games for\b/i.test(title)) continue
    const link = stripHtml(item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '')
    const publishedAt = stripHtml(item.match(/<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || '')
    if (!/^https:\/\/blog\.playstation\.com\//i.test(link)) throw new Error('MONTHLY_SOURCE_NOT_OFFICIAL')
    candidates.push({ title, link, published_at: publishedAt })
  }
  return candidates
}

export function parseMonthlyFeed(xml = '') {
  const candidate = parseMonthlyFeedCandidates(xml)[0]
  if (!candidate) throw new Error('MONTHLY_OFFICIAL_ARTICLE_NOT_FOUND')
  return candidate
}


export function parseMonthlyCategoryCandidates(html = '') {
  const decoded = decodeHtml(String(html || '')).replace(/\\\//g, '/')
  const references = [
    ...[...decoded.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]),
    ...[...decoded.matchAll(/https:\/\/blog\.playstation\.com\/\d{4}\/\d{2}\/\d{2}\/playstation-plus-monthly-games-for-[^\s"'?#<\\]+\/?/gi)].map((match) => match[0]),
  ]
  const candidates = new Map()
  for (const reference of references) {
    let url
    try {
      url = new URL(reference, 'https://blog.playstation.com/')
    } catch {
      continue
    }
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'blog.playstation.com') continue
    const match = url.pathname.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\/(playstation-plus-monthly-games-for-[^/]+)\/?$/i)
    if (!match) continue
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const timestamp = Date.UTC(year, month - 1, day, 12, 0, 0)
    const date = new Date(timestamp)
    if (!Number.isFinite(timestamp) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue
    const link = `https://blog.playstation.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}/`
    if (!candidates.has(link)) candidates.set(link, { title: null, link, published_at: date.toISOString(), timestamp })
  }
  return [...candidates.values()].sort((a, b) => b.timestamp - a.timestamp || a.link.localeCompare(b.link))
}

export function parseMonthlyCategoryHtml(html = '') {
  const latest = parseMonthlyCategoryCandidates(html)[0]
  if (!latest) throw new Error('MONTHLY_OFFICIAL_ARTICLE_NOT_FOUND')
  return { title: latest.title, link: latest.link, published_at: latest.published_at }
}

function tokenSet(value) {
  return new Set(normalizeTitle(value).split(' ').filter((token) => token.length > 1))
}

export function titleScore(officialTitle, candidateTitle) {
  const a = tokenSet(officialTitle)
  const b = tokenSet(candidateTitle)
  if (!a.size || !b.size) return 0
  const intersection = [...a].filter((token) => b.has(token)).length
  const union = new Set([...a, ...b]).size
  const jaccard = intersection / union
  const containment = intersection / Math.min(a.size, b.size)
  const exact = normalizeTitle(officialTitle) === normalizeTitle(candidateTitle) ? 1 : 0
  return Math.max(exact, 0.65 * containment + 0.35 * jaccard)
}

function normalizedPlatforms(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[,/|]+/)
  return new Set(source.map((platform) => String(platform || '').trim().toUpperCase()).filter((platform) => platform === 'PS4' || platform === 'PS5'))
}

function platformAssessment(officialPlatforms, candidatePlatforms) {
  const official = normalizedPlatforms(officialPlatforms)
  const candidate = normalizedPlatforms(candidatePlatforms)
  if (!official.size) return { compatible: true, complete: true, exact: candidate.size === 0, official: [...official], candidate: [...candidate] }
  if (!candidate.size) return { compatible: true, complete: false, exact: false, official: [...official], candidate: [...candidate] }
  const overlap = [...official].some((platform) => candidate.has(platform))
  const complete = [...official].every((platform) => candidate.has(platform))
  const exact = complete && candidate.size === official.size
  return { compatible: overlap, complete, exact, official: [...official], candidate: [...candidate] }
}

export function resolveMonthlyGames(monthly, candidates = []) {
  const resolutions = []
  for (const game of monthly.games || []) {
    const ranked = candidates
      .map((candidate) => {
        const platform = platformAssessment(game.platforms, candidate.platforms || candidate.platform_label)
        return {
          candidate,
          score: titleScore(game.title, candidate.title),
          normalized_candidate_title: normalizeTitle(candidate.title),
          platform,
        }
      })
      .filter((row) => row.score > 0 && row.platform.compatible)
      .sort((a, b) =>
        b.score - a.score ||
        Number(b.platform.complete) - Number(a.platform.complete) ||
        Number(b.platform.exact) - Number(a.platform.exact) ||
        Number(a.candidate.psdeals_id || 0) - Number(b.candidate.psdeals_id || 0)
      )
    const first = ranked[0]
    const second = ranked[1]
    const titleMarginUnique = first && (!second || first.score - second.score >= 0.08)
    const sameNormalizedCandidateTitle = first && second && first.normalized_candidate_title === second.normalized_candidate_title
    const completePlatformTieBreak = Boolean(
      first && second &&
      sameNormalizedCandidateTitle &&
      first.platform.complete === true &&
      second.platform.complete === false
    )
    const unique = Boolean(first && first.score >= 0.72 && (titleMarginUnique || completePlatformTieBreak))
    resolutions.push({
      official: game,
      status: unique ? 'resolved' : 'ambiguous',
      psdeals_id: unique ? Number(first.candidate.psdeals_id) : null,
      item_id: unique ? first.candidate.id || null : null,
      candidate: unique ? first.candidate : null,
      score: first?.score || 0,
      runner_up_score: second?.score || 0,
      resolution_reason: unique ? (completePlatformTieBreak ? 'same_title_complete_platform_coverage' : 'unique_title_margin') : null,
      candidates: ranked.slice(0, 5).map((row) => ({
        psdeals_id: row.candidate.psdeals_id,
        title: row.candidate.title,
        platforms: [...row.platform.candidate],
        score: row.score,
        platform_complete: row.platform.complete,
        platform_exact: row.platform.exact,
      })),
    })
  }
  const resolvedIds = resolutions.filter((row) => row.status === 'resolved').map((row) => row.psdeals_id)
  const distinctResolvedIds = new Set(resolvedIds)
  const allResolved = resolutions.every((row) => row.status === 'resolved')
  const distinct = allResolved && distinctResolvedIds.size === resolutions.length
  if (allResolved && !distinct) {
    for (const row of resolutions) {
      if (resolvedIds.filter((id) => id === row.psdeals_id).length > 1) row.status = 'ambiguous_duplicate_target'
    }
  }
  return { resolved: allResolved && distinct, resolutions }
}

export function selectCurrentMonthlySet(monthlySets = [], currentDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(currentDate || ''))) throw new Error('MONTHLY_CURRENT_DATE_INVALID')
  const active = monthlySets
    .filter((row) => row && row.active_from <= currentDate && row.active_until >= currentDate)
    .sort((a, b) => String(b.active_from).localeCompare(String(a.active_from)) || String(b.published_at || '').localeCompare(String(a.published_at || '')))
  if (!active.length) return null
  const first = active[0]
  const conflicting = active.find((row) => row !== first && (row.month_key !== first.month_key || stableJson(row.games) !== stableJson(first.games)))
  if (conflicting) throw new Error(`MONTHLY_ACTIVE_SET_CONFLICT:${first.month_key}:${conflicting.month_key}`)
  return first
}

export function compareMonthlySets(currentRows = [], monthly, resolutions) {
  const active = currentRows.filter((row) => row.is_active !== false)
  const current = new Set(active.map((row) => `${row.month_key}:${row.item_id}`))
  const targetRows = resolutions.resolutions.map((row) => ({
    key: `${monthly.month_key}:${row.item_id || row.psdeals_id}`,
    title: row.official?.title || null,
  }))
  const target = new Set(targetRows.map((row) => row.key))
  const keysSame = current.size === target.size && [...current].every((key) => target.has(key))
  const metadataSame = keysSame && targetRows.every((targetRow) => {
    const currentRow = active.find((row) => `${row.month_key}:${row.item_id}` === targetRow.key)
    return currentRow &&
      normalizeTitle(currentRow.title) === normalizeTitle(targetRow.title) &&
      String(currentRow.active_from || '') === String(monthly.active_from || '') &&
      String(currentRow.active_until || '') === String(monthly.active_until || '')
  })
  return { same: metadataSame, keys_same: keysSame, metadata_same: metadataSame, current_keys: [...current].sort(), target_keys: [...target].sort() }
}

function finiteAmount(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function classifyMonthlyCommercialContamination(row = {}) {
  const current = finiteAmount(row.current_price_amount)
  const original = finiteAmount(row.original_price_amount)
  const psPlus = finiteAmount(row.ps_plus_price_amount)
  const discount = finiteAmount(row.discount_percent)
  const hasRegularFlag =
    row.has_deal === true || row.has_verified_deal === true
  const hasPsPlusFlag =
    row.has_ps_plus_deal === true || row.has_verified_ps_plus_deal === true
  const coherentRegularDeal =
    current !== null && current > 0 &&
    original !== null && original > current &&
    Number.isInteger(discount) && discount >= 1 && discount <= 99
  const coherentPsPlusDeal =
    psPlus !== null && psPlus > 0 &&
    current !== null && current > 0 && psPlus < current
  const reasons = [
    ...(hasRegularFlag && !coherentRegularDeal
      ? ['monthly_regular_flag_without_coherent_positive_discount']
      : []),
    ...(hasPsPlusFlag && !coherentPsPlusDeal
      ? ['monthly_ps_plus_flag_without_coherent_positive_discount']
      : []),
  ]

  return {
    contaminated: reasons.length > 0,
    reasons,
    has_regular_commercial_deal: hasRegularFlag && coherentRegularDeal,
    has_ps_plus_commercial_deal: hasPsPlusFlag && coherentPsPlusDeal,
  }
}

export function reconcileMonthlyApplicationCheckpoint({ comparison_same, checkpoint = {}, active_games = 0 } = {}) {
  const proposalRecorded = checkpoint?.phases?.proposal_recorded === true
  const applicationRecorded = checkpoint?.phases?.applied === true
  if (comparison_same !== true || !proposalRecorded || applicationRecorded) {
    return { recovered: false, application: checkpoint.application || null, phases: {} }
  }
  return {
    recovered: true,
    application: {
      affected_rows: 0,
      active_games: Number(active_games || 0),
      no_changes: false,
      recovered_after_application: true,
      reconciliation: 'target_postcondition_already_true',
    },
    phases: {
      applied: true,
      verified_after_application: true,
      reconciled_after_interruption: true,
    },
  }
}

export function planUncommittedMarkTimestampRecovery({ timestamps = {}, validation_floors = [] } = {}) {
  const valid = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value))
  const floors = (validation_floors || []).filter(valid).map((value) => Date.parse(value))
  const validationFloor = floors.length ? Math.max(...floors) : Number.NEGATIVE_INFINITY
  const validation = timestamps?.validation_completed_at || null
  const finished = timestamps?.cycle_finished_at || null

  if (validation !== null && !valid(validation)) throw new Error('STABLE_TIMESTAMP_INVALID:validation_completed_at')
  if (finished !== null && !valid(finished)) throw new Error('STABLE_TIMESTAMP_INVALID:cycle_finished_at')

  const resetValidation = validation !== null && Date.parse(validation) < validationFloor
  const resetFinished = resetValidation || (
    finished !== null && (
      validation === null || Date.parse(finished) < Date.parse(validation)
    )
  )
  return {
    requires_reset: resetValidation || resetFinished,
    reset_validation_completed_at: resetValidation,
    reset_cycle_finished_at: resetFinished,
    validation_floor_iso: Number.isFinite(validationFloor) ? new Date(validationFloor).toISOString() : null,
  }
}

export function checkpointAfterSuccess(checkpoint = {}, unit) {
  const completed = new Set(checkpoint.completed_units || [])
  completed.add(String(unit))
  return {
    ...checkpoint,
    completed_units: [...completed],
    last_completed_unit: String(unit),
    updated_at: new Date().toISOString(),
  }
}
