'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import RegionNotice from '@/app/components/RegionNotice'
import { getStoreLogo, getStoreName } from '@/lib/storeMap'

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
  clip?: string | null
}

type CanonicalPcOffer = {
  id: string
  source: 'steam' | 'deal'
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

type CanonicalPcGame = {
  slug: string
  canonicalTitle: string
  normalizedTitle: string
  canonicalKey: string
  steamAppID?: string
  offers: CanonicalPcOffer[]
  heroOffer: CanonicalPcOffer
}

type SteamStoreItem = {
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

type DisplayGame = {
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

function formatMoney(value?: string | number | null) {
  const amount = Number(value ?? 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return 'N/A'
  }

  return `$${amount.toFixed(2)}`
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

function normalizeTitle(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™©]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[:\-–—_/.,+!?'"]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSafeDiscountPercent(
  salePrice?: string,
  normalPrice?: string,
  savings?: string
) {
  const sale = Number(salePrice || 0)
  const normal = Number(normalPrice || 0)
  const rawSavings = Number(savings || 0)

  if (normal > 0 && sale > 0 && normal > sale) {
    const computed = ((normal - sale) / normal) * 100
    return Math.max(0, Math.min(99, Math.round(computed)))
  }

  if (Number.isFinite(rawSavings) && rawSavings > 0) {
    return Math.max(0, Math.min(99, Math.round(rawSavings)))
  }

  return 0
}

function hasRealDiscount(
  salePrice?: string,
  normalPrice?: string,
  savings?: string
) {
  return getSafeDiscountPercent(salePrice, normalPrice, savings) > 0
}

function makeFallbackDisplayGame(input: {
  slug: string
  steamAppID?: string
  title?: string
  thumb?: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  storeID?: string
  steamUrl?: string
}): DisplayGame {
  return {
    steamAppID: input.steamAppID || '',
    title: input.title || input.slug.replace(/-/g, ' '),
    salePrice: input.salePrice || '0',
    normalPrice: input.normalPrice || '0',
    savings: String(
      getSafeDiscountPercent(
        input.salePrice || '0',
        input.normalPrice || '0',
        input.savings || '0'
      )
    ),
    thumb: input.thumb || '',
    storeID: input.storeID || '1',
    platform: 'PC',
    url: input.steamUrl || '',
  }
}

export default function PcCanonicalGamePage() {
  const params = useParams()
  const searchParams = useSearchParams()

  const slug = decodeURIComponent((params.slug as string) || '')

  const steamAppIDFromUrl = searchParams.get('steamAppID') || ''
  const titleFromUrl = searchParams.get('title') || ''
  const thumbFromUrl = searchParams.get('thumb') || ''
  const salePriceFromUrl = searchParams.get('salePrice') || ''
  const normalPriceFromUrl = searchParams.get('normalPrice') || ''
  const savingsFromUrl = searchParams.get('savings') || ''
  const storeIDFromUrl = searchParams.get('storeID') || '1'
  const steamUrlFromUrl = searchParams.get('steamUrl') || ''

  const [canonicalGame, setCanonicalGame] = useState<CanonicalPcGame | null>(null)
  const [canonicalLoading, setCanonicalLoading] = useState(true)

  const [rawgMeta, setRawgMeta] = useState<RawgMeta | null>(null)
  const [rawgLoading, setRawgLoading] = useState(true)

  const [historicalLow, setHistoricalLow] = useState<string | null>(null)
  const [historicalLowLabel, setHistoricalLowLabel] = useState<string | null>(
    null
  )
  const [historicalLowLoading, setHistoricalLowLoading] = useState(true)

  const [userId, setUserId] = useState<string | null>(null)
  const [isTracked, setIsTracked] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)

  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(
    null
  )

  useEffect(() => {
    let cancelled = false

    const loadCanonicalGame = async () => {
      try {
        setCanonicalLoading(true)

        const query = new URLSearchParams()
        query.set('slug', slug)

        if (titleFromUrl) query.set('title', titleFromUrl)
        if (steamAppIDFromUrl) query.set('steamAppID', steamAppIDFromUrl)

        const res = await fetch(`/api/pc-canonical?${query.toString()}`)

        if (!res.ok) {
          if (!cancelled) {
            setCanonicalGame(null)
          }
          return
        }

        const data = await res.json()

        if (!cancelled) {
          setCanonicalGame(data as CanonicalPcGame)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setCanonicalGame(null)
        }
      } finally {
        if (!cancelled) {
          setCanonicalLoading(false)
        }
      }
    }

    if (slug) {
      loadCanonicalGame()
    } else {
      setCanonicalGame(null)
      setCanonicalLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [slug, titleFromUrl, steamAppIDFromUrl])

  const displayGame: DisplayGame = useMemo(() => {
    if (canonicalGame?.heroOffer) {
      return {
        steamAppID: canonicalGame.heroOffer.steamAppID || '',
        title: canonicalGame.canonicalTitle || canonicalGame.heroOffer.title,
        salePrice: canonicalGame.heroOffer.salePrice || '0',
        normalPrice: canonicalGame.heroOffer.normalPrice || '0',
        savings: String(
          getSafeDiscountPercent(
            canonicalGame.heroOffer.salePrice,
            canonicalGame.heroOffer.normalPrice,
            canonicalGame.heroOffer.savings
          )
        ),
        thumb: canonicalGame.heroOffer.thumb || thumbFromUrl || '',
        storeID: canonicalGame.heroOffer.storeID || '1',
        platform: 'PC',
        url: canonicalGame.heroOffer.url || steamUrlFromUrl || '',
      }
    }

    return makeFallbackDisplayGame({
      slug,
      steamAppID: steamAppIDFromUrl,
      title: titleFromUrl,
      thumb: thumbFromUrl,
      salePrice: salePriceFromUrl,
      normalPrice: normalPriceFromUrl,
      savings: savingsFromUrl,
      storeID: storeIDFromUrl,
      steamUrl: steamUrlFromUrl,
    })
  }, [
    canonicalGame,
    slug,
    steamAppIDFromUrl,
    titleFromUrl,
    thumbFromUrl,
    salePriceFromUrl,
    normalPriceFromUrl,
    savingsFromUrl,
    storeIDFromUrl,
    steamUrlFromUrl,
  ])

  const canonicalStores = useMemo(() => {
    if (canonicalGame?.offers?.length) {
      return canonicalGame.offers.map((offer) => ({
        ...offer,
        savings: String(
          getSafeDiscountPercent(
            offer.salePrice,
            offer.normalPrice,
            offer.savings
          )
        ),
        isDiscounted: hasRealDiscount(
          offer.salePrice,
          offer.normalPrice,
          offer.savings
        ),
      }))
    }

    const fallbackSavings = String(
      getSafeDiscountPercent(
        displayGame.salePrice,
        displayGame.normalPrice,
        displayGame.savings
      )
    )

    return [
      {
        id: `steam-${displayGame.steamAppID || normalizeTitle(displayGame.title)}`,
        source: 'steam' as const,
        title: displayGame.title,
        normalizedTitle: normalizeTitle(displayGame.title),
        canonicalKey: normalizeTitle(displayGame.title),
        slug,
        steamAppID: displayGame.steamAppID,
        gameID: '',
        dealID: `steam-${displayGame.steamAppID || normalizeTitle(displayGame.title)}`,
        salePrice: displayGame.salePrice,
        normalPrice: displayGame.normalPrice,
        savings: fallbackSavings,
        thumb: displayGame.thumb,
        storeID: displayGame.storeID || '1',
        url: displayGame.url || '',
        metacriticScore: '',
        isDiscounted: Number(fallbackSavings) > 0,
      },
    ]
  }, [canonicalGame, displayGame, slug])

  const heroStore = canonicalStores[0] || null

  useEffect(() => {
    let cancelled = false

    const loadRawg = async () => {
      if (!displayGame?.title) {
        setRawgMeta(null)
        setRawgLoading(false)
        return
      }

      try {
        setRawgLoading(true)

        const res = await fetch(
          `/api/rawg?title=${encodeURIComponent(displayGame.title)}&storeID=1`
        )

        if (!res.ok) {
          if (!cancelled) setRawgMeta(null)
          return
        }

        const data = await res.json()

        if (!cancelled) {
          setRawgMeta(data)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) setRawgMeta(null)
      } finally {
        if (!cancelled) setRawgLoading(false)
      }
    }

    if (displayGame?.title) {
      loadRawg()
    }

    return () => {
      cancelled = true
    }
  }, [displayGame?.title])

  useEffect(() => {
    let cancelled = false

    const loadHistoricalLow = async () => {
      if (!displayGame?.title) {
        setHistoricalLow(null)
        setHistoricalLowLabel(null)
        setHistoricalLowLoading(false)
        return
      }

      try {
        setHistoricalLowLoading(true)

        const res = await fetch('/api/steam-spotlight?limit=1200')

        if (!res.ok) {
          if (!cancelled) {
            setHistoricalLow(null)
            setHistoricalLowLabel(null)
          }
          return
        }

        const data = await res.json()
        const list = Array.isArray(data) ? (data as SteamStoreItem[]) : []

        const normalizedBase = normalizeTitle(displayGame.title)

        const matches = list.filter((item) => {
          const normalizedCandidate = normalizeTitle(item.title)
          return normalizedCandidate === normalizedBase
        })

        if (!matches.length) {
          if (!cancelled) {
            setHistoricalLow(null)
            setHistoricalLowLabel(null)
          }
          return
        }

        const sorted = [...matches].sort(
          (a, b) => Number(a.salePrice || 999999) - Number(b.salePrice || 999999)
        )

        if (!cancelled) {
          setHistoricalLow(sorted[0]?.salePrice || null)
          setHistoricalLowLabel('Steam sales layer')
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setHistoricalLow(null)
          setHistoricalLowLabel(null)
        }
      } finally {
        if (!cancelled) {
          setHistoricalLowLoading(false)
        }
      }
    }

    if (displayGame?.title) {
      loadHistoricalLow()
    }

    return () => {
      cancelled = true
    }
  }, [displayGame?.title])

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

        if (!currentUserId || !displayGame?.steamAppID) {
          setIsTracked(false)
          return
        }

        const dealID = `steam-${displayGame.steamAppID}`

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
  }, [displayGame?.steamAppID])

  const screenshots = useMemo(() => {
    return Array.isArray(rawgMeta?.screenshots) ? rawgMeta!.screenshots : []
  }, [rawgMeta])

  const coverImage =
    rawgMeta?.background_image || displayGame.thumb || '/placeholder-game.jpg'

  const overview = cleanDescription(rawgMeta?.description)

  const releaseYear = getReleaseYear(rawgMeta?.released)
  const releaseLabel = getReleaseLabel(rawgMeta?.released)

  const metacriticValue =
    typeof rawgMeta?.metacritic === 'number' ? rawgMeta.metacritic : null

  const platformTags = Array.isArray(rawgMeta?.platforms) && rawgMeta.platforms.length > 0
    ? rawgMeta.platforms
    : ['PC']

  const titleLabel = canonicalGame?.canonicalTitle || displayGame.title || 'PC Game'

  const pageLoading = canonicalLoading && !canonicalGame && !titleFromUrl

  if (pageLoading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
            Loading canonical PC game...
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

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-6">
          <RegionNotice />

          {!canonicalLoading && !canonicalGame ? (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
              Canonical data was not fully resolved, so this page is using fallback
              information from the entry point. The next step will be removing that
              dependency even more aggressively.
            </div>
          ) : null}

          <div className="mt-4 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <img
                src={coverImage}
                alt={titleLabel}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs uppercase tracking-wider text-zinc-300">
                  PC
                </span>

                {heroStore?.storeID ? (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                    {getStoreName(heroStore.storeID)}
                  </span>
                ) : null}

                {heroStore?.isDiscounted ? (
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                    {Math.round(Number(heroStore?.savings || 0))}% off
                  </span>
                ) : (
                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    Available now
                  </span>
                )}

                {platformTags.slice(0, 4).map((platform) => (
                  <span
                    key={platform}
                    className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
                  >
                    {platform}
                  </span>
                ))}
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                {titleLabel}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="text-4xl font-extrabold text-emerald-400">
                  {formatMoney(heroStore?.salePrice)}
                </p>

                {heroStore?.isDiscounted ? (
                  <p className="text-lg text-zinc-400 line-through">
                    {formatMoney(heroStore?.normalPrice)}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                {heroStore?.storeID ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-zinc-300">
                    {getStoreLogo(heroStore.storeID) ? (
                      <img
                        src={getStoreLogo(heroStore.storeID)!}
                        alt={getStoreName(heroStore.storeID)}
                        className="h-4 w-4 object-contain"
                      />
                    ) : null}
                    <span>{getStoreName(heroStore.storeID)}</span>
                  </span>
                ) : null}

                {heroStore?.isDiscounted ? (
                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-zinc-300">
                    Best current deal
                  </span>
                ) : (
                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-zinc-300">
                    Store price
                  </span>
                )}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    Historical low
                  </p>
                  <p className="mt-2 text-2xl font-bold text-pink-300">
                    {historicalLowLoading ? '...' : formatMoney(historicalLow)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {historicalLowLabel || 'Steam sales layer'}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    Metacritic
                  </p>
                  <p className="mt-2 text-2xl font-bold text-cyan-300">
                    {metacriticValue != null ? metacriticValue : 'N/A'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">Game metadata</p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    Active deals
                  </p>
                  <p className="mt-2 text-2xl font-bold text-emerald-300">
                    {canonicalStores.filter((store) => store.isDiscounted).length}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Discounted PC store offers
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

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  onClick={async () => {
                    if (!userId || !displayGame?.steamAppID) return

                    const dealID = `steam-${displayGame.steamAppID}`

                    const res = await fetch('/api/track', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId,
                        dealID,
                        gameID: '',
                        title: titleLabel,
                        thumb: displayGame.thumb,
                        salePrice: displayGame.salePrice,
                        normalPrice: displayGame.normalPrice,
                        storeID: '1',
                      }),
                    })

                    const data = await res.json()

                    if (data.action === 'added') setIsTracked(true)
                    if (data.action === 'removed') setIsTracked(false)
                  }}
                  disabled={authLoading || !displayGame?.steamAppID}
                  className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
                    isTracked
                      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border border-zinc-700 hover:bg-zinc-800'
                  } ${authLoading || !displayGame?.steamAppID ? 'opacity-60' : ''}`}
                >
                  {authLoading ? 'Loading…' : isTracked ? 'Tracked' : 'Track game'}
                </button>

                {heroStore?.url ? (
                  <a
                    href={heroStore.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-white px-5 py-3 text-center text-sm font-bold text-black transition hover:opacity-90"
                  >
                    {heroStore.isDiscounted
                      ? `Open ${getStoreName(heroStore.storeID)} deal — ${formatMoney(heroStore.salePrice)}`
                      : `Open ${getStoreName(heroStore.storeID)} — ${formatMoney(heroStore.salePrice)}`}
                  </a>
                ) : null}
              </div>

              {screenshots.length > 0 ? (
                <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {screenshots.map((shot, index) => (
                      <button
                        key={`${shot}-${index}`}
                        type="button"
                        onClick={() => setSelectedScreenshot(shot)}
                        className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition hover:opacity-90"
                      >
                        <img
                          src={shot}
                          alt={`${titleLabel} screenshot ${index + 1}`}
                          className="h-28 w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {rawgMeta?.clip ? (
                <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/50">
                  <video
                    src={rawgMeta.clip}
                    controls
                    playsInline
                    className="w-full"
                  />
                </div>
              ) : null}
            </div>
          </div>

          {rawgLoading ? (
            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 text-sm text-zinc-400">
              Loading game overview...
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

              <p className="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-300">
                {overview}
              </p>
            </div>
          ) : null}

          <section className="mt-10">
            <div className="mb-4">
              <h2 className="text-2xl font-bold">Available stores</h2>
              <p className="text-sm text-zinc-400">
                Canonical PC stores for this game.
              </p>
            </div>

            <div className="grid gap-3">
              {canonicalLoading && !canonicalGame ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                  Loading canonical PC stores...
                </div>
              ) : (
                canonicalStores.map((store) => (
                  <div
                    key={store.id}
                    className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                          {getStoreLogo(store.storeID) ? (
                            <img
                              src={getStoreLogo(store.storeID)!}
                              alt={getStoreName(store.storeID)}
                              className="h-4 w-4 object-contain"
                            />
                          ) : null}
                          <span>{getStoreName(store.storeID)}</span>
                        </span>

                        {store.isDiscounted ? (
                          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                            {Math.round(Number(store.savings || 0))}% off
                          </span>
                        ) : (
                          <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                            Available now
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-3xl font-bold text-emerald-400">
                        {formatMoney(store.salePrice)}
                      </p>

                      {store.isDiscounted ? (
                        <p className="text-sm text-zinc-400 line-through">
                          {formatMoney(store.normalPrice)}
                        </p>
                      ) : (
                        <p className="text-sm text-zinc-500">Regular store price</p>
                      )}
                    </div>

                                        {(() => {
                      const storeHref =
                        store.url ||
                        (store.source === 'deal' && store.dealID
                          ? `/api/redirect?dealID=${encodeURIComponent(
                              store.dealID
                            )}&title=${encodeURIComponent(
                              store.title || titleLabel
                            )}&salePrice=${encodeURIComponent(
                              store.salePrice || ''
                            )}&normalPrice=${encodeURIComponent(
                              store.normalPrice || ''
                            )}`
                          : '')

                      return storeHref ? (
                        <a
                          href={storeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium transition hover:bg-zinc-800"
                        >
                          {store.isDiscounted ? 'Open deal' : 'Open store'}
                        </a>
                      ) : null
                    })()}
                  </div>
                ))
              )}
            </div>
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