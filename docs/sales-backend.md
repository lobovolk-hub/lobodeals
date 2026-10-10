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
