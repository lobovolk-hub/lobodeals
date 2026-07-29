import {
  hashPsdealsDemotionCandidateIds,
} from '../../scripts/lib/psdeals-cycle-migration-contract.mjs'

const HASH_PATTERN = /^[a-f0-9]{64}$/

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export class PsdealsMigratedLifecycleFixture {
  constructor() {
    this.cycles = new Map()
    this.receipts = new Map()
    this.receiptsById = new Map()
    this.effects = new Map()
    this.nextCycle = 1
    this.nextReceipt = 100
  }

  effectCount(action) {
    return this.effects.get(action) || 0
  }

  increment(action) {
    this.effects.set(action, this.effectCount(action) + 1)
  }

  findCycles({ local_cycle_id, run_token_sha256 }) {
    return [...this.cycles.values()]
      .filter((cycle) => cycle.local_cycle_id === local_cycle_id || cycle.run_token_sha256 === run_token_sha256)
      .map(clone)
  }

  findReceipt(idempotencyKey) {
    return clone(this.receipts.get(idempotencyKey) || null)
  }

  readCycle(cycleId) {
    return clone(this.cycles.get(cycleId) || null)
  }

  committedReceipt({
    cycleId,
    parentReceiptId = null,
    action,
    key,
    requestHash,
    inputHash = null,
    result = {},
    affectedRows = 0,
    effect = () => {},
    timeoutAfterCommit = false,
    failBeforeCommit = false,
  }) {
    const existing = this.receipts.get(key)
    if (existing) {
      if (
        existing.cycle_id !== cycleId ||
        existing.parent_receipt_id !== parentReceiptId ||
        existing.action_kind !== action ||
        existing.request_hash !== requestHash ||
        existing.input_artifact_hash !== inputHash
      ) {
        throw new Error('FIXTURE_IDEMPOTENCY_CONTRADICTION')
      }
      return { ...clone(existing), reconciled: true }
    }
    if (!this.cycles.has(cycleId)) throw new Error('FIXTURE_CYCLE_MISSING')
    if (!HASH_PATTERN.test(requestHash) || (inputHash != null && !HASH_PATTERN.test(inputHash))) {
      throw new Error('FIXTURE_HASH_INVALID')
    }
    if (parentReceiptId) {
      const parent = this.receiptsById.get(parentReceiptId)
      if (!parent || parent.cycle_id !== cycleId || parent.status !== 'committed') {
        throw new Error('FIXTURE_PARENT_RECEIPT_INVALID')
      }
    }
    if (failBeforeCommit) throw new Error(`SIMULATED_${action.toUpperCase()}_FAILURE`)
    effect()
    this.increment(action)
    const receipt = {
      id: uuid(this.nextReceipt++),
      cycle_id: cycleId,
      parent_receipt_id: parentReceiptId,
      action_kind: action,
      idempotency_key: key,
      attempt: 1,
      request_hash: requestHash,
      input_artifact_hash: inputHash,
      status: 'committed',
      affected_rows: affectedRows,
      result: clone(result),
      error_code: null,
      started_at: '2026-07-29T21:30:00.000Z',
      finished_at: '2026-07-29T21:31:00.000Z',
    }
    this.receipts.set(key, receipt)
    this.receiptsById.set(receipt.id, receipt)
    if (timeoutAfterCommit) throw new Error('SIMULATED_TIMEOUT_AFTER_COMMIT')
    return { ...clone(receipt), reconciled: false }
  }

  createCycle(args, options = {}) {
    const matched = this.findCycles({
      local_cycle_id: args.p_local_cycle_id,
      run_token_sha256: args.p_run_token_sha256,
    })
    if (matched.length > 1) throw new Error('FIXTURE_CREATE_IDENTITY_SPLIT')
    let cycle = matched[0] || null
    if (cycle) {
      for (const [field, value] of Object.entries({
        local_cycle_id: args.p_local_cycle_id,
        run_token_sha256: args.p_run_token_sha256,
        code_revision: args.p_code_revision,
        filter_fingerprint: args.p_filter_fingerprint,
        manifest_hash: args.p_manifest_hash,
        mode: args.p_mode,
        region_code: args.p_region_code,
        storefront: args.p_storefront,
        cycle_date: args.p_cycle_date,
        started_at: args.p_started_at,
      })) {
        if (cycle[field] !== value) throw new Error('FIXTURE_CREATE_IDENTITY_CONTRADICTION')
      }
    } else {
      const cycleId = uuid(this.nextCycle++)
      cycle = {
        id: cycleId,
        local_cycle_id: args.p_local_cycle_id,
        run_token_sha256: args.p_run_token_sha256,
        code_revision: args.p_code_revision,
        filter_fingerprint: args.p_filter_fingerprint,
        manifest_hash: args.p_manifest_hash,
        mode: args.p_mode,
        region_code: args.p_region_code,
        storefront: args.p_storefront,
        cycle_date: args.p_cycle_date,
        started_at: args.p_started_at,
        status: 'running',
        listing_complete: false,
        items_seen: 0,
        ended_discounts_applied: 0,
      }
      this.cycles.set(cycleId, cycle)
    }
    const existed = matched.length === 1
    const receipt = this.committedReceipt({
      cycleId: cycle.id,
      action: 'create_cycle',
      key: args.p_idempotency_key,
      requestHash: args.p_request_hash,
      result: { cycle_id: cycle.id, reconciled_existing_cycle: existed },
      affectedRows: existed ? 0 : 1,
      effect: () => {},
      ...options,
    })
    return [{
      cycle_id: cycle.id,
      cycle_status: cycle.status,
      reconciled: existed || receipt.reconciled,
      receipt_id: receipt.id,
      receipt_status: receipt.status,
    }]
  }

  recordListing(cycleId, { key, requestHash, listingHash, itemsSeen = 3 }, options = {}) {
    const cycle = this.cycles.get(cycleId)
    return this.committedReceipt({
      cycleId,
      action: 'listing_validation',
      key,
      requestHash,
      inputHash: listingHash,
      affectedRows: itemsSeen,
      result: { complete: true, listing_artifact_hash: listingHash, items_seen: itemsSeen },
      effect: () => {
        cycle.listing_complete = true
        cycle.listing_completed_at = '2026-07-29T21:32:00.000Z'
        cycle.items_seen = itemsSeen
      },
      ...options,
    })
  }

  recordStage(cycleId, action, parentReceiptId, result, options = {}) {
    return this.committedReceipt({
      cycleId,
      parentReceiptId,
      action,
      key: options.key || `${action}:fixture:${cycleId}`,
      requestHash: options.requestHash || String((this.nextReceipt + action.length) % 10).repeat(64),
      inputHash: options.inputHash || 'a'.repeat(64),
      affectedRows: options.affectedRows ?? 0,
      result,
      effect: options.effect || (() => {}),
      timeoutAfterCommit: options.timeoutAfterCommit,
      failBeforeCommit: options.failBeforeCommit,
    })
  }

  recordMonthly(cycleId, options = {}) {
    const cycle = this.cycles.get(cycleId)
    return this.committedReceipt({
      cycleId,
      action: 'monthly_check_record',
      key: options.key || `monthly:fixture:${cycleId}`,
      requestHash: options.requestHash || '5'.repeat(64),
      inputHash: options.inputHash || 'b'.repeat(64),
      result: {
        result: options.result || 'no_changes',
        application_performed: false,
        proposed_changes_count: options.result === 'proposed_changes' ? 1 : 0,
      },
      effect: () => {
        if ((options.result || 'no_changes') === 'no_changes') {
          cycle.monthly_games_checked_at = '2026-07-29T21:36:00.000Z'
        }
      },
      timeoutAfterCommit: options.timeoutAfterCommit,
      failBeforeCommit: options.failBeforeCommit,
    })
  }

  demote(cycleId, parentReceiptId, candidateIds, options = {}) {
    const canonical = [...new Set(candidateIds)].sort((left, right) => left - right)
    if (canonical.length > 500) throw new Error('FIXTURE_DEMOTION_SET_TOO_LARGE')
    const candidateHash = hashPsdealsDemotionCandidateIds(canonical)
    const cycle = this.cycles.get(cycleId)
    return this.committedReceipt({
      cycleId,
      parentReceiptId,
      action: 'demotion_apply',
      key: options.key || `demotion:fixture:${cycleId}`,
      requestHash: options.requestHash || '6'.repeat(64),
      inputHash: candidateHash,
      affectedRows: canonical.length,
      result: { candidate_set_hash: candidateHash, candidate_count: canonical.length, affected_rows: canonical.length },
      effect: () => {
        if (!cycle.listing_complete) throw new Error('FIXTURE_DEMOTION_LISTING_INCOMPLETE')
        cycle.ended_discounts_completed_at = '2026-07-29T21:38:00.000Z'
        cycle.ended_discounts_applied = canonical.length
      },
      timeoutAfterCommit: options.timeoutAfterCommit,
      failBeforeCommit: options.failBeforeCommit,
    })
  }

  markSucceeded(cycleId, parentReceiptId, requiredReceiptIds, options = {}) {
    const cycle = this.cycles.get(cycleId)
    const required = requiredReceiptIds.map((id) => this.receiptsById.get(id))
    const kinds = new Set(required.filter(Boolean).map((value) => value.action_kind))
    const expected = [
      'listing_validation', 'listing_upsert_batch', 'fast_refresh_analysis',
      'detail_import', 'monthly_check_record', 'ended_deals_analysis', 'demotion_apply',
    ]
    if (required.some((value) => !value || value.cycle_id !== cycleId || value.status !== 'committed') ||
        expected.some((kind) => !kinds.has(kind)) ||
        !cycle.listing_complete || !cycle.monthly_games_checked_at || !cycle.ended_discounts_completed_at) {
      throw new Error('FIXTURE_MARK_SUCCEEDED_GATE_CLOSED')
    }
    return this.committedReceipt({
      cycleId,
      parentReceiptId,
      action: 'mark_succeeded',
      key: options.key || `mark:fixture:${cycleId}`,
      requestHash: options.requestHash || '7'.repeat(64),
      inputHash: cycle.manifest_hash,
      affectedRows: 1,
      result: { status: 'succeeded', required_receipt_count: required.length },
      effect: () => {
        cycle.status = 'succeeded'
        cycle.details_completed_at = '2026-07-29T21:37:00.000Z'
        cycle.validation_completed_at = '2026-07-29T21:39:00.000Z'
        cycle.validation_passed = true
        cycle.finished_at = '2026-07-29T21:40:00.000Z'
      },
      timeoutAfterCommit: options.timeoutAfterCommit,
      failBeforeCommit: options.failBeforeCommit,
    })
  }

  certify(cycleId, markReceiptId, options = {}) {
    const cycle = this.cycles.get(cycleId)
    return this.committedReceipt({
      cycleId,
      parentReceiptId: markReceiptId,
      action: 'certify',
      key: options.key || `certify:fixture:${cycleId}`,
      requestHash: options.requestHash || '8'.repeat(64),
      inputHash: cycle.manifest_hash,
      affectedRows: 2,
      result: { regular_initialized: 1, regular_lowered: 0, ps_plus_initialized: 1, ps_plus_lowered: 0 },
      effect: () => {
        if (cycle.status !== 'succeeded') throw new Error('FIXTURE_CERTIFY_PREMATURE')
        cycle.status = 'certified'
        cycle.certified_at = '2026-07-29T21:41:00.000Z'
      },
      timeoutAfterCommit: options.timeoutAfterCommit,
      failBeforeCommit: options.failBeforeCommit,
    })
  }

  refreshCache(cycleId, certifyReceiptId, options = {}) {
    const cycle = this.cycles.get(cycleId)
    return this.committedReceipt({
      cycleId,
      parentReceiptId: certifyReceiptId,
      action: 'cache_refresh',
      key: options.key || `cache:fixture:${cycleId}`,
      requestHash: options.requestHash || '9'.repeat(64),
      inputHash: cycle.manifest_hash,
      affectedRows: 32890,
      result: { inserted_rows: 32890, active_regular_deals: 5197, active_ps_plus_deals: 1605, expired_deals_still_marked_active: 0 },
      effect: () => {
        if (cycle.status !== 'certified') throw new Error('FIXTURE_CACHE_PREMATURE')
        cycle.cache_refreshed_at = '2026-07-29T21:42:00.000Z'
      },
      timeoutAfterCommit: options.timeoutAfterCommit,
      failBeforeCommit: options.failBeforeCommit,
    })
  }
}
