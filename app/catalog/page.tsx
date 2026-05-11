import Link from 'next/link'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { ItemCard } from '@/components/item-card'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata: Metadata = {
  title: 'PlayStation catalog',
  description:
    'Browse the LoboDeals PlayStation catalog with PS4 and PS5 games, bundles, add-ons, prices, release dates, and Metacritic scores.',
  alternates: {
    canonical: '/catalog',
  },
  openGraph: {
    title: 'PlayStation catalog | LoboDeals',
    description:
      'Browse PS4 and PS5 games, bundles, add-ons, prices, release dates, and Metacritic scores.',
    url: '/catalog',
  },
}

type CatalogSearchParams = {
  q?: string
  tab?: string
  page?: string
  letter?: string
  sort?: string
}

type CatalogPageProps = {
  searchParams: Promise<CatalogSearchParams>
}

type CatalogItem = {
  id: string
  item_id: string
  slug: string
  title: string
  image_url: string
  platforms: string[]
  content_type: string | null
  item_type_label: string | null
  release_date: string | null
  current_price_amount: number | null
  original_price_amount: number | null
  discount_percent: number | null
  ps_plus_price_amount: number | null
  best_price_amount: number | null
  best_price_type: 'regular' | 'ps_plus' | 'none'
  has_deal: boolean
  has_ps_plus_deal: boolean
  metacritic_score: number | null
}

type CatalogSearchRow = CatalogItem & {
  total_count: number | string | null
}

const PAGE_SIZE = 36

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'games', label: 'Games' },
  { key: 'bundles', label: 'Bundles' },
  { key: 'addons', label: 'Add-ons' },
] as const

const sortModes = [
  { key: 'title', label: 'Title' },
  { key: 'metacritic', label: 'Top Rated by Metacritic' },
  { key: 'upcoming', label: 'Upcoming Games' },
  { key: 'latest', label: 'Latest Releases' },
] as const

const letters = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), 'Other']

type TabKey = (typeof tabs)[number]['key']
type SortKey = (typeof sortModes)[number]['key']

function isValidTab(value: string | undefined): value is TabKey {
  return tabs.some((tab) => tab.key === value)
}

function isValidSort(value: string | undefined): value is SortKey {
  return sortModes.some((sortMode) => sortMode.key === value)
}

function cleanSearchQuery(value: string) {
  return value.replace(/[%_]/g, '').trim()
}

function getSafePage(value: string | undefined) {
  const parsed = Number(value || '1')

  if (!Number.isFinite(parsed)) {
    return 1
  }

  return Math.max(1, Math.floor(parsed))
}

function getCatalogHref({
  tab,
  q,
  page,
  letter,
  sort,
}: {
  tab: TabKey
  q: string
  page?: number
  letter?: string
  sort?: SortKey
}) {
  const params = new URLSearchParams()
  params.set('tab', tab)

  if (q) params.set('q', q)
  if (page && page > 1) params.set('page', String(page))
  if (letter && letter !== 'ALL') params.set('letter', letter)
  if (sort && sort !== 'title') params.set('sort', sort)

  return `/catalog?${params.toString()}`
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
  q,
  letter,
  sort,
}: {
  page: number
  totalPages: number
  tab: TabKey
  q: string
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
              href={getCatalogHref({ tab, q, page: 1, letter, sort })}
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              First
            </Link>

            <Link
              href={getCatalogHref({ tab, q, page: page - 1, letter, sort })}
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
                href={getCatalogHref({
                  tab,
                  q,
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
              href={getCatalogHref({
                tab,
                q,
                page: page + 1,
                letter,
                sort,
              })}
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              Next
            </Link>

            <Link
              href={getCatalogHref({
                tab,
                q,
                page: totalPages,
                letter,
                sort,
              })}
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

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams

  const q = (params.q || '').trim()
  const safeQ = cleanSearchQuery(q)
  const tab = isValidTab(params.tab) ? params.tab : 'all'
  const sort = isValidSort(params.sort) ? params.sort : 'title'
  const letter = (params.letter || 'ALL').toUpperCase()

  const page = getSafePage(params.page)
  const from = (page - 1) * PAGE_SIZE

  const { data, error } = await supabase.rpc('search_catalog_public_cache', {
    p_q: safeQ,
    p_tab: tab,
    p_letter: letter,
    p_sort: sort,
    p_limit: PAGE_SIZE,
    p_offset: from,
  })

  const rows = (data || []) as CatalogSearchRow[]

  const items = rows.map((row) => {
    const { total_count, ...item } = row
    return item
  }) as CatalogItem[]

  const totalItems =
    rows.length > 0 && rows[0].total_count !== null
      ? Number(rows[0].total_count)
      : 0

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-[1700px] px-6 py-10">
        <section className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                Catalog
              </h1>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-300">
              <span className="font-semibold text-white">{totalItems}</span>{' '}
              items found
            </div>
          </div>

          <form action="/catalog" method="get" className="mt-6">
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="letter" value={letter} />
            <input type="hidden" name="sort" value={sort} />

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search games, DLC, bundles..."
                className="h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-500"
              />

              <button
                type="submit"
                className="h-12 rounded-xl bg-[#990303] px-6 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Search
              </button>
            </div>
          </form>

          <div className="mt-5 space-y-3 lg:hidden">
  <details className="rounded-2xl border border-zinc-800 bg-black">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-white [&::-webkit-details-marker]:hidden">
      <span>Type</span>
      <span className="text-zinc-500">
        {tabs.find((item) => item.key === tab)?.label || 'All'}
      </span>
    </summary>

    <div className="grid grid-cols-2 gap-2 border-t border-zinc-800 p-3">
      {tabs.map((item) => {
        const isActive = item.key === tab

        return (
          <Link
            key={item.key}
            href={getCatalogHref({
              tab: item.key,
              q,
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
  </details>

  <details className="rounded-2xl border border-zinc-800 bg-black">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-white [&::-webkit-details-marker]:hidden">
      <span>Category</span>
      <span className="text-zinc-500">
        {sortModes.find((item) => item.key === sort)?.label || 'Title'}
      </span>
    </summary>

    <div className="grid grid-cols-1 gap-2 border-t border-zinc-800 p-3">
      {sortModes.map((sortMode) => {
        const isActive = sortMode.key === sort

        return (
          <Link
            key={sortMode.key}
            href={getCatalogHref({
              tab,
              q,
              letter,
              sort: sortMode.key,
            })}
            className={
              isActive
                ? 'rounded-xl bg-white px-3 py-2 text-center text-xs font-bold text-black'
                : 'rounded-xl border border-zinc-700 px-3 py-2 text-center text-xs font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white'
            }
          >
            {sortMode.label}
          </Link>
        )
      })}
    </div>
  </details>

  <details className="rounded-2xl border border-zinc-800 bg-black">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-white [&::-webkit-details-marker]:hidden">
      <span>Letters</span>
      <span className="text-zinc-500">
        {letter === 'ALL' ? 'All' : letter}
      </span>
    </summary>

    <div className="grid grid-cols-6 gap-2 border-t border-zinc-800 p-3">
      <Link
        href={getCatalogHref({ tab, q, sort })}
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
            href={getCatalogHref({
              tab,
              q,
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
  </details>
</div>

<div className="mt-5 hidden flex-wrap gap-2 lg:flex">
  {tabs.map((item) => {
    const isActive = item.key === tab

    return (
      <Link
        key={item.key}
        href={getCatalogHref({
          tab: item.key,
          q,
          letter,
          sort,
        })}
        className={
          isActive
            ? 'rounded-full bg-white px-4 py-2 text-sm font-semibold text-black'
            : 'rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white'
        }
      >
        {item.label}
      </Link>
    )
  })}
</div>

<div className="mt-4 hidden flex-wrap gap-2 lg:flex">
  {sortModes.map((sortMode) => {
    const isActive = sortMode.key === sort

    return (
      <Link
        key={sortMode.key}
        href={getCatalogHref({
          tab,
          q,
          letter,
          sort: sortMode.key,
        })}
        className={
          isActive
            ? 'rounded-full bg-white px-4 py-2 text-sm font-bold text-black'
            : 'rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white'
        }
      >
        {sortMode.label}
      </Link>
    )
  })}
</div>

<div className="mt-5 hidden flex-wrap gap-1 lg:flex">
  <Link
    href={getCatalogHref({ tab, q, sort })}
    className={
      letter === 'ALL'
        ? 'rounded-lg bg-white px-3 py-2 text-xs font-bold text-black'
        : 'rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white'
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
        href={getCatalogHref({
          tab,
          q,
          letter: normalizedLetter,
          sort,
        })}
        className={
          isActive
            ? 'rounded-lg bg-white px-3 py-2 text-xs font-bold text-black'
            : 'rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white'
        }
      >
        {item}
      </Link>
    )
  })}
</div>
        </section>

        <div className="mb-6">
          <Pagination
            page={page}
            totalPages={totalPages}
            tab={tab}
            q={q}
            letter={letter}
            sort={sort}
          />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
            We could not load the catalog right now.
          </div>
        ) : null}

        {!error && items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">
            No items found.
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
            q={q}
            letter={letter}
            sort={sort}
          />
        </div>
      </div>
    </main>
  )
}