import {
  buildPsdealsListingInsertPayload,
  buildPsdealsListingUpdatePayload,
} from './psdeals-stage-payload.mjs'

export const PSDEALS_STAGE_UPSERT_CONFLICT_TARGET =
  'region_code,storefront,psdeals_id'
export const PSDEALS_STAGE_UPSERT_DEFAULT_BATCH_SIZE = 100

const CERTIFIED_FIELDS = new Set([
  'lobodeals_lowest_regular_price_amount',
  'lobodeals_lowest_regular_price_first_seen_at',
  'lobodeals_lowest_ps_plus_price_amount',
  'lobodeals_lowest_ps_plus_price_first_seen_at',
])

function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function safeBatchSize(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 500
    ? value
    : PSDEALS_STAGE_UPSERT_DEFAULT_BATCH_SIZE
}

function signature(operation, payload) {
  return `${operation}\u0000${Object.keys(payload).sort().join('\u0000')}`
}

export function preparePsdealsListingUpsertBatches({
  listing_items,
  existing_psdeals_ids,
  listing_observed_at,
  batch_size = PSDEALS_STAGE_UPSERT_DEFAULT_BATCH_SIZE,
} = {}) {
  if (!Array.isArray(listing_items)) throw new Error('LISTING_ITEMS_REQUIRED')
  if (!Array.isArray(existing_psdeals_ids)) {
    throw new Error('EXISTING_PSDEALS_IDS_REQUIRED_FOR_SAFE_OWNERSHIP')
  }
  const existing = new Set(existing_psdeals_ids.map(positiveInteger).filter(Boolean))
  const accepted = []
  const omitted = []

  for (const [index, item] of listing_items.entries()) {
    const id = positiveInteger(item?.psdeals_id)
    const operation = id && existing.has(id) ? 'update' : 'insert'
    const built = operation === 'update'
      ? buildPsdealsListingUpdatePayload(item, { listingObservedAt: listing_observed_at })
      : buildPsdealsListingInsertPayload(item, { listingObservedAt: listing_observed_at })
    if (!built.is_valid) {
      omitted.push({ index, psdeals_id: id, operation, reason_codes: built.reason_codes })
      continue
    }
    const unsafeFields = Object.keys(built.payload).filter((field) => CERTIFIED_FIELDS.has(field))
    const nullFields = Object.entries(built.payload).filter(([, value]) => value == null).map(([field]) => field)
    if (unsafeFields.length > 0 || nullFields.length > 0) {
      omitted.push({
        index,
        psdeals_id: id,
        operation,
        reason_codes: [
          ...(unsafeFields.length > 0 ? ['certified_fields_present'] : []),
          ...(nullFields.length > 0 ? ['null_fields_present'] : []),
        ],
      })
      continue
    }
    accepted.push({ index, psdeals_id: id, operation, payload: built.payload })
  }

  const size = safeBatchSize(batch_size)
  const grouped = new Map()
  for (const row of accepted) {
    const key = signature(row.operation, row.payload)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }
  const batches = []
  for (const rows of grouped.values()) {
    for (let index = 0; index < rows.length; index += size) {
      const slice = rows.slice(index, index + size)
      batches.push({
        batch_index: batches.length,
        operation: slice[0].operation,
        columns: Object.keys(slice[0].payload).sort(),
        conflict_target: PSDEALS_STAGE_UPSERT_CONFLICT_TARGET,
        ignore_duplicates: false,
        rows: slice.map((row) => row.payload),
        source_indexes: slice.map((row) => row.index),
      })
    }
  }

  return {
    valid: omitted.length === 0,
    attempted: listing_items.length,
    prepared: accepted.length,
    omitted_count: omitted.length,
    omitted,
    batch_size: size,
    batches,
    conflict_target: PSDEALS_STAGE_UPSERT_CONFLICT_TARGET,
    requires_existing_row_lookup: true,
    executes_remote_operations: false,
  }
}

export async function executePreparedPsdealsListingBatches(
  prepared,
  { upsert_batch } = {}
) {
  if (!prepared || !Array.isArray(prepared.batches)) throw new Error('PREPARED_BATCHES_REQUIRED')
  if (typeof upsert_batch !== 'function') throw new Error('UPSERT_BATCH_PORT_REQUIRED')
  const results = []
  for (const batch of prepared.batches) {
    try {
      const result = await upsert_batch(batch)
      const succeeded = Number(result?.succeeded)
      const failed = Number(result?.failed)
      if (!Number.isSafeInteger(succeeded) || !Number.isSafeInteger(failed) || succeeded + failed !== batch.rows.length) {
        throw new Error('UPSERT_BATCH_RESULT_INCONSISTENT')
      }
      results.push({ batch_index: batch.batch_index, succeeded, failed, error: null })
    } catch (error) {
      results.push({
        batch_index: batch.batch_index,
        succeeded: 0,
        failed: batch.rows.length,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const succeeded = results.reduce((total, result) => total + result.succeeded, 0)
  const failed = results.reduce((total, result) => total + result.failed, 0)
  return {
    attempted: prepared.prepared,
    succeeded,
    failed,
    status: failed === 0 ? 'succeeded' : succeeded > 0 ? 'partial' : 'failed',
    batches: results,
  }
}
