# LoboDeals — rebuild operating authority

This repository is in the official rebuild of the new LoboDeals.

## Governing authorities

Apply these Project Sources in order:

1. **LoboDeals — Product Definition & Transition Authority — Consolidated Revision** — APPROVED Final Consolidation — 25 August 2026.
2. **LoboDeals — Technical Transition Audit** — APPROVED — 20 August 2026.

The Product Authority defines what is built. The Technical Audit defines the
technical state, dependencies, and gates. Product decisions P1–P11 are CLOSED
and must not be reopened through implementation preference.

Public product copy is English. Collaboration with Johan is Spanish.

## Approved product

LoboDeals is a LoboVolk brand with two public functions:

- **Directory:** where to find the approved official digital stores.
- **Sales:** when an official store sale campaign is live or officially
  announced.

The tracked market is the United States. The audience is international and
English-speaking.

The ten canonical stores are:

1. PlayStation Store
2. Nintendo eShop
3. Microsoft / Xbox Store
4. Steam
5. Epic Games Store
6. GOG
7. EA app
8. Ubisoft Store
9. Battle.net
10. Rockstar Store

Microsoft / Xbox Store is one canonical store projected onto both PC and Xbox.
A campaign belongs primarily to one canonical store; platform pages are
projections of that store relationship.

Do not rebuild price tracking, price histories, a massive game catalog,
individual game search, accounts, authentication, profiles, wishlists,
community, editorial, blog, news, catalog crawling, legacy collectors, workers,
queues, or ingestion pipelines.

Sales cover official store campaigns, not individual discounted products.
Freebies, free games, free weekends, demos, subscription giveaways, and
hardware-only promotions do not qualify as Sales by themselves. Do not infer
product counts unless an official source publishes a reliable count. Do not
reconstruct campaigns by traversing product catalogs.

## Public routes and SEO

Canonical public routes:

- `/`
- `/sales`
- `/playstation`
- `/pc`
- `/nintendo`
- `/xbox`
- `/services/[slug]`
- `/about`

SEO transition:

- `/deals` returns a 301 redirect to `/sales`.
- `/catalog`, `/us/playstation/[slug]`, `/login`, `/profile`, `/tracked`, and
  `/auth/callback` return real 404 responses.
- Do not add broad legacy redirects.
- Do not add internal campaign detail pages.
- Sitemap output contains only current canonical public routes.
- `robots` must not be used as a substitute for route removal and 404 behavior.

## Frontend and campaign model

The MVP is dark-only: charcoal/dark base, off-white foreground, `#990303`
primary accent, and `#71706E` neutral. The interface is gaming-first, clean,
compact, and dense, without SaaS, storefront, price-tracker, or carousel
dependence. Official campaign artwork is optional enhancement only; the
designed store-identity fallback remains required.

Required home order: sticky header, hero, Explore by Platform, Live now,
Upcoming, footer.

Each platform page contains Official Stores, Live now, and Upcoming. Each store
profile contains normalized identity, objective information, platforms,
digital scope, official CTA, Live now, and Upcoming.

Campaign time rules:

- Preserve date-only facts as calendar dates without inventing a time.
- Preserve exact datetimes only when the official source provides an instant
  with timezone.
- Derive lifecycle state from time only when the required official instants are
  exact.
- A source-reported Live/Upcoming state may be represented explicitly; do not
  disguise a manual date guess as a derived state.

The frontend stays decoupled from persistence through `lib/sales-source.ts` and
does not use the Supabase SDK. The approved Sales backend has two new tables,
`sales_campaigns` and `sales_source_health`, plus one Edge Function,
`campaign-monitoring`, with exactly one adapter per canonical store. It may
write only those two tables. Never reuse legacy catalog, pricing, ingestion, or
user tables for Sales.

The monitoring scheduler must remain inactive unless all ten adapters have
passed controlled probes, failure isolation is demonstrated, and a complete
manual persisted run is verified not to mutate anything outside the two new
Sales tables. A blocked official source must remain an explicit health failure;
do not substitute a third party, a manual registry, or synthetic data.

Those scheduler gates closed on 26 August 2026. The single active job
`campaign-monitoring-every-4-hours` runs at `0 */4 * * *` and must continue to
invoke all ten adapters. A blocked adapter is retried every cycle and is never
filtered out of scheduling.

## Current infrastructure and security boundaries

Keep the repository and Git history, GitHub repository, `lobodeals.com` and
useful DNS, the existing Vercel project/integration, the existing Supabase
Project, useful configuration and secrets, appropriate LoboDeals brand assets,
GTM when useful, and `NEXT_PUBLIC_SITE_URL`.

The current Supabase application boundary consists of
`public.sales_campaigns`, `public.sales_source_health`,
`public.campaign_monitor_token_verifier()`, Edge Function
`campaign-monitoring`, Vault secret `campaign_monitor_token`, and the single
`campaign-monitoring-every-4-hours` cron job. Keep that boundary small. The
frontend uses only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; never introduce a Supabase secret into
the frontend or Vercel runtime.

The legacy Worker, user/account tracking schema, non-user catalog/pricing
backend, and operational `sql/` scripts were retired through their authorized
transition gates. Applied transition migrations in `supabase/migrations/` are
the durable history. Do not recreate or route current work through retired
systems.

## Local authorization and prohibitions

Authorized local product work may create, modify, and delete files; remove dead
npm dependencies; and run tests, lint, and build.

Without later explicit authorization, do not:

- commit, push, deploy, or open a pull request;
- modify production, Vercel, Cloudflare, GitHub remote state, DNS, or domains;
- modify remote Supabase schemas, data, functions, RPC, triggers, cron, Edge
  Functions, Vault, or Auth;
- rotate, delete, or expose secrets;
- use `git reset`, `git clean`, destructive checkout/restore, automatic stash,
  or broad revert.

Preserve user work and never discard the working tree in bulk. Do not create
archive, legacy, backup, `.old`, or `.bak` copies.

## Next.js and verification

This repository uses Next.js 16. When behavior depends on framework details,
inspect the installed documentation under `node_modules/next/dist/docs`.

After every broad change run:

- `npm test`
- `npm run lint`
- `npm run build`
- `git status --short`
- `git diff --stat`

Do not commit unless the active gate explicitly authorizes it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
