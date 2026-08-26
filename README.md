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
defines the future-facing campaign contract, including store ownership and
date-only versus exact-time semantics. `lib/sales-source.ts` is the replaceable
backend boundary.

MACROBLOQUE A intentionally connects no remote Sales adapter and returns an
empty campaign feed. The public UI already consumes that boundary, so a later
approved backend can supply official campaigns without redesigning pages or the
campaign model. The frontend has no Supabase or authentication runtime.

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
model.
