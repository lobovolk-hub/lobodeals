function getArgValue(name) {
  const prefix = `--${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
    const timer = setTimeout(() => {
      reject(new Error('Timed out opening WebSocket.'))
    }, 15000)

    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    })

    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('WebSocket error while opening connection.'))
    })
  })

  async function send(method, params = {}, sessionId = null) {
    id += 1

    const payload = {
      id,
      method,
      params,
    }

    if (sessionId) {
      payload.sessionId = sessionId
    }

    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Timed out waiting for ${method}.`))
      }, 15000)

      pending.set(id, {
        resolve,
        reject,
        timeout,
      })
    })

    socket.send(JSON.stringify(payload))

    return promise
  }

  async function close() {
    socket.close()
    await wait(250)
  }

  return {
    opened,
    send,
    close,
  }
}

async function main() {
  const endpoint = getArgValue('endpoint')

  if (!endpoint) {
    throw new Error('Missing --endpoint argument.')
  }

  console.log(`Connecting directly to authorized Edge endpoint:`)
  console.log(endpoint)

  const client = createClient(endpoint)

  await client.opened

  console.log('Connected.')

  const targetsResult = await client.send('Target.getTargets')
  const targets = targetsResult.targetInfos || []

  console.log(`Targets found: ${targets.length}`)

  for (const [index, target] of targets.entries()) {
    console.log(`${index}: ${target.type} | ${target.title} | ${target.url}`)
  }

  const psdealsTarget =
    targets.find((target) =>
      target.type === 'page' &&
      target.url.includes('psdeals.net/us-store/all-games')
    ) ||
    targets.find((target) =>
      target.type === 'page' &&
      target.url.includes('psdeals.net')
    )

  if (!psdealsTarget) {
    throw new Error('No PSDeals page target found in Edge.')
  }

  console.log('Selected target:')
  console.log(`${psdealsTarget.title} | ${psdealsTarget.url}`)

  const attachResult = await client.send('Target.attachToTarget', {
    targetId: psdealsTarget.targetId,
    flatten: true,
  })

  const sessionId = attachResult.sessionId

  const expression = `
(() => {
  const anchors = [
    ...document.querySelectorAll('a.game-collection-item-link[href*="/us-store/game/"]')
  ]

  return {
    title: document.title,
    url: location.href,
    cards: anchors.length,
    sample: anchors.slice(0, 10).map((anchor) => ({
      title:
        anchor
          .querySelector('.game-collection-item-details-title')
          ?.textContent
          ?.replace(/\\s+/g, ' ')
          .trim() || null,
      href: anchor.href,
    })),
  }
})()
`

  const evalResult = await client.send(
    'Runtime.evaluate',
    {
      expression,
      returnByValue: true,
      awaitPromise: true,
    },
    sessionId
  )

  console.log('=== PSDEALS EDGE LIVE DIRECT PROBE ===')
  console.log(JSON.stringify(evalResult.result.value, null, 2))

  await client.close()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})