import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { test } from 'node:test'

const WRAPPER_URL = new URL('../scripts/run-psdeals-certified-cycle.ps1', import.meta.url)

test('certified-cycle wrapper exposes only safe local commands', async () => {
  const source = await fs.readFile(WRAPPER_URL, 'utf8')

  assert.match(source, /ValidateSet\('Plan', 'Preflight', 'Status', 'Resume'\)/)
  assert.doesNotMatch(source, /['"]Operational['"]/i)
  assert.doesNotMatch(source, /allow_(?:collect|stage|detail|monthly|create|apply|mark|certify|refresh)/i)
  assert.match(source, /\$runnerArgs = @\(\$entrypoint\)/)
  assert.match(source, /& \$nodePath @runnerArgs/)
  assert.doesNotMatch(source, /Invoke-Expression|Start-Process|cmd(?:\.exe)?\s+\/c/i)
})

test('certified-cycle wrapper validates log containment before creating directories', async () => {
  const source = await fs.readFile(WRAPPER_URL, 'utf8')
  const containmentCheck = source.indexOf("throw 'LogDirectory must remain inside ProjectRoot.'")
  const firstDirectoryWrite = source.indexOf('New-Item -ItemType Directory')

  assert.ok(containmentCheck >= 0)
  assert.ok(firstDirectoryWrite > containmentCheck)
  assert.match(source, /GetFullPath\(\$LogDirectory, \$projectPath\)/)
})

test('certified-cycle wrapper delegates resume only to the fixture-only CLI', async () => {
  const [wrapper, cli] = await Promise.all([
    fs.readFile(WRAPPER_URL, 'utf8'),
    fs.readFile(new URL('../scripts/run-psdeals-cycle.mjs', import.meta.url), 'utf8'),
  ])

  assert.match(wrapper, /\$runnerArgs \+= @\('resume', "--workspace=\$Workspace"\)/)
  assert.match(cli, /run-fixture and resume require a fixture workspace/)
  assert.match(cli, /This CLI cannot enable operational actions/)
})
