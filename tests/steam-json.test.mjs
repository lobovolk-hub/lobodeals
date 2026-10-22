import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('Steam large Unicode JSON preserves extraction and full ten-adapter outputs against v40', () => {
  const worker = fileURLToPath(new URL('./helpers/steam-json-profile.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [worker, '--check'],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 })
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).equivalent, true)
})
