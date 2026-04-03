export const revalidate = 300

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

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

type SpotlightRow = {
  section_key: string
  position: number
  pc_game_id: string
  steam_app_id: string | null
  slug: string
  title: string
  thumb: string
  sale_price: number | string | null
  normal_price: number | string | null
  discount_percent: number | string | null
  store_id: string | null
  url: string | null
  platform: string
  updated_at: string
}

type PcPublicCatalogRow = {
  pc_game_id: string
  steam_app_id?: string | null
  slug: string
  title: string
  thumb: string
  sale_price?: number | string | null
  normal_price?: number | string | null
  discount_percent?: number | string | null
  store_id?: string | null
  url?: string | null
  is_free_to_play?: boolean | null
  has_active_offer?: boolean | null
  is_catalog_ready?: boolean | null
  sort_latest?: number | null
  price_last_synced_at?: string | null
}

type HomeData = {
  steamCatalogSize: number
  storefront: {
    steam_spotlight: HomeItem[]
    best_deals: HomeItem[]
    latest_discounts: HomeItem[]
    new_releases: HomeItem[]
    updatedAt: string | null
  }
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for home page')
  }

  return createClient(url, serviceRole)
}

function formatMoney(value?: number | string | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return ''
  }

  return amount.toFixed(2)
}

function formatSavings(value?: number | string | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return '0'
  }

  return String(Math.max(0, Math.min(99, Math.round(amount))))
}

function mapSpotlightRow(row: SpotlightRow): HomeItem {
  return {
    id: String(row.pc_game_id || '').trim(),
    steamAppID: String(row.steam_app_id || '').trim(),
    slug: String(row.slug || '').trim(),
    title: String(row.title || '').trim(),
    thumb: String(row.thumb || '').trim(),
    salePrice: formatMoney(row.sale_price),
    normalPrice: formatMoney(row.normal_price),
    savings: formatSavings(row.discount_percent),
    storeID: String(row.store_id || '1').trim(),
    url: String(row.url || '').trim(),
    platform: String(row.platform || 'pc').trim(),
  }
}

function mapCatalogRow(row: PcPublicCatalogRow): HomeItem {
  return {
    id: String(row.pc_game_id || '').trim(),
    steamAppID: String(row.steam_app_id || '').trim(),
    slug: String(row.slug || '').trim(),
    title: String(row.title || '').trim(),
    thumb: String(row.thumb || '').trim(),
    salePrice: formatMoney(row.sale_price),
    normalPrice: formatMoney(row.normal_price),
    savings: formatSavings(row.discount_percent),
    storeID: String(row.store_id || '1').trim(),
    url: String(row.url || '').trim(),
    platform: 'pc',
  }
}

async function getSpotlightItems(supabase: ReturnType<typeof getServiceSupabase>) {
  const { data, error } = await supabase
    .from('public_storefront_sections_cache')
    .select(
      'section_key, position, pc_game_id, steam_app_id, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, platform, updated_at'
    )
    .eq('section_key', 'steam_spotlight')
    .order('position', { ascending: true })
    .limit(4)

  if (error) {
    throw error
  }

  const rows = Array.isArray(data) ? (data as SpotlightRow[]) : []

  return {
    items: rows.map(mapSpotlightRow),
    updatedAt: rows.length > 0 ? rows[0].updated_at : null,
  }
}

async function getBestDealsItems(supabase: ReturnType<typeof getServiceSupabase>) {
  const { data, error } = await supabase
    .from('pc_public_catalog_cache')
    .select(
      'pc_game_id, steam_app_id, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, is_free_to_play, has_active_offer, is_catalog_ready, sort_latest'
    )
    .order('has_active_offer', { ascending: false })
    .order('discount_percent', { ascending: false })
    .order('sale_price', { ascending: true, nullsFirst: false })
    .order('sort_latest', { ascending: false })
    .limit(4)

  if (error) {
    throw error
  }

  const rows = Array.isArray(data) ? (data as PcPublicCatalogRow[]) : []
  return rows.map(mapCatalogRow)
}

async function getLatestDiscountsItems(supabase: ReturnType<typeof getServiceSupabase>) {
  const { data, error } = await supabase
    .from('pc_public_catalog_cache')
    .select(
      'pc_game_id, steam_app_id, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, is_free_to_play, has_active_offer, is_catalog_ready, sort_latest, price_last_synced_at'
    )
    .gt('discount_percent', 0)
    .order('price_last_synced_at', { ascending: false, nullsFirst: false })
    .order('discount_percent', { ascending: false })
    .order('sort_latest', { ascending: false })
    .limit(4)

  if (error) {
    throw error
  }

  const rows = Array.isArray(data) ? (data as PcPublicCatalogRow[]) : []
  return rows.map(mapCatalogRow)
}

async function getLatestReleaseItems(supabase: ReturnType<typeof getServiceSupabase>) {
  const { data, error } = await supabase
    .from('pc_public_catalog_cache')
    .select(
      'pc_game_id, steam_app_id, slug, title, thumb, sale_price, normal_price, discount_percent, store_id, url, is_free_to_play, has_active_offer, is_catalog_ready, sort_latest'
    )
    .gt('sort_latest', 0)
    .order('sort_latest', { ascending: false })
    .order('discount_percent', { ascending: false })
    .order('title', { ascending: true })
    .limit(4)

  if (error) {
    throw error
  }

  const rows = Array.isArray(data) ? (data as PcPublicCatalogRow[]) : []
  return rows.map(mapCatalogRow)
}

async function getHomeData(): Promise<HomeData> {
  try {
    const supabase = getServiceSupabase()

    const [metaRes, spotlightRes, bestDeals, latestDiscounts, latestReleases] =
      await Promise.all([
        supabase
          .from('pc_public_catalog_meta')
          .select('total_items')
          .eq('key', 'default')
          .maybeSingle(),
        getSpotlightItems(supabase),
        getBestDealsItems(supabase),
        getLatestDiscountsItems(supabase),
        getLatestReleaseItems(supabase),
      ])

    if (metaRes.error) {
      throw metaRes.error
    }

    return {
      steamCatalogSize: Number(metaRes.data?.total_items || 0),
      storefront: {
        steam_spotlight: spotlightRes.items,
        best_deals: bestDeals,
        latest_discounts: latestDiscounts,
        new_releases: latestReleases,
        updatedAt: spotlightRes.updatedAt,
      },
    }
  } catch {
    return {
      steamCatalogSize: 0,
      storefront: {
        steam_spotlight: [],
        best_deals: [],
        latest_discounts: [],
        new_releases: [],
        updatedAt: null,
      },
    }
  }
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
  const { steamCatalogSize, storefront } = await getHomeData()

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            LoboDeals
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Steam-first game deals and catalog tracking
          </h1>

          <p className="mt-4 max-w-3xl text-zinc-400">
            One canonical PC page per title, real Steam screenshots, curated highlights,
            persistent public caches, and a cleaner storefront built to scale.
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
                Highlights, best deals, latest discounts, latest releases
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Current focus
              </p>
              <p className="mt-2 text-2xl font-bold text-white">2.52i</p>
              <p className="mt-1 text-xs text-zinc-500">
                Steam-first PC standardization before PlayStation
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Updated layer
              </p>
              <p className="mt-2 text-2xl font-bold text-white">
                {storefront?.updatedAt ? 'Live' : 'Pending'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Driven by recurring public cache refresh jobs
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/pc?page=1&sort=all"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
            >
              Open PC
            </Link>

            <Link
              href="/tracked"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
            >
              Open tracked
            </Link>
          </div>
        </header>

        <HomeSection
          title="Highlights"
          description="Four hand-picked PC highlights for the current month."
          items={storefront?.steam_spotlight || []}
          href="/pc?page=1&sort=all"
        />

        <HomeSection
          title="Best Deals"
          description="Discount-led picks from the public Steam PC layer."
          items={storefront?.best_deals || []}
          href="/pc?page=1&sort=best"
        />

        <HomeSection
          title="Latest Discounts"
          description="Recently refreshed discounted entries from the public Steam PC layer."
          items={storefront?.latest_discounts || []}
          href="/pc?page=1&sort=latest-discounts"
        />

        <HomeSection
          title="Latest Releases"
          description="Recently released PC games already available in the public layer."
          items={storefront?.new_releases || []}
          href="/pc?page=1&sort=latest"
        />
      </section>
    </main>
  )
}