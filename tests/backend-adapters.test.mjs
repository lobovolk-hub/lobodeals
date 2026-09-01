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

const epicSalesUrl = 'https://store.epicgames.com/sales-and-specials'
const epicDealsUrl =
  'https://store.epicgames.com/browse?sortBy=relevancy&tag=deals%20of%20the%20week&count=40'

function epicSsr({
  country = 'US',
  locale = 'en-US',
  layoutType = 'sale',
  layoutSlug = null,
  status = 'success',
  elements = [],
} = {}) {
  const queries = [
    {
      queryKey: [
        'storefrontDiscover',
        ['country', country],
        ['layoutSlug', layoutSlug],
        ['layoutType', layoutType],
        ['locale', locale],
        'fixture-hash',
      ],
      state: {
        status,
        data: {
          Storefront: {
            discoverLayout: { modules: elements },
          },
        },
      },
    },
  ]
  return `<script>window.__REACT_QUERY_INITIAL_QUERIES__ = ${JSON.stringify({ mutations: [], queries })};</script>`
}

function epicMain(modules = [], overrides = {}) {
  return epicSsr({
    ...overrides,
    elements: [
      {
        __typename: 'PageHeader',
        type: 'PageHeader',
        title: 'Epic Games Sales & Specials',
      },
      {
        __typename: 'StorefrontSubModules',
        type: 'subModules',
        modules,
      },
    ],
  })
}

function epicDealsOfTheWeek() {
  return {
    __typename: 'StorefrontBreaker',
    type: 'breaker',
    title: 'Check out all the deals for this week.',
    image: {
      alt: 'Epic Games Store Deals of the Week',
      src: 'https://cdn1.epicgames.com/deals-of-the-week.jpg',
    },
    link: { src: epicDealsUrl, linkText: 'Browse' },
    offer: { namespace: '', id: '' },
  }
}

function epicLanding(
  slug,
  {
    title,
    description = '',
    banner = 'https://static-assets-prod.epicgames.com/campaign.jpg',
  }
) {
  return epicSsr({
    layoutSlug: slug,
    elements: [
      {
        __typename: 'PageHeader',
        type: 'PageHeader',
        title,
        description,
        banner: { src: banner },
      },
    ],
  })
}

const epicKnown = (overrides = {}) => ({
  campaignKey: 'epic-savings',
  sourceUid: `${epicSalesUrl}/epic-savings`,
  name: 'Epic Savings Sale',
  state: 'live',
  officialUrl: `${epicSalesUrl}/epic-savings`,
  sourceUrl: epicSalesUrl,
  ...overrides,
})

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
    sourceUrl: 'https://store.epicgames.com/sales-and-specials',
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

const psGraphqlUrl = 'https://web.np.playstation.com/api/graphql/v1/op'
const psBlogUrl = 'https://blog.playstation.com/category/ps-store/'
const psExperienceHash =
  'b5078800ed1bdebee9800979f9306abeadc5169030263f7095fe573b12e52270'
const psDefaultViewHash =
  'fc2998417fe7297a559b7f3798bf1c5e1650d88e926269bf6d8bd2cce3fddc76'

const psCategoryUrl = (categoryId) =>
  `https://store.playstation.com/en-us/category/${categoryId}/1`

const psCategoryLink = (categoryId, localizedName = `cat.gma.${categoryId}`) => ({
  __typename: 'EMSLink',
  localizedName,
  target: categoryId,
  type: 'EMS_CATEGORY',
})

const psView = ({ purpose, reportingName, components = [] }) => ({
  __typename: 'EMSView',
  components,
  purpose,
  reportingName,
})

const psDealsNavigation = () =>
  psView({
    purpose: 'COLLECTION',
    reportingName: 'DEALSLINKS',
    components: [
      {
        __typename: 'EMSImageComponent',
        altText: 'All deals',
        link: psCategoryLink('all-deals'),
      },
    ],
  })

const psLatestNavigation = () =>
  psView({
    purpose: 'COLLECTION',
    reportingName: 'LATESTWHATSHOT',
    components: [],
  })

function psExperience(alias, views) {
  return {
    data: {
      emsExperienceRetrieve: {
        __typename: 'EMSExperience',
        alias,
        id: 'experience-us',
        views: [
          {
            __typename: 'EMSViewCollection',
            childViews: views,
            reportingName: alias.toUpperCase(),
            type: 'STORE_CAROUSEL',
          },
        ],
      },
    },
  }
}

function psDefaultView(text = 'Promotion') {
  return {
    data: {
      emsDefaultViewRetrieve: {
        __typename: 'EMSViewCollection',
        childViews: [
          psView({
            purpose: 'SIMPLE_TEXT',
            components: [{ __typename: 'EMSTextComponent', text }],
          }),
          psView({
            purpose: 'CATEGORY_GRID',
            components: [{ __typename: 'EMSGridComponent' }],
          }),
        ],
        reportingName: 'INTERNAL_PROMOTION_NAME',
      },
    },
  }
}

function psDealsCampaign({
  categoryId = 'publisher-week',
  label = 'Publisher Week',
  artwork = 'https://image.api.playstation.com/publisher-week.jpg',
  action = 'PUBLISHER_WEEK_PROMO',
  description,
} = {}) {
  return psView({
    purpose: 'COLLECTION',
    reportingName: 'DEALSTOP',
    components: [
      {
        __typename: 'EMSImageComponent',
        altText: label,
        imageUrl: artwork,
        link: psCategoryLink(categoryId),
        telemetryData: {
          contentSource: 'emsBanner',
          interactAction: action,
          interactLink: `EMS_CATEGORY:${categoryId}:cat.gma.${categoryId}`,
        },
      },
      ...(description
        ? [{ __typename: 'EMSTextComponent', text: description }]
        : []),
    ],
  })
}

function psHero({
  categoryId = 'gamescom',
  title = 'Gamescom',
  description = 'Games featured in this promotion.',
  cta = 'Save Now',
  artwork = 'https://image.api.playstation.com/gamescom.jpg',
  linkType = 'EMS_CATEGORY',
} = {}) {
  const link =
    linkType === 'EMS_CATEGORY'
      ? psCategoryLink(categoryId)
      : { __typename: 'EMSLink', target: categoryId, type: linkType }
  return psView({
    purpose: 'HERO',
    reportingName: 'LATESTMUSTSEE',
    components: [
      {
        __typename: 'EMSImageComponent',
        altText: title,
        imageUrl: artwork,
        link,
        priceSourceId: 'must-not-be-followed',
        telemetryData: {
          contentSource: 'emsBanner',
          interactAction: 'CURRENT_WEB_HERO_PROMO',
        },
      },
      { __typename: 'EMSTextComponent', text: title },
      { __typename: 'EMSTextComponent', text: description },
      ...(cta
        ? [
            {
              __typename: 'EMSTextComponent',
              link,
              text: cta,
              telemetryData: { interactCta: cta },
            },
          ]
        : []),
    ],
  })
}

function psFixtureFetch({
  dealsViews = [psDealsNavigation()],
  latestViews = [psLatestNavigation()],
  defaultViews = {},
  blogHtml = '<main>No campaign articles</main>',
  blogArticles = {},
  intercept,
} = {}) {
  const calls = []
  const fetch = async (input, init = {}) => {
    const href = input.toString()
    calls.push({ href, init })
    const intercepted = await intercept?.(href, init)
    if (intercepted) return intercepted

    const url = new URL(href)
    if (`${url.origin}${url.pathname}` === psGraphqlUrl) {
      const operationName = url.searchParams.get('operationName')
      const variables = JSON.parse(url.searchParams.get('variables'))
      if (operationName === 'getExperience') {
        return Response.json(
          psExperience(
            variables.alias,
            variables.alias === 'deals' ? dealsViews : latestViews
          )
        )
      }
      if (operationName === 'getDefaultView') {
        const response = defaultViews[variables.categoryId]
        if (!response) throw new Error(`Unexpected default view: ${variables.categoryId}`)
        return Response.json(response)
      }
      throw new Error(`Unexpected PlayStation operation: ${operationName}`)
    }
    if (href === psBlogUrl) return new Response(blogHtml)
    if (href in blogArticles) return new Response(blogArticles[href])
    throw new Error(`Unexpected URL: ${href}`)
  }
  return { calls, fetch }
}

test('PlayStation uses the exact official persisted GET contract and correlates Deals with Latest', async () => {
  const dealsArtwork = 'https://image.api.playstation.com/deals-gamescom.jpg'
  const latestArtwork = 'https://image.api.playstation.com/latest-gamescom.jpg'
  const fixture = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'gamescom',
        label: 'Promotion',
        artwork: dealsArtwork,
        action: '0826_GAMESCOM_WEB_TOP_DEALS_PROMO',
      }),
      psDealsNavigation(),
    ],
    latestViews: [
      psHero({ categoryId: 'gamescom', artwork: latestArtwork }),
      psLatestNavigation(),
    ],
  })
  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: fixture.fetch,
  })

  const operations = fixture.calls.filter(({ href }) =>
    href.startsWith(`${psGraphqlUrl}?`)
  )
  assert.equal(operations.length, 2)
  assert.deepEqual(
    operations.map(({ href }) => {
      const url = new URL(href)
      return JSON.parse(url.searchParams.get('variables')).alias
    }).sort(),
    ['deals', 'latest']
  )
  for (const { href, init } of operations) {
    const url = new URL(href)
    const headers = new Headers(init.headers)
    assert.equal(init.method, 'GET')
    assert.equal(init.body, undefined)
    assert.equal(url.searchParams.get('operationName'), 'getExperience')
    assert.deepEqual(JSON.parse(url.searchParams.get('extensions')), {
      persistedQuery: { version: 1, sha256Hash: psExperienceHash },
    })
    assert.equal(headers.get('accept'), 'application/json')
    assert.equal(headers.get('content-type'), 'application/json')
    assert.equal(headers.get('accept-language'), 'en-US')
    assert.equal(headers.get('x-apollo-operation-name'), 'getExperience')
    assert.equal(headers.get('apollo-require-preflight'), 'true')
    assert.equal(headers.get('x-psn-store-locale-override'), 'en-us')
  }
  assert.equal(result.coverage, 'partial')
  assert.equal(result.sourceUrl, 'https://store.playstation.com/en-us/pages/deals')
  assert.deepEqual(result.sourceUrls, [
    'https://store.playstation.com/en-us/pages/deals',
    psGraphqlUrl,
    'https://store.playstation.com/en-us/pages/latest',
    psBlogUrl,
  ])
  assert.deepEqual(result.campaigns, [
    {
      sourceUid: psCategoryUrl('gamescom'),
      name: 'Gamescom',
      storeSlug: 'playstation-store',
      state: 'live',
      lifecycleBasis: 'official-source',
      officialUrl: psCategoryUrl('gamescom'),
      sourceUrl: 'https://store.playstation.com/en-us/pages/deals',
      artworkUrl: latestArtwork,
    },
  ])
})

test('PlayStation validates GraphQL errors, malformed EMS and blocked HTTP responses', async () => {
  const graphqlErrors = psFixtureFetch({
    intercept: (href) =>
      href.includes('alias%22%3A%22deals')
        ? Response.json({ errors: [{ message: 'PersistedQueryNotFound' }] })
        : undefined,
  })
  await assert.rejects(
    runPlayStationStoreAdapter({
      now: new Date('2026-08-31T00:00:00Z'),
      fetch: graphqlErrors.fetch,
    }),
    (error) =>
      error.code === 'OFFICIAL_STORE_CONTRACT_UNAVAILABLE' && !error.blocked
  )

  const malformed = psFixtureFetch({
    intercept: (href) =>
      href.includes('alias%22%3A%22deals')
        ? Response.json({ data: { emsExperienceRetrieve: { views: [] } } })
        : undefined,
  })
  await assert.rejects(
    runPlayStationStoreAdapter({
      now: new Date('2026-08-31T00:00:00Z'),
      fetch: malformed.fetch,
    }),
    (error) =>
      error.code === 'OFFICIAL_STORE_CONTRACT_UNAVAILABLE' && !error.blocked
  )

  const blocked = psFixtureFetch({
    intercept: (href) =>
      href.startsWith(psGraphqlUrl)
        ? new Response('Forbidden', { status: 403 })
        : undefined,
  })
  await assert.rejects(
    runPlayStationStoreAdapter({
      now: new Date('2026-08-31T00:00:00Z'),
      fetch: blocked.fetch,
    }),
    (error) => error.code === 'HTTP_403' && error.blocked
  )
})

test('PlayStation distinguishes a valid zero-campaign surface from a broken discovery contract', async () => {
  const valid = psFixtureFetch()
  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: valid.fetch,
  })
  assert.deepEqual(result.campaigns, [])

  const broken = psFixtureFetch({
    intercept: (href) => {
      const url = new URL(href)
      if (url.searchParams.get('operationName') !== 'getExperience') return undefined
      const { alias } = JSON.parse(url.searchParams.get('variables'))
      if (alias !== 'deals') return undefined
      const response = psExperience('deals', [psDealsNavigation()])
      response.data.emsExperienceRetrieve.views[0].reportingName = 'UNKNOWN'
      return Response.json(response)
    },
  })
  await assert.rejects(
    runPlayStationStoreAdapter({
      now: new Date('2026-08-31T00:00:00Z'),
      fetch: broken.fetch,
    }),
    (error) => error.code === 'OFFICIAL_STORE_CONTRACT_UNAVAILABLE'
  )

  const unrelatedDeals = psFixtureFetch({
    dealsViews: [
      psView({
        purpose: 'HERO',
        reportingName: 'DEALSFEAT',
        components: [
          {
            __typename: 'EMSImageComponent',
            altText: 'PlayStation Visa Credit Card',
            link: {
              __typename: 'EMSLink',
              target: 'https://www.playstation.com/en-us/playstation-credit-card/',
              type: 'URI',
            },
            telemetryData: { interactAction: 'CREDIT_CARD_OTHER' },
          },
        ],
      }),
    ],
  })
  await assert.rejects(
    runPlayStationStoreAdapter({
      now: new Date('2026-08-31T00:00:00Z'),
      fetch: unrelatedDeals.fetch,
    }),
    (error) =>
      error.code === 'OFFICIAL_STORE_CONTRACT_UNAVAILABLE' && !error.blocked
  )

  const wrongRegion = psFixtureFetch({
    dealsViews: [
      psView({
        purpose: 'COLLECTION',
        reportingName: 'DEALS_SIEE_EN_GB',
        components: [{ __typename: 'EMSTextComponent', text: 'Deals' }],
      }),
    ],
  })
  await assert.rejects(
    runPlayStationStoreAdapter({
      now: new Date('2026-08-31T00:00:00Z'),
      fetch: wrongRegion.fetch,
    }),
    (error) => error.code === 'OFFICIAL_STORE_CONTRACT_UNAVAILABLE'
  )
})

test('PlayStation excludes permanent navigation, non-Sales and product-level EMS links', async () => {
  const excluded = [
    'All Deals',
    'Free To Play',
    'PlayStation Plus',
    'Add-ons by Game',
    'PlayStation Visa Credit Card',
    'Hardware Sale',
    'Controller Promotion',
    'Merch Sale',
  ]
  for (const label of excluded) {
    const fixture = psFixtureFetch({
      dealsViews: [psDealsCampaign({ label }), psDealsNavigation()],
    })
    const result = await runPlayStationStoreAdapter({
      now: new Date('2026-08-31T00:00:00Z'),
      fetch: fixture.fetch,
    })
    assert.deepEqual(result.campaigns, [], label)
  }

  const concept = psFixtureFetch({
    latestViews: [
      psHero({
        categoryId: 'UP0000-PRODUCT-ID',
        title: 'Individual Game Sale',
        linkType: 'CONCEPT',
      }),
      psLatestNavigation(),
    ],
  })
  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: concept.fetch,
  })
  assert.deepEqual(result.campaigns, [])
  assert.equal(
    concept.calls.some(({ href }) =>
      /(?:\/product\/|\/concept\/|\/catalog\/|category.?grid)/i.test(href)
    ),
    false
  )
})

test('PlayStation separates permanent navigation from mixed digital-game campaigns', async () => {
  const blackFriday = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'black-friday',
        label: 'Black Friday Sale - save on games, consoles and accessories',
        action: 'BLACK_FRIDAY_PROMO',
      }),
      psDealsNavigation(),
    ],
  })
  const blackFridayResult = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: blackFriday.fetch,
  })
  assert.deepEqual(blackFridayResult.campaigns.map(({ name }) => name), [
    'Black Friday Sale - save on games, consoles and accessories',
  ])

  const doubleDiscounts = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'double-discounts',
        label: 'PlayStation Plus Double Discounts Sale',
        description: 'Save on select games and titles with campaign discounts.',
        action: 'PS_PLUS_DOUBLE_DISCOUNTS_PROMO',
      }),
      psDealsNavigation(),
    ],
  })
  const doubleDiscountsResult = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: doubleDiscounts.fetch,
  })
  assert.deepEqual(doubleDiscountsResult.campaigns.map(({ name }) => name), [
    'PlayStation Plus Double Discounts Sale',
  ])
})

test('PlayStation accepts a campaign-level themed promotion but omits an ambiguous internal identity', async () => {
  const publisher = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'publisher-week',
        label: 'Publisher Spotlight',
        action: 'PUBLISHER_WEEK_PROMO',
      }),
      psDealsNavigation(),
    ],
  })
  const published = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: publisher.fetch,
  })
  assert.deepEqual(published.campaigns.map(({ name }) => name), [
    'Publisher Spotlight',
  ])

  const ambiguous = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'ambiguous',
        label: 'Promotion',
        action: 'INTERNAL_FRANCHISE_PROMO',
      }),
      psDealsNavigation(),
    ],
    defaultViews: { ambiguous: psDefaultView('Promotion') },
  })
  const omitted = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: ambiguous.fetch,
  })
  assert.deepEqual(omitted.campaigns, [])
  const defaultCall = ambiguous.calls.find(({ href }) =>
    href.includes('operationName=getDefaultView')
  )
  assert.ok(defaultCall)
  const defaultUrl = new URL(defaultCall.href)
  assert.deepEqual(JSON.parse(defaultUrl.searchParams.get('extensions')), {
    persistedQuery: { version: 1, sha256Hash: psDefaultViewHash },
  })
  assert.deepEqual(JSON.parse(defaultUrl.searchParams.get('variables')), {
    categoryId: 'ambiguous',
    experienceId: 'experience-us',
    localizedKeyId: 'cat.gma.ambiguous',
  })

  const defaultNamed = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'default-named',
        label: 'Promotion',
        action: 'THEMED_PROMO',
      }),
      psDealsNavigation(),
    ],
    defaultViews: {
      'default-named': psDefaultView('Franchise Festival'),
    },
  })
  const named = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: defaultNamed.fetch,
  })
  assert.deepEqual(named.campaigns.map(({ name }) => name), [
    'Franchise Festival',
  ])
})

test('PlayStation applies conservative exact lifecycle rules without reviving history', async () => {
  async function detect(description, now = '2026-09-05T00:00:00Z') {
    const fixture = psFixtureFetch({
      latestViews: [
        psHero({
          categoryId: 'timed-sale',
          title: 'Timed Sale',
          description,
          cta: null,
        }),
        psLatestNavigation(),
      ],
    })
    return runPlayStationStoreAdapter({ now: new Date(now), fetch: fixture.fetch })
  }

  const exact = await detect(
    'The sale starts September 1, 2026 at 10:00 AM UTC and ends September 10, 2026 at 1:00 PM UTC.'
  )
  assert.deepEqual(exact.campaigns[0], {
    sourceUid: psCategoryUrl('timed-sale'),
    name: 'Timed Sale',
    storeSlug: 'playstation-store',
    state: 'live',
    lifecycleBasis: 'exact-time',
    starts: { precision: 'datetime', value: '2026-09-01T10:00:00+00:00' },
    ends: { precision: 'datetime', value: '2026-09-10T13:00:00+00:00' },
    officialUrl: psCategoryUrl('timed-sale'),
    sourceUrl: 'https://store.playstation.com/en-us/pages/latest',
    artworkUrl: 'https://image.api.playstation.com/gamescom.jpg',
  })

  const dateOnlyFixture = psFixtureFetch({
    latestViews: [
      psHero({
        categoryId: 'calendar-sale',
        title: 'Calendar Sale',
        description: 'The sale runs August 31 through September 10, 2026.',
      }),
      psLatestNavigation(),
    ],
  })
  const dateOnly = await runPlayStationStoreAdapter({
    now: new Date('2026-09-05T00:00:00Z'),
    fetch: dateOnlyFixture.fetch,
  })
  assert.deepEqual(dateOnly.campaigns[0].starts, {
    precision: 'date',
    value: '2026-08-31',
  })
  assert.deepEqual(dateOnly.campaigns[0].ends, {
    precision: 'date',
    value: '2026-09-10',
  })
  assert.equal(dateOnly.campaigns[0].lifecycleBasis, 'official-source')

  const futureDateOnlyFixture = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'future-calendar-sale',
        label: 'Future Calendar Sale',
        description: 'The sale runs September 10 through September 20, 2026.',
      }),
      psDealsNavigation(),
    ],
  })
  const futureDateOnly = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T12:00:00Z'),
    fetch: futureDateOnlyFixture.fetch,
  })
  assert.equal(futureDateOnly.campaigns[0].state, 'upcoming')
  assert.deepEqual(futureDateOnly.campaigns[0].starts, {
    precision: 'date',
    value: '2026-09-10',
  })
  assert.deepEqual(futureDateOnly.campaigns[0].ends, {
    precision: 'date',
    value: '2026-09-20',
  })

  assert.deepEqual(
    (
      await detect('The sale ends September 10, 2026 at 1:00 PM UTC.')
    ).campaigns,
    []
  )
  assert.equal(
    (
      await detect(
        'The sale starts September 10, 2026 at 1:00 PM UTC.',
        '2026-09-05T00:00:00Z'
      )
    ).campaigns[0].state,
    'upcoming'
  )
  assert.deepEqual(
    (
      await detect(
        'The sale starts September 1, 2026 at 10:00 AM UTC.',
        '2026-09-05T00:00:00Z'
      )
    ).campaigns,
    []
  )
  assert.deepEqual(
    (
      await detect(
        'The sale starts July 1, 2026 at 10:00 AM UTC and ends July 10, 2026 at 1:00 PM UTC. The sale is live now.'
      )
    ).campaigns,
    []
  )
})

test('PlayStation Blog adds only qualifying upcoming campaigns and deduplicates Store categories', async () => {
  const validArticle =
    'https://blog.playstation.com/2026/08/31/holiday-sale-coming-soon/'
  const singleGameArticle =
    'https://blog.playstation.com/2026/08/31/individual-game-sale/'
  const sharedCategory = 'holiday-sale'
  const fixture = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: sharedCategory,
        label: 'Holiday Sale',
        action: 'HOLIDAY_SALE_PROMO',
      }),
      psDealsNavigation(),
    ],
    blogHtml: `
      <a href="${validArticle}">Holiday Sale coming soon</a>
      <a href="${singleGameArticle}">Individual Game Sale</a>
    `,
    blogArticles: {
      [validArticle]: `
        <meta property="og:title" content="Holiday Sale">
        <meta property="og:image" content="https://blog.playstation.com/holiday.jpg">
        <p>The PlayStation Store Holiday Sale is live now with games and discounts.</p>
        <a href="${psCategoryUrl(sharedCategory)}">Shop the sale</a>
      `,
      [singleGameArticle]: `
        <meta property="og:title" content="Individual Game Sale">
        <p>This PlayStation Store single-game discount is coming soon.</p>
      `,
    },
  })
  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: fixture.fetch,
  })
  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].sourceUid, psCategoryUrl(sharedCategory))
  assert.equal(result.campaigns[0].state, 'live')

  const upcomingFixture = psFixtureFetch({
    blogHtml: `<a href="${validArticle}">Holiday Sale coming soon</a>`,
    blogArticles: {
      [validArticle]: `
        <meta property="og:title" content="Holiday Sale">
        <meta property="og:image" content="https://blog.playstation.com/holiday.jpg">
        <p>The PlayStation Store Holiday Sale starts September 2, 2026 at 10:00 AM UTC with games and discounts.</p>
      `,
    },
  })
  const upcoming = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: upcomingFixture.fetch,
  })
  assert.deepEqual(
    upcoming.campaigns.map(({ name, state, starts, artworkUrl }) => ({
      name,
      state,
      starts,
      artworkUrl,
    })),
    [
      {
        name: 'Holiday Sale',
        state: 'upcoming',
        starts: {
          precision: 'datetime',
          value: '2026-09-02T10:00:00+00:00',
        },
        artworkUrl: 'https://blog.playstation.com/holiday.jpg',
      },
    ]
  )
})

test('PlayStation Blog campaign-page links deduplicate one exact Store public name', async () => {
  const categoryUrl = psCategoryUrl('summer-category')
  const pageUrls = [
    'https://store.playstation.com/en-us/pages/SummerSale2026',
    'https://store.playstation.com/pages/SummerSale2026',
  ]

  for (const [index, pageUrl] of pageUrls.entries()) {
    const article = `https://blog.playstation.com/2026/08/31/summer-sale-page-${index}/`
    const fixture = psFixtureFetch({
      dealsViews: [
        psDealsCampaign({
          categoryId: 'summer-category',
          label: 'Summer Sale 2026',
          action: 'SUMMER_SALE_2026_PROMO',
        }),
        psDealsNavigation(),
      ],
      blogHtml: `<a href="${article}">Summer Sale 2026</a>`,
      blogArticles: {
        [article]: `
          <meta property="og:title" content="Summer Sale 2026">
          <article class="post-single">
            <p>The Summer Sale 2026 promotion is live now with select games and titles.</p>
            <a href="${pageUrl}">Shop the campaign</a>
          </article>
        `,
      },
    })
    const result = await runPlayStationStoreAdapter({
      now: new Date('2026-08-31T00:00:00Z'),
      fetch: fixture.fetch,
    })

    assert.equal(result.campaigns.length, 1, pageUrl)
    assert.equal(result.campaigns[0].sourceUid, categoryUrl, pageUrl)
    assert.equal(result.campaigns[0].officialUrl, categoryUrl, pageUrl)
    assert.equal(
      fixture.calls.some(({ href }) =>
        /(?:\/product\/|\/concept\/|\/catalog\/|category.?grid)/i.test(href)
      ),
      false,
      pageUrl
    )
  }

  const conflictingArticle =
    'https://blog.playstation.com/2026/08/31/summer-sale-conflicting-state/'
  const conflicting = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'summer-category',
        label: 'Summer Sale 2026',
        action: 'SUMMER_SALE_2026_PROMO',
      }),
      psDealsNavigation(),
    ],
    blogHtml: `<a href="${conflictingArticle}">Summer Sale 2026</a>`,
    blogArticles: {
      [conflictingArticle]: `
        <meta property="og:title" content="Summer Sale 2026">
        <article class="post-single">
          <p>The Summer Sale 2026 promotion starts September 10, 2026 at 10 AM UTC with select games and titles.</p>
          <a href="${pageUrls[0]}">Shop the campaign</a>
        </article>
      `,
    },
  })
  const conflictingResult = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: conflicting.fetch,
  })
  assert.equal(conflictingResult.campaigns.length, 1)
  assert.equal(conflictingResult.campaigns[0].sourceUid, categoryUrl)
  assert.equal(conflictingResult.campaigns[0].state, 'live')
  assert.equal(conflictingResult.campaigns[0].starts, undefined)
})

test('PlayStation Blog campaign-page name fallback rejects year mismatches and ambiguous Store names', async () => {
  const wrongYearArticle =
    'https://blog.playstation.com/2026/08/31/summer-sale-2025-page/'
  const wrongYear = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'summer-2026',
        label: 'Summer Sale 2026',
        action: 'SUMMER_2026_PROMO',
      }),
      psDealsNavigation(),
    ],
    blogHtml: `<a href="${wrongYearArticle}">Summer Sale 2025</a>`,
    blogArticles: {
      [wrongYearArticle]: `
        <meta property="og:title" content="Summer Sale 2025">
        <article class="post-single">
          <p>The Summer Sale 2025 promotion is live now with select games and titles.</p>
          <a href="https://store.playstation.com/en-us/pages/SummerSale2025">Shop the campaign</a>
        </article>
      `,
    },
  })
  const wrongYearResult = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: wrongYear.fetch,
  })
  assert.equal(wrongYearResult.campaigns.length, 2)
  assert.deepEqual(
    wrongYearResult.campaigns.map(({ sourceUid }) => sourceUid),
    [psCategoryUrl('summer-2026'), wrongYearArticle]
  )

  const ambiguousArticle =
    'https://blog.playstation.com/2026/08/31/shared-summer-sale-page/'
  const ambiguous = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'shared-summer-a',
        label: 'Shared Summer Sale',
        action: 'SHARED_SUMMER_A_PROMO',
      }),
      psDealsCampaign({
        categoryId: 'shared-summer-b',
        label: 'Shared Summer Sale',
        action: 'SHARED_SUMMER_B_PROMO',
      }),
      psDealsNavigation(),
    ],
    blogHtml: `<a href="${ambiguousArticle}">Shared Summer Sale</a>`,
    blogArticles: {
      [ambiguousArticle]: `
        <meta property="og:title" content="Shared Summer Sale">
        <article class="post-single">
          <p>The Shared Summer Sale is live now with select games and titles.</p>
          <a href="https://store.playstation.com/en-us/pages/SharedSummerSale">Shop the campaign</a>
        </article>
      `,
    },
  })
  const ambiguousResult = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: ambiguous.fetch,
  })
  assert.equal(ambiguousResult.campaigns.length, 3)
  assert.equal(
    ambiguousResult.campaigns.some(({ sourceUid }) => sourceUid === ambiguousArticle),
    true
  )
})

test('PlayStation Blog name fallback requires a non-navigation Store campaign-page link', async () => {
  const standaloneArticle =
    'https://blog.playstation.com/2026/08/31/autumn-festival-blog-only/'
  const standalone = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'autumn-store',
        label: 'Autumn Festival',
        action: 'AUTUMN_FESTIVAL_PROMO',
      }),
      psDealsNavigation(),
    ],
    blogHtml: `<a href="${standaloneArticle}">Autumn Festival</a>`,
    blogArticles: {
      [standaloneArticle]: `
        <meta property="og:title" content="Autumn Festival">
        <article class="post-single">
          <p>The PlayStation Store Autumn Festival promotion is live now with select games and titles.</p>
        </article>
      `,
    },
  })
  const standaloneResult = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: standalone.fetch,
  })
  assert.equal(standaloneResult.campaigns.length, 2)
  assert.equal(
    standaloneResult.campaigns.some(({ sourceUid }) => sourceUid === standaloneArticle),
    true
  )

  for (const slug of ['latest', 'deals', 'collections']) {
    const article = `https://blog.playstation.com/2026/08/31/generic-${slug}-page/`
    const generic = psFixtureFetch({
      blogHtml: `<a href="${article}">Generic Page Sale</a>`,
      blogArticles: {
        [article]: `
          <meta property="og:title" content="Generic Page Sale">
          <article class="post-single">
            <p>The Generic Page Sale is live now with select games and titles.</p>
            <a href="https://store.playstation.com/en-us/pages/${slug}">Shop now</a>
          </article>
        `,
      },
    })
    const genericResult = await runPlayStationStoreAdapter({
      now: new Date('2026-08-31T00:00:00Z'),
      fetch: generic.fetch,
    })
    assert.deepEqual(genericResult.campaigns, [], slug)
  }
})

test('PlayStation Blog discovers dated articles before strict campaign-level classification', async () => {
  const daysOfPlay =
    'https://blog.playstation.com/2026/08/31/days-of-play-2026/'
  const astroBot =
    'https://blog.playstation.com/2026/08/31/astro-bot-sale/'
  const doubleDiscounts =
    'https://blog.playstation.com/2026/08/31/playstation-plus-double-discounts/'
  const monthlyGames =
    'https://blog.playstation.com/2026/08/31/ps-plus-monthly-games/'
  const blackFriday =
    'https://blog.playstation.com/2026/08/31/black-friday-2026/'
  const ambiguous =
    'https://blog.playstation.com/2026/08/31/ambiguous-promotion/'
  const fixture = psFixtureFetch({
    blogHtml: `
      <a href="${daysOfPlay}">Days of Play 2026</a>
      <a href="${astroBot}">Astro Bot Sale</a>
      <a href="${doubleDiscounts}">PlayStation Plus Double Discounts</a>
      <a href="${monthlyGames}">PS Plus Monthly Games</a>
      <a href="${blackFriday}">Black Friday 2026</a>
      <a href="${ambiguous}">Official promotion</a>
    `,
    blogArticles: {
      [daysOfPlay]: `
        <meta property="og:title" content="Days of Play 2026">
        <p>The Days of Play 2026 PlayStation Store promotion is coming soon with select games and titles.</p>
      `,
      [astroBot]: `
        <meta property="og:title" content="Astro Bot Sale">
        <p>PlayStation Store offers Astro Bot at 30% off.</p>
      `,
      [doubleDiscounts]: `
        <meta property="og:title" content="PlayStation Plus Double Discounts">
        <p>The PlayStation Plus Double Discounts PlayStation Store promotion is live now with multiple games discounted.</p>
      `,
      [monthlyGames]: `
        <meta property="og:title" content="PS Plus Monthly Games">
        <p>The PlayStation Store PS Plus Monthly Games are available now.</p>
      `,
      [blackFriday]: `
        <meta property="og:title" content="Black Friday 2026">
        <p>The Black Friday 2026 PlayStation Store promotion is live now with select games discounted, alongside consoles and accessories.</p>
      `,
      [ambiguous]: `
        <meta property="og:title" content="Promotion">
        <p>The PlayStation Store promotion is live now with select games discounted.</p>
      `,
    },
  })
  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: fixture.fetch,
  })

  assert.deepEqual(
    result.campaigns.map(({ name, state }) => ({ name, state })),
    [
      { name: 'Days of Play 2026', state: 'upcoming' },
      { name: 'PlayStation Plus Double Discounts', state: 'live' },
      { name: 'Black Friday 2026', state: 'live' },
    ]
  )
  assert.equal(
    fixture.calls.filter(({ href }) => href.startsWith('https://blog.playstation.com/2026/')).length,
    6
  )
})

test('PlayStation Blog accepts list breadth only when the list is introduced as campaign games', async () => {
  const singleGame =
    'https://blog.playstation.com/2026/08/31/astro-bot-editions-sale/'
  const publisher =
    'https://blog.playstation.com/2026/08/31/publisher-sale-games/'
  const oneGame =
    'https://blog.playstation.com/2026/08/31/publisher-sale-one-game/'
  const editorial =
    'https://blog.playstation.com/2026/08/31/editorial-sale-bullets/'
  const fixture = psFixtureFetch({
    blogHtml: `
      <a href="${singleGame}">Astro Bot Sale</a>
      <a href="${publisher}">Publisher Sale</a>
      <a href="${oneGame}">One Game Sale</a>
      <a href="${editorial}">Editorial Sale</a>
    `,
    blogArticles: {
      [singleGame]: `
        <meta property="og:title" content="Astro Bot Sale">
        <article class="post-single">
          <p>The Astro Bot Sale is live now on PlayStation Store with Astro Bot at 30% off.</p>
          <ul>
            <li>Standard Edition</li>
            <li>Digital Deluxe Edition</li>
            <li>Bonus Content</li>
          </ul>
        </article>
        <footer>
          <p>The sale includes the following games:</p>
          <ul><li>Nav Game A</li><li>Nav Game B</li><li>Nav Game C</li></ul>
        </footer>
      `,
      [publisher]: `
        <meta property="og:title" content="Publisher Sale">
        <article>
          <p>The PlayStation Store Publisher Sale is live now.</p>
          <p>The sale includes the following games:</p>
          <ul><li>Game A</li><li>Game B</li></ul>
        </article>
      `,
      [oneGame]: `
        <meta property="og:title" content="One Game Sale">
        <article>
          <p>The PlayStation Store One Game Sale is live now.</p>
          <p>The sale includes the following game:</p>
          <ul><li>Game A</li></ul>
        </article>
      `,
      [editorial]: `
        <meta property="og:title" content="Editorial Sale">
        <article>
          <p>The Editorial Sale is live now on PlayStation Store with Astro Bot at 30% off.</p>
          <p>Article highlights:</p>
          <ul>
            <li>Developer interview</li>
            <li>Accessibility features</li>
            <li>Launch trailer</li>
          </ul>
        </article>
      `,
    },
  })

  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: fixture.fetch,
  })

  assert.deepEqual(result.campaigns.map(({ name }) => name), ['Publisher Sale'])
})

test('PlayStation Blog timing ignores historical promotions and dates from other events', async () => {
  const article =
    'https://blog.playstation.com/2026/08/31/holiday-campaign-preview/'
  const fixture = psFixtureFetch({
    blogHtml: `<a href="${article}">Holiday campaign preview</a>`,
    blogArticles: {
      [article]: `
        <meta property="og:title" content="Holiday Sale">
        <p>The PlayStation Store Holiday Sale is coming soon with select games and titles.</p>
        <p>Last year's promotion ran July 1 through July 10, 2025.</p>
        <p>The Gamescom event begins September 5, 2026 at 10:00 AM UTC.</p>
      `,
    },
  })
  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: fixture.fetch,
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].name, 'Holiday Sale')
  assert.equal(result.campaigns[0].state, 'upcoming')
  assert.equal(result.campaigns[0].starts, undefined)
  assert.equal(result.campaigns[0].ends, undefined)
})

test('PlayStation Blog timing matches campaign names by words instead of weak substrings', async () => {
  const daysOfPlay =
    'https://blog.playstation.com/2026/08/31/days-of-play-timing/'
  const blackFriday =
    'https://blog.playstation.com/2026/08/31/black-friday-timing/'
  const fixture = psFixtureFetch({
    blogHtml: `
      <a href="${daysOfPlay}">Days of Play 2026</a>
      <a href="${blackFriday}">Black Friday 2026</a>
    `,
    blogArticles: {
      [daysOfPlay]: `
        <meta property="og:title" content="Days of Play 2026">
        <article class="post-single">
          <p>The PlayStation Store promotion includes select games and titles.</p>
          <p>Days of Play 2025 promotion starts June 1, 2025 at 10 AM UTC and ends June 12, 2025 at 10 AM UTC.</p>
          <p>The Summer Sale starts September 5, 2026 at 10 AM UTC and features new gameplay.</p>
          <p>Days of Play 2026 is coming soon.</p>
        </article>
      `,
      [blackFriday]: `
        <meta property="og:title" content="Black Friday 2026">
        <article class="post-single">
          <p>The PlayStation Store promotion includes select games and titles.</p>
          <p>Black Friday 2025 promotion starts November 20, 2025 at 10 AM UTC.</p>
          <p>The Friday gameplay event starts September 5, 2026 at 10 AM UTC.</p>
          <p>Black Friday 2026 is coming soon.</p>
        </article>
      `,
    },
  })

  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: fixture.fetch,
  })
  const byName = new Map(result.campaigns.map((entry) => [entry.name, entry]))

  assert.equal(byName.get('Days of Play 2026').state, 'upcoming')
  assert.equal(byName.get('Days of Play 2026').starts, undefined)
  assert.equal(byName.get('Black Friday 2026').state, 'upcoming')
  assert.equal(byName.get('Black Friday 2026').starts, undefined)

  const exactDaysOfPlay =
    'https://blog.playstation.com/2026/08/31/days-of-play-exact-timing/'
  const exactFixture = psFixtureFetch({
    blogHtml: `<a href="${exactDaysOfPlay}">Days of Play 2026</a>`,
    blogArticles: {
      [exactDaysOfPlay]: `
        <meta property="og:title" content="Days of Play 2026">
        <article class="post-single">
          <p>The PlayStation Store promotion includes select games and titles.</p>
          <p>The Days of Play 2026 promotion starts September 10, 2026 at 10 AM UTC.</p>
        </article>
      `,
    },
  })
  const exactResult = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: exactFixture.fetch,
  })
  assert.deepEqual(exactResult.campaigns[0].starts, {
    precision: 'datetime',
    value: '2026-09-10T10:00:00+00:00',
  })
})

test('PlayStation Store timing remains authoritative while Blog only enriches compatible fields', async () => {
  const exactArticle =
    'https://blog.playstation.com/2026/09/05/exact-merge-sale/'
  const exactFixture = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'exact-merge',
        label: 'Exact Merge Sale',
        description:
          'The Exact Merge Sale starts September 1, 2026 at 10:00 AM UTC and ends September 10, 2026 at 1:00 PM UTC.',
      }),
      psDealsNavigation(),
    ],
    blogHtml: `<a href="${exactArticle}">Exact Merge Sale</a>`,
    blogArticles: {
      [exactArticle]: `
        <meta property="og:title" content="Exact Merge Sale">
        <p>The PlayStation Store Exact Merge Sale is live now with select games and titles.</p>
        <p>The Exact Merge Sale ends September 9, 2026 at 5:00 PM UTC.</p>
        <a href="${psCategoryUrl('exact-merge')}">Shop the sale</a>
      `,
    },
  })
  const exact = await runPlayStationStoreAdapter({
    now: new Date('2026-09-05T00:00:00Z'),
    fetch: exactFixture.fetch,
  })
  assert.deepEqual(exact.campaigns[0].starts, {
    precision: 'datetime',
    value: '2026-09-01T10:00:00+00:00',
  })
  assert.deepEqual(exact.campaigns[0].ends, {
    precision: 'datetime',
    value: '2026-09-10T13:00:00+00:00',
  })
  assert.equal(exact.campaigns[0].lifecycleBasis, 'exact-time')

  const endOnlyArticle =
    'https://blog.playstation.com/2026/09/05/end-only-merge-sale/'
  const endOnlyFixture = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'end-only-merge',
        label: 'End Only Merge Sale',
      }),
      psDealsNavigation(),
    ],
    blogHtml: `<a href="${endOnlyArticle}">End Only Merge Sale</a>`,
    blogArticles: {
      [endOnlyArticle]: `
        <meta property="og:title" content="End Only Merge Sale">
        <p>The PlayStation Store End Only Merge Sale is live now with select games and titles.</p>
        <p>The End Only Merge Sale ends September 10, 2026 at 1:00 PM UTC.</p>
        <a href="${psCategoryUrl('end-only-merge')}">Shop the sale</a>
      `,
    },
  })
  const endOnly = await runPlayStationStoreAdapter({
    now: new Date('2026-09-05T00:00:00Z'),
    fetch: endOnlyFixture.fetch,
  })
  assert.equal(endOnly.campaigns[0].starts, undefined)
  assert.deepEqual(endOnly.campaigns[0].ends, {
    precision: 'datetime',
    value: '2026-09-10T13:00:00+00:00',
  })
  assert.equal(endOnly.campaigns[0].lifecycleBasis, 'official-source')

  const dateArticle =
    'https://blog.playstation.com/2026/08/31/date-merge-sale/'
  const dateFixture = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({
        categoryId: 'date-merge',
        label: 'Date Merge Sale',
        description:
          'The Date Merge Sale starts September 10, 2026 at 1:00 PM UTC.',
      }),
      psDealsNavigation(),
    ],
    blogHtml: `<a href="${dateArticle}">Date Merge Sale</a>`,
    blogArticles: {
      [dateArticle]: `
        <meta property="og:title" content="Date Merge Sale">
        <p>The PlayStation Store Date Merge Sale runs September 10 through September 20, 2026 with select games and titles.</p>
        <a href="${psCategoryUrl('date-merge')}">Shop the sale</a>
      `,
    },
  })
  const dateMerge = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: dateFixture.fetch,
  })
  assert.deepEqual(dateMerge.campaigns[0].starts, {
    precision: 'datetime',
    value: '2026-09-10T13:00:00+00:00',
  })
  assert.deepEqual(dateMerge.campaigns[0].ends, {
    precision: 'date',
    value: '2026-09-20',
  })
})

test('PlayStation partial absence and complementary Blog failure preserve known campaigns', async () => {
  const knownCategory = psCategoryUrl('known-sale')
  const knownCampaign = {
    campaignKey: 'playstation-known-sale',
    sourceUid: knownCategory,
    name: 'Known Sale',
    state: 'live',
    officialUrl: knownCategory,
    sourceUrl: 'https://store.playstation.com/en-us/pages/deals',
  }
  const fixture = psFixtureFetch({
    dealsViews: [
      psDealsCampaign({ categoryId: 'current-sale', label: 'Current Sale' }),
      psDealsNavigation(),
    ],
    intercept: (href) =>
      href === psBlogUrl ? new Response('Unavailable', { status: 503 }) : undefined,
  })
  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [knownCampaign],
    fetch: fixture.fetch,
  })
  assert.deepEqual(result.campaigns.map(({ name }) => name), ['Current Sale'])
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
  assert.deepEqual(
    campaignKeysToEnd({
      sourceSucceeded: true,
      coverage: result.coverage,
      activeCampaigns: [
        active({
          campaign_key: knownCampaign.campaignKey,
          source_uid: knownCampaign.sourceUid,
        }),
      ],
      detectedCampaigns: result.campaigns,
      explicitlyEndedSourceUids: result.explicitlyEndedSourceUids,
      now: new Date('2026-08-31T00:00:00Z'),
    }),
    []
  )
})

test('PlayStation can explicitly end a known campaign from its persisted exact end', async () => {
  const knownCategory = psCategoryUrl('finished-sale')
  const fixture = psFixtureFetch()
  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [
      {
        campaignKey: 'playstation-finished-sale',
        sourceUid: knownCategory,
        name: 'Finished Sale',
        state: 'live',
        officialUrl: knownCategory,
        sourceUrl: 'https://store.playstation.com/en-us/pages/deals',
        endsAt: '2026-08-30T23:59:00Z',
      },
    ],
    fetch: fixture.fetch,
  })
  assert.deepEqual(result.explicitlyEndedSourceUids, [knownCategory])
  assert.equal(
    fixture.calls.some(({ href }) =>
      /(?:\/product\/|\/concept\/|\/catalog\/|category.?grid)/i.test(href)
    ),
    false
  )
})

test('PlayStation current detection overrides stale exact and historical Blog endings', async () => {
  const categoryId = 'current-wins'
  const categoryUrl = psCategoryUrl(categoryId)
  const knownCampaign = {
    campaignKey: 'playstation-current-wins',
    sourceUid: categoryUrl,
    name: 'Current Wins Sale',
    state: 'live',
    officialUrl: categoryUrl,
    sourceUrl: 'https://store.playstation.com/en-us/pages/deals',
  }
  const currentViews = [
    psDealsCampaign({
      categoryId,
      label: 'Current Wins Sale',
      action: 'CURRENT_WINS_PROMO',
    }),
    psDealsNavigation(),
  ]

  const staleExactFixture = psFixtureFetch({ dealsViews: currentViews })
  const staleExact = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [
      { ...knownCampaign, endsAt: '2026-08-30T23:59:00Z' },
    ],
    fetch: staleExactFixture.fetch,
  })
  assert.equal(staleExact.campaigns[0].sourceUid, categoryUrl)
  assert.equal(staleExact.campaigns[0].state, 'live')
  assert.deepEqual(staleExact.explicitlyEndedSourceUids, [])

  const historicArticle =
    'https://blog.playstation.com/2026/08/20/current-wins-sale-ended/'
  const historicBlogFixture = psFixtureFetch({
    dealsViews: currentViews,
    blogHtml: `<a href="${historicArticle}">Current Wins Sale</a>`,
    blogArticles: {
      [historicArticle]: `
        <meta property="og:title" content="Current Wins Sale">
        <article class="post-single">
          <p>The PlayStation Store Current Wins Sale includes select games and titles.</p>
          <p>The Current Wins Sale starts August 1, 2026 at 10 AM UTC and ends August 20, 2026 at 10 AM UTC.</p>
          <a href="${categoryUrl}">Shop the sale</a>
        </article>
      `,
    },
  })
  const historicBlog = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [knownCampaign],
    fetch: historicBlogFixture.fetch,
  })
  assert.equal(historicBlog.campaigns[0].sourceUid, categoryUrl)
  assert.equal(historicBlog.campaigns[0].state, 'live')
  assert.deepEqual(historicBlog.explicitlyEndedSourceUids, [])
})

test('PlayStation anchors known Blog endings to the persisted campaign identity', async () => {
  const otherEnded =
    'https://blog.playstation.com/2026/08/01/holiday-sale-continues/'
  const knownEnded =
    'https://blog.playstation.com/2026/08/02/holiday-sale-ended/'
  const referentEnded =
    'https://blog.playstation.com/2026/08/03/holiday-sale-referent-ended/'
  const failed =
    'https://blog.playstation.com/2026/08/04/holiday-sale-unavailable/'
  const fixture = psFixtureFetch({
    blogArticles: {
      [otherEnded]: `
        <meta property="og:title" content="Holiday Sale">
        <article class="post-single">
          <p>The Summer Sale has ended. Holiday Sale continues with select games.</p>
        </article>
      `,
      [knownEnded]: `
        <meta property="og:title" content="Holiday Sale">
        <article class="post-single"><p>The Holiday Sale has now ended.</p></article>
      `,
      [referentEnded]: `
        <meta property="og:title" content="Holiday Sale">
        <article class="post-single"><p>This sale has now ended.</p></article>
      `,
    },
    intercept: (href) =>
      href === failed ? new Response('Unavailable', { status: 503 }) : undefined,
  })
  const knownCampaigns = [otherEnded, knownEnded, referentEnded, failed].map(
    (articleUrl) => ({
      campaignKey: `playstation-${new URL(articleUrl).pathname.split('/').at(-2)}`,
      sourceUid: articleUrl,
      name: 'Holiday Sale',
      state: 'live',
      officialUrl: articleUrl,
      sourceUrl: articleUrl,
    })
  )
  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns,
    fetch: fixture.fetch,
  })
  assert.deepEqual(result.explicitlyEndedSourceUids, [
    knownEnded,
    referentEnded,
  ])
  for (const articleUrl of [otherEnded, knownEnded, referentEnded, failed]) {
    assert.equal(
      fixture.calls.filter(({ href }) => href === articleUrl).length,
      1,
      articleUrl
    )
  }
})

test('PlayStation known Blog endings require matching recurring-campaign years', async () => {
  const wrongYear =
    'https://blog.playstation.com/2026/08/05/days-of-play-wrong-year/'
  const wrongIdentityYear =
    'https://blog.playstation.com/2026/08/06/days-of-play-wrong-identity-year/'
  const matchingYear =
    'https://blog.playstation.com/2026/08/07/days-of-play-matching-year/'
  const fixture = psFixtureFetch({
    blogArticles: {
      [wrongYear]: `
        <meta property="og:title" content="Days of Play 2026">
        <article class="post-single">
          <p>Days of Play 2025 has ended. Days of Play 2026 continues.</p>
        </article>
      `,
      [wrongIdentityYear]: `
        <meta property="og:title" content="Days of Play 2025">
        <article class="post-single"><p>This sale has ended.</p></article>
      `,
      [matchingYear]: `
        <meta property="og:title" content="Days of Play 2026">
        <article class="post-single"><p>Days of Play 2026 has ended.</p></article>
      `,
    },
  })
  const knownCampaigns = [wrongYear, wrongIdentityYear, matchingYear].map(
    (articleUrl) => ({
      campaignKey: `playstation-${new URL(articleUrl).pathname.split('/').at(-2)}`,
      sourceUid: articleUrl,
      name: 'Days of Play 2026',
      state: 'live',
      officialUrl: articleUrl,
      sourceUrl: articleUrl,
    })
  )

  const result = await runPlayStationStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns,
    fetch: fixture.fetch,
  })

  assert.deepEqual(result.explicitlyEndedSourceUids, [matchingYear])
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

test('Epic parses the exact US SSR source and detects Deals of the Week without product traversal', async () => {
  const calls = []
  const modules = [
    epicDealsOfTheWeek(),
    {
      __typename: 'StorefrontBreaker',
      type: 'breaker',
      title: 'Sonic Racing: CrossWorlds',
      description: 'Save on one game.',
      offer: { namespace: 'sonic', id: 'sonic-offer' },
      link: { src: '/p/sonic-racing-crossworlds', linkText: 'Buy now' },
    },
    {
      __typename: 'StorefrontBreaker',
      type: 'breaker',
      title: 'Dead by Daylight',
      description: 'Individual discount.',
      offer: { namespace: 'dbd', id: 'dbd-offer' },
      link: { src: '/p/dead-by-daylight', linkText: 'Buy now' },
    },
    {
      __typename: 'StorefrontCardGroup',
      type: 'cardGroup',
      title: 'Current Sales & Specials',
      offers: [
        { id: 'one', price: { discount: 50 } },
        { id: 'two', price: { discount: 30 } },
      ],
    },
    {
      __typename: 'StorefrontBreaker',
      title: 'Free Games',
      description: 'Claim free games this week.',
      link: { href: '/free-games' },
    },
    {
      __typename: 'StorefrontBreaker',
      title: 'Epic Hardware Sale',
      description: 'Save on controllers and headsets.',
      link: { href: '/browse?tag=hardware' },
    },
  ]
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: async (input) => {
      calls.push(input.toString())
      assert.equal(input.toString(), epicSalesUrl)
      return new Response(epicMain(modules))
    },
  })

  assert.deepEqual(calls, [epicSalesUrl])
  assert.equal(result.sourceUrl, epicSalesUrl)
  assert.deepEqual(result.sourceUrls, [epicSalesUrl])
  assert.equal(result.coverage, 'partial')
  assert.equal(result.campaigns.length, 1)
  assert.deepEqual(result.campaigns[0], {
    sourceUid: 'epic-storefront:deals-of-the-week',
    name: 'Deals of the Week',
    storeSlug: 'epic-games-store',
    state: 'live',
    lifecycleBasis: 'official-source',
    officialUrl: epicDealsUrl,
    sourceUrl: epicSalesUrl,
    artworkUrl: 'https://cdn1.epicgames.com/deals-of-the-week.jpg',
  })
  assert.equal(
    calls.some((url) =>
      /(?:\/news\/|egs-platform-service|\/browse|\/p\/|catalog|offer|price)/i.test(
        url.replace(epicSalesUrl, '')
      )
    ),
    false
  )
})

test('Epic accepts a recognized Sales & Specials layout with zero campaigns', async () => {
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: async () => new Response(epicMain()),
  })

  assert.deepEqual(result.campaigns, [])
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
})

test('Epic preserves a named primary campaign when landing enrichment fails', async () => {
  const campaignUrl = `${epicSalesUrl}/publisher-sale`
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      if (url === epicSalesUrl) {
        return new Response(
          epicMain([
            {
              __typename: 'StorefrontBreaker',
              type: 'breaker',
              title: 'Publisher Sale',
              description: 'Save on a selection of games.',
              link: { src: campaignUrl, linkText: 'Browse' },
            },
          ])
        )
      }
      if (url === campaignUrl) return new Response('Unavailable', { status: 503 })
      throw new Error(`Unexpected Epic URL: ${url}`)
    },
  })

  assert.deepEqual(result.campaigns, [
    {
      sourceUid: 'epic-storefront:publisher%20sale',
      name: 'Publisher Sale',
      storeSlug: 'epic-games-store',
      state: 'live',
      lifecycleBasis: 'official-source',
      officialUrl: campaignUrl,
      sourceUrl: epicSalesUrl,
    },
  ])
})

test('Epic omits a landing-dependent candidate when enrichment fails without a safe public name', async () => {
  const campaignUrl = `${epicSalesUrl}/unnamed-campaign`
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      if (url === epicSalesUrl) {
        return new Response(
          epicMain([
            {
              __typename: 'StorefrontBreaker',
              type: 'breaker',
              description: 'Save on a selection of games during our sale.',
              link: { src: campaignUrl, linkText: 'Browse' },
            },
          ])
        )
      }
      if (url === campaignUrl) return new Response('Unavailable', { status: 503 })
      throw new Error(`Unexpected Epic URL: ${url}`)
    },
  })

  assert.deepEqual(result.campaigns, [])
})

test('Epic keeps the primary identity when a valid landing names a different ended campaign', async () => {
  const campaignUrl = `${epicSalesUrl}/publisher-sale`
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      if (url === epicSalesUrl) {
        return new Response(
          epicMain([
            {
              __typename: 'StorefrontBreaker',
              title: 'Publisher Sale',
              description: 'Save on a selection of games.',
              link: { src: campaignUrl },
            },
          ])
        )
      }
      if (url === campaignUrl) {
        return new Response(
          epicLanding('publisher-sale', {
            title: 'Summer Sale',
            description: 'Summer Sale has ended, but more deals await.',
          })
        )
      }
      throw new Error(`Unexpected Epic URL: ${url}`)
    },
  })

  assert.deepEqual(result.campaigns, [
    {
      sourceUid: 'epic-storefront:publisher%20sale',
      name: 'Publisher Sale',
      storeSlug: 'epic-games-store',
      state: 'live',
      lifecycleBasis: 'official-source',
      officialUrl: campaignUrl,
      sourceUrl: epicSalesUrl,
    },
  ])
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
})

test('Epic still enriches a current campaign from an exact-name landing', async () => {
  const campaignUrl = `${epicSalesUrl}/publisher-sale`
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      if (url === epicSalesUrl) {
        return new Response(
          epicMain([
            {
              __typename: 'StorefrontBreaker',
              title: 'Publisher Sale',
              description: 'Save on a selection of games.',
              link: { src: campaignUrl },
            },
          ])
        )
      }
      if (url === campaignUrl) {
        return new Response(
          epicLanding('publisher-sale', {
            title: 'Publisher Sale',
            description: 'Publisher Sale ends September 10, 2026 at 1:00 PM UTC.',
          })
        )
      }
      throw new Error(`Unexpected Epic URL: ${url}`)
    },
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].name, 'Publisher Sale')
  assert.equal(result.campaigns[0].sourceUid, 'epic-storefront:publisher%20sale')
  assert.deepEqual(result.campaigns[0].ends, {
    precision: 'datetime',
    value: '2026-09-10T13:00:00+00:00',
  })
  assert.equal(
    result.campaigns[0].artworkUrl,
    'https://static-assets-prod.epicgames.com/campaign.jpg'
  )
})

test('Epic separates concise public names from campaign-level qualification', async () => {
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: async () =>
      new Response(
        epicMain([
          {
            __typename: 'StorefrontBreaker',
            title: 'Black Friday',
            description: 'Save on a selection of games and DLC.',
          },
          {
            __typename: 'StorefrontBreaker',
            title: 'Publisher Week',
            description: 'Save on select games.',
          },
          {
            __typename: 'StorefrontBreaker',
            title: 'Gamescom',
            description: 'Discounts on multiple titles.',
          },
          {
            __typename: 'StorefrontBreaker',
            title: 'Holiday Event',
            description: 'Save on a range of games.',
          },
          {
            __typename: 'StorefrontBreaker',
            title: 'Game Spotlight',
            description: 'Explore a selection of games.',
          },
        ])
      ),
  })

  assert.deepEqual(
    result.campaigns.map(({ name }) => name),
    ['Black Friday', 'Publisher Week', 'Gamescom', 'Holiday Event']
  )
})

test('Epic reuses a unique known source UID when the same named campaign gains a landing', async () => {
  const campaignUrl = `${epicSalesUrl}/publisher-sale`
  const known = epicKnown({
    campaignKey: 'publisher-sale',
    sourceUid: 'epic-existing:publisher-sale',
    name: 'Publisher Sale',
    officialUrl: epicSalesUrl,
    endsAt: '2026-08-30T18:00:00Z',
  })
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [known],
    fetch: async (input) => {
      const url = input.toString()
      if (url === epicSalesUrl) {
        return new Response(
          epicMain([
            {
              __typename: 'StorefrontBreaker',
              title: 'Publisher Sale',
              description: 'Save on a selection of games.',
              link: { src: campaignUrl },
            },
          ])
        )
      }
      if (url === campaignUrl) {
        return new Response(
          epicLanding('publisher-sale', {
            title: 'Publisher Sale',
            description: 'Publisher Sale has ended, but more deals await.',
          })
        )
      }
      throw new Error(`Unexpected Epic URL: ${url}`)
    },
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].sourceUid, known.sourceUid)
  assert.equal(result.campaigns[0].officialUrl, campaignUrl)
  assert.equal(result.campaigns[0].state, 'live')
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
})

test('Epic reuses a unique known source UID when the same named campaign loses its landing', async () => {
  const campaignUrl = `${epicSalesUrl}/publisher-sale`
  const known = epicKnown({
    campaignKey: 'publisher-sale',
    sourceUid: 'epic-existing:publisher-sale-with-landing',
    name: 'Publisher Sale',
    officialUrl: campaignUrl,
  })
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [known],
    fetch: async (input) => {
      const url = input.toString()
      if (url === epicSalesUrl) {
        return new Response(
          epicMain([
            {
              __typename: 'StorefrontBreaker',
              title: 'Publisher Sale',
              description: 'Save on a selection of games.',
            },
          ])
        )
      }
      if (url === campaignUrl) {
        return new Response(
          epicLanding('publisher-sale', {
            title: 'Publisher Sale',
            description: 'Publisher Sale remains live.',
          })
        )
      }
      throw new Error(`Unexpected Epic URL: ${url}`)
    },
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].sourceUid, known.sourceUid)
})

test('Epic never chooses arbitrarily between duplicate known public names', async () => {
  const knownCampaigns = ['one', 'two'].map((sourceUid) =>
    epicKnown({
      campaignKey: sourceUid,
      sourceUid: `epic-existing:${sourceUid}`,
      name: 'Publisher Sale',
      officialUrl: epicSalesUrl,
    })
  )
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns,
    fetch: async () =>
      new Response(
        epicMain([
          {
            __typename: 'StorefrontBreaker',
            title: 'Publisher Sale',
            description: 'Save on a selection of games.',
          },
        ])
      ),
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(result.campaigns[0].sourceUid, 'epic-storefront:publisher%20sale')
  assert.equal(
    knownCampaigns.some(
      ({ sourceUid }) => sourceUid === result.campaigns[0].sourceUid
    ),
    false
  )
})

test('Epic source UID matching never correlates substring-only campaign names', async () => {
  const known = epicKnown({
    campaignKey: 'publisher-sale',
    sourceUid: 'epic-existing:publisher-sale',
    name: 'Publisher Sale',
    officialUrl: epicSalesUrl,
  })
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [known],
    fetch: async () =>
      new Response(
        epicMain([
          {
            __typename: 'StorefrontBreaker',
            title: 'Publisher Sale Deluxe',
            description: 'Save on a selection of games.',
          },
        ])
      ),
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(
    result.campaigns[0].sourceUid,
    'epic-storefront:publisher%20sale%20deluxe'
  )
})

test('Epic new source UIDs preserve punctuation, symbols, and campaign years', async () => {
  const names = [
    'Games & Add-ons Sale',
    'Games Add-ons Sale',
    'Publisher Sale 2025',
    'Publisher Sale 2026',
  ]
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: async () =>
      new Response(
        epicMain(
          names.map((title) => ({
            __typename: 'StorefrontBreaker',
            title,
            description: 'Save on a selection of games.',
          }))
        )
      ),
  })

  assert.deepEqual(
    result.campaigns.map(({ name }) => name),
    names
  )
  assert.deepEqual(
    result.campaigns.map(({ sourceUid }) => sourceUid),
    [
      'epic-storefront:games%20%26%20add-ons%20sale',
      'epic-storefront:games%20add-ons%20sale',
      'epic-storefront:publisher%20sale%202025',
      'epic-storefront:publisher%20sale%202026',
    ]
  )
})

test('Epic rejects missing, malformed, foreign-region, and foreign-locale SSR contracts', async (t) => {
  const cases = [
    ['missing marker', '<main>Epic Games Sales & Specials</main>'],
    [
      'malformed JSON',
      '<script>window.__REACT_QUERY_INITIAL_QUERIES__ = [{"broken":];</script>',
    ],
    ['missing storefrontDiscover', epicSsr().replace('storefrontDiscover', 'other')],
    ['foreign country', epicMain([], { country: 'CA' })],
    ['foreign locale', epicMain([], { locale: 'fr-FR' })],
    ['unsuccessful query', epicMain([], { status: 'error' })],
    [
      'wrong layout identity',
      epicMain().replace('Epic Games Sales & Specials', 'Epic Games Store'),
    ],
  ]

  for (const [name, html] of cases) {
    await t.test(name, async () => {
      await assert.rejects(
        runEpicGamesStoreAdapter({
          now: new Date('2026-08-31T00:00:00Z'),
          fetch: async () => new Response(html),
        }),
        (error) =>
          error?.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE'
      )
    })
  }
})

test('Epic ends a matching known campaign only from its anchored official landing', async () => {
  const campaignUrl = `${epicSalesUrl}/epic-savings`
  const calls = []
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [epicKnown()],
    fetch: async (input) => {
      const url = input.toString()
      calls.push(url)
      if (url === epicSalesUrl) return new Response(epicMain())
      if (url === campaignUrl) {
        return new Response(
          epicLanding('epic-savings', {
            title: 'Epic Savings Sale',
            description: 'Epic Savings Sale has ended, but more deals await.',
          })
        )
      }
      throw new Error(`Unexpected Epic URL: ${url}`)
    },
  })

  assert.deepEqual(result.campaigns, [])
  assert.deepEqual(result.explicitlyEndedSourceUids, [campaignUrl])
  assert.deepEqual(calls, [epicSalesUrl, campaignUrl])
})

test('Epic requires an exact known name even when its official landing URL matches', async () => {
  const summerUrl = `${epicSalesUrl}/summer-sale`
  const known = epicKnown({ officialUrl: summerUrl })
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [known],
    fetch: async (input) => {
      const url = input.toString()
      if (url === epicSalesUrl) return new Response(epicMain())
      if (url === summerUrl) {
        return new Response(
          epicLanding('summer-sale', {
            title: 'Summer Sale',
            description: 'Summer Sale has ended, but more deals await.',
          })
        )
      }
      throw new Error(`Unexpected Epic URL: ${url}`)
    },
  })

  assert.deepEqual(result.explicitlyEndedSourceUids, [])
})

test('Epic preserves a known campaign when its landing verification fails', async () => {
  const campaignUrl = `${epicSalesUrl}/epic-savings`
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [epicKnown()],
    fetch: async (input) =>
      input.toString() === epicSalesUrl
        ? new Response(epicMain())
        : new Response('Unavailable', { status: 503 }),
  })

  assert.deepEqual(result.campaigns, [])
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
  assert.equal(campaignUrl, epicKnown().officialUrl)
})

test('Epic current evidence dominates a stale known exact end', async () => {
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [
      epicKnown({
        sourceUid: 'epic-storefront:deals-of-the-week',
        name: 'Deals of the Week',
        officialUrl: epicDealsUrl,
        endsAt: '2026-08-30T18:00:00Z',
      }),
    ],
    fetch: async () => new Response(epicMain([epicDealsOfTheWeek()])),
  })

  assert.equal(result.campaigns.length, 1)
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
})

test('Epic partial coverage does not end a known campaign absent from the main surface', async () => {
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    knownCampaigns: [
      epicKnown({
        sourceUid: 'epic-storefront:deals-of-the-week',
        name: 'Deals of the Week',
        officialUrl: epicDealsUrl,
      }),
    ],
    fetch: async () => new Response(epicMain()),
  })

  assert.equal(result.coverage, 'partial')
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
})

test('Epic validates a linked campaign landing once and deduplicates its stable identity', async () => {
  const campaignUrl = `${epicSalesUrl}/epic-savings`
  const calls = []
  const currentModule = {
    __typename: 'StorefrontBreaker',
    type: 'breaker',
    title: 'Epic Savings Sale',
    description: 'Save on a selection of games and add-ons.',
    link: { src: `${campaignUrl}?lang=en-US#hero`, linkText: 'Browse' },
  }
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: async (input) => {
      const url = input.toString()
      calls.push(url)
      if (url === epicSalesUrl) {
        return new Response(epicMain([currentModule, currentModule]))
      }
      if (url === campaignUrl) {
        return new Response(
          epicLanding('epic-savings', {
            title: 'Epic Savings Sale',
            description: 'Epic Savings Sale is live with deals on select games.',
          })
        )
      }
      throw new Error(`Unexpected Epic URL: ${url}`)
    },
  })

  assert.equal(result.campaigns.length, 1)
  assert.equal(
    result.campaigns[0].sourceUid,
    'epic-storefront:epic%20savings%20sale'
  )
  assert.equal(result.campaigns[0].name, 'Epic Savings Sale')
  assert.equal(result.campaigns[0].officialUrl, campaignUrl)
  assert.equal(result.campaigns[0].state, 'live')
  assert.equal(
    calls.filter((url) => url === campaignUrl).length,
    1
  )
})

test('Epic accepts a campaign-level games and add-ons sale but excludes free and hardware-only modules', async () => {
  const result = await runEpicGamesStoreAdapter({
    now: new Date('2026-08-31T00:00:00Z'),
    fetch: async () =>
      new Response(
        epicMain([
          {
            __typename: 'StorefrontBreaker',
            title: 'Games & Add-ons Sale',
            description:
              'Save on a selection of games and DLC add-ons, plus a free giveaway.',
            link: { href: '/browse?tag=games-and-add-ons-sale' },
          },
          {
            __typename: 'StorefrontBreaker',
            title: 'Free Games Sale',
            description: 'Claim free games only.',
            link: { href: '/free-games' },
          },
          {
            __typename: 'StorefrontBreaker',
            title: 'Hardware Sale',
            description: 'Controllers and headsets only.',
            link: { href: '/browse?tag=hardware' },
          },
          {
            __typename: 'StorefrontBreaker',
            title: 'Free Play Days',
            description: 'Play selected games for free this weekend.',
            link: { href: '/browse?tag=free-play-days' },
          },
        ])
      ),
  })

  assert.deepEqual(
    result.campaigns.map(({ name }) => name),
    ['Games & Add-ons Sale']
  )
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
