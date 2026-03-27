'use client'

import Link from 'next/link'
import { useState } from 'react'
import { getStoreLogo, getStoreName } from '@/lib/storeMap'

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

export default function CatalogPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogGame[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const runSearch = async () => {
    if (!query.trim()) return

    setLoading(true)
    setSearched(true)

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
            Search games even if they are not currently on sale.
          </p>
        </header>

        <div className="mb-8 flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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

        {loading && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            Searching catalog...
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            No games found.
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {results.map((game) => {
              const hasActiveDeal = !!game.cheapestDealID && !!game.cheapest
              const salePrice = Number(game.cheapest || 0)
              const normalPrice = Number(game.normalPrice || 0)
              const hasValidNormalPrice =
                !Number.isNaN(normalPrice) &&
                normalPrice > 0 &&
                normalPrice > salePrice

              return (
                <article
                  key={game.gameID}
                  className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg"
                >
                  <div className="h-32 w-full bg-zinc-800">
                    {game.thumb ? (
                      <img
                        src={game.thumb}
                        alt={game.external || 'Game'}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>

                  <div className="p-4">
                    <h2 className="line-clamp-2 text-base font-bold">
                      {game.external}
                    </h2>

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
                      {hasActiveDeal ? (
                        <Link
                          href={`/game/${encodeURIComponent(
                            game.cheapestDealID || ''
                          )}?title=${encodeURIComponent(
                            game.external || ''
                          )}&thumb=${encodeURIComponent(
                            game.thumb || ''
                          )}&salePrice=${encodeURIComponent(
                            game.cheapest || ''
                          )}&normalPrice=${encodeURIComponent(
                            game.normalPrice || ''
                          )}&dealRating=&savings=${encodeURIComponent(
                            game.savings || ''
                          )}&gameID=${encodeURIComponent(
                            game.gameID
                          )}&storeID=${encodeURIComponent(game.storeID || '')}`}
                          className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
                        >
                          Open game page
                        </Link>
                      ) : (
                        <div className="rounded-xl border border-zinc-800 px-4 py-2 text-center text-sm text-zinc-500">
                          No active deal right now
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