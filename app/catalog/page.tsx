'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { getStoreLogo, getStoreName } from '@/lib/storeMap'

type CatalogGame = {
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
  canOpenPage: boolean
}

export default function CatalogPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogGame[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const [suggestions, setSuggestions] = useState<CatalogGame[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestionBoxRef = useRef<HTMLDivElement | null>(null)

  const buildGameHref = (item: CatalogGame) => {
    return `/pc/${encodeURIComponent(item.slug)}`
  }

  const getPriceLabel = (item: CatalogGame) => {
    if (item.isFreeToPlay) return 'Free to play'
    if (item.hasActiveOffer && item.salePrice) return `$${item.salePrice}`
    return 'No current Steam price cached'
  }

  const getPriceSubLabel = (item: CatalogGame) => {
    if (item.isFreeToPlay) {
      return 'Included in the Steam PC catalog'
    }

    if (
      item.hasActiveOffer &&
      item.normalPrice &&
      Number(item.normalPrice) > Number(item.salePrice || 0)
    ) {
      return `Regular price: $${item.normalPrice}`
    }

    return item.isCatalogReady
      ? 'Catalog entry without active sale'
      : 'Base catalog entry imported from Steam'
  }

  useEffect(() => {
    const q = query.trim()

    if (q.length < 2) {
      setSuggestions([])
      setSuggestionsLoading(false)
      return
    }

    const timer = setTimeout(async () => {
      try {
        setSuggestionsLoading(true)
        const res = await fetch(
          `/api/catalog-suggest?title=${encodeURIComponent(q)}`
        )
        const data = await res.json()
        setSuggestions(Array.isArray(data) ? data.slice(0, 5) : [])
      } catch (error) {
        console.error(error)
        setSuggestions([])
      } finally {
        setSuggestionsLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionBoxRef.current &&
        !suggestionBoxRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const runSearch = async () => {
    if (query.trim().length < 2) return

    setLoading(true)
    setSearched(true)
    setShowSuggestions(false)

    try {
      const res = await fetch(
        `/api/catalog-search?title=${encodeURIComponent(query.trim())}`
      )
      const data = await res.json()
      setResults(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error(error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Catalog
          </p>
          <h1 className="mt-1 text-3xl font-bold">Steam PC Game Search</h1>
          <p className="mt-2 text-zinc-400">
            Search the Steam PC catalog from the local LoboDeals layer.
          </p>
        </header>

        <div className="mb-8" ref={suggestionBoxRef}>
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch()
              }}
              placeholder="Search Steam PC games..."
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
            />

            <button
              onClick={runSearch}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
            >
              Search
            </button>
          </div>

          {showSuggestions && query.trim().length > 0 ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              {query.trim().length < 2 ? (
                <div className="px-4 py-3 text-sm text-zinc-500">
                  Type at least 2 letters.
                </div>
              ) : suggestionsLoading ? (
                <div className="px-4 py-3 text-sm text-zinc-400">
                  Loading suggestions...
                </div>
              ) : suggestions.length > 0 ? (
                suggestions.map((item) => {
                  const href = buildGameHref(item)

                  return item.canOpenPage ? (
                    <Link
                      key={item.id}
                      href={href}
                      onClick={() => {
                        setQuery(item.title || '')
                        setShowSuggestions(false)
                      }}
                      className="flex w-full items-center gap-3 border-t border-zinc-800 px-4 py-3 text-left transition first:border-t-0 hover:bg-zinc-800"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                        {item.thumb ? (
                          <img
                            src={item.thumb}
                            alt={item.title || 'Game'}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {item.title}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {item.isFreeToPlay
                            ? 'Free to play'
                            : item.hasActiveOffer && item.salePrice
                            ? `Current Steam price: $${item.salePrice}`
                            : 'No active Steam offer cached'}
                        </p>
                      </div>

                      <span className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 transition">
                        Open
                      </span>
                    </Link>
                  ) : (
                    <div
                      key={item.id}
                      className="flex w-full items-center gap-3 border-t border-zinc-800 px-4 py-3 text-left first:border-t-0 opacity-80"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                        {item.thumb ? (
                          <img
                            src={item.thumb}
                            alt={item.title || 'Game'}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {item.title}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Page not ready yet for this catalog entry
                        </p>
                      </div>

                      <span className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-500">
                        Soon
                      </span>
                    </div>
                  )
                })
              ) : (
                <div className="px-4 py-3 text-sm text-zinc-500">
                  No suggestions found.
                </div>
              )}
            </div>
          ) : null}
        </div>

        {loading && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            Searching Steam PC catalog...
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            No Steam PC games found for that search.
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {results.map((game) => {
              const salePrice = Number(game.salePrice || 0)
              const normalPrice = Number(game.normalPrice || 0)
              const hasValidNormalPrice =
                !Number.isNaN(normalPrice) &&
                normalPrice > 0 &&
                normalPrice > salePrice

              const href = buildGameHref(game)

              return (
                <article
                  key={game.id}
                  className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg"
                >
                  {game.canOpenPage ? (
                    <Link href={href} className="block h-32 w-full bg-zinc-800">
                      {game.thumb ? (
                        <img
                          src={game.thumb}
                          alt={game.title || 'Game'}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </Link>
                  ) : (
                    <div className="block h-32 w-full bg-zinc-800">
                      {game.thumb ? (
                        <img
                          src={game.thumb}
                          alt={game.title || 'Game'}
                          className="h-full w-full object-cover opacity-90"
                        />
                      ) : null}
                    </div>
                  )}

                  <div className="p-4">
                    {game.canOpenPage ? (
                      <Link href={href}>
                        <h2 className="line-clamp-2 text-base font-bold transition hover:text-emerald-300">
                          {game.title}
                        </h2>
                      </Link>
                    ) : (
                      <h2 className="line-clamp-2 text-base font-bold text-zinc-100">
                        {game.title}
                      </h2>
                    )}

                    <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-xs uppercase tracking-wider text-zinc-500">
                        Steam PC status
                      </p>

                      <div className="mt-2 flex items-end justify-between gap-2">
                        <p className="text-2xl font-bold text-emerald-400">
                          {getPriceLabel(game)}
                        </p>

                        {hasValidNormalPrice ? (
                          <p className="text-sm text-zinc-400 line-through">
                            ${game.normalPrice}
                          </p>
                        ) : null}
                      </div>

                      <p className="mt-2 text-xs text-zinc-500">
                        {getPriceSubLabel(game)}
                      </p>

                      {game.hasActiveOffer ? (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
                          {getStoreLogo(game.storeID) && (
                            <img
                              src={getStoreLogo(game.storeID)!}
                              alt={getStoreName(game.storeID)}
                              className="h-4 w-4 object-contain"
                            />
                          )}
                          <span>{getStoreName(game.storeID)}</span>
                          {Number(game.savings || 0) > 0 ? (
                            <span>· {game.savings}% off</span>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-zinc-500">
                          No active offer cached
                        </p>
                      )}
                    </div>

                    <div className="mt-4">
                      {game.canOpenPage ? (
                        <Link
                          href={href}
                          className="block rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
                        >
                          Open game page
                        </Link>
                      ) : (
                        <div className="block rounded-xl border border-zinc-700 px-4 py-2 text-center text-sm font-medium text-zinc-500">
                          Page not ready yet
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}