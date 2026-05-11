import fs from 'node:fs/promises'
import path from 'node:path'

function getArgValue(name) {
  const prefix = `--${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readEdgeEndpointFromFile() {
  const edgeDevToolsFile = path.join(
    process.env.LOCALAPPDATA || '',
    'Microsoft',
    'Edge',
    'User Data',
    'DevToolsActivePort'
  )

  const raw = await fs.readFile(edgeDevToolsFile, 'utf8')
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  if (lines.length < 2) {
    throw new Error(`Invalid Edge DevToolsActivePort file: ${edgeDevToolsFile}`)
  }

  return `ws://127.0.0.1:${lines[0]}${lines[1]}`
}

function createClient(endpoint) {
  let id = 0
  const pending = new Map()
  const socket = new WebSocket(endpoint)

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)

    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timeout } = pending.get(message.id)
      clearTimeout(timeout)
      pending.delete(message.id)

      if (message.error) {
        reject(new Error(JSON.stringify(message.error, null, 2)))
      } else {
        resolve(message.result)
      }
    }
  })

  const opened = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out opening WebSocket.')), 15000)

    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    })

    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('WebSocket error while opening connection.'))
    })
  })

  async function send(method, params = {}, sessionId = null, timeoutMs = 30000) {
    id += 1
    const currentId = id

    const payload = {
      id: currentId,
      method,
      params,
    }

    if (sessionId) {
      payload.sessionId = sessionId
    }

    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(currentId)
        reject(new Error(`Timed out waiting for ${method}.`))
      }, timeoutMs)

      pending.set(currentId, { resolve, reject, timeout })
    })

    socket.send(JSON.stringify(payload))
    return promise
  }

  async function close() {
    socket.close()
    await sleep(250)
  }

  return { opened, send, close }
}

async function evaluate(client, sessionId, expression, timeoutMs = 30000) {
  const result = await client.send(
    'Runtime.evaluate',
    {
      expression,
      returnByValue: true,
      awaitPromise: true,
    },
    sessionId,
    timeoutMs
  )

  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails, null, 2))
  }

  return result.result?.value
}

async function main() {
  const url = getArgValue('url')
  const endpoint = getArgValue('endpoint') || (await readEdgeEndpointFromFile())

  if (!url) {
    throw new Error('Missing --url argument.')
  }

  console.log('Connecting to Edge authorized endpoint:')
  console.log(endpoint)

  const client = createClient(endpoint)
  await client.opened

  const targetsResult = await client.send('Target.getTargets')
  const targets = targetsResult.targetInfos || []

  const pageTarget =
    targets.find((target) => target.type === 'page' && target.url.includes('psdeals.net')) ||
    targets.find((target) => target.type === 'page')

  if (!pageTarget) {
    throw new Error('No page target found in Edge.')
  }

  console.log(`Selected target: ${pageTarget.title} | ${pageTarget.url}`)

  const attachResult = await client.send('Target.attachToTarget', {
    targetId: pageTarget.targetId,
    flatten: true,
  })

  const sessionId = attachResult.sessionId

  await client.send('Page.enable', {}, sessionId)
  await client.send('Runtime.enable', {}, sessionId)

  await client.send('Page.navigate', { url }, sessionId, 90000)

  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const state = await evaluate(
      client,
      sessionId,
      `
(() => {
  const text = document.body?.innerText || ''
  const normalized = text.replace(/\\s+/g, ' ').trim().toLowerCase()

  return {
    title: document.title,
    url: location.href,
    readyState: document.readyState,
    textLength: text.length,
    hasBuyAt: normalized.includes('buy at'),
    hasPlayStationStore: normalized.includes('playstation store'),
    hasNotify: normalized.includes('notify'),
    hasChallenge:
      normalized.includes('performing security verification') ||
      normalized.includes('verify you are human') ||
      normalized.includes('not a robot') ||
      normalized.includes('cloudflare') ||
      normalized.includes('captcha'),
  }
})()
`,
      15000
    )

    if (state.hasChallenge) {
      throw new Error(`PSDEALS_DETAIL_CHALLENGE_DETECTED title="${state.title}" url="${state.url}"`)
    }

    if (state.hasBuyAt || state.hasPlayStationStore || state.hasNotify || state.textLength > 3000) {
      break
    }

    await sleep(1000)
  }

  const result = await evaluate(
    client,
    sessionId,
    `
(() => {
  function t(value) {
    return String(value || '').replace(/\\s+/g, ' ').trim()
  }

  const bodyText = document.body?.innerText || ''
  const ogImage =
    document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
    document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
    null

  const links = [...document.querySelectorAll('a[href]')]
    .map((a) => ({
      text: t(a.textContent),
      href: a.href,
    }))
    .filter((a) => a.text || a.href)
    .slice(0, 80)

  const prices = [...document.querySelectorAll('*')]
    .map((el) => t(el.textContent))
    .filter((text) => /^\\$\\d/.test(text) || /\\$\\d/.test(text))
    .slice(0, 60)

  return {
    title: document.title,
    url: location.href,
    h1: t(document.querySelector('h1')?.textContent),
    bodyPreview: t(bodyText).slice(0, 2500),
    ogImage,
    prices,
    links,
  }
})()
`,
    30000
  )

  console.log('=== PSDEALS EDGE LIVE DETAIL PROBE ===')
  console.log(JSON.stringify(result, null, 2))

  await client.send('Target.detachFromTarget', { sessionId }).catch(() => {})
  await client.close()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})