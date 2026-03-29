'use client'

import Link from 'next/link'
import { useSearchParams, useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import RegionNotice from '@/app/components/RegionNotice'
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

type RawgMeta = {
  name?: string
  description?: string
  background_image?: string
  rating?: number
  metacritic?: number | null
  released?: string
  genres?: string[]
  platforms?: string[]
  screenshots?: string[]
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

function formatMoney(value?: string) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return 'N/A'
  }

  return `$${amount.toFixed(2)}`
}

function hasRealDiscount(deal?: CatalogDeal) {
  const sale = Number(deal?.price || 0)
  const retail = Number(deal?.retailPrice || 0)
  const savings = Number(deal?.savings || 0)

  return retail > sale && savings > 0
}

function cleanDescription(text?: string) {
  if (!text) return ''

  return text.trim()
}

export default function CatalogGamePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const gameID = decodeURIComponent(params.gameID as string)

  const [data, setData] = useState<CatalogGameDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const [rawgMeta, setRawgMeta] = useState<RawgMeta | null>(null)
  const [rawgLoading, setRawgLoading] = useState(true)

  const title = searchParams.get('title') || 'Game'
  const thumb = searchParams.get('thumb') || ''

  useEffect(() => {
    let cancelled = false

    const fetchGame = async () => {
      try {
        setLoading(true)

        const res = await fetch(
          `https://www.cheapshark.com/api/1.0/games?id=${encodeURIComponent(
            gameID
          )}`,
          {
            cache: 'no-store',
            headers: {
              Accept: 'application/json',
              'User-Agent': 'LoboDeals/1.0',
            },
          }
        )

        if (!res.ok) {
          if (!cancelled) setData(null)
          return
        }

        const json = await res.json()

        if (!cancelled) {
          setData(json)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setData(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchGame()

    return () => {
      cancelled = true
    }
  }, [gameID])

  const approvedDeals = useMemo(() => {
    const deals = Array.isArray(data?.deals) ? data.deals : []

    return deals
      .filter((deal) => isAllowedStore(deal.storeID))
      .sort((a, b) => Number(a.price || 999999) - Number(b.price || 999999))
  }, [data])

  const displayTitle = data?.info?.title || title
  const displayThumb = data?.info?.thumb || thumb

  useEffect(() => {
    let cancelled = false

    const loadRawg = async () => {
      if (!displayTitle) {
        setRawgMeta(null)
        setRawgLoading(false)
        return
      }

      try {
        setRawgLoading(true)

        const res = await fetch(
          `/api/rawg?title=${encodeURIComponent(displayTitle)}&storeID=1`
        )

        if (!res.ok) {
          if (!cancelled) setRawgMeta(null)
          return
        }

        const json = await res.json()

        if (!cancelled) {
          setRawgMeta(json)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setRawgMeta(null)
        }
      } finally {
        if (!cancelled) {
          setRawgLoading(false)
        }
      }
    }

    loadRawg()

    return () => {
      cancelled = true
    }
  }, [displayTitle])

  const bestDeal = approvedDeals[0]
const bestDealHasDiscount = hasRealDiscount(bestDeal)
const discountedApprovedDeals = approvedDeals.filter((deal) =>
  hasRealDiscount(deal)
)

const heroImage = rawgMeta?.background_image || displayThumb
const overview = cleanDescription(rawgMeta?.description)
const screenshots = Array.isArray(rawgMeta?.screenshots)
  ? rawgMeta!.screenshots!.filter(Boolean).slice(0, 4)
  : []

  const dealSummaryLabel = bestDealHasDiscount
    ? 'Best current deal'
    : approvedDeals.length > 0
    ? 'Available now'
    : 'No approved deal'

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-6">
          <Link
            href="/catalog"
            className="inline-block rounded-xl border border-zinc-700 px-4 py-2 text-sm transition hover:bg-zinc-800"
          >
            ← Back to catalog
          </Link>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
          {heroImage ? (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20 blur-0"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
          ) : null}

          <div className="absolute inset-0 bg-gradient-to-br from-red-950/60 via-zinc-950/80 to-zinc-950" />

          <div className="relative p-6 sm:p-8">
            <RegionNotice />

            <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
              <div>
                <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl">
                  {heroImage ? (
                    <img
                      src={heroImage}
                      alt={displayTitle}
                      className="h-[430px] w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-[430px] items-center justify-center bg-zinc-800 text-sm text-zinc-500">
                      No image available
                    </div>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
                  Catalog
                </p>

                <h1 className="mt-2 text-4xl font-bold tracking-tight">
                  {displayTitle}
                </h1>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    {dealSummaryLabel}
                  </span>

                  {bestDealHasDiscount ? (
                    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                      {`${Math.round(Number(bestDeal?.savings || 0))}% off`}
                    </span>
                  ) : null}

                  {approvedDeals.length > 0 ? (
                    <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                      {getStoreName(bestDeal?.storeID)}
                    </span>
                  ) : null}

                  {Array.isArray(rawgMeta?.platforms)
                    ? rawgMeta.platforms.slice(0, 3).map((platform) => (
                        <span
                          key={platform}
                          className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
                        >
                          {platform}
                        </span>
                      ))
                    : null}
                </div>

                <div className="mt-6">
                  {approvedDeals.length > 0 ? (
                    <>
                      <div className="flex flex-wrap items-end gap-3">
                        <p className="text-5xl font-bold text-emerald-400">
                          {formatMoney(bestDeal?.price)}
                        </p>

                        {bestDealHasDiscount ? (
                          <p className="pb-1 text-xl text-zinc-400 line-through">
                            {formatMoney(bestDeal?.retailPrice)}
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {bestDealHasDiscount ? (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                            You save{' '}
                            {formatMoney(
                              String(
                                Number(bestDeal?.retailPrice || 0) -
                                  Number(bestDeal?.price || 0)
                              )
                            )}
                          </span>
                        ) : (
                          <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                            Current store price
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <p className="text-sm text-zinc-400">
                        No approved active deals right now. You can still explore
                        the game overview, historical low, and store availability
                        below.
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
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

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
  <p className="text-xs uppercase tracking-wider text-zinc-500">
    Active deals
  </p>
  <p className="mt-2 text-2xl font-bold text-emerald-300">
    {discountedApprovedDeals.length}
  </p>
  <p className="mt-1 text-xs text-zinc-500">
    Discounted offers only
  </p>
</div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-xs uppercase tracking-wider text-zinc-500">
                      Metacritic
                    </p>
                    <p className="mt-2 text-2xl font-bold text-cyan-300">
                      {rawgMeta?.metacritic != null ? rawgMeta.metacritic : 'N/A'}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      RAWG metadata
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-xs uppercase tracking-wider text-zinc-500">
                      Release date
                    </p>
                    <p className="mt-2 text-2xl font-bold text-zinc-100">
                      {rawgMeta?.released
                        ? new Date(rawgMeta.released).getFullYear()
                        : 'N/A'}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {rawgMeta?.released || 'No release date available'}
                    </p>
                  </div>
                </div>

                {screenshots.length > 0 ? (
                  <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {screenshots.map((shot, index) => (
                      <div
                        key={`${shot}-${index}`}
                        className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
                      >
                        <img
                          src={shot}
                          alt={`${displayTitle} screenshot ${index + 1}`}
                          className="h-28 w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {rawgLoading ? (
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            Loading game overview...
          </div>
        ) : overview ? (
          <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-2xl font-bold">Overview</h2>

            {Array.isArray(rawgMeta?.genres) && rawgMeta.genres.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {rawgMeta.genres.slice(0, 6).map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            ) : null}

            <p className="mt-4 whitespace-pre-line text-sm leading-8 text-zinc-300">
              {overview}
            </p>
          </section>
        ) : null}

        <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-2xl font-bold">Current deals</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Approved stores currently offering this game.
          </p>

          {loading ? (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
              Loading deals...
            </div>
          ) : approvedDeals.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
              No approved active deals right now.
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              {approvedDeals.map((deal, index) => {
                const isBest = index === 0
                const discounted = hasRealDiscount(deal)

                return (
                  <div
                    key={`${deal.dealID}-${index}`}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-zinc-700"
                  >
                    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0 lg:pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                            {getStoreLogo(deal.storeID) ? (
                              <img
                                src={getStoreLogo(deal.storeID)!}
                                alt={getStoreName(deal.storeID)}
                                className="h-4 w-4 object-contain"
                              />
                            ) : null}
                            <span>{getStoreName(deal.storeID)}</span>
                          </div>

                          {isBest ? (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                              {discounted ? 'Best current deal' : 'Available now'}
                            </span>
                          ) : null}

                          {discounted ? (
                            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                              {`${Math.round(Number(deal.savings || 0))}% off`}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3">
                          <p className="text-4xl font-bold text-emerald-400">
                            {formatMoney(deal.price)}
                          </p>

                          {discounted ? (
                            <p className="text-sm text-zinc-400 line-through">
                              {formatMoney(deal.retailPrice)}
                            </p>
                          ) : (
                            <p className="text-sm text-zinc-500">
                              Regular store price
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
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
  )}&gameID=${encodeURIComponent(
    gameID
  )}&storeID=${encodeURIComponent(deal.storeID || '')}`}
  className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium transition hover:bg-zinc-800"
>
  {discounted ? 'Open deal page' : 'Open store page'}
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
  {discounted ? 'Go to store' : 'Open store'}
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
      </section>
    </main>
  )
}