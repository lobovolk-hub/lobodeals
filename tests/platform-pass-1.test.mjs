import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { getPlatformSalesState } from '../lib/sales-availability.ts'
import {
  getStoresByPlatform,
  stores,
} from '../lib/stores.ts'
import { storeVisualTreatments } from '../lib/store-visuals.ts'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('platform hero is static, shared, concise, and uses four approved identities', async () => {
  const hero = await source('components/platform-hero.tsx')
  const page = await source('components/platform-page.tsx')
  const routeSources = await Promise.all(
    ['playstation', 'pc', 'nintendo', 'xbox'].map((route) =>
      source(`app/${route}/page.tsx`)
    )
  )

  assert.match(page, /<PlatformHero/)
  assert.match(hero, /data-platform-hero=\{platform\}/)
  assert.match(hero, /from-\[#0759a5\][\s\S]*from-\[#235b78\][\s\S]*from-\[#b10718\][\s\S]*from-\[#16803d\]/)
  assert.match(hero, /playstation-store\/logo\.png/)
  assert.match(hero, /steam\/logo\.png/)
  assert.match(hero, /nintendo-eshop\/logo\.png/)
  assert.match(hero, /platforms\/xbox\/logo\.png/)
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

test('store cards share visual tokens and one accessible profile link', async () => {
  const card = await source('components/store-card.tsx')

  assert.equal(Object.keys(storeVisualTreatments).length, 10)
  assert.equal((card.match(/<Link\b/g) || []).length, 1)
  assert.match(card, /href=\{`\/services\/\$\{store\.slug\}`\}/)
  assert.match(card, /aria-label=\{`View \$\{store\.name\} store profile`\}/)
  assert.match(card, /focus-visible:outline/)
  assert.match(card, /motion-reduce:hover:translate-y-0/)
  assert.match(card, /View store/)
  assert.doesNotMatch(card, /rating|ranking|recommended|best store/i)
})

test('Xbox visual identity preserves the Microsoft canonical store contract', () => {
  const microsoft = stores.find((store) => store.slug === 'microsoft-store')

  assert.ok(microsoft)
  assert.equal(microsoft.name, 'Microsoft / Xbox Store')
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
