import Link from 'next/link'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { ItemCard, type ItemCardData } from '@/components/item-card'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'PlayStation deals',
  description:
    'Find current PlayStation deals for PS4 and PS5 games, bundles, and add-ons, verified through the LoboDeals catalog.',
  alternates: {
    canonical: '/deals',
  },
  openGraph: {
    title: 'PlayStation deals | LoboDeals',
    description:
      'Find current PlayStation deals for PS4 and PS5 games, bundles, and add-ons.',
    url: '/deals',
  },
}

type DealsSearchParams = {
  page?: string
  tab?: string
  letter?: string
  sort?: string
}

type DealsPageProps = {
  searchParams: Promise<DealsSearchParams>
}

const PAGE_SIZE = 36

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'games', label: 'Games' },
  { key: 'bundles', label: 'Bundles' },
  { key: 'addons', label: 'Add-ons' },
] as const

const sortOptions = [
  { key: 'discount', label: 'Highest discounts' },
  { key: 'metacritic', label: 'Top rated discounts' },
  { key: 'az', label: 'A-Z' },
] as const

const letters = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), 'Other']

type TabKey = (typeof tabs)[number]['key']
type SortKey = (typeof sortOptions)[number]['key']

function isValidTab(value: string | undefined): value is TabKey {
  return tabs.some((tab) => tab.key === value)
}

function isValidSort(value: string | undefined): value is SortKey {
  return sortOptions.some((sort) => sort.key === value)
}

function getSafePage(value: string | undefined) {
  const parsed = Number(value || '1')

  if (!Number.isFinite(parsed)) {
    return 1
  }

  return Math.max(1, Math.floor(parsed))
}

function getDealsHref({
  tab,
  page,
  letter,
  sort,
}: {
  tab: TabKey
  page?: number
  letter?: string
  sort?: SortKey
}) {
  const params = new URLSearchParams()
  params.set('tab', tab)

  if (page && page > 1) params.set('page', String(page))
  if (letter && letter !== 'ALL') params.set('letter', letter)
  if (sort && sort !== 'discount') params.set('sort', sort)

  const query = params.toString()
  return query ? `/deals?${query}` : '/deals'
}

function applyLetterFilter(query: any, letter: string) {
  if (letter === 'ALL') return query

  if (letter === '#') {
    return query.or(
      'title.ilike.0%,title.ilike.1%,title.ilike.2%,title.ilike.3%,title.ilike.4%,title.ilike.5%,title.ilike.6%,title.ilike.7%,title.ilike.8%,title.ilike.9%'
    )
  }

  if (letter === 'OTHER') {
    for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      query = query.not('title', 'ilike', `${l}%`)
    }

    for (let i = 0; i <= 9; i += 1) {
      query = query.not('title', 'ilike', `${i}%`)
    }

    return query
  }

  return query.ilike('title', `${letter}%`)
}

function getPaginationPages(currentPage: number, totalPages: number) {
  const pages = new Set<number>()

  pages.add(1)
  pages.add(totalPages)

  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page >= 1 && page <= totalPages) {
      pages.add(page)
    }
  }

  return [...pages].sort((a, b) => a - b)
}

function Pagination({
  page,
  totalPages,
  tab,
  letter,
  sort,
}: {
  page: number
  totalPages: number
  tab: TabKey
  letter: string
  sort: SortKey
}) {
  const pages = getPaginationPages(page, totalPages)

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-zinc-500">
        Page {page} of {totalPages}
      </p>

      <div className="flex flex-wrap gap-2">
        {page > 1 ? (
          <>
            <Link
              href={getDealsHref({ tab, page: 1, letter, sort })}
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              First
            </Link>

            <Link
              href={getDealsHref({ tab, page: page - 1, letter, sort })}
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              Previous
            </Link>
          </>
        ) : null}

        {pages.map((pageNumber, index) => {
          const previous = pages[index - 1]
          const showGap = previous && pageNumber - previous > 1

          return (
            <span key={pageNumber} className="flex gap-2">
              {showGap ? (
                <span className="rounded-xl px-2 py-2 text-sm font-semibold text-zinc-500">
                  ...
                </span>
              ) : null}

              <Link
                href={getDealsHref({
                  tab,
                  page: pageNumber,
                  letter,
                  sort,
                })}
                className={
                  pageNumber === page
                    ? 'rounded-xl bg-white px-3 py-2 text-sm font-bold text-black'
                    : 'rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white'
                }
              >
                {pageNumber}
              </Link>
            </span>
          )
        })}

        {page < totalPages ? (
          <>
            <Link
              href={getDealsHref({ tab, page: page + 1, letter, sort })}
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              Next
            </Link>

            <Link
              href={getDealsHref({ tab, page: totalPages, letter, sort })}
              className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90"
            >
              Last
            </Link>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const params = await searchParams

  const tab = isValidTab(params.tab) ? params.tab : 'all'
  const letter = (params.letter || 'ALL').toUpperCase()
  const sort = isValidSort(params.sort) ? params.sort : 'discount'

  const page = getSafePage(params.page)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('catalog_public_cache')
    .select(
      'id, slug, title, image_url, platforms, content_type, item_type_label, release_date, current_price_amount, original_price_amount, discount_percent, ps_plus_price_amount, best_price_amount, best_price_type, has_deal, has_ps_plus_deal, metacritic_score',
      { count: 'exact' }
    )
    .eq('region_code', 'us')
    .eq('storefront', 'playstation')
    .gt('best_price_amount', 0)
    .lt('discount_percent', 100)
    .or('has_deal.eq.true,has_ps_plus_deal.eq.true')

  if (tab === 'games') {
    query = query.eq('content_type', 'game').eq('item_type_label', 'game')
  }

  if (tab === 'bundles') {
    query = query.eq('content_type', 'bundle').eq('item_type_label', 'bundle')
  }

  if (tab === 'addons') {
    query = query.or(
      'and(content_type.eq.game,item_type_label.eq.addon),content_type.eq.dlc'
    )
  }

  query = applyLetterFilter(query, letter)

  if (sort === 'az') {
    query = query.order('title', { ascending: true })
  }

  if (sort === 'metacritic') {
    query = query
      .not('metacritic_score', 'is', null)
      .order('metacritic_score', { ascending: false, nullsFirst: false })
      .order('discount_percent', { ascending: false, nullsFirst: false })
      .order('title', { ascending: true })
  }

  if (sort === 'discount') {
    query = query
      .order('discount_percent', { ascending: false, nullsFirst: false })
      .order('title', { ascending: true })
  }

  const { data, error, count } = await query.range(from, to)

  const items = (data || []) as ItemCardData[]
  const totalItems = count || 0
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-[1700px] px-6 py-10">
        <section className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6 md:p-8">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Deals
            </h1>

            <div className="shrink-0 rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-300 sm:text-sm">
              <span className="font-semibold text-white">{totalItems}</span>{' '}
              deals found
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-2">
            <details className="group">
              <summary className="flex h-12 cursor-pointer list-none items-center justify-center rounded-xl border border-zinc-800 bg-black px-2 text-xs font-black text-white transition hover:border-zinc-600 [&::-webkit-details-marker]:hidden">
                Type
              </summary>

              <div className="absolute left-0 right-0 z-40 mt-2 rounded-2xl border border-zinc-800 bg-black p-3 shadow-2xl">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {tabs.map((item) => {
                    const isActive = item.key === tab

                    return (
                      <Link
                        key={item.key}
                        href={getDealsHref({
                          tab: item.key,
                          letter,
                          sort,
                        })}
                        className={
                          isActive
                            ? 'rounded-xl bg-white px-3 py-2 text-center text-xs font-bold text-black'
                            : 'rounded-xl border border-zinc-700 px-3 py-2 text-center text-xs font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white'
                        }
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            </details>

            <details className="group">
              <summary className="flex h-12 cursor-pointer list-none items-center justify-center rounded-xl border border-zinc-800 bg-black px-2 text-xs font-black text-white transition hover:border-zinc-600 [&::-webkit-details-marker]:hidden">
                Category
              </summary>

              <div className="absolute left-0 right-0 z-40 mt-2 rounded-2xl border border-zinc-800 bg-black p-3 shadow-2xl">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {sortOptions.map((item) => {
                    const isActive = item.key === sort

                    return (
                      <Link
                        key={item.key}
                        href={getDealsHref({
                          tab,
                          letter,
                          sort: item.key,
                        })}
                        className={
                          isActive
                            ? 'rounded-xl bg-white px-3 py-2 text-center text-xs font-bold text-black'
                            : 'rounded-xl border border-zinc-700 px-3 py-2 text-center text-xs font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white'
                        }
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            </details>

            <details className="group">
              <summary className="flex h-12 cursor-pointer list-none items-center justify-center rounded-xl border border-zinc-800 bg-black px-2 text-xs font-black text-white transition hover:border-zinc-600 [&::-webkit-details-marker]:hidden">
                Letters
              </summary>

              <div className="absolute left-0 right-0 z-40 mt-2 rounded-2xl border border-zinc-800 bg-black p-3 shadow-2xl">
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-9 md:grid-cols-12">
                  <Link
                    href={getDealsHref({ tab, sort })}
                    className={
                      letter === 'ALL'
                        ? 'rounded-lg bg-white px-2 py-2 text-center text-xs font-bold text-black'
                        : 'rounded-lg border border-zinc-700 px-2 py-2 text-center text-xs font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white'
                    }
                  >
                    All
                  </Link>

                  {letters.map((item) => {
                    const normalizedLetter = item.toUpperCase()
                    const isActive = letter === normalizedLetter

                    return (
                      <Link
                        key={item}
                        href={getDealsHref({
                          tab,
                          letter: normalizedLetter,
                          sort,
                        })}
                        className={
                          isActive
                            ? 'rounded-lg bg-white px-2 py-2 text-center text-xs font-bold text-black'
                            : 'rounded-lg border border-zinc-700 px-2 py-2 text-center text-xs font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white'
                        }
                      >
                        {item}
                      </Link>
                    )
                  })}
                </div>
              </div>
            </details>
          </div>
        </section>

        <div className="mb-6">
          <Pagination
            page={page}
            totalPages={totalPages}
            tab={tab}
            letter={letter}
            sort={sort}
          />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
            We could not load deals right now.
          </div>
        ) : null}

        {!error && items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">
            No active deals found.
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </section>

        <div className="mt-8">
          <Pagination
            page={page}
            totalPages={totalPages}
            tab={tab}
            letter={letter}
            sort={sort}
          />
        </div>
      </div>
    </main>
  )
}