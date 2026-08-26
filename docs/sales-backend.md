# Sales backend operations

This document describes the implemented Sales boundary. It is operational
documentation, not a replacement for the Product Authority.

## Objects and write boundary

- `public.sales_campaigns` stores official US sale campaigns. Calendar dates
  use `starts_on` / `ends_on`; exact timezone-bearing instants use
  `starts_at` / `ends_at`.
- `public.sales_source_health` has one internal row for each canonical store.
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
campaigns. Adapter version 3 implements this policy.

## Official source map

| Store | Official surfaces | Current contract |
| --- | --- | --- |
| PlayStation Store | US Store `store.playstation.com/en-us/pages/latest`, its public EMS module service, and US PlayStation Blog as a complement | Campaign modules are primary; product/category grids are never traversed. The EMS service currently returns HTTP 403 to Edge, so the adapter is blocked rather than treating Blog as complete. |
| Nintendo eShop | US `nintendo.com/us/store/sales-and-deals/` plus `nintendo.com/us/whatsnew/` | Campaign tabs/pages are discovered without reading embedded product data. Promotion news is complementary. |
| Microsoft / Xbox Store | US `xbox.com/en-US/promotions/sales/sales-and-specials` | Only embedded `CampsiteChannel.Games.Sale` campaign metadata is accepted. The hub is partial; product, hardware, and Game Pass sections are ignored. |
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

## Current controlled validation

On 26 August 2026, Edge Function version 11 received a complete ten-store probe
through the same Vault + pg_net authentication path used by the scheduler. Six
adapters succeeded and four were explicitly blocked: PlayStation Store, Epic
Games Store, EA app, and Rockstar Store. A separate isolation probe forced
Steam to fail while GOG still succeeded. The final complete persisted run ended
zero campaigns and left 29 public campaigns:

- Nintendo eShop: 3 Live;
- Microsoft / Xbox Store: 1 Live;
- Steam: 1 Live and 21 Upcoming;
- GOG: 1 Live;
- Ubisoft Store: 1 Live;
- Battle.net: 1 Live.

Before and after the persisted run, row counts and full-row content hashes were
identical for Auth users, identities, profiles, tracked items,
`official_ps_store_deals`, `automation_runs`, and `ps_ingest_queue`. Only
`sales_campaigns` and `sales_source_health` changed.

The scheduler was installed only after the schema, Edge deployment, complete
probe, failure-isolation probe, and protected-object comparison passed. The
four blocked sources remain visible as `temporarily_unavailable` and continue
to be retried rather than replaced with third-party or manual data.
