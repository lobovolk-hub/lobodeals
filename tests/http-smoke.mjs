import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'

const root = process.cwd()
const host = '127.0.0.1'
const readinessTimeout = 20_000

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function reserveAvailablePort() {
  const listener = createServer()

  await new Promise((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(0, host, resolve)
  })

  const address = listener.address()
  assert.ok(address && typeof address === 'object')

  await new Promise((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()))
  })

  return address.port
}

async function fetchRoute(baseUrl, route, headers = {}) {
  const response = await fetch(baseUrl + route, {
    redirect: 'manual',
    headers: { accept: 'text/html', ...headers },
    signal: AbortSignal.timeout(15_000),
  })
  const body = await response.text()

  return { response, body }
}

function readCanonical(html) {
  const link = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i)?.[0]
  const href = link?.match(/href=["']([^"']+)["']/i)?.[1]

  assert.ok(href, 'Expected a canonical link in rendered HTML')
  return href
}

function readMetaContent(html, attribute, value) {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? []

  for (const tag of tags) {
    const key = tag.match(
      new RegExp(`${attribute}=["']([^"']+)["']`, 'i')
    )?.[1]

    if (key !== value) continue

    const content = tag.match(/content=["']([^"']*)["']/i)?.[1]
    assert.notEqual(content, undefined, `Expected content for ${value}`)
    return content
  }

  assert.fail(`Expected metadata field ${value}`)
}

async function stopServer(server, exitPromise) {
  if (server.exitCode !== null || server.signalCode !== null) return

  server.kill('SIGTERM')
  await Promise.race([exitPromise, delay(3_000)])

  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL')
    await exitPromise
  }
}

const port = await reserveAvailablePort()
const baseUrl = `http://${host}:${port}`
const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const server = spawn(
  process.execPath,
  [nextCli, 'start', '--hostname', host, '--port', String(port)],
  {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }
)
let stdout = ''
let stderr = ''

server.stdout.setEncoding('utf8')
server.stderr.setEncoding('utf8')
server.stdout.on('data', (chunk) => {
  stdout += chunk
})
server.stderr.on('data', (chunk) => {
  stderr += chunk
})

const exitPromise = new Promise((resolve) => {
  server.once('exit', (code, signal) => resolve({ code, signal }))
})

let noFallbackError = false

try {
  const deadline = Date.now() + readinessTimeout

  while (true) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`next start exited before readiness\n${stdout}\n${stderr}`)
    }

    try {
      const { response } = await fetchRoute(baseUrl, '/')

      if (response.status === 200) break
    } catch {
      // The server is still starting.
    }

    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for next start\n${stdout}\n${stderr}`)
    }

    await delay(100)
  }

  const currentRoutes = [
    '/',
    '/playstation',
    '/pc',
    '/nintendo',
    '/xbox',
    '/sales',
    '/about',
    '/services/steam',
    '/services/epic-games-store',
    '/services/gog',
    '/services/ea-app',
    '/services/ubisoft-store',
    '/services/battle-net',
    '/services/rockstar-store',
  ]

  for (const route of currentRoutes) {
    const { response, body } = await fetchRoute(baseUrl, route)
    assert.equal(response.status, 200, route)
    assert.match(body, /<html[^>]*lang="en"/, route)
    assert.equal(readMetaContent(body, 'name', 'robots'), 'index, follow', route)
    assert.doesNotMatch(body, /hrefLang=/i, route)
  }

  const redirects = new Map([
    ['/deals', '/sales'],
    ['/services/playstation-store', '/playstation'],
    ['/services/nintendo-eshop', '/nintendo'],
    ['/services/microsoft-store', '/xbox'],
  ])

  for (const [source, destination] of redirects) {
    const redirect = await fetchRoute(baseUrl, source)
    assert.equal(redirect.response.status, 301, source)
    assert.equal(redirect.response.headers.get('location'), destination, source)
  }

  const retiredRoutes = [
    '/catalog',
    '/login',
    '/profile',
    '/tracked',
    '/auth/callback',
    '/us/playstation/test',
    '/us/playstation/saros',
    '/services/unknown-store',
    '/services/microsoft-xbox-store',
  ]

  for (const route of retiredRoutes) {
    const { response } = await fetchRoute(baseUrl, route)
    assert.equal(response.status, 404, route)
  }

  const canonicalRoutes = new Map([
    ['/', 'https://lobodeals.com'],
    ['/playstation', 'https://lobodeals.com/playstation'],
    ['/pc', 'https://lobodeals.com/pc'],
    ['/nintendo', 'https://lobodeals.com/nintendo'],
    ['/xbox', 'https://lobodeals.com/xbox'],
    ['/sales', 'https://lobodeals.com/sales'],
    ['/about', 'https://lobodeals.com/about'],
    ['/services/steam', 'https://lobodeals.com/services/steam'],
    [
      '/services/epic-games-store',
      'https://lobodeals.com/services/epic-games-store',
    ],
    ['/services/gog', 'https://lobodeals.com/services/gog'],
    ['/services/ea-app', 'https://lobodeals.com/services/ea-app'],
    [
      '/services/ubisoft-store',
      'https://lobodeals.com/services/ubisoft-store',
    ],
    [
      '/services/battle-net',
      'https://lobodeals.com/services/battle-net',
    ],
    [
      '/services/rockstar-store',
      'https://lobodeals.com/services/rockstar-store',
    ],
  ])

  for (const [route, expectedCanonical] of canonicalRoutes) {
    const { body } = await fetchRoute(baseUrl, route)
    assert.equal(
      new URL(readCanonical(body)).href,
      new URL(expectedCanonical).href,
      route
    )
  }

  const socialTitles = new Map([
    ['/', 'LoboDeals \u2014 Official game sales'],
    ['/playstation', 'PlayStation'],
    ['/pc', 'PC'],
    ['/nintendo', 'Nintendo'],
    ['/xbox', 'Xbox'],
    ['/sales', 'Sales'],
    ['/about', 'About'],
    ['/services/steam', 'Steam'],
    ['/services/epic-games-store', 'Epic Games Store'],
    ['/services/gog', 'GOG'],
    ['/services/ea-app', 'EA app'],
    ['/services/ubisoft-store', 'Ubisoft Store'],
    ['/services/battle-net', 'Battle.net'],
    ['/services/rockstar-store', 'Rockstar Store'],
  ])

  for (const [route, expectedTitle] of socialTitles) {
    const { body } = await fetchRoute(baseUrl, route)
    const expectedCanonical = canonicalRoutes.get(route)

    assert.ok(expectedCanonical, route)

    assert.equal(
      readMetaContent(body, 'property', 'og:title'),
      expectedTitle,
      `${route} og:title`
    )

    assert.equal(
      readMetaContent(body, 'name', 'twitter:title'),
      expectedTitle,
      `${route} twitter:title`
    )

    assert.equal(
      new URL(readMetaContent(body, 'property', 'og:url')).href,
      new URL(expectedCanonical).href,
      `${route} og:url`
    )

    assert.equal(
      new URL(
        readMetaContent(body, 'property', 'og:image'),
        'https://lobodeals.com'
      ).pathname,
      '/og/lobodeals-og-v2.png',
      `${route} og:image`
    )

    assert.equal(
      new URL(
        readMetaContent(body, 'name', 'twitter:image'),
        'https://lobodeals.com'
      ).pathname,
      '/og/lobodeals-og-v2.png',
      `${route} twitter:image`
    )
  }

  const spanishRoutes = currentRoutes.map((route) => `/es${route === '/' ? '' : route}`)
  for (const route of spanishRoutes) {
    const { response, body } = await fetchRoute(baseUrl, route, { cookie: 'lobodeals_language=en', 'accept-language': 'en-US' })
    assert.equal(response.status, 200, route)
    assert.match(response.headers.get('set-cookie'), /lobodeals_language=es/, route)
    assert.match(body, /<html[^>]*lang="es"/, route)
    assert.equal(readMetaContent(body, 'name', 'robots'), 'noindex, follow', route)
    assert.doesNotMatch(body, /<link[^>]*rel="canonical"/i, route)
    assert.doesNotMatch(body, /hrefLang=/i, route)
    assert.equal(new URL(readMetaContent(body, 'property', 'og:url')).pathname, route)
    assert.equal(new URL(readMetaContent(body, 'property', 'og:image')).pathname, '/og/lobodeals-og-v2.png', route)
    assert.equal(new URL(readMetaContent(body, 'name', 'twitter:image')).pathname, '/og/lobodeals-og-v2.png', route)
    // Approved Spanish copy must render without unresolved markers.
    assert.doesNotMatch(body, /PENDIENTE|APPROVED STRING REQUIRED/, route)
  }

  const invalidSpanishRoutes = ['/es/services/playstation-store', '/es/services/nintendo-eshop', '/es/services/microsoft-store', '/es/services/not-a-store', '/es/catalog', '/es/not-found.html', '/es/es/sales', '/en/sales']
  for (const route of invalidSpanishRoutes) {
    const { response, body } = await fetchRoute(baseUrl, route, { cookie: 'lobodeals_language=es', 'accept-language': 'es' })
    assert.equal(response.status, 404, route)
    assert.equal(response.headers.get('location'), null, route)
    assert.match(body, route.startsWith('/es/') ? /<html[^>]*lang="es"/ : /<html[^>]*lang="en"/, route)
  }

  for (const [headers, status, destination] of [
    [{ 'accept-language': 'es-PE,en;q=0.8' }, 307, '/es'],
    [{ 'accept-language': 'es-MX' }, 307, '/es'],
    [{ 'accept-language': 'en-US' }, 200, null],
    [{ 'accept-language': 'fr' }, 200, null],
    [{ 'accept-language': 'es;q=0,en;q=1' }, 200, null],
    [{ 'accept-language': 'es', cookie: 'lobodeals_language=en' }, 200, null],
    [{ 'accept-language': 'en', cookie: 'lobodeals_language=es' }, 307, '/es'],
    [{ 'accept-language': 'es', 'user-agent': 'Twitterbot' }, 200, null],
    [{ 'accept-language': 'es', purpose: 'prefetch' }, 200, null],
  ]) {
    const { response } = await fetchRoute(baseUrl, '/', headers)
    assert.equal(response.status, status, JSON.stringify(headers))
    assert.equal(response.headers.get('location') ? new URL(response.headers.get('location'), baseUrl).pathname : null, destination)
    if (destination) {
      const next = await fetchRoute(baseUrl, destination, { cookie: 'lobodeals_language=es', 'accept-language': 'en' })
      assert.equal(next.response.status, 200)
      assert.equal(next.response.headers.get('location'), null)
    }
  }
  // Explicit URLs, including history entries, win in both directions.
  let preference = 'en'
  for (const route of ['/es/sales', '/sales', '/es/sales', '/sales', '/es/services/gog', '/services/gog']) {
    const locale = route.startsWith('/es/') ? 'es' : 'en'
    const { response, body } = await fetchRoute(baseUrl, route, { cookie: 'lobodeals_language=' + preference, 'accept-language': 'es-PE' })
    assert.equal(response.status, 200, route)
    assert.equal(response.headers.get('location'), null, route)
    assert.ok(response.headers.get('set-cookie').includes('lobodeals_language=' + locale), route)
    assert.ok(body.includes('lang="' + locale + '"'), route)
    preference = locale
  }
  const sitemap = await fetchRoute(baseUrl, '/sitemap.xml', { 'accept-language': 'es' })
  assert.equal(sitemap.response.status, 200)
  assert.equal((sitemap.body.match(/<loc>/g) || []).length, 14)
  assert.doesNotMatch(sitemap.body, /lobodeals\.com\/es(?:<|\/)/)
  const robots = await fetchRoute(baseUrl, '/robots.txt', { 'accept-language': 'es' })
  assert.equal(robots.response.status, 200)
  assert.doesNotMatch(robots.body, /Disallow:\s*\/es/i)

  await delay(200)
  noFallbackError = /NoFallbackError/.test(stderr)
} finally {
  await stopServer(server, exitPromise)
}

assert.equal(
  noFallbackError,
  false,
  'next start must not emit NoFallbackError for an unknown store'
)

console.log(
  'HTTP smoke passed: 14 EN + 14 ES routes, 4 exact redirects, 17 real 404s, 14 EN canonicals, ES noindex/no canonical, V2 OG/Twitter, 9 root negotiation scenarios + 6 explicit/history requests, sitemap/robots, and no NoFallbackError. Approved Spanish copy has no pending markers.'
)
