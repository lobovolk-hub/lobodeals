import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('Home hero keeps stable product copy and four nonessential platform visuals', async () => {
  const hero = await source('components/home-hero.tsx')
  const home = await source('app/page.tsx')

  assert.match(hero, /Know where official game sales are happening\s*<\/h1>/)
  assert.doesNotMatch(hero, /Know where official game sales are happening\./)
  assert.equal((hero.match(/platform: '/g) || []).length, 4)
  for (const platform of ['PlayStation', 'PC', 'Nintendo', 'Xbox']) {
    assert.match(hero, new RegExp(`platform: '${platform}'`))
  }
  assert.match(hero, /href="\/sales"/)
  assert.match(hero, /href="#platforms"/)
  assert.match(home, /<HomeHero \/>[\s\S]*?Explore by Platform/)
  assert.doesNotMatch(`${home}\n${hero}`, /United States|US market scope/i)
})

test('hero autoplay is resettable and reduced motion starts paused', async () => {
  const hero = await source('components/home-hero.tsx')

  assert.match(hero, /ROTATION_INTERVAL_MS = 8_000/)
  assert.match(hero, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/)
  assert.match(hero, /setAutoplayEnabled\(!media\.matches\)/)
  assert.match(hero, /if \(!autoplayEnabled\) return/)
  assert.match(hero, /setTimerReset\(\(current\) => current \+ 1\)/)
})

test('hero controls expose previous, next, indicators, and keyboard navigation', async () => {
  const hero = await source('components/home-hero.tsx')

  assert.match(hero, /aria-label="Previous platform visual"/)
  assert.match(hero, /aria-label="Next platform visual"/)
  assert.match(hero, /aria-label=\{`Show \$\{slide\.platform\} visual`\}/)
  assert.match(hero, /aria-pressed=\{activeSlide === index\}/)
  assert.match(hero, /event\.key !== 'ArrowLeft'/)
  assert.match(hero, /event\.key !== 'ArrowRight'/)
  assert.match(hero, /aria-label=\{autoplayEnabled \? 'Pause slideshow' : 'Play slideshow'\}/)
  assert.equal((hero.match(/<button\b/g) || []).length, 4)
})

test('platform cards share one hierarchy and remove the redundant label', async () => {
  const platform = await source('components/platform-card.tsx')

  assert.doesNotMatch(platform, /Official stores/i)
  assert.ok(platform.indexOf('<h3') < platform.indexOf('<PlatformIdentity'))
  assert.ok(platform.indexOf('<PlatformIdentity') < platform.indexOf('presentation.description'))
  assert.ok(platform.indexOf('presentation.description') < platform.indexOf('View platform'))
  assert.match(platform, /platformStores\.length/)
  assert.match(platform, /slug === 'steam'/)
  assert.match(platform, /eight PC stores/)
})

test('Xbox Store keeps the existing internal store contract and Xbox visual identity', async () => {
  const stores = await source('lib/stores.ts')
  const docs = await source('docs/service-brand-assets.md')

  assert.match(stores, /slug: 'microsoft-store'/)
  assert.match(stores, /name: 'Xbox Store'/)
  assert.match(stores, /platforms: \['pc', 'xbox'\]/)
  assert.match(stores, /officialUrl: 'https:\/\/apps\.microsoft\.com\/games\?hl=en-US&gl=US'/)
  assert.match(stores, /slug: 'microsoft-store'[\s\S]*?src: '\/platforms\/xbox\/logo\.png'/)
  assert.match(docs, /canonical Xbox Store throughout the gaming frontend/)
  await assert.rejects(
    access(path.join(root, 'public/services/microsoft-store/logo.png'))
  )
})

test('fallback artwork turns the existing campaign name into the visual subject', async () => {
  const artwork = await source('components/campaign-artwork.tsx')
  const card = await source('components/campaign-card.tsx')

  assert.match(artwork, /data-campaign-title-art/)
  assert.match(artwork, /\{campaignName\}/)
  assert.match(artwork, /Official sale campaign/)
  assert.match(artwork, /<StoreLogo store=\{store\} variant="mini"/)
  assert.match(card, /state=\{state\}/)
  assert.doesNotMatch(
    artwork,
    /(?:campaignArtwork|artworkMap|manualArtwork|campaignNameMap)\s*=\s*[{[]/i
  )
})

test('Live energy and exact counters derive seconds without altering source precision', async () => {
  const card = await source('components/campaign-card.tsx')
  const timing = await source('lib/campaign-timing.ts')
  const css = await source('app/globals.css')

  assert.match(card, /live-indicator-dot/)
  assert.match(timing, /`\$\{prefix\} \$\{days\}d \$\{hours\}h \$\{minutes\}m \$\{seconds\}s`/)
  assert.match(timing, /SECOND_MS = 1_000/)
  assert.match(css, /@keyframes live-signal/)
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.live-indicator-dot[\s\S]*?animation: none/
  )
})

test('hero uses only documented local brand assets and no campaign mappings', async () => {
  const hero = await source('components/home-hero.tsx')
  const docs = await source('docs/service-brand-assets.md')

  assert.match(docs, /Home platform spotlight reuses the verified/)
  assert.match(docs, /No campaign, game,[\s\S]*generated artwork is stored for the hero/)
  assert.doesNotMatch(hero, /https?:\/\//)
  assert.doesNotMatch(hero, /unsplash|pexels|pixabay|imagegen|openai/i)
  assert.doesNotMatch(hero, /campaign.*(?:map|mapping)/i)
})
