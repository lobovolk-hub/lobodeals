export const revalidate = 300

import Link from 'next/link'

type HomeItem = {
  id: string
  steamAppID: string
  slug: string
  title: string
  thumb: string
  salePrice: string
  normalPrice: string
  savings: string
  storeID: string
  url: string
  platform: string
}

type StorefrontSectionsResponse = {
  steam_spotlight: HomeItem[]
  best_deals: HomeItem[]
  latest_discounts: HomeItem[]
  new_releases: HomeItem[]
  updatedAt: string | null
}

function buildGameHref(item: { slug: string; title: string }) {
  const safeSlug =
    String(item.slug || '').trim() ||
    item.title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')

  return `/pc/${encodeURIComponent(safeSlug)}`
}

function GameCard({ item }: { item: HomeItem }) {
  const hasDiscount = Number(item.savings || 0) > 0
  const hasSalePrice = !!item.salePrice
  const hasNormalPrice =
    !!item.normalPrice &&
    Number(item.normalPrice) > Number(item.salePrice || 0)

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1">
      <Link href={buildGameHref(item)}>
        <img
          src={item.thumb}
          alt={item.title}
          className="h-40 w-full object-cover transition hover:opacity-90"
        />
      </Link>

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <Link href={buildGameHref(item)} className="min-w-0">
            <h3 className="line-clamp-2 text-base font-bold leading-5 transition hover:text-emerald-300">
              {item.title}
            </h3>
          </Link>

          {hasDiscount ? (
            <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
              -{item.savings}%
            </span>
          ) : null}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-500">
            Steam PC
          </p>

          <div className="mt-2 flex items-end justify-between gap-2">
            <span className="text-2xl font-bold text-emerald-400">
              {hasSalePrice ? `$${item.salePrice}` : 'Steam entry'}
            </span>

            {hasNormalPrice ? (
              <span className="text-sm text-zinc-400 line-through">
                ${item.normalPrice}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function HomeSection({
  title,
  description,
  items,
  href,
}: {
  title: string
  description: string
  items: HomeItem[]
  href: string
}) {
  if (!items.length) {
    return null
  }

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
            PC Storefront
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">{title}</h2>
          <p className="mt-2 text-sm text-zinc-400">{description}</p>
        </div>

        <Link
          href={href}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
        >
          View more
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <GameCard key={`${title}-${item.id}-${item.steamAppID}`} item={item} />
        ))}
      </div>
    </section>
  )
}

export default async function HomePage() {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000'

  const [catalogStatsRes, storefrontRes] = await Promise.all([
    fetch(`${baseUrl}/api/catalog-stats`, {
      next: { revalidate: 300 },
    }),
    fetch(`${baseUrl}/api/storefront-sections?limit=4`, {
      next: { revalidate: 300 },
    }),
  ])

  const catalogStats = await catalogStatsRes.json()
  const storefrontData: StorefrontSectionsResponse = await storefrontRes.json()

  const steamCatalogSize = Number(catalogStats?.steamCatalogSize || 0)

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            LoboDeals
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Game deals and catalog tracking, built for scale
          </h1>

          <p className="mt-4 max-w-3xl text-zinc-400">
            Steam-first, PC-first, and growing fast. The public PC layer is now
            backed by persistent catalog data, recurring refresh jobs, and curated
            storefront sections.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Steam catalog ready
              </p>
              <p className="mt-2 text-2xl font-bold text-white">
                {steamCatalogSize}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Visible PC games in the public layer
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Storefront sections
              </p>
              <p className="mt-2 text-2xl font-bold text-white">4</p>
              <p className="mt-1 text-xs text-zinc-500">
                Spotlight, best deals, latest discounts, new releases
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Current focus
              </p>
              <p className="mt-2 text-2xl font-bold text-white">2.52e</p>
              <p className="mt-1 text-xs text-zinc-500">
                Lean Steam-first storefront and public catalog
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Updated layer
              </p>
              <p className="mt-2 text-2xl font-bold text-white">
                {storefrontData?.updatedAt ? 'Live' : 'Pending'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Driven by recurring public cache refresh jobs
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/pc"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
            >
              Open PC catalog
            </Link>

            <Link
              href="/wishlist"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
            >
              Open wishlist
            </Link>
          </div>
        </header>

        <HomeSection
          title="Steam Spotlight"
          description="Current Steam spotlight entries surfaced from the public storefront layer."
          items={storefrontData?.steam_spotlight || []}
          href="/pc?sort=steam-spotlight"
        />

        <HomeSection
          title="Best Deals"
          description="Discount-led picks from the public Steam PC layer."
          items={storefrontData?.best_deals || []}
          href="/pc?sort=best"
        />

        <HomeSection
          title="Latest Discounts"
          description="Recently refreshed discounted entries from the public Steam PC layer."
          items={storefrontData?.latest_discounts || []}
          href="/pc?sort=best"
        />

        <HomeSection
          title="New Releases"
          description="Recently released PC games already available in the public layer."
          items={storefrontData?.new_releases || []}
          href="/pc?sort=latest"
        />
      </section>
    </main>
  )
}