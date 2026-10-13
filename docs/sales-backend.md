# Sales backend operations

This document describes the implemented Sales boundary. It is operational
documentation, not a replacement for the Product Authority.

## Objects and write boundary

- `public.sales_campaigns` stores official US sale campaigns. Calendar dates
  use `starts_on` / `ends_on`; exact timezone-bearing instants use
  `starts_at` / `ends_at`. Nullable `artwork_url` stores only safe HTTPS
  artwork discovered from metadata on a campaign-specific official page.
- `public.sales_source_health` has one internal row for each canonical store.
- `public.campaign_monitor_token_verifier()` exposes only the one-way invocation
  verifier to `service_role`.
- Epic snapshot RPCs `reserve_epic_public_scan()`, `finalize_epic_public_scan(...)`
  and `apply_epic_scan_artwork(...)` are restricted to `service_role` and write
  only the same two Sales tables. `read_sales_public_snapshot()` is the public
  read RPC, executable by `anon`, `authenticated` and `service_role`.
- `campaign-monitoring` is the only monitoring Edge Function. Its ten adapters
  run independently and can write only the two tables above.
- The frontend uses `read_sales_public_snapshot()` to read US live/upcoming
  rows and the Epic generation pointer consistently, then applies Epic public
  membership filtering in `lib/sales-source.ts`. It has no Supabase SDK.
  Existing table RLS remains in place. Its public availability request is
  a `GET` to the same Edge Function and returns only `store_slug` plus
  `availability` (`available` or `temporarily_unavailable`).
- `sales_source_health` remains private. Its RLS has no public read policy, and
  the public availability response never includes error codes, messages,
  timestamps, counters, or source URLs. The snapshot RPC exposes only the Epic
  membership pointer from health, not the health row or reservation counter.

The function defaults to `probe`, which reads current Sales rows for
verification but performs no writes. `persist` upserts campaigns confirmed by
successful adapters and records health. A failed adapter can update only its
health row; it never changes a campaign. Epic persist reserves a generation
before discovery; a failed scan may consume that counter without changing the
published pointer. Successful Epic publication is atomic and rejects stale
reservations; artwork writes are guarded by the published generation.

## Visibility and operational closure — Johan decision, 12 October 2026 (local proposal)

This later Product decision refines the incident findings below. A missing
campaign still has no proven official END. A verified absence on its relevant
official surface now authorizes immediate public hiding and, after 72 hours plus
a fresh valid absence check, operational closure. No official date is inferred.
Upcoming and campaigns with official end boundaries keep their existing rules.

Resumed baseline: HEAD `0d42b39130b14e653ba976eef83999bf0c0a012a`, empty staging,
12 modified tracked files and three untracked files. Seven tracked edits belong
to Johan's protected prior work (About, EN/ES messages, monetization, next-env,
bilingual-interactions and phase-8 tests); their SHA-256 hashes match the incident
baseline. The prior PlayStation name correction, diagnostics, tests and incident
documentation remain. The interrupted visibility work comprised changes to
types, PlayStation, the monitor, and two new files (shared contract and migration).
No unrelated code or production change was found during recovery.

### Shared state and atomic publication

The additive migration `20261012185056_sales_operational_visibility.sql` proposes
two nullable campaign fields: `absence_started_at` and `operational_closed_at`.
The existing `state` remains the last official lifecycle state; a non-null
operational closure is a separate internal state, never an official end.
Both fields default to NULL. There is no backfill from `last_confirmed_at`.
First verified absence starts the clock and hides the row; later inconclusive
or failed checks neither reset it nor close the campaign. Only another verified
absence at least 72 hours later sets `operational_closed_at`. Fresh presence
upserts the same campaign key, clears both fields, and preserves `first_seen_at`.
Official END clears operational metadata and uses the existing lifecycle state.

Two nullable source-health generation fields and two service-role-only RPCs
reserve a scan and atomically publish campaign rows, official ENDs, visibility
observations and the generation pointer. They reuse the existing two tables and
the Epic reservation/publication pattern; there is no new table, scheduler,
queue or service. Locks are held only within short database transactions, never
during source HTTP. Same-generation retry is a no-op; stale generations and
changed baselines cannot overwrite a newer result. A conflict requires a fresh
reservation and source fetch, not retrying old evidence against a new baseline.
Currently only PlayStation uses this publication path; other stores retain
their existing writers until an absence contract is approved and tested.

The adapter's explicit `absenceChecks` contain identity, verified source URL,
contract identifier and `absent` / `inconclusive`. The shared validator rejects
unknown identities, duplicate checks, mismatched store/surface contracts and
contradictory presence. No subtraction of a `partial` result enables absence.
Authenticated monitor results include checks and separate hidden/operationally
closed counters. Public availability remains coarse health only.

The existing public snapshot function and table RLS exclude both observation
and operationally closed rows. This covers the shared EN/ES feed without UI,
language, SEO or analytics changes. The clock is not calculated in the browser.
Bootstrap rows remain visible until a demonstrable new absence observation.

### Adapter enablement and blockers

| Store | New 72-hour rule | Relevant finding / prerequisite |
| --- | --- | --- |
| PlayStation Store | Enabled locally for known US category identities sourced from Deals/Latest | Requires intact typed EMS trees, DEALSTOP and Latest HERO surfaces, and no category link or confirmed presence in either. Unknown nodes, missing links and missing surfaces are inconclusive. Names unresolved on a linked category never prove absence. Blog-only identities are excluded. |
| Nintendo eShop | Blocked | Tabs, News and known landing checks are separate partial sources; settled failures/identity reconciliation do not establish a complete relevant absence check. |
| Xbox Store | Blocked | Embedded Campsite metadata extraction can skip malformed entries; the existing successful array does not certify a complete surface. |
| Steam | Blocked | Partner schedule, Home, News and known sale pages have different scopes; no per-campaign negative-check contract. Official boundaries remain in force. |
| Epic Games Store | Blocked for new operational closure | Successful-snapshot public membership stays intact. Candidate/landing fallbacks and omitted unresolved modules are not a new valid absence contract. Existing Epic generations, atomic finalizer and frontend membership filter are unchanged. |
| GOG | Blocked | Home, current tabs, RSS and campaign landing failures are isolated; rejected/unresolved identities must be surfaced before a safe per-campaign negative contract can be added. |
| EA app | Blocked | Positive filtered links and campaign-page END checks do not certify exhaustive current confirmation on the relevant surface. |
| Ubisoft Store | Blocked | Positive anchor filtering lacks a verified complete-surface contract, despite explicit fetch failures. |
| Battle.net | Blocked | The discovery feed and article checks are partial; absence from a feed window cannot establish campaign absence. |
| Rockstar Store | Blocked | Tagged Newswire discovery and article parsing are partial; no complete relevant-surface absence attestation. |

Blocked means **no new hiding or 72-hour closure**, not disabled monitoring. All
ten adapters remain scheduled and may confirm campaigns or establish official
lifecycle facts under their prior rules. Enabling another store requires its
explicit contract and tests plus coordinated allowlist changes in TS and SQL.
Epic's already-approved public membership remains independent of this rule.

For PlayStation, residual discounts in an old collection do not override a
verified absence from campaign promotion surfaces. The commercial verifier and
its diagnostics are preserved as a separate END check. Unknown commercial
evidence is never reinterpreted as absence; the EMS check must independently
satisfy its stricter contract. The $20 guarded name correction is unchanged.

### Local verification and publication gate

The standalone local-only runner `tests/operational-visibility-postgres.mjs`
uses synthetic data on loopback PostgreSQL, independent of application secrets.
It tests the actual migration, RLS, public snapshot, service-role permissions,
72-hour transitions, no retroactive closure, reactivation, atomic rollback,
idempotency, concurrency with two connections, isolation and Epic compatibility.
Run it with `LOBO_QA_PG_MODULE` pointing to an external `pg` installation and
a disposable PostgreSQL instance on `127.0.0.1:55439`; it creates a unique QA
database and never targets the application database. Standard unit/regression
tests remain runnable through `npm test` without PostgreSQL dependencies.

Completed local validation on 12 October: `npm test` 517/517 PASS; real local
PostgreSQL migration/RLS/concurrency tests 15/15 PASS; lint, full Edge import-graph
TypeScript check and `git diff --check` PASS. A separate source copy completed
the Next.js production build and its TypeScript check (35/35 static pages),
without editing the protected repository `next-env.d.ts`.

A read-only local adapter run against official sources at
`2026-10-12T20:46:35.711Z` confirmed Player's Choice and Games Under $20, and
independently verified promotional-surface absence for Autumn Adventures and
Games Under $15. Both old collections still returned active product discounts;
there was no official END and no official end date was synthesized. This check
did not persist anything and must not backdate a future absence observation.

No migration or new function has been applied remotely. The 13 October final
gate compared production's recorded `20261007223743` (`epic_public_snapshot`)
SQL with the local file: identical except an extra final line ending remotely.
The local file is now `20261007223743_epic_public_snapshot.sql`, with its bytes
unchanged; all test references use the aligned identifier. Normalized SQL SHA-256:
`cb0eb4cc7a661bcff4d92a841c0f37a737b4144c3aa5e183c99330e9983ebeb2`.
Do not rerun Epic or repair remote history. Review and publish only the new
visibility migration; do not blindly push all migrations.
After separate approval: apply only the reviewed additive migration, publish
the Edge Function with its new adapter version and preserved settings, perform
an authorized read-only probe, then observe normal scheduled persistence. Verify
that the first qualifying absence starts then (not October 7), current $20 and
Player's Choice remain public, historical identities remain stored, and only
a later valid check at/after 72 hours can close operationally. Validate both
public languages, other-store isolation and Epic membership. No scheduler or
manual data cleanup is included. A rollback must account for already-hidden
rows; redeploying old code alone is not a complete visibility rollback plan.

### Final gate and tested recovery — 13 October 2026

Read-only inspection found published Edge revision 37, adapter version 18,
`verify_jwt=false`. All 27 published files match commit
`0d42b39130b14e653ba976eef83999bf0c0a012a` after line-ending normalization.
That immutable commit is the verified recovery source. The local monitor now
uses `ADAPTER_VERSION = '19'` for the visibility protocol; internal health
version assertions are updated, without changing unrelated public contracts.

Recovery is a separately authorized operation, never an automatic migration:

1. Inventory campaign absence/closure fields, official states/dates, Epic rows,
   pointer/counter, function definitions, grants and RLS before acting. Decide
   whether restoring all prior public visibility is warranted; it can expose
   stale campaigns. Obtain explicit approval for the chosen recovery steps.
2. Establish a quiet window between scheduled cycles, verify no monitor request
   remains in flight and enough time remains before the next cycle. If this
   cannot be guaranteed, stop; do not race publication or change the scheduler
   implicitly. Prepare the verified 27-file adapter-18 artifact in a separate
   directory from the immutable commit, without resetting the working tree.
3. Execute `docs/sales-visibility-rollback-compatibility.sql` in that window.
   It atomically fences the two version-19 RPCs and removes only the absence
   scope CHECK that would reject version-18 official END/Upcoming/date updates.
   It preserves all columns, values, history, closure-order constraint, RLS,
   public hiding, Epic functions and generation state. Lock/statement timeouts
   fail the transaction instead of allowing a partial change.
4. Restore the verified adapter-18 Edge artifact with `verify_jwt=false`, the
   same entrypoint and all 27 files. Verify source equivalence/settings. A new
   deployment revision number is expected; its internal adapter version is 18.
   Only after separate authorization, probe and observe normal persistence.
5. If the approved recovery requires prior visibility, execute
   `docs/sales-visibility-rollback-projection.sql`. It atomically restores the
   prior public RPC projection and RLS predicate for ALL US Live/Upcoming rows.
   Official Ended rows remain excluded; no stored state, dates or operational
   history is cleared. Epic pointer and row membership metadata are returned
   unchanged, so the existing frontend membership filter remains authoritative.
   Without this optional step, hidden rows stay hidden; adapter 18 cannot reset
   visibility metadata, so that is a temporary containment state, not completed
   visibility recovery.
6. Verify anon/authenticated reads through both table and RPC, denied campaign
   writes/health reads/new visibility RPCs, service-role legacy writes, active
   RLS and Epic reserve/finalize permissions. Compare historical fields and Epic
   membership with the inventory; validate EN/ES feeds and the next normal cycle.

Both SQL artifacts are outside the migration directory and perform no campaign
or health DML. The local integration test executes each twice, verifies no data
changes, exercises legacy END/date writes with retained metadata, checks public
visibility and permissions, and confirms Epic can still publish. Never replay
the additive migration to roll forward after this recovery: first review any
legacy state/metadata combinations, agree reconciliation without losing history,
then prepare a separately reviewed compatibility change and re-enable version 19.

Final-gate validation: 517/517 regression tests, 16/16 real local PostgreSQL
tests (including recovery), lint, full Edge TypeScript check and repository
`git diff --check` passed. The seven protected files retain their pre-gate
SHA-256 hashes. No remote migration, repair, deployment or data write occurred.

## PlayStation incident review — 12 October 2026 (historical local diagnosis)

Authority: the approved Product/Technical/Bilingual authorities and Johan's
12 October incident instruction. The October 3/4 known-collection verifier and
artwork-name exception are retained from commit `700572a`; they are not new
discovery or product-tracking authorities. Baseline HEAD is
`0d42b39130b14e653ba976eef83999bf0c0a012a`. Seven pre-existing local edits,
including `next-env.d.ts`, are protected separately from this patch.

Read-only production evidence: request 337 at 16:00 UTC returned one
PlayStation detection, zero ENDs and `ok=true`; health finished at
`2026-10-12T16:00:52.841Z`, adapter 18. Request 336 at 12:00 UTC also detected
only Player's Choice. Neither response retained raw EMS candidates or secondary
commercial results, so they cannot establish when Games Under $20 first appeared
or which commercial-verifier outcome production obtained. Request 337 also
reported an independent GOG discovery failure; this patch does not repair GOG.

All four identities below use the official US category URL
`https://store.playstation.com/en-us/category/{categoryId}/1`:

| Campaign | categoryId | Evidence and lifecycle decision |
| --- | --- | --- |
| Player's Choice | `52e149ff-ec0d-4492-8fd9-a7df289f0ec9` | Current Deals banner and Latest hero; structured public name. Keep Live from current official source. |
| Games Under $20 | `3e5a4aeb-33af-442a-ab10-61d946d3b33c` | Current Deals campaign banner linked to this category; default view reports `AM_GAMES_UNDER_20`, but public text is only `Deals`. Confirmed omission reproduced locally. |
| Autumn Adventures | `56f636cb-c476-40b8-9ffd-b17f3f5cf5ad` | Not in current campaign navigation; last persisted confirmation October 7. Local existing verifier returned `ACTIVE_DISCOUNT_FOUND` after 111 pages / 2656 inspected entries. END remains PENDING. |
| Games Under $15 | `5931f998-d583-4643-85e0-e890480fcff9` | Distinct from $20, not in current campaign navigation; last persisted confirmation October 7. Local existing verifier returned `ACTIVE_DISCOUNT_FOUND` after 92 pages / 2199 inspected entries. END remains PENDING. |

These counts are bounded verifier work, not public campaign product counts.
An active discount in an old collection vetoes the approved zero-discount END
test; it does not establish that the original campaign is still running. Neither
old row has stored end boundaries. Partial reconciliation therefore preserves
both, and the public snapshot projects their stored Live state without a TTL.
Do not label them authoritatively ended or currently reconfirmed.

Official visual evidence inspected directly:

- [Games Under $20 banner](https://image.api.playstation.com/pr/bam-art/234/820/b9eb2ddd-0fda-42b0-accf-f74fb1d9d4f9.png).
- [Player's Choice banner](https://image.api.playstation.com/pr/bam-art/235/182/c7989de6-7cee-4605-b017-d1849f986c23.png).

Both say `ENDS 10/21`; neither supplies a year or exact instant. EMS public text
and the examined category HTML do not supply that boundary. No OCR service,
current-year inference or fixed date override is added. Full date persistence
remains PENDING additional edition-specific evidence. The Blog article
`/2025/10/07/players-choice-promotion-comes-to-playstation-store-oct-8/` belongs
to 2025 and cannot date the 2026 edition. Official Blog searches for Autumn
Adventures and Games Under yielded no matching current edition in the examined
results. Absence of search results is not END evidence.

Local refinements:

- Games Under $20 name transcription requires a current independently discovered
  category, its exact default-view reporting name and the exact inspected banner
  URL. Structured public names take precedence. A changed banner fails closed
  with an unresolved-identity diagnostic; this is not general OCR or a generated
  campaign registry. The existing $15 exception is unchanged.
- Optional internal run `diagnostics` expose unresolved current identities,
  complementary Blog failures and known-collection outcomes. UNKNOWN includes
  bounded reason codes (HTTP/timeout, redirect, malformed contract, changing or
  incomplete collection, ambiguous price, deadline). No raw source exception,
  individual product, price, token or new persistence field is emitted.
- `healthy` still measures required-source/run success, not total campaign
  integrity. Diagnostics are returned by the authenticated run response only;
  the public availability GET and health schema stay unchanged. The existing
  shared 60-second verification budget remains bounded and may leave later
  collections UNKNOWN; no deadline result is END evidence.

Integrated local source verification completed at `2026-10-12T18:11:17.307Z`
in 58.376 seconds: Player's Choice and Games Under $20 detected, no ENDs, both
old collections reported `ACTIVE_DISCOUNT_FOUND` with the counts above. This
executed only local adapter code and official-source GETs, not the deployed
Edge Function. It is current evidence, not a reconstruction of request 337.

Validation: 30 focused PlayStation tests, one monitor diagnostics integration
test and the complete 512-test suite passed. ESLint and the standalone adapter
TypeScript check passed; `git diff --check` was clean. The standard Turbopack
production build passed in an isolated same-drive QA copy with only its
`turbopack.root` adjusted to include the linked dependencies. Initial cross-drive
temporary-copy builds failed dependency resolution (Turbopack and Webpack), not
application compilation. Main-repository `next-env.d.ts` and the six other
protected files retained their exact baseline SHA-256 hashes; staging is empty.

KEEP US-first discovery, partial coverage, reconciliation and temporal precision.
REFINE guarded name recognition and internal observability. REPLACE neither the
backend nor the public projection. The old campaigns' commercial END and the
pixel-only dates remain unresolved; no remote repair is authorized here.

Publication requires separate approval: review only this patch, assign its next
adapter version, publish the Edge Function with existing settings preserved,
then validate two current discoveries and explicit secondary outcomes against
fresh official evidence. Observe the normal all-ten-store scheduled persist;
confirm no false END, no $15/$20 identity merger, other-store isolation and EN/ES
public projection. If all four rows remain public, record the unresolved old
campaigns rather than inventing cleanup authority. No manual persisted run,
scheduler change, migration, remote write or publication occurred in this audit.

## Lifecycle and coverage contract

Discovery and verification are separate. Every current adapter declares
`partial` coverage. Disappearance from a partial discovery surface is not END
evidence. Epic tag-only public membership is separately governed by its last
successfully published snapshot: absence can hide a card without ending its
commercial lifecycle. Failed Epic scans preserve the published membership.

A campaign can become `ended` only when one of these facts exists:

1. its official exact `ends_at` instant has passed during a successful source
   run;
2. it has no exact end, its `ends_on` calendar date has passed in every civil
   timezone (UTC-12 through UTC+14), and successful reconciliation has no fresh
   Live/Upcoming evidence for that identity;
3. its campaign-specific official page (not a shared discovery page) explicitly
   states that the campaign ended; or
4. an adapter explicitly declares `authoritative-complete-current-set` and the
   campaign is absent from that successful complete snapshot.

No current adapter uses the fourth option. Reconciliation checks explicit END
first, preserves fresh Live/Upcoming evidence next, then applies stored end
boundaries. Date-only comparison never invents an instant or converts a calendar
date into `ends_at`; adapters may use conservative calendar comparisons without
claiming exact-time lifecycle. Failed source runs do not retire campaigns;
failed verification supplies no new END evidence.

## Official source map

| Store | Official surfaces | Current contract |
| --- | --- | --- |
| PlayStation Store | US Store Deals/Latest, official EMS GraphQL surfaces, and US PlayStation Blog | Recognized Store campaign structures are required; Blog complements campaign evidence. Source failures remain explicit. |
| Nintendo eShop | US `nintendo.com/us/store/sales-and-deals/` plus `nintendo.com/us/whatsnew/` | Campaign tabs/pages are discovered without reading embedded product data. Promotion news is complementary. |
| Xbox Store | US `xbox.com/en-US/promotions/sales/sales-and-specials` | Only embedded `CampsiteChannel.Games.Sale` campaign metadata is accepted. The hub is partial; product, hardware, and Game Pass sections are ignored. |
| Steam | Steamworks upcoming-events calendar, US `store.steampowered.com` campaign surfaces, and official Steam News for app 593110 | Steamworks provides seasonal identity and date-only Upcoming campaigns. Store sale pages or matching official News confirm Live. A validated seasonal Store landing may supply the canonical parent's CTA and artwork. Product specials are not traversed. |
| Epic Games Store | US Sales & Specials and official Store GraphQL | Campaign-level official evidence supplies identity/presentation. Tag-only campaigns use atomic public snapshot membership, distinct from commercial END. Production snapshot membership is implemented; health is read from current diagnostics rather than assumed blocked. |
| GOG | US `gog.com/en/now_on_sale` promotion tabs, Home, News RSS and linked official campaign pages | Structured tabs supply campaign identity; Home/News add partial discovery. The `/promo/` routing segment alone is not Sale evidence. |
| EA app | `ea.com/sales/deals` plus official EA News | Qualifying official campaign links and their commercial evidence are evaluated; individual product discounts are not campaigns. |
| Ubisoft Store | US `store.ubisoft.com/us/deals` and linked campaign pages | All qualifying campaign links are evaluated; there is no item-count slice. The hub is partial. |
| Battle.net | US Blizzard `contentItems` feed with pagination and official articles | Discovery follows up to 20 feed pages, never truncates qualifying candidates, and verifies known campaign pages separately. Only Battle.net Shop campaign articles with an official exact end instant are published from this historical feed. |
| Rockstar Store | Newswire Sales tag 661 and official Newswire GraphQL | Recognizable Sales history and tag identity are required. Only qualifying Store campaigns are published; source-contract loss remains an explicit failure. |

No adapter uses a comparator, aggregator, price tracker, silent third party,
product catalog crawl, or manual campaign registry. Product counts are not
stored.

Health is transient. The 8 October 2026 read-only review recorded Steam and Epic
healthy on adapter v16 (Edge revision 35); this is dated evidence, not a promise
that a source will remain available.

### GOG candidate isolation

Local diagnostic runtime v18 refines GOG candidate admission and isolation;
publication requires its separate deployment gate. Promotion tabs retain their
structured identity authority. Home and News links require commercial vocabulary
in the label, related article context, or campaign slug independently of the
`/promo/` routing segment. Individual launch discounts do not manufacture a Sale.

An auxiliary candidate with insufficient identity or an incompatible redirect is
omitted without discarding independently verified campaigns. Expected HTTP,
timeout and network failures are isolated only at individual News article and
campaign-landing fetch boundaries, including structured-tab landings. A failed
landing does not manufacture a campaign from its tab: only successfully verified
peers survive, with the existing `partial` coverage. Failed landing identities
and known campaigns tied to failed News articles are excluded from secondary
enrichment/retirement in that scan. Failure/rejection is not END evidence.
Locale redirects must preserve normalized official identity.

News evidence uses the final resolved article URL. An external destination or
an incompatible GOG article/path is rejected before reading identity, timing or
artwork from its body; the original RSS URL cannot legitimize that content.
Equivalent GOG host and locale redirects remain valid. Rejected articles use
the same unresolved-coverage and secondary-verification protections as failed
articles.

The shared HTTP wrapper retains its original exception as a non-enumerable
`cause`, without changing existing codes/messages or other adapters' handling.
This metadata is necessary because `SOURCE_FETCH_FAILED` alone cannot distinguish
a network failure from an application exception. GOG isolates only recognized
native fetch network TypeError signatures, HTTP statuses and timeouts. Other
causes are rethrown, including programming TypeErrors and ReferenceErrors in
fetch/body resolution. Unrecognized network signatures also fail conservatively.
GOG secondary enrichment/retirement propagates unexpected errors too; it does
not discard rejected promises indiscriminately. Parsing remains outside the
transport catch. Coverage stays `partial` even when every request succeeds:
these sources do not establish an exhaustive current campaign inventory.

Home, News RSS and US promotion tabs remain required discovery roots: their
HTTP/contract failures are explicit adapter failures. Unexpected errors outside
the bounded transport failures are not swallowed. Successful but unrecognizable
structured landing authority still fails explicitly. Unresolved articles or
candidates without an independently verified Live/Upcoming campaign fail closed;
ended-only evidence cannot turn unknown current coverage into healthy empty.
Recognized empty sources retain their existing healthy-empty behavior. Existing
specific US SSR soft-404 handling, exact timing and shared reconciliation are unchanged.
A generic title, redirect, missing name or ambiguous disappearance is not new
commercial END authority. No shared persistence or public projection changes.

### Steam seasonal presentation

A seasonal sale keeps one canonical Steamworks identity and official parent
name. Featured subsections are suppressed only when the current official
structure, backlink and compatible campaign boundaries establish the parent
relationship. Their commercial timestamps and artwork are not automatically
inherited by the parent.

The reusable Store homepage becomes a parent CTA only while its seasonal
metadata matches one unambiguous calendar identity, its edition and current
commercial dates agree, and a dated official parent announcement links that
destination by campaign name. Otherwise the announcement or existing valid
campaign destination remains the fallback. A seasonal merge first requires
matching parent UID, name, edition and Steamworks calendar days. Ambiguous scope
keeps the original discovery candidate without merging. Within that proven
parent, each commercial boundary keeps exact evidence ahead of date-only
evidence. Conflicting exact values retain Store-before-News discovery precedence,
then source order. Existing exact-time/expiry helpers determine lifecycle from
those boundaries: stale Live wording cannot override a passed exact parent end.
News confirms the campaign and provides fallback presentation; it is not the
universal timing authority. Parent-compatible CTA/artwork may still enrich when
exact times disagree within the same confirmed calendar scope.

Store landings must be linked as the full parent by the announcement when News
is present. Child/subsection timestamps never enter the same-parent boundary
selection; a shared end time does not make a child's exact start authoritative.

Artwork comes first from the validated seasonal homepage, then a compatible
parent Store landing, or matching parent announcement metadata. Arbitrary
subsection artwork is never promoted by name similarity. Optional metadata
failures preserve campaign discovery and the existing artwork persistence
contract. Announcement event-window timestamps are never sale timing, and
later reuse of the Store root is never campaign-specific END evidence.

## Optional campaign artwork

All ten adapters use the same conservative metadata helper when a
campaign-specific official page is already available. The helper prioritizes
`og:image`, then `twitter:image`, requires credential-free HTTPS, and rejects
obvious favicon, logo, placeholder, default-social, and generic social-share
assets. The final image may live on a CDN only when the official campaign page
publishes that URL directly.

Artwork is never a discovery, health, lifecycle, or persist requirement. Base
campaign upserts omit `artwork_url`; a valid new value is applied separately.
Therefore a later run that still confirms a campaign but cannot rediscover its
image preserves the last confirmed artwork. A failed image write is logged and
does not fail the store adapter. The frontend renders remote artwork directly,
without a server proxy or rehosting, and returns to the store-logo gradient if
the browser cannot load it.

## Authentication and scheduler

The raw dedicated invocation token exists only in Supabase Vault as
`campaign_monitor_token`. Cron reads it at invocation time and sends it in
`x-campaign-monitor-token`; it never sends a database administrator key. The
Edge Function hashes the supplied value and compares it in constant time. Its
expected one-way verifier comes from
`public.campaign_monitor_token_verifier()`, a `security definer` RPC revoked
from `public`, `anon`, and `authenticated` and executable only by
`service_role`. Supabase database credentials remain internal to backend REST
access and are not accepted as caller credentials.

`pg_net` 0.20.0 is enabled. Exactly one active pg_cron job,
`campaign-monitoring-every-4-hours`, uses cadence `0 */4 * * *` and invokes the
single `campaign-monitoring` function with `{ "mode": "persist" }`. Omitting a
store list makes the orchestrator use its canonical ten-store registry. Blocked
stores are therefore retried on every cycle; blocked never means disabled.

## Historical operational snapshot — 29 August 2026

A read-only revalidation on 29 August 2026 confirmed Edge Function version 14
ACTIVE, adapter version 5, and one active
`campaign-monitoring-every-4-hours` job at `0 */4 * * *`. Recent scheduled
invocations completed with HTTP 200. Six adapters were healthy and four were
explicitly blocked: PlayStation Store, Epic Games Store, EA app, and Rockstar
Store.

The public feed contained 34 campaigns: 13 Live and 21 Upcoming, with no ended
rows. The per-store snapshot was:

- Nintendo eShop: 6 Live;
- Xbox Store: 1 Live;
- Steam: 3 Live and 21 Upcoming;
- GOG: 1 Live;
- Ubisoft Store: 1 Live;
- Battle.net: 1 Live.

Four campaigns had automatically discovered official artwork: three Steam
campaigns and one Battle.net campaign. The other 30 campaigns remained valid
and used the designed fallback. Counts and campaign names are operational
snapshots, not invariants; the scheduler may change them as official sources
change.

The original scheduler gate included a complete probe, a forced
failure-isolation probe, and before/after write-boundary comparisons. Blocked
sources remain visible as `temporarily_unavailable` and are retried on every
cycle rather than replaced with third-party or manual data.

## Post-transition repository boundary

The application-facing public boundary contains the two Sales tables, invocation
verifier, three restricted Epic snapshot write RPCs and public snapshot read RPC
described above. Epic generation fields live in the existing Sales tables.
Applied transition migrations remain immutable history under
`supabase/migrations/`; there is no separate operational legacy SQL directory,
catalog/pricing pipeline, user-account backend, or ingestion worker in the
current architecture.
