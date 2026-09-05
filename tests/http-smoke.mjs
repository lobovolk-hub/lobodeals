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
    '/sales',
    '/playstation',
    '/pc',
    '/nintendo',
    '/xbox',
    '/about',
    '/services/steam',
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
    '/services/unknown-store',
    '/services/microsoft-xbox-store',
  ]

  for (const route of retiredRoutes) {
    const { response } = await fetchRoute(baseUrl, route)
    assert.equal(response.status, 404, route)
  }

  const canonicalRoutes = new Map([
    ['/', 'https://lobodeals.com/'],
    ['/sales', 'https://lobodeals.com/sales'],
    ['/playstation', 'https://lobodeals.com/playstation'],
    ['/nintendo', 'https://lobodeals.com/nintendo'],
    ['/xbox', 'https://lobodeals.com/xbox'],
    ['/services/steam', 'https://lobodeals.com/services/steam'],
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
  'HTTP smoke passed: current canonical routes, 4 exact redirects, 8 real 404s, 7 canonicals, and no NoFallbackError.'
)
