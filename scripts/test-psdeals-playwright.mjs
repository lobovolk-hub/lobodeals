import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const urlArg = process.argv.find((arg) => arg.startsWith('--url='))
const headlessArg = process.argv.find((arg) => arg.startsWith('--headless='))
const timeoutArg = process.argv.find((arg) => arg.startsWith('--timeout-ms='))

if (!urlArg) {
  console.error('Missing --url argument. Example: --url=https://psdeals.net/us-store/game/2921740/days-gone-remastered')
  process.exit(1)
}

const url = urlArg.split('=')[1]
const headless = headlessArg ? headlessArg.split('=')[1] !== 'false' : false
const timeoutMs = timeoutArg ? Number(timeoutArg.split('=')[1]) : 45000

const browser = await chromium.launch({
  headless,
  slowMo: headless ? undefined : 800,
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

const page = await context.newPage()

try {
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  })

  if (!response) {
    throw new Error('Navigation returned no HTTP response')
  }

  const status = response.status()

  await page.waitForTimeout(2000)

  const title = await page.title()
  const html = await page.content()

  const hasItemId = /var item_id=\d+;/i.test(html)
  const hasGameTitle = /<div itemprop="name" class="game-title-info-name">/i.test(html)
  const maybeBlocked =
    /access denied|forbidden|captcha|cloudflare|attention required/i.test(html) ||
    /access denied|forbidden|captcha|cloudflare|attention required/i.test(title)

  const outputDir = path.resolve(process.cwd(), 'logs')
  await fs.mkdir(outputDir, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const htmlPath = path.join(outputDir, `psdeals-playwright-smoke-${stamp}.html`)
  await fs.writeFile(htmlPath, html, 'utf8')

  console.log(`URL: ${url}`)
  console.log(`HTTP status: ${status}`)
  console.log(`Title: ${title}`)
  console.log(`Has item_id marker: ${hasItemId}`)
  console.log(`Has game title marker: ${hasGameTitle}`)
  console.log(`Possible block page: ${maybeBlocked}`)
  console.log(`Saved HTML: ${htmlPath}`)

  if (status >= 400) {
    process.exitCode = 2
  }

  if (!hasItemId || !hasGameTitle || maybeBlocked) {
    process.exitCode = process.exitCode || 3
  }
} finally {
  await page.close().catch(() => {})
  await context.close().catch(() => {})
  await browser.close().catch(() => {})
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}