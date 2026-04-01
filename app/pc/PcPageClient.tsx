'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import RegionNotice from '@/app/components/RegionNotice'
import { getStoreLogo, getStoreName } from '@/lib/storeMap'
import { supabase } from '@/lib/supabaseClient'
import { trackClick } from '@/lib/analytics'

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

type PcBrowseItem = {
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

type PcBrowsePageResponse = {
  items: PcBrowseItem[]
  totalItems: number | null
  totalPages: number | null
  page: number
  pageSize: number
  hasNextPage: boolean
  mode?: 'cache' | 'error'
  source?: string
}

type DealsStats = {
  dealsIndexed: number
  steamIndexed: number
  steamSpotlightIndexed: number
  dealsUpdatedAt: string | null
  steamUpdatedAt: string | null
  steamSpotlightUpdatedAt: string | null
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

type UnifiedCardItem = SteamSpotlightItem | PcBrowseItem | TopRatedPcGame

const PAGE_SIZE = 36
const TOP_RATED_MIN_RESULTS = 1

const STORE_FILTERS = [
  { value: 'all', label: 'All stores' },
  { value: '1', label: 'Steam' },
]

const PRICE_FILTERS = [
  { value: 'all', label: 'Any price' },
  { value: 'under-5', label: 'Under $5' },
  { value: 'under-10', label: 'Under $10' },
  { value: 'over-80', label: '80%+ off' },
]

function normalizeSteamTitle(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™©]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[:\-–—_/.,+!?'""]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSafeDiscountPercent(
  salePrice?: string | number,
  normalPrice?: string | number,
  savings?: string | number
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

function buildSteamCanonicalHref(item: { title: string; slug?: string }) {
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {sublabel ? <p className="mt-1 text-xs text-zinc-500">{sublabel}</p> : null}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
        active
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  )
}

function SteamCard({
  item,
  userId,
  trackedIds,
  setTrackedIds,
  setTrackMessage,
}: {
  item: UnifiedCardItem
  userId: string | null
  trackedIds: string[]
  setTrackedIds: React.Dispatch<React.SetStateAction<string[]>>
  setTrackMessage: React.Dispatch<React.SetStateAction<string>>
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
  const isTracked = Array.isArray(trackedIds) && trackedIds.includes(steamDealID)
  const canonicalHref = buildSteamCanonicalHref(item)

  const isBrowseItem = 'hasActiveOffer' in item
  const isTopRatedItem = 'metacritic' in item

  const statusLabel = isBrowseItem
    ? item.isFreeToPlay
      ? 'Free to play'
      : item.hasActiveOffer && item.salePrice
      ? `$${item.salePrice}`
      : 'No current Steam price cached'
    : item.salePrice
    ? `$${item.salePrice}`
    : 'Steam entry'

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1">
      <Link href={canonicalHref}>
        <img
          src={item.thumb}
          alt={item.title}
          className="h-44 w-full object-cover transition hover:opacity-90"
        />
      </Link>

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={canonicalHref}>
              <h3 className="line-clamp-2 text-base font-bold leading-5 transition hover:text-emerald-300">
                {item.title}
              </h3>
            </Link>
          </div>

          {safeSavings > 0 ? (
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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

          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <span className="text-2xl font-bold text-emerald-400">
              {statusLabel}
            </span>

            {hasValidNormalPrice ? (
              <span className="text-sm text-zinc-400 line-through">
                ${item.normalPrice}
              </span>
            ) : null}
          </div>

          {isTopRatedItem ? (
            <p className="mt-2 text-xs text-zinc-500">
              Metacritic: {item.metacritic}
            </p>
          ) : isBrowseItem ? (
            <p className="mt-2 text-xs text-zinc-500">
              {item.isFreeToPlay
                ? 'Included in the Steam PC catalog'
                : item.hasActiveOffer
                ? item.normalPrice &&
                  Number(item.normalPrice) > Number(item.salePrice || 0)
                  ? `Regular price: $${item.normalPrice}`
                  : 'Current Steam offer cached locally'
                : item.isCatalogReady
                ? 'Catalog entry without active sale'
                : 'Base catalog entry imported from Steam'}
            </p>
          ) : null}
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
                  pushTrackMessage(setTrackMessage, `Added to tracked: ${item.title}`)
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
                  pushTrackMessage(
                    setTrackMessage,
                    `Removed from tracked: ${item.title}`
                  )
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
            href={canonicalHref}
            onClick={() =>
              trackClick({
                dealID: steamDealID,
                title: item.title,
                salePrice: item.salePrice,
                normalPrice: item.normalPrice,
                clickType: 'card_click_pc',
              })
            }
            className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
          >
            Open game page
          </Link>
        </div>
      </div>
    </article>
  )
}

export default function PcPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentPage = Math.max(1, Number(searchParams.get('page') || '1'))
  const query = searchParams.get('q') || ''
  const requestedSort = searchParams.get('sort') || 'all'
  const storeFilter = searchParams.get('store') || 'all'
  const priceFilter = searchParams.get('price') || 'all'

  const [browseGames, setBrowseGames] = useState<PcBrowseItem[]>([])
  const [browseTotalItems, setBrowseTotalItems] = useState(0)
  const [browseTotalPages, setBrowseTotalPages] = useState(1)
  const [steamDeals, setSteamDeals] = useState<SteamSpotlightItem[]>([])
  const [topRatedGames, setTopRatedGames] = useState<TopRatedPcGame[]>([])
  const [dealsStats, setDealsStats] = useState<DealsStats>({
    dealsIndexed: 0,
    steamIndexed: 0,
    steamSpotlightIndexed: 0,
    dealsUpdatedAt: null,
    steamUpdatedAt: null,
    steamSpotlightUpdatedAt: null,
  })

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [trackedIds, setTrackedIds] = useState<string[]>([])
  const [trackMessage, setTrackMessage] = useState('')

  const topRatedReady = topRatedGames.length >= TOP_RATED_MIN_RESULTS
const sort = requestedSort

  const SORT_FILTERS = [
    { value: 'all', label: 'Featured' },
    { value: 'best', label: 'Best Deals' },
    { value: 'top-rated', label: 'Top Rated' },
    { value: 'biggest-discount', label: 'Biggest Discounts' },
    { value: 'latest', label: 'Latest' },
    { value: 'steam-spotlight', label: 'Steam Deals' },
  ]

  const buildUrl = (page: number, updates?: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())

    params.set('page', String(page))

    Object.entries(updates || {}).forEach(([key, value]) => {
      if (!value || value === 'all') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })

    const queryString = params.toString()
    return `/pc${queryString ? `?${queryString}` : ''}`
  }

  const applyStore = (value: string) => {
    router.push(buildUrl(1, { store: value }))
  }

  const applyPrice = (value: string) => {
    router.push(buildUrl(1, { price: value }))
  }

  const applySort = (value: string) => {
    router.push(buildUrl(1, { sort: value }))
  }

  const resetFilters = () => {
    router.push('/pc?page=1&sort=all')
  }

  useEffect(() => {
    let cancelled = false

    const loadUserState = async () => {
      try {
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
      }
    }

    loadUserState()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadView = async () => {
      try {
        setLoading(true)

        if (sort === 'steam-spotlight') {
  const steamRes = await fetch('/api/steam-spotlight')
  const steamData = await steamRes.json()

  if (!cancelled) {
    setSteamDeals(Array.isArray(steamData) ? steamData : [])
    setTopRatedGames([])
    setBrowseGames([])
    setBrowseTotalItems(0)
    setBrowseTotalPages(1)
    setDealsStats({
      dealsIndexed: 0,
      steamIndexed: 0,
      steamSpotlightIndexed: 0,
      dealsUpdatedAt: null,
      steamUpdatedAt: null,
      steamSpotlightUpdatedAt: null,
    })
  }

  fetch('/api/deals-stats')
    .then((res) => res.json())
    .then((statsData) => {
      if (!cancelled) {
        setDealsStats({
          dealsIndexed: Number(statsData?.dealsIndexed || 0),
          steamIndexed: Number(statsData?.steamIndexed || 0),
          steamSpotlightIndexed: Number(statsData?.steamSpotlightIndexed || 0),
          dealsUpdatedAt: statsData?.dealsUpdatedAt || null,
          steamUpdatedAt: statsData?.steamUpdatedAt || null,
          steamSpotlightUpdatedAt: statsData?.steamSpotlightUpdatedAt || null,
        })
      }
    })
    .catch((error) => {
      console.error(error)
    })

  return
}

        if (sort === 'top-rated') {
          const topRatedRes = await fetch('/api/pc-top-rated?limit=36')
          const topRatedData = await topRatedRes.json()

          if (!cancelled) {
            setTopRatedGames(Array.isArray(topRatedData) ? topRatedData : [])
            setSteamDeals([])
            setDealsStats({
              dealsIndexed: 0,
              steamIndexed: 0,
              steamSpotlightIndexed: 0,
              dealsUpdatedAt: null,
              steamUpdatedAt: null,
              steamSpotlightUpdatedAt: null,
            })
          }

          return
        }

        const params = new URLSearchParams()
        params.set('page', String(currentPage))
        params.set('pageSize', String(PAGE_SIZE))

        if (query.trim()) params.set('q', query.trim())
        if (sort !== 'all') params.set('sort', sort)
        if (storeFilter !== 'all') params.set('store', storeFilter)
        if (priceFilter !== 'all') params.set('price', priceFilter)

        const browseRes = await fetch(`/api/pc-browse-page?${params.toString()}`)
        const browseData: PcBrowsePageResponse = await browseRes.json()

        if (!cancelled) {
          setBrowseGames(Array.isArray(browseData?.items) ? browseData.items : [])
          setBrowseTotalItems(Number(browseData?.totalItems || 0))
          setBrowseTotalPages(Math.max(1, Number(browseData?.totalPages || 1)))
          setSteamDeals([])
          setTopRatedGames([])
          setDealsStats({
            dealsIndexed: 0,
            steamIndexed: 0,
            steamSpotlightIndexed: 0,
            dealsUpdatedAt: null,
            steamUpdatedAt: null,
            steamSpotlightUpdatedAt: null,
          })
        }
      } catch (error) {
        console.error(error)

        if (!cancelled) {
          setBrowseGames([])
          setBrowseTotalItems(0)
          setBrowseTotalPages(1)
          setSteamDeals([])
          setTopRatedGames([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadView()

    return () => {
      cancelled = true
    }
  }, [currentPage, query, sort, storeFilter, priceFilter])

  const filteredDeals = useMemo(() => {
    const normalizedQuery = normalizeSteamTitle(query)

    const allBrowseGames = browseGames.filter((item) => {
      if (storeFilter !== 'all' && item.storeID !== storeFilter) return false

      const salePrice = Number(item.salePrice || 0)
      const savings = getSafeDiscountPercent(
        item.salePrice,
        item.normalPrice,
        item.savings
      )

      if (priceFilter === 'under-5' && !(salePrice > 0 && salePrice < 5)) return false
      if (priceFilter === 'under-10' && !(salePrice > 0 && salePrice < 10)) return false
      if (priceFilter === 'over-80' && savings < 80) return false

      if (normalizedQuery) {
        return normalizeSteamTitle(item.title).includes(normalizedQuery)
      }

      return true
    })

    const allSteamDeals = steamDeals.filter((item) => {
      if (storeFilter !== 'all' && item.storeID !== storeFilter) return false

      const salePrice = Number(item.salePrice || 0)
      const savings = getSafeDiscountPercent(
        item.salePrice,
        item.normalPrice,
        item.savings
      )

      if (priceFilter === 'under-5' && !(salePrice > 0 && salePrice < 5)) return false
      if (priceFilter === 'under-10' && !(salePrice > 0 && salePrice < 10)) return false
      if (priceFilter === 'over-80' && savings < 80) return false

      if (normalizedQuery) {
        return normalizeSteamTitle(item.title).includes(normalizedQuery)
      }

      return true
    })

    if (sort === 'steam-spotlight') {
      return {
        mode: 'steam' as const,
        items: [...allSteamDeals].sort(
          (a, b) =>
            getSafeDiscountPercent(b.salePrice, b.normalPrice, b.savings) -
            getSafeDiscountPercent(a.salePrice, a.normalPrice, a.savings)
        ),
      }
    }

    if (sort === 'top-rated' && topRatedReady) {
      const topRatedItems = topRatedGames.filter((item) => {
        if (storeFilter !== 'all' && item.storeID !== storeFilter) return false

        const salePrice = Number(item.salePrice || 0)
        const savings = getSafeDiscountPercent(
          item.salePrice,
          item.normalPrice,
          item.savings
        )

        if (priceFilter === 'under-5' && !(salePrice > 0 && salePrice < 5)) return false
        if (priceFilter === 'under-10' && !(salePrice > 0 && salePrice < 10)) return false
        if (priceFilter === 'over-80' && savings < 80) return false

        if (normalizedQuery) {
          return normalizeSteamTitle(item.title).includes(normalizedQuery)
        }

        return true
      })

      return {
        mode: 'top-rated' as const,
        items: [...topRatedItems].sort((a, b) => {
          if (b.metacritic !== a.metacritic) {
            return b.metacritic - a.metacritic
          }

          const savingsA = getSafeDiscountPercent(a.salePrice, a.normalPrice, a.savings)
          const savingsB = getSafeDiscountPercent(b.salePrice, b.normalPrice, b.savings)

          if (savingsB !== savingsA) {
            return savingsB - savingsA
          }

          return Number(b.normalPrice || 0) - Number(a.normalPrice || 0)
        }),
      }
    }

    return {
      mode: 'browse' as const,
      items: allBrowseGames,
    }
  }, [
    browseGames,
    steamDeals,
    topRatedGames,
    query,
    sort,
    storeFilter,
    priceFilter,
    topRatedReady,
  ])

  const isServerBrowseMode =
    filteredDeals.mode === 'browse' &&
    sort !== 'steam-spotlight' &&
    sort !== 'top-rated'

  const totalItems = isServerBrowseMode
    ? browseTotalItems
    : filteredDeals.items.length

  const totalPages = isServerBrowseMode
    ? Math.max(1, browseTotalPages)
    : Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  const safePage = Math.min(currentPage, totalPages)

  const paginatedItems: UnifiedCardItem[] = isServerBrowseMode
    ? filteredDeals.items
    : filteredDeals.items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const activeFilterLabels = [
    query.trim() ? `Search: "${query.trim()}"` : null,
    storeFilter !== 'all' ? `Store: ${getStoreName(storeFilter)}` : null,
    priceFilter === 'under-5'
      ? 'Price: Under $5'
      : priceFilter === 'under-10'
      ? 'Price: Under $10'
      : priceFilter === 'over-80'
      ? 'Price: 80%+ off'
      : null,
    sort === 'best'
      ? 'Sort: Best Deals'
      : sort === 'top-rated'
      ? 'Sort: Top Rated'
      : sort === 'biggest-discount'
      ? 'Sort: Biggest Discounts'
      : sort === 'latest'
      ? 'Sort: Latest'
      : sort === 'steam-spotlight'
      ? 'Sort: Steam Deals'
      : null,
  ].filter(Boolean) as string[]

  const hasActiveFilters =
    !!query.trim() ||
    storeFilter !== 'all' ||
    priceFilter !== 'all' ||
    sort !== 'all'

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Platform
          </p>
          <h1 className="mt-1 text-3xl font-bold">PC Games</h1>
          <p className="mt-2 max-w-3xl text-zinc-400">
            Browse the Steam-only PC layer from local data, prioritizing base games
            in the main browsing experience while keeping one canonical game page per
            title.
          </p>
        </header>

        <div className="mb-6">
          <RegionNotice />
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Steam catalog ready"
            value={browseTotalItems || browseGames.length}
            sublabel="Public-ready games available in the main PC browse layer"
          />
          <MetricCard
            label="Results in this view"
            value={totalItems}
            sublabel={
              sort === 'steam-spotlight'
                ? 'Steam Deals mode'
                : sort === 'top-rated'
                ? 'Top Rated mode'
                : sort === 'best'
                ? 'Best Deals mode'
                : 'PC browsing mode'
            }
          />
          <MetricCard
            label="Pages available"
            value={totalPages}
            sublabel="Based on current filter set"
          />
          <MetricCard
            label="Canonical route"
            value="One page"
            sublabel="Every PC game converges to /pc/[slug]"
          />
        </div>

        <div className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              Explore PC
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Main PC browsing now prioritizes base games from the local 2.5 layer.
              DLCs can still remain searchable from the catalog when looked up
              manually.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-[2fr_1fr_1fr]">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-500">
                Search
              </label>
              <input
                value={query}
                onChange={(e) => router.push(buildUrl(1, { q: e.target.value }))}
                placeholder="Search PC games"
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none transition focus:border-emerald-500/40"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-500">
                Stores
              </label>
              <div className="flex flex-wrap gap-2">
                {STORE_FILTERS.map((store) => (
                  <FilterChip
                    key={store.value}
                    label={store.label}
                    active={storeFilter === store.value}
                    onClick={() => applyStore(store.value)}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-500">
                Price
              </label>
              <div className="flex flex-wrap gap-2">
                {PRICE_FILTERS.map((price) => (
                  <FilterChip
                    key={price.value}
                    label={price.label}
                    active={priceFilter === price.value}
                    onClick={() => applyPrice(price.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-500">
              Sort
            </label>
            <div className="flex flex-wrap gap-2">
              {SORT_FILTERS.map((item) => (
                <FilterChip
                  key={item.value}
                  label={item.label}
                  active={sort === item.value}
                  onClick={() => applySort(item.value)}
                />
              ))}
            </div>
          </div>

          {sort === 'top-rated' && loading ? (
  <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
    Loading top rated results...
  </div>
) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Best Deals
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                Discount + attractive final price + active offer weighting.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Biggest Discounts
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                Pure discount-first ordering.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Latest
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                Ordered by latest Steam app IDs in the local layer.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Steam Deals
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                Legacy cached deal feed, filtered to only locally resolvable games.
              </p>
            </div>
          </div>
        </div>

        {hasActiveFilters ? (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            {activeFilterLabels.map((label) => (
              <span
                key={label}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300"
              >
                {label}
              </span>
            ))}

            <button
              onClick={resetFilters}
              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/15"
            >
              Reset all
            </button>
          </div>
        ) : null}

        {trackMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            {trackMessage}
          </div>
        ) : null}

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-400">
            Page {safePage} of {totalPages} · {totalItems}{' '}
            {sort === 'steam-spotlight'
              ? 'locally resolvable Steam deals in this view'
              : sort === 'top-rated'
              ? 'top rated PC entries in this view'
              : sort === 'best'
              ? 'best-value PC entries in this view'
              : sort === 'biggest-discount'
              ? 'discount-first PC entries in this view'
              : 'PC results in this view'}
            {storeFilter !== 'all' ? ` · ${getStoreName(storeFilter)}` : ''}
            {sort === 'steam-spotlight' && dealsStats.steamIndexed > 0
              ? ` · ${dealsStats.steamIndexed} cached raw Steam deals before local filtering`
              : ''}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(buildUrl(Math.max(1, safePage - 1)))}
              disabled={safePage <= 1}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <button
              onClick={() => router.push(buildUrl(Math.min(totalPages, safePage + 1)))}
              disabled={safePage >= totalPages}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center text-zinc-400">
            Loading the Steam-only PC layer...
          </div>
        ) : paginatedItems.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="text-xl font-bold text-white">
                {sort === 'steam-spotlight'
                  ? 'No Steam deals match this view'
                  : sort === 'top-rated'
                  ? 'No top rated PC entries match this view'
                  : 'No PC results match this view'}
              </h2>

              <p className="mt-3 text-sm text-zinc-400">
                {hasActiveFilters
                  ? 'Your current search and filter combination did not return visible results.'
                  : 'There are no visible Steam PC entries in this section right now.'}
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  onClick={resetFilters}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                >
                  Reset filters
                </button>

                {sort !== 'steam-spotlight' ? (
                  <Link
                    href={buildUrl(1, { sort: 'steam-spotlight' })}
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
                  >
                    Open Steam Deals
                  </Link>
                ) : (
                  <Link
                    href={buildUrl(1, { sort: 'all' })}
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
                  >
                    Back to PC browsing
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {paginatedItems.map((item: UnifiedCardItem) => (
              <SteamCard
                key={`${item.steamAppID}-${item.title}`}
                item={item}
                userId={userId}
                trackedIds={trackedIds}
                setTrackedIds={setTrackedIds}
                setTrackMessage={setTrackMessage}
              />
            ))}
          </div>
        )}

        {paginatedItems.length > 0 ? (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => router.push(buildUrl(Math.max(1, safePage - 1)))}
              disabled={safePage <= 1}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <button
              onClick={() => router.push(buildUrl(Math.min(totalPages, safePage + 1)))}
              disabled={safePage >= totalPages}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}