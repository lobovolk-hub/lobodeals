import { buildCollectedListingItem } from '../collect-psdeals-listing-edge-live-cdp.mjs'
import { selectEndedDiscountCandidatesFromListing } from '../analyze-psdeals-ended-discounts-from-listing-v1.mjs'
import {
  buildPsdealsPsPlusCertificationEvidence,
  buildPsdealsRegularCertificationEvidence,
} from './psdeals-certification-evidence.mjs'
import { applyPsdealsCertifiedPriceLow } from './psdeals-compact-minima.mjs'
import { classifyFastRefreshItem, selectFastRefreshQueues } from './psdeals-fast-refresh.mjs'

export const PSDEALS_UPDATER_DRY_RUN_VERSION = 1

const REMOTE_CYCLE_ID = '11111111-1111-4111-8111-111111111111'
const LOCAL_CYCLE_ID = 'local-cycle-dry-run-001'
const OBSERVED_AT = '2026-08-01T12:00:00.000Z'
const EVIDENCE_SHA256 = 'a'.repeat(64)
const INPUT_SHA256 = 'b'.repeat(64)

const TYPE_FIXTURES = Object.freeze([
  ['type-game', 'Full Game'],
  ['type-bundle', 'Bundle'],
  ['type-dlc', 'Add-On'],
  ['type-addon', 'Avatar'],
  ['type-season-pass', 'Season Pass'],
  ['type-game-content', 'Game Content'],
  ['type-ambiguous', 'Mystery Product'],
])

const PRICE_FIXTURES = Object.freeze([
  ['discount-1', '-1%', '$99.00', '$100.00'],
  ['discount-50', '-50%', '$50.00', '$100.00'],
  ['discount-99', '-99%', '$1.00', '$100.00'],
  ['discount-0', '0%', '$100.00', '$100.00'],
  ['discount-100', '-100%', '$0.00', '$100.00'],
  ['free', '-100%', 'FREE', '$20.00'],
  ['zero', null, '$0.00', null],
  ['negative', '-50%', '$-1.00', '$2.00'],
  ['original-missing', '-50%', '$5.00', null],
  ['current-missing', '-50%', null, '$10.00'],
  ['formula-mismatch', '-40%', '$5.00', '$10.00'],
  ['monthly', '-50%', '$5.00', '$10.00'],
  ['ambiguous-signal', 'SAVE', '$5.00', '$10.00'],
  ['no-discount', null, '$10.00', null],
])

function listingFixture({ id, name, type = 'Full Game', platform = 'PS5 / PS4', discount, current, original }) {
  return buildCollectedListingItem({
    href: `https://psdeals.net/us-store/game/${id}/${name}`,
    title: name,
    platformLabel: platform,
    typeLabel: type,
    discountText: discount,
    discountPriceText: current,
    regularPriceText: current,
    originalPriceText: original,
  }, 'https://psdeals.net/us-store/discounts')
}

function candidateContext() {
  return {
    remote_cycle_id: REMOTE_CYCLE_ID,
    observed_at: OBSERVED_AT,
    evidence_sha256: EVIDENCE_SHA256,
  }
}

function regularLowObservation(item, candidate) {
  return {
    local_cycle_id: LOCAL_CYCLE_ID,
    item_id: `item-${candidate.psdeals_id}`,
    psdeals_id: candidate.psdeals_id,
    region_code: 'us',
    storefront: 'playstation',
    currency_code: 'USD',
    price_kind: 'regular',
    price_amount: candidate.current_price_amount,
    observed_at: candidate.observed_at,
    producer: 'listing',
    commercial_state: item.commercial_state,
    is_free_to_play: false,
    type_classification_safe: true,
    platform_classification_safe: true,
    deal_active: true,
  }
}

function psPlusDetail({ id, plus = 4.99, current = 9.99, monthly = false, consistent = true }) {
  const base = listingFixture({
    id,
    name: `plus-${id}`,
    discount: '-50%',
    current: '$5.00',
    original: '$10.00',
  })
  return {
    psdeals_id: id,
    currency_code: 'USD',
    current_price_amount: current,
    is_ps_plus_discount: true,
    is_free_to_play: false,
    type_classification: base.type_classification,
    platform_classification: base.platform_classification,
    is_monthly_game: monthly,
    raw_detail_json: {
      current_ps_plus_price_amount: plus,
      ps_plus_evidence: {
        parser_status: consistent ? 'parsed_current_discount' : 'buy_box_unparseable',
        source_consistent: consistent,
      },
    },
  }
}

function simulateEndedDeals() {
  const activeListing = [{ psdeals_id: 7002 }]
  const previousRows = [
    { id: 7001, psdeals_id: 7001, psdeals_slug: 'ended-safe', psdeals_url: 'https://psdeals.net/us-store/game/7001/ended-safe', region_code: 'us', storefront: 'playstation', content_type: 'game', item_type_label: 'game', is_ps_plus_discount: false, title: 'Ended safe', current_price_amount: 5, original_price_amount: 10, discount_percent: 50, updated_at: '2026-07-01T00:00:00.000Z' },
    { id: 7002, psdeals_id: 7002, psdeals_slug: 'still-active', psdeals_url: 'https://psdeals.net/us-store/game/7002/still-active', region_code: 'us', storefront: 'playstation', content_type: 'game', item_type_label: 'game', is_ps_plus_discount: false, title: 'Still active', current_price_amount: 5, original_price_amount: 10, discount_percent: 50, updated_at: '2026-07-02T00:00:00.000Z' },
    { id: 7003, psdeals_id: 7003, psdeals_slug: 'ended-unverifiable', psdeals_url: 'https://psdeals.net/us-store/game/7003/ended-unverifiable', region_code: 'us', storefront: 'playstation', content_type: 'game', item_type_label: 'game', is_ps_plus_discount: false, title: 'Ended unverifiable', current_price_amount: null, original_price_amount: 10, discount_percent: 50, updated_at: '2026-07-03T00:00:00.000Z' },
  ]
  const selection = selectEndedDiscountCandidatesFromListing(activeListing, previousRows, {
    listing_complete: true,
    monthly_evidence_verified: true,
    monthly_item_ids: [],
    observed_at: OBSERVED_AT,
  })
  const decisions = [...selection.candidates, ...selection.blocked_candidates].map((row) => {
    const safe = typeof row.current_price_amount === 'number' && row.current_price_amount > 0 &&
      typeof row.original_price_amount === 'number' && row.original_price_amount > row.current_price_amount &&
      Number.isInteger(row.discount_percent) && row.discount_percent >= 1 && row.discount_percent <= 99
    return {
      psdeals_id: row.psdeals_id,
      decision: safe ? 'would_restore_original_price' : 'blocked_unverifiable',
      simulated_price: safe ? row.original_price_amount : row.current_price_amount,
    }
  })
  return {
    active_ids: selection.active_discount_ids,
    candidate_count: decisions.length,
    decisions,
    applied: false,
  }
}

export function runPsdealsUpdaterFailureSimulation() {
  const scenarios = [
    ['listing-empty', 'abort', 'listing_items_empty', 'evaluatePsdealsListingCompleteness'],
    ['pagination-incomplete', 'abort', 'listing_page_failed', 'evaluatePsdealsListingCompleteness'],
    ['response-truncated', 'abort', 'listing_partial_artifact_present', 'evaluatePsdealsListingCompleteness'],
    ['parser-partially-broken', 'isolate', 'detail_parser_state_unsafe', 'buildPsdealsPsPlusCertificationEvidence'],
    ['duplicate-identities', 'abort', 'listing_duplicate_ids_unresolved', 'evaluatePsdealsListingCompleteness'],
    ['missing-stable-identity', 'isolate', 'listing_identity_missing', 'buildPsdealsListingInsertPayload'],
    ['currency-not-usd', 'isolate', 'currency_out_of_scope', 'evaluatePsdealsCertifiedPriceLowObservation'],
    ['incoherent-price', 'isolate', 'regular_discount_percent_mismatch', 'normalizePsdealsCommercialState'],
    ['ps-plus-ambiguous', 'isolate', 'ps_plus_parser_state_unsafe', 'buildPsdealsPsPlusCertificationEvidence'],
    ['classification-changed', 'isolate', 'certification_type_classification_unsafe', 'buildPsdealsRegularCertificationEvidence'],
    ['receipt-missing', 'abort', 'required_receipt_missing', 'validatePsdealsCycleManifest'],
    ['cycle-missing', 'abort', 'remote_cycle_id_missing_or_invalid', 'buildPsdealsCriticalActionRequest'],
    ['cycle-already-finalized', 'reconcile', 'cycle_terminal_state_requires_reconciliation', 'executeReconciledPsdealsLifecycleAction'],
    ['candidate-other-cycle', 'isolate', 'candidate_cycle_mismatch', 'certify_price_refresh_cycle_v3'],
    ['candidate-other-family', 'isolate', 'candidate_price_kind_mismatch', 'evaluatePsdealsCertifiedPriceLowObservation'],
    ['first-seen-incoherent', 'abort', 'previous_certified_price_low_invalid', 'applyPsdealsCertifiedPriceLow'],
    ['cache-stale', 'abort', 'public_validation_failed', 'buildPsdealsPublicValidationPlan'],
    ['transport-timeout', 'reconcile', 'ambiguous_transport_reconcile_before_retry', 'executeReconciledPsdealsLifecycleAction'],
    ['bounded-retry', 'retry_once', 'pending_detail_failures_retry_once', 'buildDetailRetryEvidence'],
    ['same-input-twice', 'noop', 'certified_low_equal', 'applyPsdealsCertifiedPriceLow'],
  ].map(([id, disposition, reason_code, contract]) => ({
    id,
    disposition,
    reason_code,
    contract,
    remote_writes_executed: 0,
  }))
  return {
    simulation_version: 1,
    scenarios,
    scenario_count: scenarios.length,
    all_fail_closed: scenarios.every((entry) =>
      ['abort', 'isolate', 'reconcile', 'retry_once', 'noop'].includes(entry.disposition)
    ),
    retry_policy: {
      maximum_detail_retries: 1,
      ambiguous_writes_retried_without_reconciliation: false,
    },
    idempotency: {
      repeated_input_effect: 'noop',
      duplicate_remote_effects: 0,
    },
    remote_writes_executed: 0,
    opens_connections: false,
  }
}

export function runPsdealsUpdaterDryRun() {
  const typeResults = TYPE_FIXTURES.map(([name, type], index) => {
    const item = listingFixture({
      id: 1000 + index,
      name,
      type,
      discount: '-50%',
      current: '$5.00',
      original: '$10.00',
    })
    return {
      fixture: name,
      raw_type: type,
      content_type: item.type_classification.content_type,
      item_type_label: item.type_classification.item_type_label,
      writable: item.type_classification.can_write,
      reasons: item.type_classification.reasons,
    }
  })

  const priceItems = PRICE_FIXTURES.map(([name, discount, current, original], index) => ({
    name,
    monthly: name === 'monthly',
    item: listingFixture({ id: 2000 + index, name, discount, current, original }),
  }))
  const regularResults = priceItems.map(({ name, monthly, item }) => {
    const evidence = monthly
      ? { eligible: false, reason_codes: ['monthly_game_excluded'], candidate: null }
      : buildPsdealsRegularCertificationEvidence(item, candidateContext())
    return {
      fixture: name,
      classification: item.commercial_state.classification,
      accepted: evidence.eligible,
      reason_codes: evidence.eligible ? [] : evidence.reason_codes,
      candidate: evidence.candidate,
    }
  })

  const acceptedByName = Object.fromEntries(
    regularResults.filter((entry) => entry.accepted).map((entry) => [entry.fixture, entry])
  )
  const minimaScenarios = [
    ['discount-1-new', 'discount-1', null],
    ['discount-50-lower', 'discount-50', { amount: 60, observed_at: '2026-07-01T00:00:00.000Z' }],
    ['discount-50-equal', 'discount-50', { amount: 50, observed_at: '2026-07-01T00:00:00.000Z' }],
    ['discount-99-higher', 'discount-99', { amount: 0.5, observed_at: '2026-07-01T00:00:00.000Z' }],
  ]
  const minima = minimaScenarios.map(([scenario, fixture, previous]) => {
      const entry = acceptedByName[fixture]
      const source = priceItems.find(({ name }) => name === fixture).item
      const result = applyPsdealsCertifiedPriceLow(
        previous,
        regularLowObservation(source, entry.candidate)
      )
      return {
        scenario,
        fixture,
        previous,
        changed: result.changed,
        reason_code: result.reason_code,
        value: result.value,
      }
    })

  const plusFixtures = [
    ['ps-plus-valid', psPlusDetail({ id: 3001 })],
    ['ps-plus-ambiguous', psPlusDetail({ id: 3002, consistent: false })],
    ['ps-plus-monthly', psPlusDetail({ id: 3003, monthly: true })],
  ]
  const psPlusResults = plusFixtures.map(([name, detail]) => {
    const evidence = buildPsdealsPsPlusCertificationEvidence(detail, {
      ...candidateContext(),
      input_artifact_sha256: INPUT_SHA256,
    })
    const monthlyBlocked = detail.is_monthly_game === true
    return {
      fixture: name,
      accepted: evidence.eligible && !monthlyBlocked,
      reason_codes: monthlyBlocked
        ? ['monthly_game_excluded']
        : evidence.reason_codes,
      candidate: evidence.eligible && !monthlyBlocked ? evidence.candidate : null,
    }
  })

  const queueItems = [
    { listing: priceItems[1].item, db: null },
    { listing: priceItems[0].item, db: { current_price_amount: 99, original_price_amount: 100, discount_percent: 1, detail_last_synced_at: OBSERVED_AT, is_ps_plus_discount: false } },
    { listing: priceItems[2].item, db: { current_price_amount: 2, original_price_amount: 100, discount_percent: 98, detail_last_synced_at: '2026-07-01T00:00:00.000Z', is_ps_plus_discount: false } },
    { listing: priceItems[0].item, db: { current_price_amount: 50, original_price_amount: 100, discount_percent: 50, detail_last_synced_at: '2026-07-01T00:00:00.000Z', is_ps_plus_discount: false } },
  ].map(({ listing, db }, index) => ({ scenario: ['new', 'same', 'lower', 'higher'][index], listing, db, ...classifyFastRefreshItem(listing, db) }))
  const queues = selectFastRefreshQueues(queueItems, {
    staleLimit: 1,
    psPlusRecheckLimit: 1,
    staleHours: 24,
    nowMs: Date.parse(OBSERVED_AT),
  })

  const acceptedRegular = regularResults.filter((entry) => entry.accepted)
  const acceptedPlus = psPlusResults.filter((entry) => entry.accepted)
  const rejectionCounts = {}
  for (const entry of [...regularResults, ...psPlusResults].filter((value) => !value.accepted)) {
    for (const reason of entry.reason_codes) rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1
  }

  return {
    dry_run_version: PSDEALS_UPDATER_DRY_RUN_VERSION,
    mode: 'OFFLINE_DETERMINISTIC_DRY_RUN',
    observed_at: OBSERVED_AT,
    type_fixtures: typeResults,
    price_fixtures: regularResults,
    ps_plus_fixtures: psPlusResults,
    summary: {
      fixtures_processed: typeResults.length + regularResults.length + psPlusResults.length,
      accepted_candidates: acceptedRegular.length + acceptedPlus.length,
      rejected_candidates: regularResults.length + psPlusResults.length - acceptedRegular.length - acceptedPlus.length,
      rejection_reason_counts: Object.fromEntries(Object.entries(rejectionCounts).sort()),
    },
    candidates: {
      regular: acceptedRegular.map((entry) => entry.candidate),
      ps_plus: acceptedPlus.map((entry) => entry.candidate),
    },
    minima,
    fast_refresh: {
      must_refresh: queues.mustRefresh.length,
      ps_plus_recheck: queues.psPlusRecheckCandidates.length,
      stale: queues.staleCandidates.length,
      combined: queues.combined.length,
      overlaps: 0,
      decisions: queueItems.map((row) => ({
        scenario: row.scenario,
        should_refresh: row.shouldRefresh,
        reasons: row.reasons,
      })),
    },
    ended_discounts: simulateEndedDeals(),
    cache: { simulated_changes: acceptedRegular.length + acceptedPlus.length, applied: false },
    monthly: { simulated_changes: 0, applied: false },
    failure_simulation: runPsdealsUpdaterFailureSimulation(),
    remote_writes_executed: 0,
    opens_connections: false,
    executes_processes: false,
  }
}
