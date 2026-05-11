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

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
}

function cleanText(value) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseInteger(value) {
  if (value == null) return null
  const cleaned = String(value).replace(/[^0-9-]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isInteger(parsed) ? parsed : null
}

function parseMoney(value) {
  if (value == null) return null
  const cleaned = String(value).replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null
}

function toUrlString(input, base) {
  return new URL(input, base).toString()
}

function buildPagedUrl(baseUrl, pageNumber) {
  const url = new URL(baseUrl)

  if (pageNumber <= 1) {
    url.searchParams.delete('page')
    return url.toString()
  }

  url.searchParams.set('page', String(pageNumber))
  return url.toString()
}

function deriveSlugFromUrl(url) {
  const match = url.match(/\/game\/\d+\/([^/?#]+)/i)
  return match?.[1] || null
}

function derivePsdealsIdFromUrl(url) {
  return parseInteger(url.match(/\/game\/(\d+)(?:\/|$)/i)?.[1] || null)
}

function splitPlatformTokens(platformLabel) {
  const normalized = String(platformLabel || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return []

  return normalized
    .split('/')
    .map((token) => token.trim())
    .filter(Boolean)
}

function derivePlatformScopeStatus(platformLabel) {
  const tokens = splitPlatformTokens(platformLabel)
  if (tokens.length === 0) return 'unknown_platform_label'

  const allowed = new Set(['PS4', 'PS5'])
  return tokens.some((token) => !allowed.has(token))
    ? 'listed_with_non_target_platform_tokens'
    : 'listed_only_ps4_ps5_tokens'
}

function deriveCanonicalContentFamily(typeLabel) {
  const normalized = String(typeLabel || '').toLowerCase().trim()

  if (!normalized) return 'unknown'
  if (normalized === 'full game') return 'game'
  if (normalized === 'bundle') return 'bundle'
  if (normalized === 'demo') return 'other'

  return 'dlc'
}

function isAncillaryDlcSubtype(typeLabel) {
  const normalized = String(typeLabel || '').toLowerCase().trim()

  return new Set([
    'avatar',
    'avatars',
    'character',
    'costume',
    'level',
    'music track',
    'soundtrack',
    'static theme',
    'theme',
    'vr add-on',
  ]).has(normalized)
}

function extractTotalResultsFromTextBlock(text) {
  if (!text) return null

  const normalized = String(text).replace(/\s+/g, ' ').trim()

  for (const pattern of [
    /we found\s+([0-9,]+)\s+results/i,
    /([0-9,]+)\s+results/i,
  ]) {
    const match = normalized.match(pattern)
    if (match?.[1]) return parseInteger(match[1])
  }

  return null
}

function detectTotalResults(resultTextCandidates, html) {
  for (const candidate of resultTextCandidates || []) {
    const parsed = extractTotalResultsFromTextBlock(candidate)
    if (parsed != null) return parsed
  }

  return extractTotalResultsFromTextBlock(
    decodeHtmlEntities(String(html || '').replace(/<[^>]+>/g, ' '))
  )
}

function summarizeBy(items, keyFn) {
  const map = new Map()

  for (const item of items) {
    const key = keyFn(item) || 'unknown'
    map.set(key, (map.get(key) || 0) + 1)
  }

  return Object.fromEntries([...map.entries()].sort())
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

  const port = lines[0]
  const browserPath = lines[1]

  return `ws://127.0.0.1:${port}${browserPath}`
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

  async function send(method, params = {}, sessionId = null, timeoutMs = 30000) {
    id += 1

    const payload = {
      id,
      method,
      params,
    }

    if (sessionId) {
      payload.sessionId = sessionId
    }

    const currentId = id

    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(currentId)
        reject(new Error(`Timed out waiting for ${method}.`))
      }, timeoutMs)

      pending.set(currentId, {
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
    await sleep(250)
  }

  return {
    opened,
    send,
    close,
  }
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

async function getTargets(client) {
  const targetsResult = await client.send('Target.getTargets')
  return targetsResult.targetInfos || []
}

function findPsdealsTarget(targets) {
  return (
    targets.find(
      (target) =>
        target.type === 'page' &&
        target.url.includes('psdeals.net/us-store/all-games')
    ) ||
    targets.find(
      (target) =>
        target.type === 'page' &&
        target.url.includes('psdeals.net/us-store/discounts')
    ) ||
    targets.find(
      (target) =>
        target.type === 'page' &&
        target.url.includes('psdeals.net')
    )
  )
}

async function waitForListingReady(client, sessionId, pageUrl, timeoutMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const state = await evaluate(
      client,
      sessionId,
      `
(() => {
  const anchors = [
    ...document.querySelectorAll('a.game-collection-item-link[href*="/us-store/game/"]')
  ]

  const text = [
    document.title || '',
    document.body?.innerText || '',
  ].join(' ').replace(/\\s+/g, ' ').toLowerCase()

  return {
    title: document.title,
    url: location.href,
    readyState: document.readyState,
    cards: anchors.length,
    challenge:
      text.includes('captcha') ||
      text.includes('not a robot') ||
      text.includes('no eres un robot') ||
      text.includes('verify you are human') ||
      text.includes('checking your browser') ||
      text.includes('performing security verification') ||
      text.includes('cloudflare'),
  }
})()
`,
      15000
    )

    if (state?.cards > 0) {
      return state
    }

    if (state?.challenge) {
      throw new Error(
        `PSDEALS_CHALLENGE_DETECTED: no listing cards found for ${pageUrl} | title="${state.title}"`
      )
    }

    await sleep(1000)
  }

  throw new Error(`PSDEALS_LISTING_TIMEOUT: no cards after ${timeoutMs}ms for ${pageUrl}`)
}

async function collectPage(client, sessionId, pageUrl, timeoutMs) {
  await client.send('Page.navigate', { url: pageUrl }, sessionId, timeoutMs)

  const state = await waitForListingReady(client, sessionId, pageUrl, timeoutMs)

  const payload = await evaluate(
    client,
    sessionId,
    `
(() => {
  function t(value) {
    return String(value || '').replace(/\\s+/g, ' ').trim()
  }

  const bodyText = document.body?.innerText || ''

  const resultTextCandidates = [
    bodyText,
    ...[
      ...document.querySelectorAll(
        'h1, h2, h3, .page-header, .results, .results-count, .games-number, .collection-content'
      ),
    ]
      .map((el) => t(el.textContent))
      .filter(Boolean),
  ]

  const activePageElement =
    document.querySelector('.pagination .active a') ||
    document.querySelector('.pagination .active span') ||
    null

  const items = [
    ...document.querySelectorAll('a.game-collection-item-link[href*="/us-store/game/"]'),
  ]
    .map((anchor) => {
      const priceNodes = [...anchor.querySelectorAll('.game-collection-item-price')]
      const regularPriceNode = priceNodes.find(
        (node) => !node.classList.contains('strikethrough')
      )
      const originalPriceNode = priceNodes.find((node) =>
        node.classList.contains('strikethrough')
      )

      const imageElement =
        anchor.querySelector('.game-collection-item-image') ||
        anchor.querySelector('img')

      return {
        href: anchor.href || null,
        title:
          t(anchor.querySelector('.game-collection-item-details-title')?.textContent) ||
          null,
        platformLabel:
          t(anchor.querySelector('.game-collection-item-top-platform')?.textContent) ||
          null,
        typeLabel:
          t(anchor.querySelector('.game-collection-item-type')?.textContent) ||
          null,
        discountText:
          t(anchor.querySelector('.game-collection-item-discount')?.textContent) ||
          null,
        discountPriceText:
          t(anchor.querySelector('.game-collection-item-price-discount')?.textContent) ||
          null,
        regularPriceText: t(regularPriceNode?.textContent) || null,
        originalPriceText: t(originalPriceNode?.textContent) || null,
        imageUrl:
          imageElement?.getAttribute('data-src') ||
          imageElement?.getAttribute('src') ||
          imageElement?.getAttribute('content') ||
          null,
      }
    })
    .filter((item) => item.href)

  return {
    title: document.title,
    url: location.href,
    html: document.documentElement.outerHTML,
    resultTextCandidates,
    activePageText: activePageElement ? t(activePageElement.textContent) : null,
    items,
  }
})()
`,
    timeoutMs
  )

  const totalResults = detectTotalResults(payload.resultTextCandidates, payload.html)

  const items = payload.items.map((item) => {
    const psdealsUrl = toUrlString(item.href, pageUrl)
    const platformLabel = cleanText(item.platformLabel) || null
    const typeLabel = cleanText(item.typeLabel) || null

    return {
      psdeals_id: derivePsdealsIdFromUrl(psdealsUrl),
      psdeals_slug: deriveSlugFromUrl(psdealsUrl),
      psdeals_url: psdealsUrl,
      title: cleanText(item.title),
      platform_label: platformLabel,
      platform_tokens: splitPlatformTokens(platformLabel),
      type_label: typeLabel,
      canonical_content_family: deriveCanonicalContentFamily(typeLabel),
      platform_scope_status: derivePlatformScopeStatus(platformLabel),
      listed_in_psdeals_scope: true,
      is_ancillary_dlc_subtype: isAncillaryDlcSubtype(typeLabel),
      current_price_amount: parseMoney(item.discountPriceText || item.regularPriceText),
      original_price_amount: parseMoney(item.originalPriceText),
      discount_percent: parseInteger(item.discountText),
      image_url: item.imageUrl ? toUrlString(item.imageUrl, pageUrl) : null,
      source_page_url: pageUrl,
    }
  })

  return {
    pageTitle: payload.title || state.title,
    pageUrl: payload.url || state.url,
    totalResults,
    activePage: parseInteger(payload.activePageText) || null,
    items,
    htmlLength: payload.html?.length || null,
  }
}

async function main() {
  const urlValue = getArgValue('url')
  const endpointValue = getArgValue('endpoint')
  const pagesValue = getArgValue('pages')
  const startPageValue = getArgValue('start-page')
  const delayValue = getArgValue('delay-ms')
  const timeoutValue = getArgValue('timeout-ms')
  const outputDirValue = getArgValue('output-dir')
  const outputPrefixValue = getArgValue('output-prefix')

  if (!urlValue) {
    throw new Error('Missing --url argument.')
  }

  const baseUrl = toUrlString(urlValue)
  const endpoint = endpointValue || (await readEdgeEndpointFromFile())
  const maxPages = pagesValue ? Number(pagesValue) : 1
  const startPage = startPageValue ? Number(startPageValue) : 1
  const delayMs = delayValue ? Number(delayValue) : 1500
  const timeoutMs = timeoutValue ? Number(timeoutValue) : 90000
  const outputDir = path.resolve(process.cwd(), outputDirValue || 'data/import')
  const outputPrefix = outputPrefixValue || 'psdeals-edge-live-listing'

  if (!Number.isFinite(maxPages) || maxPages <= 0) {
    throw new Error('Invalid --pages value.')
  }

  if (!Number.isFinite(startPage) || startPage < 1) {
    throw new Error('Invalid --start-page value.')
  }

  await fs.mkdir(outputDir, { recursive: true })

  console.log(`Connecting to Edge authorized endpoint:`)
  console.log(endpoint)

  const client = createClient(endpoint)
  await client.opened

  const targets = await getTargets(client)
  const psdealsTarget = findPsdealsTarget(targets)

  if (!psdealsTarget) {
    throw new Error('No PSDeals tab found in Edge. Open PSDeals in Edge first.')
  }

  console.log(`Selected target: ${psdealsTarget.title} | ${psdealsTarget.url}`)

  const attachResult = await client.send('Target.attachToTarget', {
    targetId: psdealsTarget.targetId,
    flatten: true,
  })

  const sessionId = attachResult.sessionId

  await client.send('Page.enable', {}, sessionId)
  await client.send('Runtime.enable', {}, sessionId)

    const uniqueById = new Map()
  const pageSummaries = []
  const failedPages = []
  let firstDetectedTotalResults = null
  let consecutiveDuplicatePages = 0
  let autoStopReason = null

  for (
    let pageNumber = startPage;
    pageNumber < startPage + maxPages;
    pageNumber += 1
  ) {
    const pageUrl = buildPagedUrl(baseUrl, pageNumber)

    try {
      const collected = await collectPage(client, sessionId, pageUrl, timeoutMs)

      if (firstDetectedTotalResults == null && collected.totalResults != null) {
        firstDetectedTotalResults = collected.totalResults
      }

      const beforeSize = uniqueById.size

      for (const item of collected.items) {
        const dedupeKey =
          item.psdeals_id != null ? `id:${item.psdeals_id}` : `url:${item.psdeals_url}`

        if (!uniqueById.has(dedupeKey)) {
          uniqueById.set(dedupeKey, {
            ...item,
            first_seen_page: pageNumber,
          })
        }
      }

      const newUniqueCount = uniqueById.size - beforeSize

      const pageSummary = {
        page_number: pageNumber,
        page_url: pageUrl,
        page_title: collected.pageTitle,
        total_results_detected: collected.totalResults,
        active_page_detected: collected.activePage,
        raw_item_count: collected.items.length,
        new_unique_count: newUniqueCount,
        duplicate_count: collected.items.length - newUniqueCount,
        sample_first_id: collected.items[0]?.psdeals_id || null,
        sample_last_id: collected.items[collected.items.length - 1]?.psdeals_id || null,
      }

      pageSummaries.push(pageSummary)

            console.log(
        `[EDGE LIVE PAGE ${pageNumber}] raw=${pageSummary.raw_item_count} | new_unique=${pageSummary.new_unique_count} | duplicates=${pageSummary.duplicate_count} | total_results=${pageSummary.total_results_detected ?? 'null'}`
      )

      if (pageSummary.raw_item_count > 0 && pageSummary.new_unique_count === 0) {
        consecutiveDuplicatePages += 1
      } else {
        consecutiveDuplicatePages = 0
      }

      const stopTotalResults = firstDetectedTotalResults ?? pageSummary.total_results_detected

      if (
        stopTotalResults != null &&
        stopTotalResults > 0 &&
        uniqueById.size >= stopTotalResults
      ) {
        autoStopReason =
          `unique_items_collected_reached_total_results: unique=${uniqueById.size} total=${stopTotalResults}`
        console.log(`[AUTO STOP] ${autoStopReason}`)
        break
      }

      if (consecutiveDuplicatePages >= 5) {
        autoStopReason =
          `five_consecutive_duplicate_pages: count=${consecutiveDuplicatePages} last_page=${pageNumber}`
        console.log(`[AUTO STOP] ${autoStopReason}`)
        break
      }
    } catch (error) {
      failedPages.push({
        page_number: pageNumber,
        page_url: pageUrl,
        error: error?.message || String(error),
      })

      console.error(`[FAILED EDGE LIVE PAGE ${pageNumber}] ${error?.message || error}`)
      break
    }

    if (delayMs > 0 && pageNumber < startPage + maxPages - 1) {
      await sleep(delayMs)
    }
  }

  const items = [...uniqueById.values()].sort((a, b) => {
    if ((a.title || '') < (b.title || '')) return -1
    if ((a.title || '') > (b.title || '')) return 1
    return (a.psdeals_id || 0) - (b.psdeals_id || 0)
  })

  const stamp = nowStamp()
  const jsonPath = path.resolve(outputDir, `${outputPrefix}-${stamp}.json`)
  const txtPath = path.resolve(outputDir, `${outputPrefix}-${stamp}.txt`)

  const jsonPayload = {
    collected_at: new Date().toISOString(),
    collection_mode: 'edge_live_authorized_direct_cdp',
    base_url: baseUrl,
    pages_requested: maxPages,
    start_page: startPage,
    pages_processed: pageSummaries.length,
        failed_pages: failedPages,
    auto_stop_reason: autoStopReason,
    auto_stop_rules: {
      stop_when_unique_items_reach_total_results: true,
      stop_after_consecutive_duplicate_pages: 5,
    },
    total_results_detected: firstDetectedTotalResults,
    unique_items_collected: items.length,
    unique_psdeals_scope_items_collected: items.length,
    counts_by_platform_label: summarizeBy(items, (item) => item.platform_label),
    counts_by_type_label: summarizeBy(items, (item) => item.type_label),
    counts_by_canonical_content_family: summarizeBy(items, (item) => item.canonical_content_family),
    counts_by_platform_scope_status: summarizeBy(items, (item) => item.platform_scope_status),
    counts_by_ancillary_dlc_flag: summarizeBy(
      items,
      (item) => (item.is_ancillary_dlc_subtype ? 'ancillary_dlc' : 'not_ancillary_dlc')
    ),
    page_summaries: pageSummaries,
    items,
  }

  const txtPayload = items.map((item) => item.psdeals_url).join('\n') + '\n'

  await fs.writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf8')
  await fs.writeFile(txtPath, txtPayload, 'utf8')

  console.log('')
  console.log('Edge live listing collection finished.')
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Pages processed: ${pageSummaries.length}`)
    console.log(`Failed pages: ${failedPages.length}`)
  console.log(`Auto-stop reason: ${autoStopReason ?? 'none'}`)
  console.log(`Total results detected: ${firstDetectedTotalResults ?? 'null'}`)
  console.log(`Unique items collected: ${items.length}`)
  console.log(`JSON: ${jsonPath}`)
  console.log(`TXT: ${txtPath}`)

  if (failedPages.length > 0) {
    throw new Error(
      `EDGE_LIVE_LISTING_COLLECTION_FAILED: failed_pages=${failedPages.length} | pages_processed=${pageSummaries.length}`
    )
  }

  await client.send('Target.detachFromTarget', { sessionId }).catch(() => {})
  await client.close()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})