import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

async function collectSourceFiles(relativeDirectory) {
  const directory = path.join(root, relativeDirectory)
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(relativePath)))
      continue
    }

    if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) {
      files.push(relativePath)
    }
  }

  return files
}

test('public product surfaces do not expose the internal market', async () => {
  const files = [
    ...(await collectSourceFiles('app')),
    ...(await collectSourceFiles('components')),
  ]

  const publicSource = (
    await Promise.all(files.map((file) => source(file)))
  ).join('\n')

  assert.doesNotMatch(
    publicSource,
    /\b(?:United States|USA|US market|U\.S\. market|tracked market)\b/i
  )

  const layout = await source('app/layout.tsx')

  assert.doesNotMatch(layout, /locale:\s*'en_US'/)
})

test('About explains the approved product boundary', async () => {
  const about = await source('app/about/page.tsx')

  assert.match(about, /Directory \+ Sales/)
  assert.match(about, /does not sell games/)
  assert.match(about, /does not track individual game prices/)
  assert.match(about, /compare prices/)
  assert.match(about, /guarantee the lowest price/)
  assert.match(about, /official store\s+sources/)
  assert.match(about, /monitoring every individual discount/)
  assert.match(about, /does not invent a time/)
  assert.match(about, /authorized affiliate link/)
  assert.match(
    about,
    /do not\s+affect which stores or sales are listed/
  )
  assert.match(about, /A LoboVolk brand/)
})

test('existing GTM integration remains conditional', async () => {
  const layout = await source('app/layout.tsx')

  assert.match(layout, /NEXT_PUBLIC_GTM_ID/)
  assert.match(layout, /\^GTM-\[A-Z0-9\]\+\$/)
  assert.match(layout, /googletagmanager\.com\/gtm\.js/)
  assert.match(layout, /googletagmanager\.com\/ns\.html/)
  assert.match(layout, /dataLayer/)
})

test('one global client listener owns outbound analytics', async () => {
  const layout = await source('app/layout.tsx')
  const analytics = await source(
    'components/outbound-analytics.tsx'
  )

  assert.match(layout, /<OutboundAnalytics \/>/)
  assert.match(analytics, /'use client'/)
  assert.match(analytics, /document\.addEventListener\('click'/)
  assert.match(analytics, /lobodeals_outbound_click/)
  assert.match(analytics, /window\.dataLayer/)
  assert.match(analytics, /outbound_type/)
  assert.match(analytics, /store_slug/)
  assert.match(analytics, /store_name/)
  assert.match(analytics, /sale_campaign_id/)
  assert.match(analytics, /sale_campaign_name/)
  assert.match(analytics, /link_mode/)

  assert.doesNotMatch(
    analytics,
    /email|user_id|userId|ip_address|latitude|longitude/i
  )

  assert.doesNotMatch(analytics, /\bcampaign_id\b/)
  assert.doesNotMatch(analytics, /\bcampaign_name\b/)
  assert.doesNotMatch(analytics, /dataset\.campaignId/)
  assert.doesNotMatch(analytics, /dataset\.campaignName/)
})

test('campaign links preserve anchors and expose analytics metadata', async () => {
  const home = await source('app/page.tsx')
  const platform = await source('components/platform-page.tsx')
  const sales = await source('components/sales-browser.tsx')
  const profile = await source('app/services/[slug]/page.tsx')
  const card = await source('components/campaign-card.tsx')
  const list = await source(
    'components/upcoming-campaign-list.tsx'
  )

  assert.match(home, /analyticsSurface="home"/)
  assert.match(platform, /analyticsSurface="platform"/)
  assert.match(sales, /analyticsSurface="sales"/)
  assert.match(profile, /analyticsSurface="store_profile"/)

  assert.equal((card.match(/<a\b/g) || []).length, 1)
  assert.match(card, /data-lobodeals-outbound="true"/)
  assert.match(card, /data-analytics-surface=\{analyticsSurface\}/)
  assert.match(card, /data-outbound-type="sale"/)
  assert.match(card, /data-store-slug=\{store\.slug\}/)
  assert.match(card, /data-sale-campaign-id=\{campaign\.id\}/)
  assert.match(card, /data-sale-campaign-name=\{campaign\.name\}/)
  assert.match(card, /href=\{campaign\.officialUrl\}/)

  assert.equal((list.match(/<a\b/g) || []).length, 1)
  assert.match(list, /data-lobodeals-outbound="true"/)
  assert.match(list, /data-analytics-surface=\{analyticsSurface\}/)
  assert.match(list, /data-outbound-type="sale"/)
  assert.match(list, /data-sale-campaign-id=\{campaign\.id\}/)
  assert.match(list, /data-sale-campaign-name=\{campaign\.name\}/)
  assert.match(list, /href=\{campaign\.officialUrl\}/)
})

test('store CTAs preserve official destinations and analytics surfaces', async () => {
  const platform = await source(
    'components/single-store-summary.tsx'
  )
  const profile = await source(
    'components/store-profile-hero.tsx'
  )

  assert.equal((platform.match(/<a\b/g) || []).length, 1)
  assert.match(platform, /data-analytics-surface="platform"/)
  assert.match(platform, /data-outbound-type="store"/)
  assert.match(platform, /data-store-slug=\{store\.slug\}/)
  assert.match(platform, /href=\{store\.officialUrl\}/)

  assert.equal((profile.match(/<a\b/g) || []).length, 1)
  assert.match(profile, /data-analytics-surface="store_profile"/)
  assert.match(profile, /data-outbound-type="store"/)
  assert.match(profile, /data-store-slug=\{store\.slug\}/)
  assert.match(profile, /href=\{store\.officialUrl\}/)
})

test('internal USA-first backend contract remains intact', async () => {
  const sales = await source('lib/sales.ts')
  const stores = await source('lib/stores.ts')
  const persistence = await source(
    'supabase/functions/campaign-monitoring/_shared/persistence.ts'
  )

  assert.match(sales, /market: 'US'/)
  assert.match(stores, /United States/)
  assert.match(persistence, /market: 'US'/)
})