'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import RegionNotice from '@/app/components/RegionNotice'
import { getStoreLogo, getStoreName, isAllowedStore } from '@/lib/storeMap'
import { supabase } from '@/lib/supabaseClient'


type Deal = {
  dealID: string
  gameID?: string
  title: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  dealRating?: string
  metacriticScore?: string
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

type DealsStats = {
  dealsIndexed: number
  steamIndexed: number
  steamSpotlightIndexed: number
  dealsUpdatedAt: string | null
  steamUpdatedAt: string | null
  steamSpotlightUpdatedAt: string | null
}

const PAGE_SIZE = 36

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

const SORT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'best', label: 'Best Deals' },
  { value: 'top-rated', label: 'Top Rated' },
  { value: 'biggest-discount', label: 'Biggest Discounts' },
  { value: 'latest', label: 'Latest' },
  { value: 'steam-spotlight', label: 'Steam Deals' },
]

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function buildSteamCanonicalHref(item: SteamSpotlightItem) {
  const slug = slugify(item.title)
  return `/pc/${encodeURIComponent(slug)}`
}

function buildDealCanonicalHref(deal: Deal) {
  const slug = slugify(deal.title)
  return `/pc/${encodeURIComponent(slug)}`
}

function normalizeSteamTitle(value: string) {
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
  salePrice?: string | number,
  normalPrice?: string | number,
  savings?: string | number
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

const EDITION_NOISE_REGEX =
  /\b(game of the year|goty|digital deluxe|deluxe edition|deluxe|ultimate edition|ultimate|complete edition|complete|gold edition|gold|definitive edition|definitive|remastered|director'?s cut|bundle)\b/g

function makeCanonicalTitleKey(value: string) {
  return normalizeSteamTitle(value)
    .replace(EDITION_NOISE_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeTopRatedItems<
  T extends {
    title: string
    metacritic: number
    savings: number
    normalPrice: number
  }
>(items: T[]) {
  const map = new Map<string, T>()

  for (const item of items) {
    const key = makeCanonicalTitleKey(item.title)
    const current = map.get(key)

    if (!current) {
      map.set(key, item)
      continue
    }

    if (item.metacritic > current.metacritic) {
      map.set(key, item)
      continue
    }

    if (
      item.metacritic === current.metacritic &&
      item.savings > current.savings
    ) {
      map.set(key, item)
      continue
    }

    if (
      item.metacritic === current.metacritic &&
      item.savings === current.savings &&
      item.normalPrice > current.normalPrice
    ) {
      map.set(key, item)
    }
  }

  return Array.from(map.values())
}

function dedupeMixedBrowseItems<
  T extends {
    type: 'steam' | 'deal'
    title: string
    metacritic: number
    savings: number
    normalPrice: number
  }
>(items: T[]) {
  const map = new Map<string, T>()

  for (const item of items) {
    const key = makeCanonicalTitleKey(item.title)
    const current = map.get(key)

    if (!current) {
      map.set(key, item)
      continue
    }

    if (item.type === 'steam' && current.type !== 'steam') {
      map.set(key, item)
      continue
    }

    if (item.type !== 'steam' && current.type === 'steam') {
      continue
    }

    if (item.metacritic > current.metacritic) {
      map.set(key, item)
      continue
    }

    if (item.metacritic === current.metacritic && item.savings > current.savings) {
      map.set(key, item)
      continue
    }

    if (
      item.metacritic === current.metacritic &&
      item.savings === current.savings &&
      item.normalPrice > current.normalPrice
    ) {
      map.set(key, item)
    }
  }

  return Array.from(map.values())
}


function pushTrackMessage(
  setTrackMessage: React.Dispatch<React.SetStateAction<string>>,
  message: string
) {
  setTrackMessage(message)
  window.setTimeout(() => setTrackMessage(''), 2500)
}

function MetricCard({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
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
  item: SteamSpotlightItem
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

          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
                        -{safeSavings}%
          </span>
        </div>

        <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Steam deal
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
              ${item.salePrice}
            </span>

            {hasValidNormalPrice ? (
              <span className="text-sm text-zinc-400 line-through">
                ${item.normalPrice}
              </span>
            ) : null}
          </div>
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
                  pushTrackMessage(setTrackMessage, `Added to tracked: ${item.title}`)
                  return
                }

                if (data.success && data.action === 'removed') {
                  setTrackedIds((prev) => prev.filter((id) => id !== steamDealID))
                  pushTrackMessage(setTrackMessage, `Removed from tracked: ${item.title}`)
                  return
                }

                pushTrackMessage(setTrackMessage, `Track error: ${data.error || 'Unknown error'}`)
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
            className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
          >
            Open game page
          </Link>
        </div>
      </div>
    </article>
  )
}

function DealCard({
  deal,
}: {
  deal: Deal
}) {
  const canonicalHref = buildDealCanonicalHref(deal)
  const salePrice = Number(deal.salePrice || 0)
  const normalPrice = Number(deal.normalPrice || 0)
  const hasValidNormalPrice =
    !Number.isNaN(normalPrice) && normalPrice > 0 && normalPrice > salePrice

  return (
    <article className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1">
      <Link href={canonicalHref}>
        <img
          src={deal.thumb}
          alt={deal.title}
          className="h-44 w-full object-cover transition hover:opacity-90"
        />
      </Link>

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={canonicalHref}>
              <h3 className="line-clamp-2 text-base font-bold leading-5 transition hover:text-emerald-300">
                {deal.title}
              </h3>
            </Link>
          </div>

          {Number(deal.savings || 0) > 0 ? (
            <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
              -{Math.round(Number(deal.savings || 0))}%
            </span>
          ) : null}
        </div>

        <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Current deal
            </p>

            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-300">
              {getStoreLogo(deal.storeID) ? (
                <img
                  src={getStoreLogo(deal.storeID)!}
                  alt={getStoreName(deal.storeID)}
                  className="h-3.5 w-3.5 object-contain"
                />
              ) : null}
              <span>{getStoreName(deal.storeID)}</span>
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <span className="text-2xl font-bold text-emerald-400">
              ${deal.salePrice}
            </span>

            {hasValidNormalPrice ? (
              <span className="text-sm text-zinc-400 line-through">
                ${deal.normalPrice}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2">
          <Link
            href={canonicalHref}
            className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
          >
            Open game page
          </Link>
        </div>
      </div>
    </article>
  )
}

export default function PcPageClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentPage = Math.max(1, Number(searchParams.get('page') || '1'))
  const query = searchParams.get('q') || ''
  const sort = searchParams.get('sort') || 'all'
  const storeFilter = searchParams.get('store') || 'all'
  const priceFilter = searchParams.get('price') || 'all'

  const [deals, setDeals] = useState<Deal[]>([])
  const [steamDeals, setSteamDeals] = useState<SteamSpotlightItem[]>([])
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

    const load = async () => {
      try {
        setLoading(true)

        const [dealsRes, steamRes, statsRes] = await Promise.all([
          fetch('/api/deals?limit=600'),
          fetch('/api/steam-spotlight'),
          fetch('/api/deals-stats'),
        ])

        const dealsData = await dealsRes.json()
        const steamData = await steamRes.json()
        const statsData = await statsRes.json()

        if (!cancelled) {
          setDeals(Array.isArray(dealsData) ? dealsData : [])
          setSteamDeals(Array.isArray(steamData) ? steamData : [])
          setDealsStats({
            dealsIndexed: Number(statsData?.dealsIndexed || 0),
            steamIndexed: Number(statsData?.steamIndexed || 0),
            steamSpotlightIndexed: Number(statsData?.steamSpotlightIndexed || 0),
            dealsUpdatedAt: statsData?.dealsUpdatedAt || null,
            steamUpdatedAt: statsData?.steamUpdatedAt || null,
            steamSpotlightUpdatedAt: statsData?.steamSpotlightUpdatedAt || null,
          })
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
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [searchParams])

  const filteredDeals = useMemo(() => {
    const normalizedQuery = normalizeSteamTitle(query)

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

    const allCheapsharkDeals = deals.filter((deal) => {
      if (!isAllowedStore(deal.storeID)) return false
      if (storeFilter !== 'all' && deal.storeID !== storeFilter) return false

      const salePrice = Number(deal.salePrice || 0)
      const savings = Number(deal.savings || 0)

      if (priceFilter === 'under-5' && !(salePrice > 0 && salePrice < 5)) return false
      if (priceFilter === 'under-10' && !(salePrice > 0 && salePrice < 10)) return false
      if (priceFilter === 'over-80' && savings < 80) return false

      if (normalizedQuery) {
        return normalizeSteamTitle(deal.title).includes(normalizedQuery)
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

                const metacriticByCanonicalKey = new Map<string, number>()

    for (const deal of allCheapsharkDeals) {
      const key = makeCanonicalTitleKey(deal.title)
      const score = Number(deal.metacriticScore || 0)
      const current = metacriticByCanonicalKey.get(key) || 0

      if (score > current) {
        metacriticByCanonicalKey.set(key, score)
      }
    }

    let unified = [
      ...allSteamDeals.map((item) => ({
        type: 'steam' as const,
        title: item.title,
        savings: getSafeDiscountPercent(
          item.salePrice,
          item.normalPrice,
          item.savings
        ),
        salePrice: Number(item.salePrice || 0),
        normalPrice: Number(item.normalPrice || 0),
        metacritic:
          metacriticByCanonicalKey.get(makeCanonicalTitleKey(item.title)) || 0,
        updatedAtScore: 0,
        payload: item,
      })),
      ...allCheapsharkDeals.map((deal) => ({
        type: 'deal' as const,
        title: deal.title,
        savings: Number(deal.savings || 0),
        salePrice: Number(deal.salePrice || 0),
        normalPrice: Number(deal.normalPrice || 0),
        metacritic: Number(deal.metacriticScore || 0),
        updatedAtScore: 0,
        payload: deal,
      })),
    ]

        if (sort === 'best') {
      unified.sort((a, b) => {
        const scoreA = a.savings * 1.6 + a.normalPrice * 0.2 + a.metacritic * 0.8
        const scoreB = b.savings * 1.6 + b.normalPrice * 0.2 + b.metacritic * 0.8
        return scoreB - scoreA
      })
    } else if (sort === 'top-rated') {
      const ratedOnly = unified.filter((item) => item.metacritic >= 70)
      const dedupedRated = dedupeTopRatedItems(ratedOnly)

      dedupedRated.sort((a, b) => {
        if (b.metacritic !== a.metacritic) {
          return b.metacritic - a.metacritic
        }

        if (b.savings !== a.savings) {
          return b.savings - a.savings
        }

        return b.normalPrice - a.normalPrice
      })

      unified = dedupedRated
    } else if (sort === 'biggest-discount') {
      unified.sort((a, b) => b.savings - a.savings)
    } else if (sort === 'latest') {
      unified.sort((a, b) => a.title.localeCompare(b.title))
    } else {
      unified.sort((a, b) => b.savings - a.savings)
    }

    return {
      mode: 'mixed' as const,
      items: unified,
    }
  }, [deals, steamDeals, query, sort, storeFilter, priceFilter])


  const totalItems = filteredDeals.items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const paginatedItems = filteredDeals.items.slice(startIndex, startIndex + PAGE_SIZE)

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
  <h1 className="mt-1 text-3xl font-bold">PC Deals</h1>
  <p className="mt-2 max-w-3xl text-zinc-400">
    Explore the unified Steam-first PC layer, use one canonical game page per title, and switch into Steam Deals when you want the larger discounted inventory.
  </p>
</header>

        <div className="mb-6">
          <RegionNotice />
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
  <MetricCard
    label="Steam deals cached"
    value={dealsStats.steamIndexed || steamDeals.length}
    sublabel={
      dealsStats.steamSpotlightIndexed > 0
        ? `${dealsStats.steamSpotlightIndexed} curated spotlight entries`
        : 'Large Steam sales layer active'
    }
  />
  <MetricCard
    label="Results in this view"
    value={totalItems}
    sublabel={sort === 'steam-spotlight' ? 'Steam Deals mode' : 'PC browsing mode'}
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
      Use filters to browse the broader PC layer or jump directly into Steam Deals for the larger Steam-only discounted inventory.
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
  {sort === 'steam-spotlight' ? 'Steam deals in this view' : 'PC results in this view'}
  {storeFilter !== 'all' ? ` · ${getStoreName(storeFilter)}` : ''}
  {sort === 'steam-spotlight' && dealsStats.steamIndexed > 0
    ? ` · ${dealsStats.steamIndexed} cached Steam deals`
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
  Loading the Steam-first PC deals layer...
</div>
        ) : paginatedItems.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="text-xl font-bold text-white">
  {sort === 'steam-spotlight'
    ? 'No Steam deals match this view'
    : 'No PC results match this view'}
</h2>

              <p className="mt-3 text-sm text-zinc-400">
                {hasActiveFilters
                  ? 'Your current search and filter combination did not return visible results.'
                  : 'There are no visible deals in this section right now.'}
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
            {sort === 'steam-spotlight'
              ? (paginatedItems as SteamSpotlightItem[]).map((item) => (
                  <SteamCard
                    key={item.steamAppID}
                    item={item}
                    userId={userId}
                    trackedIds={trackedIds}
                    setTrackedIds={setTrackedIds}
                    setTrackMessage={setTrackMessage}
                  />
                ))
                            : paginatedItems.map((entry) => {
                  if ('type' in entry && entry.type === 'steam') {
                    return (
                      <SteamCard
                        key={`steam-${entry.payload.steamAppID}`}
                        item={entry.payload}
                        userId={userId}
                        trackedIds={trackedIds}
                        setTrackedIds={setTrackedIds}
                        setTrackMessage={setTrackMessage}
                      />
                    )
                  }

                  if ('type' in entry && entry.type === 'deal') {
                    return (
                      <DealCard
                        key={`deal-${entry.payload.dealID}`}
                        deal={entry.payload}
                      />
                    )
                  }

                  return null
                })}
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