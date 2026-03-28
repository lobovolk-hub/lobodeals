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

const PAGE_SIZE = 36

export default function GamesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
          <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            Loading deals...
          </section>
        </main>
      }
    >
      <GamesPageContent />
    </Suspense>
  )
}

function GamesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentPage = Number(searchParams.get('page') || '1')
  const sort = searchParams.get('sort') || 'all'
  const query = searchParams.get('q') || ''
  const priceFilter = searchParams.get('price') || 'all'
  const storeFilter = searchParams.get('store') || 'all'

  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [trackedIds, setTrackedIds] = useState<string[]>([])
  const [trackMessage, setTrackMessage] = useState('')
  const [searchInput, setSearchInput] = useState(query)

  useEffect(() => {
    setSearchInput(query)
  }, [query])

  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const res = await fetch('/api/deals')
        const data = await res.json()
        setDeals(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error(error)
        setDeals([])
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
      case 'latest':
        return grouped
      default:
        return grouped
    }
  }, [deals, sort, query, priceFilter, storeFilter])

  const totalPages = Math.max(1, Math.ceil(filteredDeals.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)

  const paginatedDeals = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredDeals.slice(start, start + PAGE_SIZE)
  }, [filteredDeals, safePage])

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

    return `/games?${params.toString()}`
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

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          Loading deals...
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Deals
          </p>
          <h1 className="mt-1 text-3xl font-bold">All Deals</h1>
          <p className="mt-2 text-zinc-400">
            Browse approved deals from trusted stores across current supported
            platforms.
          </p>
        </header>

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
              placeholder="Search deals..."
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

        <div className="mb-6 flex flex-wrap gap-2">
          <FilterLink
            label="All Deals"
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
        </div>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-400">
            Page {safePage} of {totalPages} · {filteredDeals.length} deal results
            {storeFilter !== 'all' ? ` · ${getStoreName(storeFilter)}` : ''}
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

        {paginatedDeals.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center text-zinc-400">
            No deals found for this view.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {paginatedDeals.map((deal) => (
              <GameDealCard
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

function GameDealCard({
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