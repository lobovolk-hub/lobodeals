import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = process.cwd()

const approvedSlugs = [
  'playstation-store',
  'nintendo-eshop',
  'microsoft-store',
  'steam',
  'epic-games-store',
  'gog',
  'ea-app',
  'ubisoft-store',
  'battle-net',
  'rockstar-store',
]

const independentProfileSlugs = approvedSlugs.filter(
  (slug) =>
    !['playstation-store', 'nintendo-eshop', 'microsoft-store'].includes(slug)
)

const excludedStoreNames = [
  'Fanatical',
  'Green Man Gaming',
  'Gamesplanet',
  'Humble Store',
  'GamersGate',
  'GameBillet',
  'IsThereAnyDeal',
  'Deku Deals',
  'PSPrices',
  'PS Deals',
  'PlatPrices',
  'NT Deals',
  'NTPrices',
  'XB Deals',
  'XBXPrices',
]

const approvedAssetDirectories = approvedSlugs.filter(
  (slug) => !['microsoft-store', 'rockstar-store'].includes(slug)
)

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath))
    return true
  } catch {
    return false
  }
}

async function collectSourceFiles(relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory)

  if (!(await exists(relativeDirectory))) return []

  const entries = await readdir(absoluteDirectory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(relativePath)))
    } else if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)) {
      files.push(relativePath)
    }
  }

  return files
}

function transpileTypeScript(source, fileName) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  )

  assert.deepEqual(errors, [])
  return result.outputText
}

function toModuleUrl(source) {
  return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
}

async function sourceModuleUrl(relativePath) {
  const source = await readFile(path.join(root, relativePath), 'utf8')
  return toModuleUrl(transpileTypeScript(source, relativePath))
}

const storesModuleUrlPromise = sourceModuleUrl('lib/stores.ts')

async function loadStores() {
  return import(await storesModuleUrlPromise)
}

test('package exposes only the simple frontend workflow and used dependencies', async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8')
  )
  const dependencyNames = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  })

  assert.deepEqual(Object.keys(packageJson.scripts).sort(), [
    'build',
    'dev',
    'lint',
    'start',
    'test',
    'test:http',
  ])
  assert.equal(dependencyNames.some((name) => name.startsWith('@supabase/')), false)
  assert.equal(dependencyNames.includes('playwright'), false)
  assert.equal(dependencyNames.includes('next'), true)
  assert.equal(dependencyNames.includes('react'), true)
  assert.equal(dependencyNames.includes('react-dom'), true)
})

test('registry contains exactly the ten canonical stores with unique slugs', async () => {
  const { stores } = await loadStores()
  const slugs = stores.map((store) => store.slug)

  assert.equal(stores.length, 10)
  assert.equal(new Set(slugs).size, 10)
  assert.deepEqual(slugs, approvedSlugs)

  const canonicalStoreIdentities = stores.map((store) =>
    `${store.slug} ${store.name}`.toLocaleLowerCase('en-US')
  )

  for (const excludedName of excludedStoreNames) {
    assert.equal(
      canonicalStoreIdentities.some((identity) =>
        identity.includes(excludedName.toLocaleLowerCase('en-US'))
      ),
      false,
      excludedName + ' must not be a canonical store'
    )
  }

  for (const store of stores) {
    assert.ok(store.name)
    assert.ok(store.description)
    assert.ok(store.digitalScope)
    assert.match(store.marketScope, /United States/)
    assert.ok(store.platforms.length > 0)
    assert.equal(new Set(store.platforms).size, store.platforms.length)

    const officialUrl = new URL(store.officialUrl)
    assert.equal(officialUrl.protocol, 'https:')
    assert.ok(officialUrl.hostname)
  }
})

test('Xbox Store is one canonical store across PC and Xbox and Rockstar is present', async () => {
  const { getStoreBySlug, getStoresByPlatform, stores } = await loadStores()
  const xboxStore = getStoreBySlug('microsoft-store')
  const rockstar = getStoreBySlug('rockstar-store')

  assert.equal(xboxStore.name, 'Xbox Store')
  assert.deepEqual(xboxStore.platforms, ['pc', 'xbox'])
  assert.equal(
    xboxStore.officialUrl,
    'https://apps.microsoft.com/games?hl=en-US&gl=US'
  )
  assert.equal(
    stores.filter((store) => /Xbox/.test(store.name)).length,
    1
  )
  assert.equal(getStoresByPlatform('xbox').length, 1)
  assert.equal(getStoresByPlatform('pc').length, 8)
  assert.equal(getStoresByPlatform('playstation').length, 1)
  assert.equal(getStoresByPlatform('nintendo').length, 1)

  assert.equal(rockstar.name, 'Rockstar Store')
  assert.deepEqual(rockstar.platforms, ['pc'])
  assert.equal(rockstar.logo, null)
})

test('only approved store logo directories and own-brand assets remain', async () => {
  const assetEntries = await readdir(path.join(root, 'public/services'), {
    withFileTypes: true,
  })
  const assetDirectories = assetEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  assert.deepEqual(assetDirectories, [...approvedAssetDirectories].sort())

  for (const protectedPath of [
    'public/og/lobodeals-og.png',
    'public/platforms/xbox/logo.png',
    'app/favicon.ico',
    'app/icon.png',
    'app/apple-icon.png',
  ]) {
    assert.equal(await exists(protectedPath), true, protectedPath + ' should exist')
  }

  assert.equal(await exists('public/logo.png'), false)

  const socialCard = await readFile(
    path.join(root, 'public/og/lobodeals-og.png')
  )
  assert.equal(socialCard.readUInt32BE(16), 1200)
  assert.equal(socialCard.readUInt32BE(20), 630)
})

test('public route implementations match the approved surface', async () => {
  const appSources = await collectSourceFiles('app')
  const routeEntries = appSources
    .filter((file) => /(?:^|[\\/])(?:page|route)\.tsx?$/.test(file))
    .map((file) => file.split(path.sep).join('/'))
    .sort()

  assert.deepEqual(routeEntries, [
    'app/about/page.tsx',
    'app/nintendo/page.tsx',
    'app/page.tsx',
    'app/pc/page.tsx',
    'app/playstation/page.tsx',
    'app/sales/page.tsx',
    'app/services/[slug]/page.tsx',
    'app/xbox/page.tsx',
  ])
  assert.equal(await exists('app/services/page.tsx'), false)

  for (const retiredPath of [
    'app/auth',
    'app/catalog',
    'app/deals',
    'app/login',
    'app/profile',
    'app/tracked',
    'app/us',
    'proxy.ts',
    'scripts',
    'config',
    'data',
  ]) {
    assert.equal(await exists(retiredPath), false, retiredPath + ' should be absent')
  }
})

test('only the four approved exact 301 redirects are configured', async () => {
  const require = createRequire(import.meta.url)
  const loadConfig = require('next/dist/server/config').default
  const { PHASE_PRODUCTION_SERVER } = require('next/constants')
  const config = await loadConfig(PHASE_PRODUCTION_SERVER, root, {
    silent: true,
  })
  const redirects = await config.redirects()

  assert.deepEqual(redirects, [
    {
      source: '/deals',
      destination: '/sales',
      statusCode: 301,
    },
    {
      source: '/services/playstation-store',
      destination: '/playstation',
      statusCode: 301,
    },
    {
      source: '/services/nintendo-eshop',
      destination: '/nintendo',
      statusCode: 301,
    },
    {
      source: '/services/microsoft-store',
      destination: '/xbox',
      statusCode: 301,
    },
  ])

  for (const redirect of redirects) {
    assert.equal('permanent' in redirect, false)
  }
})

test('sitemap contains only current canonical routes', async () => {
  const storesUrl = await storesModuleUrlPromise
  const source = await readFile(path.join(root, 'app/sitemap.ts'), 'utf8')
  const transpiled = transpileTypeScript(source, 'app/sitemap.ts')
  const linked = transpiled.replace(
    /from ['"]@\/lib\/stores['"]/,
    "from '" + storesUrl + "'"
  )

  assert.notEqual(linked, transpiled)

  const sitemapModule = await import(toModuleUrl(linked))
  const paths = sitemapModule.default().map((entry) => new URL(entry.url).pathname)
  const expectedPaths = [
    '/',
    '/sales',
    '/about',
    '/playstation',
    '/pc',
    '/nintendo',
    '/xbox',
    ...independentProfileSlugs.map((slug) => '/services/' + slug),
  ]

  assert.deepEqual(paths, expectedPaths)
  assert.equal(new Set(paths).size, expectedPaths.length)
})

test('robots allows the public site without masking retired routes', async () => {
  const source = await readFile(path.join(root, 'app/robots.ts'), 'utf8')
  const robotsModule = await import(
    toModuleUrl(transpileTypeScript(source, 'app/robots.ts'))
  )
  const robots = robotsModule.default()

  assert.equal(robots.rules.userAgent, '*')
  assert.equal(robots.rules.allow, '/')
  assert.equal('disallow' in robots.rules, false)
  assert.match(robots.sitemap, /\/sitemap\.xml$/)
})

test('seven independent store profiles are static, reject unknown slugs, and contain campaign sections', async () => {
  const { storeProfileStaticParams } = await loadStores()
  const routeSource = await readFile(
    path.join(root, 'app/services/[slug]/page.tsx'),
    'utf8'
  )
  const heroSource = await readFile(
    path.join(root, 'components/store-profile-hero.tsx'),
    'utf8'
  )

  assert.deepEqual(
    storeProfileStaticParams.map(({ slug }) => slug),
    independentProfileSlugs
  )
  assert.doesNotMatch(routeSource, /export const dynamicParams = false/)
  assert.match(routeSource, /return storeProfileStaticParams/)
  assert.match(routeSource, /if \(!store\) notFound\(\)/)
  assert.match(routeSource, /<StoreProfileHero store=\{store\}/)
  assert.match(heroSource, /<StoreLogo store=\{store\}/)
  assert.match(heroSource, /Visit official store/)
  assert.match(routeSource, /<CampaignSections/)
})

test('home, platform, Sales, and shell protect the approved structure', async () => {
  const home = await readFile(path.join(root, 'app/page.tsx'), 'utf8')
  const hero = await readFile(path.join(root, 'components/home-hero.tsx'), 'utf8')
  const platform = await readFile(
    path.join(root, 'components/platform-page.tsx'),
    'utf8'
  )
  const sales = await readFile(path.join(root, 'app/sales/page.tsx'), 'utf8')
  const browser = await readFile(
    path.join(root, 'components/sales-browser.tsx'),
    'utf8'
  )
  const sections = await readFile(
    path.join(root, 'components/campaign-sections.tsx'),
    'utf8'
  )
  const shell = await readFile(
    path.join(root, 'components/site-shell.tsx'),
    'utf8'
  )
  const navigation = await readFile(
    path.join(root, 'components/site-navigation.tsx'),
    'utf8'
  )

  assert.ok(home.indexOf('Explore by Platform') < home.indexOf('<CampaignSections'))
  assert.match(home, /<HomeHero \/>/)
  assert.match(hero, /Know where official game sales are happening/)
  assert.ok(platform.indexOf('Official Stores') < platform.indexOf('<CampaignSections'))
  assert.match(platform, /<SingleStoreSummary[\s\S]*?platform=\{platform\}[\s\S]*?name=\{name\}[\s\S]*?store=\{singleStore\}[\s\S]*?\/>/)
  assert.match(sales, /<SalesBrowser/)
  assert.match(browser, /<header[\s\S]*data-sales-header[\s\S]*<select/)
  assert.match(browser, /<span className="sr-only">Filter by store<\/span>/)
  assert.match(browser, /All official stores/)
  assert.ok(
    sections.indexOf('Live now') < sections.indexOf('Announced official campaigns')
  )
  assert.match(sections, /Sales data is temporarily unavailable\./)
  assert.match(sections, /groups\.live\.map/)
  assert.match(sections, /groups\.upcoming\.map/)
  assert.doesNotMatch(sections, /dataUnavailable\s*\?\s*null\s*:/)
  assert.match(shell, /sticky top-0/)
  assert.match(shell, /<SiteNavigation \/>/)
  assert.match(shell, /href="\/"/)
  assert.match(shell, /href="\/about"/)
  assert.match(shell, /A LoboVolk brand/)

  for (const destination of [
    '/playstation',
    '/pc',
    '/nintendo',
    '/xbox',
    '/sales',
  ]) {
    assert.match(navigation, new RegExp(`href: '${destination}'`))
  }

  assert.doesNotMatch(navigation, /href: '\/'/)
  assert.doesNotMatch(navigation, /href: '\/about'/)
  assert.match(navigation, /usePathname/)
  assert.match(
    navigation,
    /href === '\/pc' && pathname\.startsWith\('\/services\/'\)/
  )
  assert.match(navigation, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(navigation, /aria-expanded=\{menuOpen\}/)
  assert.match(navigation, /Mobile primary navigation/)
})

test('visual pass keeps Home public-facing and makes cards fully navigable', async () => {
  const home = await readFile(path.join(root, 'app/page.tsx'), 'utf8')
  const hero = await readFile(path.join(root, 'components/home-hero.tsx'), 'utf8')
  const platformCard = await readFile(
    path.join(root, 'components/platform-card.tsx'),
    'utf8'
  )
  const campaignCard = await readFile(
    path.join(root, 'components/campaign-card.tsx'),
    'utf8'
  )
  const sections = await readFile(
    path.join(root, 'components/campaign-sections.tsx'),
    'utf8'
  )
  const upcomingRail = await readFile(
    path.join(root, 'components/upcoming-rail.tsx'),
    'utf8'
  )

  assert.match(hero, /Official game sales/i)
  assert.doesNotMatch(`${home}\n${hero}`, /United States|US market scope/i)
  assert.match(home, /<CampaignSections[\s\S]*?homePreview/)
  assert.match(sections, /<UpcomingRail>/)
  assert.match(upcomingRail, /overflow-x-auto/)
  assert.match(upcomingRail, /snap-mandatory/)
  assert.match(sections, /View all upcoming sales/)
  assert.match(sections, /href="\/sales"/)

  assert.equal((campaignCard.match(/<a\b/g) || []).length, 1)
  assert.ok(campaignCard.indexOf('<a\n') < campaignCard.indexOf('<StoreLogo'))
  assert.ok(
    campaignCard.indexOf('</a>') > campaignCard.indexOf('View official sale')
  )
  assert.match(campaignCard, /target="_blank"/)
  assert.match(campaignCard, /rel="noopener noreferrer"/)
  assert.match(campaignCard, /focus-visible:outline/)

  assert.equal((platformCard.match(/<Link\b/g) || []).length, 1)
  assert.match(platformCard, /aria-label=\{`Explore/)
  assert.match(platformCard, /cursor-pointer/)
  assert.match(platformCard, /focus-visible:outline/)
})

test('active runtime has no legacy data, auth, catalog, or pricing consumers', async () => {
  const runtimeFiles = (
    await Promise.all(
      ['app', 'components', 'lib'].map((directory) =>
        collectSourceFiles(directory)
      )
    )
  ).flat()
  const retiredPatterns = [
    /@supabase\//i,
    /catalog_public_cache/i,
    /psdeals/i,
    /metacritic/i,
    /auth\/callback/i,
    /create(?:Browser|Server)SupabaseClient/i,
    /["']\/(?:login|profile|tracked|catalog)(?:["'/?]|$)/i,
  ]

  for (const file of runtimeFiles) {
    const source = await readFile(path.join(root, file), 'utf8')

    for (const pattern of retiredPatterns) {
      assert.doesNotMatch(source, pattern, file + ' contains ' + pattern)
    }
  }
})

test('Sales source boundary reads only the new public feed and has no manual registry', async () => {
  const source = await readFile(path.join(root, 'lib/sales-source.ts'), 'utf8')

  assert.match(source, /EMPTY_CAMPAIGN_FEED/)
  assert.match(source, /\/rest\/v1\/sales_campaigns/)
  assert.match(source, /NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(source, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
  assert.match(source, /validateOfficialCampaigns/)
  assert.match(source, /functions\/v1\/campaign-monitoring/)
  assert.match(source, /sourceUnavailable/)
  assert.doesNotMatch(source, /@supabase\//i)
  assert.doesNotMatch(source, /campaigns?\s*=\s*\[\s*\{/i)
  assert.doesNotMatch(source, /curated|manual.*event|autumn/i)
})

test('repository guidance reflects closed authority and the completed legacy transition', async () => {
  const agents = await readFile(path.join(root, 'AGENTS.md'), 'utf8')
  const readme = await readFile(path.join(root, 'README.md'), 'utf8')
  const assetDoc = await readFile(
    path.join(root, 'docs/service-brand-assets.md'),
    'utf8'
  )

  assert.match(agents, /25 August 2026/)
  assert.match(agents, /P1–P11 are CLOSED/)
  assert.doesNotMatch(agents, /temporary protected exception/)
  assert.doesNotMatch(readme, /tracked \`sql\/\` directory/)
  assert.doesNotMatch(readme, /purely static|minimal, static/i)
  assert.match(readme, /campaign-monitoring/)

  for (const name of (await loadStores()).stores.map((store) => store.name)) {
    assert.match(assetDoc, new RegExp(name.replace(/[.*+?^$()|[\]\\]/g, '\\$&')))
  }
  assert.equal((assetDoc.match(/\| (?:VERIFIED|UNRESOLVED) \|/g) || []).length, 10)
})
