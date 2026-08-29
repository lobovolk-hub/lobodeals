# LoboDeals

LoboDeals is a LoboVolk product for finding official digital game stores and
their active or announced sale campaigns in the United States market. The
public interface is English and covers PlayStation, PC, Nintendo, and Xbox.

This README is technical and non-authoritative. `AGENTS.md` contains the
repository operating authority.

## Technical shape

- Next.js 16 App Router
- React 19 and TypeScript
- Tailwind CSS 4
- ESLint 9
- Node test runner

The canonical ten-store registry lives in `lib/stores.ts`. `lib/sales.ts`
defines the campaign contract, including store ownership and date-only versus
exact-time semantics. `lib/sales-source.ts` reads the public Sales feed through
a small REST boundary; the frontend does not ship a Supabase SDK or any
authentication runtime.

The Sales backend is isolated in `supabase/`. Its migrations create only
`sales_campaigns` and `sales_source_health`, with optional official
campaign-page artwork stored as an HTTPS URL on the campaign row. The single Edge Function
`campaign-monitoring` owns ten independent official-source adapters and writes
only those two structures. Missing source data is never replaced with a demo or
manual campaign, and an adapter failure does not delete or change confirmed
campaigns from that store. A missing campaign on a partial discovery surface is
also preserved; only exact official end evidence can move it to a non-public
`ended` row. One Vault-authenticated scheduler invokes all ten adapters every
four hours, including blocked sources. Operational details and current source
health are in `docs/sales-backend.md`.

## Public routes

- `/`
- `/sales`
- `/playstation`
- `/pc`
- `/nintendo`
- `/xbox`
- `/services/[slug]` for each canonical store
- `/about`

`/deals` is a 301 redirect to `/sales`. Removed catalog, game, authentication,
profile, and tracking routes return 404.

## Local development

- `npm run dev` starts the local development server.
- `npm test` runs the product contract and campaign-model tests.
- `npm run lint` runs ESLint.
- `npm run build` creates a production build.

The tracked `sql/` directory remains only because remote legacy Supabase cleanup
has a later operational gate. It is not part of the new frontend or Sales
backend.
