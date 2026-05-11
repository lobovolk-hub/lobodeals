import { chromium } from 'playwright'

function getArgValue(name) {
  const prefix = `--${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

async function main() {
  const endpoint = getArgValue('endpoint') || 'http://localhost:9222'

  console.log(`Connecting to: ${endpoint}`)

 const browser = await chromium.connectOverCDP(endpoint, {
  timeout: 0,
  isLocal: true,
})

  const contexts = browser.contexts()
  const pages = contexts.flatMap((context) => context.pages())

  console.log(`Contexts: ${contexts.length}`)
  console.log(`Pages: ${pages.length}`)

  for (const [index, page] of pages.entries()) {
    console.log(`${index}: ${await page.title()} | ${page.url()}`)
  }

  const psdealsPage =
    pages.find((page) => page.url().includes('psdeals.net/us-store/all-games')) ||
    pages.find((page) => page.url().includes('psdeals.net'))

  if (!psdealsPage) {
    throw new Error('No PSDeals tab found in the connected Edge session.')
  }

  const result = await psdealsPage.evaluate(() => {
    const anchors = [
      ...document.querySelectorAll('a.game-collection-item-link[href*="/us-store/game/"]'),
    ]

    return {
      title: document.title,
      url: location.href,
      cards: anchors.length,
      sample: anchors.slice(0, 10).map((anchor) => ({
        title:
          anchor
            .querySelector('.game-collection-item-details-title')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() || null,
        href: anchor.href,
      })),
    }
  })

  console.log('=== PSDEALS EDGE LIVE PROBE ===')
  console.log(JSON.stringify(result, null, 2))

  await browser.close()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})