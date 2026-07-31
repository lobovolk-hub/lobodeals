import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const certification = fs.readFileSync(
  path.join(
    root,
    'sql',
    '005-lobodeals-3-cycle-bound-price-certification.sql'
  ),
  'utf8'
)
const precheck = fs.readFileSync(
  path.join(
    root,
    'sql',
    'validation',
    '005-cycle-bound-price-certification-precheck-readonly.sql'
  ),
  'utf8'
)
const postcheck = fs.readFileSync(
  path.join(
    root,
    'sql',
    'validation',
    '005-cycle-bound-price-certification-postcheck-readonly.sql'
  ),
  'utf8'
)

test('migration 005 is additive and does not alter applied migrations', () => {
  assert.match(certification, /^begin;/m)
  assert.match(certification, /^commit;/m)
  assert.doesNotMatch(certification, /alter\s+(?:function|table).*003/i)
  assert.doesNotMatch(certification, /create\s+or\s+replace/i)
  assert.doesNotMatch(certification, /psdeals_stage_price_history/i)
  assert.match(certification, /PSDEALS_005_POSTGRES_OWNER_REQUIRED/)
})

test('migration 005 adds two tightly bounded candidate tuples with restrictive FKs', () => {
  for (const field of [
    'regular_certification_cycle_id',
    'regular_certification_observed_at',
    'regular_certification_evidence_sha256',
    'regular_certification_candidate',
    'ps_plus_certification_cycle_id',
    'ps_plus_certification_observed_at',
    'ps_plus_certification_evidence_sha256',
    'ps_plus_certification_candidate',
  ]) {
    assert.match(certification, new RegExp(`\\b${field}\\b`))
  }
  assert.equal(
    (certification.match(/references public\.price_refresh_cycles\(id\)/g) || [])
      .length,
    2
  )
  assert.equal(
    (certification.match(/on delete restrict/g) || []).length,
    2
  )
  assert.match(
    certification,
    /octet_length\(\s*regular_certification_candidate::text\s*\)\s*<= 1024/
  )
  assert.match(
    certification,
    /octet_length\(\s*ps_plus_certification_candidate::text\s*\)\s*<= 1024/
  )
  assert.match(
    certification,
    /regular_certification_candidate - array\[[\s\S]*candidate_sha256[\s\S]*= '\{\}'::jsonb/
  )
  assert.match(
    certification,
    /ps_plus_certification_candidate - array\[[\s\S]*input_artifact_sha256[\s\S]*= '\{\}'::jsonb/
  )
})

test('candidate hashes bind the exact tuple and PS Plus input artifact', () => {
  assert.match(
    certification,
    /create function public\._psdeals_certification_candidate_sha256_v1/
  )
  assert.match(
    certification,
    /candidate_sha256'[\s\S]*_psdeals_certification_candidate_sha256_v1/
  )
  assert.match(
    certification,
    /detail_receipt\.input_artifact_hash[\s\S]*input_artifact_sha256/
  )
})

test('certification v3 never delegates to the unsafe v1 or v2 implementation', () => {
  const functionBody = certification.slice(
    certification.indexOf('create function public.certify_price_refresh_cycle_v3')
  )
  assert.doesNotMatch(
    functionBody,
    /from public\.certify_price_refresh_cycle(?:_v2)?\s*\(/
  )
})

test('regular certification uses only cycle-bound complete tuple evidence', () => {
  for (const evidence of [
    /regular_certification_cycle_id = p_cycle_id/,
    /regular_certification_observed_at\s*=\s*cycle_row\.listing_completed_at/,
    /listing_receipt\.input_artifact_hash\s*=\s*item\.regular_certification_evidence_sha256/,
    /listing_receipt\.result ->> 'complete' = 'true'/,
    /source\.candidate_percent = round\(/,
    /source\.candidate_amount > 0/,
    /source\.original_amount > source\.candidate_amount/,
  ]) {
    assert.match(certification, evidence)
  }
  assert.doesNotMatch(
    certification,
    /source\.original_amount\s*\/\s*source\.candidate_amount\s*<=\s*20/
  )
})

test('regular certification supports safe public families and exact platforms', () => {
  assert.match(certification, /source\.candidate ->> 'currency_code' = 'USD'/)
  assert.match(certification, /source\.candidate ->> 'is_free_to_play' = 'false'/)
  for (const pair of [
    ["game", "game"],
    ["bundle", "bundle"],
    ["dlc", "addon"],
  ]) {
    assert.match(
      certification,
      new RegExp(
        `content_type' = '${pair[0]}'[\\s\\S]*item_type_label' = '${pair[1]}'`
      )
    )
  }
  assert.match(
    certification,
    /'\["PS4"\]'::jsonb,[\s\S]*'\["PS5"\]'::jsonb,[\s\S]*'\["PS5", "PS4"\]'::jsonb/
  )
  assert.doesNotMatch(certification, /candidate_percent between 0 and 100/)
  assert.match(certification, /candidate_percent between 1 and 99/)
})

test('PS Plus certification requires same-cycle parser-safe evidence', () => {
  for (const evidence of [
    /ps_plus_certification_cycle_id = p_cycle_id/,
    /ps_plus_certification_observed_at\s*between cycle_row\.started_at and cycle_row\.details_completed_at/,
    /'parser_status'\s*=\s*'parsed_current_discount'/,
    /'source_consistent'\s*=\s*'true'/,
    /source\.current_amount > source\.candidate_amount/,
    /from public\.ps_plus_monthly_games/,
  ]) {
    assert.match(certification, evidence)
  }
})

test('v3 preserves idempotence, advisory locking and transactional rollback', () => {
  assert.match(certification, /_begin_psdeals_cycle_action_v1/)
  assert.match(certification, /_finish_psdeals_cycle_action_v1/)
  assert.match(certification, /pg_advisory_xact_lock/)
  assert.match(certification, /exception when others/)
  assert.match(certification, /'failed'/)
  assert.match(
    certification,
    /receipt_row\.status <> 'running'[\s\S]*receipt_row\.status,[\s\S]*true,/
  )
})

test('v3 preserves monotonic lows and first-seen timestamps', () => {
  assert.match(
    certification,
    /lobodeals_lowest_regular_price_amount is null[\s\S]*candidate\.candidate_amount\s*<\s*item\.lobodeals_lowest_regular_price_amount/
  )
  assert.match(
    certification,
    /lobodeals_lowest_ps_plus_price_amount is null[\s\S]*candidate\.candidate_amount\s*<\s*item\.lobodeals_lowest_ps_plus_price_amount/
  )
  assert.match(
    certification,
    /lobodeals_lowest_regular_price_first_seen_at\s*=\s*candidate\.observed_at/
  )
  assert.match(
    certification,
    /lobodeals_lowest_ps_plus_price_first_seen_at\s*=\s*candidate\.observed_at/
  )
})

test('service role is directed only to v3 while legacy functions remain postgres-only', () => {
  assert.match(
    certification,
    /grant execute on function[\s\S]*certify_price_refresh_cycle_v3[\s\S]*to service_role, postgres/
  )
  assert.match(
    certification,
    /revoke execute on function[\s\S]*certify_price_refresh_cycle_v2[\s\S]*from public, anon, authenticated, service_role/
  )
  assert.match(
    certification,
    /revoke execute on function[\s\S]*certify_price_refresh_cycle\(uuid\)[\s\S]*from public, anon, authenticated, service_role/
  )
  assert.match(
    certification,
    /grant execute on function[\s\S]*certify_price_refresh_cycle_v2[\s\S]*to postgres/
  )
  assert.doesNotMatch(
    certification,
    /drop function public\.certify_price_refresh_cycle/
  )
})

test('migration 005 never reads or writes detailed history', () => {
  assert.doesNotMatch(certification, /psdeals_stage_price_history/i)
})

test('migration 005 precheck and postcheck are strictly read-only', () => {
  for (const source of [precheck, postcheck]) {
    assert.doesNotMatch(
      source,
      /^\s*(?:insert|update|delete|alter|drop|truncate|vacuum|grant|revoke|create|call|do)\b/im
    )
  }
  assert.match(precheck, /pg_database_size/)
  assert.match(precheck, /2e631ebaabe809d8828690f25de4ae8b0b598f6faf0519e114e71f7bde2b7b96/)
  assert.match(precheck, /'dlc:addon'/)
  assert.match(precheck, /ratio_limit_expected/)
  assert.match(precheck, /certify_price_refresh_cycle_v2/)
  assert.match(postcheck, /regular_candidates/)
  assert.match(postcheck, /ps_plus_candidates/)
  assert.match(postcheck, /aclexplode/)
  assert.match(postcheck, /convalidated/)
  assert.match(postcheck, /regular_discounts_1_to_99_allowed/)
  assert.match(postcheck, /ratio_limit_absent/)
  assert.match(postcheck, /dlc_addon_pair_present/)
  assert.match(postcheck, /canonical_combined_platform_present/)
})
