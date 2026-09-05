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
  verifier to `service_role`; it is the sole custom public function.
- `campaign-monitoring` is the only monitoring Edge Function. Its ten adapters
  run independently and can write only the two tables above.
- The frontend reads only live/upcoming `sales_campaigns` rows through the
  public RLS policy and has no Supabase SDK. Its public availability request is
  a `GET` to the same Edge Function and returns only `store_slug` plus
  `availability` (`available` or `temporarily_unavailable`).
- `sales_source_health` remains private. Its RLS has no public read policy, and
  the public availability response never includes error codes, messages,
  timestamps, counters, or source URLs.

The function defaults to `probe`, which reads current Sales rows for
verification but performs no writes. `persist` upserts campaigns confirmed by
successful adapters and records health. A failed adapter can update only its
health row; it never changes a campaign.

## Lifecycle and coverage contract

Discovery and verification are separate. Every current adapter declares
`partial` coverage. Therefore a campaign disappearing from a hub, homepage,
news window, or other partial surface remains unchanged.

A campaign can become `ended` only when one of these facts exists:

1. its official exact `ends_at` instant has passed during a successful source
   run;
2. its campaign-specific official page (not a shared discovery page) explicitly
   states that the campaign ended; or
3. an adapter explicitly declares `authoritative-complete-current-set` and the
   campaign is absent from that successful complete snapshot.

No current adapter uses the third option. Date-only facts never trigger a
state transition. Failed discovery or failed verification preserves prior
campaigns. Adapter version 5 implements this policy and optional official
artwork discovery without changing lifecycle behavior.

## Official source map

| Store | Official surfaces | Current contract |
| --- | --- | --- |
| PlayStation Store | US Store `store.playstation.com/en-us/pages/latest`, its public EMS module service, and US PlayStation Blog as a complement | Campaign modules are primary; product/category grids are never traversed. The EMS service currently returns HTTP 403 to Edge, so the adapter is blocked rather than treating Blog as complete. |
| Nintendo eShop | US `nintendo.com/us/store/sales-and-deals/` plus `nintendo.com/us/whatsnew/` | Campaign tabs/pages are discovered without reading embedded product data. Promotion news is complementary. |
| Xbox Store | US `xbox.com/en-US/promotions/sales/sales-and-specials` | Only embedded `CampsiteChannel.Games.Sale` campaign metadata is accepted. The hub is partial; product, hardware, and Game Pass sections are ignored. |
| Steam | Steamworks upcoming-events calendar plus US `store.steampowered.com` homepage campaign links | Steamworks provides date-only Upcoming campaigns. A campaign becomes Live only when an official Store sale surface confirms it. Product specials are not traversed. |
| Epic Games Store | US Sales & Specials HTML, official News HTML, and the official public news service | The adapter can parse campaign-level HTML when available. Edge currently receives HTTP 403, HTTP 403, and HTTP 400 respectively, so it is blocked. |
| GOG | `gog.com/en/` and linked official campaign pages | Campaign links include both `/en/promo/...` and campaign-specific `...sale` paths. The homepage is partial. |
| EA app | `ea.com/sales/deals` plus official EA News | The general deals page currently exposes discounted products but no campaign discovery contract; News exposes no current EA app campaign link. The adapter is blocked and does not hardcode an event landing. |
| Ubisoft Store | US `store.ubisoft.com/us/deals` and linked campaign pages | All qualifying campaign links are evaluated; there is no item-count slice. The hub is partial. |
| Battle.net | US Blizzard `contentItems` feed with pagination and official articles | Discovery follows up to 20 feed pages, never truncates qualifying candidates, and verifies known campaign pages separately. Only Battle.net Shop campaign articles with an official exact end instant are published from this historical feed. |
| Rockstar Store | `rockstargames.com/newswire?tag_id=43` | Honest standard HTTP requests expose no server-rendered Store campaign links. No private GraphQL contract, bypass, proxy, or third party is used; the adapter is blocked. |

No adapter uses a comparator, aggregator, price tracker, silent third party,
product catalog crawl, or manual campaign registry. Product counts are not
stored.

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

## Current operational snapshot

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

The database's current application-facing public schema contains only
`sales_campaigns`, `sales_source_health`, and the invocation verifier described
above. Applied transition migrations remain immutable history under
`supabase/migrations/`; there is no separate operational legacy SQL directory,
catalog/pricing pipeline, user-account backend, or ingestion worker in the
current architecture.
