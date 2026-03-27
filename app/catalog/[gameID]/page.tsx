'use client'

import Link from 'next/link'
import { useSearchParams, useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { getStoreLogo, getStoreName, isAllowedStore } from '@/lib/storeMap'

type CatalogDeal = {
  dealID?: string
  storeID?: string
  price?: string
  retailPrice?: string
  savings?: string
}

type CatalogGameDetail = {
  info?: {
    title?: string
    thumb?: string
  }
  cheapestPriceEver?: {
    price?: string
    date?: number
  }
  deals?: CatalogDeal[]
}

function formatUnixDate(timestamp?: number) {
  if (!timestamp) return 'Unknown date'

  try {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return 'Unknown date'
  }
}

export default function CatalogGamePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const gameID = decodeURIComponent(params.gameID as string)

  const [data, setData] = useState<CatalogGameDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const title = searchParams.get('title') || 'Game'
  const thumb = searchParams.get('thumb') || ''

  useEffect(() => {
    const fetchGame = async () => {
      try {
        setLoading(true)

        const res = await fetch(
          `https://www.cheapshark.com/api/1.0/games?id=${encodeURIComponent(
            gameID
          )}`
        )

        const json = await res.json()
        setData(json)
      } catch (error) {
        console.error(error)
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchGame()
  }, [gameID])

  const approvedDeals = useMemo(() => {
    const deals = Array.isArray(data?.deals) ? data!.deals! : []

    return deals
      .filter((deal) => isAllowedStore(deal.storeID))
      .sort((a, b) => Number(a.price || 999999) - Number(b.price || 999999))
  }, [data])

  const displayTitle = data?.info?.title || title
  const displayThumb = data?.info?.thumb || thumb

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Link
          href="/catalog"
          className="mb-6 inline-block rounded-xl border border-zinc-700 px-4 py-2 text-sm transition hover:bg-zinc-800"
        >
          ← Back to catalog
        </Link>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div>
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              {displayThumb ? (
                <img
                  src={displayThumb}
                  alt={displayTitle}
                  className="h-[380px] w-full object-cover"
                />
              ) : (
                <div className="flex h-[380px] items-center justify-center bg-zinc-800 text-sm text-zinc-500">
                  No image available
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
              Catalog
            </p>
            <h1 className="mt-2 text-3xl font-bold">{displayTitle}</h1>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Historical low
                </p>
                <p className="mt-2 text-2xl font-bold text-pink-300">
                  {data?.cheapestPriceEver?.price
                    ? `$${data.cheapestPriceEver.price}`
                    : 'N/A'}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {data?.cheapestPriceEver?.date
                    ? `Source date: ${formatUnixDate(
                        data.cheapestPriceEver.date
                      )}`
                    : 'No historical date available'}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Active deals
                </p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">
                  {approvedDeals.length}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Approved stores only
                </p>
              </div>
            </div>

            <section className="mt-8">
              <h2 className="text-xl font-bold">Current deals</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Approved stores currently offering this game.
              </p>

              {loading ? (
                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                  Loading deals...
                </div>
              ) : approvedDeals.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                  No approved active deals right now.
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {approvedDeals.map((deal, index) => {
                    const isBest = index === 0
                    const salePrice = deal.price ? `$${deal.price}` : 'N/A'
                    const retailPrice = deal.retailPrice
                      ? `$${deal.retailPrice}`
                      : ''
                    const savings = deal.savings
                      ? `${Math.round(Number(deal.savings))}% off`
                      : ''

                    return (
                      <div
                        key={`${deal.dealID}-${index}`}
                        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition hover:border-zinc-700"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                                {getStoreLogo(deal.storeID) && (
                                  <img
                                    src={getStoreLogo(deal.storeID)!}
                                    alt={getStoreName(deal.storeID)}
                                    className="h-4 w-4 object-contain"
                                  />
                                )}
                                <span>{getStoreName(deal.storeID)}</span>
                              </div>

                              {isBest && (
                                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                                  Best current deal
                                </span>
                              )}

                              {savings && (
                                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                                  {savings}
                                </span>
                              )}
                            </div>

                            <div className="mt-3">
                              <p className="text-2xl font-bold text-emerald-400">
                                {salePrice}
                              </p>
                              {retailPrice ? (
                                <p className="text-sm text-zinc-400 line-through">
                                  {retailPrice}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {deal.dealID ? (
                              <Link
                                href={`/game/${encodeURIComponent(
                                  deal.dealID
                                )}?title=${encodeURIComponent(
                                  displayTitle
                                )}&thumb=${encodeURIComponent(
                                  displayThumb
                                )}&salePrice=${encodeURIComponent(
                                  deal.price || ''
                                )}&normalPrice=${encodeURIComponent(
                                  deal.retailPrice || ''
                                )}&dealRating=&savings=${encodeURIComponent(
                                  deal.savings || ''
                                )}&gameID=${encodeURIComponent(gameID)}&storeID=${encodeURIComponent(
                                  deal.storeID || ''
                                )}`}
                                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium transition hover:bg-zinc-800"
                              >
                                Open deal page
                              </Link>
                            ) : null}

                            {deal.dealID ? (
                              <a
                                href={`/api/redirect?dealID=${encodeURIComponent(
                                  deal.dealID
                                )}&title=${encodeURIComponent(
                                  displayTitle
                                )}&salePrice=${encodeURIComponent(
                                  deal.price || ''
                                )}&normalPrice=${encodeURIComponent(
                                  deal.retailPrice || ''
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                              >
                                Go to store
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}