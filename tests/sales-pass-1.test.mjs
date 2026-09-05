import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { extractMeta } from '../supabase/functions/campaign-monitoring/_shared/html.ts'
import {
  extractSteamCampaignTitle,
  extractSteamPartnerTiming,
  runSteamAdapter,
} from '../supabase/functions/campaign-monitoring/adapters/steam.ts'
import { getSalesSelectionState } from '../lib/sales-availability.ts'
import { stores } from '../lib/stores.ts'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

function attributeJson(value) {
  return JSON.stringify(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function steamCampaignFixture({
  eventName = "Get in gamer, we're going shopping",
  subtitle =
    'The Jackbox Publisher Sale is on now - save up to 80% on your next Party Pack!',
  groupName = 'Official Jackbox Games',
} = {}) {
  const group = attributeJson([{ group_name: groupName }])
  const event = attributeJson([
    {
      event_name: eventName,
      rtime32_start_time: 1787850000,
      rtime32_end_time: 1788454800,
      jsondata: JSON.stringify({ localized_subtitle: [subtitle] }),
    },
  ])

  return `
    <html>
      <head>
        <title>${eventName}</title>
        <meta property="og:title" content="${eventName}">
        <meta property="og:description" content="${subtitle}">
      </head>
      <body data-groupvanityinfo="${group}" data-partnereventstore="${event}"></body>
    </html>
  `
}

const availability = [
  { storeSlug: 'steam', availability: 'available' },
  {
    storeSlug: 'playstation-store',
    availability: 'temporarily_unavailable',
  },
]

const healthyAvailability = stores.map(({ slug }) => ({
  storeSlug: slug,
  availability: 'available',
}))

test('sales selection keeps partial source health separate from aggregate content', () => {
  assert.equal(
    getSalesSelectionState({
      selectedStoreSlug: null,
      campaignCount: 4,
      availability,
      sourceUnavailable: false,
    }),
    'content'
  )
  assert.equal(
    getSalesSelectionState({
      selectedStoreSlug: null,
      campaignCount: 0,
      availability,
      sourceUnavailable: true,
    }),
    'unavailable'
  )
  assert.equal(
    getSalesSelectionState({
      selectedStoreSlug: null,
      campaignCount: 0,
      availability,
      sourceUnavailable: false,
    }),
    'unavailable'
  )
  assert.equal(
    getSalesSelectionState({
      selectedStoreSlug: null,
      campaignCount: 0,
      availability: healthyAvailability,
      sourceUnavailable: false,
    }),
    'empty'
  )
  assert.equal(
    getSalesSelectionState({
      selectedStoreSlug: 'playstation-store',
      campaignCount: 1,
      availability,
      sourceUnavailable: false,
    }),
    'content-with-availability-notice'
  )
  assert.equal(
    getSalesSelectionState({
      selectedStoreSlug: 'playstation-store',
      campaignCount: 0,
      availability,
      sourceUnavailable: false,
    }),
    'unavailable'
  )
  assert.equal(
    getSalesSelectionState({
      selectedStoreSlug: 'steam',
      campaignCount: 0,
      availability,
      sourceUnavailable: false,
    }),
    'empty'
  )
})

test('/sales copy is compact and does not expose the backend market label', async () => {
  const page = await source('app/sales/page.tsx')
  const browser = await source('components/sales-browser.tsx')

  assert.match(browser, /Official campaigns/)
  assert.doesNotMatch(page, /United States/i)
  assert.doesNotMatch(page, /ten stores LoboDeals follows/i)
  assert.doesNotMatch(page, /ordered by useful campaign timing/i)
})

test('/sales integrates the accessible store filter into its header', async () => {
  const browser = await source('components/sales-browser.tsx')
  const header = browser.match(/<header[\s\S]*?<\/header>/)?.[0] ?? ''

  assert.match(header, /data-sales-header/)
  assert.match(header, /<h1[\s\S]*?>\s*Sales\s*<\/h1>/)
  assert.match(header, /<span className="sr-only">Filter by store<\/span>/)
  assert.match(header, /data-sales-store-filter/)
  assert.match(header, /<option value="all">All official stores<\/option>/)
  assert.match(header, /sm:flex-row/)
  assert.match(header, /sm:w-72/)
  assert.match(header, /w-full/)
  assert.doesNotMatch(browser, /Campaign view/i)
  assert.doesNotMatch(browser, /<h2[\s\S]*?>\s*Filter by store\s*<\/h2>/)
})

test('sales browser renders one state for blocked or empty selections', async () => {
  const browser = await source('components/sales-browser.tsx')

  assert.match(browser, /selectionState === 'unavailable' \|\| selectionState === 'empty'/)
  assert.match(browser, /Sales data is temporarily unavailable\./)
  assert.match(browser, /Sales data is temporarily unavailable for this store\./)
  assert.match(browser, /selectedStoreSlug === null/)
  assert.match(browser, /No current or upcoming official campaigns detected\./)
  assert.match(browser, /Previously confirmed campaigns remain visible\./)
  assert.doesNotMatch(browser, /Sales data is temporarily unavailable\.<\/p>[\s\S]*Current campaign availability/)
})

test('/sales Upcoming is a chronological compact list while Home keeps its rail', async () => {
  const sections = await source('components/campaign-sections.tsx')
  const list = await source('components/upcoming-campaign-list.tsx')

  assert.match(sections, /homePreview \? \([\s\S]*<UpcomingRail>/)
  assert.match(sections, /<UpcomingCampaignList/)
  assert.match(list, /StoreLogo store=\{store\} variant="mini"/)
  assert.match(list, /campaign\.name/)
  assert.match(list, /CampaignTiming/)
  assert.match(list, /CampaignDateRange/)
  assert.match(list, /target="_blank"/)
  assert.match(list, /lg:grid-cols-/)
  assert.equal((list.match(/<a\b/g) || []).length, 1)
  assert.equal((list.match(/<button\b/g) || []).length, 0)
})

test('Steam metadata parser preserves apostrophes instead of truncating titles', () => {
  assert.equal(
    extractMeta(
      `<meta property="og:title" content="Get in gamer, we're going shopping">`,
      'og:title'
    ),
    "Get in gamer, we're going shopping"
  )
})

test('Steam campaign structure beats marketing copy without a campaign override', () => {
  const html = steamCampaignFixture()

  assert.equal(extractSteamCampaignTitle(html), 'Jackbox Games Publisher Sale')
  assert.equal(
    extractSteamCampaignTitle(
      '<title>Steam</title><meta property="og:title" content="Steam Store">'
    ),
    null
  )
  assert.deepEqual(extractSteamPartnerTiming(html), {
    starts: { precision: 'datetime', value: '2026-08-27T17:00:00.000Z' },
    ends: { precision: 'datetime', value: '2026-09-03T17:00:00.000Z' },
  })
})

test('Steam title correction retains URL identity and deduplicates repeated home links', async () => {
  const officialUrl =
    'https://store.steampowered.com/sale/JackboxPublisherSale2026'
  const calendar = '<main>Upcoming Steam Events</main>'
  const home = `<a href="${officialUrl}?snr=one">Publisher Sale</a><a href="${officialUrl}?snr=two">Publisher Sale</a>`
  const campaignPage = steamCampaignFixture()
  const result = await runSteamAdapter({
    now: new Date('2026-08-28T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      if (url.includes('partner.steamgames.com')) return new Response(calendar)
      if (url.startsWith(`${officialUrl}?`)) return new Response(campaignPage)
      if (url.startsWith('https://store.steampowered.com/?')) {
        return new Response(home)
      }
      throw new Error(`Unexpected fixture URL: ${url}`)
    },
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].name, 'Jackbox Games Publisher Sale')
  assert.equal(result.campaigns[0].sourceUid, officialUrl)
  assert.equal(result.campaigns[0].officialUrl, officialUrl)
  assert.equal(result.campaigns[0].lifecycleBasis, 'exact-time')
})

test('Steam production adapter contains no campaign-specific title mapping', async () => {
  const adapter = await source(
    'supabase/functions/campaign-monitoring/adapters/steam.ts'
  )

  assert.doesNotMatch(adapter, /JackboxPublisherSale2026|Jackbox Games Publisher Sale/)
  assert.match(adapter, /officialGroupName/)
  assert.match(adapter, /completePublisherTitle/)
})
