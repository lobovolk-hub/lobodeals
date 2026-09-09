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

async function fetchRoute(baseUrl, route) {
  const response = await fetch(baseUrl + route, {
    redirect: 'manual',
    signal: AbortSignal.timeout(3_000),
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
    const { response } = await fetchRoute(baseUrl, route)
    assert.equal(response.status, 200, route)
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
      '/og/lobodeals-og.png',
      `${route} og:image`
    )

    assert.equal(
      new URL(
        readMetaContent(body, 'name', 'twitter:image'),
        'https://lobodeals.com'
      ).pathname,
      '/og/lobodeals-og.png',
      `${route} twitter:image`
    )
  }

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
  'HTTP smoke passed: 14 current routes, 4 exact redirects, 9 real 404s, 14 canonicals, route-specific social metadata, and no NoFallbackError.'
)
