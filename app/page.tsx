'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getStoreLogo, getStoreName } from '@/lib/storeMap'
import { trackClick } from '@/lib/analytics'

type CatalogStats = {
  steamCatalogSize: number
  updatedAt: string | null
}

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
}

type SteamSpotlightItem = {
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

type TopRatedPcGame = {
  steamAppID: string
  title: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  platform: string
  url: string
  metacritic: number
  isFreeToPlay: boolean
}

function pushTrackMessage(
  setTrackMessage: React.Dispatch<React.SetStateAction<string>>,
  message: string
) {
  setTrackMessage(message)
  window.setTimeout(() => setTrackMessage(''), 2500)
}

function formatMoney(value?: string | number | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return ''
  }

  return amount.toFixed(2)
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

function buildGameHref(item: { slug?: string; title: string }) {
  const slug =
    String(item.slug || '').trim() ||
    item.title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')

  return `/pc/${encodeURIComponent(slug)}`
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {sublabel ? <p className="mt-1 text-xs text-zinc-500">{sublabel}</p> : null}
    </div>
  )
}

function HomeGameCard({
  item,
  userId,
  trackedIds,
  setTrackedIds,
  setTrackMessage,
  badge,
  metaLine,
}: {
  item: CatalogGame | SteamSpotlightItem | TopRatedPcGame
  userId: string | null
  trackedIds: string[]
  setTrackedIds: React.Dispatch<React.SetStateAction<string[]>>
  setTrackMessage: React.Dispatch<React.SetStateAction<string>>
  badge?: string
  metaLine?: string
}) {
  const salePrice = Number(item.salePrice || 0)
  const normalPrice = Number(item.normalPrice || 0)
  const safeSavings = getSafeDiscountPercent(
    item.salePrice,
    item.normalPrice,
    item.savings
  )
  const hasValidNormalPrice =
    !Number.isNaN(normalPrice) && normalPrice > 0 && normalPrice > salePrice

  const steamDealID = `steam-${item.steamAppID}`
  const isTracked = trackedIds.includes(steamDealID)
  const href = buildGameHref(item as { slug?: string; title: string })
  const isBrowseItem = 'hasActiveOffer' in item
  const isTopRatedItem = 'metacritic' in item

  const priceLabel = isBrowseItem
    ? item.isFreeToPlay
      ? 'Free'
      : item.hasActiveOffer && item.salePrice
      ? `$${item.salePrice}`
      : 'No cached price'
    : item.salePrice
    ? `$${item.salePrice}`
    : 'Steam entry'

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1">
      <Link href={href} className="block h-40 w-full bg-zinc-800">
        {item.thumb ? (
          <img
            src={item.thumb}
            alt={item.title}
            className="h-full w-full object-cover transition hover:opacity-90"
          />
        ) : null}
      </Link>

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={href}>
              <h3 className="line-clamp-2 text-base font-bold leading-5 transition hover:text-emerald-300">
                {item.title}
              </h3>
            </Link>
          </div>

          {badge ? (
            <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
              {badge}
            </span>
          ) : safeSavings > 0 ? (
            <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
              -{safeSavings}%
            </span>
          ) : isBrowseItem && item.isFreeToPlay ? (
            <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300">
              Free
            </span>
          ) : null}
        </div>

        <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              {isTopRatedItem
                ? 'Top rated Steam entry'
                : isBrowseItem
                ? 'Steam PC status'
                : 'Steam deal'}
            </p>

            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-300">
              {getStoreLogo(item.storeID) ? (
                <img
                  src={getStoreLogo(item.storeID)!}
                  alt={getStoreName(item.storeID)}
                  className="h-3.5 w-3.5 object-contain"
                />
              ) : null}
              <span>{getStoreName(item.storeID)}</span>
            </span>
          </div>

          <div className="mt-2 flex items-end justify-between gap-2">
            <span className="text-2xl font-bold text-emerald-400">
              {priceLabel}
            </span>

            {hasValidNormalPrice ? (
              <span className="text-sm text-zinc-400 line-through">
                ${formatMoney(item.normalPrice)}
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            {metaLine
              ? metaLine
              : isTopRatedItem
              ? `Metacritic: ${item.metacritic}`
              : isBrowseItem
              ? item.isFreeToPlay
                ? 'Included in the Steam PC catalog'
                : item.hasActiveOffer
                ? 'Current Steam offer cached locally'
                : 'Catalog entry without active sale'
              : 'Steam cached deal layer'}
          </p>
        </div>

        <div className="grid gap-2">
          <button
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
                    dealID: steamDealID,
                    gameID: '',
                    title: item.title,
                    thumb: item.thumb,
                    salePrice: item.salePrice,
                    normalPrice: item.normalPrice,
                    storeID: item.storeID || '1',
                  }),
                })

                const data = await res.json()

                                if (data.success && data.action === 'added') {
                  setTrackedIds((prev) =>
                    prev.includes(steamDealID) ? prev : [...prev, steamDealID]
                  )
                  trackClick({
                    dealID: steamDealID,
                    title: item.title,
                    salePrice: item.salePrice,
                    normalPrice: item.normalPrice,
                    clickType: 'track_add',
                  })
                  pushTrackMessage(setTrackMessage, `Tracked: ${item.title}`)
                  return
                }

                if (data.success && data.action === 'removed') {
                  setTrackedIds((prev) => prev.filter((id) => id !== steamDealID))
                  trackClick({
                    dealID: steamDealID,
                    title: item.title,
                    salePrice: item.salePrice,
                    normalPrice: item.normalPrice,
                    clickType: 'track_remove',
                  })
                  pushTrackMessage(setTrackMessage, `Removed: ${item.title}`)
                  return
                }

                pushTrackMessage(
                  setTrackMessage,
                  `Track error: ${data.error || 'Unknown error'}`
                )
              } catch {
                pushTrackMessage(setTrackMessage, 'Could not update tracked right now')
              }
            }}
            className={`rounded-xl px-4 py-2 text-center text-sm font-medium transition ${
              isTracked
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border border-zinc-700 hover:bg-zinc-800'
            }`}
          >
            {isTracked ? 'Tracked' : 'Track game'}
          </button>

                    <Link
            href={href}
            onClick={() =>
              trackClick({
                dealID: steamDealID,
                title: item.title,
                salePrice: item.salePrice,
                normalPrice: item.normalPrice,
                clickType: 'card_click_home',
              })
            }
            className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
          >
            Open game page
          </Link>

                    {'url' in item && item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                trackClick({
                  dealID: steamDealID,
                  title: item.title,
                  salePrice: item.salePrice,
                  normalPrice: item.normalPrice,
                  clickType: 'open_deal_home',
                })
              }
              className="rounded-xl border border-zinc-700 px-4 py-2 text-center text-sm font-medium transition hover:bg-zinc-800"
            >
              Open Steam
            </a>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function HomeSection({
  title,
  subtitle,
  href,
  hrefLabel,
  children,
}: {
  title: string
  subtitle: string
  href: string
  hrefLabel: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-12">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-sm text-zinc-400">{subtitle}</p>
        </div>

        <Link
          href={href}
          className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
        >
          {hrefLabel}
        </Link>
      </div>

      {children}
    </section>
  )
}

export default function Home() {
  const [catalogStats, setCatalogStats] = useState<CatalogStats>({
    steamCatalogSize: 0,
    updatedAt: null,
  })

  const [browseGames, setBrowseGames] = useState<CatalogGame[]>([])
  const [steamSpotlight, setSteamSpotlight] = useState<SteamSpotlightItem[]>([])
  const [topRatedGames, setTopRatedGames] = useState<TopRatedPcGame[]>([])

  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [trackMessage, setTrackMessage] = useState('')
  const [trackedIds, setTrackedIds] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  const [searchResults, setSearchResults] = useState<CatalogGame[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchPerformed, setSearchPerformed] = useState(false)

  const [suggestions, setSuggestions] = useState<CatalogGame[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestionBoxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadHome = async () => {
      try {
        setLoading(true)

        const [catalogStatsRes, browseRes, steamRes, topRatedRes] = await Promise.all([
          fetch('/api/catalog-stats'),
          fetch('/api/pc-browse?limit=48'),
          fetch('/api/steam-spotlight?limit=8'),
          fetch('/api/pc-top-rated?limit=8'),
        ])

        const catalogStatsData = await catalogStatsRes.json()
        const browseData = await browseRes.json()
        const steamData = await steamRes.json()
        const topRatedData = await topRatedRes.json()

        if (!cancelled) {
          setCatalogStats({
            steamCatalogSize: Number(catalogStatsData?.steamCatalogSize || 0),
            updatedAt: catalogStatsData?.updatedAt || null,
          })
          setBrowseGames(Array.isArray(browseData) ? browseData : [])
          setSteamSpotlight(Array.isArray(steamData) ? steamData : [])
          setTopRatedGames(Array.isArray(topRatedData) ? topRatedData : [])
        }

        const {
          data: { session },
        } = await supabase.auth.getSession()

        const currentUserId = session?.user?.id ?? null

        if (!cancelled) {
          setUserId(currentUserId)
        }

        if (currentUserId) {
          const { data } = await supabase
            .from('tracked_games')
            .select('deal_id')
            .eq('user_id', currentUserId)

          if (!cancelled) {
            setTrackedIds(Array.isArray(data) ? data.map((row) => row.deal_id) : [])
          }
        } else if (!cancelled) {
          setTrackedIds([])
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setBrowseGames([])
          setSteamSpotlight([])
          setTopRatedGames([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadHome()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const q = search.trim()

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
  }, [search])

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
    const q = search.trim()

    if (q.length < 2) {
      setSearchResults([])
      setSearchPerformed(false)
      return
    }

    setSearchLoading(true)
    setSearchPerformed(true)
    setShowSuggestions(false)

    try {
      const res = await fetch(`/api/catalog-search?title=${encodeURIComponent(q)}`)
      const data = await res.json()
      setSearchResults(Array.isArray(data) ? data.slice(0, 8) : [])
    } catch (error) {
      console.error(error)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const newestCatalogGames = useMemo(() => {
    return [...browseGames]
      .sort((a, b) => Number(b.steamAppID || 0) - Number(a.steamAppID || 0))
      .slice(0, 4)
  }, [browseGames])

  const bestDiscounts = useMemo(() => {
    return [...browseGames]
      .sort(
        (a, b) =>
          getSafeDiscountPercent(b.salePrice, b.normalPrice, b.savings) -
          getSafeDiscountPercent(a.salePrice, a.normalPrice, a.savings)
      )
      .slice(0, 4)
  }, [browseGames])

  const freeToPlayGames = useMemo(() => {
    return browseGames.filter((item) => item.isFreeToPlay).slice(0, 4)
  }, [browseGames])

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="mb-8 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-xl">
            <div className="border-b border-zinc-800 p-5">
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
              <div className="mt-3 h-8 w-72 animate-pulse rounded bg-zinc-800" />
              <div className="mt-3 h-4 w-96 animate-pulse rounded bg-zinc-800" />
            </div>

            <div className="grid gap-3 p-5 md:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3"
                >
                  <div className="h-4 w-28 animate-pulse rounded bg-zinc-800" />
                  <div className="mt-3 h-6 w-20 animate-pulse rounded bg-zinc-800" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-xl">
          <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-800 p-5">
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
              LoboDeals
            </p>
            <h1 className="mt-1 text-3xl font-bold">
              Steam PC catalog and deals, in one place
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Browse the local Steam-first PC layer, search canonical game pages,
              find free-to-play titles, and jump into Steam deals without splitting
              the product into competing routes.
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              {catalogStats.steamCatalogSize > 0
                ? `${catalogStats.steamCatalogSize} Steam PC entries currently visible in the local layer`
                : 'Building catalog size signal'}
            </p>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-3">
            <MetricCard
              label="Steam catalog size"
              value={String(catalogStats.steamCatalogSize || 0)}
              sublabel="Count pulled from pc_games"
            />
            <MetricCard
              label="PC experience"
              value="Steam-only"
              sublabel="One canonical route per PC game"
            />
            <MetricCard
              label="Catalog behavior"
              value="Games first"
              sublabel="Deals, non-deals and free-to-play all count"
            />
          </div>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/pc"
            className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold text-black transition hover:opacity-90"
          >
            Browse PC
          </Link>

          <Link
            href="/catalog"
            className="rounded-2xl border border-zinc-700 px-4 py-3 text-center text-sm font-medium transition hover:bg-zinc-800"
          >
            Search catalog
          </Link>

          <Link
            href="/pc?sort=steam-spotlight"
            className="rounded-2xl border border-zinc-700 px-4 py-3 text-center text-sm font-medium transition hover:bg-zinc-800"
          >
            Steam deals
          </Link>

          <Link
            href="/pc?sort=top-rated"
            className="rounded-2xl border border-zinc-700 px-4 py-3 text-center text-sm font-medium transition hover:bg-zinc-800"
          >
            Top rated
          </Link>
        </section>

        <section className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
          <div className="relative" ref={suggestionBoxRef}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder="Search Steam PC games..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setShowSuggestions(true)
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch()
                }}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
              />
              <button
                onClick={runSearch}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
              >
                Search
              </button>
            </div>

            {showSuggestions && search.trim().length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                {search.trim().length < 2 ? (
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

                    return (
                      <Link
                        key={item.id}
                        href={href}
                        onClick={() => {
                          setSearch(item.title || '')
                          setShowSuggestions(false)
                        }}
                        className="flex items-center gap-3 border-t border-zinc-800 px-4 py-3 transition first:border-t-0 hover:bg-zinc-900"
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

                        <div className="min-w-0">
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

          {searchLoading ? (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
              Searching Steam PC catalog...
            </div>
          ) : searchPerformed ? (
            searchResults.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {searchResults.map((game) => (
                  <HomeGameCard
                    key={game.id}
                    item={game}
                    userId={userId}
                    trackedIds={trackedIds}
                    setTrackedIds={setTrackedIds}
                    setTrackMessage={setTrackMessage}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                No Steam PC games found for that search.
              </div>
            )
          ) : null}
        </section>

        {trackMessage ? (
          <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300 shadow-lg shadow-emerald-500/5">
            {trackMessage}
          </div>
        ) : null}

        <HomeSection
          title="Newest in the local PC layer"
          subtitle="Recent Steam app entries visible from the new 2.5 catalog backbone."
          href="/pc?sort=latest"
          hrefLabel="View latest"
        >
          {newestCatalogGames.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
              No recent PC entries available right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {newestCatalogGames.map((item) => (
                <HomeGameCard
                  key={item.id}
                  item={item}
                  userId={userId}
                  trackedIds={trackedIds}
                  setTrackedIds={setTrackedIds}
                  setTrackMessage={setTrackMessage}
                />
              ))}
            </div>
          )}
        </HomeSection>

        <HomeSection
          title="Top rated"
          subtitle="Games surfaced from the local PC layer with cached rating context."
          href="/pc?sort=top-rated"
          hrefLabel="View top rated"
        >
          {topRatedGames.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
              Top rated coverage is still building from local cached metadata.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {topRatedGames.slice(0, 4).map((item) => (
                <HomeGameCard
                  key={item.steamAppID}
                  item={item}
                  userId={userId}
                  trackedIds={trackedIds}
                  setTrackedIds={setTrackedIds}
                  setTrackMessage={setTrackMessage}
                  badge={
                    typeof item.metacritic === 'number'
                      ? `MC ${item.metacritic}`
                      : undefined
                  }
                  metaLine={
                    typeof item.metacritic === 'number'
                      ? `Metacritic: ${item.metacritic}`
                      : 'Top rated local candidate'
                  }
                />
              ))}
            </div>
          )}
        </HomeSection>

        <HomeSection
          title="Biggest discounts"
          subtitle="Discount-led picks from the local Steam PC layer."
          href="/pc?sort=biggest-discount"
          hrefLabel="View biggest discounts"
        >
          {bestDiscounts.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
              No discounted PC entries available right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {bestDiscounts.map((item) => (
                <HomeGameCard
                  key={item.id}
                  item={item}
                  userId={userId}
                  trackedIds={trackedIds}
                  setTrackedIds={setTrackedIds}
                  setTrackMessage={setTrackMessage}
                />
              ))}
            </div>
          )}
        </HomeSection>

        <HomeSection
          title="Free to play"
          subtitle="Steam PC entries that already belong to the catalog even without a paid offer."
          href="/catalog"
          hrefLabel="Search catalog"
        >
          {freeToPlayGames.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
              No free-to-play entries visible in the current local sample.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {freeToPlayGames.map((item) => (
                <HomeGameCard
                  key={item.id}
                  item={item}
                  userId={userId}
                  trackedIds={trackedIds}
                  setTrackedIds={setTrackedIds}
                  setTrackMessage={setTrackMessage}
                  badge="Free"
                  metaLine="Included in the Steam PC catalog"
                />
              ))}
            </div>
          )}
        </HomeSection>

        <HomeSection
          title="Steam deals"
          subtitle="Temporary curated Steam deals module while the broader 2.5 cleanup continues."
          href="/pc?sort=steam-spotlight"
          hrefLabel="View Steam deals"
        >
          {steamSpotlight.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
              No cached Steam spotlight deals available right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {steamSpotlight.slice(0, 4).map((item) => (
                <HomeGameCard
                  key={item.steamAppID}
                  item={item}
                  userId={userId}
                  trackedIds={trackedIds}
                  setTrackedIds={setTrackedIds}
                  setTrackMessage={setTrackMessage}
                />
              ))}
            </div>
          )}
        </HomeSection>
      </section>
    </main>
  )
}