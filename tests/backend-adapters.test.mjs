import assert from 'node:assert/strict'
import test from 'node:test'

import { runBattleNetAdapter } from '../supabase/functions/campaign-monitoring/adapters/battle-net.ts'
import { runEaAppAdapter } from '../supabase/functions/campaign-monitoring/adapters/ea-app.ts'
import { runEpicGamesStoreAdapter } from '../supabase/functions/campaign-monitoring/adapters/epic-games-store.ts'
import { runGogAdapter } from '../supabase/functions/campaign-monitoring/adapters/gog.ts'
import { runMicrosoftStoreAdapter } from '../supabase/functions/campaign-monitoring/adapters/microsoft-store.ts'
import { runNintendoEshopAdapter } from '../supabase/functions/campaign-monitoring/adapters/nintendo-eshop.ts'
import { runPlayStationStoreAdapter } from '../supabase/functions/campaign-monitoring/adapters/playstation-store.ts'
import { runRockstarStoreAdapter } from '../supabase/functions/campaign-monitoring/adapters/rockstar-store.ts'
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

const eaDealsUrl = 'https://www.ea.com/sales/deals'
const eaNewsUrl = 'https://www.ea.com/news'
const rockstarSalesUrl = 'https://www.rockstargames.com/newswire?tag=661'
const rockstarGraphHost = 'graph.rockstargames.com'
const rockstarListHash =
  '9e0e0c370d9f0dc1390e163449304c09758fb555c7e554a891924606b0a4f1e4'
const rockstarPostHash =
  '22e736db7ec6bb5a053095866f612041a308719f3b2551b0bd2e866921b7053b'

const rockstarSalesTag = { id: 661, name: 'Sales' }

const rockstarSummary = ({
  id = 'historic-sale',
  title = 'The Rockstar Store Holiday Sale',
  url = `/newswire/article/${id}/rockstar-store-holiday-sale`,
  tags = [rockstarSalesTag],
  artwork,
} = {}) => ({
  id,
  url,
  title,
  name_slug: url.split('/').at(-1),
  created: '12/3/24, 6:37 PM',
  created_formatted: 'December 3, 2024',
  primary_tags: tags,
  secondary_tags: null,
  preview_images_parsed: {
    newswire_block: {
      square: null,
      d16x9: artwork ?? null,
      _fallback: null,
    },
  },
})

const rockstarPost = ({
  id = 'historic-sale',
  title = 'The Rockstar Store Holiday Sale',
  body = `
    <p>The Rockstar Store Holiday Sale includes select games for PC.</p>
    <a href="https://store.rockstargames.com/game/one">Game one</a>
    <a href="https://store.rockstargames.com/game/two">Game two</a>
    <p>Sale ends January 7, 2025 at 11:59 p.m. ET.</p>
  `,
  tags = [rockstarSalesTag],
} = {}) => ({
  post: {
    id,
    title,
    subtitle: '',
    content: '',
    show_related: true,
    created: '12/3/24, 6:37 PM',
    created_formatted: 'December 3, 2024',
    posts_hero: null,
    primary_tags: [{ id: 43, name: 'Rockstar Games' }],
    secondary_tags: tags,
    jsx: 2,
    posts_jsx: null,
    tina: { id: 1, payload: { blocks: [{ content: body }] }, variables: {}, status: 'published' },
  },
  root_url_translations: null,
  related: { results: [] },
})

function rockstarListPage(
  results,
  {
    page = 1,
    pageCount = results.length === 0 ? 0 : 1,
    count = results.length,
    perPage = 20,
    nextPage = page < pageCount,
    prevPage = page > 1,
  } = {}
) {
  return {
    meta: { title: 'Newswire' },
    posts: {
      paging: { page, pageCount, count, perPage, nextPage, prevPage },
      results,
    },
  }
}

function rockstarGraphRequest(input) {
  const url = new URL(input.toString())
  assert.equal(url.hostname, rockstarGraphHost)
  return {
    url,
    operation: url.searchParams.get('operationName'),
    variables: JSON.parse(url.searchParams.get('variables') ?? '{}'),
    extensions: JSON.parse(url.searchParams.get('extensions') ?? '{}'),
    query: url.searchParams.get('query'),
  }
}

function createRockstarFetcher({
  pages = new Map([[1, rockstarListPage([rockstarSummary()])]]),
  posts = new Map([['historic-sale', rockstarPost()]]),
  apqMiss = [],
  calls = [],
} = {}) {
  const misses = new Set(apqMiss)
  return async (input, init) => {
    const request = rockstarGraphRequest(input)
    calls.push({ ...request, init })
    assert.equal(init?.headers.Accept, 'application/json')
    assert.equal(request.variables.tagIdHash ?? '661', '661')

    if (misses.has(request.operation) && request.query === null) {
      misses.delete(request.operation)
      return Response.json({ errors: [{ message: 'PersistedQueryNotFound' }] })
    }
    if (request.operation === 'NewswireList') {
      const page = pages.get(request.variables.page)
      if (!page) throw new Error(`Missing Rockstar list page ${request.variables.page}`)
      return Response.json({ data: page, errors: null })
    }
    if (request.operation === 'NewswirePost') {
      const post = posts.get(request.variables.id_hash)
      if (!post) throw new Error(`Missing Rockstar post ${request.variables.id_hash}`)
      return Response.json({ data: post, errors: null })
    }
    throw new Error(`Unexpected Rockstar operation: ${request.operation}`)
  }
}

function runRockstarTestPost({
  id,
  summaryTitle,
  postTitle = summaryTitle,
  body,
  now = new Date('2026-08-30T00:00:00Z'),
  includeHistoricalHealthEvidence = false,
}) {
  const summaries = [
    rockstarSummary({
      id,
      title: summaryTitle,
      url: `/newswire/article/${id}/${id}`,
    }),
  ]
  const posts = new Map([
    [id, rockstarPost({ id, title: postTitle, body })],
  ])
  if (includeHistoricalHealthEvidence) {
    summaries.push(rockstarSummary())
    posts.set('historic-sale', rockstarPost())
  }

  return runRockstarStoreAdapter({
    now,
    fetch: createRockstarFetcher({
      pages: new Map([[1, rockstarListPage(summaries)]]),
      posts,
    }),
  })
}

const validEaDeals = (content = '') => `
  <html>
    <head><link rel="canonical" href="${eaDealsUrl}"></head>
    <body>
      <ea-hybrid-themedsale-controller target-dom-id="ea-sale-row">
      </ea-hybrid-themedsale-controller>
      <ea-hybrid-themedsale-row id="ea-sale-row" title-text="Player favorites">
        <ea-hybrid-themedsale-product
          link-url="/games/example/buy"
          label-text="Save 50%">
        </ea-hybrid-themedsale-product>
        ${content}
      </ea-hybrid-themedsale-row>
    </body>
  </html>
`

const validEaNews = (content = '') => `
  <html>
    <head><link href="${eaNewsUrl}" rel="canonical"></head>
    <body>
      <div id="__next">
        <main>
          <h1>News &amp; Updates</h1>
          <a href="/news/company-update">Company update</a>
          ${content}
        </main>
      </div>
      <script id="__NEXT_DATA__" type="application/json">{}</script>
    </body>
  </html>
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

test('EA returns a successful partial empty result for recognized official surfaces', async () => {
  const calls = []
  const result = await runEaAppAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      calls.push(url)
      if (url === eaDealsUrl) return new Response(validEaDeals())
      if (url === eaNewsUrl) return new Response(validEaNews())
      throw new Error(`Unexpected traversal: ${url}`)
    },
  })

  assert.deepEqual(result.campaigns, [])
  assert.equal(result.coverage, 'partial')
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
  assert.deepEqual(calls, [eaDealsUrl, eaNewsUrl])
})

test('EA rejects HTTP 200 Deals markup without the recognized discovery contract', async () => {
  await assert.rejects(
    runEaAppAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: async (input) =>
        new Response(
          input.toString() === eaDealsUrl
            ? `<html><head><link rel="canonical" href="${eaDealsUrl}"></head><body><main>Featured games</main></body></html>`
            : validEaNews()
        ),
    }),
    (error) =>
      error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE' &&
      error.blocked === false
  )
})

test('EA rejects HTTP 200 News markup without the recognized discovery contract', async () => {
  await assert.rejects(
    runEaAppAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: async (input) =>
        new Response(
          input.toString() === eaDealsUrl
            ? validEaDeals()
            : `<html><head><link rel="canonical" href="${eaNewsUrl}"></head><body><main>News unavailable</main><script id="__NEXT_DATA__">{}</script></body></html>`
        ),
    }),
    (error) =>
      error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE' &&
      error.blocked === false
  )
})

test('EA preserves blocked semantics when either official source returns HTTP 403', async () => {
  for (const blockedUrl of [eaDealsUrl, eaNewsUrl]) {
    await assert.rejects(
      runEaAppAdapter({
        now: new Date('2026-08-30T00:00:00Z'),
        fetch: async (input) => {
          const url = input.toString()
          if (url === blockedUrl) {
            return new Response('Forbidden', { status: 403 })
          }
          return new Response(
            url === eaDealsUrl ? validEaDeals() : validEaNews()
          )
        },
      }),
      (error) => error.code === 'HTTP_403' && error.blocked === true
    )
  }
})

test('EA partial empty discovery does not end a known campaign by absence', async () => {
  const known = {
    campaignKey: 'ea-known-sale',
    sourceUid: 'https://www.ea.com/sales/summer-sale',
    name: 'EA Summer Sale',
    state: 'live',
    officialUrl: 'https://www.ea.com/sales/summer-sale',
    sourceUrl: eaDealsUrl,
  }
  const result = await runEaAppAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    knownCampaigns: [known],
    fetch: async (input) => {
      const url = input.toString()
      if (url === eaDealsUrl) return new Response(validEaDeals())
      if (url === eaNewsUrl) return new Response(validEaNews())
      if (url === known.officialUrl) {
        return new Response('<main>EA Summer Sale remains available.</main>')
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  assert.deepEqual(result.campaigns, [])
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
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
    []
  )
})

test('EA still detects a valid official campaign-level Sale link', async () => {
  const campaignUrl = 'https://www.ea.com/sales/summer-sale'
  const calls = []
  const result = await runEaAppAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      calls.push(url)
      if (url === eaDealsUrl) {
        return new Response(
          validEaDeals(`<a href="${campaignUrl}">EA Summer Sale</a>`)
        )
      }
      if (url === eaNewsUrl) return new Response(validEaNews())
      if (url === campaignUrl) {
        return new Response(
          '<meta property="og:title" content="EA Summer Sale"><main>The EA Summer Sale is live now.</main>'
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].name, 'EA Summer Sale')
  assert.equal(result.campaigns[0].officialUrl, campaignUrl)
  assert.deepEqual(calls, [eaDealsUrl, eaNewsUrl, campaignUrl])
})

test('EA does not convert or traverse ordinary game links that mention a Sale', async () => {
  const productUrl = 'https://www.ea.com/games/example/buy'
  const calls = []
  const result = await runEaAppAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      calls.push(url)
      if (url === eaDealsUrl) {
        return new Response(
          validEaDeals(`<a href="${productUrl}">Summer Sale: Save 75%</a>`)
        )
      }
      if (url === eaNewsUrl) return new Response(validEaNews())
      throw new Error(`Unexpected product traversal: ${url}`)
    },
  })

  assert.deepEqual(result.campaigns, [])
  assert.equal(calls.includes(productUrl), false)
})

test('Rockstar returns a healthy partial empty result for a verified historical Sales surface', async () => {
  const calls = []
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: createRockstarFetcher({ calls }),
  })

  assert.deepEqual(result.campaigns, [])
  assert.equal(result.coverage, 'partial')
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
  assert.equal(result.sourceUrl, rockstarSalesUrl)
  assert.deepEqual(result.sourceUrls, [
    rockstarSalesUrl,
    'https://graph.rockstargames.com?origin=https%3A%2F%2Fwww.rockstargames.com',
  ])

  const listCall = calls.find(({ operation }) => operation === 'NewswireList')
  assert.equal(listCall.query, null)
  assert.equal(listCall.variables.tagIdHash, '661')
  assert.equal(listCall.variables.tagId, undefined)
  assert.equal(
    listCall.extensions.persistedQuery.sha256Hash,
    rockstarListHash
  )
  assert.equal(
    calls.some(({ url }) =>
      /(?:tag_id=43|[?&]tag=43(?:&|$))/i.test(url.toString())
    ),
    false
  )
})

test('Rockstar retries an APQ cache miss with the canonical full query', async () => {
  const calls = []
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: createRockstarFetcher({ calls, apqMiss: ['NewswireList'] }),
  })

  assert.deepEqual(result.campaigns, [])
  const listCalls = calls.filter(
    ({ operation }) => operation === 'NewswireList'
  )
  assert.equal(listCalls.length, 2)
  assert.equal(listCalls[0].query, null)
  assert.match(listCalls[1].query, /^query NewswireList\(/)
  assert.equal(
    listCalls[1].extensions.persistedQuery.sha256Hash,
    rockstarListHash
  )
})

test('Rockstar fails safely on non-APQ GraphQL errors', async () => {
  await assert.rejects(
    runRockstarStoreAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: async () =>
        Response.json({ errors: [{ message: 'FieldsOnCorrectType' }] }),
    }),
    (error) =>
      error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE' &&
      error.blocked === false
  )
})

test('Rockstar preserves HTTP failure and blocked semantics', async () => {
  await assert.rejects(
    runRockstarStoreAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: async () => new Response('Forbidden', { status: 403 }),
    }),
    (error) => error.code === 'HTTP_403' && error.blocked === true
  )

  for (const fetcher of [
    async () => new Response('Unavailable', { status: 500 }),
    async () => {
      throw new Error('network unavailable')
    },
  ]) {
    await assert.rejects(
      runRockstarStoreAdapter({
        now: new Date('2026-08-30T00:00:00Z'),
        fetch: fetcher,
      }),
      (error) => error.blocked === false
    )
  }
})

test('Rockstar rejects an HTTP 200 response with a broken GraphQL shape', async () => {
  await assert.rejects(
    runRockstarStoreAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: async () =>
        Response.json({ data: { meta: { title: 'Newswire' }, posts: null } }),
    }),
    (error) => error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE'
  )
})

test('Rockstar does not report false healthy when Sales 661 loses historical evidence', async () => {
  const noTagSummary = rockstarSummary({ tags: [] })
  const noTagPost = rockstarPost({ tags: [] })
  await assert.rejects(
    runRockstarStoreAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: createRockstarFetcher({
        pages: new Map([[1, rockstarListPage([noTagSummary])]]),
        posts: new Map([['historic-sale', noTagPost]]),
      }),
    }),
    (error) => error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE'
  )

  await assert.rejects(
    runRockstarStoreAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: createRockstarFetcher({
        pages: new Map([[1, rockstarListPage([])]]),
        posts: new Map(),
      }),
    }),
    (error) => error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE'
  )

  const unrecognizable = rockstarSummary({
    id: 'unrecognizable-sales-post',
    title: 'Special Offers This Week',
    url: '/newswire/article/unrecognizable-sales-post/special-offers',
  })
  await assert.rejects(
    runRockstarStoreAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: createRockstarFetcher({
        pages: new Map([[1, rockstarListPage([unrecognizable])]]),
        posts: new Map([
          [
            'unrecognizable-sales-post',
            rockstarPost({
              id: 'unrecognizable-sales-post',
              title: unrecognizable.title,
              body: '<p>Read about this week at Rockstar Games.</p>',
            }),
          ],
        ]),
      }),
    }),
    (error) => error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE'
  )
})

test('Rockstar does not treat a Humble Bundle Sale as historical Store health evidence', async () => {
  const id = 'humble-bundle-sale'
  const summary = rockstarSummary({
    id,
    title: 'Humble Bundle Sale',
    url: `/newswire/article/${id}/${id}`,
  })

  await assert.rejects(
    runRockstarStoreAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: createRockstarFetcher({
        pages: new Map([[1, rockstarListPage([summary])]]),
        posts: new Map([
          [
            id,
            rockstarPost({
              id,
              title: summary.title,
              body: `
                <p>The Humble Bundle Sale includes multiple PC games.</p>
                <a href="https://www.humblebundle.com/games/rockstar">View bundle</a>
              `,
            }),
          ],
        ]),
      }),
    }),
    (error) => error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE'
  )
})

test('Rockstar processes every declared Sales page', async () => {
  const calls = []
  const unrelated = rockstarSummary({
    id: 'mobile-sale',
    title: 'San Andreas Anniversary Mobile Sale',
    url: '/newswire/article/mobile-sale/san-andreas-mobile-sale',
  })
  const pages = new Map([
    [
      1,
      rockstarListPage([unrelated], {
        page: 1,
        pageCount: 2,
        count: 2,
        perPage: 1,
        nextPage: true,
        prevPage: false,
      }),
    ],
    [
      2,
      rockstarListPage([rockstarSummary()], {
        page: 2,
        pageCount: 2,
        count: 2,
        perPage: 1,
        nextPage: false,
        prevPage: true,
      }),
    ],
  ])
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: createRockstarFetcher({
      pages,
      posts: new Map([
        [
          'mobile-sale',
          rockstarPost({
            id: 'mobile-sale',
            title: unrelated.title,
            body: '<p>Save on the App Store and Google Play.</p>',
          }),
        ],
        ['historic-sale', rockstarPost()],
      ]),
      calls,
    }),
  })

  assert.deepEqual(result.campaigns, [])
  assert.deepEqual(
    calls
      .filter(({ operation }) => operation === 'NewswireList')
      .map(({ variables }) => variables.page),
    [1, 2]
  )
})

test('Rockstar rejects incoherent or looping pagination', async () => {
  const repeatedPage = rockstarListPage([rockstarSummary()], {
    page: 1,
    pageCount: 2,
    count: 2,
    perPage: 1,
    nextPage: true,
    prevPage: false,
  })
  await assert.rejects(
    runRockstarStoreAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: createRockstarFetcher({
        pages: new Map([
          [1, repeatedPage],
          [2, repeatedPage],
        ]),
      }),
    }),
    (error) => error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE'
  )

  const prematureEnd = rockstarListPage([rockstarSummary()], {
    page: 1,
    pageCount: 2,
    count: 2,
    perPage: 1,
    nextPage: false,
    prevPage: false,
  })
  await assert.rejects(
    runRockstarStoreAdapter({
      now: new Date('2026-08-30T00:00:00Z'),
      fetch: createRockstarFetcher({
        pages: new Map([[1, prematureEnd]]),
      }),
    }),
    (error) => error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE'
  )
})

test('Rockstar detects a campaign-level Store Sale with exact lifecycle and stable identity', async () => {
  const calls = []
  const id = 'summer-sale'
  const summary = rockstarSummary({
    id,
    title: 'Rockstar Store Summer Sale',
    url: `http://www.rockstargames.com/newswire/article/${id}/rockstar-store-summer-sale/?tracking=ignored#hero`,
    artwork:
      'https://media-rockstargames-com.akamaized.net/tina-uploads/posts/summer-sale/art.jpg',
  })
  const post = rockstarPost({
    id,
    title: 'Rockstar Store Summer Sale',
    body: `
      <p>The Rockstar Store Summer Sale is live with select games for PC.</p>
      <p>Sale starts August 30, 2026 at 10:00 AM UTC and ends September 10, 2026 at 1:00 PM UTC.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
      <a href="https://store.rockstargames.com/game/two">Game two</a>
    `,
  })
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T12:00:00Z'),
    fetch: createRockstarFetcher({
      pages: new Map([[1, rockstarListPage([summary])]]),
      posts: new Map([[id, post]]),
      calls,
    }),
  })

  assert.deepEqual(result.campaigns, [
    {
      sourceUid:
        'https://www.rockstargames.com/newswire/article/summer-sale/rockstar-store-summer-sale',
      name: 'Rockstar Store Summer Sale',
      storeSlug: 'rockstar-store',
      state: 'live',
      lifecycleBasis: 'exact-time',
      starts: {
        precision: 'datetime',
        value: '2026-08-30T10:00:00+00:00',
      },
      ends: {
        precision: 'datetime',
        value: '2026-09-10T13:00:00+00:00',
      },
      officialUrl:
        'https://www.rockstargames.com/newswire/article/summer-sale/rockstar-store-summer-sale',
      sourceUrl: rockstarSalesUrl,
      artworkUrl:
        'https://media-rockstargames-com.akamaized.net/tina-uploads/posts/summer-sale/art.jpg',
    },
  ])
  const postCall = calls.find(({ operation }) => operation === 'NewswirePost')
  assert.equal(
    postCall.extensions.persistedQuery.sha256Hash,
    rockstarPostHash
  )
  assert.equal(
    calls.every(({ url }) => url.hostname === rockstarGraphHost),
    true
  )
})

test('Rockstar publishes a qualifying Sale explicitly reported live without timing', async () => {
  const id = 'live-without-timing'
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: createRockstarFetcher({
      pages: new Map([
        [
          1,
          rockstarListPage([
            rockstarSummary({
              id,
              title: 'Rockstar Store Summer Sale',
              url: `/newswire/article/${id}/rockstar-store-summer-sale`,
            }),
          ]),
        ],
      ]),
      posts: new Map([
        [
          id,
          rockstarPost({
            id,
            title: 'Rockstar Store Summer Sale',
            body: `
              <p>The Rockstar Store Summer Sale is live now with select games for PC.</p>
              <a href="https://store.rockstargames.com/game/one">Game one</a>
            `,
          }),
        ],
      ]),
    }),
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].state, 'live')
  assert.equal(result.campaigns[0].lifecycleBasis, 'official-source')
  assert.equal(result.campaigns[0].starts, undefined)
  assert.equal(result.campaigns[0].ends, undefined)
})

test('Rockstar publishes a qualifying Sale explicitly reported upcoming without timing', async () => {
  const id = 'upcoming-without-timing'
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: createRockstarFetcher({
      pages: new Map([
        [
          1,
          rockstarListPage([
            rockstarSummary({
              id,
              title: 'Rockstar Warehouse Holiday Sale',
              url: `/newswire/article/${id}/rockstar-warehouse-holiday-sale`,
            }),
          ]),
        ],
      ]),
      posts: new Map([
        [
          id,
          rockstarPost({
            id,
            title: 'Rockstar Warehouse Holiday Sale',
            body: `
              <p>The Rockstar Warehouse Holiday Sale is coming soon with multiple PC games.</p>
              <a href="https://warehouse.rockstargames.com/game/one">Game one</a>
            `,
          }),
        ],
      ]),
    }),
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].state, 'upcoming')
  assert.equal(result.campaigns[0].lifecycleBasis, 'official-source')
  assert.equal(result.campaigns[0].starts, undefined)
  assert.equal(result.campaigns[0].ends, undefined)
})

test('Rockstar preserves a future exact end while explicit source state remains upcoming', async () => {
  const result = await runRockstarTestPost({
    id: 'upcoming-with-future-end',
    summaryTitle: 'Rockstar Store Holiday Sale',
    body: `
      <p>The Rockstar Store Holiday Sale is coming soon with select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
      <p>Sale ends September 10, 2026 at 1:00 PM UTC.</p>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].state, 'upcoming')
  assert.equal(result.campaigns[0].lifecycleBasis, 'official-source')
  assert.equal(result.campaigns[0].starts, undefined)
  assert.deepEqual(result.campaigns[0].ends, {
    precision: 'datetime',
    value: '2026-09-10T13:00:00+00:00',
  })
})

test('Rockstar preserves a future exact end while explicit source state remains live', async () => {
  const result = await runRockstarTestPost({
    id: 'live-with-future-end',
    summaryTitle: 'Rockstar Store Holiday Sale',
    body: `
      <p>The Rockstar Store Holiday Sale is live now with select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
      <p>Sale ends September 10, 2026 at 1:00 PM UTC.</p>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].state, 'live')
  assert.equal(result.campaigns[0].lifecycleBasis, 'official-source')
  assert.equal(result.campaigns[0].starts, undefined)
  assert.deepEqual(result.campaigns[0].ends, {
    precision: 'datetime',
    value: '2026-09-10T13:00:00+00:00',
  })
})

test('Rockstar does not revive an explicit live claim after its exact end', async () => {
  const result = await runRockstarTestPost({
    id: 'historic-live-with-exact-end',
    summaryTitle: 'Rockstar Store Holiday Sale',
    body: `
      <p>The Rockstar Store Holiday Sale is live now with select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
      <p>Sale ends January 7, 2025 at 11:59 PM UTC.</p>
    `,
  })

  assert.deepEqual(result.campaigns, [])
})

test('Rockstar derives upcoming from an exact future start without inventing an end', async () => {
  const result = await runRockstarTestPost({
    id: 'future-start-only',
    summaryTitle: 'Rockstar Store Holiday Sale',
    body: `
      <p>The Rockstar Store Holiday Sale includes select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
      <p>Sale starts September 10, 2026 at 1:00 PM UTC.</p>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].state, 'upcoming')
  assert.equal(result.campaigns[0].lifecycleBasis, 'official-source')
  assert.deepEqual(result.campaigns[0].starts, {
    precision: 'datetime',
    value: '2026-09-10T13:00:00+00:00',
  })
  assert.equal(result.campaigns[0].ends, undefined)
})

test('Rockstar preserves a passed exact start when explicit source state is live', async () => {
  const result = await runRockstarTestPost({
    id: 'passed-start-explicit-live',
    summaryTitle: 'Rockstar Store Holiday Sale',
    now: new Date('2026-09-11T00:00:00Z'),
    body: `
      <p>The Rockstar Store Holiday Sale is live now with select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
      <p>Sale starts September 10, 2026 at 1:00 PM UTC.</p>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].state, 'live')
  assert.equal(result.campaigns[0].lifecycleBasis, 'official-source')
  assert.deepEqual(result.campaigns[0].starts, {
    precision: 'datetime',
    value: '2026-09-10T13:00:00+00:00',
  })
  assert.equal(result.campaigns[0].ends, undefined)
})

test('Rockstar does not publish a passed exact start without current source state', async () => {
  const result = await runRockstarTestPost({
    id: 'passed-start-no-current-state',
    summaryTitle: 'Rockstar Store Holiday Sale',
    now: new Date('2026-09-11T00:00:00Z'),
    body: `
      <p>The Rockstar Store Holiday Sale includes select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
      <p>Sale starts September 10, 2026 at 1:00 PM UTC.</p>
    `,
  })

  assert.deepEqual(result.campaigns, [])
})

test('Rockstar does not publish a qualifying Sale without timing or explicit state', async () => {
  const id = 'no-state-or-timing'
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: createRockstarFetcher({
      pages: new Map([
        [
          1,
          rockstarListPage([
            rockstarSummary({
              id,
              title: 'Rockstar Store Summer Sale',
              url: `/newswire/article/${id}/rockstar-store-summer-sale`,
            }),
          ]),
        ],
      ]),
      posts: new Map([
        [
          id,
          rockstarPost({
            id,
            title: 'Rockstar Store Summer Sale',
            body: `
              <p>Explore select games for PC in the Rockstar Store Summer Sale. Shop now.</p>
              <a href="https://store.rockstargames.com/game/one">Game one</a>
            `,
          }),
        ],
      ]),
    }),
  })

  assert.deepEqual(result.campaigns, [])
})

test('Rockstar does not revive a clearly historical date-only range from stale live prose', async () => {
  const result = await runRockstarTestPost({
    id: 'historic-date-only-live',
    summaryTitle: 'Rockstar Store Holiday Sale',
    body: `
      <p>The Rockstar Store Holiday Sale is live now with select PC games.</p>
      <p>December 3, 2024 through January 7, 2025.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
    `,
  })

  assert.deepEqual(result.campaigns, [])
})

test('Rockstar inspects every Sales summary before strict Store campaign classification', async () => {
  const id = 'broad-summary'
  const title = 'Save Big This Weekend'
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: createRockstarFetcher({
      pages: new Map([
        [
          1,
          rockstarListPage([
            rockstarSummary({
              id,
              title,
              url: `/newswire/article/${id}/holiday-sale`,
            }),
          ]),
        ],
      ]),
      posts: new Map([
        [
          id,
          rockstarPost({
            id,
            title,
            body: `
              <p>The Rockstar Store Holiday Sale is live now with a selection of PC games.</p>
              <a href="https://store.rockstargames.com/game/one">Game one</a>
            `,
          }),
        ],
      ]),
    }),
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].name, title)
  assert.equal(result.campaigns[0].state, 'live')
})

test('Rockstar accepts explicit Rockstar Games Sale identity with qualifying Store evidence', async () => {
  const result = await runRockstarTestPost({
    id: 'rockstar-games-holiday-sale',
    summaryTitle: 'Rockstar Games Holiday Sale',
    body: `
      <p>The Rockstar Games Holiday Sale is live now with select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].name, 'Rockstar Games Holiday Sale')
  assert.equal(result.campaigns[0].state, 'live')
})

test('Rockstar rejects Rockstar Games Sale identity without an official Store CTA', async () => {
  const result = await runRockstarTestPost({
    id: 'rockstar-games-sale-without-cta',
    summaryTitle: 'Rockstar Games Sale',
    includeHistoricalHealthEvidence: true,
    body: `
      <p>The Rockstar Games Sale is live now with select PC games.</p>
    `,
  })

  assert.deepEqual(result.campaigns, [])
})

test('Rockstar accepts a GTA Franchise Sale with strict Store campaign evidence', async () => {
  const result = await runRockstarTestPost({
    id: 'gta-franchise-sale',
    summaryTitle: 'GTA Franchise Sale',
    body: `
      <p>The GTA Franchise Sale is live now with select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].name, 'GTA Franchise Sale')
  assert.equal(result.campaigns[0].state, 'live')
})

test('Rockstar accepts a Publisher Sale with strict Store campaign evidence', async () => {
  const result = await runRockstarTestPost({
    id: 'rockstar-publisher-sale',
    summaryTitle: 'Rockstar Publisher Sale',
    body: `
      <p>The Rockstar Publisher Sale is live now with multiple PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].name, 'Rockstar Publisher Sale')
  assert.equal(result.campaigns[0].state, 'live')
})

test('Rockstar still rejects an individual Sale with one game link and no breadth', async () => {
  const result = await runRockstarTestPost({
    id: 'individual-red-dead-sale',
    summaryTitle: 'Red Dead Redemption Sale',
    includeHistoricalHealthEvidence: true,
    body: `
      <p>The Red Dead Redemption Sale is live now for PC.</p>
      <a href="https://store.rockstargames.com/game/red-dead-redemption">Buy now</a>
    `,
  })

  assert.deepEqual(result.campaigns, [])
})

test('Rockstar recognizes plural Deals as explicit live campaign state', async () => {
  const result = await runRockstarTestPost({
    id: 'rockstar-games-deals-live',
    summaryTitle: 'Rockstar Games Deals',
    body: `
      <p>Rockstar Games Deals are live now with select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].state, 'live')
})

test('Rockstar recognizes plural Savings as explicit upcoming campaign state', async () => {
  const result = await runRockstarTestPost({
    id: 'holiday-savings-upcoming',
    summaryTitle: 'Holiday Savings',
    body: `
      <p>Holiday Savings are coming soon with select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].state, 'upcoming')
})

test('Rockstar accepts Holiday Offers with strict Store campaign evidence', async () => {
  const result = await runRockstarTestPost({
    id: 'holiday-offers',
    summaryTitle: 'Holiday Offers',
    body: `
      <p>Holiday Offers are live now with select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].name, 'Holiday Offers')
  assert.equal(result.campaigns[0].state, 'live')
})

test('Rockstar accepts Spring Promotion with strict Store campaign evidence', async () => {
  const result = await runRockstarTestPost({
    id: 'spring-promotion',
    summaryTitle: 'Spring Promotion',
    body: `
      <p>Spring Promotion is live now with multiple PC games and savings.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].name, 'Spring Promotion')
  assert.equal(result.campaigns[0].state, 'live')
})

test('Rockstar rejects a generic Event without commercial campaign evidence', async () => {
  const eventId = 'gta-online-event'
  const eventSummary = rockstarSummary({
    id: eventId,
    title: 'GTA Online Event',
    url: `/newswire/article/${eventId}/${eventId}`,
  })
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: createRockstarFetcher({
      pages: new Map([
        [1, rockstarListPage([eventSummary, rockstarSummary()])],
      ]),
      posts: new Map([
        [
          eventId,
          rockstarPost({
            id: eventId,
            title: eventSummary.title,
            body: `
              <p>The GTA Online Event is live now with select PC games.</p>
              <a href="https://store.rockstargames.com/game/one">Game one</a>
            `,
          }),
        ],
        ['historic-sale', rockstarPost()],
      ]),
    }),
  })

  assert.deepEqual(result.campaigns, [])
})

test('Rockstar preserves an exact Deals end with explicit live campaign state', async () => {
  const result = await runRockstarTestPost({
    id: 'rockstar-games-deals-end',
    summaryTitle: 'Rockstar Games Deals',
    body: `
      <p>Rockstar Games Deals are live now with select PC games.</p>
      <a href="https://store.rockstargames.com/game/one">Game one</a>
      <p>Deals end September 10, 2026 at 1:00 PM UTC.</p>
    `,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].state, 'live')
  assert.deepEqual(result.campaigns[0].ends, {
    precision: 'datetime',
    value: '2026-09-10T13:00:00+00:00',
  })
})

test('Rockstar excludes merch, rewards, GTA+, giveaways and individual discounts', async () => {
  const summaries = [
    rockstarSummary({
      id: 'merch-sale',
      title: 'Rockstar Store Holiday Sale',
      url: '/newswire/article/merch-sale/rockstar-store-holiday-sale',
    }),
    rockstarSummary({
      id: 'individual-sale',
      title: 'Rockstar Store Red Dead Redemption Sale',
      url: '/newswire/article/individual-sale/red-dead-redemption-sale',
    }),
    rockstarSummary({
      id: 'rewards',
      title: 'GTA Online Triple Rewards Sale',
      url: '/newswire/article/rewards/gta-online-triple-rewards',
    }),
    rockstarSummary({
      id: 'giveaway',
      title: 'GTA+ Giveaway Sale',
      url: '/newswire/article/giveaway/gta-plus-giveaway',
    }),
    rockstarSummary(),
  ]
  const posts = new Map([
    [
      'merch-sale',
      rockstarPost({
        id: 'merch-sale',
        title: 'Rockstar Store Holiday Sale',
        body: `
          <p>Apparel, collectibles, and merchandise are on sale now.</p>
          <a href="https://store.rockstargames.com/merchandise/hat">Hat</a>
          <p>Sale ends September 10, 2026 at 1:00 PM UTC.</p>
        `,
      }),
    ],
    [
      'individual-sale',
      rockstarPost({
        id: 'individual-sale',
        title: 'Rockstar Store Red Dead Redemption Sale',
        body: `
          <p>Save 20% on Red Dead Redemption for PC. Explore Rockstar Games titles.</p>
          <a href="https://store.rockstargames.com/game/red-dead-redemption">Buy now</a>
          <p>Sale ends September 10, 2026 at 1:00 PM UTC.</p>
        `,
      }),
    ],
    [
      'rewards',
      rockstarPost({
        id: 'rewards',
        title: 'GTA Online Triple Rewards Sale',
        body: '<p>Earn GTA Online rewards this week.</p>',
      }),
    ],
    [
      'giveaway',
      rockstarPost({
        id: 'giveaway',
        title: 'GTA+ Giveaway Sale',
        body: '<p>Claim a GTA+ subscription giveaway.</p>',
      }),
    ],
    ['historic-sale', rockstarPost()],
  ])
  const calls = []
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    fetch: createRockstarFetcher({
      pages: new Map([[1, rockstarListPage(summaries)]]),
      posts,
      calls,
    }),
  })

  assert.deepEqual(result.campaigns, [])
  assert.deepEqual(
    calls
      .filter(({ operation }) => operation === 'NewswirePost')
      .map(({ variables }) => variables.id_hash),
    ['merch-sale', 'individual-sale', 'rewards', 'giveaway', 'historic-sale']
  )
})

test('Rockstar partial absence and failed article verification preserve known campaigns', async () => {
  const knownId = 'known-sale'
  const known = {
    campaignKey: 'rockstar-known',
    sourceUid: `https://www.rockstargames.com/newswire/article/${knownId}/known-sale`,
    name: 'Rockstar Store Known Sale',
    state: 'live',
    officialUrl: `https://www.rockstargames.com/newswire/article/${knownId}/known-sale`,
    sourceUrl: rockstarSalesUrl,
  }
  const posts = new Map([
    ['historic-sale', rockstarPost()],
    [
      knownId,
      rockstarPost({
        id: knownId,
        title: known.name,
        body: '<p>The Rockstar Store Known Sale remains announced.</p>',
      }),
    ],
  ])
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    knownCampaigns: [known],
    fetch: createRockstarFetcher({ posts }),
  })
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
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
    []
  )

  const failedVerification = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    knownCampaigns: [known],
    fetch: async (input, init) => {
      const request = rockstarGraphRequest(input)
      if (
        request.operation === 'NewswirePost' &&
        request.variables.id_hash === knownId
      ) {
        return new Response('Unavailable', { status: 500 })
      }
      return createRockstarFetcher()(input, init)
    },
  })
  assert.deepEqual(failedVerification.explicitlyEndedSourceUids, [])
})

test('Rockstar ends a known campaign only from explicit article evidence or an exact passed end', async () => {
  const explicitId = 'explicit-ended'
  const exactId = 'exact-ended'
  const knownCampaigns = [
    {
      campaignKey: explicitId,
      sourceUid: `https://www.rockstargames.com/newswire/article/${explicitId}/sale`,
      name: 'Rockstar Store Explicit Sale',
      state: 'live',
      officialUrl: `https://www.rockstargames.com/newswire/article/${explicitId}/sale`,
      sourceUrl: rockstarSalesUrl,
    },
    {
      campaignKey: exactId,
      sourceUid: `https://www.rockstargames.com/newswire/article/${exactId}/sale`,
      name: 'Rockstar Store Exact Sale',
      state: 'live',
      officialUrl: `https://www.rockstargames.com/newswire/article/${exactId}/sale`,
      sourceUrl: rockstarSalesUrl,
    },
  ]
  const posts = new Map([
    ['historic-sale', rockstarPost()],
    [
      explicitId,
      rockstarPost({
        id: explicitId,
        title: knownCampaigns[0].name,
        body: '<p>The sale has ended.</p>',
      }),
    ],
    [
      exactId,
      rockstarPost({
        id: exactId,
        title: knownCampaigns[1].name,
        body: `
          <p>The Rockstar Store Exact Sale includes select games for PC.</p>
          <p>Sale ends January 7, 2025 at 11:59 p.m. ET.</p>
        `,
      }),
    ],
  ])
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    knownCampaigns,
    fetch: createRockstarFetcher({ posts }),
  })

  assert.deepEqual(result.explicitlyEndedSourceUids, [
    knownCampaigns[0].sourceUid,
    knownCampaigns[1].sourceUid,
  ])
})

test('Rockstar explicit known-campaign ending supports plural Sales vocabulary conservatively', async () => {
  const endedId = 'plural-deals-ended'
  const futureId = 'plural-deals-future-end'
  const knownCampaigns = [endedId, futureId].map((id) => ({
    campaignKey: id,
    sourceUid: `https://www.rockstargames.com/newswire/article/${id}/deals`,
    name: 'Rockstar Games Deals',
    state: 'live',
    officialUrl: `https://www.rockstargames.com/newswire/article/${id}/deals`,
    sourceUrl: rockstarSalesUrl,
  }))
  const result = await runRockstarStoreAdapter({
    now: new Date('2026-08-30T00:00:00Z'),
    knownCampaigns,
    fetch: createRockstarFetcher({
      posts: new Map([
        ['historic-sale', rockstarPost()],
        [
          endedId,
          rockstarPost({
            id: endedId,
            title: knownCampaigns[0].name,
            body: '<p>Rockstar Games Deals have ended.</p>',
          }),
        ],
        [
          futureId,
          rockstarPost({
            id: futureId,
            title: knownCampaigns[1].name,
            body: '<p>Deals end September 10, 2026 at 1:00 PM UTC.</p>',
          }),
        ],
      ]),
    }),
  })

  assert.deepEqual(result.explicitlyEndedSourceUids, [
    knownCampaigns[0].sourceUid,
  ])
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
