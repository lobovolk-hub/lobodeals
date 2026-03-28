'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import RegionNotice from '@/app/components/RegionNotice'

type WishlistRow = {
  deal_id: string
  title: string | null
  sale_price: string | null
  normal_price: string | null
  thumb: string | null
}

type AlertRow = {
  deal_id: string
  title: string | null
  target_price: string | null
  current_price: string | null
}

type TrackedItem = {
  dealID: string
  title: string
  salePrice: string
  normalPrice: string
  thumb: string
  targetPrice: string
  inWishlist: boolean
  hasAlert: boolean
}

export default function TrackedPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [items, setItems] = useState<TrackedItem[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadTracked = async () => {
      try {
        setLoading(true)

        const {
          data: { session },
        } = await supabase.auth.getSession()

        const currentUserId = session?.user?.id ?? null
        const currentUserEmail = session?.user?.email ?? null

        setUserId(currentUserId)
        setUserEmail(currentUserEmail)

        if (!currentUserId) {
          setItems([])
          return
        }

        const { data: wishlistData } = await supabase
          .from('wishlist')
          .select('deal_id, title, sale_price, normal_price, thumb')
          .eq('user_id', currentUserId)

        const { data: alertsData } = await supabase
          .from('alerts')
          .select('deal_id, title, target_price, current_price')
          .eq('user_id', currentUserId)

        const wishlist = Array.isArray(wishlistData)
          ? (wishlistData as WishlistRow[])
          : []
        const alerts = Array.isArray(alertsData) ? (alertsData as AlertRow[]) : []

        const merged = new Map<string, TrackedItem>()

        for (const row of wishlist) {
          merged.set(row.deal_id, {
            dealID: row.deal_id,
            title: row.title || 'Tracked game',
            salePrice: row.sale_price || '',
            normalPrice: row.normal_price || '',
            thumb: row.thumb || '',
            targetPrice: '',
            inWishlist: true,
            hasAlert: false,
          })
        }

        for (const row of alerts) {
          const existing = merged.get(row.deal_id)

          if (existing) {
            merged.set(row.deal_id, {
              ...existing,
              title: existing.title || row.title || 'Tracked game',
              salePrice: existing.salePrice || row.current_price || '',
              targetPrice: row.target_price || '',
              hasAlert: true,
            })
          } else {
            merged.set(row.deal_id, {
              dealID: row.deal_id,
              title: row.title || 'Tracked game',
              salePrice: row.current_price || '',
              normalPrice: '',
              thumb: '',
              targetPrice: row.target_price || '',
              inWishlist: false,
              hasAlert: true,
            })
          }
        }

        const finalItems = Array.from(merged.values()).sort((a, b) =>
          a.title.localeCompare(b.title)
        )

        setItems(finalItems)
      } catch (error) {
        console.error(error)
        setItems([])
      } finally {
        setLoading(false)
      }
    }

    loadTracked()
  }, [])

  const summary = useMemo(() => {
    return {
      total: items.length,
      wishlisted: items.filter((item) => item.inWishlist).length,
      alerted: items.filter((item) => item.hasAlert).length,
    }
  }, [items])

  const removeWishlist = async (item: TrackedItem) => {
    if (!userId) return

    try {
      const res = await fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealID: item.dealID,
          title: item.title,
          salePrice: item.salePrice,
          normalPrice: item.normalPrice,
          thumb: item.thumb,
          userId,
        }),
      })

      const data = await res.json()

      if (data.action === 'removed') {
        setItems((prev) =>
          prev
            .map((row) =>
              row.dealID === item.dealID ? { ...row, inWishlist: false } : row
            )
            .filter((row) => row.inWishlist || row.hasAlert)
        )
        setMessage(`Removed from tracked wishlist: ${item.title}`)
        setTimeout(() => setMessage(''), 2500)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const removeAlert = async (item: TrackedItem) => {
    if (!userId) return

    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealID: item.dealID,
          title: item.title,
          targetPrice: item.targetPrice || item.salePrice || '0',
          currentPrice: item.salePrice || '0',
          userId,
        }),
      })

      const data = await res.json()

      if (data.action === 'removed') {
        setItems((prev) =>
          prev
            .map((row) =>
              row.dealID === item.dealID ? { ...row, hasAlert: false } : row
            )
            .filter((row) => row.inWishlist || row.hasAlert)
        )
        setMessage(`Removed alert: ${item.title}`)
        setTimeout(() => setMessage(''), 2500)
      }
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Tracked
          </p>
          <h1 className="mt-1 text-3xl font-bold">Your tracked games</h1>
          <p className="mt-2 text-zinc-400">
            A clearer view of saved games and active alerts in one place.
          </p>
        </header>

        <div className="mb-6">
          <RegionNotice />
        </div>

        {message ? (
          <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">
            {message}
          </div>
        ) : null}

        {!userId && !loading ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
            <h2 className="text-xl font-bold">Sign in to track games</h2>
            <p className="mt-2 text-zinc-400">
              Save games, create alerts, and keep everything in one place.
            </p>

            <div className="mt-5">
              <Link
                href="/login"
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
              >
                Go to login
              </Link>
            </div>
          </div>
        ) : null}

        {userId ? (
          <>
            <div className="mb-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Total tracked
                </p>
                <p className="mt-2 text-2xl font-bold text-zinc-100">
                  {summary.total}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Wishlist saved
                </p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">
                  {summary.wishlisted}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Alerts active
                </p>
                <p className="mt-2 text-2xl font-bold text-cyan-300">
                  {summary.alerted}
                </p>
              </div>
            </div>

            <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">
                Signed in as{' '}
                <span className="font-medium text-zinc-200">
                  {userEmail || 'User'}
                </span>
              </p>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                Loading tracked games...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
                <h2 className="text-xl font-bold">No tracked games yet</h2>
                <p className="mt-2 text-zinc-400">
                  Start by saving a game or creating an alert from any deal page.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href="/catalog"
                    className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    Browse catalog
                  </Link>

                  <Link
                    href="/games?page=1&sort=all"
                    className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
                  >
                    Browse deals
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                {items.map((item) => {
                  const salePrice = Number(item.salePrice || 0)
                  const normalPrice = Number(item.normalPrice || 0)
                  const hasValidNormalPrice =
                    !Number.isNaN(normalPrice) &&
                    normalPrice > 0 &&
                    normalPrice > salePrice

                  const href = `/game/${encodeURIComponent(
                    item.dealID
                  )}?title=${encodeURIComponent(
                    item.title
                  )}&thumb=${encodeURIComponent(
                    item.thumb || ''
                  )}&salePrice=${encodeURIComponent(
                    item.salePrice || ''
                  )}&normalPrice=${encodeURIComponent(
                    item.normalPrice || ''
                  )}&dealRating=&savings=&gameID=&storeID=`

                  return (
                    <article
                      key={item.dealID}
                      className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex min-w-0 gap-4">
                          <div className="h-24 w-20 shrink-0 overflow-hidden rounded-2xl bg-zinc-800">
                            {item.thumb ? (
                              <img
                                src={item.thumb}
                                alt={item.title}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <h2 className="line-clamp-2 text-lg font-bold">
                              {item.title}
                            </h2>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {item.inWishlist ? (
                                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                                  Saved
                                </span>
                              ) : null}

                              {item.hasAlert ? (
                                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                                  Alert active
                                </span>
                              ) : null}

                              {item.targetPrice ? (
                                <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                                  Target: ${item.targetPrice}
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              {item.salePrice ? (
                                <span className="text-2xl font-bold text-emerald-400">
                                  ${item.salePrice}
                                </span>
                              ) : (
                                <span className="text-sm text-zinc-500">
                                  Price unavailable
                                </span>
                              )}

                              {hasValidNormalPrice ? (
                                <span className="text-sm text-zinc-400 line-through">
                                  ${item.normalPrice}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={href}
                            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium transition hover:bg-zinc-800"
                          >
                            Open game
                          </Link>

                          {item.inWishlist ? (
                            <button
                              onClick={() => removeWishlist(item)}
                              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                            >
                              Remove saved
                            </button>
                          ) : null}

                          {item.hasAlert ? (
                            <button
                              onClick={() => removeAlert(item)}
                              className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20"
                            >
                              Remove alert
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </>
        ) : null}
      </section>
    </main>
  )
}