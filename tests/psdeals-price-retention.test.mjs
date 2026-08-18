import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const importerPath = new URL('../scripts/import-psdeals-detail-local.mjs', import.meta.url)
const payloadPath = new URL('../scripts/lib/psdeals-stage-payload.mjs', import.meta.url)
const detailPagePath = new URL('../app/us/playstation/[slug]/page.tsx', import.meta.url)

test('runtime keeps legacy lows read-only and presents them separately from certified lows', async () => {
  const [importer, payload, detailPage] = await Promise.all([
    fs.readFile(importerPath, 'utf8'),
    fs.readFile(payloadPath, 'utf8'),
    fs.readFile(detailPagePath, 'utf8'),
  ])

  assert.doesNotMatch(importer, /lowestPriceAmount|lowestPsPlusPriceAmount/)
  assert.match(detailPage, /\blowest_price_amount\b/)
  assert.match(detailPage, /\blowest_ps_plus_price_amount\b/)
  assert.match(detailPage, /lobodeals_lowest_regular_price_amount/)
  assert.match(detailPage, /lobodeals_lowest_ps_plus_price_amount/)
  assert.match(detailPage, /Historical lowest regular price/)
  assert.match(detailPage, /Historical lowest PS\+ price/)
  assert.match(detailPage, /Preserved legacy observation/)
  assert.match(detailPage, /Lowest certified regular price/)
  assert.match(detailPage, /Lowest certified PS\+ price/)

  for (const field of [
    'lowest_price_amount',
    'lowest_ps_plus_price_amount',
    'lobodeals_lowest_regular_price_amount',
    'lobodeals_lowest_regular_price_first_seen_at',
    'lobodeals_lowest_ps_plus_price_amount',
    'lobodeals_lowest_ps_plus_price_first_seen_at',
  ]) {
    assert.match(payload, new RegExp(`['\"]${field}['\"]`))
  }

  assert.doesNotMatch(
    `${importer}\n${payload}\n${detailPage}`,
    /\.from\(['\"]psdeals_stage_price_history['\"]\)/
  )
})
