import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('hero media control uses recognizable inline SVG icons without font glyphs', async () => {
  const hero = await source('components/home-hero.tsx')

  assert.match(hero, /aria-label=\{autoplayEnabled \? 'Pause slideshow' : 'Play slideshow'\}/)
  assert.equal((hero.match(/<svg\b/g) || []).length, 2)
  assert.equal((hero.match(/viewBox="0 0 24 24"/g) || []).length, 2)
  assert.match(hero, /M7 5h3v14H7zM14 5h3v14h-3z/)
  assert.match(hero, /M8 5\.5v13l10-6\.5z/)
  assert.doesNotMatch(hero, /Ⅱ|▶/)
})

test('four hero states expose exactly the approved platform destinations', async () => {
  const hero = await source('components/home-hero.tsx')
  const destinations = ['/playstation', '/pc', '/nintendo', '/xbox']

  assert.equal((hero.match(/href: '\//g) || []).length, destinations.length)
  for (const destination of destinations) {
    assert.match(hero, new RegExp(`href: '${destination}'`))
  }
  assert.match(hero, /href=\{heroSlides\[activeSlide\]\.href\}/)
  assert.match(hero, /aria-label=\{`View \$\{activePlatform\} platform`\}/)
})

test('platform overlay is a sibling without nested interactive content', async () => {
  const hero = await source('components/home-hero.tsx')
  const overlayStart = hero.indexOf('<Link\n        data-hero-platform-link')
  const overlayEnd = hero.indexOf('</Link>', overlayStart)

  assert.ok(overlayStart > -1)
  assert.ok(overlayEnd > overlayStart)
  const overlay = hero.slice(overlayStart, overlayEnd)
  assert.equal((overlay.match(/<Link\b/g) || []).length, 1)
  assert.doesNotMatch(overlay, /<button\b/)
  assert.match(overlay, /absolute inset-0 z-10 cursor-pointer/)
  assert.match(hero, /pointer-events-none relative z-20/)
  assert.doesNotMatch(hero, /pointer-events-auto w-full/)
  assert.equal((hero.match(/pointer-events-auto inline-flex/g) || []).length, 2)
  assert.match(hero, /absolute inset-x-0 bottom-4 z-30/)
})

test('hero CTAs, slideshow controls, and reduced-motion behavior remain intact', async () => {
  const hero = await source('components/home-hero.tsx')

  assert.match(hero, /href="\/sales"/)
  assert.match(hero, /href="#platforms"/)
  assert.match(hero, /aria-label="Previous platform visual"/)
  assert.match(hero, /aria-label="Next platform visual"/)
  assert.match(hero, /aria-label=\{`Show \$\{slide\.platform\} visual`\}/)
  assert.equal((hero.match(/<button\b/g) || []).length, 4)
  assert.match(hero, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/)
  assert.match(hero, /setAutoplayEnabled\(!media\.matches\)/)
})

test('character-art decision is documented and no page screenshot was imported', async () => {
  const hero = await source('components/home-hero.tsx')
  const docs = await source('docs/service-brand-assets.md')

  assert.match(docs, /Home character artwork review — 27 August 2026/)
  assert.match(docs, /No character or game background asset was added/)
  assert.match(docs, /did not establish a sufficiently clear reuse basis/)
  assert.match(docs, /no homepage, store-page,[\s\S]*product-page, social/)
  assert.doesNotMatch(hero, /https?:\/\//)
  assert.doesNotMatch(hero, /astro|kratos|gordon|mario|master chief|marcus/i)
})
