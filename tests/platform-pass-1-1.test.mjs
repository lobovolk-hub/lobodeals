import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { getStoresByPlatform, stores } from '../lib/stores.ts'
import { storeVisualTreatments } from '../lib/store-visuals.ts'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('StoreCard and profile hero give the shared StoreIdentity contract a real width', async () => {
  const card = await source('components/store-card.tsx')
  const profile = await source('components/store-profile-page.tsx')
  const profileHero = await source('components/store-profile-hero.tsx')

  assert.match(card, /className="relative w-full[^"]*"/)
  assert.match(
    card,
    /<StoreIdentity[\s\S]*?store=\{store\}[\s\S]*?\/>/
  )
  assert.match(profile, /<StoreProfileHero locale=\{locale\} store=\{store\} \/>/)
  assert.match(
    profileHero,
    /className="relative w-full">\s*<StoreIdentity store=\{store\} \/>/
  )
  assert.equal((card.match(/<StoreIdentity\b/g) || []).length, 1)
})

test('Rockstar uses the shared original identity system', async () => {
  const logo = await source('components/store-identity.tsx')
  const rockstar = stores.find((store) => store.slug === 'rockstar-store')

  assert.equal(rockstar.name, 'Rockstar Store')
  assert.doesNotMatch(logo, /data-rockstar-store-lockup/)
})

test('PC card routes, Xbox identity, and store colors remain unchanged', () => {
  const pcStores = getStoresByPlatform('pc')
  const microsoft = pcStores.find((store) => store.slug === 'microsoft-store')

  assert.equal(pcStores.length, 8)
  assert.equal(new Set(pcStores.map((store) => store.slug)).size, 8)
  assert.equal(microsoft?.name, 'Xbox Store')
  assert.equal(microsoft.name, 'Xbox Store')
  assert.equal(Object.keys(storeVisualTreatments).length, 10)
  assert.match(storeVisualTreatments['microsoft-store'].surface, /155b32/)
  assert.match(storeVisualTreatments['ubisoft-store'].surface, /264d79/)
  assert.match(storeVisualTreatments['battle-net'].surface, /075a94/)
  assert.match(storeVisualTreatments['rockstar-store'].surface, /72500f/)
})
