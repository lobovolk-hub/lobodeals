import Link from 'next/link'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { HomeFeaturedCarousel } from '@/components/home-featured-carousel'
import { HomeSearchBar } from '@/components/home-search-bar'
import { ItemCard, type ItemCardData } from '@/components/item-card'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata: Metadata = {
  title: 'PlayStation deals and game tracking',
  description:
    'Discover PlayStation deals, track PS4 and PS5 games, browse upcoming releases, and follow prices in the LoboDeals catalog.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'LoboDeals — PlayStation deals and game tracking',
    description:
      'Discover PlayStation deals, track PS4 and PS5 games, browse upcoming releases, and follow prices in the LoboDeals catalog.',
    url: '/',
  },
}

type CatalogSearchRow = ItemCardData & {
  total_count: number | string | null
}

const featuredCarouselSlugs = [
  'pragmata',
  'saros',
  'assassins-creed-black-flag-resynced',
  '007-first-light',
  'mixtape',
  'mouse-pi-for-hire',
  'starfield',
  'resident-evil-requiem',
  'nte-neverness-to-everness',
  'marvel-rivals-ps5',
]

const baseSelect =
  'id, slug, title, image_url, platforms, content_type, item_type_label, release_date, current_price_amount, original_price_amount, discount_percent, ps_plus_price_amount, best_price_amount, best_price_type, has_deal, has_ps_plus_deal, metacritic_score'

function Section({
  title,
  href,
  children,
}: {
  title: string
  href: string
  children: ReactNode
}) {
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-2xl font-black tracking-tight">{title}</h2>

        <Link
          href={href}
          className="text-sm font-bold text-zinc-400 transition hover:text-white"
        >
          View all →
        </Link>
      </div>

      {children}
    </section>
  )
}

function Grid({ items }: { items: ItemCardData[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        No items available yet.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </div>
  )
}

function stripTotalCount(rows: CatalogSearchRow[] | null) {
  return (rows || []).map((row) => {
    const { total_count, ...item } = row
    return item
  }) as ItemCardData[]
}

export default async function HomePage() {
  const [
    { count },
    featuredResult,
    topRatedDiscounts,
    highestDiscounts,
    upcomingGames,
    latestReleases,
  ] = await Promise.all([
    supabase
      .from('catalog_public_cache')
      .select('*', { count: 'exact', head: true })
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .eq('content_type', 'game')
      .eq('item_type_label', 'game'),

    supabase
      .from('catalog_public_cache')
      .select(baseSelect)
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .in('slug', featuredCarouselSlugs),

    supabase
      .from('catalog_public_cache')
      .select(baseSelect)
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .eq('content_type', 'game')
      .eq('item_type_label', 'game')
      .or('has_deal.eq.true,has_ps_plus_deal.eq.true')
      .not('metacritic_score', 'is', null)
      .lt('discount_percent', 100)
      .gt('best_price_amount', 0)
      .order('metacritic_score', { ascending: false, nullsFirst: false })
      .order('discount_percent', { ascending: false, nullsFirst: false })
      .order('title', { ascending: true })
      .limit(6),

    supabase
      .from('catalog_public_cache')
      .select(baseSelect)
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .eq('content_type', 'game')
      .eq('item_type_label', 'game')
      .or('has_deal.eq.true,has_ps_plus_deal.eq.true')
      .lt('discount_percent', 100)
      .gt('best_price_amount', 0)
      .order('discount_percent', { ascending: false, nullsFirst: false })
      .order('title', { ascending: true })
      .limit(6),

    supabase.rpc('search_catalog_public_cache', {
      p_q: '',
      p_tab: 'games',
      p_letter: 'ALL',
      p_sort: 'upcoming',
      p_limit: 6,
      p_offset: 0,
    }),

    supabase.rpc('search_catalog_public_cache', {
      p_q: '',
      p_tab: 'games',
      p_letter: 'ALL',
      p_sort: 'latest',
      p_limit: 6,
      p_offset: 0,
    }),
  ])

  const featuredItemsRaw = (featuredResult.data || []) as ItemCardData[]

  const featuredItems = featuredCarouselSlugs
    .map((slug) => featuredItemsRaw.find((item) => item.slug === slug))
    .filter((item): item is ItemCardData => Boolean(item))

  const topRatedDiscountItems = (topRatedDiscounts.data ||
    []) as ItemCardData[]

  const highestDiscountItems = (highestDiscounts.data ||
    []) as ItemCardData[]

  const upcomingGameItems = stripTotalCount(
    (upcomingGames.data || []) as CatalogSearchRow[]
  )

  const latestReleaseItems = stripTotalCount(
    (latestReleases.data || []) as CatalogSearchRow[]
  )

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-[1700px] px-6 py-10">
        <div className="mb-8 space-y-4">
  <HomeSearchBar
    totalLabel={
      count !== null
        ? `${count.toLocaleString('en-US')} games tracked`
        : undefined
    }
  />

  <h1 className="text-4xl font-black tracking-tight md:text-5xl">
    LoboDeals' choice
  </h1>
</div>

<HomeFeaturedCarousel items={featuredItems} />

        <Section
          title="Top rated discounts by Metacritic"
          href="/deals?tab=games&sort=metacritic"
        >
          <Grid items={topRatedDiscountItems} />
        </Section>

        <Section title="Highest discounts" href="/deals?tab=games">
          <Grid items={highestDiscountItems} />
        </Section>

        <Section
          title="Upcoming games"
          href="/catalog?tab=games&sort=upcoming"
        >
          <Grid items={upcomingGameItems} />
        </Section>

        <Section
          title="Latest releases"
          href="/catalog?tab=games&sort=latest"
        >
          <Grid items={latestReleaseItems} />
        </Section>
      </div>
    </main>
  )
}