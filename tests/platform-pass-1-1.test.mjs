import assert from 'node:assert/strict'
import { access, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { getStoresByPlatform, stores } from '../lib/stores.ts'
import { storeVisualTreatments } from '../lib/store-visuals.ts'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('every configured store logo resolves to a non-empty local asset', async () => {
  const configuredStores = stores.filter((store) => store.logo)

  await Promise.all(
    configuredStores.map(async (store) => {
      const assetPath = path.join(root, 'public', store.logo.src)
      await access(assetPath)
      assert.ok((await stat(assetPath)).size > 0, `${store.slug} logo is empty`)
    })
  )
})

test('Ubisoft and Battle.net reuse their approved local assets', () => {
  const ubisoft = stores.find((store) => store.slug === 'ubisoft-store')
  const battleNet = stores.find((store) => store.slug === 'battle-net')

  assert.equal(ubisoft?.logo?.src, '/services/ubisoft-store/logo.svg')
  assert.deepEqual(
    [ubisoft?.logo?.width, ubisoft?.logo?.height],
    [722, 316]
  )
  assert.equal(battleNet?.logo?.src, '/services/battle-net/logo.svg')
  assert.deepEqual(
    [battleNet?.logo?.width, battleNet?.logo?.height],
    [1200, 717]
  )
})

test('StoreCard and profile hero give the shared StoreLogo contract a real width', async () => {
  const card = await source('components/store-card.tsx')
  const profile = await source('app/services/[slug]/page.tsx')
  const profileHero = await source('components/store-profile-hero.tsx')

  assert.match(
    card,
    /className="relative w-full[^\"]*">\s*<StoreLogo store=\{store\}/
  )
  assert.match(profile, /<StoreProfileHero store=\{store\} \/>/)
  assert.match(
    profileHero,
    /className="relative w-full">\s*<StoreLogo store=\{store\} eager \/>/
  )
  assert.equal((card.match(/<StoreLogo\b/g) || []).length, 1)
})

test('Rockstar retains a deliberate fallback without an unapproved asset', async () => {
  const logo = await source('components/store-logo.tsx')
  const rockstar = stores.find((store) => store.slug === 'rockstar-store')

  assert.equal(rockstar?.logo, null)
  assert.match(logo, /data-store-logo-fallback="rockstar-store"/)
  assert.match(logo, />\s*Rockstar\s*</)
})

test('PC card routes, Xbox identity, and store colors remain unchanged', () => {
  const pcStores = getStoresByPlatform('pc')
  const microsoft = pcStores.find((store) => store.slug === 'microsoft-store')

  assert.equal(pcStores.length, 8)
  assert.equal(new Set(pcStores.map((store) => store.slug)).size, 8)
  assert.equal(microsoft?.name, 'Microsoft / Xbox Store')
  assert.equal(microsoft?.logo?.src, '/platforms/xbox/logo.png')
  assert.equal(Object.keys(storeVisualTreatments).length, 10)
  assert.match(storeVisualTreatments['microsoft-store'].surface, /155b32/)
  assert.match(storeVisualTreatments['ubisoft-store'].surface, /264d79/)
  assert.match(storeVisualTreatments['battle-net'].surface, /075a94/)
  assert.match(storeVisualTreatments['rockstar-store'].surface, /72500f/)
})
