import assert from 'node:assert/strict'
import test from 'node:test'

import { runBattleNetAdapter } from '../supabase/functions/campaign-monitoring/adapters/battle-net.ts'
import { runEaAppAdapter } from '../supabase/functions/campaign-monitoring/adapters/ea-app.ts'
import { runEpicGamesStoreAdapter } from '../supabase/functions/campaign-monitoring/adapters/epic-games-store.ts'
import { runGogAdapter } from '../supabase/functions/campaign-monitoring/adapters/gog.ts'
import { runMicrosoftStoreAdapter } from '../supabase/functions/campaign-monitoring/adapters/microsoft-store.ts'
import { runNintendoEshopAdapter } from '../supabase/functions/campaign-monitoring/adapters/nintendo-eshop.ts'
import { runPlayStationStoreAdapter } from '../supabase/functions/campaign-monitoring/adapters/playstation-store.ts'
import { runSteamAdapter } from '../supabase/functions/campaign-monitoring/adapters/steam.ts'
import { runUbisoftStoreAdapter } from '../supabase/functions/campaign-monitoring/adapters/ubisoft-store.ts'
import { campaignKeysToEnd } from '../supabase/functions/campaign-monitoring/_shared/reconcile.ts'
import { verifyKnownCampaigns } from '../supabase/functions/campaign-monitoring/_shared/verification.ts'

const currentCampaign = {
  sourceUid: 'current',
  name: 'Current campaign',
  storeSlug: 'steam',
  state: 'upcoming',
  lifecycleBasis: 'official-source',
  officialUrl: 'https://store.steampowered.com/sale/current',
  sourceUrl:
    'https://partner.steamgames.com/doc/marketing/upcoming_events?l=english',
}

const active = (overrides = {}) => ({
  campaign_key: 'steam-known',
  source_uid: 'known',
  ends_at: null,
  ...overrides,
})

function responseAt(body, url, init) {
  const response = new Response(body, init)
  Object.defineProperty(response, 'url', { value: url })
  return response
}

const nintendoKnown = (overrides = {}) => ({
  campaignKey: 'nintendo-indie-io',
  sourceUid: 'https://www.nintendo.com/us/store/sales-and-deals/indie-io/',
  name: 'Indie.io Sale',
  state: 'live',
  officialUrl:
    'https://www.nintendo.com/us/store/sales-and-deals/indie-io/',
  sourceUrl: 'https://www.nintendo.com/us/store/sales-and-deals/',
  ...overrides,
})

const emptyNintendoNews =
  '<script id="__NEXT_DATA__">{"props":{"pageProps":{"initialApolloState":{}}}}</script>'

const validGogHome = (content = '') => `
  <script id="gogcom-store-state" type="application/json">
    {"sections":["PROMO_BANNER_SECTION"]}
  </script>
  <promo-banner-section>${content}</promo-banner-section>
`

const gogFeed = (items = '') => `
  <rss version="2.0"><channel><title>GOG.com News</title>${items}</channel></rss>
`

test('partial discovery never ends a known campaign merely because it is absent', () => {
  assert.deepEqual(
    campaignKeysToEnd({
      sourceSucceeded: true,
      coverage: 'partial',
      activeCampaigns: [active()],
      detectedCampaigns: [currentCampaign],
      explicitlyEndedSourceUids: [],
      now: new Date('2026-08-26T00:00:00Z'),
    }),
    []
  )
})

test('source failure never ends campaigns even for an opted-in complete source', () => {
  assert.deepEqual(
    campaignKeysToEnd({
      sourceSucceeded: false,
      coverage: 'authoritative-complete-current-set',
      activeCampaigns: [active()],
      detectedCampaigns: [],
      explicitlyEndedSourceUids: ['known'],
      now: new Date('2026-08-26T00:00:00Z'),
    }),
    []
  )
})

test('absence reconciliation requires explicit complete-current-set opt-in', () => {
  assert.deepEqual(
    campaignKeysToEnd({
      sourceSucceeded: true,
      coverage: 'authoritative-complete-current-set',
      activeCampaigns: [active()],
      detectedCampaigns: [],
      explicitlyEndedSourceUids: [],
      now: new Date('2026-08-26T00:00:00Z'),
    }),
    ['steam-known']
  )
})

test('an official exact end instant can end a campaign after a successful run', () => {
  assert.deepEqual(
    campaignKeysToEnd({
      sourceSucceeded: true,
      coverage: 'partial',
      activeCampaigns: [active({ ends_at: '2026-08-25T18:00:00-04:00' })],
      detectedCampaigns: [],
      explicitlyEndedSourceUids: [],
      now: new Date('2026-08-26T00:00:00Z'),
    }),
    ['steam-known']
  )
})

test('explicit official source-ended verification can end a campaign', async () => {
  const known = {
    campaignKey: 'epic-known',
    sourceUid: 'epic-known-source',
    name: 'Epic Savings Sale',
    state: 'live',
    officialUrl: 'https://store.epicgames.com/sales-and-specials/epic-savings',
    sourceUrl: 'https://store.epicgames.com/en-US/sales-and-specials',
  }
  const ended = await verifyKnownCampaigns(
    async () => new Response('<main>The sale has ended.</main>'),
    [known],
    ['store.epicgames.com']
  )
  assert.deepEqual(ended, ['epic-known-source'])
  assert.deepEqual(
    campaignKeysToEnd({
      sourceSucceeded: true,
      coverage: 'partial',
      activeCampaigns: [
        active({ campaign_key: 'epic-known', source_uid: 'epic-known-source' }),
      ],
      detectedCampaigns: [],
      explicitlyEndedSourceUids: ended,
      now: new Date('2026-08-26T00:00:00Z'),
    }),
    ['epic-known']
  )
})

test('discovery and verification are independent and a failed verification preserves known state', async () => {
  const ended = await verifyKnownCampaigns(
    async () => new Response('Unavailable', { status: 503 }),
    [
      {
        campaignKey: 'known',
        sourceUid: 'known',
        name: 'Known sale',
        state: 'live',
        officialUrl: 'https://store.steampowered.com/sale/known',
        sourceUrl: 'https://store.steampowered.com/',
      },
    ],
    ['store.steampowered.com']
  )
  assert.deepEqual(ended, [])
})

test('verification fetches a shared official campaign page only once', async () => {
  let calls = 0
  const officialUrl = 'https://partner.steamgames.com/doc/marketing/upcoming_events'
  const ended = await verifyKnownCampaigns(
    async () => {
      calls += 1
      return new Response('The event is still announced.')
    },
    ['one', 'two'].map((sourceUid) => ({
      campaignKey: sourceUid,
      sourceUid,
      name: sourceUid,
      state: 'upcoming',
      officialUrl,
      sourceUrl: 'https://store.steampowered.com/',
    })),
    ['partner.steamgames.com']
  )
  assert.deepEqual(ended, [])
  assert.equal(calls, 1)
})

test('a shared discovery page is never treated as campaign-specific end evidence', async () => {
  let calls = 0
  const sharedUrl =
    'https://partner.steamgames.com/doc/marketing/upcoming_events?l=english'
  const ended = await verifyKnownCampaigns(
    async () => {
      calls += 1
      return new Response('A previous sale has ended.')
    },
    [
      {
        campaignKey: 'steam-future',
        sourceUid: 'steam-future',
        name: 'Steam Future Sale',
        state: 'upcoming',
        officialUrl: sharedUrl,
        sourceUrl: sharedUrl,
      },
    ],
    ['partner.steamgames.com']
  )
  assert.deepEqual(ended, [])
  assert.equal(calls, 0)
})

test('Microsoft reads campaign metadata without treating page sections as campaigns', async () => {
  const campaignKey = 'CampsiteChannel.Games.Sale.2026.gamescomsale0825'
  const html = `
    <h1>XBOX Sales & Specials</h1>
    <h2>Controllers & accessories on sale</h2>
    <h2>Deals with Game Pass</h2>
    <a href="https://www.xbox.com/games/browse/${campaignKey}">SHOP MORE</a>
    <script>{"channelMetadata":{"${campaignKey}":{"type":2,"data":{"channelTitleModuleData":{"title":"gamescom Sale","description":"Save up to 50%."}}}}}</script>
  `
  const result = await runMicrosoftStoreAdapter({
    now: new Date('2026-08-26T00:00:00Z'),
    fetch: async () => new Response(html, { status: 200 }),
  })

  assert.deepEqual(result.campaigns.map(({ name }) => name), ['gamescom Sale'])
  assert.equal(result.coverage, 'partial')
})

test('PlayStation prioritizes US Store campaign modules and keeps Blog complementary', async () => {
  const storeUrl = 'https://store.playstation.com/en-us/pages/latest'
  const graphqlUrl = 'https://web.np.playstation.com/api/graphql/v1/'
  const campaignUrl = 'https://store.playstation.com/en-us/pages/summer-savings'
  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-26T00:00:00Z'),
    fetch: async (input, init) => {
      const url = input.toString()
      if (url === storeUrl) {
        return new Response(
          `<script id="__NEXT_DATA__">${JSON.stringify({
            runtimeConfig: {
              emsClientId: 'official-client',
              service: { gqlBrowser: { host: graphqlUrl } },
            },
          })}</script>`
        )
      }
      if (url === 'https://blog.playstation.com/category/ps-store/') {
        return new Response('<main>No complementary article</main>')
      }
      if (url === graphqlUrl) {
        assert.equal(init?.method, 'POST')
        return Response.json({
          data: {
            emsExperienceRetrieve: {
              views: [
                {
                  components: [
                    {
                      altText: 'Summer Savings Sale',
                      link: { target: campaignUrl },
                    },
                  ],
                },
              ],
            },
          },
        })
      }
      if (url === campaignUrl) {
        return new Response(
          '<meta property="og:title" content="Summer Savings Sale"><p>Save now.</p>'
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  assert.deepEqual(result.campaigns.map(({ name }) => name), [
    'Summer Savings Sale',
  ])
  assert.equal(result.sourceUrl, storeUrl)
  assert.equal(result.sourceUrls.length, 3)
})

test('Nintendo discovers campaign tabs without traversing the product catalog', async () => {
  const salesUrl = 'https://www.nintendo.com/us/store/sales-and-deals/'
  const calls = []
  const fetcher = async (input) => {
    const url = input.toString()
    calls.push(url)
    if (url === salesUrl) {
      return new Response(`
        <a href="/us/store/sales-and-deals/">All deals</a>
        <a href="/us/store/sales-and-deals/best-sellers/">Best sellers</a>
        <a href="/us/store/sales-and-deals/sega/">SEGA</a>
        <a href="/us/store/products/example-switch/">$39.99 game</a>
      `)
    }
    if (url === 'https://www.nintendo.com/us/store/sales-and-deals/sega/') {
      return new Response(
        '<meta property="og:title" content="SEGA - Nintendo Sales Deals – Digital Games DLC | Nintendo Official Site">'
      )
    }
    if (url === 'https://www.nintendo.com/us/whatsnew/') {
      return new Response(
        '<script id="__NEXT_DATA__">{"props":{"pageProps":{"initialApolloState":{}}}}</script>'
      )
    }
    throw new Error(`Unexpected product traversal: ${url}`)
  }
  const result = await runNintendoEshopAdapter({
    now: new Date('2026-08-26T00:00:00Z'),
    fetch: fetcher,
  })

  assert.deepEqual(result.campaigns.map(({ name }) => name), ['SEGA Sale'])
  assert.equal(result.sourceUrls.length, 2)
  assert.equal(calls.some((url) => url.includes('/products/')), false)
})

test('Nintendo ends a missing Sales tab only when its official URL redirects to the Sales index', async () => {
  const salesUrl = 'https://www.nintendo.com/us/store/sales-and-deals/'
  const known = nintendoKnown({
    sourceUid: `${salesUrl}indie-io/`,
    officialUrl: `${salesUrl}indie-io`,
    sourceUrl: salesUrl.slice(0, -1),
  })
  const result = await runNintendoEshopAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    knownCampaigns: [known],
    fetch: async (input) => {
      const url = input.toString()
      if (url === salesUrl) return new Response('<main>Current tabs</main>')
      if (url === 'https://www.nintendo.com/us/whatsnew/') {
        return new Response(emptyNintendoNews)
      }
      if (url === known.officialUrl) {
        return responseAt('<main>Nintendo Sales & Deals</main>', salesUrl)
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  assert.deepEqual(result.explicitlyEndedSourceUids, [known.sourceUid])
  assert.deepEqual(
    campaignKeysToEnd({
      sourceSucceeded: true,
      coverage: result.coverage,
      activeCampaigns: [
        active({
          campaign_key: known.campaignKey,
          source_uid: known.sourceUid,
        }),
      ],
      detectedCampaigns: result.campaigns,
      explicitlyEndedSourceUids: result.explicitlyEndedSourceUids,
      now: new Date('2026-08-30T00:00:00Z'),
    }),
    [known.campaignKey]
  )
})

test('Nintendo preserves a missing Sales tab when its specific page still resolves', async () => {
  const salesUrl = 'https://www.nintendo.com/us/store/sales-and-deals/'
  const known = nintendoKnown()
  const result = await runNintendoEshopAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    knownCampaigns: [known],
    fetch: async (input) => {
      const url = input.toString()
      if (url === salesUrl) return new Response('<main>Current tabs</main>')
      if (url === 'https://www.nintendo.com/us/whatsnew/') {
        return new Response(emptyNintendoNews)
      }
      if (url === known.officialUrl) {
        return responseAt('<h1>Indie.io Sale</h1>', known.officialUrl)
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  assert.deepEqual(result.explicitlyEndedSourceUids, [])
})

test('Nintendo preserves a missing Sales tab when verification fails', async () => {
  const salesUrl = 'https://www.nintendo.com/us/store/sales-and-deals/'
  const known = nintendoKnown()
  const result = await runNintendoEshopAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    knownCampaigns: [known],
    fetch: async (input) => {
      const url = input.toString()
      if (url === salesUrl) return new Response('<main>Current tabs</main>')
      if (url === 'https://www.nintendo.com/us/whatsnew/') {
        return new Response(emptyNintendoNews)
      }
      if (url === known.officialUrl) {
        return new Response('Unavailable', { status: 503 })
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  assert.deepEqual(result.explicitlyEndedSourceUids, [])
})

test('Nintendo does not end a known campaign that is still a detected Sales tab', async () => {
  const salesUrl = 'https://www.nintendo.com/us/store/sales-and-deals/'
  const known = nintendoKnown({
    sourceUid: `${salesUrl}indie-io`,
    officialUrl: `${salesUrl}indie-io`,
  })
  const result = await runNintendoEshopAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    knownCampaigns: [known],
    fetch: async (input) => {
      const url = input.toString()
      if (url === salesUrl) {
        return new Response(
          '<a href="/us/store/sales-and-deals/indie-io/">Indie.io</a>'
        )
      }
      if (url === 'https://www.nintendo.com/us/whatsnew/') {
        return new Response(emptyNintendoNews)
      }
      if (url.startsWith(`${salesUrl}indie-io`)) {
        return responseAt(
          '<meta property="og:title" content="Indie.io Sale">',
          `${salesUrl}indie-io/`
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  assert.equal(result.campaigns.length, 1)
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
})

test('GOG News discovers an official Sale campaign page without traversing products', async () => {
  const articleUrl =
    'https://www.gog.com/en/news/back_to_school_sale_brings_another_giveaway'
  const campaignUrl = 'https://www.gog.com/promo/2026_back_to_school_sale'
  const calls = []
  const result = await runGogAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      calls.push(url)
      if (url === 'https://www.gog.com/en/') {
        return new Response(validGogHome())
      }
      if (url === 'https://www.gog.com/frontpage/rss') {
        return new Response(
          gogFeed(`
            <item>
              <title>Back to School Sale brings another giveaway!</title>
              <link>${articleUrl}</link>
              <description><![CDATA[
                <a href="https://www.gog.com/game/example?source=news">Example</a>
              ]]></description>
            </item>
          `)
        )
      }
      if (url === articleUrl) {
        return responseAt(
          `
            <meta property="og:title" content="Back to School Sale brings another giveaway!">
            <meta property="og:image" content="//images.gog.com/news-sale.jpg">
            <time class="article__date" datetime="2026-08-26T16:00"></time>
            <a href="${campaignUrl}?source=news">Back to School Sale</a>
            <a href="https://www.gog.com/game/example?source=news">Example game</a>
            <p>Back to School Sale ends on September 10th, 1 PM UTC.</p>
            <p>The Sale also includes a giveaway.</p>
          `,
          articleUrl
        )
      }
      if (url === campaignUrl) {
        return responseAt(
          `
            <meta property="og:image" content="https://images.gog.com/back-to-school-art.jpg">
            <h1>Back to School Sale</h1>
          `,
          'https://www.gog.com/es/back-to-school-sale?source=news'
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  assert.equal(result.campaigns.length, 1)
  assert.deepEqual(result.campaigns[0], {
    sourceUid: 'https://www.gog.com/back-to-school-sale',
    name: 'Back to School Sale',
    storeSlug: 'gog',
    state: 'live',
    lifecycleBasis: 'official-source',
    ends: {
      precision: 'datetime',
      value: '2026-09-10T13:00:00+00:00',
    },
    officialUrl: 'https://www.gog.com/back-to-school-sale',
    sourceUrl: articleUrl,
    artworkUrl: 'https://images.gog.com/back-to-school-art.jpg',
  })
  assert.equal(calls.some((url) => url.includes('/game/')), false)
})

test('GOG accepts the current locale-less Sale links exposed by its Home', async () => {
  const campaignUrl = 'https://www.gog.com/back-to-school-sale'
  const result = await runGogAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      if (url === 'https://www.gog.com/en/') {
        return new Response(
          validGogHome(
            `<a href="${campaignUrl}">8000+ deals up to -95%</a>`
          )
        )
      }
      if (url === 'https://www.gog.com/frontpage/rss') {
        return new Response(gogFeed())
      }
      if (url === campaignUrl) {
        return responseAt('<h1>Back to School Sale</h1>', campaignUrl)
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  assert.deepEqual(result.campaigns.map(({ name, sourceUid }) => ({
    name,
    sourceUid,
  })), [
    {
      name: 'Back to School Sale',
      sourceUid: 'https://www.gog.com/back-to-school-sale',
    },
  ])
})

test('GOG reuses a locale-bearing source UID from an equivalent known campaign', async () => {
  const currentUrl = 'https://www.gog.com/back-to-school-sale'
  const persistedUrl = 'https://www.gog.com/en/back-to-school-sale'
  const knownCampaign = {
    campaignKey: 'gog-persisted-back-to-school',
    sourceUid: persistedUrl,
    name: 'Back to School Sale',
    state: 'live',
    officialUrl: persistedUrl,
    sourceUrl: 'https://www.gog.com/en/',
  }
  const result = await runGogAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    knownCampaigns: [knownCampaign],
    fetch: async (input) => {
      const url = input.toString()
      if (url === 'https://www.gog.com/en/') {
        return new Response(
          validGogHome(
            `<a href="${currentUrl}">8000+ deals up to -95%</a>`
          )
        )
      }
      if (url === 'https://www.gog.com/frontpage/rss') {
        return new Response(gogFeed())
      }
      if (url === currentUrl || url === persistedUrl) {
        return responseAt('<h1>Back to School Sale</h1>', currentUrl)
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].sourceUid, persistedUrl)
  assert.equal(result.campaigns[0].officialUrl, currentUrl)
})

test('GOG ignores a giveaway-only News item without fetching product links', async () => {
  const articleUrl = 'https://www.gog.com/en/news/free_game_giveaway'
  const calls = []
  const result = await runGogAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      calls.push(url)
      if (url === 'https://www.gog.com/en/') {
        return new Response(validGogHome())
      }
      if (url === 'https://www.gog.com/frontpage/rss') {
        return new Response(
          gogFeed(`
            <item>
              <title>Giveaway: claim a free game</title>
              <link>${articleUrl}</link>
              <description><![CDATA[
                <a href="https://www.gog.com/game/free_example">Free game</a>
              ]]></description>
            </item>
          `)
        )
      }
      throw new Error(`Unexpected traversal: ${url}`)
    },
  })

  assert.deepEqual(result.campaigns, [])
  assert.deepEqual(calls, [
    'https://www.gog.com/en/',
    'https://www.gog.com/frontpage/rss',
  ])
})

test('GOG returns an empty healthy result for recognized surfaces with no campaigns', async () => {
  const result = await runGogAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: async (input) =>
      new Response(
        input.toString() === 'https://www.gog.com/en/'
          ? validGogHome()
          : gogFeed()
      ),
  })

  assert.deepEqual(result.campaigns, [])
  assert.equal(result.sourceUrls.length, 2)
})

test('GOG rejects an HTTP 200 response whose News discovery contract is unrecognizable', async () => {
  await assert.rejects(
    runGogAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: async (input) =>
        new Response(
          input.toString() === 'https://www.gog.com/en/'
            ? validGogHome()
            : '<html><main>GOG News is unavailable</main></html>'
        ),
    }),
    (error) => error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE'
  )
})

test('EA uses general official discovery and rejects a product-only deals grid', async () => {
  const calls = []
  await assert.rejects(
    runEaAppAdapter({
      now: new Date('2026-08-26T00:00:00Z'),
      fetch: async (input) => {
        const url = input.toString()
        calls.push(url)
        if (url.includes('/sales/deals')) {
          return new Response(
            '<ea-hybrid-themedsale-product link-url="/games/example/buy" label-text="Save 50%"></ea-hybrid-themedsale-product>'
          )
        }
        if (url.endsWith('/news')) return new Response('<main>EA News</main>')
        throw new Error(`Unexpected product traversal: ${url}`)
      },
    }),
    (error) => error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE'
  )
  assert.equal(calls.some((url) => url.includes('/summer-sale')), false)
  assert.equal(calls.some((url) => url.includes('/games/example')), false)
})

test('Epic can use official campaign-level HTML when the source permits it', async () => {
  const campaignUrl =
    'https://store.epicgames.com/en-US/sales-and-specials/epic-savings'
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-10T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      if (url.includes('/sales-and-specials') && url !== campaignUrl) {
        return new Response(`<a href="${campaignUrl}">Epic Savings Sale</a>`)
      }
      if (url.includes('/news/')) return new Response('<main>News</main>')
      if (url.includes('egs-platform-service')) return Response.json({})
      if (url === campaignUrl) {
        return new Response(
          '<meta property="og:title" content="Epic Savings Sale"><p>The sale is live. Deals end August 20, 2026 at 11:00 am EDT.</p>'
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].name, 'Epic Savings Sale')
  assert.equal(result.sourceUrls.length, 3)
})

test('Steam preserves date-only announcements as upcoming until a live surface confirms them', async () => {
  const html = `
    <main>Upcoming Steam Events
      Seasonal Sales Autumn Sale | October 1 - October 8, 2026
      2026 Fests Oct 26 Nov 2 Steam Scream V Registration details Next Fest
    </main>
  `
  const result = await runSteamAdapter({
    now: new Date('2026-10-03T00:00:00Z'),
    fetch: async (input) =>
      new Response(input.toString().includes('partner.steamgames.com') ? html : ''),
  })

  const autumn = result.campaigns.find(({ name }) => name === 'Steam Autumn Sale')
  assert.equal(autumn?.state, 'upcoming')
  assert.deepEqual(autumn?.starts, {
    precision: 'date',
    value: '2026-10-01',
  })
  assert.deepEqual(autumn?.ends, {
    precision: 'date',
    value: '2026-10-08',
  })
  assert.equal(result.sourceUrls.length, 2)
})

test('Ubisoft evaluates every campaign link and does not retain the former ten-item cap', async () => {
  const sourceUrl = 'https://store.ubisoft.com/us/deals'
  const links = Array.from(
    { length: 11 },
    (_, index) =>
      `<a href="https://store.ubisoft.com/us/campaign-${index}-sale">Campaign ${index} sale</a>`
  ).join('')
  const result = await runUbisoftStoreAdapter({
    now: new Date('2026-08-26T00:00:00Z'),
    fetch: async (input) =>
      new Response(
        input.toString() === sourceUrl
          ? links
          : '<meta property="og:title" content="Campaign Sale"><p>Save now.</p>'
      ),
  })
  assert.equal(result.campaigns.length, 11)
})

test('Battle.net follows feed pagination and does not truncate qualifying campaigns', async () => {
  const articleBase = 'https://news.blizzard.com/en-us/article/'
  const fetcher = async (input) => {
    const url = input.toString()
    if (url.includes('/api/feed/blizzard')) {
      const offset = Number(new URL(url).searchParams.get('offset'))
      return Response.json({
        contentItems:
          offset === 15
            ? Array.from({ length: 13 }, (_, index) => ({
                properties: {
                  title: `Battle.net Campaign ${index} Sale`,
                  summary: 'Save on multiple Battle.net games.',
                  newsUrl: `${articleBase}${index}/campaign-${index}-sale`,
                },
              }))
            : [],
        pagination: {
          offset,
          limit: 15,
          hasNextPage: offset < 30,
        },
      })
    }
    if (url.startsWith(articleBase)) {
      return new Response(
        '<meta property="og:title" content="Battle.net Campaign Sale"><p>Sale ends on September 14, 2026 at 10:00 am PDT.</p>'
      )
    }
    throw new Error(`Unexpected URL: ${url}`)
  }

  const result = await runBattleNetAdapter({
    now: new Date('2026-08-26T00:00:00Z'),
    fetch: fetcher,
  })

  assert.equal(result.campaigns.length, 13)
  assert.equal(result.sourceUrls.length, 3)
})

test('known campaigns leaving a partial discovery feed remain active', () => {
  assert.deepEqual(
    campaignKeysToEnd({
      sourceSucceeded: true,
      coverage: 'partial',
      activeCampaigns: [active({ campaign_key: 'battle-known' })],
      detectedCampaigns: [],
      explicitlyEndedSourceUids: [],
      now: new Date('2026-08-26T00:00:00Z'),
    }),
    []
  )
})
