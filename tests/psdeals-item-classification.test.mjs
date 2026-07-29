import test from 'node:test'
import assert from 'node:assert/strict'

import { summarizePsdealsListingSnapshot } from '../scripts/audit-psdeals-listing-classification-local.mjs'
import { buildCollectedListingItem } from '../scripts/collect-psdeals-listing-edge-live-cdp.mjs'
import { parsePage } from '../scripts/import-psdeals-detail-local.mjs'
import {
  classifyPsdealsItemType,
  normalizePsdealsPlatforms,
} from '../scripts/lib/psdeals-item-classification.mjs'
import { classifyFastRefreshItem } from '../scripts/lib/psdeals-fast-refresh.mjs'
import { buildPsdealsDetailUpsertPayload } from '../scripts/lib/psdeals-stage-payload.mjs'

const GAME_LABELS = ['Full Game', 'VR Game', 'PSN Game', 'Game Content']
const ADDON_LABELS = [
  'Add-On',
  'Avatar',
  'Avatars',
  'Costume',
  'Character',
  'Level',
  'Map',
  'Item',
  'Vehicle',
  'Weapons',
  'Season Pass',
  'Dynamic Theme',
  'Static Theme',
  'Theme',
  'Soundtrack',
  'Music Track',
  'VR Add-On',
  'Extra Episode',
]

function detailHtml({ type = 'game', platform = 'PS5' } = {}) {
  return `
    <html><head><script>
      var item_id=12345;var item_type="${type}";var item_currency="$";
      var chart_bonus_prices="[]";var chart_bonus_active=false;var next_marker=true;
    </script></head><body>
      <div itemprop="name" class="game-title-info-name">Classification Fixture</div>
      <span class="game-cover-top-platform">${platform}</span>
      <div class="game-buy-button-right"><p><span class="game-buy-button-price">$9.99</span></p></div>
    </body></html>
  `
}

test('maps every observed game listing label explicitly', () => {
  for (const label of GAME_LABELS) {
    const result = classifyPsdealsItemType(label, { sourceContext: 'listing' })
    assert.equal(result.content_type, 'game', label)
    assert.equal(result.item_type_label, 'game', label)
    assert.equal(result.can_write, true, label)
    assert.equal(result.can_replace_existing, true, label)
  }
})

test('maps Bundle and Demo without a generic fallback', () => {
  const bundle = classifyPsdealsItemType('Bundle', { sourceContext: 'listing' })
  const demo = classifyPsdealsItemType('Demo', { sourceContext: 'listing' })

  assert.deepEqual(
    [bundle.content_type, bundle.item_type_label],
    ['bundle', 'bundle']
  )
  assert.deepEqual([demo.content_type, demo.item_type_label], ['demo', 'demo'])
})

test('maps every demonstrated add-on subtype to the existing public DLC bucket', () => {
  for (const label of ADDON_LABELS) {
    const result = classifyPsdealsItemType(label, { sourceContext: 'listing' })
    assert.equal(result.content_type, 'dlc', label)
    assert.equal(result.item_type_label, 'addon', label)
    assert.equal(result.can_write, true, label)
  }
})

test('marks limited-sample add-on labels for detail without allowing replacement', () => {
  for (const label of ['Catalog', 'Combo', 'Subscription']) {
    const result = classifyPsdealsItemType(label, { sourceContext: 'listing' })
    assert.equal(result.content_type, 'dlc', label)
    assert.equal(result.confidence, 'medium', label)
    assert.equal(result.requires_detail_revalidation, true, label)
    assert.equal(result.can_replace_existing, false, label)
  }
})

test('normalizes whitespace and case only for exact known type labels', () => {
  const result = classifyPsdealsItemType('  fUlL   GaMe  ', {
    sourceContext: 'listing',
  })

  assert.equal(result.normalized_label, 'full game')
  assert.equal(result.content_type, 'game')
})

test('does not turn missing, unknown, or partially similar labels into DLC', () => {
  for (const label of [null, '', '   ', 'Unknown Thing', 'Full Gamer', 'Add-On-ish']) {
    const result = classifyPsdealsItemType(label, { sourceContext: 'listing' })
    assert.equal(result.content_type, null, String(label))
    assert.equal(result.can_write, false, String(label))
    assert.equal(result.can_replace_existing, false, String(label))
    assert.equal(result.requires_detail_revalidation, true, String(label))
  }
})

test('uses the same canonical output for equivalent listing and detail signals', () => {
  const cases = [
    ['Full Game', 'game'],
    ['Bundle', 'bundle'],
    ['Add-On', 'addon'],
  ]

  for (const [listingLabel, detailLabel] of cases) {
    const listing = classifyPsdealsItemType(listingLabel, {
      sourceContext: 'listing',
    })
    const detail = classifyPsdealsItemType(detailLabel, {
      sourceContext: 'detail',
    })

    assert.equal(listing.content_type, detail.content_type, listingLabel)
    assert.equal(listing.item_type_label, detail.item_type_label, listingLabel)
  }
})

test('does not let the lossy detail game signal replace a richer listing type', () => {
  const detail = classifyPsdealsItemType('game', { sourceContext: 'detail' })

  assert.equal(detail.can_write, true)
  assert.equal(detail.can_replace_existing, false)
  assert.ok(detail.reason_codes.includes('detail_game_signal_is_lossy'))
})

test('normalizes PS4 and PS5 with canonical PS5-first ordering', () => {
  const cases = [
    ['PS4', ['PS4']],
    ['PS5', ['PS5']],
    ['PS5 / PS4', ['PS5', 'PS4']],
    ['PS4 / PS5', ['PS5', 'PS4']],
    [['PS4', 'PS5'], ['PS5', 'PS4']],
    [[' ps4 ', 'PS5', 'PS4'], ['PS5', 'PS4']],
  ]

  for (const [signal, expected] of cases) {
    const result = normalizePsdealsPlatforms(signal, { sourceContext: 'listing' })
    assert.deepEqual(result.target_platforms, expected, JSON.stringify(signal))
    assert.equal(result.classification, 'target_only', JSON.stringify(signal))
    assert.equal(result.can_replace_existing, true, JSON.stringify(signal))
  }
})

test('preserves legacy platform evidence without expanding the public scope', () => {
  for (const signal of ['PS3', 'PS Vita']) {
    const result = normalizePsdealsPlatforms(signal, { sourceContext: 'listing' })
    assert.deepEqual(result.target_platforms, [], signal)
    assert.equal(result.classification, 'legacy_only', signal)
    assert.equal(result.can_write, false, signal)
  }

  for (const signal of [
    'PS4 / PS3',
    'PS5 / PS Vita',
    'PS5 / PS4 / PS3 / PS Vita',
  ]) {
    const result = normalizePsdealsPlatforms(signal, { sourceContext: 'listing' })
    assert.equal(result.classification, 'target_with_legacy', signal)
    assert.equal(result.can_write, true, signal)
    assert.equal(result.can_replace_existing, false, signal)
    assert.equal(result.requires_detail_revalidation, true, signal)
    assert.ok(result.legacy_platforms.length > 0, signal)
  }
})

test('does not write missing, malformed, or unknown platform signals', () => {
  for (const signal of [null, '', '   ', 'Xbox', 'PS4-ish', 'PS5 / Mystery']) {
    const result = normalizePsdealsPlatforms(signal, { sourceContext: 'listing' })
    assert.equal(result.can_write, false, String(signal))
    assert.equal(result.can_replace_existing, false, String(signal))
    assert.equal(result.requires_detail_revalidation, true, String(signal))
  }
})

test('collector preserves raw labels and attaches both classifications', () => {
  const item = buildCollectedListingItem(
    {
      href: 'https://psdeals.net/us-store/game/123/example',
      title: 'Example',
      platformLabel: 'PS5 / PS4 / PS Vita',
      typeLabel: 'Season Pass',
      discountText: '-50%',
      discountPriceText: '$4.99',
      regularPriceText: '$4.99',
      originalPriceText: '$9.99',
      imageUrl: null,
    },
    'https://psdeals.net/us-store/discounts'
  )

  assert.equal(item.type_label, 'Season Pass')
  assert.equal(item.platform_label, 'PS5 / PS4 / PS Vita')
  assert.equal(item.type_classification.source_label, 'Season Pass')
  assert.deepEqual(item.platform_classification.legacy_platforms, ['PS Vita'])
})

test('importer uses shared classifications while detail preserves listing ownership', () => {
  const parsedGame = parsePage(
    detailHtml({ type: 'game', platform: 'PS5 / PS4 / PS Vita' }),
    'https://psdeals.net/us-store/game/12345/classification-fixture'
  )
  const parsedAddon = parsePage(
    detailHtml({ type: 'addon', platform: 'PS5 / PS4' }),
    'https://psdeals.net/us-store/game/12345/classification-fixture'
  )

  assert.equal(parsedGame.raw_detail_json.type_classification.source_label, 'game')
  const existingGame = buildPsdealsDetailUpsertPayload(parsedGame, {
    isExisting: true,
  }).payload
  const newGame = buildPsdealsDetailUpsertPayload(parsedGame, {
    isExisting: false,
  }).payload
  const existingAddon = buildPsdealsDetailUpsertPayload(parsedAddon, {
    isExisting: true,
  }).payload

  for (const payload of [existingGame, existingAddon]) {
    assert.equal('content_type' in payload, false)
    assert.equal('item_type_label' in payload, false)
    assert.equal('platforms' in payload, false)
  }
  assert.equal(newGame.content_type, 'game')
  assert.equal(newGame.item_type_label, 'game')
  assert.deepEqual(newGame.platforms, ['PS5', 'PS4'])
})

test('local snapshot summary preserves unknowns and legacy evidence as metrics', () => {
  const summary = summarizePsdealsListingSnapshot({
    items: [
      {
        psdeals_id: 1,
        type_label: 'Full Game',
        platform_label: 'PS5 / PS4',
      },
      {
        psdeals_id: 2,
        type_label: 'Unknown Thing',
        platform_label: 'PS4 / PS Vita',
      },
    ],
  })

  assert.equal(summary.types.normalized_distribution.game, 1)
  assert.equal(summary.types.normalized_distribution['<omitted>'], 1)
  assert.equal(summary.platforms.ambiguous_rows, 1)
  assert.equal(summary.platforms.normalized_distribution['PS4'], 1)
  assert.equal(summary.fast_refresh_queue_integration, 'none_metrics_only')
})

test('an unknown type does not create an unlimited mandatory price refresh reason', () => {
  const classification = classifyFastRefreshItem(
    {
      psdeals_id: 1,
      current_price_amount: 4.99,
      original_price_amount: 9.99,
      discount_percent: -50,
      type_classification: classifyPsdealsItemType('Unknown Thing', {
        sourceContext: 'listing',
      }),
    },
    {
      current_price_amount: 4.99,
      original_price_amount: 9.99,
      discount_percent: 50,
      detail_last_synced_at: '2026-07-28T00:00:00Z',
      is_ps_plus_discount: false,
    }
  )

  assert.equal(classification.shouldRefresh, false)
  assert.deepEqual(classification.reasons, [])
})
