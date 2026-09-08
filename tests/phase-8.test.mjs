import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { getStoreCreatorCode } from '../lib/monetization.ts'
import { stores } from '../lib/stores.ts'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('Epic is the only store with an approved creator code', () => {
  assert.deepEqual(getStoreCreatorCode('epic-games-store'), {
    code: 'LOBOVOLK',
    disclosure:
      'LoboDeals may earn from eligible purchases made with this code.',
  })

  for (const store of stores) {
    if (store.slug === 'epic-games-store') continue
    assert.equal(getStoreCreatorCode(store.slug), null, store.slug)
  }
})

test('Epic creator code is discreetly limited to the store profile', async () => {
  const hero = await source('components/store-profile-hero.tsx')
  const platform = await source('components/single-store-summary.tsx')
  const campaignCard = await source('components/campaign-card.tsx')
  const upcoming = await source('components/upcoming-campaign-list.tsx')
  const sales = await source('components/sales-browser.tsx')
  const home = await source('app/page.tsx')

  assert.match(hero, /getStoreCreatorCode/)
  assert.match(hero, /data-store-creator-code/)
  assert.match(hero, /Creator code:/)
  assert.match(hero, /creatorCode\.code/)
  assert.match(hero, /creatorCode\.disclosure/)

  for (const publicSurface of [platform, campaignCard, upcoming, sales, home]) {
    assert.doesNotMatch(publicSurface, /LOBOVOLK|getStoreCreatorCode|data-store-creator-code/)
  }
})

test('creator-code monetization preserves the official outbound contract', async () => {
  const hero = await source('components/store-profile-hero.tsx')

  assert.match(hero, /href=\{store\.officialUrl\}/)
  assert.match(hero, /data-lobodeals-outbound="true"/)
  assert.match(hero, /data-analytics-surface="store_profile"/)
  assert.match(hero, /data-outbound-type="store"/)
  assert.match(hero, /data-link-mode="official"/)
  assert.match(hero, /rel="noopener noreferrer"/)
  assert.match(hero, /Visit official store/)
})

test('creator-code monetization stays out of Directory, Sales, and backend models', async () => {
  const storesSource = await source('lib/stores.ts')
  const salesSource = await source('lib/sales.ts')
  const monitor = await source('supabase/functions/campaign-monitoring/index.ts')

  for (const modelSource of [storesSource, salesSource, monitor]) {
    assert.doesNotMatch(
      modelSource,
      /LOBOVOLK|creatorCode|creator_code|affiliateUrl|affiliate_url/
    )
  }
})