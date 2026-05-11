import fs from 'node:fs/promises'
import path from 'node:path'

const fileArg = process.argv.find((arg) => arg.startsWith('--file='))

if (!fileArg) {
  console.error('Missing --file argument')
  process.exit(1)
}

const filePath = path.resolve(process.cwd(), fileArg.split('=')[1])
const html = await fs.readFile(filePath, 'utf8')

function printMatch(label, regex) {
  const match = html.match(regex)

  console.log(`\n===== ${label} =====`)
  if (!match?.[0]) {
    console.log('NO MATCH')
    return
  }

  console.log(match[0].slice(0, 12000))
}

printMatch(
  'RELATED PRODUCTS ID BLOCK',
  /<div[^>]+id="related-products"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i
)

printMatch(
  'DLC AND RELATED GAMES HEADING AREA',
  /DLC and Related Games[\s\S]{0,12000}/i
)

printMatch(
  'ALL ADD-ONS LINK',
  /<a[^>]+href="[^"]*\/add-ons\/[^"]*"[\s\S]{0,800}/i
)

printMatch(
  'GAME COLLECTION ITEM LINKS',
  /<a[^>]+class="[^"]*game-collection-item-link[^"]*"[\s\S]{0,4000}/i
)

printMatch(
  'XBDEALS / NTDEALS LINKS',
  /<a[^>]+href="[^"]*(?:xbdeals\.net|ntdeals\.net)[^"]*"[\s\S]{0,1500}/i
)