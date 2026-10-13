import assert from 'node:assert/strict'
import test from 'node:test'
import { ABSENCE_CONTRACTS, verifiedAbsentSourceUids, parseVisibilityPublication } from '../supabase/functions/campaign-monitoring/_shared/operational-visibility.ts'
import { STORE_SLUGS } from '../supabase/functions/campaign-monitoring/_shared/types.ts'
const source = 'https://store.playstation.com/en-us/pages/deals'
const known = { campaignKey: 'known', sourceUid: 'known', name: 'Autumn Adventures', state: 'live', sourceUrl: source, officialUrl: source }
const base = { storeSlug: 'playstation-store', sourceUrl: source, sourceUrls: [source], coverage: 'partial', campaigns: [], explicitlyEndedSourceUids: [] }
const check = { sourceUid: 'known', sourceUrl: source, contract: 'playstation-ems-promotions-v1', outcome: 'absent' }

test('all ten partial adapters default to inconclusive absence, with explicit per-store opt-in', () => {
  assert.deepEqual(Object.keys(ABSENCE_CONTRACTS).sort(), [...STORE_SLUGS].sort())
  for (const storeSlug of STORE_SLUGS) {
    assert.deepEqual(verifiedAbsentSourceUids({ ...base, storeSlug }, [known]), [])
    if (storeSlug !== 'playstation-store') assert.throws(() => verifiedAbsentSourceUids({ ...base, storeSlug, absenceChecks: [check] }, [known]))
  }
})
test('verified absence cannot override presence, official END, boundaries or Upcoming', () => {
  assert.deepEqual(verifiedAbsentSourceUids({ ...base, absenceChecks: [check] }, [known]), ['known'])
  assert.deepEqual(verifiedAbsentSourceUids({ ...base, absenceChecks: [{ ...check, outcome: 'inconclusive' }] }, [known]), [])
  for (const change of [{ state: 'upcoming' }, { endsOn: '2026-10-21' }, { endsAt: '2026-10-21T00:00:00Z' }]) {
    assert.deepEqual(verifiedAbsentSourceUids({ ...base, absenceChecks: [check] }, [{ ...known, ...change }]), [])
  }
  assert.deepEqual(verifiedAbsentSourceUids({ ...base, absenceChecks: [check], explicitlyEndedSourceUids: ['known'] }, [known]), [])
  for (const result of [{ ...base, absenceChecks: [check, check] }, { ...base, absenceChecks: [check], campaigns: [{ sourceUid: 'known' }] },
    { ...base, absenceChecks: [{ ...check, sourceUid: 'unknown' }] }, { ...base, absenceChecks: [{ ...check, sourceUrl: 'https://unverified.invalid' }] }]) {
    assert.throws(() => verifiedAbsentSourceUids(result, [known]))
  }
})
test('publication retries and conflicts report zero additional mutations; malformed counters reject', () => {
  for (const status of ['already-published', 'obsolete', 'baseline-conflict']) {
    assert.deepEqual(parseVisibilityPublication({ status }), { status, upserted: 0, ended: 0, hidden: 0, operationallyClosed: 0 })
  }
  assert.throws(() => parseVisibilityPublication({ status: 'published', upserted: -1 }))
  assert.throws(() => parseVisibilityPublication({ status: 'unknown' }))
})
