import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath =
  'sql/010-lobodeals-3-catalog-search-similarity-schema-qualification.sql'

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8')
}

function canonicalSha256(text) {
  return crypto
    .createHash('sha256')
    .update(text.replace(/\r\n/g, '\n'), 'utf8')
    .digest('hex')
}

test('010 preserves the reviewed canonical migration artifact', async () => {
  const migration = await read(migrationPath)

  assert.equal(
    canonicalSha256(migration),
    '26a73761bcfec34e4acc2ac0d91e150596cd14c6e21e3f2093294ecf746babd0'
  )
})

test('010 accepts only the known pre-hotfix and post-hotfix legacy definitions', async () => {
  const migration = await read(migrationPath)

  assert.match(
    migration,
    /3ed338b1719d4581b24cddf9bd4ccd9803cafa96bc5cc045702e808d782b78af/
  )
  assert.match(
    migration,
    /a2874b62dd6e796c8d3f01709a52f22cc0db02f6b852ba386648fe75fd5dfee2/
  )
  assert.match(
    migration,
    /LOBODEALS_010_LEGACY_DEFINITION_DRIFT/
  )
  assert.match(
    migration,
    /LOBODEALS_010_FINAL_DEFINITION_HASH_MISMATCH/
  )
})

test('010 schema-qualifies exactly the four intended similarity calls through guarded replacement', async () => {
  const migration = await read(migrationPath)

  assert.match(
    migration,
    /pg_catalog\.replace\(\s*v_definition,\s*'similarity\(',\s*'public\.similarity\('/s
  )
  assert.match(migration, /v_qualified_count <> 0[\s\S]*v_total_similarity_count <> 4/)
  assert.match(migration, /v_qualified_count <> 4[\s\S]*v_total_similarity_count <> 4/)
  assert.match(migration, /LOBODEALS_010_PRE_HOTFIX_TOKEN_MISMATCH/)
  assert.match(migration, /LOBODEALS_010_POST_HOTFIX_TOKEN_MISMATCH/)
  assert.match(migration, /LOBODEALS_010_FINAL_SIMILARITY_TOKEN_MISMATCH/)
  assert.match(migration, /execute v_definition_after/)
})

test('010 protects v2 and the legacy function security surface', async () => {
  const migration = await read(migrationPath)

  assert.match(
    migration,
    /0f3f77364e9c1406588b70a0f1f1463e1aa98be5edfa6475c4a713a07f69f0ea/
  )
  assert.match(migration, /LOBODEALS_010_V2_DEFINITION_DRIFT/)
  assert.match(migration, /LOBODEALS_010_V2_CHANGED/)
  assert.match(migration, /LOBODEALS_010_OWNER_CHANGED/)
  assert.match(migration, /LOBODEALS_010_SECURITY_MODE_CHANGED/)
  assert.match(migration, /LOBODEALS_010_CONFIG_CHANGED/)
  assert.match(migration, /LOBODEALS_010_ACL_CHANGED/)
  assert.match(migration, /v_security_definer_after is distinct from false/)
  assert.match(migration, /v_config_after <> array\[\]::text\[\]/)

  assert.doesNotMatch(
    migration,
    /create\s+(?:or\s+replace\s+)?function\s+public\.search_catalog_public_cache_v2/i
  )
  assert.doesNotMatch(
    migration,
    /alter\s+function\s+public\.search_catalog_public_cache_v2/i
  )
})

test('010 validates catalog, Upcoming, and Latest dynamically without changing catalog data', async () => {
  const migration = await read(migrationPath)

  assert.match(
    migration,
    /select count\(\*\)[\s\S]*from public\.catalog_public_cache[\s\S]*region_code = 'us'[\s\S]*storefront = 'playstation'/
  )
  assert.match(
    migration,
    /public\.search_catalog_public_cache_v2\([\s\S]*p_sort => 'title'[\s\S]*p_limit => 36/
  )
  assert.match(
    migration,
    /public\.search_catalog_public_cache\([\s\S]*p_sort => 'upcoming'[\s\S]*p_limit => 6/
  )
  assert.match(
    migration,
    /public\.search_catalog_public_cache_v2\([\s\S]*p_sort => 'upcoming'[\s\S]*p_limit => 6/
  )
  assert.match(
    migration,
    /public\.search_catalog_public_cache\([\s\S]*p_sort => 'latest'[\s\S]*p_limit => 6/
  )
  assert.match(
    migration,
    /public\.search_catalog_public_cache_v2\([\s\S]*p_sort => 'latest'[\s\S]*p_limit => 6/
  )
  assert.doesNotMatch(migration, /\b40747\b/)

  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update|delete\s+from|truncate)\s+public\.(?:catalog_public_cache|psdeals_stage_items|ps_plus_monthly_games)\b/i
  )
})
