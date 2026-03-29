'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { getStoreLogo, getStoreName } from '@/lib/storeMap'
import RegionNotice from '@/app/components/RegionNotice'

type CatalogGame = {
  gameID: string
  steamAppID?: string
  cheapest?: string
  cheapestDealID?: string
  external?: string
  internalName?: string
  thumb?: string
  normalPrice?: string
  storeID?: string
  savings?: string
}

type CatalogStats = {
  steamCatalogSize: number
  updatedAt: string | null
}

type SteamCatalogFeatured = {
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

export default function CatalogPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogGame[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const [suggestions, setSuggestions] = useState<CatalogGame[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [catalogStats, setCatalogStats] = useState<CatalogStats>({
    steamCatalogSize: 0,
    updatedAt: null,
  })

  const [steamFeatured, setSteamFeatured] = useState<SteamCatalogFeatured[]>([])
  const [steamFeaturedLoading, setSteamFeaturedLoading] = useState(true)

    const buildCanonicalHref = (title: string) => {
    const slug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')

    return `/pc/${encodeURIComponent(slug)}`
  }

  const suggestionBoxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const q = query.trim()

    if (q.length < 3) {
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
    }, 400)

    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let cancelled = false

    const loadCatalogStats = async () => {
      try {
        const res = await fetch('/api/catalog-stats')
        const data = await res.json()

        if (!cancelled) {
          setCatalogStats({
            steamCatalogSize: Number(data?.steamCatalogSize || 0),
            updatedAt: data?.updatedAt || null,
          })
        }
      } catch (error) {
        console.error(error)
      }
    }

    loadCatalogStats()

    return () => {
      cancelled = true
    }
  }, [])

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

  useEffect(() => {
    let cancelled = false

    const loadSteamFeatured = async () => {
      try {
        setSteamFeaturedLoading(true)

        const res = await fetch('/api/steam-spotlight?limit=8')
        const data = await res.json()

        if (!cancelled) {
          setSteamFeatured(Array.isArray(data) ? data.slice(0, 8) : [])
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setSteamFeatured([])
        }
      } finally {
        if (!cancelled) {
          setSteamFeaturedLoading(false)
        }
      }
    }

    loadSteamFeatured()

    return () => {
      cancelled = true
    }
  }, [])

    const buildGameHref = (item: CatalogGame) => {
    return buildCanonicalHref(item.external || 'game')
  }

  const runSearch = async () => {
    if (!query.trim()) return

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
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Catalog
          </p>
          <h1 className="mt-1 text-3xl font-bold">All Games Search</h1>
          <p className="mt-2 text-zinc-400">
            Search games even if they are not currently on sale, with a much
            larger Steam catalog behind the lookup layer.
          </p>
        </header>

        <div className="mb-6">
          <RegionNotice />
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Steam catalog size
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {catalogStats.steamCatalogSize || 0}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Search layer
            </p>
            <p className="mt-2 text-2xl font-bold text-white">Catalog</p>
            <p className="mt-1 text-xs text-zinc-500">
              Game lookup even without active deals
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Steam featured
            </p>
            <p className="mt-2 text-2xl font-bold text-white">8</p>
            <p className="mt-1 text-xs text-zinc-500">
              Quick entry points before searching
            </p>
          </div>
        </div>

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
              placeholder="Search any game..."
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
              {query.trim().length < 3 ? (
                <div className="px-4 py-3 text-sm text-zinc-500">
                  Type at least 3 letters.
                </div>
              ) : suggestionsLoading ? (
                <div className="px-4 py-3 text-sm text-zinc-400">
                  Loading suggestions...
                </div>
              ) : suggestions.length > 0 ? (
                suggestions.map((item) => {
                  const href = buildGameHref(item)

                  return (
                    <Link
                      key={item.gameID}
                      href={href}
                      onClick={() => {
                        setQuery(item.external || '')
                        setShowSuggestions(false)
                      }}
                      className="flex w-full items-center gap-3 border-t border-zinc-800 px-4 py-3 text-left transition first:border-t-0 hover:bg-zinc-800"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                        {item.thumb ? (
                          <img
                            src={item.thumb}
                            alt={item.external || 'Game'}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {item.external}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {item.cheapest
                            ? `Known price: $${item.cheapest}`
                            : 'No active deal right now'}
                        </p>
                      </div>

                      <span className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 transition">
                        Open
                      </span>
                    </Link>
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
            Searching catalog...
          </div>
        )}

        {!searched ? (
          <section className="mb-10">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">Steam featured</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Quick entry points from the Steam layer while the wider
                  catalog keeps growing.
                </p>
              </div>

              <Link
                href="/pc?sort=steam-spotlight"
                className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
              >
                View Steam Spotlight
              </Link>
            </div>

            {steamFeaturedLoading ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                Loading featured Steam games...
              </div>
            ) : steamFeatured.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                No featured Steam games available right now.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                {steamFeatured.map((item) => {
                  const salePrice = Number(item.salePrice || 0)
                  const normalPrice = Number(item.normalPrice || 0)
                  const hasValidNormalPrice =
                    !Number.isNaN(normalPrice) &&
                    normalPrice > 0 &&
                    normalPrice > salePrice

                                    const href = buildCanonicalHref(item.title)

                  return (
                    <article
                      key={item.steamAppID}
                      className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg"
                    >
                      <Link href={href} className="block h-32 w-full bg-zinc-800">
                        {item.thumb ? (
                          <img
                            src={item.thumb}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </Link>

                      <div className="p-4">
                        <Link href={href}>
                          <h2 className="line-clamp-2 text-base font-bold transition hover:text-emerald-300">
                            {item.title}
                          </h2>
                        </Link>

                        <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                          <p className="text-xs uppercase tracking-wider text-zinc-500">
                            Featured Steam price
                          </p>

                          <div className="mt-2 flex items-end justify-between gap-2">
                            <p className="text-2xl font-bold text-emerald-400">
                              ${item.salePrice}
                            </p>

                            {hasValidNormalPrice ? (
                              <p className="text-sm text-zinc-400 line-through">
                                ${item.normalPrice}
                              </p>
                            ) : null}
                          </div>

                          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
                            {getStoreLogo(item.storeID) && (
                              <img
                                src={getStoreLogo(item.storeID)!}
                                alt={getStoreName(item.storeID)}
                                className="h-4 w-4 object-contain"
                              />
                            )}
                            <span>{getStoreName(item.storeID)}</span>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2">
                          <Link
                            href={href}
                            className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
                          >
                            Open game page
                          </Link>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        ) : null}

        {!loading && searched && results.length === 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            No games found.
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {results.map((game) => {
              const salePrice = Number(game.cheapest || 0)
              const normalPrice = Number(game.normalPrice || 0)
              const hasValidNormalPrice =
                !Number.isNaN(normalPrice) &&
                normalPrice > 0 &&
                normalPrice > salePrice

              const href = buildGameHref(game)

              return (
                <article
                  key={game.gameID}
                  className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg"
                >
                  <Link href={href} className="block h-32 w-full bg-zinc-800">
                    {game.thumb ? (
                      <img
                        src={game.thumb}
                        alt={game.external || 'Game'}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </Link>

                  <div className="p-4">
                    <Link href={href}>
                      <h2 className="line-clamp-2 text-base font-bold transition hover:text-emerald-300">
                        {game.external}
                      </h2>
                    </Link>

                    <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-xs uppercase tracking-wider text-zinc-500">
                        Best current known price
                      </p>

                      <div className="mt-2 flex items-end justify-between gap-2">
                        <p className="text-2xl font-bold text-emerald-400">
                          {game.cheapest ? `$${game.cheapest}` : 'No active deal'}
                        </p>

                        {hasValidNormalPrice ? (
                          <p className="text-sm text-zinc-400 line-through">
                            ${game.normalPrice}
                          </p>
                        ) : null}
                      </div>

                      {game.storeID ? (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
                          {getStoreLogo(game.storeID) && (
                            <img
                              src={getStoreLogo(game.storeID)!}
                              alt={getStoreName(game.storeID)}
                              className="h-4 w-4 object-contain"
                            />
                          )}
                          <span>{getStoreName(game.storeID)}</span>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-zinc-500">
                          Search-level catalog result
                        </p>
                      )}
                    </div>

                    <div className="mt-4 grid gap-2">
                      <Link
                        href={href}
                        className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
                      >
                        Open game page
                      </Link>
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