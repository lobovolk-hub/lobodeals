import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  extractOfficialArtwork,
  isSafeArtworkUrl,
} from '../supabase/functions/campaign-monitoring/_shared/artwork.ts'
import {
  artworkPatch,
  campaignBaseRow,
} from '../supabase/functions/campaign-monitoring/_shared/persistence.ts'
import { campaign } from '../supabase/functions/campaign-monitoring/_shared/campaign.ts'
import { getCampaignCounter } from '../lib/campaign-timing.ts'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

const detectedCampaign = {
  sourceUid: 'official-sale',
  name: 'Official Sale',
  storeSlug: 'steam',
  state: 'live',
  lifecycleBasis: 'official-source',
  officialUrl: 'https://store.steampowered.com/sale/official-sale',
  sourceUrl: 'https://store.steampowered.com/',
}

test('official metadata artwork is optional, HTTPS-only, and credential-free', () => {
  assert.equal(
    extractOfficialArtwork(
      '<meta property="og:image" content="/campaigns/official-sale.jpg">',
      detectedCampaign.officialUrl
    ),
    'https://store.steampowered.com/campaigns/official-sale.jpg'
  )
  assert.equal(
    extractOfficialArtwork(
      '<meta name="twitter:image" content="https://official-cdn.example/campaign.webp">',
      detectedCampaign.officialUrl
    ),
    'https://official-cdn.example/campaign.webp'
  )

  for (const unsafe of [
    'http://official.example/campaign.jpg',
    'https://user:password@official.example/campaign.jpg',
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'file:///campaign.jpg',
  ]) {
    assert.equal(isSafeArtworkUrl(unsafe), false, unsafe)
  }
})

test('generic social, logo, favicon, and placeholder metadata are rejected', () => {
  const candidates = [
    'https://assets.nintendo.com/ncom/global/social-share.jpg',
    'https://official.example/favicon.png',
    'https://official.example/site-logo.svg',
    'https://official.example/images/placeholder.jpg',
    'https://official.example/default-social-image.png',
  ]

  for (const candidate of candidates) {
    assert.equal(
      extractOfficialArtwork(
        `<meta property="og:image" content="${candidate}">`,
        detectedCampaign.officialUrl
      ),
      undefined,
      candidate
    )
  }
})

test('detected campaigns remain complete without optional artwork', () => {
  const withoutArtwork = campaign(detectedCampaign)
  const withArtwork = campaign({
    ...detectedCampaign,
    artworkUrl: 'https://cdn.example/campaign.jpg',
  })

  assert.equal(withoutArtwork.name, 'Official Sale')
  assert.equal(withoutArtwork.artworkUrl, undefined)
  assert.equal(withArtwork.artworkUrl, 'https://cdn.example/campaign.jpg')
})

test('base upsert never clears artwork and a newly confirmed image gets a patch', () => {
  const row = campaignBaseRow(
    detectedCampaign,
    'steam-official-sale',
    '2026-08-26T12:00:00Z'
  )
  assert.equal('artwork_url' in row, false)
  assert.equal(artworkPatch(detectedCampaign, 'steam-official-sale'), null)

  assert.deepEqual(
    artworkPatch(
      {
        ...detectedCampaign,
        artworkUrl: 'https://cdn.example/new-campaign.jpg',
      },
      'steam-official-sale'
    ),
    {
      campaignKey: 'steam-official-sale',
      artworkUrl: 'https://cdn.example/new-campaign.jpg',
    }
  )
})

test('date-only counters use calendar days and never expose hours', () => {
  const now = new Date(2026, 7, 26, 23, 45)
  const ends = { precision: 'date', date: '2026-09-01' }
  const startsToday = { precision: 'date', date: '2026-08-26' }
  const startsTomorrow = { precision: 'date', date: '2026-08-27' }

  assert.equal(getCampaignCounter(ends, 'live', 'Ends', now), '6 days left')
  assert.equal(
    getCampaignCounter(startsToday, 'upcoming', 'Starts', now),
    'Starts today'
  )
  assert.equal(
    getCampaignCounter(startsTomorrow, 'upcoming', 'Starts', now),
    'Starts tomorrow'
  )
  assert.doesNotMatch(getCampaignCounter(ends, 'live', 'Ends', now), /h|:/)
})

test('exact datetime counters derive seconds from the official instant', () => {
  const counter = getCampaignCounter(
    { precision: 'datetime', dateTime: '2026-08-31T15:30:00Z' },
    'live',
    'Ends',
    new Date('2026-08-26T12:00:17Z')
  )
  assert.equal(counter, 'Ends in 5d 3h 29m 43s')
})

test('artwork migration is singular, nullable, HTTPS-constrained, and mirrored locally', async () => {
  const migrationNames = (await readdir(path.join(root, 'supabase/migrations')))
    .filter((name) => /campaign_artwork\.sql$/.test(name))
  assert.equal(migrationNames.length, 1)
  const migration = await source(`supabase/migrations/${migrationNames[0]}`)
  assert.match(migration, /add column artwork_url text/i)
  assert.match(migration, /artwork_url is null/i)
  assert.match(migration, /\^https:\/\//i)
  assert.doesNotMatch(migration, /create table|drop table|truncate|delete from/i)
})

test('frontend renders official remote artwork with local failure fallback', async () => {
  const artwork = await source('components/campaign-artwork.tsx')
  const card = await source('components/campaign-card.tsx')
  const feed = await source('lib/sales-source.ts')

  assert.match(feed, /artwork_url/)
  assert.match(artwork, /referrerPolicy="no-referrer"/)
  assert.match(artwork, /loading="lazy"/)
  assert.match(artwork, /onError=/)
  assert.match(artwork, /setFailed\(true\)/)
  assert.match(artwork, /data-artwork-fallback/)
  assert.match(card, /<CampaignArtwork/)
  assert.equal((card.match(/<a\b/g) || []).length, 1)
})

test('Upcoming rail controls and platform identity polish are explicit', async () => {
  const rail = await source('components/upcoming-rail.tsx')
  const platform = await source('components/platform-card.tsx')
  const stores = await source('lib/stores.ts')

  assert.match(rail, /aria-label="Scroll upcoming sales left"/)
  assert.match(rail, /aria-label="Scroll upcoming sales right"/)
  assert.match(rail, /disabled=\{!canScrollLeft\}/)
  assert.match(rail, /disabled=\{!canScrollRight\}/)
  assert.match(rail, /ArrowLeft/)
  assert.match(rail, /ArrowRight/)
  assert.match(rail, /handleControlKeyDown/)
  assert.match(rail, /event\.key !== 'Enter'/)
  assert.match(rail, /hidden justify-end gap-2 sm:flex/)

  assert.match(platform, /slug === 'steam'/)
  assert.match(platform, /eight PC stores/)
  assert.match(stores, /slug: 'microsoft-store'[\s\S]*?\/platforms\/xbox\/logo\.png/)
  assert.match(platform, /min-h-28 flex-1 items-center justify-center/)
})

test('adapters use only shared automatic artwork discovery with no mappings', async () => {
  const adapterDirectory = path.join(
    root,
    'supabase/functions/campaign-monitoring/adapters'
  )
  const adapterFiles = (await readdir(adapterDirectory)).filter(
    (name) => name.endsWith('.ts') && name !== 'index.ts'
  )
  assert.equal(adapterFiles.length, 10)
  const entries = await Promise.all(
    adapterFiles.map(async (name) => ({
      name,
      source: await readFile(path.join(adapterDirectory, name), 'utf8'),
    }))
  )
  const adapters = entries.map(({ source }) => source).join('\n')

  assert.equal(
    entries.every(({ name, source }) =>
      source.includes(
        name === 'microsoft-store.ts' || name === 'rockstar-store.ts'
          ? 'discoverOfficialArtwork'
          : 'extractOfficialArtwork'
      )
    ),
    true
  )
  assert.doesNotMatch(
    adapters,
    /(?:campaignArtwork|artworkMap|manualArtwork)\s*=\s*[{[]/i
  )
  assert.doesNotMatch(
    adapters,
    /cloudinary|imgur|unsplash|googleusercontent|bing\.com/i
  )
})
