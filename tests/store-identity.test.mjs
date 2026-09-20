import assert from 'node:assert/strict'
import test from 'node:test'
import { access, readFile, readdir } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadModule } from './helpers/load-module.mjs'

const { StoreIdentity, PCIdentity } = await loadModule('components/store-identity.tsx')
const { PlatformCard } = await loadModule('components/platform-card.tsx')
const { CampaignArtwork } = await loadModule('components/campaign-artwork.tsx')
const { stores, getStoreBySlug } = await loadModule('lib/stores.ts')
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const names = ['PlayStation Store', 'Nintendo eShop', 'Xbox Store', 'Steam', 'Epic Games Store', 'GOG', 'EA app', 'Ubisoft Store', 'Battle.net', 'Rockstar Store']

test('ten unchanged official names share text identities in every variant', () => {
  assert.deepEqual(stores.map(store => store.name), names)
  for (const store of stores) {
    assert.equal(Object.hasOwn(store, 'logo'), false)
    for (const variant of ['standard', 'platform', 'campaign', 'mini', 'hero']) {
      const html = render(StoreIdentity, { store, variant })
      assert.ok(html.includes(`data-identity="${store.slug}"`))
      assert.ok(html.includes(`data-identity-variant="${variant}"`))
      assert.equal(html.replace(/<[^>]*>/g, '').trim(), store.name)
      assert.equal((html.match(/aria-hidden="true"/g) || []).length, variant === 'mini' ? 2 : 4)
      assert.doesNotMatch(html, /<img|<svg|aria-label|Rockstar.*lockup|brightness|invert/)
    }
  }
})

test('unknown identity uses its supplied name and the neutral treatment', () => {
  const html = render(StoreIdentity, { store: { slug: 'unknown', name: 'Unknown Store' } })
  assert.match(html, />Unknown Store<\/span>/)
  assert.match(html, /--identity-accent:#aaa8a4/)
  assert.doesNotMatch(html, /Rockstar|verified|logo/i)
})

test('PC is a separate neutral platform in both languages, never Steam', async () => {
  assert.equal(getStoreBySlug('pc'), undefined)
  assert.equal(stores.length, 10)
  assert.match(render(PCIdentity, {}), /data-identity="pc"/)
  for (const locale of ['en', 'es']) {
    const html = render(PlatformCard, { platform: 'pc', locale })
    assert.match(html, /data-identity="pc"/)
    assert.doesNotMatch(html, /Steam|data-identity="steam"/)
    assert.ok(html.includes(`href="${locale === 'es' ? '/es' : ''}/pc"`))
  }
  const hero = await readFile('components/home-hero.tsx', 'utf8')
  assert.match(hero, /<PCIdentity variant="hero"/)
  assert.doesNotMatch(hero, /steam/i)
})

test('campaign fallback preserves names and uses original identities in EN and ES', () => {
  for (const locale of ['en', 'es']) for (const store of stores) {
    const html = render(CampaignArtwork, { locale, store, campaignName: 'Official Campaign', compact: false, state: 'live' })
    assert.match(html, /data-artwork-fallback/)
    assert.ok(html.includes(`data-identity="${store.slug}"`))
    assert.match(html, /Official Campaign/)
    assert.doesNotMatch(html, /<img/)
  }
})

test('runtime has no retired image paths or official logo renderer', async () => {
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : `${dir}/${entry.name}`))).flat()
  }
  for (const file of (await Promise.all(['app', 'components', 'lib'].map(walk))).flat().filter(file => /\.(tsx?|css)$/.test(file))) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, /\/(?:services|platforms)\/[^'"\s]+\/logo\.(?:png|svg)/, file)
    assert.doesNotMatch(source, /StoreLogo|no verified local logo|Steam, visual reference/, file)
  }
  const layout = await readFile('app/layout.tsx', 'utf8')
  assert.match(layout, /identityRoboto = Roboto\(/)
  assert.match(layout, /weight: '900'/)
  const css = await readFile('app/globals.css', 'utf8')
  assert.match(css, /font-family: var\(--font-identity\), sans-serif/)
  assert.match(css, /body\s*\{[^}]*font-family: var\(--font-geist-sans\)/)
})

test('retired official identity files are absent from public', async () => {
  for (const store of stores) {
    const directory = store.slug === 'microsoft-store' ? 'platforms/xbox' : `services/${store.slug}`
    const extension = ['ubisoft-store', 'battle-net', 'rockstar-store'].includes(store.slug) ? 'svg' : 'png'
    await assert.rejects(access(`public/${directory}/logo.${extension}`), { code: 'ENOENT' })
  }
})
