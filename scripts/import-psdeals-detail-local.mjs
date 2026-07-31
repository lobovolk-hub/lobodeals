import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import {
  normalizePsdealsCommercialState,
  parsePsdealsPriceSignal,
} from './lib/psdeals-commercial-state.mjs'
import {
  classifyPsdealsItemType,
  normalizePsdealsPlatforms,
} from './lib/psdeals-item-classification.mjs'
import { buildPsdealsDetailUpsertPayload } from './lib/psdeals-stage-payload.mjs'
import { writePsdealsArtifactAtomic } from './lib/psdeals-evidence-io.mjs'
import {
  buildDetailImportEvidence,
  buildDetailRetryEvidence,
} from './lib/psdeals-evidence-producers.mjs'
import {
  buildPsdealsRuntimeIdentity,
  buildPsdealsRuntimeProducer,
  emitPsdealsProducerEvidence,
  getPsdealsCliArg,
  getPsdealsEvidenceCliOptions,
  referencePsdealsFile,
  requireLinkedPsdealsEvidence,
} from './lib/psdeals-evidence-runtime.mjs'

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

function parseMoney(value) {
  return parsePsdealsPriceSignal(value).amount
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
    const quoted = candidate.replace(
      /(^|[^\\])"/g,
      (_, prefix) => `${prefix}\\"`
    )
    return JSON.parse(`"${quoted}"`)
  } catch {
    return candidate
  }
}

function parseChartJsonEvidence(rawLiteral) {
  if (!rawLiteral) return { entries: [], parser_status: 'absent' }

  const decoded = parseJsStringLiteral(rawLiteral)
  if (!decoded) return { entries: [], parser_status: 'invalid' }

  try {
    const parsed = JSON.parse(String(decoded))
    return Array.isArray(parsed)
      ? { entries: parsed, parser_status: 'parsed' }
      : { entries: [], parser_status: 'invalid' }
  } catch {
    return { entries: [], parser_status: 'invalid' }
  }
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

function deriveAvailabilityState(currentPriceAmount, title, commercialState) {
  if (
    commercialState?.classification ===
    'temporary_free_promotion_candidate'
  ) {
    return 'priced'
  }

  if (currentPriceAmount === 0) return null
  if (/demo|trial/i.test(title || '')) return 'demo'
  if (currentPriceAmount == null) return 'tba'
  return 'priced'
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
    const originalPriceSource = originalPrice || regularPrice || metaPrice

    return {
      current: parseMoney(discountPrice),
      original: parseMoney(originalPriceSource),
      currentSource: discountPrice,
      originalSource: originalPriceSource,
    }
  }

  const currentPriceSource = regularPrice || metaPrice

  return {
    current: parseMoney(currentPriceSource),
    original: parseMoney(originalPrice),
    currentSource: currentPriceSource,
    originalSource: originalPrice,
  }
}

function parseCurrentPsPlusPriceFromBuyBox(html) {
  const psPlusPriceInnerHtml = extractFirst(
    html,
    /<span[^>]*class="[^"]*\bgame-buy-button-price-bonus\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i
  )

  const psPlusPriceText =
    psPlusPriceInnerHtml === null ? null : stripTags(psPlusPriceInnerHtml)

  return parseMoney(psPlusPriceText)
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

export function parsePage(html, url, options = {}) {
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
  const typeClassification = classifyPsdealsItemType(itemType, {
    sourceContext: 'detail',
  })
  const platformClassification = normalizePsdealsPlatforms(platformLabel, {
    sourceContext: 'detail',
  })

  const storeUrl = extractFirst(html, /<a class="game-buy-button-href"[^>]*href="([^"]+)"/i)
  const priceSignals = parseCurrentPriceFromBuyBox(html)
  const discountPercentSource =
    extractFirst(
      html,
      /SAVE:\s*<span[^>]*>\s*([^<]+)\s*<\/span>/i
    ) ||
    extractFirst(html, /Now on sale with\s+(\d+)%\s+discount/i)
  const commercialState = normalizePsdealsCommercialState({
    currentPrice: priceSignals.currentSource,
    originalPrice: priceSignals.originalSource,
    discountPercent: discountPercentSource,
    sourceContext: 'detail',
  })
  const current = commercialState.current_price_amount
  const original = commercialState.original_price_amount
  const discountPercent = commercialState.discount_percent_normalized

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

  const chartBonusPricesRaw = extractFirst(html, /var chart_bonus_prices="([\s\S]*?)";var /i)
  const chartBonusActive = /var chart_bonus_active=true;/i.test(html)

  const chartEvidence = parseChartJsonEvidence(chartBonusPricesRaw)
  const chartBonusPrices = chartEvidence.entries

  const psPlusBuyBoxMarkerPresent =
    /\bgame-buy-button-price-bonus\b/i.test(html)
  const currentPsPlusBuyBoxPriceAmount = parseCurrentPsPlusPriceFromBuyBox(html)

  const latestChartBonusPriceAmount = chartBonusActive
    ? getLatestChartPriceAmount(chartBonusPrices)
    : null

  const currentPsPlusPriceAmount = currentPsPlusBuyBoxPriceAmount

  const isPsPlusDiscount = Boolean(
    currentPsPlusPriceAmount !== null &&
    current !== null &&
    currentPsPlusPriceAmount > 0 &&
    current > 0 &&
    currentPsPlusPriceAmount < current
  )
  const plusSourceConsistent = Boolean(
    currentPsPlusBuyBoxPriceAmount !== null &&
    (
      latestChartBonusPriceAmount === null ||
      latestChartBonusPriceAmount === currentPsPlusBuyBoxPriceAmount
    )
  )
  const plusParserStatus = !psPlusBuyBoxMarkerPresent
    ? 'buy_box_absent'
    : currentPsPlusBuyBoxPriceAmount === null
      ? 'buy_box_unparseable'
      : isPsPlusDiscount
        ? 'parsed_current_discount'
        : 'parsed_not_discount'
  const currentPsPlusDiscountState =
    plusParserStatus === 'parsed_current_discount'
      ? true
      : plusParserStatus === 'parsed_not_discount'
        ? false
        : null
  const detailObservedAt =
    options.observedAt && !Number.isNaN(new Date(options.observedAt).getTime())
      ? new Date(options.observedAt).toISOString()
      : nowIso()

  const isTemporaryFreePromotion =
    commercialState.classification ===
    'temporary_free_promotion_candidate'
  const isFreeToPlay =
    current === 0
      ? isTemporaryFreePromotion
        ? false
        : null
      : false
  const availabilityState = deriveAvailabilityState(
    current,
    title,
    commercialState
  )

  const whatsInsideLines = parseWhatsInsideLines(html)
  const relations = parseRelatedItems(html)

  return {
    psdeals_id: psdealsId,
    psdeals_slug: psdealsSlug,
    psdeals_url: url,
    title: stripTags(title),
    platforms: platformClassification.target_platforms,
    content_type: typeClassification.content_type,
    item_type_label: typeClassification.item_type_label,
    type_classification: typeClassification,
    platform_classification: platformClassification,
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
    is_ps_plus_discount: currentPsPlusDiscountState,
    // Metacritic fields are intentionally not written by the PSDeals importer.
    // They are owned by the dedicated Metacritic collector/backfill flow.
    playstation_rating: playstationScore,
    playstation_ratings_count: playstationRatingsCount,
    all_add_ons_url: allAddOnsUrl,
    whats_inside_lines: whatsInsideLines,
    is_free_to_play: isFreeToPlay,
    availability_state: availabilityState,
    detail_last_synced_at: detailObservedAt,
    raw_detail_json: {
  fetched_url: url,
  imported_at: detailObservedAt,
  chart_bonus_prices_count: chartBonusPrices.length,
  chart_bonus_active: chartBonusActive,
  current_ps_plus_price_amount: currentPsPlusPriceAmount,
  current_ps_plus_buy_box_price_amount: currentPsPlusBuyBoxPriceAmount,
  latest_chart_bonus_price_amount: latestChartBonusPriceAmount,
  ps_plus_evidence: {
    parser_status: plusParserStatus,
    buy_box_marker_present: psPlusBuyBoxMarkerPresent,
    chart_parser_status: chartEvidence.parser_status,
    source_consistent: plusSourceConsistent,
  },
  commercial_state: commercialState,
  type_classification: typeClassification,
  platform_classification: platformClassification,
  fetch_mode: 'playwright',
},
    source_note: 'psdeals_detail_import_local',
    commercial_state: commercialState,
    relations,
  }
}

export function buildCommercialUpsertPayload(parsed) {
  if (!parsed?.commercial_state?.is_safe_for_price_update) return {}

  const payload = {
    current_price_amount: parsed.current_price_amount,
    original_price_amount: parsed.original_price_amount,
    discount_percent: parsed.discount_percent,
    deal_ends_at: parsed.deal_ends_at,
  }

  if (typeof parsed.is_ps_plus_discount === 'boolean') {
    payload.is_ps_plus_discount = parsed.is_ps_plus_discount
  }

  if (typeof parsed.is_free_to_play === 'boolean') {
    payload.is_free_to_play = parsed.is_free_to_play
  }

  if (parsed.availability_state) {
    payload.availability_state = parsed.availability_state
  }

  return payload
}

export function buildImporterDetailEvidence({
  evidence_kind,
  identity,
  producer,
  timestamps,
  context,
  inputs,
  outputs,
  result,
} = {}) {
  const input = {
    identity,
    producer,
    timestamps,
    context,
    inputs,
    outputs,
    result,
  }
  return evidence_kind === 'detail_retry'
    ? buildDetailRetryEvidence(input)
    : buildDetailImportEvidence(input)
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

async function main() {
const evidenceOptions = getPsdealsEvidenceCliOptions(process.argv)
const evidenceStartedAt = new Date().toISOString()
const evidenceKindArg = getPsdealsCliArg(
  process.argv,
  'evidence-kind',
  'detail_import'
)
const parentEvidenceArg = getPsdealsCliArg(process.argv, 'parent-evidence')
const remoteCycleIdArg = getPsdealsCliArg(process.argv, 'remote-cycle-id')
const summaryOutputArg = getPsdealsCliArg(process.argv, 'summary-output-json')
const failuresOutputArg = getPsdealsCliArg(process.argv, 'failures-output-txt')

if (!['detail_import', 'detail_retry'].includes(evidenceKindArg)) {
  throw new Error('Invalid --evidence-kind. Use detail_import or detail_retry.')
}

if (
  evidenceOptions.tracked &&
  (!parentEvidenceArg || !summaryOutputArg || !failuresOutputArg || !remoteCycleIdArg)
) {
  throw new Error(
    'EVIDENCE_OUTPUTS_INCOMPLETE: tracked import requires --parent-evidence, --remote-cycle-id, --summary-output-json and --failures-output-txt.'
  )
}
if (
  evidenceOptions.tracked &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(remoteCycleIdArg)
) {
  throw new Error('REMOTE_CYCLE_ID_INVALID')
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
const relationsModeArg = process.argv.find((arg) => arg.startsWith('--relations-mode='))
const fetchModeArg = process.argv.find((arg) => arg.startsWith('--fetch-mode='))
const edgeEndpointArg = process.argv.find((arg) => arg.startsWith('--edge-endpoint='))

const delayMs = delayArg ? Number(delayArg.split('=')[1]) : 5000
const timeoutMs = timeoutArg ? Number(timeoutArg.split('=')[1]) : 45000
const headless = headlessArg ? headlessArg.split('=')[1] !== 'false' : true
const debugHtmlDir = debugHtmlDirArg ? debugHtmlDirArg.split('=')[1] : 'logs/psdeals-import-html'
const relationsMode = relationsModeArg ? relationsModeArg.split('=')[1] : 'replace'
const fetchMode = fetchModeArg ? fetchModeArg.split('=')[1] : 'playwright'
const edgeEndpoint = edgeEndpointArg ? edgeEndpointArg.split('=')[1] : null

if (!['playwright', 'edge-live'].includes(fetchMode)) {
  console.error('Invalid --fetch-mode value. Use playwright or edge-live.')
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

let parentEvidence = null
let trackedInputReference = null
let parentEvidenceReference = null
if (evidenceOptions.tracked) {
  const projectRoot = process.cwd()
  parentEvidence = await requireLinkedPsdealsEvidence({
    evidence_path: path.resolve(process.cwd(), parentEvidenceArg),
    expected_kind:
      evidenceKindArg === 'detail_retry'
        ? 'detail_import'
        : 'fast_refresh_analysis',
    local_cycle_id: evidenceOptions.local_cycle_id,
    run_token: evidenceOptions.run_token,
  })
  trackedInputReference = await referencePsdealsFile({
    project_root: projectRoot,
    file_path: inputPath,
    role:
      evidenceKindArg === 'detail_retry'
        ? 'original_failures'
        : 'combined_queue',
    artifact_kind: 'url_queue',
  })
  const expectedParentArtifact = parentEvidence.envelope.outputs.find(
    (reference) =>
      reference.role ===
      (evidenceKindArg === 'detail_retry'
        ? 'detail_failures'
        : 'combined_queue')
  )
  if (
    !expectedParentArtifact ||
    expectedParentArtifact.sha256 !== trackedInputReference.sha256
  ) {
    throw new Error('IMPORT_INPUT_HASH_MISMATCH')
  }
  parentEvidenceReference = await referencePsdealsFile({
    project_root: projectRoot,
    file_path: parentEvidence.absolute_path,
    role:
      evidenceKindArg === 'detail_retry'
        ? 'initial_import_evidence'
        : 'fast_refresh_evidence',
    artifact_kind: 'evidence_envelope',
    local_cycle_id: evidenceOptions.local_cycle_id,
    run_token: evidenceOptions.run_token,
  })
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
const failedUrls = []

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
      const detailSourceSha256 = createHash('sha256')
        .update(Buffer.from(fetched.html, 'utf8'))
        .digest('hex')
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

      const detailPayloadResult = buildPsdealsDetailUpsertPayload(parsed, {
        isExisting: Boolean(existing?.id),
        certificationContext: evidenceOptions.tracked
          ? {
              remote_cycle_id: remoteCycleIdArg,
              evidence_sha256: detailSourceSha256,
            }
          : null,
        rawDetailMetadata: {
          http_status: fetched.status,
          page_title: fetched.title,
          final_url: fetched.finalUrl,
          debug_html_path: fetched.debugHtmlPath,
        },
      })

      if (!detailPayloadResult.is_valid) {
        throw new Error(
          `Unsafe detail payload: ${detailPayloadResult.reason_codes.join(', ')}`
        )
      }

      const upsertPayload = detailPayloadResult.payload

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
      failedUrls.push(url)
      console.error(`FAILED: ${url}`)
      console.error(summarizeError(error))
    }
  }

  const finalStatus = itemsFailed === 0 ? 'succeeded' : itemsInserted + itemsUpdated > 0 ? 'partial' : 'failed'

  const { error: runUpdateError } = await admin
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

  if (runUpdateError) throw runUpdateError

  if (evidenceOptions.tracked) {
    const projectRoot = process.cwd()
    const succeededCount = itemsInserted + itemsUpdated
    const uniqueFailedUrls = [...new Set(failedUrls)]
    const summary = {
      evidence_kind: evidenceKindArg,
      import_run_id: runId,
      attempted: itemsSeen,
      inserted: itemsInserted,
      updated: itemsUpdated,
      succeeded: succeededCount,
      failed: itemsFailed,
      skipped: Math.max(0, itemsSeen - succeededCount - itemsFailed),
      failed_urls: uniqueFailedUrls,
      reported_status: finalStatus,
      exit_code: 0,
    }
    const summaryPath = path.resolve(projectRoot, summaryOutputArg)
    const failuresPath = path.resolve(projectRoot, failuresOutputArg)
    await writePsdealsArtifactAtomic({
      output_path: summaryPath,
      content: `${JSON.stringify(summary, null, 2)}\n`,
    })
    await writePsdealsArtifactAtomic({
      output_path: failuresPath,
      content:
        uniqueFailedUrls.length > 0
          ? `${uniqueFailedUrls.join('\n')}\n`
          : '',
    })

    const outputs = [
      await referencePsdealsFile({
        project_root: projectRoot,
        file_path: summaryPath,
        role:
          evidenceKindArg === 'detail_retry'
            ? 'detail_retry_summary'
            : 'detail_import_summary',
        artifact_kind:
          evidenceKindArg === 'detail_retry'
            ? 'detail_retry_summary'
            : 'detail_import_summary',
      }),
      await referencePsdealsFile({
        project_root: projectRoot,
        file_path: failuresPath,
        role:
          evidenceKindArg === 'detail_retry'
            ? 'pending_failures'
            : 'detail_failures',
        artifact_kind: 'url_queue',
      }),
    ]
    const evidenceFinishedAt = new Date().toISOString()
    const evidence = buildImporterDetailEvidence({
      evidence_kind: evidenceKindArg,
      identity: buildPsdealsRuntimeIdentity(evidenceOptions),
      producer: buildPsdealsRuntimeProducer(
        evidenceKindArg === 'detail_retry'
          ? 'import-psdeals-detail-local-retry'
          : 'import-psdeals-detail-local',
        evidenceOptions
      ),
      timestamps: {
        started_at: evidenceStartedAt,
        finished_at: evidenceFinishedAt,
        generated_at: new Date().toISOString(),
      },
      context: parentEvidence.envelope.context,
      inputs:
        evidenceKindArg === 'detail_retry'
          ? [parentEvidenceReference, trackedInputReference]
          : [trackedInputReference, parentEvidenceReference],
      outputs,
      result:
        evidenceKindArg === 'detail_retry'
          ? {
              attempted: itemsSeen,
              succeeded: succeededCount,
              pending_failed: itemsFailed,
              pending_failed_urls: uniqueFailedUrls,
              reported_status: finalStatus,
              exit_code: 0,
              import_run_id: runId,
            }
          : {
              attempted: itemsSeen,
              succeeded: succeededCount,
              failed: itemsFailed,
              skipped: Math.max(0, itemsSeen - succeededCount - itemsFailed),
              failed_urls: uniqueFailedUrls,
              reported_status: finalStatus,
              exit_code: 0,
              import_run_id: runId,
            },
    })
    await emitPsdealsProducerEvidence({
      output_path: path.resolve(projectRoot, evidenceOptions.evidence_output),
      envelope: evidence,
    })
    console.log(`IMPORT_SUMMARY_JSON: ${summaryOutputArg}`)
    console.log(`IMPORT_FAILURES_TXT: ${failuresOutputArg}`)
    console.log(`EVIDENCE_JSON: ${evidenceOptions.evidence_output}`)
  }

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
}

function isMainModule() {
  return Boolean(
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  )
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.stack || error.message : String(error)
    )
    process.exit(1)
  })
}
