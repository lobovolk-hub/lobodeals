'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSearchParams } from 'next/navigation'

type Deal = {
  dealID: string
  title: string
  thumb: string
  salePrice: string
  normalPrice: string
  savings: string
  dealRating: string
  metacriticScore?: string
}

const PAGE_SIZE = 36

export default function GamesPage() {
  const searchParams = useSearchParams()
  const currentPage = Number(searchParams.get('page') || '1')

  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [savedWishlistIds, setSavedWishlistIds] = useState<string[]>([])
  const [savedAlertIds, setSavedAlertIds] = useState<string[]>([])

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

  const totalPages = Math.max(1, Math.ceil(deals.length / PAGE_SIZE))

  const paginatedDeals = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return deals.slice(start, start + PAGE_SIZE)
  }, [deals, currentPage])

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
          <h1 className="text-3xl font-bold">All Games</h1>
          <p className="mt-2 text-zinc-400">
            Browse the full deals catalog page by page.
          </p>
        </header>

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-zinc-400">
            Page {currentPage} of {totalPages}
          </p>

          <div className="flex items-center gap-2">
            <Link
              href={`/games?page=${Math.max(1, currentPage - 1)}`}
              className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm transition ${
                currentPage === 1
                  ? 'pointer-events-none opacity-40'
                  : 'hover:bg-zinc-800'
              }`}
            >
              Previous
            </Link>

            <Link
              href={`/games?page=${Math.min(totalPages, currentPage + 1)}`}
              className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm transition ${
                currentPage === totalPages
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
            No games found.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {paginatedDeals.map((deal) => {
              const discount = Math.round(Number(deal.savings))

              return (
                <article
                  key={deal.dealID}
                  className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1"
                >
                  <Link
                    href={`/game/${encodeURIComponent(deal.dealID)}?title=${encodeURIComponent(deal.title)}&thumb=${encodeURIComponent(deal.thumb)}&salePrice=${encodeURIComponent(deal.salePrice)}&normalPrice=${encodeURIComponent(deal.normalPrice)}&dealRating=${encodeURIComponent(deal.dealRating || '')}&savings=${encodeURIComponent(deal.savings)}`}
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
                          href={`/game/${encodeURIComponent(deal.dealID)}?title=${encodeURIComponent(deal.title)}&thumb=${encodeURIComponent(deal.thumb)}&salePrice=${encodeURIComponent(deal.salePrice)}&normalPrice=${encodeURIComponent(deal.normalPrice)}&dealRating=${encodeURIComponent(deal.dealRating || '')}&savings=${encodeURIComponent(deal.savings)}`}
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
                      <p className="text-xs uppercase tracking-wider text-zinc-500">
                        Current price
                      </p>
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
                            setSavedWishlistIds((prev) =>
                              prev.filter((id) => id !== deal.dealID)
                            )
                          } else if (data.action === 'added') {
                            setSavedWishlistIds((prev) =>
                              prev.includes(deal.dealID)
                                ? prev
                                : [...prev, deal.dealID]
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

                          const targetPrice = prompt('Target price?')
                          if (!targetPrice) return

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

                          if (data.action === 'removed') {
                            setSavedAlertIds((prev) =>
                              prev.filter((id) => id !== deal.dealID)
                            )
                          } else if (data.action === 'added') {
                            setSavedAlertIds((prev) =>
                              prev.includes(deal.dealID)
                                ? prev
                                : [...prev, deal.dealID]
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
            })}
          </div>
        )}

        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            href={`/games?page=${Math.max(1, currentPage - 1)}`}
            className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm transition ${
              currentPage === 1
                ? 'pointer-events-none opacity-40'
                : 'hover:bg-zinc-800'
            }`}
          >
            Previous
          </Link>

          <span className="text-sm text-zinc-400">
            {currentPage} / {totalPages}
          </span>

          <Link
            href={`/games?page=${Math.min(totalPages, currentPage + 1)}`}
            className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm transition ${
              currentPage === totalPages
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