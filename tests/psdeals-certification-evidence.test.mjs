import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCollectedListingItem } from '../scripts/collect-psdeals-listing-edge-live-cdp.mjs'
import { parsePage } from '../scripts/import-psdeals-detail-local.mjs'
import {
  buildPsdealsPsPlusCertificationEvidence,
  buildPsdealsRegularCertificationEvidence,
  hashPsdealsCertificationCandidate,
  PSDEALS_CERTIFICATION_CANDIDATE_MAX_BYTES,
} from '../scripts/lib/psdeals-certification-evidence.mjs'
import {
  buildPsdealsDetailUpsertPayload,
  buildPsdealsListingUpdatePayload,
} from '../scripts/lib/psdeals-stage-payload.mjs'

const CYCLE = '11111111-1111-4111-8111-111111111111'
const OTHER_CYCLE = '22222222-2222-4222-8222-222222222222'
const HASH = 'a'.repeat(64)
const INPUT_HASH = 'b'.repeat(64)
const OBSERVED = '2026-07-30T12:00:00.000Z'

function listing(overrides = {}) {
  return buildCollectedListingItem(
    {
      href: 'https://psdeals.net/us-store/game/123/example',
      title: 'Example',
      platformLabel: 'PS5 / PS4',
      typeLabel: 'Full Game',
      discountText: '-50%',
      discountPriceText: '$4.99',
      regularPriceText: '$4.99',
      originalPriceText: '$9.99',
      ...overrides,
    },
    'https://psdeals.net/us-store/discounts'
  )
}

function detailHtml({
  platform = 'PS5',
  type = 'game',
  current = '$9.99',
  plus = '$4.99',
  chart = '$4.99',
  chartRaw = null,
  includePlusMarker = true,
} = {}) {
  const chartEntries = chartRaw ?? JSON.stringify(
    chart === null ? [] : [{ date: '2026-07-30', price: chart }]
  )
  return `
    <html><head><script>
      var item_id=123;var item_type="${type}";var item_currency="$";
      var chart_bonus_prices="${chartEntries.replace(/"/g, '\\"')}";var chart_bonus_active=true;var next_marker=true;
    </script></head><body>
      <div itemprop="name" class="game-title-info-name">Example</div>
      <span class="game-cover-top-platform">${platform}</span>
      <div class="game-buy-button-right">
        <span class="game-buy-button-price">${current}</span>
        ${includePlusMarker
          ? `<span class="game-buy-button-price-bonus">${plus}</span>`
          : ''}
      </div>
    </body></html>
  `
}

function parsedDetail(options = {}) {
  return parsePage(
    detailHtml(options),
    'https://psdeals.net/us-store/game/123/example',
    { observedAt: OBSERVED }
  )
}

function regularEvidence(source = listing(), context = {}) {
  return buildPsdealsRegularCertificationEvidence(source, {
    remote_cycle_id: CYCLE,
    observed_at: OBSERVED,
    evidence_sha256: HASH,
    ...context,
  })
}

function plusEvidence(source = parsedDetail(), context = {}) {
  return buildPsdealsPsPlusCertificationEvidence(source, {
    remote_cycle_id: CYCLE,
    observed_at: OBSERVED,
    evidence_sha256: HASH,
    input_artifact_sha256: INPUT_HASH,
    ...context,
  })
}

test('builds one complete regular tuple tied to a cycle and artifact', () => {
  const result = regularEvidence()
  assert.equal(result.eligible, true)
  assert.equal(result.candidate.cycle_id, CYCLE)
  assert.equal(result.candidate.evidence_sha256, HASH)
  assert.equal(result.candidate.current_price_amount, 4.99)
  assert.equal(result.candidate.original_price_amount, 9.99)
  assert.equal(result.candidate.discount_percent, 50)
  assert.deepEqual(result.candidate.platforms, ['PS5', 'PS4'])
  assert.equal(
    result.candidate.candidate_sha256,
    hashPsdealsCertificationCandidate(result.candidate)
  )
  assert.ok(
    Buffer.byteLength(JSON.stringify(result.candidate), 'utf8') <=
      PSDEALS_CERTIFICATION_CANDIDATE_MAX_BYTES
  )
})

test('a new timestamp without a valid commercial tuple writes no candidate', () => {
  const result = regularEvidence(listing({
    discountPriceText: null,
    regularPriceText: null,
  }))
  assert.equal(result.eligible, false)
  assert.deepEqual(result.columns, {})
})

test('a new price with an unsafe old classification writes no candidate', () => {
  const result = regularEvidence(listing({ typeLabel: 'Mystery Content' }))
  assert.equal(result.eligible, false)
  assert.ok(result.reason_codes.includes(
    'certification_type_classification_unsafe'
  ))
})

test('a new classification with an incoherent old price writes no candidate', () => {
  const result = regularEvidence(listing({
    discountText: '-50%',
    discountPriceText: '$8.00',
    originalPriceText: '$10.00',
  }))
  assert.equal(result.eligible, false)
})

test('regular evidence preserves an explicit cycle and rejects malformed identity', () => {
  assert.equal(regularEvidence(listing(), {
    remote_cycle_id: OTHER_CYCLE,
  }).candidate.cycle_id, OTHER_CYCLE)
  const malformed = regularEvidence(listing(), {
    remote_cycle_id: 'local-cycle-not-remote',
  })
  assert.equal(malformed.eligible, false)
})

test('regular evidence rejects a malformed artifact hash', () => {
  const result = regularEvidence(listing(), { evidence_sha256: 'abc' })
  assert.equal(result.eligible, false)
  assert.ok(result.reason_codes.includes(
    'certification_evidence_sha256_invalid'
  ))
})

test('regular evidence requires exact rounded percentage coherence', () => {
  assert.equal(regularEvidence().eligible, true)
  assert.equal(regularEvidence(listing({
    discountText: '-49%',
  })).eligible, false)
})

test('regular evidence accepts coherent discounts from 1 through 99 percent', () => {
  for (const percent of [1, 50, 95, 96, 97, 98, 99]) {
    const current = 100 - percent
    const result = regularEvidence(listing({
      discountText: `-${percent}%`,
      discountPriceText: `$${current.toFixed(2)}`,
      regularPriceText: `$${current.toFixed(2)}`,
      originalPriceText: '$100.00',
    }))
    assert.equal(result.eligible, true, `${percent}%`)
    assert.equal(result.candidate.discount_percent, percent)
  }
})

test('regular evidence excludes a coherent one hundred percent signal', () => {
  const result = regularEvidence(listing({
    discountText: '-100%',
    discountPriceText: '$0.00',
    regularPriceText: '$0.00',
    originalPriceText: '$100.00',
  }))
  assert.equal(result.eligible, false)
})

test('minus one hundred, zero and FREE never create regular candidates', () => {
  for (const source of [
    listing({
      discountText: '-100%',
      discountPriceText: '$0.49',
      originalPriceText: '$945.00',
    }),
    listing({
      discountText: '-100%',
      discountPriceText: '$0.00',
      originalPriceText: '$10.00',
    }),
    listing({
      discountText: '-100%',
      discountPriceText: 'FREE',
      originalPriceText: '$10.00',
    }),
  ]) {
    assert.equal(regularEvidence(source).eligible, false)
  }
})

test('free-to-play cannot be claimed by a regular candidate', () => {
  const source = listing()
  source.commercial_state.is_certified_regular_discount_eligible = false
  source.commercial_state.classification = 'free_to_play'
  assert.equal(regularEvidence(source).eligible, false)
})

test('only target-only PS4 and PS5 classifications are certifiable', () => {
  assert.equal(regularEvidence(listing({ platformLabel: 'PS4' })).eligible, true)
  assert.equal(regularEvidence(listing({ platformLabel: 'PS5' })).eligible, true)
  assert.equal(regularEvidence(listing({
    platformLabel: 'PS5 / PS3',
  })).eligible, false)
  assert.equal(regularEvidence(listing({
    platformLabel: 'Unknown',
  })).eligible, false)
  assert.equal(regularEvidence(listing({
    platformLabel: 'PS5 / PS4 / PS5',
  })).eligible, false)
})

test('games, bundles and safely classified public add-ons are certifiable', () => {
  assert.equal(regularEvidence(listing({ typeLabel: 'Full Game' })).eligible, true)
  assert.equal(regularEvidence(listing({ typeLabel: 'Bundle' })).eligible, true)
  for (const typeLabel of [
    'Add-On',
    'Season Pass',
    'Avatar',
    'Costume',
    'Character',
    'Vehicle',
    'Weapons',
    'Soundtrack',
    'Theme',
    'Map',
    'Item',
  ]) {
    assert.equal(regularEvidence(listing({ typeLabel })).eligible, true, typeLabel)
  }
})

test('contradictory or non-contemporary type evidence is excluded', () => {
  const contradictory = listing()
  contradictory.type_classification = {
    ...contradictory.type_classification,
    content_type: 'game',
    item_type_label: 'addon',
  }
  assert.equal(regularEvidence(contradictory).eligible, false)

  const stale = listing({ typeLabel: 'Unknown' })
  stale.type_classification.can_write = false
  stale.type_classification.can_replace_existing = false
  assert.equal(regularEvidence(stale).eligible, false)
})

test('canonical platform order produces the same candidate hash', () => {
  const ps5First = regularEvidence(listing({
    platformLabel: 'PS5 / PS4',
  }))
  const ps4First = regularEvidence(listing({
    platformLabel: 'PS4 / PS5',
  }))
  assert.deepEqual(ps5First.candidate.platforms, ['PS5', 'PS4'])
  assert.deepEqual(ps4First.candidate.platforms, ['PS5', 'PS4'])
  assert.equal(
    ps5First.candidate.candidate_sha256,
    ps4First.candidate.candidate_sha256
  )
})

test('demo and ambiguous type proposals are excluded', () => {
  assert.equal(regularEvidence(listing({ typeLabel: 'Demo' })).eligible, false)
  assert.equal(regularEvidence(listing({ typeLabel: 'Catalog' })).eligible, false)
})

test('listing payload preserves public fields while omitting unsafe evidence', () => {
  const source = listing({
    typeLabel: 'Unknown',
    discountText: '-50%',
    discountPriceText: '$4.99',
    originalPriceText: '$9.99',
  })
  const built = buildPsdealsListingUpdatePayload(source, {
    listingObservedAt: OBSERVED,
    certificationContext: {
      remote_cycle_id: CYCLE,
      evidence_sha256: HASH,
    },
  })
  assert.equal(built.payload.listing_last_seen_at, OBSERVED)
  assert.equal(built.payload.current_price_amount, 4.99)
  assert.equal('regular_certification_candidate' in built.payload, false)
})

test('listing payload adds evidence only when the full tuple is safe', () => {
  const built = buildPsdealsListingUpdatePayload(listing(), {
    listingObservedAt: OBSERVED,
    certificationContext: {
      remote_cycle_id: CYCLE,
      evidence_sha256: HASH,
    },
  })
  assert.equal(built.payload.regular_certification_cycle_id, CYCLE)
  assert.equal(
    built.payload.regular_certification_candidate.current_price_amount,
    4.99
  )
})

test('PS Plus parser records a current coherent buy-box observation', () => {
  const parsed = parsedDetail()
  assert.equal(
    parsed.raw_detail_json.ps_plus_evidence.parser_status,
    'parsed_current_discount'
  )
  assert.equal(
    parsed.raw_detail_json.ps_plus_evidence.source_consistent,
    true
  )
  assert.equal(plusEvidence(parsed).eligible, true)
})

test('PS Plus certification preserves a safely classified add-on product', () => {
  const parsed = parsedDetail({ type: 'addon' })
  const result = plusEvidence(parsed)
  assert.equal(result.eligible, true)
  assert.equal(result.candidate.content_type, 'dlc')
  assert.equal(result.candidate.item_type_label, 'addon')
})

test('PS Plus from another cycle or artifact cannot inherit identity', () => {
  assert.equal(plusEvidence(parsedDetail(), {
    remote_cycle_id: 'bad',
  }).eligible, false)
  assert.equal(plusEvidence(parsedDetail(), {
    evidence_sha256: 'bad',
  }).eligible, false)
  assert.equal(plusEvidence(parsedDetail(), {
    input_artifact_sha256: 'bad',
  }).eligible, false)
})

test('PS Plus seals the parsed tuple and links its exact input queue', () => {
  const result = plusEvidence()
  assert.equal(result.eligible, true)
  assert.equal(result.candidate.input_artifact_sha256, INPUT_HASH)
  assert.equal(
    result.candidate.candidate_sha256,
    hashPsdealsCertificationCandidate(result.candidate)
  )
  assert.ok(
    Buffer.byteLength(JSON.stringify(result.candidate), 'utf8') <=
      PSDEALS_CERTIFICATION_CANDIDATE_MAX_BYTES
  )
})

test('PS Plus preserved without a current parser observation is excluded', () => {
  const parsed = parsedDetail({ includePlusMarker: false })
  parsed.is_ps_plus_discount = true
  parsed.raw_detail_json.current_ps_plus_price_amount = 4.99
  assert.equal(plusEvidence(parsed).eligible, false)
})

test('an unparseable PS Plus marker remains explicitly unsafe', () => {
  const parsed = parsedDetail({ plus: 'unexpected' })
  assert.equal(
    parsed.raw_detail_json.ps_plus_evidence.parser_status,
    'buy_box_unparseable'
  )
  assert.equal(plusEvidence(parsed).eligible, false)
})

test('a PS Plus source discrepancy is excluded', () => {
  const parsed = parsedDetail({ chart: '$3.99' })
  assert.equal(
    parsed.raw_detail_json.ps_plus_evidence.source_consistent,
    false
  )
  assert.equal(plusEvidence(parsed).eligible, false)
})

test('invalid chart JSON is observable without restoring chart precedence', () => {
  const parsed = parsedDetail({ chartRaw: '{not-json}' })
  assert.equal(
    parsed.raw_detail_json.ps_plus_evidence.chart_parser_status,
    'invalid'
  )
  assert.equal(parsed.raw_detail_json.current_ps_plus_price_amount, 4.99)
})

test('PS Plus must be positive and below current regular price', () => {
  assert.equal(plusEvidence(parsedDetail({ plus: '$0.00' })).eligible, false)
  assert.equal(plusEvidence(parsedDetail({ plus: '$9.99' })).eligible, false)
})

test('PS Plus rejects legacy platform and ambiguous type evidence', () => {
  assert.equal(plusEvidence(parsedDetail({
    platform: 'PS5 / PS Vita',
  })).eligible, false)
  assert.equal(plusEvidence(parsedDetail({
    type: 'unknown',
  })).eligible, false)
})

test('detail payload writes a safe candidate without writing compact lows', () => {
  const built = buildPsdealsDetailUpsertPayload(parsedDetail(), {
    isExisting: true,
    certificationContext: {
      remote_cycle_id: CYCLE,
      evidence_sha256: HASH,
      input_artifact_sha256: INPUT_HASH,
    },
  })
  assert.equal(built.payload.ps_plus_certification_cycle_id, CYCLE)
  assert.equal(
    built.payload.ps_plus_certification_candidate.ps_plus_price_amount,
    4.99
  )
  assert.equal(
    'lobodeals_lowest_ps_plus_price_amount' in built.payload,
    false
  )
})

test('detail timestamp and raw parser evidence come from one parse instant', () => {
  const parsed = parsedDetail()
  assert.equal(parsed.detail_last_synced_at, OBSERVED)
  assert.equal(parsed.raw_detail_json.imported_at, OBSERVED)
})
