'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getStoreLogo, getStoreName } from '@/lib/storeMap'
import { getPlatformLabel } from '@/lib/platformMap'
import RegionNotice from '@/app/components/RegionNotice'

type Game = {
  dealID: string
  title: string
  thumb: string
  salePrice: string
  normalPrice: string
  dealRating: string
  savings: string
  storeID?: string
  gameID?: string
  metacriticScore?: string
  steamAppID?: string
  steamUrl?: string
  source?: string
}

type RelatedDeal = {
  dealID: string
  gameID?: string
  title?: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
  storeID?: string
  dealRating?: string
  metacriticScore?: string
  steamUrl?: string
}

type RawgMeta = {
  name: string
  description: string
  background_image: string
  rating: number
  metacritic: number | null
  released: string
  genres: string[]
  platforms: string[]
  screenshots: string[]
}

function SectionLoading({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
      {text}
    </div>
  )
}

function formatMoney(value?: string | number | null) {
  const amount = Number(value ?? 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return 'N/A'
  }

  return `$${amount.toFixed(2)}`
}

function formatHistoricalDate(value?: string | null) {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getReleaseYear(value?: string | null) {
  if (!value) return 'N/A'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'N/A'
  }

  return String(date.getFullYear())
}

function getReleaseLabel(value?: string | null) {
  if (!value) return 'No release date available'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function cleanDescription(text?: string) {
  if (!text) return ''
  return text.trim()
}

export default function GamePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const dealID = decodeURIComponent(params.dealID as string)

  const [game, setGame] = useState<Game | null>(null)
  const [heroReady, setHeroReady] = useState(false)
  const [steamDetailLoaded, setSteamDetailLoaded] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [isTracked, setIsTracked] = useState(false)

  const [rawgMeta, setRawgMeta] = useState<RawgMeta | null>(null)
  const [rawgLoading, setRawgLoading] = useState(true)
  const [rawgRefreshKey, setRawgRefreshKey] = useState(0)

  const [relatedDeals, setRelatedDeals] = useState<RelatedDeal[]>([])
  const [relatedDealsLoading, setRelatedDealsLoading] = useState(true)

  const [historicalLow, setHistoricalLow] = useState<string | null>(null)
  const [historicalLowDate, setHistoricalLowDate] = useState<string | null>(null)
  const [historicalLowLoading, setHistoricalLowLoading] = useState(true)

  const [authLoading, setAuthLoading] = useState(true)
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(
    null
  )

  useEffect(() => {
    const gameFromUrl: Game = {
      dealID,
      title: searchParams.get('title') || 'Game',
      thumb: searchParams.get('thumb') || '',
      salePrice: searchParams.get('salePrice') || '0',
      normalPrice: searchParams.get('normalPrice') || '',
      dealRating: searchParams.get('dealRating') || '',
      savings: searchParams.get('savings') || '0',
      storeID: searchParams.get('storeID') || '',
      gameID: searchParams.get('gameID') || '',
      metacriticScore: searchParams.get('metacriticScore') || '',
      steamAppID: searchParams.get('steamAppID') || '',
      steamUrl: searchParams.get('steamUrl') || '',
      source: searchParams.get('source') || '',
    }

    setGame(gameFromUrl)
    setHeroReady(true)
  }, [dealID, searchParams])

  useEffect(() => {
    if (!game) return

    const isSteamInternalGame =
      game.source === 'steam-spotlight' ||
      game.dealID.startsWith('steam-') ||
      !!game.steamAppID

    if (!isSteamInternalGame || !game.steamAppID) {
      setSteamDetailLoaded(true)
      return
    }

    let cancelled = false

    const loadSteamDetail = async () => {
      try {
        const res = await fetch(
          `/api/steam-game?steamAppID=${encodeURIComponent(game.steamAppID || '')}`
        )

        if (!res.ok) {
          if (!cancelled) setSteamDetailLoaded(true)
          return
        }

        const data = await res.json()

        if (cancelled) return

        setGame((prev) =>
          prev
            ? {
                ...prev,
                title: data.title || prev.title,
                thumb: data.thumb || prev.thumb,
                salePrice: data.salePrice || prev.salePrice,
                normalPrice: data.normalPrice || prev.normalPrice,
                savings: data.savings || prev.savings,
                storeID: data.storeID || prev.storeID,
                steamUrl: data.url || prev.steamUrl,
              }
            : prev
        )
      } catch (error) {
        console.error('Steam detail error:', error)
      } finally {
        if (!cancelled) setSteamDetailLoaded(true)
      }
    }

    loadSteamDetail()

    return () => {
      cancelled = true
    }
  }, [game?.dealID, game?.steamAppID, game?.source])

  useEffect(() => {
    if (!game) return

    let cancelled = false

    const loadRelatedDeals = async () => {
      setRelatedDealsLoading(true)

      try {
        const relatedRes = await fetch(
          `/api/game-deals?gameID=${encodeURIComponent(
            game.gameID || ''
          )}&title=${encodeURIComponent(
            game.title
          )}&steamAppID=${encodeURIComponent(
            game.steamAppID || ''
          )}&steamUrl=${encodeURIComponent(
            game.steamUrl || ''
          )}&steamSalePrice=${encodeURIComponent(
            game.salePrice || ''
          )}&steamNormalPrice=${encodeURIComponent(
            game.normalPrice || ''
          )}&steamSavings=${encodeURIComponent(
            game.savings || ''
          )}&thumb=${encodeURIComponent(game.thumb || '')}`
        )

        if (!relatedRes.ok) {
          if (!cancelled) setRelatedDeals([])
          return
        }

        const relatedData = await relatedRes.json()
        const deals = Array.isArray(relatedData) ? relatedData : []

        if (cancelled) return

        setRelatedDeals(deals)

        const exactMatch = deals.find(
          (deal: RelatedDeal) => deal.dealID === game.dealID
        )

        const firstGameIDFromRelated = deals.find(
          (deal: RelatedDeal) => deal.gameID && deal.gameID !== ''
        )?.gameID

        setGame((prev) => {
          if (!prev) return prev

          const nextGameID =
            prev.gameID && prev.gameID !== '' ? prev.gameID : firstGameIDFromRelated || ''

          if (exactMatch) {
            return {
              ...prev,
              salePrice:
                exactMatch.salePrice && exactMatch.salePrice !== ''
                  ? exactMatch.salePrice
                  : prev.salePrice,
              normalPrice:
                exactMatch.normalPrice && exactMatch.normalPrice !== ''
                  ? exactMatch.normalPrice
                  : prev.normalPrice,
              savings:
                exactMatch.savings && exactMatch.savings !== ''
                  ? exactMatch.savings
                  : prev.savings,
              storeID:
                exactMatch.storeID && exactMatch.storeID !== ''
                  ? exactMatch.storeID
                  : prev.storeID,
              thumb:
                exactMatch.thumb && exactMatch.thumb !== ''
                  ? exactMatch.thumb
                  : prev.thumb,
              metacriticScore:
                exactMatch.metacriticScore && exactMatch.metacriticScore !== ''
                  ? exactMatch.metacriticScore
                  : prev.metacriticScore,
              gameID: nextGameID,
            }
          }

          if (nextGameID && nextGameID !== prev.gameID) {
            return {
              ...prev,
              gameID: nextGameID,
            }
          }

          return prev
        })
      } catch (error) {
        console.error('Related deals error:', error)
        if (!cancelled) setRelatedDeals([])
      } finally {
        if (!cancelled) setRelatedDealsLoading(false)
      }
    }

    loadRelatedDeals()

    return () => {
      cancelled = true
    }
  }, [
    game?.dealID,
    game?.gameID,
    game?.title,
    game?.steamAppID,
    game?.steamUrl,
    game?.salePrice,
    game?.normalPrice,
    game?.savings,
    game?.thumb,
  ])

  useEffect(() => {
    if (!game) return

    let cancelled = false
    const resolvedGameID =
      game.gameID ||
      relatedDeals.find((deal) => deal.gameID && deal.gameID !== '')?.gameID ||
      ''

    const loadHistoricalLow = async () => {
      if (!resolvedGameID) {
        if (!cancelled) {
          setHistoricalLow(null)
          setHistoricalLowDate(null)
          setHistoricalLowLoading(false)
        }
        return
      }

      setHistoricalLowLoading(true)

      try {
        const pricingRes = await fetch(
          `/api/game-pricing?gameID=${encodeURIComponent(resolvedGameID)}`
        )

        if (!pricingRes.ok) {
          if (!cancelled) {
            setHistoricalLow(null)
            setHistoricalLowDate(null)
          }
          return
        }

        const pricingData = await pricingRes.json()

        if (!cancelled) {
          setHistoricalLow(pricingData.cheapestPriceEver || null)
          setHistoricalLowDate(pricingData.cheapestPriceEverDate || null)
        }
      } catch (error) {
        console.error('Historical low error:', error)
        if (!cancelled) {
          setHistoricalLow(null)
          setHistoricalLowDate(null)
        }
      } finally {
        if (!cancelled) setHistoricalLowLoading(false)
      }
    }

    loadHistoricalLow()

    return () => {
      cancelled = true
    }
  }, [game?.gameID, relatedDeals])

  useEffect(() => {
    if (!game) return

    let cancelled = false

    const loadRawg = async () => {
      setRawgLoading(true)

      try {
        const rawgRes = await fetch(
          `/api/rawg?dealID=${encodeURIComponent(
            game.dealID
          )}&title=${encodeURIComponent(game.title)}&storeID=${encodeURIComponent(
            game.storeID || ''
          )}${rawgRefreshKey > 0 ? '&forceRefresh=1' : ''}`
        )

        if (!rawgRes.ok) {
          if (!cancelled) setRawgMeta(null)
          return
        }

        const rawgData = await rawgRes.json()
        if (!cancelled) setRawgMeta(rawgData)
      } catch (error) {
        console.error('RAWG error:', error)
        if (!cancelled) setRawgMeta(null)
      } finally {
        if (!cancelled) setRawgLoading(false)
      }
    }

    loadRawg()

    return () => {
      cancelled = true
    }
  }, [game?.dealID, game?.title, game?.storeID, rawgRefreshKey])

  useEffect(() => {
    if (!game) return

    let cancelled = false

    const loadAuthState = async () => {
      setAuthLoading(true)

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const currentUserId = session?.user?.id ?? null

        if (cancelled) return

        setUserId(currentUserId)

        if (!currentUserId) {
          setIsTracked(false)
          return
        }

        const { data: tracked } = await supabase
          .from('tracked_games')
          .select('deal_id')
          .eq('user_id', currentUserId)
          .eq('deal_id', game.dealID)

        if (!cancelled) {
          setIsTracked(!!tracked && tracked.length > 0)
        }
      } catch (error) {
        console.error('Auth state error:', error)
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }

    loadAuthState()

    return () => {
      cancelled = true
    }
  }, [game?.dealID])

  const salePriceNumber = Number(game?.salePrice || 0)
  const normalPriceNumber = Number(game?.normalPrice || 0)

  const hasValidNormalPrice =
    !Number.isNaN(normalPriceNumber) &&
    normalPriceNumber > 0 &&
    normalPriceNumber > salePriceNumber

  const displayDiscount =
    Number(game?.savings || 0) > 0
      ? Math.round(Number(game?.savings || 0))
      : hasValidNormalPrice && salePriceNumber > 0
      ? Math.round(
          ((normalPriceNumber - salePriceNumber) / normalPriceNumber) * 100
        )
      : 0

  const metacriticValue =
    rawgMeta?.metacritic != null && rawgMeta?.metacritic !== 0
      ? rawgMeta.metacritic
      : game?.metacriticScore
      ? Number(game.metacriticScore)
      : null

  const isSteamInternalGame =
    game?.source === 'steam-spotlight' ||
    game?.dealID?.startsWith('steam-') ||
    !!game?.steamUrl

  const primaryDealHref =
    isSteamInternalGame && game?.steamUrl
      ? game.steamUrl
      : `/api/redirect?dealID=${encodeURIComponent(
          game?.dealID || ''
        )}&title=${encodeURIComponent(
          game?.title || ''
        )}&salePrice=${encodeURIComponent(
          game?.salePrice || ''
        )}&normalPrice=${encodeURIComponent(game?.normalPrice || '')}`

  const primaryDealLabel =
    isSteamInternalGame && game?.steamUrl
      ? `Open Steam — $${game?.salePrice || '0'}`
      : `Open best deal — $${game?.salePrice || '0'}`

  const dealLabel = useMemo(() => {
    if (displayDiscount >= 85) {
      return { text: '🔥 Brutal deal', color: 'text-red-400' }
    }
    if (displayDiscount >= 70) {
      return { text: '💎 Great price', color: 'text-emerald-400' }
    }
    if (displayDiscount >= 50) {
      return { text: '👍 Good discount', color: 'text-cyan-400' }
    }
    if (relatedDeals.length > 0) {
      return { text: '🛒 Available now', color: 'text-zinc-300' }
    }
    return { text: '📦 Catalog entry', color: 'text-zinc-400' }
  }, [displayDiscount, relatedDeals.length])

  const overview = cleanDescription(rawgMeta?.description)
const releaseYear = getReleaseYear(rawgMeta?.released)
const releaseLabel = getReleaseLabel(rawgMeta?.released)

const discountedRelatedDeals = relatedDeals.filter((deal) => {
  const sale = Number(deal.salePrice || 0)
  const normal = Number(deal.normalPrice || 0)
  const savings = Number(deal.savings || 0)

  return (normal > sale && sale > 0) || savings > 0
})

  if (!heroReady || !game || !steamDetailLoaded) {
    return <div className="p-10 text-white">Loading...</div>
  }

  return (
    <main className="relative min-h-screen text-zinc-100">
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={rawgMeta?.background_image || game.thumb}
          alt={game.title}
          className="h-full w-full scale-110 object-cover opacity-30 blur-2xl"
        />
        <div className="absolute inset-0 bg-zinc-950/80" />
      </div>

      <section className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 backdrop-blur">
          <div className="mb-6">
            <RegionNotice />
          </div>

          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div>
              <img
                src={rawgMeta?.background_image || game.thumb}
                alt={game.title}
                className="h-[500px] w-full rounded-2xl object-cover shadow-xl"
              />
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <h1 className="max-w-3xl text-3xl font-bold leading-tight">
                  {game.title}
                </h1>

                <p className={`mt-2 text-sm font-medium ${dealLabel.color}`}>
                  {dealLabel.text}
                </p>

                <button
                  type="button"
                  onClick={() => setRawgRefreshKey((prev) => prev + 1)}
                  className="mt-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
                >
                  Refresh game metadata
                </button>

                <div className="mt-4 flex flex-wrap items-end gap-4">
                  <span className="text-4xl font-bold text-emerald-400">
                    {formatMoney(game.salePrice)}
                  </span>

                  {hasValidNormalPrice ? (
                    <span className="text-lg text-zinc-400 line-through">
                      {formatMoney(game.normalPrice)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {displayDiscount > 0 ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                      -{displayDiscount}%
                    </span>
                  ) : null}

                  <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    {getStoreLogo(game.storeID) && (
                      <img
                        src={getStoreLogo(game.storeID)!}
                        alt={getStoreName(game.storeID)}
                        className="h-4 w-4 object-contain"
                      />
                    )}
                    <span>{getStoreName(game.storeID)}</span>
                  </span>

                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    {getPlatformLabel(game.storeID)}
                  </span>

                  {isSteamInternalGame ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                      Steam featured
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    Historical low
                  </p>
                  {historicalLowLoading ? (
                    <p className="mt-2 text-sm text-zinc-400">Loading…</p>
                  ) : (
                    <>
                      <p className="mt-2 text-2xl font-bold text-pink-300">
                        {historicalLow ? formatMoney(historicalLow) : 'N/A'}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {historicalLowDate
                          ? `Source date: ${formatHistoricalDate(historicalLowDate)}`
                          : 'No historical date available'}
                      </p>
                    </>
                  )}
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    Metacritic
                  </p>
                  <p className="mt-2 text-2xl font-bold text-cyan-300">
                    {metacriticValue != null && !Number.isNaN(metacriticValue)
                      ? metacriticValue
                      : 'N/A'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    RAWG metadata
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
  <p className="text-xs uppercase tracking-wider text-zinc-500">
    Active deals
  </p>
  <p className="mt-2 text-2xl font-bold text-emerald-300">
    {relatedDealsLoading ? '…' : discountedRelatedDeals.length}
  </p>
  <p className="mt-1 text-xs text-zinc-500">
    Discounted offers only
  </p>
</div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    Release date
                  </p>
                  <p className="mt-2 text-2xl font-bold text-zinc-100">
                    {releaseYear}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{releaseLabel}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  onClick={async () => {
                    if (!userId || !game) return

                    const res = await fetch('/api/track', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId,
                        dealID: game.dealID,
                        gameID: game.gameID,
                        title: game.title,
                        thumb: game.thumb,
                        salePrice: game.salePrice,
                        normalPrice: game.normalPrice,
                        storeID: game.storeID,
                      }),
                    })

                    const data = await res.json()

                    if (data.action === 'added') setIsTracked(true)
                    if (data.action === 'removed') setIsTracked(false)
                  }}
                  disabled={authLoading}
                  className={`rounded-xl px-4 py-3 text-sm font-medium transition active:scale-[0.98] ${
                    isTracked
                      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border border-zinc-700 hover:bg-zinc-800'
                  } ${authLoading ? 'opacity-60' : ''}`}
                >
                  {authLoading
                    ? 'Loading...'
                    : isTracked
                    ? 'Tracked game'
                    : 'Track game'}
                </button>

                <a
                  href={primaryDealHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-white px-5 py-3 text-center text-sm font-bold text-black transition hover:opacity-90 active:scale-[0.98]"
                >
                  {primaryDealLabel}
                </a>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
                {rawgLoading ? (
                  <p className="text-sm text-zinc-400">Loading screenshots...</p>
                ) : rawgMeta?.screenshots && rawgMeta.screenshots.length > 0 ? (
                  <div className="grid grid-cols-4 gap-3">
                    {rawgMeta.screenshots.slice(0, 4).map((shot, index) => (
                      <button
                        key={`${shot}-${index}`}
                        type="button"
                        onClick={() => setSelectedScreenshot(shot)}
                        className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition hover:opacity-90 active:scale-[0.98]"
                      >
                        <img
                          src={shot}
                          alt={`${game.title} screenshot ${index + 1}`}
                          className="h-30 w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">
                    No screenshots were found for this game.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
            <h2 className="text-lg font-semibold">Deal Summary</h2>

            <p className="mt-3 text-sm leading-6 text-zinc-300">
              {displayDiscount >= 85
                ? 'This game is a brutal deal and clearly falls into the recommended purchase category if you were already interested.'
                : displayDiscount >= 70
                ? "It's a strong and attractive discount. Well worth considering if it was already on your radar."
                : displayDiscount >= 50
                ? "It has a good discount, although it doesn't necessarily look like a historic steal. Still a solid opportunity."
                : relatedDeals.length > 0
                ? 'This game is available right now in approved stores, even if the current pricing is not especially aggressive.'
                : 'This game is currently part of the catalog, but there are no approved active deals visible right now.'}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                Current price: {formatMoney(game.salePrice)}
              </span>

              {hasValidNormalPrice ? (
                <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                  Regular price: {formatMoney(game.normalPrice)}
                </span>
              ) : null}

              {displayDiscount > 0 ? (
                <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                  Discount: -{displayDiscount}%
                </span>
              ) : null}
            </div>
          </div>

          {rawgLoading ? (
            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
              <SectionLoading text="Loading game overview..." />
            </div>
          ) : overview ? (
            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
              <h2 className="text-lg font-semibold">Overview</h2>

              {Array.isArray(rawgMeta?.genres) && rawgMeta.genres.length > 0 ? (
  <div className="mt-4 flex flex-wrap gap-2">
    {rawgMeta.genres.map((genre) => (
      <span
        key={genre}
        className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
      >
        {genre}
      </span>
    ))}
  </div>
) : null}

              {Array.isArray(rawgMeta?.platforms) && rawgMeta.platforms.length > 0 ? (
  <div className="mt-4 flex flex-wrap gap-2">
    {rawgMeta.platforms.map((platform) => (
      <span
        key={platform}
        className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
      >
        {platform}
      </span>
    ))}
  </div>
) : null}

              <p className="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-300">
                {overview}
              </p>
            </div>
          ) : null}

          <section className="mt-10">
            <div className="mb-4">
              <h2 className="text-2xl font-bold">Available stores</h2>
              <p className="text-sm text-zinc-400">
                Current approved stores for this exact game.
              </p>
            </div>

            {relatedDealsLoading ? (
              <SectionLoading text="Loading stores..." />
            ) : relatedDeals.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                No additional approved stores found right now.
              </div>
            ) : (
              <div className="grid gap-3">
                {relatedDeals.map((deal) => {
                  const relatedSalePrice = Number(deal.salePrice || 0)
                  const relatedNormalPrice = Number(deal.normalPrice || 0)
                  const relatedHasValidNormal =
                    !Number.isNaN(relatedNormalPrice) &&
                    relatedNormalPrice > 0 &&
                    relatedNormalPrice > relatedSalePrice

                  const relatedDiscount =
                    relatedHasValidNormal && relatedSalePrice > 0
                      ? Math.round(
                          ((relatedNormalPrice - relatedSalePrice) /
                            relatedNormalPrice) *
                            100
                        )
                      : Number(deal.savings || 0) > 0
                      ? Math.round(Number(deal.savings || 0))
                      : 0

                  return (
                    <div
                      key={deal.dealID}
                      className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                            {getStoreLogo(deal.storeID) && (
                              <img
                                src={getStoreLogo(deal.storeID)!}
                                alt={getStoreName(deal.storeID)}
                                className="h-4 w-4 object-contain"
                              />
                            )}
                            <span>{getStoreName(deal.storeID)}</span>
                          </span>

                          {deal.dealID === game.dealID ? (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                              Current card
                            </span>
                          ) : null}

                          {relatedDiscount > 0 ? (
                            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                              {relatedDiscount}% off
                            </span>
                          ) : (
                            <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                              Available now
                            </span>
                          )}
                        </div>

                        <p className="mt-2 truncate text-sm text-zinc-400">
                          {deal.title}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xl font-bold text-emerald-400">
                            {formatMoney(deal.salePrice)}
                          </p>
                          {relatedHasValidNormal ? (
                            <p className="text-sm text-zinc-400 line-through">
                              {formatMoney(deal.normalPrice)}
                            </p>
                          ) : (
                            <p className="text-sm text-zinc-500">
                              Regular store price
                            </p>
                          )}
                        </div>

                        <a
  href={
    deal.dealID?.startsWith('steam-') && deal.steamUrl
      ? deal.steamUrl
      : `/api/redirect?dealID=${encodeURIComponent(
          deal.dealID || ''
        )}&title=${encodeURIComponent(
          deal.title || ''
        )}&salePrice=${encodeURIComponent(
          deal.salePrice || ''
        )}&normalPrice=${encodeURIComponent(
          deal.normalPrice || ''
        )}`
  }
  target="_blank"
  rel="noopener noreferrer"
  className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium transition hover:bg-zinc-800"
>
  {deal.dealID?.startsWith('steam-')
    ? relatedDiscount > 0
      ? 'Open Steam deal'
      : 'Open Steam'
    : relatedDiscount > 0
    ? 'Open deal'
    : 'Open store'}
</a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </section>

      {selectedScreenshot ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setSelectedScreenshot(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedScreenshot(null)}
            className="absolute right-4 top-4 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
          >
            Close
          </button>

          <img
            src={selectedScreenshot}
            alt="Expanded screenshot"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl border border-zinc-800 shadow-2xl"
          />
        </div>
      ) : null}
    </main>
  )
}