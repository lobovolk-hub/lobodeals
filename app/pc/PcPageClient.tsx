'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getStoreLogo, getStoreName } from '@/lib/storeMap'
import { supabase } from '@/lib/supabaseClient'
import { trackClick } from '@/lib/analytics'

type PcBrowseItem = {
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
  isFreeToPlay: boolean
  hasActiveOffer: boolean
  isCatalogReady: boolean
  sortLatest?: number
}

type PcBrowsePageResponse = {
  items: PcBrowseItem[]
  totalItems: number | null
  totalPages: number | null
  page: number
  pageSize: number
  hasNextPage: boolean
  mode?: 'cache' | 'error'
  source?: string
}

type TopRatedPcGame = {
  steamAppID: string
  slug: string
  title: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  platform: string
  url: string
  metacritic: number
  isFreeToPlay: boolean
  sortLatest?: number
}

type TopRatedResponse = {
  items: TopRatedPcGame[]
  totalItems: number
  totalPages: number
  page: number
  pageSize: number
  hasNextPage: boolean
  mode?: 'top-rated'
  source?: string
}

type UnifiedCardItem = PcBrowseItem | TopRatedPcGame

const PAGE_SIZE = 36
const TOP_RATED_MIN_RESULTS = 1

const PRICE_FILTERS = [
  { value: 'all', label: 'Any price' },
  { value: 'under-5', label: 'Under $5' },
  { value: 'under-10', label: 'Under $10' },
  { value: 'over-80', label: '80%+ off' },
] as const

const SORT_FILTERS = [
  { value: 'all', label: 'PC' },
  { value: 'best-deals', label: 'Best Deals' },
  { value: 'latest-discounts', label: 'Latest Discounts' },
  { value: 'latest-releases', label: 'Latest Releases' },
  { value: 'biggest-discount', label: 'Biggest Discounts' },
  { value: 'top-rated', label: 'Top Rated' },
] as const

function buildSteamCanonicalHref(item: { title: string; slug?: string }) {
  const slug =
    String(item.slug || '').trim() ||
    item.title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')

  return `/pc/${encodeURIComponent(slug)}`
}

function pushTrackMessage(
  setTrackMessage: React.Dispatch<React.SetStateAction<string>>,
  message: string
) {
  setTrackMessage(message)
  window.setTimeout(() => setTrackMessage(''), 2500)
}

function buildPageList(currentPage: number, totalPages: number) {
  if (totalPages <= 1) return [1]

  const pages = new Set<number>()
  pages.add(1)
  pages.add(totalPages)

  for (let i = currentPage - 2; i <= currentPage + 2; i += 1) {
    if (i >= 1 && i <= totalPages) {
      pages.add(i)
    }
  }

  return Array.from(pages).sort((a, b) => a - b)
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

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm transition ${
        active
          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  )
}

function SteamCard({
  item,
  userId,
  trackedIds,
  setTrackedIds,
  setTrackMessage,
}: {
  item: UnifiedCardItem
  userId: string | null
  trackedIds: string[]
  setTrackedIds: React.Dispatch<React.SetStateAction<string[]>>
  setTrackMessage: React.Dispatch<React.SetStateAction<string>>
}) {
  const display = getCardDisplayState(item)
  const steamDealID = `steam-${item.steamAppID}`
  const isTracked = Array.isArray(trackedIds) && trackedIds.includes(steamDealID)
  const canonicalHref = buildSteamCanonicalHref(item)
  const isTopRatedItem = 'metacritic' in item

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1">
      <Link href={canonicalHref} className="block">
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
          <Link href={canonicalHref} className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-bold leading-5 text-zinc-100 transition hover:text-emerald-300 sm:text-base">
              {item.title}
            </h3>
          </Link>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {display.hasDiscount ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300 sm:text-xs">
                -{item.savings}%
              </span>
            ) : null}

            {isTopRatedItem ? (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-300 sm:text-xs">
                MC {item.metacritic}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-bold text-emerald-400 sm:text-2xl">
              {display.priceLabel}
            </p>

            {display.showNormalPrice ? (
              <p className="text-xs text-zinc-400 line-through sm:text-sm">
                ${item.normalPrice}
              </p>
            ) : null}
          </div>

          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-300">
            {getStoreLogo(item.storeID) ? (
              <img
                src={getStoreLogo(item.storeID)!}
                alt={getStoreName(item.storeID)}
                className="h-4 w-4 object-contain"
              />
            ) : null}
            <span>{getStoreName(item.storeID)}</span>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!userId) {
                pushTrackMessage(setTrackMessage, 'Sign in to track games')
                return
              }

              try {
                const {
                  data: { session },
                } = await supabase.auth.getSession()

                const accessToken = session?.access_token

                if (!accessToken) {
                  pushTrackMessage(setTrackMessage, 'Sign in to track games')
                  return
                }

                const res = await fetch('/api/track', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify({
                    dealID: steamDealID,
                    gameID: '',
                    title: item.title,
                    thumb: item.thumb,
                    salePrice: item.salePrice,
                    normalPrice: item.normalPrice,
                    storeID: item.storeID || '1',
                  }),
                })

                const data = await res.json()

                if (data.success && data.action === 'added') {
                  setTrackedIds((prev) =>
                    prev.includes(steamDealID) ? prev : [...prev, steamDealID]
                  )
                  trackClick({
                    dealID: steamDealID,
                    title: item.title,
                    salePrice: item.salePrice,
                    normalPrice: item.normalPrice,
                    clickType: 'track_add',
                  })
                  pushTrackMessage(setTrackMessage, `Added to tracked: ${item.title}`)
                  return
                }

                if (data.success && data.action === 'removed') {
                  setTrackedIds((prev) => prev.filter((id) => id !== steamDealID))
                  trackClick({
                    dealID: steamDealID,
                    title: item.title,
                    salePrice: item.salePrice,
                    normalPrice: item.normalPrice,
                    clickType: 'track_remove',
                  })
                  pushTrackMessage(setTrackMessage, `Removed from tracked: ${item.title}`)
                  return
                }

                pushTrackMessage(
                  setTrackMessage,
                  `Track error: ${data.error || 'Unknown error'}`
                )
              } catch {
                pushTrackMessage(setTrackMessage, 'Could not update tracked right now')
              }
            }}
            className={`rounded-xl px-4 py-2 text-center text-sm font-medium transition ${
              isTracked
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800'
            }`}
          >
            {isTracked ? 'Tracked' : 'Track game'}
          </button>

          <Link
            href={canonicalHref}
            onClick={() =>
              trackClick({
                dealID: steamDealID,
                title: item.title,
                salePrice: item.salePrice,
                normalPrice: item.normalPrice,
                clickType: 'card_click_pc',
              })
            }
            className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
          >
            Open game page
          </Link>
        </div>
      </div>
    </article>
  )
}

export default function PcPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentPage = Math.max(1, Number(searchParams.get('page') || '1'))
  const activeQuery = searchParams.get('q') || ''
  const requestedSort = searchParams.get('sort') || 'all'
  const priceFilter = searchParams.get('price') || 'all'

  const [queryInput, setQueryInput] = useState(activeQuery)
  const [browseGames, setBrowseGames] = useState<PcBrowseItem[]>([])
  const [browseTotalItems, setBrowseTotalItems] = useState(0)
  const [browseTotalPages, setBrowseTotalPages] = useState(1)
  const [topRatedGames, setTopRatedGames] = useState<TopRatedPcGame[]>([])

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [trackedIds, setTrackedIds] = useState<string[]>([])
  const [trackMessage, setTrackMessage] = useState('')

  const topRatedReady = topRatedGames.length >= TOP_RATED_MIN_RESULTS
  const sort = requestedSort

  useEffect(() => {
    setQueryInput(activeQuery)
  }, [activeQuery])

  const buildUrl = (page: number, updates?: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())

    params.set('page', String(page))

    Object.entries(updates || {}).forEach(([key, value]) => {
      if (!value || value === 'all') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })

    const queryString = params.toString()
    return `/pc${queryString ? `?${queryString}` : ''}`
  }

  const applyPrice = (value: string) => {
    router.push(buildUrl(1, { price: value }))
  }

  const applySort = (value: string) => {
    router.push(buildUrl(1, { sort: value }))
  }

  const applyQuery = () => {
    const trimmed = queryInput.trim()
    router.push(buildUrl(1, { q: trimmed || null }))
  }

  const clearQuery = () => {
    setQueryInput('')
    router.push(buildUrl(1, { q: null }))
  }

  const resetFilters = () => {
    setQueryInput('')
    router.push('/pc?page=1')
  }

  useEffect(() => {
    let cancelled = false

    const loadUserState = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const currentUserId = session?.user?.id ?? null

        if (!cancelled) {
          setUserId(currentUserId)
        }

        if (currentUserId) {
          const { data } = await supabase
            .from('tracked_games')
            .select('deal_id')
            .eq('user_id', currentUserId)

          if (!cancelled) {
            setTrackedIds(Array.isArray(data) ? data.map((row) => row.deal_id) : [])
          }
        } else if (!cancelled) {
          setTrackedIds([])
        }
      } catch (error) {
        console.error(error)
      }
    }

    loadUserState()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadView = async () => {
      try {
        setLoading(true)

        if (sort === 'top-rated') {
          const params = new URLSearchParams()
          params.set('page', String(currentPage))
          params.set('pageSize', String(PAGE_SIZE))

          if (activeQuery.trim()) params.set('q', activeQuery.trim())
          if (priceFilter !== 'all') params.set('price', priceFilter)

          const topRatedRes = await fetch(`/api/pc-top-rated?${params.toString()}`)
          const topRatedData: TopRatedResponse = await topRatedRes.json()

          if (!cancelled) {
            setTopRatedGames(
              Array.isArray(topRatedData?.items) ? topRatedData.items : []
            )
            setBrowseGames([])
            setBrowseTotalItems(Number(topRatedData?.totalItems || 0))
            setBrowseTotalPages(Math.max(1, Number(topRatedData?.totalPages || 1)))
          }

          return
        }

        const params = new URLSearchParams()
        params.set('page', String(currentPage))
        params.set('pageSize', String(PAGE_SIZE))

        if (activeQuery.trim()) params.set('q', activeQuery.trim())
        if (sort !== 'all') params.set('sort', sort)
        if (priceFilter !== 'all') params.set('price', priceFilter)

        const browseRes = await fetch(`/api/pc-browse-page?${params.toString()}`)
        const browseData: PcBrowsePageResponse = await browseRes.json()

        if (!cancelled) {
          setBrowseGames(Array.isArray(browseData?.items) ? browseData.items : [])
          setBrowseTotalItems(Number(browseData?.totalItems || 0))
          setBrowseTotalPages(Math.max(1, Number(browseData?.totalPages || 1)))
          setTopRatedGames([])
        }
      } catch (error) {
        console.error(error)

        if (!cancelled) {
          setBrowseGames([])
          setBrowseTotalItems(0)
          setBrowseTotalPages(1)
          setTopRatedGames([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadView()

    return () => {
      cancelled = true
    }
  }, [currentPage, activeQuery, sort, priceFilter])

  const filteredDeals = useMemo(() => {
    if (sort === 'top-rated' && topRatedReady) {
      return {
        mode: 'top-rated' as const,
        items: topRatedGames,
      }
    }

    return {
      mode: 'browse' as const,
      items: browseGames,
    }
  }, [browseGames, topRatedGames, sort, topRatedReady])

  const isServerBrowseMode =
    filteredDeals.mode === 'browse' &&
    sort !== 'top-rated'

  const totalItems = isServerBrowseMode
    ? browseTotalItems
    : filteredDeals.items.length

  const totalPages = isServerBrowseMode
    ? Math.max(1, browseTotalPages)
    : Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  const safePage = Math.min(currentPage, totalPages)

  const paginatedItems: UnifiedCardItem[] = isServerBrowseMode
    ? filteredDeals.items
    : filteredDeals.items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const activeFilterLabels = [
    activeQuery.trim() ? `Search: "${activeQuery.trim()}"` : null,
    priceFilter === 'under-5'
      ? 'Under $5'
      : priceFilter === 'under-10'
      ? 'Under $10'
      : priceFilter === 'over-80'
      ? '80%+ off'
      : null,
    sort === 'best-deals'
      ? 'Best Deals'
      : sort === 'top-rated'
      ? 'Top Rated'
      : sort === 'biggest-discount'
      ? 'Biggest Discounts'
      : sort === 'latest-releases'
      ? 'Latest Releases'
      : sort === 'latest-discounts'
      ? 'Latest Discounts'
      : null,
  ].filter(Boolean) as string[]

  const hasActiveFilters =
    !!activeQuery.trim() ||
    priceFilter !== 'all' ||
    sort !== 'all'

  const pageList = useMemo(() => buildPageList(safePage, totalPages), [safePage, totalPages])

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    applyQuery()
                  }
                }}
                placeholder="Search PC games"
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
              />

              {queryInput.trim().length > 0 ? (
                <button
                  type="button"
                  onClick={clearQuery}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={applyQuery}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
            >
              Search
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {SORT_FILTERS.map((item) => (
              <FilterChip
                key={item.value}
                label={item.label}
                active={sort === item.value}
                onClick={() => applySort(item.value)}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {PRICE_FILTERS.map((price) => (
              <FilterChip
                key={price.value}
                label={price.label}
                active={priceFilter === price.value}
                onClick={() => applyPrice(price.value)}
              />
            ))}
          </div>
        </div>

        {hasActiveFilters ? (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {activeFilterLabels.map((label) => (
              <span
                key={label}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300"
              >
                {label}
              </span>
            ))}

            <button
              type="button"
              onClick={resetFilters}
              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
            >
              Reset all
            </button>
          </div>
        ) : null}

        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="text-sm text-zinc-400">
            {loading ? 'Loading...' : `${totalItems.toLocaleString()} games`}
          </div>

          {trackMessage ? (
            <div className="text-sm text-emerald-300">{trackMessage}</div>
          ) : null}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900"
              >
                <div className="h-32 w-full animate-pulse bg-zinc-800 sm:h-36" />
                <div className="p-4">
                  <div className="h-4 animate-pulse rounded bg-zinc-800" />
                  <div className="mt-3 h-9 animate-pulse rounded bg-zinc-800" />
                  <div className="mt-3 h-8 animate-pulse rounded bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : paginatedItems.length === 0 ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-sm text-zinc-400">
            No games found for the current filters.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
              {paginatedItems.map((item) => (
                <SteamCard
                  key={`${item.steamAppID}-${item.title}`}
                  item={item}
                  userId={userId}
                  trackedIds={trackedIds}
                  setTrackedIds={setTrackedIds}
                  setTrackMessage={setTrackMessage}
                />
              ))}
            </div>

            {totalPages > 1 ? (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => router.push(buildUrl(safePage - 1))}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>

                {pageList.map((pageNumber, index) => {
                  const previous = pageList[index - 1]
                  const showDots = previous && pageNumber - previous > 1

                  return (
                    <div key={pageNumber} className="flex items-center gap-2">
                      {showDots ? (
                        <span className="px-1 text-sm text-zinc-500">…</span>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => router.push(buildUrl(pageNumber))}
                        className={`rounded-xl px-4 py-2 text-sm transition ${
                          pageNumber === safePage
                            ? 'bg-white text-black'
                            : 'border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    </div>
                  )
                })}

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => router.push(buildUrl(safePage + 1))}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  )
}