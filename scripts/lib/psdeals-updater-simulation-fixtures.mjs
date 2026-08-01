const TIMESTAMP = '2026-08-01T12:00:00.000Z'

function listingItem(id, title, options = {}) {
  return {
    psdeals_id: id,
    psdeals_slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    psdeals_url: `https://psdeals.net/us-store/game/${id}/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title,
    image_url: `https://cdn.psdeals.net/${id}.png`,
    current_price: options.current ?? '$9.99',
    original_price: options.original ?? '$19.99',
    discount_percent: options.discount ?? '-50%',
    type_label: options.type ?? 'Full Game',
    platforms: options.platforms ?? 'PS5 / PS4',
  }
}

function detail(id, options = {}) {
  const current = options.current ?? 9.99
  const original = options.original ?? 19.99
  return {
    psdeals_id: id,
    attempts: options.attempts || [{
      status: 'ok',
      current_price: current,
      original_price: original,
      discount_percent: options.discount ?? -50,
      type_label: options.type ?? 'Game',
      platforms: options.platforms ?? 'PS5 / PS4',
      ps_plus_price: options.ps_plus_price ?? null,
      ps_plus_parser_status: options.ps_plus_parser_status ?? null,
      ps_plus_source_consistent: options.ps_plus_source_consistent ?? null,
      is_monthly_game: options.is_monthly_game ?? false,
    }],
  }
}

function baseFixture() {
  const game = listingItem(910001, 'Fixture Game')
  const bundle = listingItem(910002, 'Fixture Bundle', {
    current: '$29.99', original: '$59.99', discount: '-50%', type: 'Bundle', platforms: 'PS5',
  })
  const addon = listingItem(910003, 'Fixture Add On', {
    current: '$4.99', original: '$9.99', discount: '-50%', type: 'Add-On', platforms: 'PS4',
  })
  return {
    fixture_id: 'happy-path',
    mode: 'simulation',
    logical_timestamp: TIMESTAMP,
    project_ref: 'fixture-lobodeals',
    seed: 'lobodeals-updater-simulation-v1',
    code_revision: 'fixture-code-revision',
    configuration: {
      expected_pages: 2,
      expected_total: 3,
      stale_limit: 10,
      ps_plus_recheck_limit: 10,
      stale_hours: 24,
      allow_empty_listing: false,
    },
    listing: {
      pages: [
        { page_number: 1, final: false, truncated: false, items: [game, bundle] },
        { page_number: 2, final: true, truncated: false, items: [addon] },
      ],
    },
    initial_stage: [
      {
        id: 'stage-910001', psdeals_id: 910001, title: 'Fixture Game',
        current_price_amount: 14.99, original_price_amount: 19.99,
        discount_percent: 25, detail_last_synced_at: '2026-07-20T00:00:00.000Z',
        is_ps_plus_discount: false, is_active_discount: true,
      },
      {
        id: 'stage-910004', psdeals_id: 910004, psdeals_slug: 'ended-fixture',
        psdeals_url: 'https://psdeals.net/us-store/game/910004/ended-fixture',
        title: 'Ended Fixture', current_price_amount: 5, original_price_amount: 20,
        discount_percent: 75, is_active_discount: true,
        updated_at: '2026-07-01T00:00:00.000Z',
      },
    ],
    initial_public_prices: {
      910001: { current_price_amount: 14.99 },
      910004: { current_price_amount: 5 },
    },
    initial_minima: {
      910001: { regular: { amount: 12.99, observed_at: '2026-07-01T00:00:00.000Z' } },
      910002: {},
      910003: { regular: { amount: 4.99, observed_at: '2026-07-15T00:00:00.000Z' } },
    },
    details: [
      detail(910001),
      detail(910002, {
        current: 29.99, original: 59.99, type: 'Bundle', platforms: 'PS5',
        ps_plus_price: 19.99,
        ps_plus_parser_status: 'parsed_current_discount',
        ps_plus_source_consistent: true,
      }),
      detail(910003, { current: 4.99, original: 9.99, type: 'Add-On', platforms: 'PS4' }),
    ],
    monthly: {
      status: 'supported',
      checked: true,
      source: 'tracked-offline-fixture',
      procedure: 'manual-semantic-review-fixture',
      proposed_changes: [],
      application_performed: false,
    },
    faults: {},
  }
}

function clone(value) {
  return structuredClone(value)
}

export const PSDEALS_UPDATER_SIMULATION_SCENARIOS = Object.freeze([
  'happy-path',
  'adversarial-listing',
  'retry-success',
  'ended-deals',
  'mixed-regular-plus',
])

export function getPsdealsUpdaterSimulationFixture(name) {
  const fixture = baseFixture()
  if (name === 'happy-path' || name === 'mixed-regular-plus' || name === 'ended-deals') {
    fixture.fixture_id = name
    return clone(fixture)
  }
  if (name === 'adversarial-listing') {
    fixture.fixture_id = name
    fixture.listing.pages[1].truncated = true
    return clone(fixture)
  }
  if (name === 'retry-success') {
    fixture.fixture_id = name
    fixture.details[0].attempts.unshift({ status: 'timeout' })
    return clone(fixture)
  }
  throw new Error(`SIMULATION_SCENARIO_UNKNOWN:${name}`)
}
