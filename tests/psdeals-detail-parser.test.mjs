import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCommercialUpsertPayload,
  parsePage,
} from '../scripts/import-psdeals-detail-local.mjs'

function chartLiteral(entries) {
  return JSON.stringify(entries).replaceAll('"', '\\u0022')
}

function detailHtml({
  id,
  title,
  current,
  original,
  discount,
  bonus = null,
  chartBonusPrices = [],
  chartBonusActive = false,
  lowestPsPlus = '--',
}) {
  const priceMarkup = original === null
    ? `<span class="game-buy-button-price">${current}</span>`
    : `<span class="game-buy-button-price strikethrough">${original}</span><br><span class="game-buy-button-price-discount">${current}</span>`
  const bonusMarkup = bonus === null
    ? ''
    : `<br><span class="game-buy-button-price-bonus"><img class="game-buy-button-icon-bonus" src="bonus.png">${bonus}</span>`

  return `
    <html>
      <head>
        <script>var item_id=${id};var item_type="game";var item_currency="$";var chart_bonus_prices="${chartLiteral(chartBonusPrices)}";var chart_bonus_active=${chartBonusActive};var next_marker=true;</script>
        <meta itemprop="priceCurrency" content="USD">
      </head>
      <body>
        <div itemprop="name" class="game-title-info-name">${title}</div>
        <p class="game-cover-bottom-big">SAVE: <span>${discount}</span></p>
        <div class="game-buy-button-right"><p>${priceMarkup}${bonusMarkup}</p></div>
        <p class="game-stats-col-title">Lowest PS+ price</p><span class="game-stats-col-number-big">${lowestPsPlus}</span>
      </body>
    </html>
  `
}

function parseFixture(name, options) {
  return parsePage(
    detailHtml(options),
    `https://psdeals.net/us-store/game/${options.id}/${name}`
  )
}

test('War Theatre FREE case remains structural and is not permanent free-to-play', () => {
  const parsed = parseFixture('war-theatre', {
    id: 1974609,
    title: 'War Theatre: Blood of Winter - Aged and Endless',
    current: 'FREE',
    original: '$4.99',
    discount: '100%',
    bonus: 'FREE',
    chartBonusPrices: [{ price: 0 }],
    chartBonusActive: true,
    lowestPsPlus: 'FREE',
  })

  assert.equal(parsed.current_price_amount, 0)
  assert.equal(parsed.discount_percent, 100)
  assert.equal(parsed.raw_detail_json.current_ps_plus_price_amount, 0)
  assert.equal(parsed.is_ps_plus_discount, false)
  assert.equal(parsed.is_free_to_play, false)
  assert.equal(parsed.availability_state, 'priced')
  assert.equal(
    parsed.commercial_state.classification,
    'temporary_free_promotion_candidate'
  )

  assert.deepEqual(buildCommercialUpsertPayload(parsed), {
    current_price_amount: 0,
    original_price_amount: 4.99,
    discount_percent: 100,
    deal_ends_at: null,
    is_ps_plus_discount: false,
    is_free_to_play: false,
    availability_state: 'priced',
  })
})

test('Night of the Dead does not infer current PS Plus from historical chart equality', () => {
  const parsed = parseFixture('night-of-the-dead-simulator', {
    id: 2831683,
    title: 'Night of the Dead Simulator',
    current: '$3.84',
    original: '$10.99',
    discount: '65%',
    chartBonusPrices: [{ price: '3.84' }],
    chartBonusActive: true,
    lowestPsPlus: '$3.84',
  })

  assert.equal(parsed.raw_detail_json.latest_chart_bonus_price_amount, 3.84)
  assert.equal(parsed.raw_detail_json.current_ps_plus_price_amount, null)
  assert.equal(parsed.is_ps_plus_discount, false)
  assert.deepEqual(buildCommercialUpsertPayload(parsed), {
    current_price_amount: 3.84,
    original_price_amount: 10.99,
    discount_percent: 65,
    deal_ends_at: null,
    is_ps_plus_discount: false,
    is_free_to_play: false,
    availability_state: 'priced',
  })
})

test('Telebbit extracts the nested PS Plus buy-box price', () => {
  const parsed = parseFixture('telebbit', {
    id: 2862034,
    title: 'Telebbit',
    current: '$4.99',
    original: '$9.99',
    discount: '50%',
    bonus: '$4.49',
    chartBonusPrices: [{ price: '4.49' }],
    chartBonusActive: true,
    lowestPsPlus: '$4.49',
  })

  assert.equal(parsed.raw_detail_json.current_ps_plus_price_amount, 4.49)
  assert.equal(parsed.raw_detail_json.current_ps_plus_buy_box_price_amount, 4.49)
  assert.equal(parsed.is_ps_plus_discount, true)
})

test('Brand New Cadillac does not restore chart precedence or historical equality', () => {
  const parsed = parseFixture('brand-new-cadillac-the-clash', {
    id: 640353,
    title: "'Brand New Cadillac' - The Clash",
    current: '$1.99',
    original: '$59.99',
    discount: '97%',
    chartBonusPrices: [{ price: '1.99' }],
    chartBonusActive: true,
    lowestPsPlus: '--',
  })

  assert.equal(parsed.raw_detail_json.latest_chart_bonus_price_amount, 1.99)
  assert.equal(parsed.raw_detail_json.current_ps_plus_price_amount, null)
  assert.equal(parsed.is_ps_plus_discount, false)
})

test('unsafe extreme full discounts do not produce a commercial upsert payload', () => {
  const parsed = parseFixture('extreme-full-discount', {
    id: 1306936,
    title: 'Extreme Full Discount',
    current: '$0.49',
    original: '$945.00',
    discount: '100%',
  })

  assert.equal(parsed.commercial_state.classification, 'extreme_full_discount')
  assert.deepEqual(buildCommercialUpsertPayload(parsed), {})
})

test('an unexplained zero does not write free-to-play fields', () => {
  const parsed = parseFixture('unexplained-zero', {
    id: 9999999,
    title: 'Unexplained Zero',
    current: 'FREE',
    original: null,
    discount: '',
  })

  assert.equal(parsed.is_free_to_play, null)
  assert.equal(parsed.availability_state, null)
  assert.deepEqual(buildCommercialUpsertPayload(parsed), {})
})
