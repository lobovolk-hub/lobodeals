'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getStoreLogo, getStoreName } from '@/lib/storeMap'
import { trackClick } from '@/lib/analytics'

type CanonicalPcOfferLocal = {
  id: string
  source: 'steam'
  title: string
  normalizedTitle: string
  canonicalKey: string
  slug: string
  steamAppID?: string
  gameID?: string
  dealID?: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  url?: string
  metacriticScore?: string
}

type CanonicalPcGameLocal = {
  id: string
  slug: string
  canonicalTitle: string
  normalizedTitle: string
  canonicalKey: string
  steamAppID?: string
  isFreeToPlay: boolean
  releaseDate: string | null
  shortDescription: string | null
  description: string | null
  headerImage: string | null
  capsuleImage: string | null
  screenshots: string[]
  heroImage: string | null
  metacritic: number | null
  offers: CanonicalPcOfferLocal[]
  heroOffer: CanonicalPcOfferLocal
  steamGenres: string[]
  steamDevelopers: string[]
  steamPublishers: string[]
  steamMovieUrl: string | null
}

function formatMoney(value?: string | number | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Not available'
  }

  return `$${amount.toFixed(2)}`
}

function getSafeDiscountPercent(
  salePrice?: string | number | null,
  normalPrice?: string | number | null,
  savings?: string | number | null
) {
  const sale = Number(salePrice || 0)
  const normal = Number(normalPrice || 0)
  const rawSavings = Number(savings || 0)

  if (normal > 0 && sale >= 0 && normal > sale) {
    const computed = ((normal - sale) / normal) * 100
    return Math.max(0, Math.min(99, Math.round(computed)))
  }

  if (Number.isFinite(rawSavings) && rawSavings > 0) {
    return Math.max(0, Math.min(99, Math.round(rawSavings)))
  }

  return 0
}

function cleanDescription(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return 'Description not available yet for this Steam PC entry.'

  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getReleaseLabel(value?: string | null) {
  if (!value) return 'Not available'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function pushTrackMessage(
  setTrackMessage: React.Dispatch<React.SetStateAction<string>>,
  message: string
) {
  setTrackMessage(message)
  window.setTimeout(() => setTrackMessage(''), 2500)
}

function MetricCard({
  label,
  value,
  sublabel,
}: {
  label: string
  value: string | number
  sublabel?: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {sublabel ? <p className="mt-1 text-[11px] text-zinc-500">{sublabel}</p> : null}
    </div>
  )
}

export default function PcCanonicalGamePage() {
  const params = useParams()
  const slug = String(params?.slug || '').trim()

  const [game, setGame] = useState<CanonicalPcGameLocal | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [isTracked, setIsTracked] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [trackMessage, setTrackMessage] = useState('')
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [thumbOffset, setThumbOffset] = useState(0)

  useEffect(() => {
    let cancelled = false

    const loadGame = async () => {
      try {
        setLoading(true)

        const res = await fetch(`/api/pc-canonical?slug=${encodeURIComponent(slug)}`)

        if (!res.ok) {
          if (!cancelled) {
            setGame(null)
          }
          return
        }

        const data = await res.json()

        if (!cancelled) {
          setGame(data as CanonicalPcGameLocal)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setGame(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    if (slug) {
      loadGame()
    } else {
      setGame(null)
      setLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    let cancelled = false

    const loadAuth = async () => {
      try {
        setAuthLoading(true)

        const {
          data: { session },
        } = await supabase.auth.getSession()

        const currentUserId = session?.user?.id ?? null

        if (cancelled) return

        setUserId(currentUserId)

        if (!currentUserId || !game?.steamAppID) {
          setIsTracked(false)
          return
        }

        const dealID = `steam-${game.steamAppID}`

        const { data } = await supabase
          .from('tracked_games')
          .select('deal_id')
          .eq('user_id', currentUserId)
          .eq('deal_id', dealID)

        if (!cancelled) {
          setIsTracked(!!data && data.length > 0)
        }
      } catch (error) {
        console.error(error)
      } finally {
        if (!cancelled) {
          setAuthLoading(false)
        }
      }
    }

    loadAuth()

    return () => {
      cancelled = true
    }
  }, [game?.steamAppID])

  useEffect(() => {
    if (!game) {
      setSelectedScreenshot(null)
      setThumbOffset(0)
      return
    }

    const firstScreenshot = game.screenshots?.[0] || null
    setSelectedScreenshot(firstScreenshot)
    setThumbOffset(0)

    trackClick({
      dealID: `steam-${game.steamAppID || game.canonicalKey}`,
      title: game.canonicalTitle,
      salePrice: game.heroOffer?.salePrice || '',
      normalPrice: game.heroOffer?.normalPrice || '',
      clickType: 'page_view',
    })
  }, [game])

  useEffect(() => {
    if (!lightboxOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [lightboxOpen])

  const heroOffer = game?.heroOffer || null
  const safeSavings = heroOffer
    ? getSafeDiscountPercent(heroOffer.salePrice, heroOffer.normalPrice, heroOffer.savings)
    : 0

  const screenshots = useMemo(() => {
    if (!game) return []

    return Array.from(
      new Set(
        (Array.isArray(game.screenshots) ? game.screenshots : [])
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    )
  }, [game])

  const maxThumbOffset = Math.max(0, screenshots.length - 4)
  const visibleThumbs = screenshots.slice(thumbOffset, thumbOffset + 4)

    const coverImage =
    game?.headerImage ||
    screenshots?.[0] ||
    game?.heroImage ||
    game?.heroOffer?.thumb ||
    game?.capsuleImage ||
    '/placeholder-game.jpg'

  const description = cleanDescription(game?.description || game?.shortDescription || '')
  const metacritic =
    typeof game?.metacritic === 'number'
      ? game.metacritic
      : heroOffer?.metacriticScore
      ? Number(heroOffer.metacriticScore)
      : null

  const releaseLabel = getReleaseLabel(game?.releaseDate || null)

  const genres =
    Array.isArray(game?.steamGenres) && game.steamGenres.length > 0
      ? game.steamGenres
      : []

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
            Loading PC game page...
          </div>
        </section>
      </main>
    )
  }

  if (!game) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="mb-6">
            <Link
              href="/pc?page=1&sort=all"
              className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
            >
              ← Back to PC
            </Link>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
            This PC game could not be resolved right now. Please try another entry.
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-6">
          <Link
            href="/pc?page=1&sort=all"
            className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
          >
            ← Back to PC
          </Link>
        </div>

        <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl">
          <div className="border-b border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black p-5 sm:p-6">
            {trackMessage ? (
              <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
                {trackMessage}
              </div>
            ) : null}

            <div className="grid items-start gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center justify-center overflow-hidden rounded-2xl bg-black">
                  <img
                    src={coverImage}
                    alt={game.canonicalTitle}
                    className="h-auto w-full object-contain"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs uppercase tracking-wider text-zinc-200">
                    PC
                  </span>

                  <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-300">
                    Steam
                  </span>

                  {game.isFreeToPlay ? (
                    <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-300">
                      Free to play
                    </span>
                  ) : safeSavings > 0 ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                      {safeSavings}% off
                    </span>
                  ) : null}
                </div>

                <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
                  {game.canonicalTitle}
                </h1>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <span className="text-4xl font-bold text-emerald-400">
                    {game.isFreeToPlay
                      ? 'Free'
                      : heroOffer?.salePrice
                      ? formatMoney(heroOffer.salePrice)
                      : heroOffer?.normalPrice
                      ? formatMoney(heroOffer.normalPrice)
                      : 'View store'}
                  </span>

                  {heroOffer?.normalPrice &&
                  Number(heroOffer.normalPrice) > Number(heroOffer.salePrice || 0) &&
                  Number(heroOffer.salePrice || 0) > 0 ? (
                    <span className="pb-1 text-lg text-zinc-400 line-through">
                      {formatMoney(heroOffer.normalPrice)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-300">
                    Steam PC
                  </span>

                  {game.steamAppID ? (
                    <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-300">
                      App ID: {game.steamAppID}
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Current Price"
                    value={
                      game.isFreeToPlay
                        ? 'Free'
                        : heroOffer?.salePrice
                        ? formatMoney(heroOffer.salePrice)
                        : heroOffer?.normalPrice
                        ? formatMoney(heroOffer.normalPrice)
                        : 'N/A'
                    }
                    sublabel="Steam US cached price"
                  />

                  <MetricCard
                    label="Discount"
                    value={game.isFreeToPlay ? 'Free' : safeSavings > 0 ? `${safeSavings}%` : '—'}
                    sublabel="Current Steam discount"
                  />

                  <MetricCard
                    label="Metacritic"
                    value={typeof metacritic === 'number' ? metacritic : '—'}
                    sublabel={typeof metacritic === 'number' ? 'Steam-first metadata' : 'Not available yet'}
                  />

                  <MetricCard
                    label="Release Date"
                    value={releaseLabel}
                    sublabel="Steam-first game data"
                  />
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    disabled={authLoading}
                    onClick={async () => {
                      if (!userId) {
                        pushTrackMessage(setTrackMessage, 'Sign in to track games')
                        return
                      }

                      try {
                        const res = await fetch('/api/track', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            userId,
                            dealID: `steam-${game.steamAppID || game.canonicalKey}`,
                            gameID: '',
                            title: game.canonicalTitle,
                            thumb: game.heroOffer?.thumb || game.headerImage || '',
                            salePrice: game.heroOffer?.salePrice || '',
                            normalPrice: game.heroOffer?.normalPrice || '',
                            storeID: '1',
                          }),
                        })

                        const data = await res.json()

                        if (data.success && data.action === 'added') {
                          setIsTracked(true)
                          trackClick({
                            dealID: `steam-${game.steamAppID || game.canonicalKey}`,
                            title: game.canonicalTitle,
                            salePrice: game.heroOffer?.salePrice || '',
                            normalPrice: game.heroOffer?.normalPrice || '',
                            clickType: 'track_add',
                          })
                          pushTrackMessage(setTrackMessage, `Added to tracked: ${game.canonicalTitle}`)
                          return
                        }

                        if (data.success && data.action === 'removed') {
                          setIsTracked(false)
                          trackClick({
                            dealID: `steam-${game.steamAppID || game.canonicalKey}`,
                            title: game.canonicalTitle,
                            salePrice: game.heroOffer?.salePrice || '',
                            normalPrice: game.heroOffer?.normalPrice || '',
                            clickType: 'track_remove',
                          })
                          pushTrackMessage(setTrackMessage, `Removed from tracked: ${game.canonicalTitle}`)
                          return
                        }

                        pushTrackMessage(setTrackMessage, `Track error: ${data.error || 'Unknown error'}`)
                      } catch {
                        pushTrackMessage(setTrackMessage, 'Could not update tracked right now')
                      }
                    }}
                    className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
                      isTracked
                        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800'
                    }`}
                  >
                    {isTracked ? 'Tracked' : 'Track game'}
                  </button>

                  {heroOffer?.url ? (
                    <Link
                      href={heroOffer.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() =>
                        trackClick({
                          dealID: `steam-${game.steamAppID || game.canonicalKey}`,
                          title: game.canonicalTitle,
                          salePrice: game.heroOffer?.salePrice || '',
                          normalPrice: game.heroOffer?.normalPrice || '',
                          clickType: 'open_deal_game_page',
                        })
                      }
                      className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                    >
                      Open on Steam —{' '}
                      {game.isFreeToPlay
                        ? 'Free'
                        : heroOffer?.salePrice
                        ? formatMoney(heroOffer.salePrice)
                        : heroOffer?.normalPrice
                        ? formatMoney(heroOffer.normalPrice)
                        : 'View store'}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">Screenshots</h2>
                  <p className="text-sm text-zinc-400">
                    Real Steam screenshots only. Click to expand.
                  </p>
                </div>

                {screenshots.length > 4 ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={thumbOffset <= 0}
                      onClick={() => setThumbOffset((prev) => Math.max(0, prev - 1))}
                      className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ←
                    </button>

                    <button
                      type="button"
                      disabled={thumbOffset >= maxThumbOffset}
                      onClick={() => setThumbOffset((prev) => Math.min(maxThumbOffset, prev + 1))}
                      className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      →
                    </button>
                  </div>
                ) : null}
              </div>

              {visibleThumbs.length > 0 ? (
                <div className="mt-3 grid grid-cols-4 gap-3">
                  {visibleThumbs.map((shot) => (
                    <button
                      key={shot}
                      type="button"
                      onClick={() => {
                        setSelectedScreenshot(shot)
                        setLightboxOpen(true)
                      }}
                      className={`overflow-hidden rounded-2xl border transition ${
                        selectedScreenshot === shot
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : 'border-zinc-800 bg-zinc-950 hover:bg-zinc-800'
                      }`}
                    >
                      <img
                        src={shot}
                        alt={game.canonicalTitle}
                        className="h-24 w-full object-cover sm:h-28"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                  Screenshots not cached yet for this game.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="text-xl font-bold text-white">Overview</h2>

              {genres.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {genres.map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="mt-4 text-sm leading-7 text-zinc-300">{description}</p>
            </div>

            <aside className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="text-xl font-bold text-white">Store Offers</h2>
              <p className="mt-2 text-sm text-zinc-400">Current Steam pricing entries resolved for this game.</p>

              <div className="mt-4 space-y-3">
                {game.offers.map((offer) => {
                  const savings = getSafeDiscountPercent(
                    offer.salePrice,
                    offer.normalPrice,
                    offer.savings
                  )

                  return (
                    <div
                      key={offer.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-2">
                          {getStoreLogo(offer.storeID) ? (
                            <img
                              src={getStoreLogo(offer.storeID)!}
                              alt={getStoreName(offer.storeID)}
                              className="h-5 w-5 object-contain"
                            />
                          ) : null}
                          <span className="text-sm font-medium text-white">
                            {getStoreName(offer.storeID)}
                          </span>
                        </div>

                        {savings > 0 ? (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                            {savings}% off
                          </span>
                        ) : game.isFreeToPlay ? (
                          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs text-sky-300">
                            Free
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex items-end justify-between gap-2">
                        <span className="text-2xl font-bold text-emerald-400">
                          {game.isFreeToPlay
                            ? 'Free'
                            : offer.salePrice
                            ? formatMoney(offer.salePrice)
                            : offer.normalPrice
                            ? formatMoney(offer.normalPrice)
                            : 'View store'}
                        </span>

                        {offer.normalPrice &&
                        Number(offer.normalPrice) > Number(offer.salePrice || 0) &&
                        Number(offer.salePrice || 0) > 0 ? (
                          <span className="text-sm text-zinc-400 line-through">
                            {formatMoney(offer.normalPrice)}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3">
                        {offer.url ? (
                          <Link
                            href={offer.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() =>
                              trackClick({
                                dealID:
                                  offer.dealID || `steam-${game.steamAppID || game.canonicalKey}`,
                                title: game.canonicalTitle,
                                salePrice: offer.salePrice || '',
                                normalPrice: offer.normalPrice || '',
                                clickType: 'open_deal_store_card',
                              })
                            }
                            className="inline-flex rounded-xl border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-100 transition hover:bg-zinc-800"
                          >
                            Open store page
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {lightboxOpen && selectedScreenshot ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-6xl overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-100 transition hover:bg-zinc-800"
            >
              Close
            </button>

            <img
              src={selectedScreenshot}
              alt={game.canonicalTitle}
              className="max-h-[90vh] w-full object-contain"
            />
          </div>
        </div>
      ) : null}
    </main>
  )
}