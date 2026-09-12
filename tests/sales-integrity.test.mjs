import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { campaignKeysToEnd } from '../supabase/functions/campaign-monitoring/_shared/reconcile.ts'
import { campaignBaseRow } from '../supabase/functions/campaign-monitoring/_shared/persistence.ts'
import { runGogAdapter } from '../supabase/functions/campaign-monitoring/adapters/gog.ts'
import { runMicrosoftStoreAdapter } from '../supabase/functions/campaign-monitoring/adapters/microsoft-store.ts'
import { runNintendoEshopAdapter } from '../supabase/functions/campaign-monitoring/adapters/nintendo-eshop.ts'

const now = new Date('2026-09-12T18:00:00Z')
const fresh = { sourceUid: 'same', storeSlug: 'gog', name: 'Publisher Sale', state: 'live',
  lifecycleBasis: 'official-source', officialUrl: 'https://www.gog.com/promo/publisher_sale',
  sourceUrl: 'https://www.gog.com/en/' }
const previous = { ...fresh, campaignKey: 'key', startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-09-20T00:00:00Z' }
const exact = (value) => ({ precision: 'datetime', value })
const date = (value) => ({ precision: 'date', value })
const row = (entry = fresh, known = previous) => campaignBaseRow(entry, 'key', now.toISOString(), known)
const reconcile = (changes = {}) => campaignKeysToEnd({ sourceSucceeded: true, coverage: 'partial',
  activeCampaigns: [{ campaign_key: 'key', source_uid: 'same', ends_at: '2026-09-10T00:00:00Z' }],
  detectedCampaigns: [], explicitlyEndedSourceUids: [], now, ...changes })

for (const state of ['live', 'upcoming']) {
  test(`fresh ${state} survives upsert then reconciliation against an obsolete end`, () => {
    for (const ends of [undefined, exact('2026-09-25T00:00:00Z')]) {
      const entry = { ...fresh, state, ends }
      const persisted = row(entry, { ...previous, endsAt: '2026-09-10T00:00:00Z' })
      assert.equal(persisted.state, state)
      assert.equal(persisted.ends_at, ends?.value ?? null)
      assert.deepEqual(reconcile({ detectedCampaigns: [entry] }), [])
    }
  })
}
test('absent identity can expire, while unrelated current detection cannot protect it', () => {
  assert.deepEqual(reconcile({ detectedCampaigns: [{ ...fresh, sourceUid: 'different' }] }), ['key'])
})
test('source failure preserves rows even with explicit and exact end evidence', () => {
  assert.deepEqual(reconcile({ sourceSucceeded: false, explicitlyEndedSourceUids: ['same'] }), [])
})
test('valid explicit end and freshly ended detection retain precedence', () => {
  assert.deepEqual(reconcile({ detectedCampaigns: [fresh], explicitlyEndedSourceUids: ['same'] }), ['key'])
  assert.deepEqual(reconcile({ detectedCampaigns: [{ ...fresh, state: 'ended' }] }), ['key'])
})
test('fresh boundaries replace each precision pair atomically', () => {
  const dates = row({ ...fresh, starts: date('2026-09-02'), ends: date('2026-09-26') })
  assert.deepEqual([dates.starts_on, dates.starts_at, dates.ends_on, dates.ends_at], ['2026-09-02', null, '2026-09-26', null])
  const instants = row({ ...fresh, starts: exact('2026-09-03T00:00:00Z'), ends: exact('2026-09-27T00:00:00Z') },
    { ...previous, startsAt: undefined, endsAt: undefined, startsOn: '2026-09-01', endsOn: '2026-09-20' })
  assert.deepEqual([instants.starts_on, instants.starts_at, instants.ends_on, instants.ends_at],
    [null, '2026-09-03T00:00:00Z', null, '2026-09-27T00:00:00Z'])
})
test('missing enrichment preserves compatible past start and future end without promoting lifecycle basis', () => {
  const result = row(fresh, { ...previous, lifecycleBasis: 'exact-time' })
  assert.equal(result.starts_at, previous.startsAt)
  assert.equal(result.ends_at, previous.endsAt)
  assert.equal(result.lifecycle_basis, 'official-source')
})
test('upcoming clears past start, live clears future start, and both clear obsolete end', () => {
  assert.equal(row({ ...fresh, state: 'upcoming' }).starts_at, null)
  assert.equal(row(fresh, { ...previous, startsAt: '2026-09-18T00:00:00Z' }).starts_at, null)
  assert.equal(row(fresh, { ...previous, endsAt: now.toISOString() }).ends_at, null)
})
test('calendar boundaries remain dates and ambiguous current-day boundaries are not guessed', () => {
  const known = { ...previous, startsAt: undefined, endsAt: undefined, startsOn: '2026-09-12', endsOn: '2026-09-12' }
  const result = row({ ...fresh, state: 'upcoming' }, known)
  assert.deepEqual([result.starts_on, result.ends_on, result.starts_at, result.ends_at], ['2026-09-12', '2026-09-12', null, null])
  const obsolete = row({ ...fresh, state: 'upcoming' }, { ...known, startsOn: '2026-09-10', endsOn: '2026-09-10' })
  assert.equal(obsolete.starts_on, null)
  assert.equal(obsolete.ends_on, null)
})
test('fresh opposite boundary supersedes a retained incompatible range', () => {
  assert.equal(row({ ...fresh, state: 'upcoming', starts: exact('2026-09-25T00:00:00Z') }).ends_at, null)
  assert.equal(row({ ...fresh, ends: exact('2026-08-30T00:00:00Z') }).starts_at, null)
})
test('mixed precision never preserves a clearly reversed old boundary or invents a timezone', () => {
  const upcoming = row({ ...fresh, state: 'upcoming', starts: date('2026-09-25') })
  assert.equal(upcoming.starts_on, '2026-09-25')
  assert.equal(upcoming.ends_at, null)
  const live = row({ ...fresh, ends: date('2026-08-30') })
  assert.equal(live.starts_at, null)
  const sameDay = row({ ...fresh, state: 'upcoming', starts: date('2026-09-20') })
  assert.equal(sameDay.ends_at, previous.endsAt)
  const otherPrecision = row({ ...fresh, state: 'upcoming', starts: exact('2026-09-25T00:00:00Z') },
    { ...previous, endsAt: undefined, endsOn: '2026-09-20' })
  assert.equal(otherPrecision.ends_on, null)
})
test('timing never transfers between source identities and exact-time remains fresh evidence', () => {
  assert.equal(row(fresh, { ...previous, sourceUid: 'other' }).ends_at, null)
  const result = row({ ...fresh, lifecycleBasis: 'exact-time', starts: exact(previous.startsAt), ends: exact(previous.endsAt) })
  assert.equal(result.lifecycle_basis, 'exact-time')
})
test('persist path supplies the same known identity and all temporal columns to the merge', async () => {
  const code = await readFile(new URL('../supabase/functions/campaign-monitoring/index.ts', import.meta.url), 'utf8')
  assert.match(code, /starts_on,starts_at,ends_on,ends_at/)
  assert.match(code, /upsertCampaigns\(result.campaigns, finishedAt, activeBeforeRun\)/)
  assert.match(code, /known.campaignKey === key && known.sourceUid === entry.sourceUid/)
})

const gogCurrent = 'https://www.gog.com/en/now_on_sale?countryCode=US&locale=en-US&currencyCode=USD'
const gogHome = '<script id="gogcom-store-state">{}</script><promo-banner-section></promo-banner-section>'
const gogFeed = '<rss><channel><title>GOG.com News</title></channel></rss>'
const promo = (title, slug) => ({ title, bigThingy: { text: title,
  url: `https://www.gog.com/promo/${slug}`, background: '//images-1.gog-statics.com/campaign.jpg', countdownDate: 1 } })
async function gog(tabs, { page = '<h1>42 games</h1><h2>games on sale</h2>', current, knownCampaigns = [] } = {}) {
  const calls = []
  const result = await runGogAdapter({ now, knownCampaigns, fetch: async (input) => {
    const url = input.toString(); calls.push(url)
    if (url === gogCurrent) return current ?? Response.json({ tabs })
    if (url === 'https://www.gog.com/en/') return new Response(gogHome)
    if (url === 'https://www.gog.com/frontpage/rss') return new Response(gogFeed)
    assert.match(url, /^https:\/\/www.gog.com\/(?:en\/)?promo\//)
    const response = new Response(page)
    Object.defineProperty(response, 'url', { value: url })
    return response
  } })
  return { result, calls }
}
test('GOG current tabs alone discover Promo, Promotion and Publisher Sale with official names', async () => {
  const tabs = [promo('Arcade Promo', '20260910_arcade_promo'), promo('Classic Promotion', '20260910_classic_promotion'),
    promo('505 Games Publisher Sale', '20260910_505_games_publisher_sale')]
  const { result, calls } = await gog(tabs)
  assert.deepEqual(result.campaigns.map(c => c.name), tabs.map(t => t.title))
  assert.equal(result.coverage, 'partial')
  assert.equal(calls.length, 6)
  assert.ok(result.campaigns.every(c => c.sourceUrl === gogCurrent && c.ends === undefined))
  assert.ok(result.campaigns.every(c => c.artworkUrl === 'https://images-1.gog-statics.com/campaign.jpg'))
})
test('GOG needs no product grid and ignores any supplied product payload', async () => {
  const tabs = [promo('Adventure Promo', 'adventure_promo')]
  const a = await gog(tabs)
  const b = await gog(tabs, { current: Response.json({ tabs, allProducts: { invalid: 'must not inspect' }, products: null }) })
  assert.deepEqual(a.result, b.result)
  assert.ok(b.calls.every(url => !url.includes('/game/')))
})
test('GOG current contract failures never become healthy zero', async () => {
  for (const current of [new Response('bad json'), Response.json({}), Response.json({ tabs: {} }),
    Response.json({ tabs: [{ title: 'Broken Promo' }] }), new Response('unavailable', { status: 503 })]) {
    await assert.rejects(gog([], { current }), error => Boolean(error.code))
  }
})
test('GOG excludes historical and giveaway-only promotional tabs', async () => {
  const { result } = await gog([promo('Old Publisher Sale', '20240105_publisher_sale'), promo('Free Game Giveaway Promo', 'giveaway_promo')])
  assert.deepEqual(result.campaigns, [])
})
test('GOG uses normalized promo path vocabulary and rejects quantity names', async () => {
  const url = 'https://www.gog.com/promo/20260910_unknown_publisher_sale'
  const result = await runGogAdapter({ now, fetch: async input => {
    if (input.toString() === gogCurrent) return Response.json({ tabs: [] })
    if (input.toString() === 'https://www.gog.com/en/') return new Response(`${gogHome}<a href="${url}">Shop now</a>`)
    if (input.toString() === 'https://www.gog.com/frontpage/rss') return new Response(gogFeed)
    assert.equal(input.toString(), url)
    return new Response('<h1>42 games</h1><h2>games on sale</h2><h3>Independent Publisher Sale</h3>')
  } })
  assert.equal(result.campaigns[0].name, 'Independent Publisher Sale')
})
test('GOG reuses a known localized identity for a current tab', async () => {
  const tab = promo('Publisher Sale', '20260910_publisher_sale')
  const known = { ...previous, sourceUid: tab.bigThingy.url.replace('/promo/', '/en/promo/'), officialUrl: tab.bigThingy.url }
  const { result } = await gog([tab], { knownCampaigns: [known] })
  assert.equal(result.campaigns[0].sourceUid, known.sourceUid)
})

const xboxUrl = 'https://www.xbox.com/en-US/promotions/sales/sales-and-specials'
const weekly = { campsiteType: 'ChannelProductPlacement', heading: 'This week’s digital game deals',
  collectionDataSource: { collectionId: 'DynamicChannel.GameDeals' },
  headingCTA: { label: 'SHOP MORE', url: 'https://www.xbox.com/games/browse/DynamicChannel.GameDeals' } }
function xboxHtml(modules, published = true) {
  return `<script>window.__PRELOADED_STATE__ = ${JSON.stringify({ content: { contentPages: {
    'promotions/sales/sales-and-specials': { [published ? 'published' : 'draft']: { data: { moduleList: modules } } }
  } }, core2: { products: null } })}; window.consentCheckRequired = false</script>`
}
const xbox = html => runMicrosoftStoreAdapter({ now, fetch: async input => {
  assert.equal(input.toString(), xboxUrl, 'weekly discovery must not fetch collection products')
  return new Response(html)
} })
test('Xbox published weekly module creates one stable current collection identity without timing', async () => {
  const first = await xbox(xboxHtml([weekly, weekly]))
  const second = await xbox(xboxHtml([{ ...weekly, heading: 'New weekly digital game deals' }]))
  assert.equal(first.campaigns.length, 1)
  assert.equal(first.campaigns[0].sourceUid, 'dynamicchannel.gamedeals')
  assert.equal(second.campaigns[0].sourceUid, first.campaigns[0].sourceUid)
  assert.equal(first.campaigns[0].officialUrl, weekly.headingCTA.url)
  assert.equal(first.campaigns[0].starts, undefined)
  assert.equal(first.campaigns[0].ends, undefined)
  assert.equal(first.coverage, 'partial')
})
test('Xbox generic page and unpublished module are not campaigns', async () => {
  for (const html of ['<h1>Sales and specials</h1>', xboxHtml([weekly], false), xboxHtml([])]) {
    const result = await xbox(html)
    assert.deepEqual(result.campaigns, [])
    assert.deepEqual(result.explicitlyEndedSourceUids, [])
  }
})
test('Xbox requires module, identity, heading, games semantics and official CTA together', async () => {
  for (const broken of [{ campsiteType: 'Other' }, { heading: 'Hardware Sale' }, { heading: 'Game Pass subscriptions' },
    { heading: '' }, { collectionDataSource: { collectionId: 'DynamicChannel.Hardware' } },
    { headingCTA: undefined }, { headingCTA: { label: 'SHOP', url: 'https://evil.example/games/browse/DynamicChannel.GameDeals' } },
    { headingCTA: { label: 'SHOP', url: xboxUrl } }]) {
    assert.deepEqual((await xbox(xboxHtml([{ ...weekly, ...broken }]))).campaigns, [])
  }
})

const nintendoHub = 'https://www.nintendo.com/us/store/sales-and-deals/'
const nintendoPage = `${nintendoHub}fictional-adventure/`
const assetPath = 'ncom/en_US/merchandising/Sales and Deals/2026/Fictional Adventure/Campaign Banner'
const promoBlock = { CONTENT_TYPE: 'promoRichTextCta', heading: 'Fictional Adventure Franchise Sale',
  asset: { CONTENT_TYPE: 'component_image', primary: { resourceType: 'image', assetPath } } }
function nintendoJson(blocks) {
  return `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { page: { content: {
    merchandisedGrid: blocks, pageSections: [{ storyModuleOrCuratedProductList: blocks }]
  } } } } })}</script>`
}
async function nintendo(extra) {
  return runNintendoEshopAdapter({ now, fetch: async input => {
    const url = input.toString()
    if (url === nintendoHub) return new Response(`<a href="${nintendoPage}">Fictional Adventure</a>`)
    if (url === nintendoPage) return new Response(`<meta property="og:title" content="Fictional Adventure Sale - Nintendo">${extra}`)
    assert.equal(url, 'https://www.nintendo.com/us/whatsnew/')
    return new Response('<script id="__NEXT_DATA__">{"props":{"pageProps":{"initialApolloState":{}}}}</script>')
  } })
}
test('Nintendo selects the matching structured promotional asset after rejecting generic social metadata', async () => {
  const result = await nintendo('<meta property="og:image" content="https://assets.nintendo.com/image/upload/ncom/global/social-share.jpg">' + nintendoJson([promoBlock]))
  assert.equal(result.campaigns[0].artworkUrl, `https://assets.nintendo.com/image/upload/${assetPath.split('/').map(encodeURIComponent).join('/')}`)
})
test('Nintendo keeps usable shared metadata artwork ahead of the fallback', async () => {
  const result = await nintendo('<meta property="og:image" content="https://assets.nintendo.com/campaign.jpg">' + nintendoJson([promoBlock]))
  assert.equal(result.campaigns[0].artworkUrl, 'https://assets.nintendo.com/campaign.jpg')
})
test('Nintendo ignores unrelated blocks, products, generic assets and unsafe asset paths', async () => {
  for (const block of [{ ...promoBlock, heading: 'Another Publisher Sale' }, { ...promoBlock, CONTENT_TYPE: 'product' },
    ...['ncom/en_US/products/boxart', 'ncom/en_US/merchandising/logo.png', 'https://evil.example/image.jpg',
      'ncom/en_US/merchandising/../image', 'ncom/en_US/merchandising/image?token=value'].map(path =>
      ({ ...promoBlock, asset: { ...promoBlock.asset, primary: { resourceType: 'image', assetPath: path } } }))]) {
    const result = await nintendo(nintendoJson([block]))
    assert.equal(result.campaigns.length, 1)
    assert.equal(result.campaigns[0].artworkUrl, undefined)
  }
})
test('Nintendo missing or malformed optional CMS data preserves the campaign', async () => {
  for (const extra of ['', '<script id="__NEXT_DATA__">{broken</script>', '<script id="__NEXT_DATA__">null</script>']) {
    const result = await nintendo(extra)
    assert.equal(result.campaigns[0].state, 'live')
    assert.equal(result.campaigns[0].artworkUrl, undefined)
  }
})
