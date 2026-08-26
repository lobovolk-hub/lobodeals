import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = process.cwd()

function transpileTypeScript(source, fileName) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  )

  assert.deepEqual(errors, [])
  return result.outputText
}

function toModuleUrl(source) {
  return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
}

async function loadSalesModel() {
  const storesSource = await readFile(path.join(root, 'lib/stores.ts'), 'utf8')
  const storesUrl = toModuleUrl(
    transpileTypeScript(storesSource, 'lib/stores.ts')
  )
  const salesSource = await readFile(path.join(root, 'lib/sales.ts'), 'utf8')
  const transpiled = transpileTypeScript(salesSource, 'lib/sales.ts')
  const linked = transpiled.replace(
    /from ['"]\.\/stores['"]/,
    "from '" + storesUrl + "'"
  )

  assert.notEqual(linked, transpiled)
  return import(toModuleUrl(linked))
}

const salesModelPromise = loadSalesModel()

function reportedCampaign(overrides = {}) {
  return {
    id: 'reported-campaign',
    name: 'Reported campaign',
    storeSlug: 'steam',
    market: 'US',
    starts: { precision: 'date', date: '2030-06-01' },
    ends: { precision: 'date', date: '2030-06-10' },
    lifecycle: { basis: 'official-source', status: 'upcoming' },
    officialUrl: 'https://store.steampowered.com/',
    ...overrides,
  }
}

function exactCampaign(overrides = {}) {
  return {
    id: 'exact-campaign',
    name: 'Exact campaign',
    storeSlug: 'epic-games-store',
    market: 'US',
    starts: {
      precision: 'datetime',
      dateTime: '2030-06-01T12:00:00-04:00',
    },
    ends: {
      precision: 'datetime',
      dateTime: '2030-06-10T12:00:00-04:00',
    },
    lifecycle: { basis: 'exact-time' },
    officialUrl: 'https://store.epicgames.com/en-US/',
    ...overrides,
  }
}

test('date-only boundaries accept real canonical dates and never invent a time', async () => {
  const {
    formatCampaignBoundary,
    isCampaignBoundary,
    isCanonicalDate,
  } = await salesModelPromise

  assert.equal(isCanonicalDate('2028-02-29'), true)
  assert.equal(isCanonicalDate('2027-02-29'), false)
  assert.equal(isCanonicalDate('2030-6-01'), false)
  assert.equal(
    isCampaignBoundary({ precision: 'date', date: '2030-06-01' }),
    true
  )
  assert.equal(
    formatCampaignBoundary({ precision: 'date', date: '2030-06-01' }),
    'June 1, 2030'
  )
  assert.doesNotMatch(
    formatCampaignBoundary({ precision: 'date', date: '2030-06-01' }),
    /12:00|UTC|AM|PM/
  )
})

test('exact datetime boundaries require a valid explicit timezone', async () => {
  const { isExactDateTime } = await salesModelPromise

  assert.equal(isExactDateTime('2030-06-01T12:00:00-04:00'), true)
  assert.equal(isExactDateTime('2030-06-01T16:00:00Z'), true)
  assert.equal(isExactDateTime('2030-06-01T12:00:00'), false)
  assert.equal(isExactDateTime('2030-06-01 12:00:00Z'), false)
  assert.equal(isExactDateTime('2030-02-29T12:00:00Z'), false)
})

test('campaign validation requires one canonical store and the US market', async () => {
  const { isOfficialCampaign, validateOfficialCampaigns } =
    await salesModelPromise
  const campaign = reportedCampaign()

  assert.equal(isOfficialCampaign(campaign), true)
  assert.equal(
    isOfficialCampaign(reportedCampaign({ storeSlug: 'unknown-store' })),
    false
  )
  assert.equal(isOfficialCampaign(reportedCampaign({ market: 'CA' })), false)
  assert.equal(
    isOfficialCampaign(reportedCampaign({ officialUrl: '/relative' })),
    false
  )
  assert.deepEqual(validateOfficialCampaigns([campaign]), [campaign])
  assert.throws(
    () => validateOfficialCampaigns([campaign, campaign]),
    /Duplicate official campaign id/
  )
  assert.equal('platform' in campaign, false)
  assert.equal('ecosystem' in campaign, false)
  assert.equal('productCount' in campaign, false)
})

test('source-reported status is not derived from date-only boundaries', async () => {
  const { getCampaignState } = await salesModelPromise
  const upcoming = reportedCampaign()
  const live = reportedCampaign({
    lifecycle: { basis: 'official-source', status: 'live' },
  })
  const distantFuture = new Date('2099-01-01T00:00:00Z')

  assert.equal(getCampaignState(upcoming, distantFuture), 'upcoming')
  assert.equal(getCampaignState(live, distantFuture), 'live')
})

test('time-derived lifecycle requires exact start and end instants', async () => {
  const { getCampaignState, isOfficialCampaign } = await salesModelPromise
  const campaign = exactCampaign()

  assert.equal(isOfficialCampaign(campaign), true)
  assert.equal(
    isOfficialCampaign(
      exactCampaign({
        starts: { precision: 'date', date: '2030-06-01' },
      })
    ),
    false
  )
  assert.equal(
    isOfficialCampaign(exactCampaign({ ends: undefined })),
    false
  )
  assert.equal(
    getCampaignState(campaign, new Date('2030-05-01T00:00:00Z')),
    'upcoming'
  )
  assert.equal(
    getCampaignState(campaign, new Date('2030-06-05T00:00:00Z')),
    'live'
  )
  assert.equal(
    getCampaignState(campaign, new Date('2030-06-10T16:00:00Z')),
    'expired'
  )
  assert.equal(getCampaignState(campaign), 'indeterminate')
})

test('campaign grouping is chronological and projects stores onto platforms', async () => {
  const {
    getCampaignsByPlatform,
    getCampaignsByStore,
    groupCampaigns,
  } = await salesModelPromise
  const campaigns = [
    reportedCampaign({
      id: 'upcoming-later',
      name: 'Later',
      storeSlug: 'steam',
      starts: { precision: 'date', date: '2030-07-01' },
    }),
    reportedCampaign({
      id: 'live-later-end',
      name: 'Live later end',
      storeSlug: 'microsoft-store',
      starts: { precision: 'date', date: '2030-05-01' },
      ends: { precision: 'date', date: '2030-06-20' },
      lifecycle: { basis: 'official-source', status: 'live' },
    }),
    reportedCampaign({
      id: 'upcoming-sooner',
      name: 'Sooner',
      storeSlug: 'gog',
      starts: { precision: 'date', date: '2030-06-15' },
    }),
    reportedCampaign({
      id: 'live-sooner-end',
      name: 'Live sooner end',
      storeSlug: 'microsoft-store',
      starts: { precision: 'date', date: '2030-05-01' },
      ends: { precision: 'date', date: '2030-06-10' },
      lifecycle: { basis: 'official-source', status: 'live' },
    }),
  ]
  const groups = groupCampaigns(campaigns)

  assert.deepEqual(
    groups.live.map((entry) => entry.campaign.id),
    ['live-sooner-end', 'live-later-end']
  )
  assert.deepEqual(
    groups.upcoming.map((entry) => entry.campaign.id),
    ['upcoming-sooner', 'upcoming-later']
  )
  assert.equal(getCampaignsByStore(campaigns, 'steam').length, 1)
  assert.equal(getCampaignsByPlatform(campaigns, 'xbox').length, 2)
  assert.equal(getCampaignsByPlatform(campaigns, 'pc').length, 4)
  assert.equal(getCampaignsByPlatform(campaigns, 'playstation').length, 0)
})

test('date-only sorting compares calendar days without creating instants', async () => {
  const { groupCampaigns } = await salesModelPromise
  const originalDateParse = Date.parse
  const originalDateUtc = Date.UTC

  Date.parse = () => {
    throw new Error('date-only sorting must not parse an instant')
  }
  Date.UTC = () => {
    throw new Error('date-only sorting must not create UTC midnight')
  }

  try {
    const groups = groupCampaigns([
      reportedCampaign({
        id: 'date-later',
        name: 'Later date',
        starts: { precision: 'date', date: '2030-06-02' },
      }),
      reportedCampaign({
        id: 'date-sooner',
        name: 'Sooner date',
        starts: { precision: 'date', date: '2030-06-01' },
      }),
    ])

    assert.deepEqual(
      groups.upcoming.map((entry) => entry.campaign.id),
      ['date-sooner', 'date-later']
    )
  } finally {
    Date.parse = originalDateParse
    Date.UTC = originalDateUtc
  }
})

test('exact datetimes on the same calendar day sort by their real instants', async () => {
  const { groupCampaigns } = await salesModelPromise
  const groups = groupCampaigns([
    reportedCampaign({
      id: 'exact-later-same-day',
      name: 'Later exact instant',
      starts: {
        precision: 'datetime',
        dateTime: '2030-06-01T15:00:00Z',
      },
    }),
    reportedCampaign({
      id: 'exact-sooner-same-day',
      name: 'Sooner exact instant',
      starts: {
        precision: 'datetime',
        dateTime: '2030-06-01T09:00:00-04:00',
      },
    }),
  ])

  assert.deepEqual(
    groups.upcoming.map((entry) => entry.campaign.id),
    ['exact-sooner-same-day', 'exact-later-same-day']
  )
})

test('mixed precision on different days sorts only by calendar date', async () => {
  const { groupCampaigns } = await salesModelPromise
  const originalDateParse = Date.parse

  Date.parse = () => {
    throw new Error('different calendar days do not need an invented instant')
  }

  try {
    const groups = groupCampaigns([
      reportedCampaign({
        id: 'date-later-day',
        name: 'Later calendar day',
        starts: { precision: 'date', date: '2030-06-02' },
      }),
      reportedCampaign({
        id: 'datetime-sooner-day',
        name: 'Sooner calendar day',
        starts: {
          precision: 'datetime',
          dateTime: '2030-06-01T23:30:00-04:00',
        },
      }),
    ])

    assert.deepEqual(
      groups.upcoming.map((entry) => entry.campaign.id),
      ['datetime-sooner-day', 'date-later-day']
    )
  } finally {
    Date.parse = originalDateParse
  }
})

test('mixed precision on the same day uses a non-temporal stable tie-breaker', async () => {
  const { groupCampaigns } = await salesModelPromise
  const originalDateParse = Date.parse
  const originalDateUtc = Date.UTC

  Date.parse = () => {
    throw new Error('mixed precision must not infer same-day precedence')
  }
  Date.UTC = () => {
    throw new Error('mixed precision must not create UTC midnight')
  }

  try {
    const groups = groupCampaigns([
      reportedCampaign({
        id: 'date-same-day',
        name: 'Zulu date-only campaign',
        starts: { precision: 'date', date: '2030-06-01' },
      }),
      reportedCampaign({
        id: 'datetime-same-day',
        name: 'Alpha exact campaign',
        starts: {
          precision: 'datetime',
          dateTime: '2030-06-01T23:59:00-04:00',
        },
      }),
    ])

    assert.deepEqual(
      groups.upcoming.map((entry) => entry.campaign.id),
      ['datetime-same-day', 'date-same-day']
    )
  } finally {
    Date.parse = originalDateParse
    Date.UTC = originalDateUtc
  }
})

test('client refresh boundaries are scheduled only for exact-time lifecycle', async () => {
  const { getNextExactBoundary } = await salesModelPromise
  const reported = reportedCampaign({
    starts: {
      precision: 'datetime',
      dateTime: '2030-06-01T12:00:00Z',
    },
    ends: {
      precision: 'datetime',
      dateTime: '2030-06-10T12:00:00Z',
    },
  })
  const exact = exactCampaign({
    starts: {
      precision: 'datetime',
      dateTime: '2030-06-01T16:00:00Z',
    },
    ends: {
      precision: 'datetime',
      dateTime: '2030-06-10T16:00:00Z',
    },
  })

  assert.equal(
    getNextExactBoundary(
      [reported],
      Date.parse('2030-05-01T00:00:00Z')
    ),
    null
  )
  assert.equal(
    getNextExactBoundary(
      [exact],
      Date.parse('2030-05-01T00:00:00Z')
    ),
    Date.parse('2030-06-01T16:00:00Z')
  )
})
