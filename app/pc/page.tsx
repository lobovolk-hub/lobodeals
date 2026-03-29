'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  FEATURED_STORE_OPTIONS,
  getStoreLogo,
  getStoreName,
  isAllowedStore,
} from '@/lib/storeMap'
import { getPlatformLabel } from '@/lib/platformMap'
import { groupDealsByGame } from '@/lib/groupDeals'
import RegionNotice from '@/app/components/RegionNotice'

type Deal = {
  dealID: string
  gameID?: string
  title: string
  thumb: string
  salePrice: string
  normalPrice: string
  savings: string
  dealRating: string
  metacriticScore?: string
  storeID: string
}

type SteamSpotlightItem = {
  steamAppID: string
  title: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  platform: string
  url: string
}

type DealsStats = {
  dealsIndexed: number
  steamIndexed: number
  dealsUpdatedAt: string | null
  steamUpdatedAt: string | null
}

const PAGE_SIZE = 36

const STEAM_PREVIEW_LIMIT = 4

function normalizeSteamTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[:\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function shouldShowSteamPreview(options: {
  currentPage: number
  query: string
  storeFilter: string
  priceFilter: string
  sort: string
}) {
  const { currentPage, query, storeFilter, priceFilter, sort } = options

  if (sort === 'steam-spotlight') return false
  if (currentPage !== 1) return false
  if (query.trim()) return false
  if (storeFilter !== 'all') return false
  if (priceFilter !== 'all') return false

  return true
}

function pushTrackMessage(
  setTrackMessage: React.Dispatch<React.SetStateAction<string>>,
  message: string
) {
  setTrackMessage(message)
  window.setTimeout(() => setTrackMessage(''), 2500)
}

export default function PCPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
          <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            Loading PC games...
          </section>
        </main>
      }
    >
      <PCPageContent />
    </Suspense>
  )
}

function PCPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentPage = Number(searchParams.get('page') || '1')
  const sort = searchParams.get('sort') || 'all'
  const query = searchParams.get('q') || ''
  const priceFilter = searchParams.get('price') || 'all'
  const storeFilter = searchParams.get('store') || 'all'

  const [deals, setDeals] = useState<Deal[]>([])
  const [steamSpotlight, setSteamSpotlight] = useState<SteamSpotlightItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [trackedIds, setTrackedIds] = useState<string[]>([])
  const [trackMessage, setTrackMessage] = useState('')
  const [dealsStats, setDealsStats] = useState<DealsStats>({
    dealsIndexed: 0,
    steamIndexed: 0,
    dealsUpdatedAt: null,
    steamUpdatedAt: null,
  })
  const [searchInput, setSearchInput] = useState(query)

  useEffect(() => {
    setSearchInput(query)
  }, [query])

  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const [dealsRes, steamRes, statsRes] = await Promise.all([
  fetch('/api/deals'),
  fetch('/api/steam-spotlight'),
  fetch('/api/deals-stats'),
])

        const dealsData = await dealsRes.json()
        const steamData = await steamRes.json()
        const statsData = await statsRes.json()

        setDeals(Array.isArray(dealsData) ? dealsData : [])
        setSteamSpotlight(Array.isArray(steamData) ? steamData : [])
        setDealsStats({
          dealsIndexed: Number(statsData?.dealsIndexed || 0),
          steamIndexed: Number(statsData?.steamIndexed || 0),
          dealsUpdatedAt: statsData?.dealsUpdatedAt || null,
          steamUpdatedAt: statsData?.steamUpdatedAt || null,
        })
      } catch (error) {
        console.error(error)
        setDeals([])
        setSteamSpotlight([])
      } finally {
        setLoading(false)
      }
    }

    const fetchSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const currentUserId = session?.user?.id ?? null
      setUserId(currentUserId)

      if (!currentUserId) {
        setTrackedIds([])
        return
      }

      const { data: trackedData } = await supabase
        .from('tracked_games')
        .select('deal_id')
        .eq('user_id', currentUserId)

      if (trackedData) {
        setTrackedIds(trackedData.map((item) => item.deal_id))
      }
    }

    fetchDeals()
    fetchSession()
  }, [])

  const filteredDeals = useMemo(() => {
    let list = [...deals]

    list = list.filter((deal) => isAllowedStore(deal.storeID))

    if (query.trim()) {
      const normalized = query.trim().toLowerCase()
      list = list.filter((deal) => deal.title.toLowerCase().includes(normalized))
    }

    if (storeFilter !== 'all') {
      list = list.filter((deal) => deal.storeID === storeFilter)
    }

    if (priceFilter === 'under-5') {
      list = list.filter((deal) => Number(deal.salePrice) < 5)
    }

    if (priceFilter === 'under-10') {
      list = list.filter((deal) => Number(deal.salePrice) < 10)
    }

    if (priceFilter === 'over-80') {
      list = list.filter((deal) => Number(deal.savings) >= 80)
    }

    const grouped = groupDealsByGame(list)

    switch (sort) {
      case 'best':
        return grouped.sort(
          (a, b) => Number(b.dealRating || 0) - Number(a.dealRating || 0)
        )
      case 'top-rated':
        return grouped
          .filter((deal) => Number(deal.metacriticScore || 0) > 0)
          .sort(
            (a, b) =>
              Number(b.metacriticScore || 0) - Number(a.metacriticScore || 0)
          )
      case 'biggest-discount':
        return grouped.sort((a, b) => Number(b.savings) - Number(a.savings))
      case 'steam-spotlight':
        return []
      case 'latest':
        return grouped
      default:
        return grouped
    }
  }, [deals, sort, query, priceFilter, storeFilter])

  const filteredSteamSpotlight = useMemo(() => {
    let list = [...steamSpotlight]

    if (query.trim()) {
      const normalized = query.trim().toLowerCase()
      list = list.filter((deal) => deal.title.toLowerCase().includes(normalized))
    }

    if (storeFilter !== 'all' && storeFilter !== '1') {
      return []
    }

    if (priceFilter === 'under-5') {
      list = list.filter((deal) => Number(deal.salePrice) < 5)
    }

    if (priceFilter === 'under-10') {
      list = list.filter((deal) => Number(deal.salePrice) < 10)
    }

    if (priceFilter === 'over-80') {
      list = list.filter((deal) => Number(deal.savings) >= 80)
    }

    return list
  }, [steamSpotlight, query, storeFilter, priceFilter])

const showSteamPreview = useMemo(() => {
  return shouldShowSteamPreview({
    currentPage,
    query,
    storeFilter,
    priceFilter,
    sort,
  })
}, [currentPage, query, storeFilter, priceFilter, sort])

const steamPreviewItems = useMemo(() => {
  if (!showSteamPreview) return []
  if (!steamSpotlight.length) return []

  const seenTitles = new Set<string>()
  const cheapSharkTitles = new Set(
    filteredDeals.map((deal) => normalizeSteamTitle(deal.title))
  )

  const result: SteamSpotlightItem[] = []

  const rankedSteam = [...filteredSteamSpotlight].sort((a, b) => {
    const aSavings = Number(a.savings || 0)
    const bSavings = Number(b.savings || 0)

    if (bSavings !== aSavings) {
      return bSavings - aSavings
    }

    const aPrice = Number(a.salePrice || 999999)
    const bPrice = Number(b.salePrice || 999999)

    return aPrice - bPrice
  })

  for (const item of rankedSteam) {
    const normalizedTitle = normalizeSteamTitle(item.title)

    if (seenTitles.has(normalizedTitle)) continue
    seenTitles.add(normalizedTitle)

    if (cheapSharkTitles.has(normalizedTitle)) continue

    result.push(item)

    if (result.length >= STEAM_PREVIEW_LIMIT) break
  }

  return result
}, [showSteamPreview, steamSpotlight, filteredSteamSpotlight, filteredDeals])

const activeFilterLabels = [
  query.trim() ? `Search: "${query.trim()}"` : null,
  storeFilter !== 'all' ? `Store: ${getStoreName(storeFilter)}` : null,
  priceFilter === 'under-5'
    ? 'Price: Under $5'
    : priceFilter === 'under-10'
    ? 'Price: Under $10'
    : priceFilter === 'over-80'
    ? 'Price: 80%+ off'
    : null,
  sort === 'best'
    ? 'Sort: Best Deals'
    : sort === 'top-rated'
    ? 'Sort: Top Rated'
    : sort === 'biggest-discount'
    ? 'Sort: Biggest Discounts'
    : sort === 'latest'
    ? 'Sort: Latest'
    : sort === 'steam-spotlight'
    ? 'Sort: Steam Spotlight'
    : null,
].filter(Boolean) as string[]

const hasActiveFilters =
  !!query.trim() ||
  storeFilter !== 'all' ||
  priceFilter !== 'all' ||
  sort !== 'all'

  const isSteamSpotlightMode = sort === 'steam-spotlight'

  const totalItems = isSteamSpotlightMode
    ? filteredSteamSpotlight.length
    : filteredDeals.length

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)

  const paginatedDeals = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE

    if (isSteamSpotlightMode) {
      return filteredSteamSpotlight.slice(start, start + PAGE_SIZE)
    }

    return filteredDeals.slice(start, start + PAGE_SIZE)
  }, [filteredDeals, filteredSteamSpotlight, safePage, isSteamSpotlightMode])

  const buildUrl = (
    page: number,
    overrides?: Partial<Record<'sort' | 'q' | 'price' | 'store', string>>
  ) => {
    const params = new URLSearchParams()

    params.set('page', String(page))
    params.set('sort', overrides?.sort ?? sort)

    const nextQuery = overrides?.q ?? query
    if (nextQuery.trim()) params.set('q', nextQuery)

    const nextPrice = overrides?.price ?? priceFilter
    if (nextPrice !== 'all') params.set('price', nextPrice)

    const nextStore = overrides?.store ?? storeFilter
    if (nextStore !== 'all') params.set('store', nextStore)

    return `/pc?${params.toString()}`
  }

  const applySearch = () => {
    router.push(buildUrl(1, { q: searchInput }))
  }

  const applyPrice = (value: string) => {
    router.push(buildUrl(1, { price: value }))
  }

  const applyStore = (value: string) => {
    router.push(buildUrl(1, { store: value }))
  }

  const resetFilters = () => {
    router.push('/pc?page=1&sort=all')
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          Loading PC games...
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Platform
          </p>
          <h1 className="mt-1 text-3xl font-bold">PC Deals</h1>
          <p className="mt-2 text-zinc-400">
  Browse curated PC deals from trusted stores, with a stronger Steam layer
  built directly into LoboDeals.
</p>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              PC deals indexed
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {dealsStats.dealsIndexed || deals.length}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Steam offers cached
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {dealsStats.steamIndexed || steamSpotlight.length}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Results in this view
            </p>
            <p className="mt-2 text-2xl font-bold text-white">{totalItems}</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Pages available
            </p>
            <p className="mt-2 text-2xl font-bold text-white">{totalPages}</p>
          </div>
        </div>

        <div className="mb-6">
          <RegionNotice />
        </div>

        {trackMessage ? (
          <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">
            {trackMessage}
          </div>
        ) : null}

        <div className="mb-6 grid gap-3 lg:grid-cols-[1.4fr_auto]">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applySearch()
              }}
              placeholder="Search PC games..."
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
            />
            <button
              onClick={applySearch}
              className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
            >
              Search
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <PriceChip
              label="All prices"
              active={priceFilter === 'all'}
              onClick={() => applyPrice('all')}
            />
            <PriceChip
              label="Under $5"
              active={priceFilter === 'under-5'}
              onClick={() => applyPrice('under-5')}
            />
            <PriceChip
              label="Under $10"
              active={priceFilter === 'under-10'}
              onClick={() => applyPrice('under-10')}
            />
            <PriceChip
              label="80%+ off"
              active={priceFilter === 'over-80'}
              onClick={() => applyPrice('over-80')}
            />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {FEATURED_STORE_OPTIONS.map((store) => (
            <PriceChip
              key={store.value}
              label={store.label}
              active={storeFilter === store.value}
              onClick={() => applyStore(store.value)}
            />
          ))}
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          <FilterLink
            label="All PC Deals"
            href={buildUrl(1, { sort: 'all' })}
            active={sort === 'all'}
          />
          <FilterLink
            label="Best Deals"
            href={buildUrl(1, { sort: 'best' })}
            active={sort === 'best'}
          />
          <FilterLink
            label="Top Rated"
            href={buildUrl(1, { sort: 'top-rated' })}
            active={sort === 'top-rated'}
          />
          <FilterLink
            label="Biggest Discounts"
            href={buildUrl(1, { sort: 'biggest-discount' })}
            active={sort === 'biggest-discount'}
          />
          <FilterLink
            label="Latest"
            href={buildUrl(1, { sort: 'latest' })}
            active={sort === 'latest'}
          />
          <FilterLink
            label="Steam Spotlight"
            href={buildUrl(1, { sort: 'steam-spotlight' })}
            active={sort === 'steam-spotlight'}
          />
        </div>

{hasActiveFilters ? (
  <div className="mb-6 flex flex-wrap items-center gap-2">
    {activeFilterLabels.map((label) => (
      <span
        key={label}
        className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300"
      >
        {label}
      </span>
    ))}

    <button
      onClick={resetFilters}
      className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/15"
    >
      Reset all
    </button>
  </div>
) : null}

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-400">
  Page {safePage} of {totalPages} · {totalItems}{' '}
  {isSteamSpotlightMode ? 'Steam results in this view' : 'PC results in this view'}
  {storeFilter !== 'all' ? ` · ${getStoreName(storeFilter)}` : ''}
  {!isSteamSpotlightMode && dealsStats.dealsIndexed > 0
    ? ` · ${dealsStats.dealsIndexed} indexed total`
    : ''}
  {isSteamSpotlightMode && dealsStats.steamIndexed > 0
    ? ` · ${dealsStats.steamIndexed} cached total`
    : ''}
</p>

          <div className="flex items-center gap-2">
            <Link
              href={buildUrl(Math.max(1, safePage - 1))}
              className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm transition ${
                safePage === 1
                  ? 'pointer-events-none opacity-40'
                  : 'hover:bg-zinc-800'
              }`}
            >
              Previous
            </Link>

            <Link
              href={buildUrl(Math.min(totalPages, safePage + 1))}
              className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm transition ${
                safePage === totalPages
                  ? 'pointer-events-none opacity-40'
                  : 'hover:bg-zinc-800'
              }`}
            >
              Next
            </Link>
          </div>
        </div>

{showSteamPreview && steamPreviewItems.length > 0 ? (
  <section className="mb-8 rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-zinc-900 to-zinc-950 p-4 sm:p-5">
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="mb-2 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-emerald-300">
          Steam-first layer
        </div>

        <h2 className="text-lg font-bold text-white">Steam Picks</h2>
<p className="text-sm text-zinc-400">
  Quick Steam highlights inside PC, without sending the user out of the main flow too early.
</p>
      </div>

      <Link
        href={buildUrl(1, { sort: 'steam-spotlight' })}
        className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
      >
        View full Steam Spotlight
      </Link>
    </div>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {steamPreviewItems.map((item) => (
        <SteamSpotlightCard
  key={item.steamAppID}
  item={item}
  userId={userId}
  trackedIds={trackedIds}
  setTrackedIds={setTrackedIds}
  setTrackMessage={setTrackMessage}
/>
      ))}
    </div>
  </section>
) : null}

        {paginatedDeals.length === 0 ? (
  <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center">
    <div className="mx-auto max-w-2xl">
      <h2 className="text-xl font-bold text-white">
  {isSteamSpotlightMode
    ? 'No Steam deals match this view'
    : 'No PC deals match this view'}
</h2>

<p className="mt-3 text-sm text-zinc-400">
  {hasActiveFilters
    ? 'Your current search and filter combination did not return visible results.'
    : 'There are no visible deals in this section right now.'}
</p>

      {activeFilterLabels.length > 0 ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {activeFilterLabels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-300"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          onClick={resetFilters}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
        >
          Reset filters
        </button>

        {!isSteamSpotlightMode ? (
          <Link
            href={buildUrl(1, { sort: 'steam-spotlight' })}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
          >
            Try Steam Spotlight
          </Link>
        ) : (
          <Link
            href={buildUrl(1, { sort: 'all' })}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
          >
            Back to all PC deals
          </Link>
        )}
      </div>
    </div>
  </div>
) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {isSteamSpotlightMode
              ? (paginatedDeals as SteamSpotlightItem[]).map((deal) => (
                  <SteamSpotlightCard
                    key={deal.steamAppID}
                    item={deal}
                    userId={userId}
                    trackedIds={trackedIds}
                    setTrackedIds={setTrackedIds}
                    setTrackMessage={setTrackMessage}
                  />
                ))
              : (paginatedDeals as Deal[]).map((deal) => (
                  <GameCatalogCard
                    key={deal.dealID}
                    deal={deal}
                    userId={userId}
                    trackedIds={trackedIds}
                    setTrackedIds={setTrackedIds}
                    setTrackMessage={setTrackMessage}
                  />
                ))}
          </div>
        )}

        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            href={buildUrl(Math.max(1, safePage - 1))}
            className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm transition ${
              safePage === 1
                ? 'pointer-events-none opacity-40'
                : 'hover:bg-zinc-800'
            }`}
          >
            Previous
          </Link>

          <span className="text-sm text-zinc-400">
            {safePage} / {totalPages}
          </span>

          <Link
            href={buildUrl(Math.min(totalPages, safePage + 1))}
            className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm transition ${
              safePage === totalPages
                ? 'pointer-events-none opacity-40'
                : 'hover:bg-zinc-800'
            }`}
          >
            Next
          </Link>
        </div>
      </section>
    </main>
  )
}

function SteamSpotlightCard({
  item,
  userId,
  trackedIds,
  setTrackedIds,
  setTrackMessage,
}: {
  item: SteamSpotlightItem
  userId: string | null
  trackedIds: string[]
  setTrackedIds: React.Dispatch<React.SetStateAction<string[]>>
  setTrackMessage: React.Dispatch<React.SetStateAction<string>>
}) {
  const salePrice = Number(item.salePrice || 0)
  const normalPrice = Number(item.normalPrice || 0)
  const hasValidNormalPrice =
    !Number.isNaN(normalPrice) && normalPrice > 0 && normalPrice > salePrice
  const steamDealID = `steam-${item.steamAppID}`
  const isTracked = Array.isArray(trackedIds) && trackedIds.includes(steamDealID)
  const gameHref = `/game/${encodeURIComponent(
    `steam-${item.steamAppID}`
  )}?title=${encodeURIComponent(item.title)}&thumb=${encodeURIComponent(
    item.thumb
  )}&salePrice=${encodeURIComponent(
    item.salePrice
  )}&normalPrice=${encodeURIComponent(
    item.normalPrice
  )}&dealRating=${encodeURIComponent(
    ''
  )}&metacriticScore=${encodeURIComponent(
    ''
  )}&savings=${encodeURIComponent(
    item.savings
  )}&storeID=${encodeURIComponent(
    item.storeID || '1'
  )}&gameID=${encodeURIComponent(
    ''
  )}&steamAppID=${encodeURIComponent(
    item.steamAppID
  )}&steamUrl=${encodeURIComponent(
    item.url
  )}&source=${encodeURIComponent('steam-spotlight')}`

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1">
      <Link href={gameHref}>
        <img
          src={item.thumb}
          alt={item.title}
          className="h-40 w-full object-cover transition hover:opacity-90"
        />
      </Link>

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={gameHref}>
              <h3 className="line-clamp-2 text-base font-bold leading-5 transition hover:text-emerald-300">
                {item.title}
              </h3>
            </Link>
          </div>

          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
            -{Math.round(Number(item.savings || 0))}%
          </span>
        </div>

        <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Current price
              </p>
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-300">
                PC
              </span>
            </div>

            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-300">
              <img
                src={getStoreLogo('1') || ''}
                alt={getStoreName('1')}
                className="h-3.5 w-3.5 object-contain"
              />
              <span className="truncate">{getStoreName('1')}</span>
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <span className="text-2xl font-bold text-emerald-400">
              ${item.salePrice}
            </span>

            {hasValidNormalPrice ? (
              <span className="text-sm text-zinc-400 line-through">
                ${item.normalPrice}
              </span>
            ) : null}
          </div>
        </div>

                <div className="grid gap-2">
          <button
            onClick={async () => {
              if (!userId) {
                pushTrackMessage(setTrackMessage, 'Sign in to track games')
                return
              }

              try {
                const res = await fetch('/api/track', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId,
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
                  pushTrackMessage(setTrackMessage, `Added to tracked: ${item.title}`)
                  return
                }

                if (data.success && data.action === 'removed') {
                  setTrackedIds((prev) => prev.filter((id) => id !== steamDealID))
                  pushTrackMessage(setTrackMessage, `Removed from tracked: ${item.title}`)
                  return
                }

                pushTrackMessage(setTrackMessage, `Track error: ${data.error || 'Unknown error'}`)
              } catch {
                pushTrackMessage(setTrackMessage, 'Could not update tracked right now')
              }
            }}
            className={`rounded-xl px-4 py-2 text-center text-sm font-medium transition ${
              isTracked
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border border-zinc-700 hover:bg-zinc-800'
            }`}
          >
            {isTracked ? 'Tracked' : 'Track game'}
          </button>

          <Link
            href={gameHref}
            className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
          >
            Open game page
          </Link>

          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-zinc-700 px-4 py-2 text-center text-sm font-medium transition hover:bg-zinc-800"
          >
            Open Steam
          </a>
        </div>
      </div>
    </article>
  )
}

function GameCatalogCard({
  deal,
  userId,
  trackedIds,
  setTrackedIds,
  setTrackMessage,
}: {
  deal: Deal
  userId: string | null
  trackedIds: string[]
  setTrackedIds: React.Dispatch<React.SetStateAction<string[]>>
  setTrackMessage: React.Dispatch<React.SetStateAction<string>>
}) {
  const discount = Math.round(Number(deal.savings))
  const logo = getStoreLogo(deal.storeID)
  const salePriceNumber = Number(deal.salePrice || 0)
  const normalPriceNumber = Number(deal.normalPrice || 0)
  const hasValidNormalPrice =
    !Number.isNaN(normalPriceNumber) &&
    normalPriceNumber > 0 &&
    normalPriceNumber > salePriceNumber

  const gameHref = `/game/${encodeURIComponent(
    deal.dealID
  )}?title=${encodeURIComponent(deal.title)}&thumb=${encodeURIComponent(
    deal.thumb
  )}&salePrice=${encodeURIComponent(
    deal.salePrice
  )}&normalPrice=${encodeURIComponent(
    deal.normalPrice
  )}&dealRating=${encodeURIComponent(
    deal.dealRating || ''
  )}&metacriticScore=${encodeURIComponent(
    deal.metacriticScore || ''
  )}&savings=${encodeURIComponent(
    deal.savings
  )}&storeID=${encodeURIComponent(deal.storeID)}&gameID=${encodeURIComponent(
    deal.gameID || ''
  )}`

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1">
      <Link href={gameHref}>
        <img
          src={deal.thumb}
          alt={deal.title}
          className="h-40 w-full object-cover transition hover:opacity-90"
        />
      </Link>

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={gameHref}>
              <h3 className="line-clamp-2 text-base font-bold leading-5 transition hover:text-emerald-300">
                {deal.title}
              </h3>
            </Link>
          </div>

          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
            -{discount}%
          </span>
        </div>

        <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Current price
              </p>
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-300">
                {getPlatformLabel(deal.storeID)}
              </span>
            </div>

            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-300">
              {logo && (
                <img
                  src={logo}
                  alt={getStoreName(deal.storeID)}
                  className="h-3.5 w-3.5 object-contain"
                />
              )}
              <span className="truncate">{getStoreName(deal.storeID)}</span>
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <span className="text-2xl font-bold text-emerald-400">
              ${deal.salePrice}
            </span>

            {hasValidNormalPrice ? (
              <span className="text-sm text-zinc-400 line-through">
                ${deal.normalPrice}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2">
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/track', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId,
                    dealID: deal.dealID,
                    gameID: deal.gameID,
                    title: deal.title,
                    thumb: deal.thumb,
                    salePrice: deal.salePrice,
                    normalPrice: deal.normalPrice,
                    storeID: deal.storeID,
                  }),
                })

                const data = await res.json()

                if (data.success && data.action === 'removed') {
                  setTrackMessage(`Removed tracked game: ${deal.title}`)
                  setTrackedIds((prev) => prev.filter((id) => id !== deal.dealID))
                } else if (data.success && data.action === 'added') {
                  setTrackMessage(`Tracked game: ${deal.title}`)
                  setTrackedIds((prev) =>
                    prev.includes(deal.dealID) ? prev : [...prev, deal.dealID]
                  )
                } else {
                  setTrackMessage(`Track error: ${data.error}`)
                }

                setTimeout(() => setTrackMessage(''), 2500)
              } catch {
                setTrackMessage('Track connection error')
                setTimeout(() => setTrackMessage(''), 2500)
              }
            }}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98] active:translate-y-[1px] ${
              trackedIds.includes(deal.dealID)
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border border-zinc-700 text-zinc-100 hover:bg-zinc-800'
            }`}
          >
            {trackedIds.includes(deal.dealID) ? 'Tracked game' : 'Track game'}
          </button>

          <a
            href={`/api/redirect?dealID=${encodeURIComponent(
              deal.dealID
            )}&title=${encodeURIComponent(
              deal.title
            )}&salePrice=${encodeURIComponent(
              deal.salePrice
            )}&normalPrice=${encodeURIComponent(deal.normalPrice)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90 active:scale-[0.98] active:translate-y-[1px]"
          >
            Go to deal
          </a>
        </div>
      </div>
    </article>
  )
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string
  href: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        active
          ? 'border-white bg-white text-black'
          : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      {label}
    </Link>
  )
}

function PriceChip({
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
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        active
          ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
          : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  )
}