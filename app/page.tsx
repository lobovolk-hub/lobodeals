'use client'

import { supabase } from '@/lib/supabaseClient'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Deal = {
  dealID: string
  title: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  dealRating?: string
}

export default function Home() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'cheap' | 'biggest'>('all')
  const [visibleCount, setVisibleCount] = useState(12)
  const [wishlistMessage, setWishlistMessage] = useState('')
  const [alertMessage, setAlertMessage] = useState('')
  const [savedWishlistIds, setSavedWishlistIds] = useState<string[]>([])
  const [savedAlertIds, setSavedAlertIds] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)

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
      return
    }

    const { data, error } = await supabase
      .from('wishlist')
      .select('deal_id')
      .eq('user_id', currentUserId)

    if (!error && data) {
      setSavedWishlistIds(data.map((item) => item.deal_id))
    }
    const { data: alertsData, error: alertsError } = await supabase
  .from('alerts')
  .select('deal_id')
  .eq('user_id', currentUserId)

if (!alertsError && alertsData) {
  setSavedAlertIds(alertsData.map((item) => item.deal_id))
}
  }

  fetchDeals()
  fetchSession()
}, [])

  const filteredDeals = useMemo(() => {
    let list = [...deals]

    if (search.trim()) {
      const term = search.toLowerCase()
      list = list.filter((deal) => deal.title.toLowerCase().includes(term))
    }

    if (filter === 'cheap') {
      list.sort((a, b) => Number(a.salePrice) - Number(b.salePrice))
    }

    if (filter === 'biggest') {
      list.sort((a, b) => Number(b.savings) - Number(a.savings))
    }

    return list
  }, [deals, search, filter])

  const visibleDeals = useMemo(() => {
    return filteredDeals.slice(0, visibleCount)
  }, [filteredDeals, visibleCount])

  const averagePrice = useMemo(() => {
    if (deals.length === 0) return '0.00'
    const total = deals.reduce((sum, deal) => sum + Number(deal.salePrice), 0)
    return (total / deals.length).toFixed(2)
  }, [deals])

  const bestDiscount = useMemo(() => {
    if (deals.length === 0) return 0
    return Math.max(...deals.map((deal) => Math.round(Number(deal.savings))))
  }, [deals])

  if (loading) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-xl">
          <div className="border-b border-zinc-800 p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
            <div className="mt-3 h-8 w-72 animate-pulse rounded bg-zinc-800" />
            <div className="mt-3 h-4 w-96 animate-pulse rounded bg-zinc-800" />
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3"
              >
                <div className="h-4 w-28 animate-pulse rounded bg-zinc-800" />
                <div className="mt-3 h-6 w-20 animate-pulse rounded bg-zinc-800" />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
          <div className="h-12 animate-pulse rounded-2xl bg-zinc-900" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-12 animate-pulse rounded-2xl bg-zinc-900"
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <article
              key={index}
              className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg"
            >
              <div className="h-32 animate-pulse bg-zinc-800" />
              <div className="p-4">
                <div className="h-5 w-3/4 animate-pulse rounded bg-zinc-800" />
                <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                  <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
                  <div className="mt-3 h-6 w-20 animate-pulse rounded bg-zinc-800" />
                </div>
                <div className="mt-3 grid gap-2">
                  <div className="h-10 animate-pulse rounded-xl bg-zinc-800" />
                  <div className="h-10 animate-pulse rounded-xl bg-zinc-800" />
                  <div className="h-10 animate-pulse rounded-xl bg-zinc-700" />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-xl">
          <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-800 p-5">
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
              LoboDeals
            </p>
            <h1 className="mt-1 text-3xl font-bold">The best video game deals</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
  Find cheap games, track prices, and create alerts.
</p>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-3">
            <MetricCard label="Deals loaded" value={String(deals.length)} />
            <MetricCard label="Average price" value={`$${averagePrice}`} />
            <MetricCard label="Best discount" value={`${bestDiscount}%`} />
          </div>
        </header>

        <section className="mb-6 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
          <input
            type="text"
            placeholder="Search deals..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setVisibleCount(12)
            }}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
          />

          <div className="grid grid-cols-3 gap-3">
            <FilterButton
              label="All"
              active={filter === 'all'}
              onClick={() => {
                setFilter('all')
                setVisibleCount(12)
              }}
            />
            <FilterButton
              label="Lowest price"
              active={filter === 'cheap'}
              onClick={() => {
                setFilter('cheap')
                setVisibleCount(12)
              }}
            />
            <FilterButton
              label="Best discount"
              active={filter === 'biggest'}
              onClick={() => {
                setFilter('biggest')
                setVisibleCount(12)
              }}
            />
          </div>
        </section>
{wishlistMessage && (
  <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300 shadow-lg shadow-emerald-500/5">
    {wishlistMessage}
  </div>
)}
{alertMessage && (
  <div className="mb-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-300 shadow-lg shadow-cyan-500/5">
    {alertMessage}
  </div>
)}
        <section className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Available deals</h2>
            <p className="text-sm text-zinc-400">Real-time results.</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300">
            Showing: {visibleDeals.length} / {filteredDeals.length}
          </div>
        </section>

        {filteredDeals.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center text-zinc-400">
            No results found. Try adjusting your search or filters?
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              {visibleDeals.map((deal) => (
                <article
  key={deal.dealID}
  className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1"
>
                  <Link href={`/game/${encodeURIComponent(deal.dealID)}?title=${encodeURIComponent(deal.title)}&thumb=${encodeURIComponent(deal.thumb)}&salePrice=${encodeURIComponent(deal.salePrice)}&normalPrice=${encodeURIComponent(deal.normalPrice)}&dealRating=${encodeURIComponent(deal.dealRating || '')}&savings=${encodeURIComponent(deal.savings)}`}>
  <img
    src={deal.thumb}
    alt={deal.title}
    className="h-32 w-full object-cover transition hover:opacity-90"
  />
</Link>

                  <div className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
  <Link href={`/game/${encodeURIComponent(deal.dealID)}?title=${encodeURIComponent(deal.title)}&thumb=${encodeURIComponent(deal.thumb)}&salePrice=${encodeURIComponent(deal.salePrice)}&normalPrice=${encodeURIComponent(deal.normalPrice)}&dealRating=${encodeURIComponent(deal.dealRating || '')}&savings=${encodeURIComponent(deal.savings)}`}>
    <h3 className="line-clamp-2 text-base font-bold leading-5 transition hover:text-emerald-300">
      {deal.title}
    </h3>
  </Link>
</div>

                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                        -{Math.round(Number(deal.savings))}%
                      </span>
                    </div>

                    <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-xs uppercase tracking-wider text-zinc-500">
                        Current price
                      </p>
                      <div className="mt-2 flex items-end justify-between">
                        <p className="text-3xl font-bold text-emerald-400">
                          ${deal.salePrice}
                        </p>
                        <p className="text-sm text-zinc-400 line-through">
                          ${deal.normalPrice}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2">
  <button
    onClick={async () => {
      try {
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

        if (data.success && data.action === 'removed') {
  setWishlistMessage(`Removed from wishlist: ${deal.title}`)
  setSavedWishlistIds((prev) =>
    prev.filter((id) => id !== deal.dealID)
  )
} else if (data.success && data.action === 'added') {
  setWishlistMessage(`Added to wishlist: ${deal.title}`)
  setSavedWishlistIds((prev) =>
    prev.includes(deal.dealID) ? prev : [...prev, deal.dealID]
  )
} else {
  setWishlistMessage(`Wishlist error: ${data.error}`)
}

        setTimeout(() => setWishlistMessage(''), 2500)
      } catch (error) {
        setWishlistMessage('Wishlist connection error')
        setTimeout(() => setWishlistMessage(''), 2500)
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
      try {
        const targetPrice = (
          Math.max(Number(deal.salePrice) - 1, 0.5)
        ).toFixed(2)

        const res = await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dealID: deal.dealID,
            title: deal.title,
            targetPrice,
            currentPrice: deal.salePrice,
            userId,
          }),
        })

        const data = await res.json()

        if (data.success && data.action === 'removed') {
  setAlertMessage(`Alert removed for ${deal.title}`)
  setSavedAlertIds((prev) => prev.filter((id) => id !== deal.dealID))
} else if (data.success && data.action === 'added') {
  setAlertMessage(`Alert created for ${deal.title} at $${targetPrice}`)
  setSavedAlertIds((prev) =>
    prev.includes(deal.dealID) ? prev : [...prev, deal.dealID]
  )
} else {
  setAlertMessage(`Alert error: ${data.error}`)
}

        setTimeout(() => setAlertMessage(''), 2500)
      } catch (error) {
        setAlertMessage('Alerts connection error')
        setTimeout(() => setAlertMessage(''), 2500)
      }
    }}
    className={`rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98] active:translate-y-[1px] ${
  savedAlertIds.includes(deal.dealID)
    ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
    : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
}`}
  >
    {savedAlertIds.includes(deal.dealID) ? 'Remove alert' : 'Create alert'}
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
              ))}
            </div>

            {visibleCount < filteredDeals.length && (
              <div className="mt-8 flex justify-center">
                <button
  onClick={() => setVisibleCount((prev) => prev + 12)}
  className="rounded-full border border-zinc-700 bg-zinc-900 px-6 py-3 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
>
  Load more deals
</button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  )
}

function FilterButton({
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
      className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
        active
          ? 'border-white bg-white text-black'
          : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  )
}