import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

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

function buildOutputPaths(outputDir, outputPrefix) {
  const stamp = nowStamp()

  return {
    jsonPath: path.resolve(outputDir, `${outputPrefix}-${stamp}.json`),
    txtPath: path.resolve(outputDir, `${outputPrefix}-${stamp}.txt`),
    partialJsonPath: path.resolve(outputDir, `${outputPrefix}-${stamp}.partial.json`),
    partialTxtPath: path.resolve(outputDir, `${outputPrefix}-${stamp}.partial.txt`),
  }
}

function getArgValue(name) {
  const prefix = `--${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

async function createBrowserContext(
  headless,
  userDataDir,
  blockAssets,
  browserChannel,
  browserConfig,
  profileDirectory
) {
  const useMinimalConfig = browserConfig === 'minimal'

  const contextOptions = useMinimalConfig
    ? {
        locale: 'en-US',
        timezoneId: 'America/Lima',
        viewport: { width: 1440, height: 2200 },
      }
    : {
        locale: 'en-US',
        timezoneId: 'America/Lima',
        viewport: { width: 1440, height: 2200 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        extraHTTPHeaders: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
      }

    const launchOptions = {
    ...contextOptions,
    headless,
  }

  if (browserChannel) {
    launchOptions.channel = browserChannel
  }

  if (profileDirectory) {
    launchOptions.args = [
      `--profile-directory=${profileDirectory}`,
    ]
  }

  let browser = null
  let context = null

  if (userDataDir) {
    context = await chromium.launchPersistentContext(userDataDir, launchOptions)
    browser = context.browser()
  } else {
    browser = await chromium.launch(
      browserChannel
        ? {
            headless,
            channel: browserChannel,
          }
        : {
            headless,
          }
    )

    context = await browser.newContext(contextOptions)
  }

  if (!useMinimalConfig) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      })
    })
  }

  if (blockAssets) {
    await context.route('**/*', async (route) => {
      const resourceType = route.request().resourceType()

      if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
        await route.abort()
        return
      }

      await route.continue()
    })
  }

  return { browser, context }
}

function detectPsdealsChallenge(pageTitle, html) {
  const text = `${pageTitle || ''} ${html || ''}`
    .replace(/\s+/g, ' ')
    .toLowerCase()

  return (
    text.includes('captcha') ||
    text.includes('not a robot') ||
    text.includes('no eres un robot') ||
    text.includes('demostrar que no eres un robot') ||
    text.includes('verify you are human') ||
    text.includes('checking your browser') ||
    text.includes('challenge') ||
    text.includes('cloudflare')
  )
}

async function collectPageOnce(page, pageUrl, timeoutMs, debugHtmlDir, selectorTimeoutMs) {
  const response = await page.goto(pageUrl, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  })

  if (!response) {
    throw new Error(`Navigation returned no HTTP response for ${pageUrl}`)
  }

  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)

  let itemCount = await page
    .locator('a.game-collection-item-link[href*="/us-store/game/"]')
    .count()

  if (itemCount === 0) {
    await page
      .waitForSelector('a.game-collection-item-link[href*="/us-store/game/"]', {
        timeout: selectorTimeoutMs,
        state: 'attached',
      })
      .catch(() => {})

    itemCount = await page
      .locator('a.game-collection-item-link[href*="/us-store/game/"]')
      .count()
  }

  const pageTitle = await page.title()
  const html = await page.content()

  let debugHtmlPath = null

  if (debugHtmlDir) {
    await fs.mkdir(debugHtmlDir, { recursive: true })

    const safeName = pageUrl
      .replace(/^https?:\/\//i, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180)

    debugHtmlPath = path.resolve(debugHtmlDir, `${safeName}.html`)
    await fs.writeFile(debugHtmlPath, html, 'utf8')
  }

  if (itemCount === 0) {
    const challengeDetected = detectPsdealsChallenge(pageTitle, html)

    if (challengeDetected) {
      throw new Error(
        `PSDEALS_CHALLENGE_DETECTED: no listing cards found for ${pageUrl} | title="${pageTitle}" | debug_html=${debugHtmlPath || 'not_saved'}`
      )
    }

    throw new Error(
      `PSDEALS_NO_LISTING_CARDS: no listing cards found for ${pageUrl} | title="${pageTitle}" | debug_html=${debugHtmlPath || 'not_saved'}`
    )
  }

  const payload = await page.evaluate(() => {
    function t(value) {
      return String(value || '').replace(/\s+/g, ' ').trim()
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

    const items = [...document.querySelectorAll('a.game-collection-item-link[href*="/us-store/game/"]')]
      .map((anchor) => {
        const priceNodes = [...anchor.querySelectorAll('.game-collection-item-price')]
        const regularPriceNode = priceNodes.find((node) => !node.classList.contains('strikethrough'))
        const originalPriceNode = priceNodes.find((node) => node.classList.contains('strikethrough'))

        const imageElement =
          anchor.querySelector('.game-collection-item-image') ||
          anchor.querySelector('img')

        return {
          href: anchor.href || null,
          title: t(anchor.querySelector('.game-collection-item-details-title')?.textContent) || null,
          platformLabel: t(anchor.querySelector('.game-collection-item-top-platform')?.textContent) || null,
          typeLabel: t(anchor.querySelector('.game-collection-item-type')?.textContent) || null,
          discountText: t(anchor.querySelector('.game-collection-item-discount')?.textContent) || null,
          discountPriceText: t(anchor.querySelector('.game-collection-item-price-discount')?.textContent) || null,
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
      resultTextCandidates,
      activePageText: activePageElement ? t(activePageElement.textContent) : null,
      items,
    }
  })

  const totalResults = detectTotalResults(payload.resultTextCandidates, html)

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
    httpStatus: response.status(),
    pageTitle,
    totalResults,
    activePage: parseInteger(payload.activePageText) || null,
    items,
    htmlLength: html.length,
  }
}

async function collectPageWithRetry(context, pageUrl, timeoutMs, debugHtmlDir, maxRetries, retryDelayMs) {
  let lastError = null

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const page = await context.newPage()

    try {
      const selectorTimeoutMs = attempt === 1 ? 30000 : 60000
      const result = await collectPageOnce(page, pageUrl, timeoutMs, debugHtmlDir, selectorTimeoutMs)
      await page.close().catch(() => {})

      return {
        ...result,
        attempt,
      }
    } catch (error) {
      lastError = error
      await page.close().catch(() => {})

      console.log(
        `[RETRY] ${pageUrl} | attempt=${attempt}/${maxRetries + 1} | error=${error?.message || error}`
      )

      if (attempt <= maxRetries) {
        await sleep(retryDelayMs * attempt)
      }
    }
  }

  throw lastError
}

async function saveOutput(paths, payload, items) {
  const txtPayload = items.map((item) => item.psdeals_url).join('\n') + '\n'

  await fs.writeFile(paths.jsonPath, JSON.stringify(payload, null, 2), 'utf8')
  await fs.writeFile(paths.txtPath, txtPayload, 'utf8')
}

async function savePartial(paths, payload, items) {
  const txtPayload = items.map((item) => item.psdeals_url).join('\n') + '\n'

  await fs.writeFile(paths.partialJsonPath, JSON.stringify(payload, null, 2), 'utf8')
  await fs.writeFile(paths.partialTxtPath, txtPayload, 'utf8')
}

const urlValue = getArgValue('url')
const pagesValue = getArgValue('pages')
const startPageValue = getArgValue('start-page')
const delayValue = getArgValue('delay-ms')
const timeoutValue = getArgValue('timeout-ms')
const headlessValue = getArgValue('headless')
const outputDirValue = getArgValue('output-dir')
const outputPrefixValue = getArgValue('output-prefix')
const debugHtmlDirValue = getArgValue('debug-html-dir')
const userDataDirValue = getArgValue('user-data-dir')
const blockAssetsValue = getArgValue('block-assets')
const browserChannelValue = getArgValue('browser-channel')
const browserConfigValue = getArgValue('browser-config')
const profileDirectoryValue = getArgValue('profile-directory')
const retriesValue = getArgValue('retries')
const retryDelayValue = getArgValue('retry-delay-ms')
const partialEveryValue = getArgValue('partial-every')

if (!urlValue) {
  console.error('Missing --url argument')
  process.exit(1)
}

const baseUrl = toUrlString(urlValue)
const maxPages = pagesValue ? Number(pagesValue) : 1
const startPage = startPageValue ? Number(startPageValue) : 1
const delayMs = delayValue ? Number(delayValue) : 1500
const timeoutMs = timeoutValue ? Number(timeoutValue) : 60000
const headless = headlessValue ? headlessValue !== 'false' : true
const outputDir = path.resolve(process.cwd(), outputDirValue || 'data/import')
const outputPrefix = outputPrefixValue || 'psdeals-listing'
const debugHtmlDir = path.resolve(process.cwd(), debugHtmlDirValue || 'logs/psdeals-listing-html')
const userDataDir = userDataDirValue ? path.resolve(process.cwd(), userDataDirValue) : null
const blockAssets = blockAssetsValue ? blockAssetsValue !== 'false' : true
const browserChannel = browserChannelValue || null
const browserConfig = browserConfigValue || 'custom'
const profileDirectory = profileDirectoryValue || null
const maxRetries = retriesValue ? Number(retriesValue) : 3
const retryDelayMs = retryDelayValue ? Number(retryDelayValue) : 5000
const partialEvery = partialEveryValue ? Number(partialEveryValue) : 25

if (!Number.isFinite(maxPages) || maxPages <= 0) {
  console.error('Invalid --pages value')
  process.exit(1)
}

if (!Number.isFinite(startPage) || startPage < 1) {
  console.error('Invalid --start-page value')
  process.exit(1)
}

if (!['custom', 'minimal'].includes(browserConfig)) {
  console.error('Invalid --browser-config value. Use custom or minimal.')
  process.exit(1)
}

await fs.mkdir(outputDir, { recursive: true })

const { browser, context } = await createBrowserContext(
  headless,
  userDataDir,
  blockAssets,
  browserChannel,
  browserConfig,
  profileDirectory
)
const uniqueById = new Map()
const pageSummaries = []
const failedPages = []
let firstDetectedTotalResults = null

const outputs = buildOutputPaths(outputDir, outputPrefix)

try {
  for (
  let pageNumber = startPage;
  pageNumber < startPage + maxPages;
  pageNumber += 1
) {
  const pageUrl = buildPagedUrl(baseUrl, pageNumber)

    try {
      const collected = await collectPageWithRetry(
        context,
        pageUrl,
        timeoutMs,
        debugHtmlDir,
        maxRetries,
        retryDelayMs
      )

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
        http_status: collected.httpStatus,
        page_title: collected.pageTitle,
        total_results_detected: collected.totalResults,
        active_page_detected: collected.activePage,
        raw_item_count: collected.items.length,
        new_unique_count: newUniqueCount,
        duplicate_count: collected.items.length - newUniqueCount,
        attempt: collected.attempt,
        sample_first_id: collected.items[0]?.psdeals_id || null,
        sample_last_id: collected.items[collected.items.length - 1]?.psdeals_id || null,
      }

      pageSummaries.push(pageSummary)

      console.log(
        `[PAGE ${pageNumber}] raw=${pageSummary.raw_item_count} | new_unique=${pageSummary.new_unique_count} | duplicates=${pageSummary.duplicate_count} | total_results=${pageSummary.total_results_detected ?? 'null'} | attempt=${pageSummary.attempt} | status=${pageSummary.http_status}`
      )

      if (collected.items.length === 0) {
        console.log(`[PAGE ${pageNumber}] No items found. Stopping early.`)
        break
      }
    } catch (error) {
      failedPages.push({
        page_number: pageNumber,
        page_url: pageUrl,
        error: error?.message || String(error),
      })

      console.error(`[FAILED PAGE ${pageNumber}] ${error?.message || error}`)
      break
    }

    const itemsForPartial = [...uniqueById.values()]
    const partialPayload = {
      collected_at: new Date().toISOString(),
      partial: true,
      base_url: baseUrl,
      pages_requested: maxPages,
      pages_processed: pageSummaries.length,
      failed_pages: failedPages,
      total_results_detected: firstDetectedTotalResults,
      unique_items_collected: itemsForPartial.length,
      page_summaries: pageSummaries,
      items: itemsForPartial,
    }

    if (partialEvery > 0 && pageNumber % partialEvery === 0) {
      await savePartial(outputs, partialPayload, itemsForPartial)
      console.log(`[PARTIAL SAVED] pages=${pageNumber} | unique=${itemsForPartial.length}`)
    }

    if (delayMs > 0 && pageNumber < maxPages) {
      await sleep(delayMs)
    }
  }

  const items = [...uniqueById.values()].sort((a, b) => {
    if ((a.title || '') < (b.title || '')) return -1
    if ((a.title || '') > (b.title || '')) return 1
    return (a.psdeals_id || 0) - (b.psdeals_id || 0)
  })

  const jsonPayload = {
    collected_at: new Date().toISOString(),
    base_url: baseUrl,
    pages_requested: maxPages,
    pages_processed: pageSummaries.length,
    failed_pages: failedPages,
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

    await saveOutput(outputs, jsonPayload, items)

  console.log('')
  console.log('Listing collection finished.')

  if (failedPages.length > 0) {
    const failedSummary = failedPages
      .map((page) => `page=${page.page_number} error=${page.error}`)
      .join(' | ')

    throw new Error(
      `PSDEALS_LISTING_COLLECTION_FAILED: failed_pages=${failedPages.length} | pages_processed=${pageSummaries.length} | unique_items_collected=${items.length} | ${failedSummary}`
    )
  }

  if (pageSummaries.length === 0 || items.length === 0) {
    throw new Error(
      `PSDEALS_LISTING_EMPTY_RESULT: pages_processed=${pageSummaries.length} | unique_items_collected=${items.length}`
    )
  }
  
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Pages processed: ${pageSummaries.length}`)
  console.log(`Failed pages: ${failedPages.length}`)
  console.log(`Total results detected: ${firstDetectedTotalResults ?? 'null'}`)
  console.log(`Unique items collected: ${items.length}`)
  console.log(`JSON: ${outputs.jsonPath}`)
  console.log(`TXT: ${outputs.txtPath}`)

  if (failedPages.length > 0) {
    process.exitCode = 2
  }
} finally {
  await context.close().catch(() => {})
  await browser.close().catch(() => {})
}