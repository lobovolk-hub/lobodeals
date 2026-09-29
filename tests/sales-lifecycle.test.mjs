import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/load-module.mjs'
import { campaignKeysToEnd } from '../supabase/functions/campaign-monitoring/_shared/reconcile.ts'
import { campaignBaseRow } from '../supabase/functions/campaign-monitoring/_shared/persistence.ts'
import { runGogAdapter } from '../supabase/functions/campaign-monitoring/adapters/gog.ts'
import { runEpicGamesStoreAdapter } from '../supabase/functions/campaign-monitoring/adapters/epic-games-store.ts'

const now = new Date('2026-09-29T00:00:00Z')
const active = { campaign_key: 'party-rpg', source_uid: 'party-rpg', ends_at: null, ends_on: '2026-09-21' }
const reconcile = (changes = {}) => campaignKeysToEnd({ sourceSucceeded: true, coverage: 'partial',
  activeCampaigns: [active], detectedCampaigns: [], explicitlyEndedSourceUids: [], now, ...changes })

test('Party-Based RPG Fest expires only after the entire end date has passed at UTC-12', () => {
  for (const instant of ['2026-09-21T23:59:59Z', '2026-09-22T00:00:00Z', '2026-09-22T11:59:59.999Z']) {
    assert.deepEqual(reconcile({ now: new Date(instant) }), [])
  }
  assert.deepEqual(reconcile({ now: new Date('2026-09-22T12:00:00Z') }), ['party-rpg'])
  assert.deepEqual(reconcile(), ['party-rpg'])
  assert.equal(active.ends_at, null)
})

test('source failure and partial absence still preserve campaigns', () => {
  assert.deepEqual(reconcile({ sourceSucceeded: false, explicitlyEndedSourceUids: ['party-rpg'] }), [])
  assert.deepEqual(reconcile({ activeCampaigns: [{ ...active, ends_on: null }] }), [])
})

for (const state of ['live', 'upcoming']) {
  test(`fresh ${state} supersedes the stale calendar end without inventing timing`, () => {
    const entry = { sourceUid: active.source_uid, storeSlug: 'steam', name: 'Steam Party-Based RPG Fest', state,
      lifecycleBasis: 'official-source', officialUrl: 'https://store.steampowered.com/sale/party',
      sourceUrl: 'https://store.steampowered.com/' }
    assert.deepEqual(reconcile({ detectedCampaigns: [entry] }), [])
    const row = campaignBaseRow(entry, active.campaign_key, now.toISOString(), { ...entry, endsOn: active.ends_on })
    assert.equal(row.ends_on, null)
    assert.equal(row.ends_at, null)
    assert.equal(row.lifecycle_basis, 'official-source')
  })
}

test('exact end keeps precedence and precision', () => {
  const ends_at = '2026-09-29T01:00:00+00:00'
  assert.deepEqual(reconcile({ activeCampaigns: [{ ...active, ends_at }], now }), [])
  assert.deepEqual(reconcile({ activeCampaigns: [{ ...active, ends_at }], now: new Date(ends_at) }), ['party-rpg'])
})

for (const file of ['lib/sales.ts', 'lib/public-sales-runtime.ts']) {
  test(`${file} expires calendar ends between monitoring runs without guessing activation`, async () => {
    const { getCampaignState } = await loadModule(file)
    for (const status of ['live', 'upcoming']) {
      const campaign = { ends: { precision: 'date', date: active.ends_on }, lifecycle: { basis: 'official-source', status } }
      assert.equal(getCampaignState(campaign), status)
      assert.equal(getCampaignState(campaign, new Date('2026-09-22T11:59:59.999Z')), status)
      assert.equal(getCampaignState(campaign, new Date('2026-09-22T12:00:00Z')), 'expired')
      assert.deepEqual(campaign.ends, { precision: 'date', date: '2026-09-21' })
    }
  })
}

const gogUrl = 'https://www.gog.com/promo/20260921_action_promo'
const knownGog = { campaignKey: 'gog-action', sourceUid: gogUrl.replace('/promo/', '/en/promo/'), name: 'Action Promo',
  state: 'live', officialUrl: gogUrl, sourceUrl: 'https://www.gog.com/en/' }
// Reduced official SSR contract, observed 2026-09-29; no catalog/product payload.
const shell = (country = 'US', extraState = {}, content = '<page-not-found></page-not-found>') =>
  `<title>GOG.COM</title><app-root ng-server-context="ssr"><router-outlet></router-outlet>${content}</app-root>
  <script id="gogcom-store-state" type="application/json">${JSON.stringify({ consulConfig: { catalogPredefinedFilters: true },
    pageMetadata: { country, locale: 'en-US', currency: 'USD' }, ...extraState })}</script>`
async function gog({ page = shell(), status = 200, finalUrl = gogUrl, tabs = [], homeLinks = '', known = [knownGog], brokenSource } = {}) {
  const calls = []
  const result = await runGogAdapter({ now, knownCampaigns: known, fetch: async input => {
    const url = input.toString(); calls.push(url)
    assert.equal(new URL(url).hostname, 'www.gog.com')
    if (url.includes('/now_on_sale?')) return Response.json(brokenSource === 'tabs' ? {} : { tabs })
    if (url === 'https://www.gog.com/en/') return new Response(brokenSource === 'home' ? '<main>Unknown</main>' :
      `<script id="gogcom-store-state">{}</script><promo-banner-section>${homeLinks}</promo-banner-section>`)
    if (url.endsWith('/frontpage/rss')) return new Response(brokenSource === 'feed' ? '<html>Unknown</html>' :
      '<rss><channel><title>GOG.com News</title></channel></rss>')
    assert.equal(url, gogUrl)
    const response = new Response(page, { status })
    Object.defineProperty(response, 'url', { value: finalUrl })
    return response
  } })
  return { result, calls }
}

test('absent same-year GOG identity plus successful US SSR soft-404 produces explicit end', async () => {
  const { result } = await gog()
  assert.equal(result.coverage, 'partial')
  assert.deepEqual(result.campaigns, [])
  assert.deepEqual(result.explicitlyEndedSourceUids, [knownGog.sourceUid])
  assert.deepEqual(reconcile({ activeCampaigns: [{ campaign_key: knownGog.campaignKey, source_uid: knownGog.sourceUid,
    ends_at: null, ends_on: null }], explicitlyEndedSourceUids: result.explicitlyEndedSourceUids }), ['gog-action'])
  assert.deepEqual(reconcile({ sourceSucceeded: false, explicitlyEndedSourceUids: result.explicitlyEndedSourceUids }), [])
})

for (const locale of ['en', 'es', 'de', 'fr', 'pl', 'ru', 'zh-hans']) {
  test(`GOG equivalent /${locale}/ redirect preserves the stable known UID`, async () => {
    const { result } = await gog({ finalUrl: gogUrl.replace('/promo/', `/${locale}/promo/`) })
    assert.deepEqual(result.explicitlyEndedSourceUids, [knownGog.sourceUid])
  })
}

for (const [label, options] of [
  ['HTTP failure', { status: 503 }],
  ['campaign heading', { page: shell() + '<h1>Action Promo</h1>' }],
  ['campaign metadata', { page: shell() + '<meta property="og:title" content="Action Promo">' }],
  ['campaign config', { page: shell('US', { 'sections.gog/v1/pages/campaign?countryCode=US': { status: 200, body: { config: { type: 'promo' } } } }) }],
  ['unrecognized markup', { page: '<title>GOG.COM</title><main>Store</main>' }],
  ['SSR loading shell without soft-404', { page: shell('US', {}, '') }],
  ['changed state contract', { page: shell('US', { unknownPageState: {} }) }],
  ['foreign market', { page: shell('PE') }],
  ['unrelated redirect', { finalUrl: 'https://www.gog.com/en/' }],
  ['third-party redirect', { finalUrl: 'https://example.com/promo/20260921_action_promo' }],
]) {
  test(`GOG preserves absent known campaign with ${label}`, async () => {
    assert.deepEqual((await gog(options)).result.explicitlyEndedSourceUids, [])
  })
}

test('GOG current tab prevents secondary retirement even if its promo returns generic shell', async () => {
  const { result, calls } = await gog({ tabs: [{ title: 'Action Promo', bigThingy: { url: gogUrl, text: 'Action Promo' } }] })
  assert.deepEqual(result.explicitlyEndedSourceUids, [])
  assert.equal(calls.filter(url => url === gogUrl).length, 1)
})

test('a recognized generic GOG shell never creates a new campaign from stale discovery links', async () => {
  for (const country of ['US', 'PE']) {
    const { result } = await gog({ page: shell(country), known: [], homeLinks: `<a href="${gogUrl}">Action Promo</a>` })
    assert.deepEqual(result.campaigns, [])
    assert.deepEqual(result.explicitlyEndedSourceUids, [])
  }
})

test('GOG explicit end text still retires a known campaign', async () => {
  assert.deepEqual((await gog({ page: '<h1>Action Promo</h1><p>The sale has ended.</p>' })).result.explicitlyEndedSourceUids, [knownGog.sourceUid])
})

for (const brokenSource of ['home', 'feed', 'tabs']) {
  test(`GOG ${brokenSource} contract failure cannot produce retirement evidence`, async () => {
    await assert.rejects(gog({ brokenSource }), error => error.code === 'OFFICIAL_CAMPAIGN_DISCOVERY_UNAVAILABLE')
  })
}

const epicUrl = 'https://store.epicgames.com/sales-and-specials/example-sale'
const knownEpic = { ...knownGog, sourceUid: epicUrl, officialUrl: epicUrl, name: 'Example Sale' }
async function epic(description, { title = 'Example Sale', current = false, status = 200 } = {}) {
  return runEpicGamesStoreAdapter({ now, knownCampaigns: [knownEpic], fetch: async input => {
    const url = new URL(input.toString())
    assert.equal(url.hostname, 'store.epicgames.com')
    const { layoutSlug } = JSON.parse(url.searchParams.get('variables'))
    if (layoutSlug && status !== 200) return new Response('unavailable', { status })
    return Response.json({ data: { Storefront: { discoverLayout: { modules: layoutSlug
      ? [{ __typename: 'PageHeader', title, description }]
      : [{ __typename: 'PageHeader', title: 'Epic Games Store Sales & Specials' },
        ...(current ? [{ __typename: 'StorefrontTextModule', title: 'Example Sale', link: epicUrl }] : [])] } } } })
  } })
}

for (const description of ['Sale ends September 21, 2026 at 11:00 AM EDT.', 'Sale ends September 21, 2026.']) {
  test(`Epic known landing with matching identity and official past timing retires: ${description}`, async () => {
    assert.deepEqual((await epic(description)).explicitlyEndedSourceUids, [epicUrl])
  })
}
for (const [label, description, options] of [
  ['ambiguous date', 'Sale ends September 28, 2026.', {}],
  ['future exact end', 'Sale ends September 30, 2026 at 11:00 AM EDT.', {}],
  ['different campaign', 'Sale ends September 21, 2026.', { title: 'Another Sale' }],
  ['generic page', 'Welcome to our store.', { title: 'Epic Games Store Sales & Specials' }],
  ['fetch failure', 'Sale ends September 21, 2026.', { status: 503 }],
  ['current evidence', 'Sale ends September 21, 2026.', { current: true }],
]) {
  test(`Epic preserves ${label}`, async () => {
    assert.deepEqual((await epic(description, options)).explicitlyEndedSourceUids, [])
  })
}
