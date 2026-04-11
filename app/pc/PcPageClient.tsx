'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { normalizePcSectionKey } from '@/lib/server/pcSectionRules'

type BrowseItem = {
  id: string
  steamAppID: string
  slug: string
  title: string
  thumb: string | null
  salePrice: string | null
  normalPrice: string | null
  savings: string | null
  storeID: string | null
  url: string | null
  isFreeToPlay: boolean
  hasActiveOffer: boolean
  isCatalogReady: boolean
  sortLatest: number
  metacritic?: number | null
}

type BrowseResponse = {
  items: BrowseItem[]
  totalItems: number
  totalPages: number
  page: number
  pageSize: number
  hasNextPage: boolean
  mode: string
  source: string
  appliedSort?: string
}

type PcPageClientProps = {
  initialPage?: number | string
  initialSort?: string
  initialQuery?: string
  initialPrice?: string
  initialPageSize?: number | string
  [key: string]: unknown
}

const PAGE_SIZE = 36

const SORT_OPTIONS = [
  { key: 'all', label: 'PC' },
  { key: 'best-deals', label: 'Best Deals' },
  { key: 'latest-discounts', label: 'Latest Discounts' },
  { key: 'latest-releases', label: 'Latest Releases' },
  { key: 'biggest-discount', label: 'Biggest Discounts' },
  { key: 'top-rated', label: 'Top Rated' },
] as const

const PRICE_OPTIONS = [
  { key: '', label: 'Any price' },
  { key: 'under-5', label: 'Under $5' },
  { key: 'under-10', label: 'Under $10' },
  { key: '80-plus', label: '80%+ off' },
] as const

function moneyLabel(item: BrowseItem) {
  const nowEpoch = Math.floor(Date.now() / 1000)
  const isUpcoming = Number(item.sortLatest || 0) > nowEpoch

  if (isUpcoming) return 'TBA'
  if (item.isFreeToPlay) return 'Free'
  if (item.salePrice) return `$${item.salePrice}`
  if (item.normalPrice) return `$${item.normalPrice}`
  return 'No price'
}

function originalPriceLabel(item: BrowseItem) {
  const sale = Number(item.salePrice || 0)
  const normal = Number(item.normalPrice || 0)

  if (
    Number.isFinite(sale) &&
    Number.isFinite(normal) &&
    sale > 0 &&
    normal > sale
  ) {
    return `$${item.normalPrice}`
  }

  return null
}

function gameHref(item: BrowseItem) {
  return `/pc/${item.slug}`
}

function getPriceFilterLabel(value: string) {
  const match = PRICE_OPTIONS.find((option) => option.key === value)
  return match?.label || value
}

export default function PcPageClient(props: PcPageClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentPage = Math.max(
    1,
    Number(searchParams.get('page') || props.initialPage || 1) || 1
  )
  const currentSort = normalizePcSectionKey(
    searchParams.get('sort') || String(props.initialSort || 'all')
  )
  const currentQuery = String(
    searchParams.get('q') || props.initialQuery || ''
  ).trim()
  const currentPrice = String(
    searchParams.get('price') || props.initialPrice || ''
  ).trim()

  const [inputValue, setInputValue] = useState(currentQuery)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<BrowseResponse>({
    items: [],
    totalItems: 0,
    totalPages: 1,
    page: currentPage,
    pageSize: PAGE_SIZE,
    hasNextPage: false,
    mode: 'cache',
    source: 'pc_public_catalog_cache',
    appliedSort: currentSort,
  })

  useEffect(() => {
    setInputValue(currentQuery)
  }, [currentQuery])

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(currentPage))
    params.set('pageSize', String(PAGE_SIZE))
    params.set('sort', currentSort)

    if (currentQuery) {
      params.set('q', currentQuery)
    }

    if (currentPrice) {
      params.set('price', currentPrice)
    }

    return `/api/pc-browse-page?${params.toString()}`
  }, [currentPage, currentSort, currentQuery, currentPrice])

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(requestUrl, { cache: 'no-store' })
        const json = (await res.json()) as BrowseResponse | { error?: string }

        if (!res.ok) {
          throw new Error(
            'error' in json && json.error
              ? json.error
              : 'Failed to load /pc browse page'
          )
        }

        if (!cancelled) {
          setData(json as BrowseResponse)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown client error')
          setData((prev) => ({
            ...prev,
            items: [],
            totalItems: 0,
            totalPages: 1,
            hasNextPage: false,
          }))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [requestUrl])

  function updateUrl(next: {
    page?: number
    sort?: string
    q?: string
    price?: string
  }) {
    const params = new URLSearchParams(searchParams.toString())

    const nextPage = Math.max(1, Number(next.page ?? currentPage) || 1)
    const nextSort = normalizePcSectionKey(next.sort ?? currentSort)
    const nextQuery = String(next.q ?? currentQuery).trim()
    const nextPrice = String(next.price ?? currentPrice).trim()

    params.set('page', String(nextPage))
    params.set('sort', nextSort)

    if (nextQuery) {
      params.set('q', nextQuery)
    } else {
      params.delete('q')
    }

    if (nextPrice) {
      params.set('price', nextPrice)
    } else {
      params.delete('price')
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function handleSearchSubmit() {
    updateUrl({
      page: 1,
      q: inputValue,
    })
  }

  function handleResetAll() {
    setInputValue('')
    router.replace(`${pathname}?page=1&sort=all`, { scroll: false })
  }

  const pageLabel =
    data.totalPages > 1
      ? `Page ${data.page} of ${data.totalPages}`
      : 'Page 1 of 1'

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
      <div className="mb-6">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearchSubmit()
              }
            }}
            placeholder="Search PC games"
            className="h-12 flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-white outline-none ring-0 placeholder:text-white/40"
          />
          <button
            onClick={handleSearchSubmit}
            className="h-12 rounded-2xl bg-white px-6 font-semibold text-black"
          >
            Search
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {SORT_OPTIONS.map((option) => {
          const active = currentSort === option.key
          return (
            <button
              key={option.key}
              onClick={() => updateUrl({ page: 1, sort: option.key })}
              className={[
                'rounded-xl border px-4 py-2 text-sm transition',
                active
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/10 bg-white/[0.03] text-white/85 hover:bg-white/[0.06]',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {PRICE_OPTIONS.map((option) => {
          const active = currentPrice === option.key
          return (
            <button
              key={option.label}
              onClick={() => updateUrl({ page: 1, price: option.key })}
              className={[
                'rounded-xl border px-4 py-2 text-sm transition',
                active
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/10 bg-white/[0.03] text-white/85 hover:bg-white/[0.06]',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}

        {(currentQuery || currentPrice || currentSort !== 'all') && (
          <button
            onClick={handleResetAll}
            className="rounded-xl border border-emerald-500/60 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-300"
          >
            Reset all
          </button>
        )}
      </div>

      {(currentQuery || currentPrice) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-white/70">
          {currentQuery && (
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              Search: "{currentQuery}"
            </span>
          )}
          {currentPrice && (
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              Price filter: {getPriceFilterLabel(currentPrice)}
            </span>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="text-sm text-white/70">
          {loading ? 'Loading…' : `${data.totalItems.toLocaleString()} games`}
        </div>

        <div className="text-sm text-white/60">{pageLabel}</div>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {data.items.map((item) => (
          <div
            key={item.id}
            className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
          >
            <Link href={gameHref(item)} className="block">
              <div className="aspect-[16/9] w-full overflow-hidden bg-white/[0.04]">
                {item.thumb ? (
                  <img
                    src={item.thumb}
                    alt={item.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
                    No image
                  </div>
                )}
              </div>
            </Link>

            <div className="p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={gameHref(item)} className="block">
                    <div className="line-clamp-2 text-sm font-semibold text-white transition hover:text-emerald-300">
                      {item.title}
                    </div>
                  </Link>
                </div>

                {typeof item.metacritic === 'number' && item.metacritic > 0 && (
                  <span className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    MC {item.metacritic}
                  </span>
                )}
              </div>

              <div className="mb-2 flex flex-wrap items-center gap-2">
                {item.savings && Number(item.savings) > 0 && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                    -{item.savings}%
                  </span>
                )}
                {item.isFreeToPlay && (
                  <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                    Free to play
                  </span>
                )}
              </div>

              <div className="rounded-2xl bg-black/40 p-3">
                <div className="text-2xl font-bold text-emerald-400">
                  {moneyLabel(item)}
                </div>
                {originalPriceLabel(item) && (
                  <div className="text-sm text-white/45 line-through">
                    {originalPriceLabel(item)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && data.items.length === 0 && !error && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/70">
          No games found.
        </div>
      )}

      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          disabled={currentPage <= 1}
          onClick={() => updateUrl({ page: currentPage - 1 })}
          className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>

        <span className="text-sm text-white/70">{pageLabel}</span>

        <button
          disabled={!data.hasNextPage}
          onClick={() => updateUrl({ page: currentPage + 1 })}
          className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}