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

type Deal = {
  dealID: string
  title: string
  thumb: string
  salePrice: string
  normalPrice: string
  savings: string
  dealRating: string
  metacriticScore?: string
  storeID: string
  gameID?: string
}

const PAGE_SIZE = 36

export default function GamesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
          <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            Loading games...
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
  const [savedWishlistIds, setSavedWishlistIds] = useState<string[]>([])
  const [savedAlertIds, setSavedAlertIds] = useState<string[]>([])
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
        setSavedWishlistIds([])
        setSavedAlertIds([])
        return
      }

      const { data: wishlistData } = await supabase
        .from('wishlist')
        .select('deal_id')
        .eq('user_id', currentUserId)

      if (wishlistData) {
        setSavedWishlistIds(wishlistData.map((item) => item.deal_id))
      }

      const { data: alertsData } = await supabase
        .from('alerts')
        .select('deal_id')
        .eq('user_id', currentUserId)

      if (alertsData) {
        setSavedAlertIds(alertsData.map((item) => item.deal_id))
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

    switch (sort) {
      case 'best':
        return list.sort(
          (a, b) => Number(b.dealRating || 0) - Number(a.dealRating || 0)
        )
      case 'top-rated':
        return list
          .filter((deal) => Number(deal.metacriticScore || 0) > 0)
          .sort(
            (a, b) =>
              Number(b.metacriticScore || 0) - Number(a.metacriticScore || 0)
          )
      case 'biggest-discount':
        return list.sort((a, b) => Number(b.savings) - Number(a.savings))
      case 'latest':
        return list
      default:
        return list
    }
  }, [deals, sort, query, priceFilter, storeFilter])

  const totalPages = Math.max(1, Math.ceil(filteredDeals.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)

  const paginatedDeals = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredDeals.slice(start, start + PAGE_SIZE)
  }, [filteredDeals, safePage])

  const pageTitle =
    sort === 'best'
      ? 'Best Deals'
      : sort === 'top-rated'
      ? 'Top Rated Deals'
      : sort === 'biggest-discount'
      ? 'Biggest Discounts'
      : sort === 'latest'
      ? 'Latest Deals'
      : 'All Games'

  const pageDescription =
    sort === 'best'
      ? 'Browse the strongest overall deals from approved stores.'
      : sort === 'top-rated'
      ? 'Browse deals from approved stores for games with the best review scores.'
      : sort === 'biggest-discount'
      ? 'Browse the highest discounts from approved stores.'
      : sort === 'latest'
      ? 'Browse the latest deals from approved stores.'
      : 'Browse the full approved deals catalog page by page.'

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
          Loading games...
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">{pageTitle}</h1>
          <p className="mt-2 text-zinc-400">{pageDescription}</p>
        </header>

        <div className="mb-6 grid gap-3 lg:grid-cols-[1.4fr_auto]">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applySearch()
              }}
              placeholder="Search games..."
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
            <PriceChip label="All prices" active={priceFilter === 'all'} onClick={() => applyPrice('all')} />
            <PriceChip label="Under $5" active={priceFilter === 'under-5'} onClick={() => applyPrice('under-5')} />
            <PriceChip label="Under $10" active={priceFilter === 'under-10'} onClick={() => applyPrice('under-10')} />
            <PriceChip label="80%+ off" active={priceFilter === 'over-80'} onClick={() => applyPrice('over-80')} />
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
          <FilterLink label="All Games" href={buildUrl(1, { sort: 'all' })} active={sort === 'all'} />
          <FilterLink label="Best Deals" href={buildUrl(1, { sort: 'best' })} active={sort === 'best'} />
          <FilterLink label="Top Rated" href={buildUrl(1, { sort: 'top-rated' })} active={sort === 'top-rated'} />
          <FilterLink label="Biggest Discounts" href={buildUrl(1, { sort: 'biggest-discount' })} active={sort === 'biggest-discount'} />
          <FilterLink label="Latest" href={buildUrl(1, { sort: 'latest' })} active={sort === 'latest'} />
        </div>

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-zinc-400">
            Page {safePage} of {totalPages} · {filteredDeals.length} results
            {storeFilter !== 'all' ? ` · ${getStoreName(storeFilter)}` : ''}
          </p>

          <div className="flex items-center gap-2">
            <Link
              href={buildUrl(Math.max(1, safePage - 1))}
              className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm transition ${
                safePage === 1 ? 'pointer-events-none opacity-40' : 'hover:bg-zinc-800'
              }`}
            >
              Previous
            </Link>

            <Link
              href={buildUrl(Math.min(totalPages, safePage + 1))}
              className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm transition ${
                safePage === totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-zinc-800'
              }`}
            >
              Next
            </Link>
          </div>
        </div>

        {paginatedDeals.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center text-zinc-400">
            No games found for this view.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {paginatedDeals.map((deal) => (
              <GameCatalogCard
                key={deal.dealID}
                deal={deal}
                userId={userId}
                savedWishlistIds={savedWishlistIds}
                setSavedWishlistIds={setSavedWishlistIds}
                savedAlertIds={savedAlertIds}
                setSavedAlertIds={setSavedAlertIds}
              />
            ))}
          </div>
        )}

        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            href={buildUrl(Math.max(1, safePage - 1))}
            className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm transition ${
              safePage === 1 ? 'pointer-events-none opacity-40' : 'hover:bg-zinc-800'
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
              safePage === totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-zinc-800'
            }`}
          >
            Next
          </Link>
        </div>
      </section>
    </main>
  )
}

function GameCatalogCard({
  deal,
  userId,
  savedWishlistIds,
  setSavedWishlistIds,
  savedAlertIds,
  setSavedAlertIds,
}: {
  deal: Deal
  userId: string | null
  savedWishlistIds: string[]
  setSavedWishlistIds: React.Dispatch<React.SetStateAction<string[]>>
  savedAlertIds: string[]
  setSavedAlertIds: React.Dispatch<React.SetStateAction<string[]>>
}) {
  const discount = Math.round(Number(deal.savings))
  const logo = getStoreLogo(deal.storeID)

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1">
      <Link
        href={`/game/${encodeURIComponent(deal.dealID)}?title=${encodeURIComponent(deal.title)}&thumb=${encodeURIComponent(deal.thumb)}&salePrice=${encodeURIComponent(deal.salePrice)}&normalPrice=${encodeURIComponent(deal.normalPrice)}&dealRating=${encodeURIComponent(deal.dealRating || '')}&savings=${encodeURIComponent(deal.savings)}&storeID=${encodeURIComponent(deal.storeID)}&gameID=${encodeURIComponent(deal.gameID || '')}`}
      >
        <img
          src={deal.thumb}
          alt={deal.title}
          className="h-32 w-full object-cover transition hover:opacity-90"
        />
      </Link>

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <Link
              href={`/game/${encodeURIComponent(deal.dealID)}?title=${encodeURIComponent(deal.title)}&thumb=${encodeURIComponent(deal.thumb)}&salePrice=${encodeURIComponent(deal.salePrice)}&normalPrice=${encodeURIComponent(deal.normalPrice)}&dealRating=${encodeURIComponent(deal.dealRating || '')}&savings=${encodeURIComponent(deal.savings)}&storeID=${encodeURIComponent(deal.storeID)}&gameID=${encodeURIComponent(deal.gameID || '')}`}
            >
              <h3 className="line-clamp-2 text-base font-bold leading-5 transition hover:text-emerald-300">
                {deal.title}
              </h3>
            </Link>
          </div>

          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
            -{discount}%
          </span>
        </div>

        <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
  <div className="flex items-center gap-2">
    <p className="text-xs uppercase tracking-wider text-zinc-500">
      Current price
    </p>
    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-300">
      {getPlatformLabel(deal.storeID)}
    </span>
  </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-300">
              {logo && (
                <img
                  src={logo}
                  alt={getStoreName(deal.storeID)}
                  className="h-3.5 w-3.5 object-contain"
                />
              )}
              <span>{getStoreName(deal.storeID)}</span>
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-2xl font-bold text-emerald-400">
              ${deal.salePrice}
            </span>
            <span className="text-sm text-zinc-400 line-through">
              ${deal.normalPrice}
            </span>
          </div>
        </div>

        <div className="grid gap-2">
          <button
            onClick={async () => {
              if (!userId) return
              const res = await fetch('/api/wishlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  dealID: deal.dealID,
                  title: deal.title,
                  salePrice: deal.salePrice,
                  normalPrice: deal.normalPrice,
                  thumb: deal.thumb,
                  userId,
                }),
              })
              const data = await res.json()
              if (data.action === 'removed') {
                setSavedWishlistIds((prev) => prev.filter((id) => id !== deal.dealID))
              } else if (data.action === 'added') {
                setSavedWishlistIds((prev) =>
                  prev.includes(deal.dealID) ? prev : [...prev, deal.dealID]
                )
              }
            }}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98] active:translate-y-[1px] ${
              savedWishlistIds.includes(deal.dealID)
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border border-zinc-700 text-zinc-100 hover:bg-zinc-800'
            }`}
          >
            {savedWishlistIds.includes(deal.dealID)
              ? 'Remove from wishlist'
              : 'Add to wishlist'}
          </button>

          <button
            onClick={async () => {
              if (!userId) return
              const res = await fetch('/api/alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  dealID: deal.dealID,
                  title: deal.title,
                  targetPrice: deal.salePrice,
                  currentPrice: deal.salePrice,
                  userId,
                }),
              })
              const data = await res.json()
              if (data.action === 'removed') {
                setSavedAlertIds((prev) => prev.filter((id) => id !== deal.dealID))
              } else if (data.action === 'added') {
                setSavedAlertIds((prev) =>
                  prev.includes(deal.dealID) ? prev : [...prev, deal.dealID]
                )
              }
            }}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98] active:translate-y-[1px] ${
              savedAlertIds.includes(deal.dealID)
                ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
            }`}
          >
            {savedAlertIds.includes(deal.dealID)
              ? 'Remove alert'
              : 'Create alert'}
          </button>

          <a
            href={`/api/redirect?dealID=${encodeURIComponent(deal.dealID)}&title=${encodeURIComponent(deal.title)}&salePrice=${encodeURIComponent(deal.salePrice)}&normalPrice=${encodeURIComponent(deal.normalPrice)}`}
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