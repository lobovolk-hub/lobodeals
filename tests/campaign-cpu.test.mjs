import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { campaignTimingPhrases } from '../supabase/functions/campaign-monitoring/_shared/timing-phrases.ts'

test('timing phrase extraction preserves the previous GOG/Xbox matching scope and order', () => {
  for (const includeLasts of [false, true]) {
    const previous = includeLasts
      ? /[^.!?]*(?:sale|promotion|event|campaign)[^.!?]*(?:ends?|lasts|until|through)[^.!?]*/gi
      : /[^.!?]*(?:sale|promotion|event|campaign)[^.!?]*(?:ends?|until|through)[^.!?]*/gi
    const phrases = [
      '', 'sale', 'ends before the sale', 'Sale ends October 28, 2026 at 10:00 UTC',
      'the promotion lasts until tomorrow', 'campaign through October 28',
      'event end', 'salesend', 'campaignends', 'SALE Until later',
      'sale giveaway ends tomorrow', 'sale ends at 10 a.m. UTC',
      'sale sale sale', 'event\nends tomorrow', 'weekend sale',
      'sale ends; event ends later', 'sale lasts for days', 'sale through promotion',
    ]
    for (const left of phrases) for (const right of phrases) for (const separator of ['.', '!', '?', ' ', '\n']) {
      const text = left + separator + right
      assert.deepEqual(campaignTimingPhrases(text, includeLasts), [...text.matchAll(previous)].map(m => m[0]), text)
    }
  }
})

test('timing extraction does not discard late evidence or truncate long campaign text', () => {
  const prefix = 'sale '.repeat(20000)
  const phrase = prefix + 'ends October 28, 2026 at 10:00 UTC'
  assert.deepEqual(campaignTimingPhrases(phrase), [phrase])
  assert.deepEqual(campaignTimingPhrases(prefix), [])
  assert.deepEqual(campaignTimingPhrases('ends ' + prefix), [])
  assert.deepEqual(campaignTimingPhrases('sale lasts tomorrow'), [])
  assert.deepEqual(campaignTimingPhrases('sale lasts tomorrow', true), ['sale lasts tomorrow'])
})

for (const store of ['gog', 'microsoft-store']) {
  test(`${store} full adapter completes repeated sale prose without inventing end evidence`, () => {
    // A separate process bounds regressions: old implementation exceeds this
    // watchdog on 8 KB. This is a hang guard, not a Supabase CPU certification.
    const worker = fileURLToPath(new URL('./helpers/campaign-cpu-profile.mjs', import.meta.url))
    const result = spawnSync(process.execPath, [worker, '--worker', 'adapter', store, '8000'],
      { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 })
    assert.equal(result.error, undefined, result.error?.message)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /"campaigns":1/)
  })
}
