import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertAllowedWriteRpc,
  assertExactListingBatchCoverage,
  assertFinalReconciliationReferenceMode,
  assertGenericReceiptResultContract,
  buildDetailImportReceiptResult,
  buildFinalDiscountListingUpsertPlan,
  buildFinalReconciliationDecision,
  buildListingUpsertReceiptResult,
  hydrateListingIdentityFromExistingRows,
  isCanonicalDiscountTerminalClamp,
  planDeferredListingInsertRecovery,
  checkpointAfterSuccess,
  classifyDiscountPage,
  classifyDiscountResumeSnapshot,
  classifyEdgeSnapshot,
  classifyMonthlyCommercialContamination,
  classifyPsDealsLanguageSnapshot,
  auditPsDealsListingLanguage,
  canonicalCandidateIds,
  compareMonthlySets,
  mergeBacklogAndFresh,
  normalizeListingEvidenceTermination,
  parseMonthlyArticle,
  parseMonthlyCategoryHtml,
  parseMonthlyFeed,
  planRecentPage,
  planUncommittedMarkTimestampRecovery,
  reconcileMonthlyApplicationCheckpoint,
  resolveMonthlyGames,
  titleScore,
} from '../scripts/lib/lobodeals-daily-core-v1.mjs'
import { upsertListingBatches } from '../scripts/lobodeals-daily-operator-v1.mjs'

test('Recently Added stops after three pages fully known against LoboDeals', () => {
  let consecutive = 0
  for (let page = 1; page <= 3; page += 1) {
    const result = planRecentPage({
      page_items: [{ psdeals_id: page * 10 + 1 }, { psdeals_id: page * 10 + 2 }],
      known_ids: new Set([page * 10 + 1, page * 10 + 2]),
      consecutive_known_pages: consecutive,
      stop_after: 3,
    })
    consecutive = result.consecutive_known_pages
    assert.equal(result.should_stop, page === 3)
  }
})

test('a real missing ID resets the known-page frontier and enters the queue', () => {
  const result = planRecentPage({
    page_items: [{ psdeals_id: 1 }, { psdeals_id: 2 }],
    known_ids: new Set([1]),
    consecutive_known_pages: 2,
  })
  assert.deepEqual(result.missing_ids, [2])
  assert.equal(result.consecutive_known_pages, 0)
  assert.equal(result.should_stop, false)
})

test('verified backlog and fresh results merge without duplicating fichas', () => {
  const merged = mergeBacklogAndFresh(
    [{ psdeals_id: 10, psdeals_url: 'https://psdeals.net/us-store/game/10/a' }],
    [{ psdeals_id: 10, psdeals_url: 'https://psdeals.net/us-store/game/10/a' }, { psdeals_id: 11, psdeals_url: 'https://psdeals.net/us-store/game/11/b' }],
  )
  assert.deepEqual(merged.map((row) => row.psdeals_id), [10, 11])
})

test('short discounts page is terminal only after exact total or repeated probe', () => {
  const repeated = classifyDiscountPage({
    current_items: [{ psdeals_id: 1 }, { psdeals_id: 2 }],
    probe_items: [{ psdeals_id: 1 }, { psdeals_id: 2 }],
    expected_page_size: 36,
  })
  assert.equal(repeated.classification, 'terminal_repeated_short_page')
  assert.equal(repeated.terminal, true)

  const suspicious = classifyDiscountPage({
    current_items: [{ psdeals_id: 1 }, { psdeals_id: 2 }],
    probe_items: [{ psdeals_id: 3 }, { psdeals_id: 4 }],
    expected_page_size: 36,
  })
  assert.equal(suspicious.classification, 'suspicious_short_page')
  assert.equal(suspicious.accept_current, false)
})

test('PSDeals one-page terminal clamp is recognized only for the immediate page beyond the end', () => {
  assert.equal(isCanonicalDiscountTerminalClamp({ requested_page: 152, active_page: 151 }), true)
  assert.equal(isCanonicalDiscountTerminalClamp({ requested_page: 151, active_page: 151 }), false)
  assert.equal(isCanonicalDiscountTerminalClamp({ requested_page: 153, active_page: 151 }), false)
  assert.equal(isCanonicalDiscountTerminalClamp({ requested_page: 2, active_page: 1 }), true)
})

test('resumed Discounts snapshot resets when PSDeals total changes while the run is paused', () => {
  const result = classifyDiscountResumeSnapshot({
    checkpoint_total: 5403,
    fresh_total: 1800,
    next_page: 151,
    expected_page_size: 36,
  })
  assert.equal(result.reset, true)
  assert.equal(result.reason, 'total_results_changed_while_run_paused')
  assert.equal(result.expected_last_page, 50)
})

test('resumed Discounts snapshot stays compatible when total and next page still fit', () => {
  const result = classifyDiscountResumeSnapshot({
    checkpoint_total: 5403,
    fresh_total: 5403,
    next_page: 151,
    expected_page_size: 36,
  })
  assert.equal(result.reset, false)
  assert.equal(result.reason, 'resume_snapshot_still_compatible')
  assert.equal(result.expected_last_page, 151)
})

test('a repeated short terminal probe remains safe because coverage is still checked separately', () => {
  const result = classifyDiscountPage({
    current_items: [{ psdeals_id: 5403 }],
    probe_items: [{ psdeals_id: 5403 }],
    expected_page_size: 36,
    total_results: 5403,
    unique_before: 5402,
  })
  assert.equal(result.classification, 'terminal_exact_total')
  assert.equal(result.accept_current, true)
  assert.equal(result.terminal, true)
})

test('429 and CAPTCHA never classify as a ready page', () => {
  assert.deepEqual(
    classifyEdgeSnapshot({ cdp_available: true, tab_found: true, title: 'Too Many Requests (#429)', body_text: 'Demasiadas solicitudes', card_count: 0 }),
    { state: 'rate_limited_429', ready: false },
  )
  assert.deepEqual(
    classifyEdgeSnapshot({ cdp_available: true, tab_found: true, title: 'Just a moment', body_text: 'Verify you are human', card_count: 0 }),
    { state: 'challenge_present', ready: false },
  )
})

test('a ready PSDeals detail page is not classified as 429 because an unrelated 429 appears in page body text', () => {
  assert.deepEqual(
    classifyEdgeSnapshot({
      cdp_available: true,
      tab_found: true,
      title: 'Chess Infinity: Treasure Island Game Pack',
      url: 'https://psdeals.net/us-store/game/3276723/chess-infinity-treasure-island-game-pack',
      body_text: 'Reviews 429 community entries. Buy at PlayStation Store.',
      detail_route_ready: true,
      challenge_present: false,
      card_count: 0,
    }),
    { state: 'page_ready', ready: true },
  )
})

test('a visibly ready PSDeals detail route is ready even if harmless Cloudflare text remains in the body', () => {
  assert.deepEqual(
    classifyEdgeSnapshot({
      cdp_available: true,
      tab_found: true,
      title: 'DOA5LR Costume by Tamiki Wakaki - Leifang',
      url: 'https://psdeals.net/us-store/game/3304467/doa5lr-costume-by-tamiki-wakaki-leifang',
      body_text: 'Buy at PlayStation Store. Site delivery may use Cloudflare infrastructure.',
      detail_route_ready: true,
      challenge_present: false,
      card_count: 0,
    }),
    { state: 'page_ready', ready: true },
  )
})

test('an explicit active challenge still blocks even when a stale detail shell is present', () => {
  assert.deepEqual(
    classifyEdgeSnapshot({
      cdp_available: true,
      tab_found: true,
      title: 'Just a moment...',
      url: 'https://psdeals.net/us-store/game/3304467/doa5lr-costume-by-tamiki-wakaki-leifang?__cf_chl_rt_tk=x',
      body_text: 'Verify you are human',
      detail_route_ready: true,
      challenge_present: true,
    }),
    { state: 'challenge_present', ready: false },
  )
})

test('a resolved Cloudflare URL token does not keep a visibly ready English PSDeals page blocked', () => {
  assert.deepEqual(
    classifyEdgeSnapshot({
      cdp_available: true,
      tab_found: true,
      title: 'All games (PS5, PS4) in PlayStation Store — PS Deals USA',
      url: 'https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&__cf_chl_rt_tk=stale-token',
      body_text: 'All Games | Discounts | We found 39800 results | Full Game',
      card_count: 36,
      challenge_present: false,
    }),
    { state: 'page_ready', ready: true },
  )
})

test('v1.26 parser derives PSDeals identity from the requested game route when legacy var item_id is absent and rejects contradictions', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )
  assert.match(source, /const routePsdealsId = parseInteger/)
  assert.match(source, /const psdealsId = embeddedPsdealsId \|\| routePsdealsId/)
  assert.match(source, /PSDEALS_DETAIL_ITEM_ID_MISMATCH/)
  assert.match(source, /const embeddedCompatible = !observedItemId \|\| observedItemId === expectedItemId/)
})

test('monthly feed selects the official dynamic monthly article', () => {
  const xml = `
    <rss><channel>
      <item><title><![CDATA[Other PS Plus news]]></title><link>https://blog.playstation.com/other</link><pubDate>Mon, 27 Jul 2026 12:00:00 GMT</pubDate></item>
      <item><title><![CDATA[PlayStation Plus Monthly Games for August: A, B, C]]></title><link>https://blog.playstation.com/2026/07/28/example/</link><pubDate>Tue, 28 Jul 2026 12:00:00 GMT</pubDate></item>
    </channel></rss>`
  const article = parseMonthlyFeed(xml)
  assert.equal(article.link, 'https://blog.playstation.com/2026/07/28/example/')
})

test('monthly article extracts games, platforms and dates without hardcoding a month', () => {
  const monthly = parseMonthlyArticle({
    source_url: 'https://blog.playstation.com/2026/08/30/example/',
    published_at: '2026-08-30T12:00:00Z',
    html: `
      <p>These games are available from September 1 until October 5.</p>
      <h2>Game Alpha | PS5, PS4</h2>
      <h2>Game Beta | PS5</h2>
      <h2>Game Gamma | PS4</h2>`,
  })
  assert.equal(monthly.month_key, '2026-09')
  assert.equal(monthly.active_from, '2026-09-01')
  assert.equal(monthly.active_until, '2026-10-05')
  assert.deepEqual(monthly.games[0].platforms, ['PS5', 'PS4'])
})

test('monthly mapping requires a unique high-confidence real catalog item', () => {
  const monthly = {
    month_key: '2026-08',
    games: [
      { title: 'Dying Light 2 Stay Human: Reloaded Edition', platforms: ['PS5', 'PS4'] },
      { title: 'Big Walk', platforms: ['PS5'] },
      { title: 'Signalis', platforms: ['PS4'] },
    ],
  }
  const result = resolveMonthlyGames(monthly, [
    { id: 'a', psdeals_id: 1, title: 'Dying Light 2 Stay Human', platforms: ['PS5', 'PS4'] },
    { id: 'b', psdeals_id: 2, title: 'Big Walk', platforms: ['PS5'] },
    { id: 'c', psdeals_id: 3, title: 'Signalis', platforms: ['PS4'] },
  ])
  assert.equal(result.resolved, true)
  assert.deepEqual(result.resolutions.map((row) => row.psdeals_id), [1, 2, 3])
  assert.ok(titleScore('Dying Light 2 Stay Human: Reloaded Edition', 'Dying Light 2 Stay Human') >= 0.72)
})

test('monthly no-change comparison is exact by month and real item id', () => {
  const monthly = { month_key: '2026-08' }
  const resolutions = { resolutions: [{ item_id: 'a' }, { item_id: 'b' }, { item_id: 'c' }] }
  assert.equal(compareMonthlySets([
    { month_key: '2026-08', item_id: 'a', is_active: true },
    { month_key: '2026-08', item_id: 'b', is_active: true },
    { month_key: '2026-08', item_id: 'c', is_active: true },
  ], monthly, resolutions).same, true)
  assert.equal(compareMonthlySets([
    { month_key: '2026-07', item_id: 'a', is_active: true },
  ], monthly, resolutions).same, false)
})

test('checkpoint advances only after an explicitly successful unit', () => {
  const first = checkpointAfterSuccess({}, 'page:1')
  const second = checkpointAfterSuccess(first, 'page:2')
  assert.deepEqual(second.completed_units, ['page:1', 'page:2'])
  assert.equal(second.last_completed_unit, 'page:2')
})

test('legacy demotion and cache RPCs are impossible through the allowlist', () => {
  assert.equal(assertAllowedWriteRpc('finish_psdeals_ended_analysis_v2'), true)
  assert.equal(assertAllowedWriteRpc('apply_psdeals_ended_deals_v3'), true)
  assert.equal(assertAllowedWriteRpc('apply_psdeals_ended_deals_v4'), true)
  assert.equal(assertAllowedWriteRpc('enqueue_lobodeals_ended_demotion_v5'), true)
  assert.throws(() => assertAllowedWriteRpc('apply_psdeals_ended_deals_v2'), /WRITE_RPC_FORBIDDEN|LEGACY_RPC_FORBIDDEN/)
  assert.equal(assertAllowedWriteRpc('certify_price_refresh_cycle_v3'), true)
  assert.equal(assertAllowedWriteRpc('refresh_catalog_public_cache_v16'), true)
  assert.equal(assertAllowedWriteRpc('certify_price_refresh_cycle_v4'), true)
  assert.equal(assertAllowedWriteRpc('refresh_catalog_public_cache_v17'), true)
  assert.throws(() => assertAllowedWriteRpc('apply_psdeals_ended_deals_v1'), /WRITE_RPC_FORBIDDEN|LEGACY_RPC_FORBIDDEN/)
  assert.throws(() => assertAllowedWriteRpc('refresh_catalog_public_cache_v15'), /WRITE_RPC_FORBIDDEN|LEGACY_RPC_FORBIDDEN/)
})

test('closed Edge/CDP is transient and never a successful page', () => {
  assert.deepEqual(classifyEdgeSnapshot({ cdp_available: false, tab_found: false }), { state: 'cdp_unavailable', ready: false })
})

test('discounts may finish by an exact positive total without duplicate probes', () => {
  const result = classifyDiscountPage({
    current_items: [{ psdeals_id: 9 }, { psdeals_id: 10 }],
    probe_items: [],
    expected_page_size: 36,
    total_results: 100,
    unique_before: 98,
  })
  assert.equal(result.classification, 'terminal_exact_total')
  assert.equal(result.terminal, true)
})

test('monthly mapping blocks two equally plausible catalog candidates', () => {
  const result = resolveMonthlyGames({ games: [{ title: 'Game Alpha', platforms: ['PS5'] }] }, [
    { id: 'a', psdeals_id: 1, title: 'Game Alpha', platforms: ['PS5'] },
    { id: 'b', psdeals_id: 2, title: 'Game Alpha', platforms: ['PS5'] },
  ])
  assert.equal(result.resolved, false)
  assert.equal(result.resolutions[0].status, 'ambiguous')
})


test('monthly mapping resolves the exact production cross-gen duplicate by complete official platform coverage', () => {
  const result = resolveMonthlyGames({ games: [{
    title: 'Dying Light 2 Stay Human: Reloaded Edition',
    platforms: ['PS5', 'PS4'],
  }] }, [
    { id: 'combined', psdeals_id: 2206966, title: 'Dying Light 2 Stay Human PS4&PS5', platforms: ['PS4', 'PS5'] },
    { id: 'ps4-only', psdeals_id: 2207097, title: 'Dying Light 2 Stay Human PS4&PS5', platforms: ['PS4'] },
  ])
  assert.equal(result.resolved, true)
  assert.equal(result.resolutions[0].psdeals_id, 2206966)
  assert.equal(result.resolutions[0].resolution_reason, 'same_title_complete_platform_coverage')
  assert.equal(result.resolutions[0].candidates[0].platform_complete, true)
  assert.equal(result.resolutions[0].candidates[1].platform_complete, false)
})

test('monthly mapping remains ambiguous when duplicate titles both fully cover the official platforms', () => {
  const result = resolveMonthlyGames({ games: [{ title: 'Game Alpha', platforms: ['PS5', 'PS4'] }] }, [
    { id: 'a', psdeals_id: 1, title: 'Game Alpha', platforms: ['PS5', 'PS4'] },
    { id: 'b', psdeals_id: 2, title: 'Game Alpha', platforms: ['PS4', 'PS5'] },
  ])
  assert.equal(result.resolved, false)
  assert.equal(result.resolutions[0].status, 'ambiguous')
})

test('monthly metadata change is not mistaken for no-change', () => {
  const monthly = { month_key: '2026-08', active_from: '2026-08-04', active_until: '2026-08-31' }
  const resolutions = { resolutions: [{ item_id: 'a', official: { title: 'Game A' } }] }
  const result = compareMonthlySets([
    { month_key: '2026-08', item_id: 'a', title: 'Game A', active_from: '2026-08-05', active_until: '2026-08-31', is_active: true },
  ], monthly, resolutions)
  assert.equal(result.keys_same, true)
  assert.equal(result.same, false)
})

test('monthly parser handles a December-to-January availability range', () => {
  const monthly = parseMonthlyArticle({
    source_url: 'https://blog.playstation.com/example',
    published_at: '2026-11-28T12:00:00Z',
    html: '<p>Available from December 2 until January 5.</p><h2>A | PS5</h2><h2>B | PS4</h2><h2>C | PS5</h2>',
  })
  assert.equal(monthly.active_from, '2026-12-02')
  assert.equal(monthly.active_until, '2027-01-05')
})

test('checkpoint replay is idempotent for an already completed unit', () => {
  const first = checkpointAfterSuccess({}, 'detail-chunk:4')
  const repeated = checkpointAfterSuccess(first, 'detail-chunk:4')
  assert.deepEqual(repeated.completed_units, ['detail-chunk:4'])
})

test('monthly parser blocks an unsafe one-game or malformed article', () => {
  assert.throws(() => parseMonthlyArticle({
    source_url: 'https://blog.playstation.com/example',
    published_at: '2026-07-28T12:00:00Z',
    html: '<p>Available from August 4 until August 31.</p><h2>Only One | PS5</h2>',
  }), /MONTHLY_GAME_COUNT_UNSAFE/)
})

test('operational source contains no direct legacy RPC invocation', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.equal(/rpc\(\s*['"]refresh_catalog_public_cache_v15['"]/.test(source), false)
  assert.equal(/rpc\(\s*['"]apply_psdeals_ended_deals_v1['"]/.test(source), false)
})


test('monthly parser accepts official weekday wording around availability dates', () => {
  const monthly = parseMonthlyArticle({
    source_url: 'https://blog.playstation.com/2026/07/28/example/',
    published_at: '2026-07-28T12:00:00Z',
    html: `
      <p>The games will be available to PlayStation Plus members from Tuesday August 4 until Monday August 31.</p>
      <h2>Dying Light 2 Stay Human: Reloaded Edition | PS5, PS4</h2>
      <h2>Big Walk | PS5</h2>
      <h2>Signalis | PS4</h2>
      <h2>MARVEL Tōkon: Fighting Souls PlayStation Plus Pack</h2>`,
  })
  assert.equal(monthly.month_key, '2026-08')
  assert.equal(monthly.active_from, '2026-08-04')
  assert.equal(monthly.active_until, '2026-08-31')
  assert.deepEqual(monthly.games.map((game) => game.title), [
    'Dying Light 2 Stay Human: Reloaded Edition',
    'Big Walk',
    'Signalis',
  ])
})

test('monthly category fallback chooses the newest official monthly article', () => {
  const article = parseMonthlyCategoryHtml(`
    <a href="/2026/06/28/playstation-plus-monthly-games-for-july-example/">July</a>
    <a href="https://blog.playstation.com/2026/07/28/playstation-plus-monthly-games-for-august-example/">August</a>
    <a href="https://example.com/2026/08/30/playstation-plus-monthly-games-for-september-fake/">Fake</a>
  `)
  assert.equal(article.link, 'https://blog.playstation.com/2026/07/28/playstation-plus-monthly-games-for-august-example/')
  assert.equal(article.published_at, '2026-07-28T12:00:00.000Z')
})

test('demotion candidate hash matches the database newline contract', async () => {
  const { canonicalCandidateIds, candidateSetHash, sha256 } = await import('../scripts/lib/lobodeals-daily-core-v1.mjs')
  assert.deepEqual(canonicalCandidateIds([30, 10, 20, 10, -1, 0, '20']), [10, 20, 30])
  assert.equal(candidateSetHash([30, 10, 20, 10]), sha256(Buffer.from('10\n20\n30', 'utf8')))
  assert.equal(candidateSetHash([]), sha256(Buffer.from('', 'utf8')))
})

test('a future monthly announcement never replaces the still-active current set', async () => {
  const { selectCurrentMonthlySet } = await import('../scripts/lib/lobodeals-daily-core-v1.mjs')
  const selected = selectCurrentMonthlySet([
    { month_key: '2026-09', active_from: '2026-09-01', active_until: '2026-10-05', published_at: '2026-08-27T12:00:00Z', games: [{ title: 'September' }] },
    { month_key: '2026-08', active_from: '2026-08-04', active_until: '2026-08-31', published_at: '2026-07-28T12:00:00Z', games: [{ title: 'August' }] },
  ], '2026-08-28')
  assert.equal(selected.month_key, '2026-08')
})

test('monthly discovery helpers retain multiple official candidates for active-date selection', async () => {
  const { parseMonthlyFeedCandidates, parseMonthlyCategoryCandidates } = await import('../scripts/lib/lobodeals-daily-core-v1.mjs')
  const feed = parseMonthlyFeedCandidates(`
    <rss><channel>
      <item><title>PlayStation Plus Monthly Games for September: A, B, C</title><link>https://blog.playstation.com/2026/08/27/playstation-plus-monthly-games-for-september-example/</link><pubDate>Thu, 27 Aug 2026 12:00:00 GMT</pubDate></item>
      <item><title>PlayStation Plus Monthly Games for August: D, E, F</title><link>https://blog.playstation.com/2026/07/28/playstation-plus-monthly-games-for-august-example/</link><pubDate>Tue, 28 Jul 2026 12:00:00 GMT</pubDate></item>
    </channel></rss>`)
  assert.equal(feed.length, 2)
  const category = parseMonthlyCategoryCandidates(`
    <a href="https://blog.playstation.com/2026/07/28/playstation-plus-monthly-games-for-august-example/">August</a>
    <a href="https://blog.playstation.com/2026/08/27/playstation-plus-monthly-games-for-september-example/">September</a>`)
  assert.deepEqual(category.map((row) => row.link), [
    'https://blog.playstation.com/2026/08/27/playstation-plus-monthly-games-for-september-example/',
    'https://blog.playstation.com/2026/07/28/playstation-plus-monthly-games-for-august-example/',
  ])
})

test('operational source enforces current database contracts for monthly and demotion', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /p_result:\s*'no_changes'/)
  assert.match(source, /p_application_performed:\s*false/)
  assert.equal(/p_result:\s*'changes_applied'/.test(source), false)
  assert.match(source, /listing_complete:\s*true/)
  assert.match(source, /analysis_evidence_hash:/)
  assert.match(source, /candidateSetHash\(candidates\)/)
  assert.match(source, /required\.length\s*>=\s*7/)
})

test('monthly parser accepts h3 headings and official available-on wording', () => {
  const monthly = parseMonthlyArticle({
    source_url: 'https://blog.playstation.com/example',
    published_at: '2026-07-31T12:00:00Z',
    html: `
      <p>All three games will be available to PlayStation Plus members on August 6 until September 2.</p>
      <h3>Alpha | PS5</h3>
      <h3>Beta | PS4</h3>
      <h3>Gamma | PS5, PS4</h3>`,
  })
  assert.equal(monthly.active_from, '2026-08-06')
  assert.equal(monthly.active_until, '2026-09-02')
  assert.deepEqual(monthly.games.map((row) => row.title), ['Alpha', 'Beta', 'Gamma'])
})

test('operational source rejects collector output for the wrong active page', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /PAGE_NUMBER_MISMATCH/)
  assert.match(source, /ACTIVE_PAGE_MISMATCH/)
  assert.match(source, /PAGE_URL_MISMATCH/)
})

test('discount collection restarts only after reported-total drift and tolerates cross-page overlap', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /total_results_changed_during_collection/)
  assert.match(source, /checkpoint-before-reset-/)
  assert.match(source, /\[SOLAPE TOLERADO DESCUENTOS\]/)
  assert.doesNotMatch(source, /resetForSnapshotChange\('partial_cross_page_overlap_detected'/)
})

test('detail pipeline supports clean retry receipts and a truly empty queue', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /actionKind:\s*'detail_retry'/)
  assert.match(source, /requireClean:\s*false/)
  assert.match(source, /empty_queue_confirmed/)
  assert.match(source, /pending_failures:\s*0/)
})

test('v2 creates normal daily identities and never reuses the historical recovery run', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /const OPERATOR_VERSION = 2/)
  assert.match(source, /local-cycle-daily-/)
  assert.equal(/const INITIAL_RUN_ID\s*=\s*'local-cycle-recovery-20260804-final'/.test(source), false)
  assert.match(source, /initialMode:\s*false/)
})

test('v2 resumes an incomplete run but creates a new run after a completed run even on the same day', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /if \(activeState\.status !== 'completed'\)/)
  assert.match(source, /resumedExistingRun:\s*true/)
  assert.match(source, /const runId = `local-cycle-daily-\$\{runIdTimestamp\(\)\}-\$\{crypto\.randomBytes/)
  assert.doesNotMatch(source, /alreadyCompletedToday/)
  assert.doesNotMatch(source, /No se creó un segundo ciclo/)
  assert.match(source, /`\$\{successDate\}-\$\{runId\}\.json`/)
})

test('monthly database rows preserve the established label, note and permanent source', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /label:\s*'Free with PS Plus'/)
  assert.match(source, /note:\s*'Included with PlayStation Plus this month\.'/)
  assert.match(source, /source_url:\s*MONTHLY_PERMANENT_URL/)
})

test('monthly source is revalidated again after a long detail phase', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /refresh_official_monthly_after_final_reconcile_v118/)
  assert.match(source, /monthly-source-revalidation-before-application\.json/)
  assert.match(source, /use_refreshed_official_active_set_and_record_amendment/)
})

test('mark-succeeded receipt set remains within the database limit without omitting required stage types', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /if \(required\.length > 500\)/)
  assert.match(source, /discountUpsert\.receipts\?\.\[0\]/)
  assert.match(source, /selectCleanTerminalDetailReceipt\(admin, details\.receipts\)/)
  assert.match(source, /assertMarkReceiptSetReady/)
  assert.match(source, /required\.length >= 7 && required\.length <= 500/)
})

test('installer requires every operational dependency to be tracked and clean at the expected HEAD', async () => {
  const fs = await import('node:fs/promises')
  const candidates = [
    new URL('../data/daily-operator-v1/audit/installer-source-v2.0.mjs', import.meta.url),
  ]
  let source = null
  for (const candidate of candidates) {
    try {
      source = await fs.readFile(candidate, 'utf8')
      break
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  assert.ok(source, 'installer source must exist in package or installed audit layout')
  assert.match(source, /git', \['cat-file', '-e'/)
  assert.match(source, /git', \['status', '--porcelain=v1'/)
  assert.match(source, /PROJECT_SOURCE_NOT_CLEAN_AT_HEAD/)
  assert.match(source, /installer-source-v2\.0\.mjs/)
  assert.match(source, /--test-reporter=tap/)
  assert.match(source, /windows-spec/)
  assert.match(source, /manifest_fallback_after_exit_0/)
  assert.match(source, /--self-test-installer/)
  assert.match(source, /INSTALLER_ACTUAL_OUTPUT_PARSER_SELFTEST_FAILED/)
})

test('detail retry resume reuses the original failure artifact and does not create orphan retries', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /initial_attempt\?\.completed === true/)
  assert.match(source, /DETAIL_FAILURE_FILE_HASH_MISMATCH/)
  assert.match(source, /chunkRuntime\.retry \|\|=/)
  assert.match(source, /DETAIL_RETRY_IDENTITY_CHANGED/)
  assert.match(source, /intento inicial ya confirmado localmente; no se repite/)
})

test('monthly mapping never assigns two official games to the same catalog item', () => {
  const result = resolveMonthlyGames({ games: [
    { title: 'Alpha Standard Edition', platforms: ['PS5'] },
    { title: 'Alpha Deluxe Edition', platforms: ['PS5'] },
  ] }, [
    { id: 'a', psdeals_id: 1, title: 'Alpha', platforms: ['PS5'] },
  ])
  assert.equal(result.resolved, false)
  assert.ok(result.resolutions.every((row) => row.status === 'ambiguous_duplicate_target'))
})


test('monthly application checkpoint reconciles a crash after the database reached the exact target', () => {
  const result = reconcileMonthlyApplicationCheckpoint({
    comparison_same: true,
    checkpoint: { phases: { proposal_recorded: true } },
    active_games: 3,
  })
  assert.equal(result.recovered, true)
  assert.equal(result.application.affected_rows, 0)
  assert.equal(result.application.active_games, 3)
  assert.equal(result.application.recovered_after_application, true)
  assert.equal(result.phases.applied, true)
  assert.equal(result.phases.verified_after_application, true)
  assert.equal(result.phases.reconciled_after_interruption, true)

  const untouched = reconcileMonthlyApplicationCheckpoint({
    comparison_same: false,
    checkpoint: { phases: { proposal_recorded: true } },
    active_games: 2,
  })
  assert.equal(untouched.recovered, false)
})


test('official monthly article fetch enforces the final PlayStation Blog host', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /MONTHLY_SOURCE_FINAL_HOST_INVALID/)
  assert.match(source, /finalUrl\.hostname\.toLowerCase\(\) === 'blog\.playstation\.com'/)
})

test('repeated discount pagination is canonicalized as accepted final-pagination evidence', async () => {
  assert.equal(normalizeListingEvidenceTermination('terminal_repeated_page'), 'pagination_final_observed')
  assert.equal(normalizeListingEvidenceTermination('terminal_repeated_short_page'), 'pagination_final_observed')
  assert.equal(normalizeListingEvidenceTermination('exact_total_reached'), 'exact_total_reached')
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /termination:\s*normalizeListingEvidenceTermination\(discounts\.stop_reason\)/)
  assert.match(source, /stop_reason:\s*discounts\.stop_reason/)
})

test('v1.26 exact reported discount coverage is canonicalized as complete listing evidence', async () => {
  assert.equal(normalizeListingEvidenceTermination('terminal_exact_total'), 'pagination_final_observed')
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /classification = 'terminal_exact_total'/)
  assert.match(source, /checkpoint\.items\.length === Number\(checkpoint\.observed_total\)/)
  assert.match(source, /FINAL_DISCOUNTS_EVIDENCE_NOT_COMPLETE/)
})

test('v1.26 canonicalizes duplicate ended-analysis rows before recording or applying the exact demotion set', async () => {
  assert.deepEqual(canonicalCandidateIds([3119352, 3119352, 74044, 74044, 2175280]), [74044, 2175280, 3119352])
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /const endedFinalPayloadCandidates = canonicalCandidateIds/)
  assert.match(source, /ENDED_FINAL_CANONICAL_CANDIDATE_SET_MISMATCH/)
  assert.match(source, /duplicate_candidate_rows: endedFinalDuplicateRows/)
  assert.doesNotMatch(source, /ended_discount_candidates \|\| \[\]\)\.length === endedFinalRef\.candidate_count/)
})


test('listing upsert receipt builder matches the live database contract exactly', () => {
  const result = buildListingUpsertReceiptResult({ batch_index: 0, attempted: 100, affected_rows: 100, label: 'recent' })
  assert.deepEqual(result, {
    affected_rows: 100, batch_index: 0, label: 'recent', attempted: 100, succeeded: 100, failed: 0, skipped: 0,
  })
  assert.equal(assertGenericReceiptResultContract('listing_upsert_batch', result), true)
})

test('listing upsert receipt contract rejects the exact missing-fields failure observed live', () => {
  assert.throws(
    () => assertGenericReceiptResultContract('listing_upsert_batch', { affected_rows: 100, batch_index: 0, label: 'recent' }),
    /GENERIC_RECEIPT_FIELD_INVALID:listing_upsert_batch:attempted/,
  )
})

test('all generic action result shapes are validated before the finish RPC', async () => {
  assert.equal(assertGenericReceiptResultContract('fast_refresh_analysis', { combined_count: 10, overlap_count: 0, combined_artifact_hash: 'a'.repeat(64) }), true)
  assert.equal(assertGenericReceiptResultContract('detail_import', { attempted: 50, succeeded: 50, pending_failures: 0, failed: 0, skipped: 0 }), true)
  assert.equal(assertGenericReceiptResultContract('detail_retry', { attempted: 2, succeeded: 2, pending_failures: 0, failed: 0, skipped: 0 }), true)
  assert.equal(assertGenericReceiptResultContract('ended_deals_analysis', { listing_complete: true, listing_artifact_hash: 'b'.repeat(64), analysis_evidence_hash: 'c'.repeat(64), candidate_set_hash: 'd'.repeat(64), candidate_count: 1851 }), true)
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /assertGenericReceiptResultContract\(actionKind, result\)/)
  assert.match(source, /buildListingUpsertReceiptResult\(/)
})

test('ended analysis local contract blocks an unsafe set above the database maximum', () => {
  assert.throws(() => assertGenericReceiptResultContract('ended_deals_analysis', {
    listing_complete: true, listing_artifact_hash: 'a'.repeat(64), analysis_evidence_hash: 'b'.repeat(64), candidate_set_hash: 'c'.repeat(64), candidate_count: 5001,
  }), /GENERIC_RECEIPT_ENDED_COUNT_LIMIT:5001/)
})


test('discount listing identity hydration repairs an existing row without inventing catalog identity', () => {
  const source = [{
    psdeals_id: 123,
    psdeals_slug: '',
    psdeals_url: '',
    title: '',
    commercial_state: { is_safe_for_price_update: true },
  }]
  const existing = [{
    psdeals_id: 123,
    psdeals_slug: 'fixture-game',
    psdeals_url: 'https://psdeals.net/us-store/game/123/fixture-game',
    title: 'Fixture Game',
  }]
  const result = hydrateListingIdentityFromExistingRows(source, existing)
  assert.equal(result.repair_count, 1)
  assert.equal(result.items[0].psdeals_id, 123)
  assert.equal(result.items[0].psdeals_slug, 'fixture-game')
  assert.equal(result.items[0].psdeals_url, 'https://psdeals.net/us-store/game/123/fixture-game')
  assert.equal(result.items[0].title, 'Fixture Game')
  assert.deepEqual(result.repairs[0].fields, ['psdeals_slug_from_stage', 'psdeals_url_from_stage', 'title_from_stage'])
})

test('discount listing identity hydration preserves valid live identity', () => {
  const source = [{
    psdeals_id: 321,
    psdeals_slug: 'live-slug',
    psdeals_url: 'https://psdeals.net/us-store/game/321/live-slug',
    title: 'Live Title',
  }]
  const existing = [{
    psdeals_id: 321,
    psdeals_slug: 'old-slug',
    psdeals_url: 'https://psdeals.net/us-store/game/321/old-slug',
    title: 'Old Title',
  }]
  const result = hydrateListingIdentityFromExistingRows(source, existing)
  assert.equal(result.repair_count, 0)
  assert.deepEqual(result.items, source)
})

test('exact listing batch coverage blocks missing or duplicate rows before remote writes', () => {
  const exact = {
    batches: [
      { rows: [{ psdeals_id: 1 }, { psdeals_id: 2 }] },
      { rows: [{ psdeals_id: 3 }] },
    ],
  }
  assert.deepEqual(
    assertExactListingBatchCoverage(exact, [{ psdeals_id: 1 }, { psdeals_id: 2 }, { psdeals_id: 3 }]),
    { expected_count: 3, prepared_count: 3 },
  )
  assert.throws(
    () => assertExactListingBatchCoverage({ batches: [{ rows: [{ psdeals_id: 1 }, { psdeals_id: 1 }] }] }, [{ psdeals_id: 1 }, { psdeals_id: 2 }]),
    /LISTING_BATCH_PREPARED_IDS_NOT_UNIQUE/,
  )
  assert.throws(
    () => assertExactListingBatchCoverage({ batches: [{ rows: [{ psdeals_id: 1 }] }] }, [{ psdeals_id: 1 }, { psdeals_id: 2 }]),
    /LISTING_BATCH_COVERAGE_COUNT_MISMATCH/,
  )
})

test('malformed new discount inserts may defer only when exact detail recovery is guaranteed', () => {
  const listingItems = [{
    psdeals_id: 1989099,
    psdeals_slug: 'fixture-malformed',
    psdeals_url: 'https://psdeals.net/us-store/game/1989099/fixture-malformed',
    title: null,
  }, {
    psdeals_id: 2,
    psdeals_slug: 'normal',
    psdeals_url: 'https://psdeals.net/us-store/game/2/normal',
    title: 'Normal',
  }]
  const prepared = {
    omitted: [{
      index: 0,
      psdeals_id: 1989099,
      operation: 'insert',
      reason_codes: ['title_missing_for_insert', 'listing_commercial_state_omitted'],
    }],
    batches: [{ rows: [{ psdeals_id: 2 }] }],
  }
  const result = planDeferredListingInsertRecovery({
    prepared,
    listingItems,
    detailItems: [{ psdeals_id: 1989099, psdeals_url: listingItems[0].psdeals_url }],
  })
  assert.equal(result.recoverable, true)
  assert.equal(result.deferred_count, 1)
  assert.equal(result.deferred[0].psdeals_id, 1989099)
  assert.deepEqual(result.primary_items.map((row) => row.psdeals_id), [2])
})

test('malformed discount omission is never deferred without a valid detail recovery path', () => {
  const item = {
    psdeals_id: 1989099,
    psdeals_slug: 'fixture-malformed',
    psdeals_url: 'https://psdeals.net/us-store/game/1989099/fixture-malformed',
    title: null,
  }
  const prepared = {
    omitted: [{ index: 0, psdeals_id: 1989099, operation: 'insert', reason_codes: ['title_missing_for_insert'] }],
    batches: [],
  }
  const result = planDeferredListingInsertRecovery({ prepared, listingItems: [item], detailItems: [] })
  assert.equal(result.recoverable, false)
  assert.equal(result.deferred_count, 0)
  assert.equal(result.unsafe_count, 1)
})

test('identity or raw-artifact failures can never be hidden as deferred discount inserts', () => {
  const item = {
    psdeals_id: 1989099,
    psdeals_slug: 'fixture-malformed',
    psdeals_url: 'https://psdeals.net/us-store/game/1989099/fixture-malformed',
    title: null,
  }
  const prepared = {
    omitted: [{ index: 0, psdeals_id: 1989099, operation: 'insert', reason_codes: ['title_missing_for_insert', 'raw_listing_json_missing'] }],
    batches: [],
  }
  const result = planDeferredListingInsertRecovery({ prepared, listingItems: [item], detailItems: [item] })
  assert.equal(result.recoverable, false)
  assert.equal(result.unsafe_count, 1)
})

test('discount upsert plan records deferred malformed inserts and verifies the final listing stamp after details', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /planDeferredListingInsertRecovery\(/)
  assert.match(source, /deferred_items: recovery\.deferred/)
  assert.match(source, /prepare_deferred_discount_listing_after_details/)
  assert.match(source, /DEFERRED_DISCOUNT_DETAIL_DID_NOT_CREATE/)
  assert.match(source, /upsert_deferred_discount_listing_batches/)
  assert.match(source, /verify_discount_listing_stage_stamp/)
  assert.match(source, /DISCOUNT_STAGE_FINAL_STAMP_MISMATCH/)
  assert.match(source, /deferredDiscountUpsert\.affected/)
})


test('detail import receipt preserves the exact live 50-of-50 failure result for a committed parent before retry', () => {
  const result = buildDetailImportReceiptResult({
    attempted: 50,
    succeeded: 0,
    failed: 50,
    skipped: 0,
    chunk_index: 0,
  })
  assert.deepEqual(result, {
    affected_rows: 0,
    attempted: 50,
    succeeded: 0,
    pending_failures: 50,
    failed: 50,
    skipped: 0,
    chunk_index: 0,
  })
  assert.equal(assertGenericReceiptResultContract('detail_import', result), true)
})

test('detail receipt contract rejects inconsistent pending failures or arithmetic', () => {
  assert.throws(
    () => assertGenericReceiptResultContract('detail_import', {
      attempted: 50, succeeded: 0, pending_failures: 0, failed: 50, skipped: 0,
    }),
    /GENERIC_RECEIPT_DETAIL_COUNTS_INCONSISTENT/,
  )
  assert.throws(
    () => buildDetailImportReceiptResult({
      attempted: 50, succeeded: 49, failed: 0, skipped: 0, chunk_index: 0,
    }),
    /DETAIL_RECEIPT_COUNTS_INCONSISTENT/,
  )
})

test('runtime detail importer updates existing rows and inserts only genuinely new rows', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )
  const persistStart = source.indexOf('async function persistDetailStageItem')
  const persistEnd = source.indexOf('export function runtimeImporterSelfTest', persistStart)
  assert.ok(persistStart >= 0 && persistEnd > persistStart)
  const persist = source.slice(persistStart, persistEnd)
  assert.match(persist, /\.update\(plan\.payload\)/)
  assert.match(persist, /\.eq\('id', plan\.existing_id\)/)
  assert.match(persist, /\.insert\(plan\.payload\)/)
  assert.doesNotMatch(persist, /\.upsert\(/)
  assert.match(source, /existing_id:\s*existing\?\.id \|\| null/)
  assert.match(source, /tracked_project_importer_modified:\s*false/)
})

test('operator commits detail_import before beginning its child detail_retry and reuses the saved first attempt on resume', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const detailStart = source.indexOf('async function processDetailChunks')
  const initialStart = source.indexOf("actionKind: 'detail_import'", detailStart)
  const initialCommitted = source.indexOf('chunkRuntime.initial_receipt_committed = true', initialStart)
  const retryStart = source.indexOf("actionKind: 'detail_retry'", initialCommitted)
  assert.ok(detailStart >= 0 && initialStart > detailStart && initialCommitted > initialStart && retryStart > initialCommitted)
  assert.match(source.slice(initialCommitted, retryStart + 500), /parentReceiptId:\s*initial\.receipt_id/)
  assert.doesNotMatch(source.slice(initialStart, retryStart), /parentReceiptId:\s*receiptId/)
  assert.match(source, /initial_attempt\?\.completed === true/)
  assert.match(source, /intento inicial ya confirmado localmente; no se repite/)
  assert.match(source, /buildDetailImportReceiptResult\(/)
})

test('operator invokes the isolated v1.26 runtime importer instead of mutating or invoking the tracked importer', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /DETAIL_RUNTIME_IMPORTER = 'data\/daily-operator-v1\/runtime\/import-psdeals-detail-local-v2\.0\.mjs'/)
  assert.match(source, /manifest\.runtime_importer_sha256/)
  assert.match(source, /'scripts\/lib\/psdeals-commercial-state\.mjs'/)
  const detailFunction = source.slice(source.indexOf('async function processDetailChunks'), source.indexOf('async function upsertListingBatches'))
  assert.match(detailFunction, /DETAIL_RUNTIME_IMPORTER/)
  assert.doesNotMatch(detailFunction, /'scripts\/import-psdeals-detail-local\.mjs'/)
})

test('v1.26 installer installs, syntax-checks and self-tests the isolated runtime importer', async () => {
  const fs = await import('node:fs/promises')
  const candidates = [
    new URL('../data/daily-operator-v1/installer-source-v2.0.mjs', import.meta.url),
    new URL('../data/daily-operator-v1/audit/installer-source-v2.0.mjs', import.meta.url),
  ]
  let source = null
  for (const candidate of candidates) {
    try {
      source = await fs.readFile(candidate, 'utf8')
      break
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  assert.ok(source)
  assert.match(source, /payload\/data\/daily-operator-v1\/runtime\/import-psdeals-detail-local-v2\.0\.mjs/)
  assert.match(source, /RUNTIME_IMPORTER_SYNTAX/)
  assert.match(source, /--self-test-runtime-importer/)
  assert.match(source, /runtime_importer_self_test_passed:\s*true/)
  assert.match(source, /psdeals-commercial-state\.mjs/)
})

test('v1.26 Edge detail readiness accepts an exact detail route with canonical title even when legacy item_id is absent', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )
  assert.match(source, /document\.documentElement\?\.outerHTML \|\| ''/)
  assert.match(source, /const hasMatchingRouteItemId = Number\.isSafeInteger\(routeItemId\) && routeItemId === expectedItemId/)
  assert.match(source, /const embeddedItemIdCompatible = !hasItemId \|\| observedItemId === expectedItemId/)
  assert.match(source, /const hasCoreDetail = hasMatchingItemId && hasCanonicalTitle/)
  assert.match(source, /state\?\.hasCoreDetail === true/)
  const waitStart = source.indexOf('async function waitForEdgeLiveDetail')
  const fetchStart = source.indexOf('async function fetchHtmlWithEdgeLive', waitStart)
  const waitSource = source.slice(waitStart, fetchStart)
  assert.doesNotMatch(waitSource, /state\?\.textLength > 3000/)
  assert.doesNotMatch(waitSource, /state\?\.hasPlayStationStore \|\|/)
})

test('v1.26 final Edge snapshot requires the requested route and canonical title while treating embedded item_id as optional corroboration', async () => {
  const fs = await import('node:fs/promises')
  const operator = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const runtime = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )
  assert.match(operator, /psdeals_detail_page_not_ready/)
  assert.match(runtime, /snapshotAttempt < 10/)
  assert.match(runtime, /pageData\?\.routeItemId === expectedItemId/)
  assert.match(runtime, /!pageData\?\.observedItemId \|\| pageData\.observedItemId === expectedItemId/)
  assert.match(runtime, /pageData\?\.hasCanonicalTitle === true/)
  assert.match(runtime, /PSDEALS_DETAIL_PAGE_NOT_READY/)
})

test('v1.26 resumes an unfinished detail_retry from its saved failure subset instead of replaying successful URLs', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const detail = source.slice(source.indexOf('async function processDetailChunks'), source.indexOf('async function upsertListingBatches'))
  assert.match(detail, /retry-progress\.json/)
  assert.match(detail, /seeded_from_legacy_retry_summary/)
  assert.match(detail, /pendingQueueFile = retryFailures/)
  assert.match(detail, /\[REANUDAR RETRY\]/)
  assert.match(detail, /requireClean:\s*false/)
  assert.match(detail, /cumulativeSucceeded === initialPending/)
})

test('v1.26 retry progress has a bounded no-progress stop and a bounded transient child retry', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /DETAIL_RETRY_NO_PROGRESS/)
  assert.match(source, /consecutiveNoProgress >= 2/)
  assert.match(source, /TRANSIENT_RETRY_LIMIT/)
  assert.match(source, /transientAttempts >= 3/)
})

test('v1.26 runtime stops walking the whole queue after repeated readiness failures and preserves the untouched URLs as pending', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )
  assert.match(source, /consecutiveReadinessFailures >= 3/)
  assert.match(source, /const remainingUrls = urls\.slice\(itemsSeen\)/)
  assert.match(source, /failedUrls\.push\(\.\.\.remainingUrls\)/)
  assert.match(source, /PSDEALS_DETAIL_READINESS_CIRCUIT_BREAKER/)
})


test('v1.26 progressive retry chains the reduced queue to the previous retry evidence instead of the initial failure hash', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )
  assert.match(source, /retry-chain-parent-evidence/)
  assert.match(source, /IMPORT_PROGRESSIVE_INPUT_HASH_MISMATCH/)
  assert.match(source, /reference\.role === contract\.chain_pending_role/)
  assert.match(source, /role: 'previous_retry_evidence'/)
  assert.match(source, /role: 'pending_failures_input'/)
})

test('v1.26 keeps the original detail_import evidence and original failures linked in every progressive retry evidence envelope', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )
  assert.match(source, /DETAIL_RETRY_ORIGINAL_FAILURES_REQUIRED/)
  assert.match(source, /IMPORT_ORIGINAL_FAILURES_HASH_MISMATCH/)
  assert.match(source, /role: 'original_failures'/)
  assert.match(source, /parentEvidenceReference,\s*originalFailuresReference/)
})

test('v1.26 resumes the v1.11 retry-progress state by deriving attempt-0001 evidence for the remaining one-url queue', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const detail = source.slice(source.indexOf('async function processDetailChunks'), source.indexOf('async function upsertListingBatches'))
  assert.match(detail, /progress\.pending_parent_evidence_file/)
  assert.match(detail, /attempt-\$\{String\(attemptIndex\)\.padStart\(4, '0'\)\}/)
  assert.match(detail, /DETAIL_RETRY_PROGRESS_PARENT_EVIDENCE_MISSING/)
  assert.match(detail, /originalFailuresFile: failures/)
  assert.match(detail, /retryChainParentEvidence: pendingRetryParentEvidence/)
})


test('PSDeals language gate proves English and blocks Spanish or ambiguous snapshots', () => {
  const english = classifyPsDealsLanguageSnapshot({
    html_lang: 'en-US',
    nav_text: 'Discounts | All Games',
    body_text: 'Buy at PlayStation Store | Notify when price drops',
  })
  assert.equal(english.state, 'english')
  assert.equal(english.ready, true)

  const spanish = classifyPsDealsLanguageSnapshot({
    html_lang: 'es',
    nav_text: 'Descuentos | Todos los juegos',
    body_text: 'Complemento | Disfraz',
  })
  assert.equal(spanish.state, 'spanish')
  assert.equal(spanish.ready, false)

  const unknown = classifyPsDealsLanguageSnapshot({ title: 'PS Deals USA' })
  assert.equal(unknown.state, 'unknown')
  assert.equal(unknown.ready, false)
})

test('visible English navigation overrides stale Spanish html or cookie metadata after the user changes the PSDeals selector', () => {
  const result = classifyPsDealsLanguageSnapshot({
    html_lang: 'es',
    cookie_text: 'locale=es',
    nav_text: 'Discounts | All Games',
    body_text: 'Buy at PlayStation Store | Reviews',
  })
  assert.equal(result.state, 'english')
  assert.equal(result.ready, true)
})

test('listing language audit detects the localized Spanish type labels observed in the live run', () => {
  const audit = auditPsDealsListingLanguage([
    { psdeals_id: 1, type_label: 'Disfraz' },
    { psdeals_id: 2, type_label: 'Complemento' },
    { psdeals_id: 3, type_label: 'Juego completo' },
    { psdeals_id: 4, type_label: 'Add-On' },
  ])
  assert.equal(audit.spanish_count, 3)
  assert.equal(audit.english_count, 1)
  assert.deepEqual(audit.spanish_ids, [1, 2, 3])
})

test('v1.26 operator waits indefinitely for English and rejects a listing page containing Spanish labels before checkpointing', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /PAUSA POR IDIOMA DE PSDEALS/)
  assert.match(source, /esperará indefinidamente/i)
  assert.match(source, /classifyPsDealsLanguageSnapshot\(snapshot\)/)
  assert.match(source, /languageAudit\.spanish_count === 0/)
  assert.match(source, /PAGE_LANGUAGE_SPANISH/)
})

test('v1.26 detail runtime gates both before and after navigation and never auto-advances while language is not English', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )
  const fetchStart = source.indexOf('async function fetchHtmlWithEdgeLive')
  const fetchEnd = source.indexOf('export function buildDetailStageWritePlan', fetchStart)
  const fetchSource = source.slice(fetchStart, fetchEnd)
  assert.match(fetchSource, /waitForEdgeLiveEnglish\(edgeClient, sessionId, \{ reason: `before:/)
  assert.match(fetchSource, /Page\.navigate/)
  assert.match(fetchSource, /waitForEdgeLiveEnglish\(edgeClient, sessionId, \{ reason: `detail:/)
  assert.match(source, /El importer NO navegará a la siguiente ficha y esperará indefinidamente/)
  assert.doesNotMatch(source, /language.*Page\.reload/i)
})

test('v1.26 detail parser accepts whitespace around PSDeals item_id and item_type assignments', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )
  assert.match(source, /var\\s\+item_id\\s\*=\\s\*\(\\d\+\)\\s\*;/)
  assert.match(source, /var\\s\+item_type\\s\*=\\s\*"\(\[\^"\]\*\)"\\s\*;/)
})

test('v1.26 grants the current no-progress chunk one audited retry after English remediation without replaying earlier successes', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /language_gate_remediation_applied/)
  assert.match(source, /legacy_spanish_listing_detected === true/)
  assert.match(source, /REANUDAR RETRY POR IDIOMA/)
  assert.match(source, /consecutiveNoProgress = 0/)
  assert.match(source, /pendingQueueFile = path\.resolve\(projectRoot, progress\.pending_queue_file\)/)
})

test('v1.26 contains no listing fallback that can mark failed details as resolved without navigation', async () => {
  const fs = await import('node:fs/promises')
  const operator = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const runtime = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(operator, /allow-existing-listing-fallback|listing-fallback-retry-count/)
  assert.doesNotMatch(runtime, /listing_fallback_after_repeated_detail_failure|listing_fallback_no_navigation|OK_FALLBACK/)
})

test('v1.26 verifies English immediately before every listing collector invocation', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const start = source.indexOf('async function collectOnePage')
  const end = source.indexOf('async function fetchExistingRows', start)
  const collect = source.slice(start, end)
  assert.match(collect, /verifiedEndpoint = await waitForEdgeReady/)
  assert.match(collect, /expectedUrl: baseUrl/)
  assert.match(collect, /--endpoint=\$\{verifiedEndpoint\}/)
})

test('v1.26 embedded CDP expressions compile after template interpolation', async () => {
  const fs = await import('node:fs/promises')
  const operator = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const runtime = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )

  const compileTemplate = (raw, replacements = {}) => {
    let hydrated = raw
    for (const [key, value] of Object.entries(replacements)) {
      hydrated = hydrated.replaceAll(`\${${key}}`, String(value))
    }
    const source = Function(`return \`${hydrated.replaceAll('`', '\\`')}\``)()
    assert.doesNotThrow(() => Function(`return (${source})`))
  }

  const operatorMatch = operator.match(/expression:\s*`([\s\S]*?)`,\s*\n\s*returnByValue:\s*true/)
  assert.ok(operatorMatch)
  compileTemplate(operatorMatch[1])

  const waitStart = runtime.indexOf('async function waitForEdgeLiveDetail')
  const fetchStart = runtime.indexOf('async function fetchHtmlWithEdgeLive', waitStart)
  const waitSource = runtime.slice(waitStart, fetchStart)
  const waitMatch = waitSource.match(/sessionId,\s*`([\s\S]*?)`,\s*\n\s*15000/)
  assert.ok(waitMatch)
  compileTemplate(waitMatch[1], { expectedItemId: 3304467 })

  const fetchSource = runtime.slice(fetchStart, runtime.indexOf('export function buildDetailStageWritePlan', fetchStart))
  const finalMatch = fetchSource.match(/sessionId,\s*`([\s\S]*?)`,\s*\n\s*Math\.min\(timeoutMs, 15000\)/)
  assert.ok(finalMatch)
  compileTemplate(finalMatch[1])
})

test('v1.26 performs a fresh Recently Added and complete Discounts reconciliation before Monthly and demotions', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const recent = source.indexOf("collect_final_recently_added_incremental_v122")
  const discounts = source.indexOf("collect_final_discounts_complete_v118")
  const listing = source.indexOf("record_final_discount_listing_completion_v118")
  const monthly = source.indexOf("refresh_official_monthly_after_final_reconcile_v118")
  const ended = source.indexOf("reanalyze_ended_after_revalidation")
  assert.ok(recent > 0 && discounts > recent && listing > discounts && monthly > listing && ended > monthly)
  assert.match(source, /state\.receipts\.listing_validation = finalListingReceipt\.receipt_id/)
  assert.match(source, /discounts = finalDiscounts/)
})

test('v2.1 final delta reopens only new, changed-unsafe, or stale-unsafe listing items', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /function needsFinalDeltaDetail\(item, dbRow, options = \{\}\)/)
  assert.match(source, /if \(!dbRow\) return true/)
  assert.match(source, /listingCommercialSignature\(item\) !== listingCommercialSignature\(previousListing\)/)
  assert.match(source, /UNSAFE_DETAIL_REVALIDATE_HOURS/)
  assert.match(source, /unchanged_unsafe_rows_are_bounded_by_age/)
  assert.match(source, /stateKey: 'final_delta_detail_chunks_v118'/)
  assert.match(source, /idempotencyNamespace: 'final-delta-v118'/)
})

test('v1.26 Monthly candidate lookup avoids the leading-wildcard title scan that timed out', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const start = source.indexOf('async function fetchMonthlyCandidates')
  const end = source.indexOf('async function recordAction', start)
  const fn = source.slice(start, end)
  assert.match(fn, /\.in\('title', exactTitles\)/)
  assert.match(fn, /\.gte\('psdeals_slug', prefix\)\.lt\('psdeals_slug', upperBound\)/)
  assert.doesNotMatch(fn, /\.ilike\('title', `%/)
})

test('v1.26 keeps best-new-deals and never switches the final discounts reconciliation to A-Z', async () => {
  const fs = await import('node:fs/promises')
  const operatorUrl = new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url)
  const source = await fs.readFile(operatorUrl, 'utf8')
  assert.match(source, /const DISCOUNTS_URL = 'https:\/\/psdeals\.net\/us-store\/discounts\?platforms=ps5%2Cps4&sort=best-new-deals/)
  assert.doesNotMatch(source, /sort=az/)
})

test('v1.26 deduplicates a partial cross-page overlap without resetting to page 1', async () => {
  const fs = await import('node:fs/promises')
  const operatorUrl = new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url)
  const source = await fs.readFile(operatorUrl, 'utf8')
  assert.match(source, /\[SOLAPE TOLERADO DESCUENTOS\]/)
  assert.match(source, /cross_page_overlap_events/)
  assert.doesNotMatch(source, /resetForSnapshotChange\('partial_cross_page_overlap_detected'/)
})

test('v1.26 refuses demotion/certification if deduped unique coverage is below the stable reported total', async () => {
  const fs = await import('node:fs/promises')
  const operatorUrl = new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url)
  const source = await fs.readFile(operatorUrl, 'utf8')
  assert.match(source, /DISCOUNT_LISTING_UNIQUE_COVERAGE_MISMATCH/)
  assert.match(source, /checkpoint\.items\.length === Number\(checkpoint\.observed_total\)/)
})


test('v1.26 builds canonical PSDeals Discounts pages with the page number in the path while preserving best-new-deals', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /function buildCanonicalDiscountPageUrl\(baseUrl, pageNumber\)/)
  assert.match(source, /url\.pathname = pageNumber <= 1 \? normalizedPath : `\$\{normalizedPath\}\/\$\{pageNumber\}`/)
  assert.match(source, /url\.searchParams\.delete\('page'\)/)
  assert.match(source, /sort=best-new-deals/)
})

test('v1.26 invokes the legacy one-page collector against each canonical Discounts URL instead of asking it to synthesize ?page=N', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /canonicalDiscountPagination/)
  assert.match(source, /buildCanonicalDiscountPageUrl\(baseUrl, pageNumber\)/)
  assert.match(source, /const collectorStartPage = canonicalPagination \? 1 : pageNumber/)
  assert.match(source, /`--url=\$\{requestedUrl\}`/)
  assert.match(source, /`--start-page=\$\{collectorStartPage\}`/)
})

test('v1.26 requires the PSDeals active page to match the canonical requested Discounts page before checkpointing page 2+', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /summary\?\.active_page_detected \?\? summary\?\.active_page/)
  assert.match(source, /ACTIVE_PAGE_REQUIRED_MISMATCH/)
  assert.match(source, /parseCanonicalDiscountPage\(summaryUrl \|\| requestedUrl\)/)
  assert.match(source, /CANONICAL_PAGE_URL_MISMATCH/)
})

test('v1.26 archives the old partial Discounts checkpoint once when upgrading to canonical path pagination and keeps detail checkpoints untouched', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /DISCOUNTS_PAGINATION_CONTRACT = 'discounts_path_segment_v1'/)
  assert.match(source, /checkpoint-before-pagination-migration-/)
  assert.match(source, /discounts_canonical_path_pagination_upgrade/)
  assert.match(source, /Los 314 lotes de detalle permanecen cerrados/)
})

test('v1.26 builds canonical PSDeals Recently Added pages with the page number in the path while preserving recently-added', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /function buildCanonicalRecentPageUrl\(baseUrl, pageNumber\)/)
  assert.match(source, /RECENT_BASE_PATH_INVALID/)
  assert.match(source, /url\.pathname = pageNumber <= 1 \? normalizedPath : `\$\{normalizedPath\}\/\$\{pageNumber\}`/)
  assert.match(source, /const RECENT_URL = 'https:\/\/psdeals\.net\/us-store\/all-games\?platforms=ps5%2Cps4&sort=recently-added/)
})

test('v1.26 invokes the legacy one-page collector against each canonical Recently Added URL instead of synthesizing ?page=N', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /canonicalRecentPagination = false/)
  assert.match(source, /buildCanonicalRecentPageUrl\(baseUrl, pageNumber\)/)
  assert.match(source, /canonicalRecentPagination: true/)
  assert.match(source, /const collectorStartPage = canonicalPagination \? 1 : pageNumber/)
})

test('v1.26 requires the PSDeals active page to match canonical Recently Added page 2+ before checkpointing', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /parseCanonicalRecentPage\(summaryUrl \|\| requestedUrl\)/)
  assert.match(source, /CANONICAL_RECENT_PAGE_URL_MISMATCH/)
  assert.match(source, /ACTIVE_RECENT_PAGE_REQUIRED_MISMATCH/)
})

test('v1.26 reruns only final Recently Added under the canonical pagination contract while preserving Discounts and detail checkpoints', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /RECENT_PAGINATION_CONTRACT = 'recently_added_path_segment_v1'/)
  assert.match(source, /recently_added_canonical_path_pagination_upgrade/)
  assert.match(source, /collect_final_recently_added_incremental_v122/)
  assert.match(source, /Discounts y los 314 lotes de detalle permanecen intactos/)
  assert.match(source, /three_consecutive_pages_fully_known_against_database_or_adopted_listing/)
})



test('v1.26 preserves v3 history and adds the exact-set v4 reconciliation contract', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /actionKind === 'ended_deals_analysis'[\s\S]*finish_psdeals_ended_analysis_v2/)
  assert.match(source, /candidates\.length <= 5000/)
  assert.match(source, /apply_safe_demotions_v3/)
  assert.match(source, /demotion-v4-async-initial:/)
  assert.match(source, /runAsyncEndedDemotionV5/)
  assert.match(source, /enqueue_lobodeals_ended_demotion_v5/)
  assert.match(source, /get_lobodeals_ended_demotion_v5/)
  assert.match(source, /reanalyze_residual_ended_v126/)
  assert.match(source, /apply_safe_demotions_v4/)
  assert.match(source, /demotion-v4-async-reconcile:/)
  assert.match(source, /verify_zero_residual_ended_v126/)
  assert.doesNotMatch(source, /rpc\('apply_psdeals_ended_deals_v3', parameters\)/)
  assert.doesNotMatch(source, /rpc\('apply_psdeals_ended_deals_v4', parameters\)/)
  assert.doesNotMatch(source, /rpc\('apply_psdeals_ended_deals_v2', parameters\)/)
})


test('v1.31 audit copy exposes the installer patch used for deterministic ended-analysis pagination', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../data/daily-operator-v1/audit/installer-source-v2.0.mjs', import.meta.url), 'utf8')
  assert.match(source, /ENDED_ANALYZER_PATCH_NEEDLE/)
  assert.match(source, /\.order\('psdeals_id', \{ ascending: true \}\)/)
  assert.match(source, /\.order\('id', \{ ascending: true \}\)/)
  assert.match(source, /actual !== headHash && actual !== patchedHash/)
  assert.match(source, /verifiedProjectHashes\[relative\] = patchedHash/)
})

test('v1.26 reconciles the prior committed demotion with the deterministic residual set before mark succeeds', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const oldDemotion = source.indexOf("apply_safe_demotions_v3")
  const residual = source.indexOf("reanalyze_residual_ended_v126")
  const reconcile = source.indexOf("apply_safe_demotions_v4")
  const zeroAudit = source.indexOf("verify_zero_residual_ended_v126")
  const mark = source.indexOf("mark_cycle_succeeded")
  assert.ok(oldDemotion > 0 && residual > oldDemotion && reconcile > residual && zeroAudit > reconcile && mark > zeroAudit)
  assert.match(source, /ENDED_V126_RESIDUAL_OVERLAP_WITH_ALREADY_DEMOTED/)
  assert.match(source, /combined_candidate_hash/)
  assert.match(source, /ENDED_V126_RESIDUAL_STILL_ACTIVE/)
})

test('v1.26 compact mark receipt set selects a terminal clean detail receipt instead of the historical first failed detail receipt', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /selectCleanTerminalDetailReceipt\(admin, details\.receipts\)/)
  assert.match(source, /Number\(row\.result\?\.pending_failures \?\? 0\) === 0/)
  assert.doesNotMatch(source, /details\.receipts\?\.\[0\]/)
  assert.match(source, /assertMarkReceiptSetReady\(admin, required, state\.receipts\.demotion/)
  assert.match(source, /MARK_RECEIPT_PREFLIGHT_CLEAN_DETAIL_MISSING/)
})

test('v1.28 detects stale uncommitted mark timestamps after a later v4 demotion raises the validation floor', () => {
  const plan = planUncommittedMarkTimestampRecovery({
    timestamps: {
      validation_completed_at: '2026-08-13T14:10:55.000Z',
      cycle_finished_at: '2026-08-13T14:10:55.001Z',
    },
    validation_floors: [
      '2026-08-13T12:00:02.114Z',
      '2026-08-13T13:18:21.908Z',
      '2026-08-13T15:04:56.410Z',
    ],
  })
  assert.equal(plan.requires_reset, true)
  assert.equal(plan.reset_validation_completed_at, true)
  assert.equal(plan.reset_cycle_finished_at, true)
  assert.equal(plan.validation_floor_iso, '2026-08-13T15:04:56.410Z')

  const fresh = planUncommittedMarkTimestampRecovery({
    timestamps: {
      validation_completed_at: '2026-08-13T15:04:57.000Z',
      cycle_finished_at: '2026-08-13T15:04:57.001Z',
    },
    validation_floors: ['2026-08-13T15:04:56.410Z'],
  })
  assert.equal(fresh.requires_reset, false)
})

test('v1.28 rolls stale mark timestamps only after proving the remote cycle is still pristine and has no mark receipt', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /reconcileUncommittedMarkTimestamps\(admin, state, saveState, validationFloors, log\)/)
  assert.match(source, /select\('id,status,validation_completed_at,finished_at'\)/)
  assert.match(source, /MARK_TIMESTAMP_RECOVERY_REMOTE_CYCLE_NOT_PRISTINE/)
  assert.match(source, /\.eq\('action_kind', 'mark_succeeded'\)/)
  assert.match(source, /MARK_TIMESTAMP_RECOVERY_REMOTE_RECEIPT_PRESENT/)
  assert.match(source, /delete state\.timestamps\.validation_completed_at/)
  assert.match(source, /delete state\.timestamps\.cycle_finished_at/)
  assert.ok(source.indexOf('reconcileUncommittedMarkTimestamps(admin, state, saveState, validationFloors, log)') < source.indexOf("stableTimestamp(state, saveState, 'validation_completed_at', validationFloors)"))
})

test('v1.28 bundled Supabase v4 audit contract reconciles already-demoted same-cycle rows and newly ended rows atomically', async () => {
  const fs = await import('node:fs/promises')
  const sql = await fs.readFile(new URL('../data/daily-operator-v1/audit/SUPABASE-APPLY-ENDED-DEALS-V4.sql', import.meta.url), 'utf8')
  assert.match(sql, /create or replace function public\.apply_psdeals_ended_deals_v4/)
  assert.match(sql, /p_expected_count > 5000/)
  assert.match(sql, /already_demoted_same_cycle/)
  assert.match(sql, /ended_discount_safe_demotion,cycle_id/)
  assert.match(sql, /PSDEALS_DEMOTION_V4_EXACT_SET_NOT_RECONCILABLE/)
  assert.match(sql, /ended_discounts_applied = p_expected_count/)
  assert.match(sql, /newly_demoted_rows/)
  assert.match(sql, /grant execute[\s\S]*to service_role/)
})


test('v1.29 monthly slug candidate lookup uses the existing btree as an indexed lexical range instead of LIKE prefix scans', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /function exclusiveSlugPrefixUpperBound\(prefix\)/)
  assert.match(source, /\.gte\('psdeals_slug', prefix\)\.lt\('psdeals_slug', upperBound\)/)
  assert.match(source, /\.order\('psdeals_slug', \{ ascending: true \}\)\.order\('psdeals_id', \{ ascending: true \}\)/)
  assert.doesNotMatch(source, /\.like\('psdeals_slug', `\$\{prefix\}%`\)/)
  assert.match(source, /MONTHLY_CANDIDATE_SLUG_RANGE_ESCAPE/)
})

test('v1.29 never performs the final monthly Stage candidate search outside the checkpointed monthly step', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const stepStart = source.indexOf("const monthlyStep = await step('verify_or_update_monthly_games'")
  const finalFetch = source.indexOf('const monthlyStageCandidates = await fetchMonthlyCandidates(admin, monthly, [])')
  const stepEnd = source.indexOf("const endedFinalRef = await step('reanalyze_ended_after_revalidation'", stepStart)
  assert.ok(stepStart > 0 && finalFetch > stepStart && stepEnd > finalFetch)
  assert.match(source, /\[REANUDAR MONTHLY\] resolución exacta recuperada del artefacto final ya committed; no se repite la búsqueda de candidatos Stage\./)
  assert.match(source, /MONTHLY_COMPLETED_RESOLUTION_ARTIFACT_MISSING/)
  assert.match(source, /MONTHLY_COMPLETED_RESOLUTION_SOURCE_MISMATCH/)
  assert.match(source, /MONTHLY_COMPLETED_RESOLUTION_INVALID/)
})

test('v1.29 persists the resolved monthly mapping so future resumes do not need to rediscover it', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /monthly_definition_hash: monthlyDefinitionHash\(monthly\)/)
  assert.match(source, /resolution: finalMonthlyResolution/)
  assert.match(source, /monthlyStep\?\.resolution\?\.resolved === true/)
  assert.match(source, /monthlyStep\?\.monthly_definition_hash === monthlyDefinitionHash\(monthly\)/)
})


test('v2 adopts a committed certification receipt before invoking certify v4', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /async function adoptCommittedCertificationRecovery\(admin, state, saveState, log\)/)
  assert.match(source, /\.eq\('action_kind', 'certify'\)/)
  assert.match(source, /\.eq\('status', 'committed'\)/)
  assert.match(source, /\.eq\('parent_receipt_id', state\.receipts\.mark_succeeded\)/)
  const stepStart = source.indexOf("const certification = await step('certify_cycle_v4'")
  const adopt = source.indexOf('adoptCommittedCertificationRecovery(admin, state, saveState, log)', stepStart)
  const rpcCall = source.indexOf("rpc('certify_price_refresh_cycle_v4'", stepStart)
  assert.ok(stepStart > 0 && adopt > stepStart && rpcCall > adopt)
  assert.match(source, /\[RECONCILIAR CERTIFY\]/)
})

test('v2.1 adopts a committed cache receipt before enqueueing the async v18 cache job', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /async function adoptCommittedCacheRecovery\(admin, state, saveState, log\)/)
  assert.match(source, /\.eq\('action_kind', 'cache_refresh'\)/)
  assert.match(source, /CACHE_RECOVERY_EXPIRED_DEALS_PRESENT/)
  const stepStart = source.indexOf("const cache = await step('refresh_public_cache_v18_async'")
  const adopt = source.indexOf('adoptCommittedCacheRecovery(admin, state, saveState, log)', stepStart)
  const enqueue = source.indexOf("rpc('enqueue_lobodeals_catalog_cache_refresh_v18'", stepStart)
  assert.ok(stepStart > 0 && adopt > stepStart && enqueue > adopt)
  assert.match(source, /get_lobodeals_catalog_cache_refresh_v18/)
  assert.match(source, /async_cache_job_id_v18/)
  assert.match(source, /\[RECONCILIAR CACHE\]/)
})

test('v1.31 final cache count follows the committed cache receipt contract instead of requiring every Stage row to be public', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /const expectedCacheCount = Number\(cache\?\.inserted_rows \|\| 0\)/)
  assert.match(source, /FINAL_CACHE_RECEIPT_COUNT_MISMATCH/)
  assert.match(source, /FINAL_CACHE_EXCEEDS_STAGE/)
  assert.match(source, /stage_rows_not_public_by_cache_contract: nonPublicStageCount/)
  assert.doesNotMatch(source, /assert\(stageCount === cacheCount/)
})

test('v1.31 audit bundle preserves the one-time SQL recovery that runs certification and cache outside the 8-second PostgREST statement budget', async () => {
  const fs = await import('node:fs/promises')
  const sql = await fs.readFile(new URL('../data/daily-operator-v1/audit/SUPABASE-RECOVER-CERTIFY-CACHE-V2.sql', import.meta.url), 'utf8')
  assert.match(sql, /set local statement_timeout = '0'/i)
  assert.match(sql, /certify_price_refresh_cycle_v3/)
  assert.match(sql, /refresh_catalog_public_cache_v15/)
  assert.match(sql, /3554db2d-25a5-4e8c-9f75-395b1677bd7a/)
  assert.match(sql, /7a4b9b06-4b51-45af-bc93-945d15d1cff0/)
  assert.match(sql, /expired_deals_still_marked_active/)
  assert.match(sql, /begin;/i)
  assert.match(sql, /raise exception/i)
})

test('v1.31 recovery helpers receive the run logger explicitly instead of closing over an undefined identifier', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /async function reconcileUncommittedMarkTimestamps\(admin, state, saveState, validationFloors, log\)[\s\S]*MARK_TIMESTAMP_RECOVERY_LOG_REQUIRED/)
  assert.match(source, /async function adoptCommittedCertificationRecovery\(admin, state, saveState, log\)[\s\S]*CERTIFY_RECOVERY_LOG_REQUIRED/)
  assert.match(source, /async function adoptCommittedCacheRecovery\(admin, state, saveState, log\)[\s\S]*CACHE_RECOVERY_LOG_REQUIRED/)
  assert.match(source, /reconcileUncommittedMarkTimestamps\(admin, state, saveState, validationFloors, log\)/)
  assert.match(source, /adoptCommittedCertificationRecovery\(admin, state, saveState, log\)/)
  assert.match(source, /adoptCommittedCacheRecovery\(admin, state, saveState, log\)/)
})

test('v1.31 success summary reports the reconciled ended set rather than only the first v3 partial demotion', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /Demociones seguras reconciliadas: \$\{demotionReconcileV126\.affected_rows\}/)
  assert.doesNotMatch(source, /Demociones seguras: \$\{demotion\.affected_rows\}/)
})



test('v2 preflight requires the installed database contracts before any live collection', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const preflightRpc = source.indexOf("admin.rpc('lobodeals_daily_runner_v2_preflight')")
  const recentStep = source.indexOf("collect_recently_added_incremental")
  assert.ok(preflightRpc > 0 && recentStep > preflightRpc)
  assert.match(source, /DAILY_RUNNER_V2_DB_CONTRACTS_MISSING/)
  assert.match(source, /certify_v4_present/)
  assert.match(source, /cache_v17_present/)
  assert.match(source, /listing_stamp_index_present/)
})

test('v2 database setup installs timeout-safe certify/cache contracts, listing stamp index, and Monthly NULL support', async () => {
  const fs = await import('node:fs/promises')
  const sql = await fs.readFile(new URL('../data/daily-operator-v1/audit/SUPABASE-DAILY-RUNNER-V2-CONTRACTS.sql', import.meta.url), 'utf8')
  assert.match(sql, /create index if not exists psdeals_stage_items_listing_stamp_v2_idx/)
  assert.match(sql, /create or replace function public\.certify_price_refresh_cycle_v4/)
  assert.match(sql, /create or replace function public\.refresh_catalog_public_cache_v17/)
  assert.match(sql, /lobodeals_daily_runner_v2_preflight/)
  assert.match(sql, /set_config\('statement_timeout', '0', true\)/)
  assert.match(sql, /monthly_null_price_rows_added/)
  assert.match(sql, /'none'/)
  assert.match(sql, /error_code::text/)
  assert.match(sql, /CERTIFY_V3_DEFINITION_DRIFT/)
  assert.match(sql, /CACHE_V16_DEFINITION_DRIFT/)
  assert.match(sql, /2309bdb5b0f6975157d302093ddff6ec/)
  assert.match(sql, /1333d179ef9ce55aa1e2413a70a06206/)
  assert.match(sql, /to service_role/)
})

test('v2 detail runtime promotes only mathematically consistent positive PS Plus bonus-only evidence', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(
    new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url),
    'utf8',
  )
  assert.match(source, /ps_plus_only_bonus_confirmed/)
  assert.match(source, /incoherent_regular_discount/)
  assert.match(source, /parsed_current_discount/)
  assert.match(source, /source_consistent/)
  assert.match(source, /psPlusOnlyExpectedPercent/)
  assert.match(source, /is_safe_for_price_update:\s*true/)
  assert.match(source, /is_regular_discount_eligible:\s*false/)
  assert.match(source, /current_ps_plus_price_amount/)
  assert.match(source, /19\.99/)
  assert.match(source, /17\.99/)
})

test('v2 initial execution plan is listing-first and never reopens the full ended population as Detail', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const planStart = source.indexOf("const executionPlanRef = await step('prepare_readonly_execution_plan'")
  const planEnd = source.indexOf("await step('create_remote_cycle'", planStart)
  const block = source.slice(planStart, planEnd)
  assert.match(block, /const requiredMustRefresh = selected\.mustRefresh\.filter/)
  assert.match(block, /needsFinalDeltaDetail\(row\.listing, row\.db, \{ nowMs: Date\.parse\(generatedAt\) \}\)/)
  assert.match(block, /listing_first_safe_must_refresh_skipped_from_detail/)
  assert.match(block, /ended_candidates_not_reopened_wholesale: endedCandidateIds\.length/)
  assert.doesNotMatch(block, /\.\.\.revalidationCandidates/)
  assert.doesNotMatch(block, /ENDED_REVALIDATION_QUEUE_INCOMPLETE/)
})

test('v2 reuses a still-fresh initial listing snapshot instead of performing a second full PSDeals scan', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /FINAL_FRESH_RECONCILE_MAX_AGE_MS = 2 \* 60 \* 60 \* 1000/)
  assert.match(source, /step\('decide_final_reconciliation_mode_v127'/)
  assert.match(source, /const finalFreshRequired = finalReconciliationDecision\.final_fresh_required/)
  const decisionStart = source.indexOf("step('decide_final_reconciliation_mode_v127'")
  const collectionStart = source.indexOf("step('collect_final_recently_added_incremental_v122'", decisionStart)
  const decisionBlock = source.slice(decisionStart, collectionStart)
  assert.match(decisionBlock, /buildFinalReconciliationDecision/)
  assert.doesNotMatch(decisionBlock, /Date\.now\(\)/)
  assert.match(source, /snapshot inicial aún fresco/)
  assert.match(source, /if \(!finalFreshRequired\) return \{ \.\.\.recentRef, reused_initial_snapshot: true \}/)
  assert.match(source, /if \(!finalFreshRequired\) return \{ \.\.\.discountsRef, reused_initial_snapshot: true \}/)
  assert.match(source, /if \(!finalFreshRequired\) return \{ \.\.\.discountArtifacts, reused_initial_snapshot: true \}/)
  assert.match(source, /if \(!finalFreshRequired\) return \{ \.\.\.listingEvidenceRef, reused_initial_snapshot: true \}/)
  assert.match(source, /const finalRecentMissing = finalFreshRequired \? \(finalRecent\.missing_items \|\| \[\]\) : \[\]/)
  assert.match(source, /const discountMissing = finalFreshRequired/)
  assert.match(source, /const exceptionDetails = finalFreshRequired/)
  const finalPlanStart = source.indexOf("prepare_final_discount_listing_upsert_plan_v118")
  const finalUpsertStart = source.indexOf("upsert_final_discount_listing_batches_v118", finalPlanStart)
  const finalDeferredStart = source.indexOf("prepare_final_deferred_discount_listing_after_details_v118", finalUpsertStart)
  const finalStampVerification = source.indexOf("verify_final_discount_listing_stage_stamp_v118", finalDeferredStart)
  const finalPlanBlock = source.slice(finalPlanStart, finalUpsertStart)
  assert.match(finalPlanBlock, /if \(!finalFreshRequired\)/)
  assert.match(finalPlanBlock, /row_count: 0/)
  assert.match(finalPlanBlock, /deferred_count: 0/)
  assert.ok(finalPlanStart > 0 && finalUpsertStart > finalPlanStart)
  assert.ok(finalDeferredStart > finalUpsertStart && finalStampVerification > finalDeferredStart)
})

test('resume preserves the durable reused-snapshot decision and Detail provenance after the threshold passes', () => {
  const originalDecision = buildFinalReconciliationDecision({
    initialListingObservedAt: '2026-08-16T18:00:17.784Z',
    decidedAt: '2026-08-16T18:04:43.780Z',
    maxAgeMs: 2 * 60 * 60 * 1000,
  })
  const checkpoint = {
    steps: {
      decide_final_reconciliation_mode_v127: { status: 'done', result: originalDecision },
      collect_final_discounts_complete_v118: {
        status: 'done',
        result: { reused_initial_snapshot: true, hash: 'a'.repeat(64) },
      },
    },
  }
  const detailRow = {
    psdeals_id: 2348719,
    public_offer_verification_source: 'strong_detail_revalidation',
    public_offer_input_artifact_sha256: 'b'.repeat(64),
  }

  const resumedAt = '2026-08-16T22:18:08.510Z'
  assert.ok(Date.parse(resumedAt) - Date.parse(originalDecision.initial_listing_observed_at) > originalDecision.max_age_ms)
  const resumedDecision = checkpoint.steps.decide_final_reconciliation_mode_v127.result
  const finalCollectionRef = checkpoint.steps.collect_final_discounts_complete_v118.result
  assert.equal(resumedDecision.final_fresh_required, false)
  assertFinalReconciliationReferenceMode(resumedDecision, finalCollectionRef, 'resume_reused_discounts')

  const plan = buildFinalDiscountListingUpsertPlan({
    finalFreshRequired: resumedDecision.final_fresh_required,
    listingObservedAt: resumedDecision.initial_listing_observed_at,
    listingHash: finalCollectionRef.hash,
    itemCount: 1800,
  })
  assert.deepEqual(plan.batches, [])
  assert.equal(plan.expected_affected, 0)
  assert.equal(detailRow.public_offer_verification_source, 'strong_detail_revalidation')
  assert.equal(detailRow.public_offer_input_artifact_sha256, 'b'.repeat(64))
})

test('a durable fresh decision requires a genuinely fresh final collection and keeps the full upsert flow', () => {
  const decision = buildFinalReconciliationDecision({
    initialListingObservedAt: '2026-08-16T12:00:00.000Z',
    decidedAt: '2026-08-16T15:00:00.000Z',
    maxAgeMs: 2 * 60 * 60 * 1000,
  })
  assert.equal(decision.final_fresh_required, true)
  assert.throws(
    () => assertFinalReconciliationReferenceMode(decision, { reused_initial_snapshot: true }, 'stale_done_checkpoint'),
    /FINAL_RECONCILIATION_REFERENCE_MODE_MISMATCH/,
  )
  assert.equal(
    assertFinalReconciliationReferenceMode(decision, { reused_initial_snapshot: false }, 'fresh_collection'),
    true,
  )

  const batches = [{ batch_index: 0, operation: 'update', rows: [{ psdeals_id: 1 }] }]
  const plan = buildFinalDiscountListingUpsertPlan({
    finalFreshRequired: decision.final_fresh_required,
    listingObservedAt: '2026-08-16T15:01:00.000Z',
    listingHash: 'c'.repeat(64),
    itemCount: 1,
    prepared: { prepared: 1, batches },
    recovery: { deferred_count: 0, deferred: [] },
    coverage: { expected_count: 1, prepared_count: 1 },
  })
  assert.equal(plan.reused_initial_snapshot, false)
  assert.strictEqual(plan.batches, batches)
})

test('reused final Discounts snapshot produces an explicit zero-write plan', async () => {
  const plan = buildFinalDiscountListingUpsertPlan({
    finalFreshRequired: false,
    listingObservedAt: '2026-08-16T12:00:00.000Z',
    listingHash: 'a'.repeat(64),
    itemCount: 1800,
  })
  assert.equal(plan.reused_initial_snapshot, true)
  assert.equal(plan.expected_affected, 0)
  assert.equal(plan.deferred_count, 0)
  assert.deepEqual(plan.deferred_items, [])
  assert.deepEqual(plan.batches, [])
  assert.equal(plan.coverage.expected_count, 1800)
  assert.equal(plan.coverage.verification, 'final_stage_stamp')

  let saves = 0
  const state = {}
  const result = await upsertListingBatches({
    admin: null,
    rpc: null,
    state,
    saveState: async () => { saves += 1 },
    prepared: plan,
    parentReceiptId: null,
    label: 'discounts-final-v118',
    inputHash: plan.listing_hash,
    log: () => {},
  })
  assert.deepEqual(result, { affected: 0, receipts: [] })
  assert.equal(saves, 0)
  assert.deepEqual(state, {})
})

test('fresh final Discounts snapshot preserves prepared batches and deferred recovery', () => {
  const batches = [{ batch_index: 0, operation: 'update', rows: [{ psdeals_id: 1 }, { psdeals_id: 2 }] }]
  const deferred = [{ psdeals_id: 3, item: { psdeals_id: 3 } }]
  const plan = buildFinalDiscountListingUpsertPlan({
    finalFreshRequired: true,
    listingObservedAt: '2026-08-16T15:00:00.000Z',
    listingHash: 'b'.repeat(64),
    itemCount: 3,
    prepared: { prepared: 2, batches },
    recovery: { deferred_count: 1, deferred },
    identityRepairCount: 1,
    coverage: { expected_count: 2, prepared_count: 2 },
  })
  assert.equal(plan.reused_initial_snapshot, false)
  assert.equal(plan.expected_affected, 2)
  assert.equal(plan.deferred_count, 1)
  assert.equal(plan.identity_repair_count, 1)
  assert.strictEqual(plan.batches, batches)
  assert.strictEqual(plan.deferred_items, deferred)
})

test('FASE 0 recovery evidence binds all 14 rows to the committed Detail input and exact HTML hashes', async () => {
  const crypto = await import('node:crypto')
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const { parsePage } = await import('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs')
  const { buildPsdealsDetailUpsertPayload } = await import('../scripts/lib/psdeals-stage-payload.mjs')
  const digest = (value) => crypto.createHash('sha256').update(value).digest('hex')
  const root = fileURLToPath(new URL('../', import.meta.url))
  const runRoot = path.join(root, 'data', 'cycles', 'local-cycle-daily-20260816-125225-52986b90')
  const chunkRoot = path.join(runRoot, 'state', 'detail-import', 'chunk-0000')
  const artifact = JSON.parse(await fs.readFile(
    path.join(root, 'sql', 'recovery', 'evidence', '009-lobodeals-3-fase0-detail-provenance-14.json'),
    'utf8',
  ))
  const inputBytes = await fs.readFile(path.join(chunkRoot, 'combined.txt'))
  const detailEvidenceBytes = await fs.readFile(path.join(chunkRoot, 'detail-import.json'))
  const runtimeBytes = await fs.readFile(path.join(root, artifact.detail_import.runtime_path))
  assert.equal(digest(inputBytes), artifact.detail_import.input_artifact_sha256)
  assert.equal(digest(detailEvidenceBytes), artifact.detail_import.evidence_artifact_sha256)
  assert.equal(digest(runtimeBytes), artifact.detail_import.runtime_sha256)
  assert.equal(artifact.tuple_count, 14)
  assert.equal(artifact.tuples.length, 14)
  assert.equal(new Set(artifact.tuples.map((row) => row.psdeals_id)).size, 14)
  assert.equal(artifact.timestamp_binding.public_offer_verified_at, 'psdeals_stage_items.detail_last_synced_at')

  const urlById = new Map(String(inputBytes).trim().split(/\r?\n/).map((url) => [Number(url.match(/\/game\/(\d+)/)?.[1]), url]))
  for (const expected of artifact.tuples) {
    const htmlPath = path.join(chunkRoot, 'html', expected.debug_html_file)
    const html = await fs.readFile(htmlPath, 'utf8')
    const evidenceSha = digest(Buffer.from(html, 'utf8'))
    assert.equal(evidenceSha, expected.public_offer_evidence_sha256, `HTML evidence mismatch for ${expected.psdeals_id}`)
    assert.equal(expected.public_offer_input_artifact_sha256, artifact.detail_import.input_artifact_sha256)
    assert.equal(expected.public_offer_verification_cycle_id, artifact.remote_cycle_id)
    assert.equal(expected.public_offer_verification_source, 'strong_detail_revalidation')
    assert.equal(expected.public_offer_verified_at_binding, 'detail_last_synced_at')

    const parsed = parsePage(html, urlById.get(expected.psdeals_id), { observedAt: '2000-01-01T00:00:00.000Z' })
    const payload = buildPsdealsDetailUpsertPayload(parsed, {
      isExisting: true,
      certificationContext: {
        remote_cycle_id: artifact.remote_cycle_id,
        evidence_sha256: evidenceSha,
        input_artifact_sha256: artifact.detail_import.input_artifact_sha256,
      },
      rawDetailMetadata: { debug_html_path: htmlPath },
    }).payload
    assert.equal(parsed.psdeals_id, expected.psdeals_id)
    assert.equal(payload.current_price_amount, expected.expected_current_price_amount)
    assert.equal(payload.original_price_amount, expected.expected_original_price_amount)
    assert.equal(payload.discount_percent, expected.expected_discount_percent)
    assert.equal(payload.public_offer_evidence_sha256, expected.public_offer_evidence_sha256)
    assert.equal(payload.public_offer_input_artifact_sha256, expected.public_offer_input_artifact_sha256)
  }

  const state = JSON.parse(await fs.readFile(path.join(runRoot, 'state', 'daily-operator-state-v1.json'), 'utf8'))
  const detailStep = state.steps.process_detail_queue_with_checkpoints
  const receiptCheckpoint = state.action_runtime[
    `detail-import:${artifact.local_cycle_id}:0:${artifact.detail_import.input_artifact_sha256}`
  ]
  assert.deepEqual(detailStep.result.receipts, [artifact.detail_import.receipt_id])
  assert.equal(receiptCheckpoint.receipt_id, artifact.detail_import.receipt_id)
  assert.equal(state.detail_chunks.runtime['0'].initial_receipt_committed, true)
  assert.equal(state.detail_chunks.runtime['0'].initial_attempt.evidence_hash, artifact.detail_import.evidence_artifact_sha256)
})

test('FASE 0 recovery SQL mutates only five public_offer fields on the exact Stage and Cache rows', async () => {
  const fs = await import('node:fs/promises')
  const sql = await fs.readFile(
    new URL('../sql/recovery/009-lobodeals-3-fase0-restore-14-detail-provenance-before-use.sql', import.meta.url),
    'utf8',
  )
  assert.equal((sql.match(/update public\.psdeals_stage_items stage/gi) || []).length, 1)
  assert.equal((sql.match(/update public\.catalog_public_cache cache/gi) || []).length, 1)
  assert.match(sql, /LOBODEALS_FASE0_RECOVERY_STAGE_UPDATE_NOT_14/)
  assert.match(sql, /LOBODEALS_FASE0_RECOVERY_CACHE_UPDATE_NOT_14/)
  assert.match(sql, /LOBODEALS_FASE0_RECOVERY_OTHER_STAGE_ROW_CHANGED/)
  assert.match(sql, /LOBODEALS_FASE0_RECOVERY_OTHER_CACHE_ROW_CHANGED/)
  assert.match(sql, /public_offer_verified_at=stage\.detail_last_synced_at/)
  assert.match(sql, /public_offer_verification_source='strong_detail_revalidation'/)
  assert.match(sql, /21d2ba0b-dfe0-45a3-abd7-39043d5e1608/)
  assert.match(sql, /a343aa6fd28d7e2aa12ddcc70b368a960004235b685d705385f2fc8986c3624e/)
  assert.match(sql, /listing_last_seen_at='2026-08-16T18:00:17\.784Z'/)
  assert.doesNotMatch(sql, /^\s*(?:current_price_amount|original_price_amount|discount_percent|has_deal|has_ps_plus_deal|has_verified_deal|has_verified_ps_plus_deal|is_ps_plus_monthly_game|best_price_amount|lobodeals_lowest_[a-z0-9_]+)\s*=/gmi)
  const postchecks = sql.slice(sql.lastIndexOf('commit;') + 'commit;'.length)
  assert.doesNotMatch(postchecks, /^\s*(?:update|insert|delete|merge|truncate|alter|create|drop)\b/gmi)
})

 test('v2.1 async cache SQL uses pg_cron and keeps the long v17 rebuild out of the PostgREST request', async () => {
  const fs = await import('node:fs/promises')
  const sql = await fs.readFile(new URL('../data/daily-operator-v1/audit/SUPABASE-DAILY-RUNNER-V2.1-RECOVERY-AND-ASYNC-CACHE.sql', import.meta.url), 'utf8')
  assert.match(sql, /create extension if not exists pg_cron/)
  assert.match(sql, /cron\.schedule\(v_job_name,'5 seconds',v_command\)/)
  assert.match(sql, /run_lobodeals_catalog_cache_refresh_v18/)
  assert.match(sql, /refresh_catalog_public_cache_v17/)
  assert.match(sql, /cron\.unschedule\(job\.cron_job_name\)/)
  assert.match(sql, /grant execute on function public\.enqueue_lobodeals_catalog_cache_refresh_v18/)
  assert.match(sql, /grant execute on function public\.get_lobodeals_catalog_cache_refresh_v18/)
})

test('v2.1 runtime blocks zero-price 100% Detail evidence from mutating commercial Stage state', async () => {
  const fs = await import('node:fs/promises')
  const runtime = await fs.readFile(new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url), 'utf8')
  assert.match(runtime, /zeroPriceFullDiscountBlocked/)
  assert.match(runtime, /zero_price_full_discount_commercial_write_blocked_v21/)
  assert.match(runtime, /classification: 'extreme_full_discount'/)
  assert.match(runtime, /is_safe_for_price_update: false/)
  assert.match(runtime, /RUNTIME_IMPORTER_ZERO_PRICE_FULL_DISCOUNT_GUARD_FAILED/)
})

test('v2.1 runtime repairs only weak existing classifications with explicit can_replace_existing evidence', async () => {
  const fs = await import('node:fs/promises')
  const runtime = await fs.readFile(new URL('../data/daily-operator-v1/runtime/import-psdeals-detail-local-v2.0.mjs', import.meta.url), 'utf8')
  assert.match(runtime, /applyExistingWeakClassificationOverride/)
  assert.match(runtime, /type\?\.can_replace_existing !== true/)
  assert.match(runtime, /existingContentType === 'other'/)
  assert.match(runtime, /'bundle:bundle'/)
  assert.match(runtime, /'dlc:addon'/)
  assert.match(runtime, /detail_repaired_weak_listing_classification_v21/)
})

test('v2.1 postchecks block Monthly 0-100 commercial leakage and weak mapped classifications', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /FINAL_MONTHLY_ZERO_PRICE_COMMERCIAL_LEAK/)
  assert.match(source, /FINAL_WEAK_MAPPED_CLASSIFICATION_REMAINS/)
  assert.match(source, /monthly_zero_price_commercial_leaks/)
  assert.match(source, /weak_mapped_classification_rows/)
})

test('Monthly allows an independent coherent sale but rejects FREE entitlement contamination', () => {
  const independentRegularSale = classifyMonthlyCommercialContamination({
    current_price_amount: 9.99,
    original_price_amount: 19.99,
    discount_percent: 50,
    ps_plus_price_amount: null,
    has_deal: true,
    has_verified_deal: true,
    has_ps_plus_deal: false,
    has_verified_ps_plus_deal: false,
  })
  assert.equal(independentRegularSale.contaminated, false)
  assert.equal(independentRegularSale.has_regular_commercial_deal, true)

  const freeEntitlementLeak = classifyMonthlyCommercialContamination({
    current_price_amount: 0,
    original_price_amount: 19.99,
    discount_percent: 100,
    ps_plus_price_amount: 0,
    has_deal: true,
    has_verified_deal: true,
    has_ps_plus_deal: true,
    has_verified_ps_plus_deal: true,
  })
  assert.equal(freeEntitlementLeak.contaminated, true)
  assert.deepEqual(freeEntitlementLeak.reasons, [
    'monthly_regular_flag_without_coherent_positive_discount',
    'monthly_ps_plus_flag_without_coherent_positive_discount',
  ])
})

test('v2.1 core allowlist permits only the async cache enqueue write, not direct legacy cache v15', async () => {
  assert.equal(assertAllowedWriteRpc('enqueue_lobodeals_catalog_cache_refresh_v18'), true)
  assert.throws(() => assertAllowedWriteRpc('refresh_catalog_public_cache_v15'), /WRITE_RPC_FORBIDDEN|LEGACY_RPC_FORBIDDEN/)
})


test('v2.4 proves the verified-offer cache contract before enqueueing async cache', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /lobodeals_daily_runner_v24_preflight/)
  assert.match(source, /CACHE_V24_PREFLIGHT_CONTRACT_INVALID/)
  assert.match(source, /CACHE_V24_REFRESH_V19_MISSING/)
  assert.match(source, /verified_offer_columns_present === true/)
  assert.match(source, /monthly_regular_columns_present === true/)
})

test('v2.2 preserves a failed async cache job and retries CACHE_V17_42883 with a new idempotency key', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  assert.match(source, /ASYNC_CACHE_MAX_ATTEMPTS = 3/)
  assert.match(source, /ASYNC_CACHE_RETRYABLE_ERROR_CODES = new Set\(\['CACHE_V17_42883'\]\)/)
  assert.match(source, /`cache-v19:\$\{runId\}:retry-\$\{attempt\}`/)
  assert.match(source, /state\.async_cache_attempt_v18 = attempt/)
  assert.match(source, /state\.async_cache_job_id_v18 = null/)
  assert.match(source, /Se preserva el job\/receipt fallido y se reintenta con un idempotency key nuevo/)
})


test('v2.2 audit SQL qualifies public.unaccent and preserves the failed cache evidence', async () => {
  const fs = await import('node:fs/promises')
  const sql = await fs.readFile(new URL('../data/daily-operator-v1/audit/SUPABASE-DAILY-RUNNER-V2.2-CACHE-SEARCHPATH-FIX.sql', import.meta.url), 'utf8')
  assert.match(sql, /public\.unaccent\(/)
  assert.match(sql, /set search_path to ''/i)
  assert.match(sql, /b76f201f-a686-4293-99e4-517031c5b216/)
  assert.match(sql, /3985f31d-67f1-49cf-9ab8-b24d3aee5f0d/)
  assert.match(sql, /lobodeals_daily_runner_v22_preflight/)
  assert.doesNotMatch(sql, /delete\s+from\s+public\.lobodeals_async_cache_jobs/i)
  assert.doesNotMatch(sql, /delete\s+from\s+public\.psdeals_cycle_action_receipts/i)
})


test('v2.2e scopes the Discounts resume head guard inside collectDiscountsComplete before any stale page retry', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const recentStart = source.indexOf('async function collectRecentIncremental')
  const discountsStart = source.indexOf('async function collectDiscountsComplete')
  const discountsEnd = source.indexOf('async function ', discountsStart + 1)
  const recentBlock = source.slice(recentStart, discountsStart)
  const discountsBlock = source.slice(discountsStart, discountsEnd > discountsStart ? discountsEnd : source.length)
  const helperPos = discountsBlock.indexOf('const collectFreshHeadForResume = async')
  const resumeGuardPos = discountsBlock.indexOf("collectFreshHeadForResume('run reanudado con Discounts incompleto')")
  const pageLoopPos = discountsBlock.indexOf('while (!checkpoint.completed)')
  assert.doesNotMatch(recentBlock, /collectFreshHeadForResume/)
  assert.ok(helperPos > 0, 'discount resume helper must exist inside collectDiscountsComplete')
  assert.ok(resumeGuardPos > helperPos, 'resume guard must call the helper after it is defined')
  assert.ok(pageLoopPos > resumeGuardPos, 'fresh page-1 guard must run before attempting checkpoint.next_page')
  assert.match(discountsBlock, /total_results_changed_while_run_paused|classifyDiscountResumeSnapshot/)
})

test('v2.2f moves both exact-set ended demotions outside PostgREST through pg_cron', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../scripts/lobodeals-daily-operator-v1.mjs', import.meta.url), 'utf8')
  const sql = await fs.readFile(new URL('../data/daily-operator-v1/audit/SUPABASE-DAILY-RUNNER-V2.2F-ASYNC-ENDED.sql', import.meta.url), 'utf8')
  assert.match(source, /async function runAsyncEndedDemotionV5/)
  assert.match(source, /lobodeals_daily_runner_v23_preflight/)
  assert.match(source, /enqueue_lobodeals_ended_demotion_v5/)
  assert.match(source, /get_lobodeals_ended_demotion_v5/)
  assert.match(source, /async_demotion_initial_job_v5/)
  assert.match(source, /async_demotion_reconcile_job_v5/)
  assert.match(sql, /create table if not exists public\.lobodeals_async_demotion_jobs/)
  assert.match(sql, /create or replace function public\.run_lobodeals_ended_demotion_v5/)
  assert.match(sql, /public\.apply_psdeals_ended_deals_v4/)
  assert.match(sql, /pg_catalog\.set_config\('statement_timeout','0',true\)/)
  assert.match(sql, /cron\.schedule/)
  assert.match(sql, /create or replace function public\.lobodeals_daily_runner_v23_preflight/)
})
