import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { getSalesSelectionState } from '../lib/sales-availability.ts'
import { storeVisualTreatments } from '../lib/store-visuals.ts'
import {
  storeProfileStaticParams,
  storeStaticParams,
  stores,
} from '../lib/stores.ts'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('seven independent profiles use one shared compact LoboDeals-first header while the registry remains ten stores', async () => {
  const page = await source('app/services/[slug]/page.tsx')
  const hero = await source('components/store-profile-hero.tsx')

  assert.equal(storeStaticParams.length, 10)
  assert.equal(storeProfileStaticParams.length, 7)
  assert.deepEqual(
    storeStaticParams.map(({ slug }) => slug),
    stores.map(({ slug }) => slug)
  )
  assert.deepEqual(
    storeProfileStaticParams.map(({ slug }) => slug),
    [
      'steam',
      'epic-games-store',
      'gog',
      'ea-app',
      'ubisoft-store',
      'battle-net',
      'rockstar-store',
    ]
  )
  assert.equal(Object.keys(storeVisualTreatments).length, 10)
  assert.match(page, /return storeProfileStaticParams/)
  assert.match(page, /<StoreProfileHero store=\{store\} \/>/)
  assert.match(hero, /data-store-profile-hero=\{store\.slug\}/)
  assert.match(hero, /<StoreLogo store=\{store\} eager \/>/)
  assert.match(hero, /Official store/)
  assert.match(hero, /bg-\[#121212\]/)
  assert.doesNotMatch(hero, /getStoreVisualTreatment/)
  assert.doesNotMatch(hero, /bg-gradient-to-br/)
})

test('profile header integrates the objective description, accessible platform links, and the official CTA', async () => {
  const hero = await source('components/store-profile-hero.tsx')

  assert.match(hero, /store\.description/)
  assert.doesNotMatch(hero, /store\.digitalScope|Digital content/)
  assert.match(hero, /store\.platforms\.map/)
  assert.match(hero, /href=\{`\/\$\{platform\}`\}/)
  assert.match(hero, /platformLabels\[platform\]/)
  assert.match(hero, /href=\{store\.officialUrl\}/)
  assert.match(hero, /Visit official store/)
  assert.match(hero, /target="_blank"/)
  assert.match(hero, /rel="noopener noreferrer"/)
  assert.match(hero, /focus-visible:outline/)
  assert.equal((hero.match(/<a\b/g) || []).length, 1)
})

test('profiles keep internal digital and market scope out of the public profile UI', async () => {
  const page = await source('app/services/[slug]/page.tsx')
  const hero = await source('components/store-profile-hero.tsx')
  const publicProfile = `${page}\n${hero}`

  assert.doesNotMatch(publicProfile, /store\.digitalScope|Digital content/)
  assert.doesNotMatch(
    publicProfile,
    /Tracked market|United States|US market|market scope|source health|canonical store|tracking status/i
  )
  assert.doesNotMatch(publicProfile, /Store details|store-details-heading|<dl\b|<dt\b|<dd\b/)
  assert.doesNotMatch(publicProfile, /store\.marketScope/)
})

test('store availability state keeps one notice and preserves confirmed campaigns', async () => {
  const page = await source('app/services/[slug]/page.tsx')
  const availability = [
    { storeSlug: 'steam', availability: 'available' },
    { storeSlug: 'playstation-store', availability: 'temporarily_unavailable' },
  ]

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
      selectedStoreSlug: 'playstation-store',
      campaignCount: 2,
      availability,
      sourceUnavailable: false,
    }),
    'content-with-availability-notice'
  )
  assert.equal(
    getSalesSelectionState({
      selectedStoreSlug: 'steam',
      campaignCount: 2,
      availability,
      sourceUnavailable: false,
    }),
    'content'
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

  assert.equal(
    (page.match(/Sales data is temporarily unavailable for this store\./g) || [])
      .length,
    2
  )
  assert.match(page, /salesState === 'unavailable'[\s\S]*data-store-sales-state="unavailable"/)
  assert.match(page, /content-with-availability-notice'[\s\S]*Previously confirmed campaigns remain visible/)
  assert.match(page, /<CampaignSections/)
  assert.match(page, /emptyLiveMessage="No live official store campaigns right now\."/)
  assert.match(
    page,
    /emptyUpcomingMessage="No upcoming official store campaigns are currently announced\."/
  )
  assert.doesNotMatch(page, /dataUnavailable=/)
  assert.doesNotMatch(page, /Current campaign availability cannot be confirmed|Upcoming campaign availability cannot be confirmed/)
})

test('Xbox Store keeps its canonical internal entity and Rockstar keeps its fallback', async () => {
  const microsoft = stores.find(({ slug }) => slug === 'microsoft-store')
  const rockstar = stores.find(({ slug }) => slug === 'rockstar-store')
  const logo = await source('components/store-logo.tsx')

  assert.equal(microsoft?.name, 'Xbox Store')
  assert.deepEqual(microsoft?.platforms, ['pc', 'xbox'])
  assert.equal(microsoft?.logo?.src, '/platforms/xbox/logo.png')
  assert.equal(storeStaticParams.filter(({ slug }) => slug === 'microsoft-store').length, 1)
  assert.equal(
    storeProfileStaticParams.some(({ slug }) => slug === 'microsoft-store'),
    false
  )
  assert.equal(storeStaticParams.some(({ slug }) => slug === 'xbox-store'), false)
  assert.equal(rockstar?.logo, null)
  assert.match(logo, /data-store-logo-fallback="rockstar-store"/)
  assert.match(storeVisualTreatments['rockstar-store'].surface, /72500f/)
})

test('approved Home, Sales, platform, and campaign contracts remain shared', async () => {
  const home = await source('app/page.tsx')
  const sales = await source('components/sales-browser.tsx')
  const platform = await source('components/platform-page.tsx')
  const sections = await source('components/campaign-sections.tsx')

  assert.match(home, /<HomeHero \/>/)
  assert.match(home, /Explore by Platform/)
  assert.match(sales, /data-sales-store-filter/)
  assert.match(sales, /All official stores/)
  assert.match(platform, /<PlatformHero/)
  assert.match(platform, /Official Stores/)
  assert.match(sections, /<CampaignCard/)
  assert.match(sections, /<UpcomingCampaignList/)
})
