import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

function nowIso() {
  return new Date().toISOString()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadKeyValueFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')

    for (const originalLine of raw.split(/\r?\n/)) {
      const line = originalLine.trim()
      if (!line || line.startsWith('#')) continue

      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) continue

      const key = line.slice(0, separatorIndex).trim()
      let value = line.slice(separatorIndex + 1).trim()

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (!(key in process.env)) {
        process.env[key] = value
      }
    }
  } catch {
    // ignore missing file
  }
}

function summarizeError(error) {
  if (!error) return 'Unknown error'
  if (error instanceof Error) return error.message

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
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

function stripTags(html) {
  return decodeHtmlEntities(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMoney(text) {
  if (!text) return null
  const cleaned = String(text).replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null
}

function parseInteger(text) {
  if (!text) return null
  const cleaned = String(text).replace(/[^0-9-]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isInteger(parsed) ? parsed : null
}

function parseFloatNumber(text) {
  if (!text) return null
  const cleaned = String(text).replace(/[^0-9.-]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function extractFirst(text, regex) {
  const match = text.match(regex)
  return match?.[1] ? decodeHtmlEntities(match[1]).trim() : null
}

function parseJsStringLiteral(rawLiteral) {
  if (!rawLiteral) return null

  const candidate = String(rawLiteral).trim()

  try {
    return JSON.parse(`"${candidate.replace(/"/g, '\\"')}"`)
  } catch {
    return candidate
  }
}

function parseChartJsonString(rawLiteral) {
  if (!rawLiteral) return []

  const decoded = parseJsStringLiteral(rawLiteral)
  if (!decoded) return []

  try {
    const parsed = JSON.parse(String(decoded))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseObservedAt(value) {
  if (!value) return null
  const normalized = value.replace(' ', 'T') + 'Z'
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function parseDateOnly(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  const year = parsed.getUTCFullYear()
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const day = String(parsed.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function deriveStoreUrlKind(url) {
  if (!url) return null
  if (/\/product\//i.test(url)) return 'product'
  if (/\/concept\//i.test(url)) return 'concept'
  return 'other'
}

function derivePsStorePrimaryId(url) {
  if (!url) return null
  const productMatch = url.match(/\/product\/([^/?#]+)/i)
  if (productMatch?.[1]) return productMatch[1]

  const conceptMatch = url.match(/\/concept\/([^/?#]+)/i)
  if (conceptMatch?.[1]) return conceptMatch[1]

  return null
}

function deriveAvailabilityState(currentPriceAmount, title) {
  if (currentPriceAmount === 0) return 'free_to_play'
  if (/demo|trial/i.test(title || '')) return 'demo'
  if (currentPriceAmount == null) return 'tba'
  return 'priced'
}

function derivePlatforms(platformLabel) {
  const value = String(platformLabel || '').toUpperCase()
  const platforms = []

  if (value.includes('PS4')) platforms.push('PS4')
  if (value.includes('PS5')) platforms.push('PS5')

  return platforms
}

function deriveContentType(itemType, title, pageHtml) {
  const normalized = String(itemType || '').toLowerCase()
  const titleText = String(title || '').toLowerCase()

  if (normalized.includes('bundle')) return 'bundle'
  if (normalized.includes('season')) return 'season_pass'
  if (normalized.includes('currency')) return 'currency'
  if (normalized.includes('demo')) return 'demo'
  if (normalized.includes('add-on') || normalized.includes('add on')) return 'add_on'
  if (normalized.includes('dlc')) return 'dlc'

  if (/add-ons \(dlc\)/i.test(pageHtml)) {
    if (/dlc|add-on|add on|season pass/.test(titleText)) {
      return 'dlc'
    }
  }

  return 'game'
}

function parseDescription(html) {
  const match = html.match(
    /<h2>Description<\/h2>[\s\S]*?<div class="col-xs-12">\s*([\s\S]*?)\s*<\/div>\s*<\/div>/i
  )

  if (!match?.[1]) return null

  const text = stripTags(
    match[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<p[^>]*>/gi, '')
  )

  return text || null
}

function parseWhatsInsideLines(html) {
  const match = html.match(
    /<h2>What's Inside<\/h2>[\s\S]*?<div class="col-xs-12">\s*([\s\S]*?)\s*<\/div>\s*<\/div>/i
  )

  if (!match?.[1]) return []

  return match[1]
    .split(/<br\s*\/?>/i)
    .map((line) => stripTags(line))
    .map((line) => line.replace(/^○\s*/, '').trim())
    .filter(Boolean)
}

function parseGenreList(genreText) {
  if (!genreText || genreText === '--') return []
  return genreText
    .split('/')
    .map((value) => value.trim())
    .filter(Boolean)
}

function parseRelatedItems(html) {
  const paneConfigs = [
    { paneId: 'related-products-dlc', relationKind: 'dlc' },
    { paneId: 'related-products-editions', relationKind: 'edition' },
    { paneId: 'related-products-other-apps', relationKind: 'other_platform' },
  ]

  const tabContentMarker = '<div class="tab-content" id="related-productsContent">'
  const tabContentStart = html.indexOf(tabContentMarker)

  if (tabContentStart === -1) {
    return []
  }

  const contentStart = tabContentStart + tabContentMarker.length

  const endCandidates = [
    html.indexOf('<a href="/us-store/add-ons/', contentStart),
    html.indexOf('<div class="row">', contentStart),
    html.indexOf('<h2>Reviews</h2>', contentStart),
  ].filter((value) => value !== -1)

  const contentEnd =
    endCandidates.length > 0 ? Math.min(...endCandidates) : html.length

  const contentHtml = html.slice(contentStart, contentEnd)

  const results = []
  let sortOrder = 0

  for (const pane of paneConfigs) {
    const paneMarker = `id="${pane.paneId}"`
    const paneStart = contentHtml.indexOf(paneMarker)

    if (paneStart === -1) {
      continue
    }

    const nextPaneStarts = paneConfigs
      .map((candidate) =>
        candidate.paneId === pane.paneId
          ? -1
          : contentHtml.indexOf(`id="${candidate.paneId}"`, paneStart + paneMarker.length)
      )
      .filter((value) => value !== -1)

    const paneEnd =
      nextPaneStarts.length > 0 ? Math.min(...nextPaneStarts) : contentHtml.length

    const paneHtml = contentHtml.slice(paneStart, paneEnd)

    const cardRegex =
      /<div class="game-collection-item game-collection-item-related[\s\S]*?<a[^>]+class="[^"]*\bgame-collection-item-link\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/div>\s*<\/div>/gi

    for (const match of paneHtml.matchAll(cardRegex)) {
      const relatedUrl = decodeHtmlEntities(match[1]).trim()
      const anchorHtml = match[2]

      const relatedTitle = stripTags(
        extractFirst(
          anchorHtml,
          /<span class="game-collection-item-details-title">([\s\S]*?)<\/span>/i
        ) || ''
      )

      if (!relatedTitle) {
        continue
      }

      const relatedPlatformLabel =
        stripTags(
          extractFirst(
            anchorHtml,
            /<span class="game-collection-item-top-platform">([\s\S]*?)<\/span>/i
          ) || ''
        ) || null

      const inferredKind =
        /xbdeals\.net|ntdeals\.net/i.test(relatedUrl)
          ? 'other_platform'
          : pane.relationKind

      results.push({
        relation_kind: inferredKind,
        related_psdeals_id: parseInteger(
          relatedUrl.match(/\/game\/(\d+)\//i)?.[1] || null
        ),
        related_title: relatedTitle,
        related_url: relatedUrl,
        related_store_url: null,
        related_platform_label: relatedPlatformLabel,
        sort_order: sortOrder,
      })

      sortOrder += 1
    }
  }

  return results
}

function parseCurrentPriceFromBuyBox(html) {
  const discountPrice = extractFirst(
    html,
    /<span[^>]*class="[^"]*\bgame-buy-button-price-discount\b[^"]*"[^>]*>\s*([^<]+)\s*<\/span>/i
  )

  const originalPrice = extractFirst(
    html,
    /<span[^>]*class="[^"]*\bgame-buy-button-price\b[^"]*\bstrikethrough\b[^"]*"[^>]*>\s*([^<]+)\s*<\/span>/i
  )

  const regularPrice = extractFirst(
    html,
    /<span[^>]*class="[^"]*\bgame-buy-button-price\b[^"]*"[^>]*>\s*([^<]+)\s*<\/span>/i
  )

  const metaPrice = extractFirst(
    html,
    /<meta[^>]*itemprop="price"[^>]*content="([^"]+)"[^>]*>/i
  )

  if (discountPrice) {
    return {
      current: parseMoney(discountPrice),
      original: parseMoney(originalPrice || regularPrice || metaPrice),
    }
  }

  return {
    current: parseMoney(regularPrice || metaPrice),
    original: parseMoney(originalPrice),
  }
}

function parseCurrentPsPlusPriceFromBuyBox(html) {
  const psPlusPrice = extractFirst(
    html,
    /<span[^>]*class="[^"]*\bgame-buy-button-price-bonus\b[^"]*"[^>]*>\s*([^<]+)\s*<\/span>/i
  )

  return parseMoney(psPlusPrice)
}

function getLatestChartPriceAmount(entries) {
  let latestPrice = null

  for (const entry of entries) {
    const price = parseMoney(entry?.price)

    if (price !== null) {
      latestPrice = price
    }
  }

  return latestPrice
}

function parsePage(html, url) {
  const psdealsId = parseInteger(extractFirst(html, /var item_id=(\d+);/i))
  const title =
    extractFirst(html, /<div itemprop="name" class="game-title-info-name">([\s\S]*?)<\/div>/i) ||
    extractFirst(html, /<title>([\s\S]*?)<\/title>/i)

  if (!psdealsId || !title) {
    throw new Error('Could not extract psdeals_id or title')
  }

  const psdealsSlug = url.match(/\/game\/\d+\/([^/?#]+)/i)?.[1] || String(psdealsId)

  const platformLabel = extractFirst(html, /<span class="game-cover-top-platform">([\s\S]*?)<\/span>/i)
  const itemType =
    extractFirst(html, /var item_type="([^"]*)";/i) ||
    extractFirst(html, /<div class="game-title-info-type[^"]*"><span>([\s\S]*?)<\/span><\/div>/i)

  const storeUrl = extractFirst(html, /<a class="game-buy-button-href"[^>]*href="([^"]+)"/i)
  const { current, original } = parseCurrentPriceFromBuyBox(html)
  const discountPercent =
    parseInteger(extractFirst(html, /SAVE:\s*<span[^>]*>\s*([^<]+)\s*<\/span>/i)) ||
    parseInteger(extractFirst(html, /Now on sale with\s+(\d+)%\s+discount/i))

  const releaseDate =
    parseDateOnly(extractFirst(html, /itemprop="releaseDate" content="([^"]+)"/i)) ||
    parseDateOnly(extractFirst(html, /<strong>Release date:<\/strong>\s*<span[^>]*>([^<]+)<\/span>/i))

  const publisher = extractFirst(html, /<strong>Publisher:<\/strong>\s*<span[^>]*>([\s\S]*?)<\/span>/i)
    ? stripTags(extractFirst(html, /<strong>Publisher:<\/strong>\s*<span[^>]*>([\s\S]*?)<\/span>/i))
    : null

  const genreText = stripTags(
    extractFirst(html, /<strong>Genre:<\/strong>\s*<span[^>]*>([\s\S]*?)<\/span>/i) || ''
  )

  const dealEndsText = extractFirst(html, /<p class="game-cover-bottom-small">Ends:\s*([^<]+)<\/p>/i)
  const dealEndsAt = dealEndsText ? new Date(dealEndsText).toISOString() : null

    const imageUrl =
    extractFirst(
      html,
      /<img[^>]*class="[^"]*\bgame-cover-image\b[^"]*"[^>]*content="([^"]+)"/i
    ) ||
    extractFirst(
      html,
      /<img[^>]*class="[^"]*\bgame-cover-image\b[^"]*"[^>]*data-src="([^"]+)"/i
    ) ||
    extractFirst(
      html,
      /<source[^>]*data-srcset="([^"]+)"/i
    )?.split(/\s+/)[0] ||
    extractFirst(html, /<meta property="og:image" content="([^"]+)"/i) ||
    extractFirst(html, /<meta itemprop="image" content="([^"]+)"/i)

  const description = parseDescription(html)

  const currencyCode =
    extractFirst(html, /itemprop="priceCurrency" content="([^"]+)"/i) ||
    (extractFirst(html, /var item_currency="([^"]+)";/i) === '$' ? 'USD' : 'USD')

  const lowestPriceAmount = parseMoney(
    extractFirst(
      html,
      /<p class="game-stats-col-title">Lowest price<\/p>[\s\S]*?<span class="game-stats-col-number-big[^"]*">([^<]+)<\/span>/i
    )
  )

  const lowestPsPlusRaw = extractFirst(
    html,
    /<p class="game-stats-col-title">Lowest PS\+ price<\/p>[\s\S]*?<span class="game-stats-col-number-big[^"]*">([^<]+)<\/span>/i
  )
  const lowestPsPlusPriceAmount =
    lowestPsPlusRaw && lowestPsPlusRaw !== '--' ? parseMoney(lowestPsPlusRaw) : null

  const playstationScore = parseFloatNumber(
    extractFirst(
      html,
      /<p class="game-stats-col-title">PlayStation<br>Rating<\/p>[\s\S]*?<span id="playstation_score"[^>]*>([^<]+)<\/span>/i
    )
  )

  const playstationRatingsCount = parseInteger(
    extractFirst(
      html,
      /<p class="game-stats-col-title">PlayStation<br>Rating<\/p>[\s\S]*?<p class="game-stats-col-desc">Ratings:\s*<span>([^<]+)<\/span><\/p>/i
    )
  )

  const allAddOnsHref = extractFirst(html, /<a href="([^"]+\/add-ons\/[^"]+)" style="display:none">All add-ons/i)
  const allAddOnsUrl = allAddOnsHref
    ? allAddOnsHref.startsWith('http')
      ? allAddOnsHref
      : new URL(allAddOnsHref, 'https://psdeals.net').toString()
    : null

  const chartPricesRaw = extractFirst(html, /var chart_prices="([\s\S]*?)";var /i)
  const chartBonusPricesRaw = extractFirst(html, /var chart_bonus_prices="([\s\S]*?)";var /i)
  const chartBonusActive = /var chart_bonus_active=true;/i.test(html)

  const chartPrices = parseChartJsonString(chartPricesRaw)
  const chartBonusPrices = parseChartJsonString(chartBonusPricesRaw)

  const priceHistoryRegular = chartPrices
    .map((entry) => ({
      price_kind: 'regular',
      observed_at: parseObservedAt(entry?.date),
      price_amount: parseMoney(entry?.price),
      currency_code: currencyCode,
    }))
    .filter((entry) => entry.observed_at && entry.price_amount !== null)

  const priceHistoryPsPlus = chartBonusPrices
    .map((entry) => ({
      price_kind: 'ps_plus',
      observed_at: parseObservedAt(entry?.date),
      price_amount: parseMoney(entry?.price),
      currency_code: currencyCode,
    }))
    .filter((entry) => entry.observed_at && entry.price_amount !== null)

  const currentPsPlusBuyBoxPriceAmount = parseCurrentPsPlusPriceFromBuyBox(html)

const latestChartBonusPriceAmount = chartBonusActive
  ? getLatestChartPriceAmount(chartBonusPrices)
  : null

const currentPsPlusPriceAmount =
  latestChartBonusPriceAmount ?? currentPsPlusBuyBoxPriceAmount

const explicitCurrentPlus = /PS\+/i.test(
  extractFirst(html, /<div class="game-buy-button-right">([\s\S]*?)<\/div>/i) || ''
)

const isPsPlusDiscount = Boolean(
  (
    currentPsPlusPriceAmount !== null &&
    current !== null &&
    currentPsPlusPriceAmount > 0 &&
    currentPsPlusPriceAmount < current
  ) ||
    explicitCurrentPlus ||
    (
      chartBonusActive &&
      lowestPsPlusPriceAmount !== null &&
      current !== null &&
      current === lowestPsPlusPriceAmount
    )
)

  const whatsInsideLines = parseWhatsInsideLines(html)
  const relations = parseRelatedItems(html)

  return {
    psdeals_id: psdealsId,
    psdeals_slug: psdealsSlug,
    psdeals_url: url,
    title: stripTags(title),
    platforms: derivePlatforms(platformLabel),
    content_type: deriveContentType(itemType, title, html),
    item_type_label: itemType ? stripTags(itemType) : null,
    store_url: storeUrl,
    store_url_kind: deriveStoreUrlKind(storeUrl),
    ps_store_primary_id: derivePsStorePrimaryId(storeUrl),
    image_url: imageUrl,
    description,
    publisher,
    genres: parseGenreList(genreText),
    release_date: releaseDate,
    current_price_amount: current,
    original_price_amount: original,
    discount_percent: discountPercent,
    currency_code: currencyCode,
    deal_ends_at: dealEndsAt,
    lowest_price_amount: lowestPriceAmount,
    lowest_ps_plus_price_amount: lowestPsPlusPriceAmount,
    is_ps_plus_discount: isPsPlusDiscount,
    metacritic_score: null,
    metacritic_user_score: null,
    metacritic_reviews_count: null,
    playstation_rating: playstationScore,
    playstation_ratings_count: playstationRatingsCount,
    all_add_ons_url: allAddOnsUrl,
    whats_inside_lines: whatsInsideLines,
    is_free_to_play: current === 0,
    availability_state: deriveAvailabilityState(current, title),
    listing_last_seen_at: null,
    detail_last_synced_at: nowIso(),
    raw_listing_json: null,
    raw_detail_json: {
  fetched_url: url,
  imported_at: nowIso(),
  chart_prices_count: priceHistoryRegular.length,
  chart_bonus_prices_count: priceHistoryPsPlus.length,
  chart_bonus_active: chartBonusActive,
  current_ps_plus_price_amount: currentPsPlusPriceAmount,
  current_ps_plus_buy_box_price_amount: currentPsPlusBuyBoxPriceAmount,
  latest_chart_bonus_price_amount: latestChartBonusPriceAmount,
  fetch_mode: 'playwright',
},
    source_note: 'psdeals_detail_import_local',
    price_history_regular: priceHistoryRegular,
    price_history_ps_plus: priceHistoryPsPlus,
    relations,
  }
}

function ensureLikelyPsDealsDetailPage(html, status, url, title) {
  if (!Number.isInteger(status) || status >= 400) {
    throw new Error(`Navigation failed with status ${status} for ${url}`)
  }

  const hasItemId = /var item_id=\d+;/i.test(html)
  const hasGameTitle = /<div itemprop="name" class="game-title-info-name">/i.test(html)

  if (!hasItemId || !hasGameTitle) {
    throw new Error(
      `Loaded HTML did not contain required PSDeals detail markers for ${url} | title=${title || 'n/a'} | hasItemId=${hasItemId} | hasGameTitle=${hasGameTitle}`
    )
  }
}

async function saveDebugHtml(baseDir, url, html) {
  if (!baseDir) return null

  const urlObject = new URL(url)
  const safePath = `${urlObject.hostname}${urlObject.pathname}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180)

  const outputDir = path.resolve(process.cwd(), baseDir)
  await fs.mkdir(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, `${safePath || 'psdeals-detail'}.html`)
  await fs.writeFile(outputPath, html, 'utf8')
  return outputPath
}

async function createBrowserContext(headless) {
  const browser = await chromium.launch({
    headless,
  })

  const context = await browser.newContext({
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
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    })
  })

  await context.route('**/*', async (route) => {
    const request = route.request()
    const resourceType = request.resourceType()

    if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
      await route.abort()
      return
    }

    await route.continue()
  })

  return { browser, context }
}

async function fetchHtmlWithPlaywright(context, url, timeoutMs, debugHtmlDir) {
  const page = await context.newPage()

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    })

    if (!response) {
      throw new Error(`Navigation returned no HTTP response for ${url}`)
    }

    try {
      await page.waitForSelector('.game-buy-button-href', { timeout: 15000 })
    } catch {
      // continue; some pages may still be parseable without this selector
    }

    try {
      await page.waitForSelector(
        '.game-buy-button-price, .game-buy-button-price-discount, meta[itemprop="price"]',
        { timeout: 15000 }
      )
    } catch {
      // continue; parser still has fallbacks
    }

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(1500)

    const title = await page.title()
    const html = await page.content()
    ensureLikelyPsDealsDetailPage(html, response.status(), url, title)

    const debugHtmlPath = await saveDebugHtml(debugHtmlDir, url, html)

    return {
      html,
      title,
      status: response.status(),
      finalUrl: page.url(),
      debugHtmlPath,
    }
  } finally {
    await page.close().catch(() => {})
  }
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

function createEdgeLiveClient(endpoint) {
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
    reject(new Error('Timed out opening Edge WebSocket.'))
  }, 120000)

    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    })

    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('WebSocket error while opening Edge connection.'))
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

async function evaluateEdgeLive(edgeClient, sessionId, expression, timeoutMs = 30000) {
  const result = await edgeClient.send(
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

async function createEdgeLiveSession(edgeEndpoint) {
  const endpoint = edgeEndpoint || (await readEdgeEndpointFromFile())
  const edgeClient = createEdgeLiveClient(endpoint)

  await edgeClient.opened

  const targetsResult = await edgeClient.send('Target.getTargets')
  const targets = targetsResult.targetInfos || []

  const pageTarget =
    targets.find((target) => target.type === 'page' && target.url.includes('psdeals.net')) ||
    targets.find((target) => target.type === 'page')

  if (!pageTarget) {
    throw new Error('No page target found in Edge. Open PSDeals in Edge first.')
  }

  console.log(`Edge live selected target: ${pageTarget.title} | ${pageTarget.url}`)

  const attachResult = await edgeClient.send('Target.attachToTarget', {
    targetId: pageTarget.targetId,
    flatten: true,
  })

  const sessionId = attachResult.sessionId

  await edgeClient.send('Page.enable', {}, sessionId)
  await edgeClient.send('Runtime.enable', {}, sessionId)

  return {
    endpoint,
    edgeClient,
    sessionId,
  }
}

async function waitForEdgeLiveDetail(edgeClient, sessionId, url, timeoutMs) {
  const startedAt = Date.now()
  let lastState = null

  while (Date.now() - startedAt < timeoutMs) {
    const state = await evaluateEdgeLive(
      edgeClient,
      sessionId,
      `
(() => {
  const text = document.body?.innerText || ''
  const normalized = text.replace(/\\s+/g, ' ').trim().toLowerCase()
  const title = document.title || ''
  const normalizedTitle = title.toLowerCase()

  const hasDetailMarkers =
    /var\\s+item_id\\s*=\\s*\\d+\\s*;/i.test(document.documentElement.outerHTML) ||
    document.querySelector('.game-title-info-name') !== null ||
    document.querySelector('.game-buy-button-href') !== null ||
    document.querySelector('meta[itemprop="price"]') !== null

  const hasBlockingChallenge =
    normalizedTitle.includes('just a moment') ||
    normalizedTitle.includes('un momento') ||
    normalized.includes('performing security verification') ||
    normalized.includes('verify you are human') ||
    normalized.includes('demuestra que no eres un robot') ||
    normalized.includes('no eres un robot') ||
    normalized.includes('incompatible browser extension or network configuration')

  return {
    title,
    url: location.href,
    readyState: document.readyState,
    textLength: text.length,
    hasBuyAt: normalized.includes('buy at'),
    hasPlayStationStore: normalized.includes('playstation store'),
    hasNotify: normalized.includes('notify'),
    hasPriceHistory: normalized.includes('price history'),
    hasDetailMarkers,
    hasBlockingChallenge,
  }
})()
`,
      15000
    )

    lastState = state

    if (
      state?.hasDetailMarkers ||
      state?.hasBuyAt ||
      state?.hasPlayStationStore ||
      state?.hasNotify ||
      state?.hasPriceHistory ||
      state?.textLength > 3000
    ) {
      return state
    }

    if (state?.hasBlockingChallenge) {
      console.log(
        `Waiting for Edge live verification: title="${state.title}" url="${state.url}"`
      )
    }

    await sleep(1000)
  }

  throw new Error(
    `PSDEALS_DETAIL_TIMEOUT: ${url} | last_title="${lastState?.title || 'n/a'}" | last_url="${lastState?.url || 'n/a'}" | last_text_length=${lastState?.textLength ?? 'n/a'}`
  )
}

async function fetchHtmlWithEdgeLive(edgeLiveSession, url, timeoutMs, debugHtmlDir) {
  const { edgeClient, sessionId } = edgeLiveSession

  await edgeClient.send('Page.navigate', { url }, sessionId, timeoutMs)

  const state = await waitForEdgeLiveDetail(edgeClient, sessionId, url, timeoutMs)

  const pageData = await evaluateEdgeLive(
    edgeClient,
    sessionId,
    `
(() => {
  return {
    title: document.title,
    finalUrl: location.href,
    html: document.documentElement.outerHTML,
  }
})()
`,
    timeoutMs
  )

  let debugHtmlPath = null

  if (debugHtmlDir) {
    await fs.mkdir(debugHtmlDir, { recursive: true })

  const safeName = url
  .replace(/^https?:\/\//i, '')
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 180)

    debugHtmlPath = path.resolve(debugHtmlDir, `${safeName}.html`)
    await fs.writeFile(debugHtmlPath, pageData.html, 'utf8')
  }

  return {
    html: pageData.html,
    title: pageData.title || state?.title || null,
    finalUrl: pageData.finalUrl || state?.url || url,
    status: 200,
    debugHtmlPath,
  }
}

await loadKeyValueFile(path.resolve(process.cwd(), '.env.local'))
await loadKeyValueFile(
  path.resolve(process.cwd(), '..', 'worker-playstation-ingest', '.dev.vars')
)

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl) {
  console.error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  process.exit(1)
}

if (!secretKey) {
  console.error('Missing SUPABASE_SECRET_KEY')
  process.exit(1)
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

const fileArg = process.argv.find((arg) => arg.startsWith('--file='))
const delayArg = process.argv.find((arg) => arg.startsWith('--delay-ms='))
const timeoutArg = process.argv.find((arg) => arg.startsWith('--timeout-ms='))
const headlessArg = process.argv.find((arg) => arg.startsWith('--headless='))
const debugHtmlDirArg = process.argv.find((arg) => arg.startsWith('--debug-html-dir='))
const priceHistoryModeArg = process.argv.find((arg) => arg.startsWith('--price-history-mode='))
const relationsModeArg = process.argv.find((arg) => arg.startsWith('--relations-mode='))
const fetchModeArg = process.argv.find((arg) => arg.startsWith('--fetch-mode='))
const edgeEndpointArg = process.argv.find((arg) => arg.startsWith('--edge-endpoint='))

const delayMs = delayArg ? Number(delayArg.split('=')[1]) : 5000
const timeoutMs = timeoutArg ? Number(timeoutArg.split('=')[1]) : 45000
const headless = headlessArg ? headlessArg.split('=')[1] !== 'false' : true
const debugHtmlDir = debugHtmlDirArg ? debugHtmlDirArg.split('=')[1] : 'logs/psdeals-import-html'
const priceHistoryMode = priceHistoryModeArg ? priceHistoryModeArg.split('=')[1] : 'replace'
const relationsMode = relationsModeArg ? relationsModeArg.split('=')[1] : 'replace'
const fetchMode = fetchModeArg ? fetchModeArg.split('=')[1] : 'playwright'
const edgeEndpoint = edgeEndpointArg ? edgeEndpointArg.split('=')[1] : null

if (!['playwright', 'edge-live'].includes(fetchMode)) {
  console.error('Invalid --fetch-mode value. Use playwright or edge-live.')
  process.exit(1)
}

if (!['replace', 'append', 'skip'].includes(priceHistoryMode)) {
  console.error('Invalid --price-history-mode value. Use replace, append, or skip.')
  process.exit(1)
}

if (!['replace', 'skip'].includes(relationsMode)) {
  console.error('Invalid --relations-mode value. Use replace or skip.')
  process.exit(1)
}

if (!fileArg) {
  console.error('Missing --file argument. Example: --file=data/import/psdeals-detail-sample-001.txt')
  process.exit(1)
}

const inputFile = fileArg.split('=')[1]
const inputPath = path.resolve(process.cwd(), inputFile)

const rawInput = await fs.readFile(inputPath, 'utf8')
const urls = rawInput
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))

if (urls.length === 0) {
  console.error('No URLs found in input file.')
  process.exit(1)
}

const { data: runRow, error: runInsertError } = await admin
  .from('psdeals_import_runs')
  .insert({
    source_kind: 'detail',
    region_code: 'us',
    storefront: 'playstation',
    input_url: inputFile,
    page_from: null,
    page_to: null,
    status: 'running',
    started_at: nowIso(),
  })
  .select('id')
  .single()

if (runInsertError || !runRow?.id) {
  console.error(runInsertError || 'Failed to create import run')
  process.exit(1)
}

const runId = runRow.id

let itemsSeen = 0
let itemsInserted = 0
let itemsUpdated = 0
let itemsFailed = 0

let browser = null
let context = null
let edgeLiveSession = null

if (fetchMode === 'edge-live') {
  edgeLiveSession = await createEdgeLiveSession(edgeEndpoint)
} else {
  const created = await createBrowserContext(headless)
  browser = created.browser
  context = created.context
}

try {
  for (const url of urls) {
    itemsSeen += 1

    try {
            const fetched =
        fetchMode === 'edge-live'
          ? await fetchHtmlWithEdgeLive(edgeLiveSession, url, timeoutMs, debugHtmlDir)
          : await fetchHtmlWithPlaywright(context, url, timeoutMs, debugHtmlDir)
      const parsed = parsePage(fetched.html, url)

      const upsertPayload = {
        region_code: 'us',
        storefront: 'playstation',
        psdeals_id: parsed.psdeals_id,
        psdeals_slug: parsed.psdeals_slug,
        psdeals_url: parsed.psdeals_url,
        title: parsed.title,
        platforms: parsed.platforms,
        content_type: parsed.content_type,
        item_type_label: parsed.item_type_label,
        store_url: parsed.store_url,
        store_url_kind: parsed.store_url_kind,
        ps_store_primary_id: parsed.ps_store_primary_id,
        image_url: parsed.image_url,
        description: parsed.description,
        publisher: parsed.publisher,
        genres: parsed.genres,
        release_date: parsed.release_date,
        current_price_amount: parsed.current_price_amount,
        original_price_amount: parsed.original_price_amount,
        discount_percent: parsed.discount_percent,
        currency_code: parsed.currency_code,
        deal_ends_at: parsed.deal_ends_at,
        lowest_price_amount: parsed.lowest_price_amount,
        lowest_ps_plus_price_amount: parsed.lowest_ps_plus_price_amount,
        is_ps_plus_discount: parsed.is_ps_plus_discount,
        metacritic_score: parsed.metacritic_score,
        metacritic_user_score: parsed.metacritic_user_score,
        metacritic_reviews_count: parsed.metacritic_reviews_count,
        playstation_rating: parsed.playstation_rating,
        playstation_ratings_count: parsed.playstation_ratings_count,
        all_add_ons_url: parsed.all_add_ons_url,
        whats_inside_lines: parsed.whats_inside_lines,
        is_free_to_play: parsed.is_free_to_play,
        availability_state: parsed.availability_state,
        detail_last_synced_at: parsed.detail_last_synced_at,
        raw_detail_json: {
          ...parsed.raw_detail_json,
          http_status: fetched.status,
          page_title: fetched.title,
          final_url: fetched.finalUrl,
          debug_html_path: fetched.debugHtmlPath,
        },
        source_note: parsed.source_note,
      }

      const { data: existing, error: existingError } = await admin
        .from('psdeals_stage_items')
        .select('id')
        .eq('region_code', 'us')
        .eq('storefront', 'playstation')
        .eq('psdeals_id', parsed.psdeals_id)
        .maybeSingle()

      if (existingError) {
        throw existingError
      }

      const { data: stagedItem, error: upsertError } = await admin
        .from('psdeals_stage_items')
        .upsert(upsertPayload, {
          onConflict: 'region_code,storefront,psdeals_id',
          ignoreDuplicates: false,
        })
        .select('id')
        .single()

      if (upsertError || !stagedItem?.id) {
        throw upsertError || new Error('Upsert failed for psdeals_stage_items')
      }

      if (existing?.id) {
        itemsUpdated += 1
      } else {
        itemsInserted += 1
      }

            const historyRowsRaw = [
        ...parsed.price_history_regular,
        ...parsed.price_history_ps_plus,
      ].map((entry) => ({
        item_id: stagedItem.id,
        price_kind: entry.price_kind,
        observed_at: entry.observed_at,
        price_amount: entry.price_amount,
        currency_code: entry.currency_code,
        source_name: 'psdeals',
      }))

      const historyRowsByKey = new Map()

      for (const row of historyRowsRaw) {
        const key = [
          row.item_id,
          row.price_kind,
          row.observed_at,
          row.price_amount,
        ].join('|')

        if (!historyRowsByKey.has(key)) {
          historyRowsByKey.set(key, row)
        }
      }

      const historyRows = [...historyRowsByKey.values()]

      if (priceHistoryMode === 'replace') {
        const { error: deleteHistoryError } = await admin
          .from('psdeals_stage_price_history')
          .delete()
          .eq('item_id', stagedItem.id)

        if (deleteHistoryError) {
          throw deleteHistoryError
        }
      }

      if (priceHistoryMode !== 'skip' && historyRows.length > 0) {
        const historyQuery = admin.from('psdeals_stage_price_history')

        const { error: historyError } =
          priceHistoryMode === 'append'
            ? await historyQuery.upsert(historyRows, {
                onConflict: 'item_id,price_kind,observed_at,price_amount',
                ignoreDuplicates: true,
              })
            : await historyQuery.insert(historyRows)

        if (historyError) {
          throw historyError
        }
      }

      if (relationsMode === 'replace') {
        const { error: deleteRelationsError } = await admin
          .from('psdeals_stage_relations')
          .delete()
          .eq('item_id', stagedItem.id)

        if (deleteRelationsError) {
          throw deleteRelationsError
        }

        if (parsed.relations.length > 0) {
          const relationRows = parsed.relations.map((relation) => ({
            item_id: stagedItem.id,
            relation_kind: relation.relation_kind,
            related_psdeals_id: relation.related_psdeals_id,
            related_title: relation.related_title,
            related_url: relation.related_url,
            related_store_url: relation.related_store_url,
            related_platform_label: relation.related_platform_label,
            sort_order: relation.sort_order,
          }))

          const { error: relationError } = await admin
            .from('psdeals_stage_relations')
            .insert(relationRows)

          if (relationError) {
            throw relationError
          }
        }
      }

      console.log(
        `OK: ${parsed.title} | price=${parsed.current_price_amount ?? 'null'} | original=${parsed.original_price_amount ?? 'null'} | release=${parsed.release_date ?? 'null'} | status=${fetched.status}`
      )

      if (delayMs > 0) {
        await sleep(delayMs)
      }
    } catch (error) {
      itemsFailed += 1
      console.error(`FAILED: ${url}`)
      console.error(summarizeError(error))
    }
  }

  const finalStatus = itemsFailed === 0 ? 'succeeded' : itemsInserted + itemsUpdated > 0 ? 'partial' : 'failed'

  await admin
    .from('psdeals_import_runs')
    .update({
      status: finalStatus,
      items_seen: itemsSeen,
      items_inserted: itemsInserted,
      items_updated: itemsUpdated,
      items_failed: itemsFailed,
      finished_at: nowIso(),
    })
    .eq('id', runId)

  console.log('Import finished.')
  console.log(`Run ID: ${runId}`)
  console.log(`Seen: ${itemsSeen}`)
  console.log(`Inserted: ${itemsInserted}`)
  console.log(`Updated: ${itemsUpdated}`)
  console.log(`Failed: ${itemsFailed}`)
} catch (fatalError) {
  await admin
    .from('psdeals_import_runs')
    .update({
      status: 'failed',
      items_seen: itemsSeen,
      items_inserted: itemsInserted,
      items_updated: itemsUpdated,
      items_failed: itemsFailed + 1,
      last_error: summarizeError(fatalError),
      finished_at: nowIso(),
    })
    .eq('id', runId)

  console.error(fatalError)
  process.exit(1)
} finally {
  if (edgeLiveSession?.edgeClient && edgeLiveSession?.sessionId) {
    await edgeLiveSession.edgeClient
      .send('Target.detachFromTarget', { sessionId: edgeLiveSession.sessionId })
      .catch(() => {})
  }

  if (edgeLiveSession?.edgeClient) {
    await edgeLiveSession.edgeClient.close().catch(() => {})
  }

  if (context) {
    await context.close().catch(() => {})
  }

  if (browser) {
    await browser.close().catch(() => {})
  }
}