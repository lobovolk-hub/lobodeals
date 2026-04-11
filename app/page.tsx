export const revalidate = 300

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import {
  buildPcBrowseDataQuery,
  type PcBrowseRow,
  PC_PUBLIC_BROWSE_SELECT,
} from '@/lib/server/pcBrowseShared'
import { type PcSectionKey } from '@/lib/server/pcSectionRules'

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
  isFreeToPlay: boolean
  sortLatest: number
}

type HomeData = {
  bestDeals: HomeItem[]
  latestDiscounts: HomeItem[]
  latestReleases: HomeItem[]
  biggestDiscounts: HomeItem[]
  topRated: HomeItem[]
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

function mapBrowseRow(row: PcBrowseRow): HomeItem {
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
    isFreeToPlay: Boolean(row.is_free_to_play),
    sortLatest: Number(row.sort_latest || 0),
  }
}

function getCardDisplayState(item: {
  salePrice?: string
  normalPrice?: string
  savings?: string
  isFreeToPlay?: boolean
  sortLatest?: number
}) {
  const nowEpoch = Math.floor(Date.now() / 1000)
  const sale = Number(item.salePrice || 0)
  const normal = Number(item.normalPrice || 0)
  const isUpcoming = Number(item.sortLatest || 0) > nowEpoch

  const hasSalePrice = Number.isFinite(sale) && sale > 0
  const hasNormalPrice = Number.isFinite(normal) && normal > 0
  const hasDiscount =
    !isUpcoming &&
    hasSalePrice &&
    hasNormalPrice &&
    normal > sale

  const priceLabel = isUpcoming
    ? 'TBA'
    : hasSalePrice
      ? `$${item.salePrice}`
      : hasNormalPrice
        ? `$${item.normalPrice}`
        : item.isFreeToPlay
          ? 'Free'
          : 'No price'

  return {
    isUpcoming,
    hasDiscount,
    priceLabel,
    showNormalPrice: hasDiscount,
  }
}

async function getSectionItems(
  supabase: ReturnType<typeof getServiceSupabase>,
  section: PcSectionKey,
  limit: number
) {
  let query: any = supabase
    .from('pc_public_catalog_cache')
    .select(PC_PUBLIC_BROWSE_SELECT)

  query = buildPcBrowseDataQuery(query, {
    sort: section,
    query: '',
  })

  query = query.limit(limit)

  const { data, error } = await query

  if (error) {
    throw error
  }

  const rows = Array.isArray(data) ? (data as PcBrowseRow[]) : []
  return rows.map(mapBrowseRow)
}

async function getHomeData(): Promise<HomeData> {
  try {
    const supabase = getServiceSupabase()
    const sectionLimit = 6

    const [
      bestDeals,
      latestDiscounts,
      latestReleases,
      biggestDiscounts,
      topRated,
    ] = await Promise.all([
      getSectionItems(supabase, 'best-deals', sectionLimit),
      getSectionItems(supabase, 'latest-discounts', sectionLimit),
      getSectionItems(supabase, 'latest-releases', sectionLimit),
      getSectionItems(supabase, 'biggest-discount', sectionLimit),
      getSectionItems(supabase, 'top-rated', sectionLimit),
    ])

    return {
      bestDeals,
      latestDiscounts,
      latestReleases,
      biggestDiscounts,
      topRated,
    }
  } catch (error) {
    console.error('home page error', error)

    return {
      bestDeals: [],
      latestDiscounts: [],
      latestReleases: [],
      biggestDiscounts: [],
      topRated: [],
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
  const display = getCardDisplayState(item)

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1">
      <Link href={buildGameHref(item)} className="block">
        <div className="h-32 w-full bg-zinc-800 sm:h-36">
          {item.thumb ? (
            <img
              src={item.thumb}
              alt={item.title}
              className="h-full w-full object-cover transition hover:opacity-90"
            />
          ) : null}
        </div>
      </Link>

      <div className="p-3 sm:p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <Link href={buildGameHref(item)} className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-bold leading-5 text-zinc-100 transition hover:text-emerald-300 sm:text-base">
              {item.title}
            </h3>
          </Link>

          {display.hasDiscount ? (
            <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300 sm:text-xs">
              -{item.savings}%
            </span>
          ) : null}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-end justify-between gap-2">
            <span className="text-lg font-bold text-emerald-400 sm:text-2xl">
              {display.priceLabel}
            </span>

            {display.showNormalPrice ? (
              <span className="text-xs text-zinc-400 line-through sm:text-sm">
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
  items,
  href,
}: {
  title: string
  items: HomeItem[]
  href: string
}) {
  if (!items.length) {
    return null
  }

  return (
    <section className="mt-6 sm:mt-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-white sm:text-2xl">{title}</h2>

        <Link
          href={href}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
        >
          View more
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
        {items.map((item) => (
          <GameCard key={`${title}-${item.id}-${item.steamAppID}`} item={item} />
        ))}
      </div>
    </section>
  )
}

export default async function HomePage() {
  const data = await getHomeData()

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6 sm:pb-10 sm:pt-4">
        <HomeSection
          title="Best Deals"
          items={data.bestDeals}
          href="/pc?page=1&sort=best-deals"
        />

        <HomeSection
          title="Latest Discounts"
          items={data.latestDiscounts}
          href="/pc?page=1&sort=latest-discounts"
        />

        <HomeSection
          title="Latest Releases"
          items={data.latestReleases}
          href="/pc?page=1&sort=latest-releases"
        />

        <HomeSection
          title="Biggest Discounts"
          items={data.biggestDiscounts}
          href="/pc?page=1&sort=biggest-discount"
        />

        <HomeSection
          title="Top Rated"
          items={data.topRated}
          href="/pc?page=1&sort=top-rated"
        />
      </section>
    </main>
  )
}