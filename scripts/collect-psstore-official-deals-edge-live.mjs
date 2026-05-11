import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

function getArg(name, fallback = null) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  if (!found) return fallback
  return found.slice(prefix.length)
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function fixMojibake(value) {
  return String(value || '')
    .replace(/â„¢/g, '™')
    .replace(/Â®/g, '®')
    .replace(/Â©/g, '©')
    .replace(/â€™/g, '’')
    .replace(/â€˜/g, '‘')
    .replace(/â€œ/g, '“')
    .replace(/â€/g, '”')
    .replace(/â€“/g, '–')
    .replace(/â€”/g, '—')
    .replace(/Â/g, '')
}

function normalizeText(value) {
  return fixMojibake(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function parseMoney(value) {
  if (!value) return null

  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '')

  if (!cleaned) return null

  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

function toMoney(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

function floorMoney(value) {
  if (!Number.isFinite(value)) return null
  return Math.floor((value + 0.000001) * 100) / 100
}

function inferOriginalPriceFromDiscount(currentPriceAmount, discountPercent) {
  if (
    currentPriceAmount === null ||
    !Number.isFinite(currentPriceAmount) ||
    !Number.isFinite(discountPercent) ||
    discountPercent <= 0 ||
    discountPercent >= 100
  ) {
    return null
  }

  const multiplier = 1 - discountPercent / 100
  const roughOriginal = currentPriceAmount / multiplier

  const startCents = Math.max(1, Math.floor((roughOriginal - 0.15) * 100))
  const endCents = Math.ceil((roughOriginal + 0.15) * 100)

  const candidates = []

  for (let cents = startCents; cents <= endCents; cents += 1) {
    const candidate = cents / 100
    const discounted = floorMoney(candidate * multiplier)

    if (discounted === currentPriceAmount) {
      const centsPart = cents % 100

      let priority = 10
      if (centsPart === 99) priority = 1
      else if (centsPart === 49) priority = 2
      else if (centsPart === 95) priority = 3
      else if (centsPart === 0) priority = 4

      candidates.push({
        value: candidate,
        priority,
        distance: Math.abs(candidate - roughOriginal),
      })
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.distance - b.distance
    })

    return toMoney(candidates[0].value)
  }

  return toMoney(roughOriginal)
}

function parseDealText(text) {
  const normalized = normalizeText(text)
  const lines = normalized
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean)

  const discountMatch = normalized.match(/-(\d+)%|Save\s+(\d+)%/i)
  const discountPercent = discountMatch
    ? Number(discountMatch[1] || discountMatch[2])
    : null

  const moneyMatches = [...normalized.matchAll(/\$\s?[\d,]+(?:\.\d{2})?/g)]
    .map((match) => parseMoney(match[0]))
    .filter((price) => price !== null)

  const currentPriceAmount = moneyMatches.length > 0 ? moneyMatches[0] : null

  const uniquePrices = []
  for (const price of moneyMatches) {
    if (!uniquePrices.includes(price)) {
      uniquePrices.push(price)
    }
  }

  let originalPriceAmount = null

  if (
    uniquePrices.length >= 2 &&
    currentPriceAmount !== null &&
    uniquePrices[1] > currentPriceAmount
  ) {
    originalPriceAmount = uniquePrices[1]
  }

  if (
    (originalPriceAmount === null || originalPriceAmount === currentPriceAmount) &&
    currentPriceAmount !== null &&
    Number.isFinite(discountPercent)
  ) {
    originalPriceAmount = inferOriginalPriceFromDiscount(
      currentPriceAmount,
      discountPercent
    )
  }

  const psPlusRequired =
    /ps plus/i.test(normalized) ||
    /playstation plus/i.test(normalized) ||
    /ps\+/i.test(normalized)

  return {
    lines,
    discount_percent: Number.isFinite(discountPercent) ? discountPercent : null,
    current_price_amount: currentPriceAmount,
    original_price_amount: originalPriceAmount,
    ps_plus_required: psPlusRequired,
  }
}

function parseOfficialItemTypeLabel(text) {
  const normalized = normalizeText(text)

  if (/game bundle/i.test(normalized)) return 'bundle'

  if (
    /add-on/i.test(normalized) ||
    /add on/i.test(normalized) ||
    /add-on pack/i.test(normalized) ||
    /virtual currency/i.test(normalized)
  ) {
    return 'addon'
  }

  return 'game'
}

function parseOfficialPlatforms(text) {
  const normalized = normalizeText(text)
  const platforms = []

  if (/\bPS4\b/i.test(normalized)) platforms.push('PS4')
  if (/\bPS5\b/i.test(normalized)) platforms.push('PS5')

  return platforms
}

function getOfficialDealType(parsed, itemTypeLabel, dealType) {
  if (dealType === 'ps_plus' && parsed.current_price_amount === 0) {
    return 'ps_plus_freebie'
  }

  if (dealType === 'ps_plus') {
    return 'ps_plus_discount'
  }

  if (itemTypeLabel === 'addon' && parsed.current_price_amount === 0) {
    return 'free_addon'
  }

  return 'regular_discount'
}

function makePageUrl(baseUrl, pageNumber) {
  const url = new URL(baseUrl)

  const segments = url.pathname.split('/').filter(Boolean)
  const last = segments[segments.length - 1]

  if (/^\d+$/.test(last)) {
    segments[segments.length - 1] = String(pageNumber)
    url.pathname = `/${segments.join('/')}`
    return url.toString()
  }

  url.pathname = `${url.pathname.replace(/\/$/, '')}/${pageNumber}`
  return url.toString()
}

function cleanTitleCandidate(value) {
  const title = normalizeText(value)
    .replace(/\s+\|\s+PS4.*$/i, '')
    .replace(/\s+\|\s+PS5.*$/i, '')
    .replace(/\s+-\s+PS4.*$/i, '')
    .replace(/\s+-\s+PS5.*$/i, '')
    .trim()

  if (!title) return null
  if (/^\$\s?[\d,]+(?:\.\d{2})?/.test(title)) return null
  if (/^-\d+%$/.test(title)) return null
  if (/^Save \d+%/i.test(title)) return null

  if (/^(PS5|PS4|PS5 PS4|Game Bundle|Add-On|Premium Edition)$/i.test(title)) {
    return null
  }

  return title
}

function pickTitleFromItem(item) {
  const directCandidates = [
    item.aria_label,
    item.title_attr,
    item.img_alt,
    item.anchor_text,
  ]

  for (const candidate of directCandidates) {
    const cleaned = cleanTitleCandidate(candidate)
    if (cleaned) return cleaned
  }

  const parsed = parseDealText(item.card_text || '')

  for (const line of parsed.lines) {
    const cleaned = cleanTitleCandidate(line)
    if (cleaned) return cleaned
  }

  const productId = item.href.split('/product/')[1]?.split(/[/?#]/)[0] || null
  return productId || item.href
}

function escapeSql(value) {
  if (value === null || value === undefined) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

function sqlNumeric(value) {
  if (value === null || value === undefined) return 'null'
  if (!Number.isFinite(Number(value))) return 'null'
  return String(value)
}

function sqlTextArray(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return `'{}'::text[]`
  }

  const escaped = values.map((value) => `"${String(value).replace(/"/g, '\\"')}"`)
  return `'${`{${escaped.join(',')}}`}'::text[]`
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function main() {
  const url = getArg('url')
  const endpoint = getArg('endpoint')
  const pages = Number(getArg('pages', '1'))
  const outputPrefix = getArg('output-prefix', 'psstore-official-deals')
  const delayMs = Number(getArg('delay-ms', '1500'))
  const timeoutMs = Number(getArg('timeout-ms', '90000'))
  const dealType = getArg('deal-type', 'ps_plus')

  if (!url) {
    throw new Error('Missing required arg: --url=')
  }

  if (!endpoint) {
    throw new Error('Missing required arg: --endpoint=')
  }

  if (!Number.isFinite(pages) || pages < 1) {
    throw new Error('Invalid --pages value')
  }

  const browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0] || (await browser.newContext())
  const page = context.pages()[0] || (await context.newPage())

  page.setDefaultTimeout(timeoutMs)

  const uniqueByHref = new Map()
  const pageSummaries = []
  let duplicateOnlyPages = 0
  let autoStopReason = null

  console.log('Official PS Store deals collector')
  console.log(`Base URL: ${url}`)
  console.log(`Pages requested: ${pages}`)
  console.log(`Deal type: ${dealType}`)

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const pageUrl = makePageUrl(url, pageNumber)

    console.log(`\n[PS STORE PAGE ${pageNumber}] ${pageUrl}`)

    await page.goto(pageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    })

    await page.waitForTimeout(delayMs)

    const items = await page.evaluate(() => {
      function clean(value) {
        return String(value || '')
          .replace(/\u00a0/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .trim()
      }

      function countProductLinks(element) {
        if (!element) return 0

        const selfCount = element.matches?.('a[href*="/product/"]') ? 1 : 0
        const childCount =
          element.querySelectorAll?.('a[href*="/product/"]').length || 0

        return selfCount + childCount
      }

      function findCardElement(anchor) {
        let current = anchor
        let fallback = anchor

        for (let depth = 0; depth < 12 && current; depth += 1) {
          const text = clean(current.innerText)
          const productLinks = countProductLinks(current)

          const hasPrice = /\$\s?[\d,]+(?:\.\d{2})?/.test(text)
          const hasDiscount = /-\d+%/.test(text) || /Save\s+\d+%/i.test(text)
          const hasFree = /\$0\.00/.test(text)

          if (productLinks === 1 && (hasPrice || hasFree)) {
            fallback = current
          }

          if (productLinks === 1 && (hasPrice || hasFree) && hasDiscount) {
            return current
          }

          if (productLinks === 1 && hasFree) {
            return current
          }

          current = current.parentElement
        }

        return fallback
      }

      const anchors = Array.from(document.querySelectorAll('a[href*="/product/"]'))

      return anchors.map((anchor) => {
        const card = findCardElement(anchor)
        const img = card.querySelector?.('img') || anchor.querySelector?.('img')

        return {
          href: anchor.href,
          aria_label: clean(anchor.getAttribute('aria-label')),
          title_attr: clean(anchor.getAttribute('title')),
          img_alt: clean(img?.getAttribute('alt')),
          anchor_text: clean(anchor.innerText),
          card_text: clean(card.innerText),
        }
      })
    })

    let raw = 0
    let newUnique = 0
    let duplicates = 0

    for (const item of items) {
      const href = item.href?.split('?')[0]

      if (!href || !href.includes('/product/')) continue

      const dealText = item.card_text || item.anchor_text || ''
      const parsed = parseDealText(dealText)

      const itemTypeLabel = parseOfficialItemTypeLabel(dealText)
      const platforms = parseOfficialPlatforms(dealText)
      const officialDealType = getOfficialDealType(parsed, itemTypeLabel, dealType)

      const isPriceDiscount =
        parsed.current_price_amount !== null &&
        parsed.original_price_amount !== null &&
        parsed.discount_percent !== null

      const isOfficialPlusFreebie =
        dealType === 'ps_plus' && parsed.current_price_amount === 0

      if (!isPriceDiscount && !isOfficialPlusFreebie) {
        continue
      }

      raw += 1

      if (uniqueByHref.has(href)) {
        duplicates += 1
        continue
      }

      newUnique += 1

      const psPlusRequired =
        dealType === 'ps_plus' || parsed.ps_plus_required === true

      uniqueByHref.set(href, {
        source: 'playstation_store_official_category',
        source_url: pageUrl,
        page: pageNumber,
        href,
        product_id: href.split('/product/')[1]?.split(/[/?#]/)[0] || null,
        title: pickTitleFromItem({
          ...item,
          href,
        }),
        current_price_amount: parsed.current_price_amount,
        original_price_amount: parsed.original_price_amount,
        discount_percent: parsed.discount_percent,
        ps_plus_required: psPlusRequired,
        official_deal_type: officialDealType,
        official_item_type_label: itemTypeLabel,
        official_platforms: platforms,
        raw_text: normalizeText(dealText),
        collected_at: new Date().toISOString(),
      })
    }

    pageSummaries.push({
      page: pageNumber,
      raw,
      new_unique: newUnique,
      duplicates,
      url: pageUrl,
    })

    console.log(
      `[PS STORE PAGE ${pageNumber}] raw=${raw} | new_unique=${newUnique} | duplicates=${duplicates} | total_unique=${uniqueByHref.size}`
    )

    if (raw > 0 && newUnique === 0) {
      duplicateOnlyPages += 1
    } else {
      duplicateOnlyPages = 0
    }

    if (raw === 0) {
      autoStopReason = `empty_page: page=${pageNumber}`
      console.log(`[AUTO STOP] ${autoStopReason}`)
      break
    }

    if (duplicateOnlyPages >= 2) {
      autoStopReason = `two_duplicate_only_pages: page=${pageNumber}`
      console.log(`[AUTO STOP] ${autoStopReason}`)
      break
    }
  }

  const items = Array.from(uniqueByHref.values())

  const outDir = path.join(process.cwd(), 'data', 'import')
  await ensureDir(outDir)

  const stamp = nowStamp()
  const jsonPath = path.join(outDir, `${outputPrefix}-${stamp}.json`)
  const txtPath = path.join(outDir, `${outputPrefix}-${stamp}.txt`)
  const sqlPath = path.join(outDir, `${outputPrefix}-${stamp}.sql`)

  const payload = {
    source: 'playstation_store_official_category',
    base_url: url,
    collected_at: new Date().toISOString(),
    deal_type: dealType,
    pages_requested: pages,
    pages_processed: pageSummaries.length,
    auto_stop_reason: autoStopReason,
    unique_items_collected: items.length,
    page_summaries: pageSummaries,
    items,
  }

  const txt = items
    .map((item) => {
      return [
        item.title,
        item.current_price_amount,
        item.original_price_amount,
        item.discount_percent,
        item.ps_plus_required ? 'ps_plus' : 'regular',
        item.official_deal_type,
        item.official_item_type_label,
        item.official_platforms.join(','),
        item.href,
      ].join('\t')
    })
    .join('\n')

  const valuesSql = items
    .map((item) => {
      return `(${escapeSql(item.title)}, ${sqlNumeric(
        item.current_price_amount
      )}, ${sqlNumeric(item.original_price_amount)}, ${sqlNumeric(
        item.discount_percent
      )}, ${item.ps_plus_required}, ${escapeSql(
        item.official_deal_type
      )}, ${escapeSql(item.official_item_type_label)}, ${sqlTextArray(
        item.official_platforms
      )}, ${escapeSql(item.href)}, ${escapeSql(item.product_id)}, ${escapeSql(
        item.source_url
      )})`
    })
    .join(',\n')

  const insertSql = valuesSql
    ? `insert into public.official_ps_store_deals (
  title,
  official_current_price_amount,
  official_original_price_amount,
  official_discount_percent,
  official_ps_plus_required,
  official_deal_type,
  official_item_type_label,
  official_platforms,
  ps_store_product_url,
  ps_store_product_id,
  source_url
)
values
${valuesSql}
;`
    : '-- No official deals collected; insert skipped.'

  const sql = `-- Generated by collect-psstore-official-deals-edge-live.mjs
-- Review before executing.

create table if not exists public.official_ps_store_deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  official_current_price_amount numeric,
  official_original_price_amount numeric,
  official_discount_percent integer,
  official_ps_plus_required boolean default false,
  official_deal_type text,
  official_item_type_label text,
  official_platforms text[] default '{}'::text[],
  ps_store_product_url text,
  ps_store_product_id text,
  source_url text,
  verified_at timestamptz not null default now(),
  is_active boolean not null default true,
  notes text
);

alter table public.official_ps_store_deals
  add column if not exists official_deal_type text,
  add column if not exists official_item_type_label text,
  add column if not exists official_platforms text[] default '{}'::text[];

update public.official_ps_store_deals
set is_active = false
where is_active = true
  and source_url like 'https://store.playstation.com/en-us/category/%';

${insertSql}
`

  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8')
  await fs.writeFile(txtPath, txt, 'utf8')
  await fs.writeFile(sqlPath, sql, 'utf8')

  console.log('\nOfficial PS Store collection finished.')
  console.log(`Pages processed: ${pageSummaries.length}`)
  console.log(`Auto-stop reason: ${autoStopReason ?? 'none'}`)
  console.log(`Unique official deals collected: ${items.length}`)
  console.log(`JSON: ${jsonPath}`)
  console.log(`TXT: ${txtPath}`)
  console.log(`SQL: ${sqlPath}`)

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})