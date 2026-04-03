'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type TrackedItem = {
  id: number
  deal_id: string
  game_id: string | null
  title: string
  thumb: string | null
  sale_price: string | null
  normal_price: string | null
  store_id: string | null
  created_at?: string
  metacriticScore?: string | null
}

function getTrackedStoreLabel(storeID: string | null) {
  switch (storeID) {
    case '1':
      return 'Steam'
    case '7':
      return 'GOG'
    case '8':
      return 'Origin'
    case '11':
      return 'Humble'
    case '13':
      return 'Uplay'
    case '15':
      return 'Fanatical'
    case '25':
      return 'Epic'
    default:
      return 'Store'
  }
}

function isSteamTrackedItem(item: TrackedItem) {
  return item.deal_id.startsWith('steam-')
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function buildCanonicalTrackedHref(item: TrackedItem) {
  const slug = slugify(item.title || 'game')
  return `/pc/${encodeURIComponent(slug)}`
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

        const { data } = await supabase
          .from('tracked_games')
          .select(
            'id, deal_id, game_id, title, thumb, sale_price, normal_price, store_id, created_at'
          )
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false })

        setItems(Array.isArray(data) ? (data as TrackedItem[]) : [])
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
    }
  }, [items])

  const removeTracked = async (item: TrackedItem) => {
    if (!userId) return

        try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      if (!accessToken) return

      const res = await fetch('/api/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          dealID: item.deal_id,
          gameID: item.game_id,
          title: item.title,
          thumb: item.thumb,
          salePrice: item.sale_price,
          normalPrice: item.normal_price,
          storeID: item.store_id,
        }),
      })

      const data = await res.json()

      if (data.action === 'removed') {
        setItems((prev) => prev.filter((row) => row.deal_id !== item.deal_id))
        setMessage(`Removed from tracked: ${item.title}`)
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
          <p className="mt-2 max-w-2xl text-zinc-400">
            Keep your watched games in one place, reopen their canonical PC pages
            quickly, and build the base for future price alerts.
          </p>
        </header>

        {message ? (
          <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">
            {message}
          </div>
        ) : null}

        {!userId && !loading ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
            <h2 className="text-xl font-bold">Sign in to use tracked games</h2>
            <p className="mt-2 max-w-xl text-zinc-400">
              Save games you care about, reopen their pages faster, and prepare
              your account for future price alerts.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
              >
                Go to login
              </Link>

              <Link
                href="/pc?page=1&sort=all"
                className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
              >
                Explore PC deals
              </Link>
            </div>
          </div>
        ) : null}

        {userId ? (
          <>
            <div className="mb-8 grid gap-3 sm:grid-cols-2">
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
                  Signed in as
                </p>
                <p className="mt-2 text-sm font-medium text-zinc-200">
                  {userEmail || 'User'}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                Loading tracked games...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
                <h2 className="text-xl font-bold">No tracked games yet</h2>
                <p className="mt-2 max-w-2xl text-zinc-400">
                  Start tracking from Home, PC, Catalog, or any canonical game
                  page. Your list will live here so you can reopen games quickly
                  and prepare for alerts later.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href="/pc?page=1&sort=all"
                    className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    Explore PC deals
                  </Link>

                  <Link
                    href="/catalog"
                    className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
                  >
                    Open catalog
                  </Link>

                  <Link
                    href="/"
                    className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
                  >
                    Back to home
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                {items.map((item) => {
                  const salePrice = Number(item.sale_price || 0)
                  const normalPrice = Number(item.normal_price || 0)
                  const hasValidNormalPrice =
                    !Number.isNaN(normalPrice) &&
                    normalPrice > 0 &&
                    normalPrice > salePrice

                  const href = buildCanonicalTrackedHref(item)

                  return (
                    <article
                      key={item.id}
                      className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex min-w-0 gap-4">
                          <Link
                            href={href}
                            className="h-24 w-20 shrink-0 overflow-hidden rounded-2xl bg-zinc-800 transition hover:opacity-90"
                          >
                            {item.thumb ? (
                              <img
                                src={item.thumb}
                                alt={item.title}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </Link>

                          <div className="min-w-0">
                            <Link href={href} className="transition hover:text-emerald-300">
                              <h2 className="line-clamp-2 text-lg font-bold">
                                {item.title}
                              </h2>
                            </Link>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                                Tracked
                              </span>

                              <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                                {getTrackedStoreLabel(item.store_id)}
                              </span>

                              {isSteamTrackedItem(item) ? (
                                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                                  Steam tracked
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              {item.sale_price ? (
                                <span className="text-2xl font-bold text-emerald-400">
                                  ${item.sale_price}
                                </span>
                              ) : (
                                <span className="text-sm text-zinc-500">
                                  Price unavailable
                                </span>
                              )}

                              {hasValidNormalPrice ? (
                                <span className="text-sm text-zinc-400 line-through">
                                  ${item.normal_price}
                                </span>
                              ) : null}

                              {item.created_at ? (
                                <span className="text-xs text-zinc-500">
                                  Tracked {new Date(item.created_at).toLocaleDateString()}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={href}
                            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                          >
                            Open game page
                          </Link>

                          <button
                            onClick={() => removeTracked(item)}
                            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                          >
                            Remove tracked
                          </button>
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