import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { getPlatformSalesState } from '../lib/sales-availability.ts'
import {
  getStorePublicHref,
  getStoresByPlatform,
  stores,
} from '../lib/stores.ts'
import { storeVisualTreatments } from '../lib/store-visuals.ts'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('platform hero keeps the approved rich shared visual baseline without assigning PC to a store', async () => {
  const hero = await source('components/platform-hero.tsx')
  const page = await source('components/platform-page.tsx')
  const routeSources = await Promise.all(
    ['playstation', 'pc', 'nintendo', 'xbox'].map((route) =>
      source(`app/${route}/page.tsx`)
    )
  )

  assert.match(page, /<PlatformHero/)
  assert.match(hero, /data-platform-hero=\{platform\}/)
  assert.match(hero, /platformHeroTreatments/)
  assert.match(hero, /bg-gradient-to-br/)
  assert.match(hero, /treatment\.surface/)
  assert.match(hero, /from-\[#0759a5\]/)
  assert.match(hero, /from-\[#235b78\]/)
  assert.match(hero, /from-\[#b10718\]/)
  assert.match(hero, /from-\[#16803d\]/)
  assert.match(hero, /background-image:linear-gradient/)
  assert.match(hero, /rotate-45/)
  assert.match(hero, /text-white\/\[0\.065\]/)
  assert.match(hero, /playstation-store\/logo\.png/)
  assert.doesNotMatch(hero, /steam\/logo\.png/)
  assert.match(hero, /nintendo-eshop\/logo\.png/)
  assert.match(hero, /platforms\/xbox\/logo\.png/)
  assert.match(hero, />\s*PC\s*</)
  assert.doesNotMatch(hero, /carousel|autoplay|<button/i)
  assert.doesNotMatch(`${page}\n${routeSources.join('\n')}`, /United States|US market|tracked market|market scope/i)
})

test('platform store counts and campaign projections remain exact', () => {
  assert.equal(getStoresByPlatform('playstation').length, 1)
  assert.equal(getStoresByPlatform('pc').length, 8)
  assert.equal(getStoresByPlatform('nintendo').length, 1)
  assert.equal(getStoresByPlatform('xbox').length, 1)
  assert.deepEqual(
    getStoresByPlatform('xbox').map((store) => store.slug),
    ['microsoft-store']
  )
})

test('store cards are compact LoboDeals-first directory entries with canonical destinations', async () => {
  const card = await source('components/store-card.tsx')
  const playstation = stores.find((store) => store.slug === 'playstation-store')
  const nintendo = stores.find((store) => store.slug === 'nintendo-eshop')
  const microsoft = stores.find((store) => store.slug === 'microsoft-store')
  const steam = stores.find((store) => store.slug === 'steam')

  assert.equal(Object.keys(storeVisualTreatments).length, 10)
  assert.equal((card.match(/<Link\b/g) || []).length, 1)
  assert.match(card, /href=\{getStorePublicHref\(store\)\}/)
  assert.equal(getStorePublicHref(playstation), '/playstation')
  assert.equal(getStorePublicHref(nintendo), '/nintendo')
  assert.equal(getStorePublicHref(microsoft), '/xbox')
  assert.equal(getStorePublicHref(steam), '/services/steam')
  assert.match(card, /aria-label=\{`View \$\{store\.name\}`\}/)
  assert.match(card, /getStoreVisualTreatment/)
  assert.match(card, /bg-gradient-to-br/)
  assert.match(card, /min-h-80/)
  assert.match(card, /visual\.surface/)
  assert.match(card, /visual\.border/)
  assert.match(card, /visual\.logoSurface/)
  assert.match(card, /visual\.tag/)
  assert.match(card, /visual\.cta/)
  assert.doesNotMatch(card, /store\.digitalScope|Digital content/)
  assert.match(card, /focus-visible:outline/)
  assert.match(card, /View store/)
  assert.doesNotMatch(card, /rating|ranking|recommended|best store/i)
})

test('Xbox Store keeps one canonical internal entity across PC and Xbox', () => {
  const microsoft = stores.find((store) => store.slug === 'microsoft-store')

  assert.ok(microsoft)
  assert.equal(microsoft.name, 'Xbox Store')
  assert.deepEqual(microsoft.platforms, ['pc', 'xbox'])
  assert.equal(microsoft.logo?.src, '/platforms/xbox/logo.png')
  assert.match(storeVisualTreatments['microsoft-store'].surface, /155b32/)
})

test('Rockstar keeps its text fallback with a restrained warm visual token', async () => {
  const logo = await source('components/store-logo.tsx')
  const rockstar = stores.find((store) => store.slug === 'rockstar-store')

  assert.equal(rockstar?.logo, null)
  assert.match(logo, /data-store-logo-fallback="rockstar-store"/)
  assert.match(logo, />\s*Rockstar\s*</)
  assert.match(storeVisualTreatments['rockstar-store'].surface, /72500f/)
})

test('platform availability suppresses partial warnings and keeps one blocked state', () => {
  const availability = [
    { storeSlug: 'steam', availability: 'available' },
    { storeSlug: 'epic-games-store', availability: 'temporarily_unavailable' },
    { storeSlug: 'playstation-store', availability: 'temporarily_unavailable' },
  ]

  assert.equal(
    getPlatformSalesState({
      storeSlugs: ['steam', 'epic-games-store'],
      campaignCount: 3,
      availability,
      sourceUnavailable: false,
    }),
    'content'
  )
  assert.equal(
    getPlatformSalesState({
      storeSlugs: ['playstation-store'],
      campaignCount: 0,
      availability,
      sourceUnavailable: false,
    }),
    'unavailable'
  )
  assert.equal(
    getPlatformSalesState({
      storeSlugs: ['playstation-store'],
      campaignCount: 1,
      availability,
      sourceUnavailable: false,
    }),
    'content-with-availability-notice'
  )
  assert.equal(
    getPlatformSalesState({
      storeSlugs: ['steam'],
      campaignCount: 0,
      availability,
      sourceUnavailable: false,
    }),
    'empty'
  )
})

test('platform pages retain Live cards and the compact Upcoming list', async () => {
  const page = await source('components/platform-page.tsx')
  const sections = await source('components/campaign-sections.tsx')

  assert.match(page, /<CampaignSections/)
  assert.match(sections, /<CampaignCard/)
  assert.match(sections, /<UpcomingCampaignList/)
  assert.match(sections, /homePreview \? \([\s\S]*<UpcomingRail>/)
})
