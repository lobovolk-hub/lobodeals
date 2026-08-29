import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { getCampaignCounter } from '../lib/campaign-timing.ts'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('hero is one full-bleed surface rather than an inner platform card', async () => {
  const hero = await source('components/home-hero.tsx')

  assert.match(hero, /<section[\s\S]*?data-hero-full-bleed/)
  assert.match(hero, /home-hero-full-bleed/)
  assert.match(hero, /absolute inset-0 bg-gradient-to-br/)
  assert.doesNotMatch(hero, /min-h-60 overflow-hidden rounded-2xl border/)
  assert.doesNotMatch(hero, /lg:grid-cols-\[minmax\(0,1\.05fr\)/)
})

test('four platform palettes and integrated visuals remain explicit', async () => {
  const hero = await source('components/home-hero.tsx')

  assert.equal((hero.match(/platform: '/g) || []).length, 4)
  for (const platform of ['PlayStation', 'PC', 'Nintendo', 'Xbox']) {
    assert.match(hero, new RegExp(`platform: '${platform}'`))
  }
  for (const color of ['#0759a5', '#235b78', '#d30a1c', '#16803d']) {
    assert.match(hero, new RegExp(color, 'i'))
  }
  assert.match(hero, /left-\[48%\]/)
  assert.doesNotMatch(hero, /https?:\/\//)
})

test('hero playback has an eight-second timer and persistent pause/play choice', async () => {
  const hero = await source('components/home-hero.tsx')

  assert.match(hero, /ROTATION_INTERVAL_MS = 8_000/)
  assert.match(hero, /playbackChoiceMade\.current = true/)
  assert.match(hero, /setPlayback\(!autoplayEnabled\)/)
  assert.match(hero, /'Pause slideshow' : 'Play slideshow'/)
  assert.match(hero, /if \(!autoplayEnabled\) return/)
  assert.match(hero, /setTimerReset\(\(current\) => current \+ 1\)/)
})

test('hero controls are centered, accessible, and reduced motion starts without autoplay', async () => {
  const hero = await source('components/home-hero.tsx')

  assert.match(hero, /absolute inset-x-0 bottom-4 z-30 flex justify-center/)
  assert.match(hero, /aria-label="Previous platform visual"/)
  assert.match(hero, /aria-label="Next platform visual"/)
  assert.match(hero, /aria-label=\{`Show \$\{slide\.platform\} visual`\}/)
  assert.match(hero, /aria-label=\{autoplayEnabled \? 'Pause slideshow' : 'Play slideshow'\}/)
  assert.match(hero, /event\.key !== 'ArrowLeft'/)
  assert.match(hero, /event\.key !== 'ArrowRight'/)
  assert.match(hero, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/)
  assert.match(hero, /setAutoplayEnabled\(!media\.matches\)/)
})

test('exact datetime countdown covers second, minute, and hour rollovers', () => {
  const boundary = { precision: 'datetime', dateTime: '2026-08-27T13:00:00Z' }

  assert.equal(
    getCampaignCounter(boundary, 'live', 'Ends', new Date('2026-08-27T12:00:00Z')),
    'Ends in 1h 0m 0s'
  )
  assert.equal(
    getCampaignCounter(boundary, 'live', 'Ends', new Date('2026-08-27T12:00:01Z')),
    'Ends in 59m 59s'
  )
  assert.equal(
    getCampaignCounter(boundary, 'live', 'Ends', new Date('2026-08-27T12:59:59Z')),
    'Ends in 1s'
  )
  assert.equal(
    getCampaignCounter(boundary, 'live', 'Ends', new Date('2026-08-27T13:00:00Z')),
    null
  )
})

test('shared client clock updates once per second without freezing at build time', async () => {
  const clock = await source('lib/use-shared-second-clock.ts')
  const component = await source('components/campaign-timing.tsx')

  assert.match(clock, /useSyncExternalStore/)
  assert.match(clock, /const SECOND_MS = 1_000/)
  assert.equal((clock.match(/setInterval\(/g) || []).length, 1)
  assert.match(clock, /currentTime = Date\.now\(\)/)
  assert.match(clock, /getServerSnapshot[\s\S]*?return 0/)
  assert.match(component, /useSharedSecondClock\(\)/)
  assert.doesNotMatch(component, /new Date\(\)\s*\)/)
})

test('date-only remains calendar-only while source formatting excludes seconds', async () => {
  const dateOnly = { precision: 'date', date: '2026-09-01' }
  const counter = getCampaignCounter(
    dateOnly,
    'live',
    'Ends',
    new Date(2026, 7, 27, 23, 59, 58)
  )

  assert.equal(counter, '5 days left')
  assert.doesNotMatch(counter, /\d+[hms]\b|:/)
  const sales = await source('lib/sales.ts')
  assert.match(sales, /minute: '2-digit'/)
  assert.doesNotMatch(sales, /second: '2-digit'/)
})

test('approved platform cards and Xbox identity remain untouched by the hero pass', async () => {
  const platform = await source('components/platform-card.tsx')
  const stores = await source('lib/stores.ts')
  const hero = await source('components/home-hero.tsx')

  assert.doesNotMatch(platform, /Official stores/i)
  assert.match(platform, /slug === 'steam'/)
  assert.match(platform, /eight PC stores/)
  assert.match(stores, /slug: 'microsoft-store'[\s\S]*?\/platforms\/xbox\/logo\.png/)
  assert.doesNotMatch(`${hero}\n${platform}`, /United States|US market scope/i)
})
