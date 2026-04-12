'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getStoreLogo, getStoreName } from '@/lib/storeMap'

type CatalogItem = {
  id: string
  steamAppID: string
  steamType?: string
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
  canOpenPage: boolean
  sortLatest: number
  metacritic?: number | null
}

type CatalogBrowseResponse = {
  items: CatalogItem[]
  totalItems: number
  totalPages: number
  page: number
  pageSize: number
  hasNextPage: boolean
  mode?: 'cache' | 'error'
  source?: string
  appliedType?: string
}

const PAGE_SIZE = 36

function normalizePage(value: string | null) {
  const parsed = Number(value || '1')
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.floor(parsed)
}

function normalizeType(value: string | null) {
  const safe = String(value || 'all').trim().toLowerCase()

  if (safe === 'game') return 'game'
  if (safe === 'dlc') return 'dlc'
  if (safe === 'software') return 'software'

  return 'all'
}

function buildCatalogHref(item: CatalogItem) {
  if (item.canOpenPage && item.slug) {
    return `/pc/${encodeURIComponent(item.slug)}`
  }

  return item.url || '#'
}

function getPrimaryActionLabel(item: CatalogItem) {
  if (item.canOpenPage) return 'Open page'
  if (item.url) return 'Open Steam'
  return 'Not ready'
}

function getTypeLabel(item: CatalogItem) {
  const type = String(item.steamType || '').trim().toLowerCase()

  if (type === 'game') return 'Game'
  if (type === 'dlc') return 'DLC'
  if (type === 'software') return 'Software'

  return 'Item'
}

function getTypeBadgeClass(item: CatalogItem) {
  const type = String(item.steamType || '').trim().toLowerCase()

  if (type === 'software') {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-300'
  }

  if (type === 'dlc') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  }

  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
}

function getCardDisplayState(item: {
  salePrice?: string
  normalPrice?: string
  savings?: string
  isFreeToPlay?: boolean
  sortLatest?: number
}) {
  const nowEpoch = Math.floor(Date.now() / 1000)
  const sale = Number(item.salePrice || 0)
  const normal = Number(item.normalPrice || 0)
  const isUpcoming = Number(item.sortLatest || 0) > nowEpoch

  const hasSalePrice = Number.isFinite(sale) && sale > 0
  const hasNormalPrice = Number.isFinite(normal) && normal > 0
  const hasDiscount =
    !isUpcoming &&
    hasSalePrice &&
    hasNormalPrice &&
    normal > sale

  const priceLabel = isUpcoming
    ? 'TBA'
    : hasSalePrice
      ? `$${item.salePrice}`
      : hasNormalPrice
        ? `$${item.normalPrice}`
        : item.isFreeToPlay
          ? 'Free'
          : 'No price'

  return {
    isUpcoming,
    hasDiscount,
    priceLabel,
    showNormalPrice: hasDiscount,
  }
}

function buildPageList(currentPage: number, totalPages: number) {
  if (totalPages <= 1) return [1]

  const pages = new Set<number>()
  pages.add(1)
  pages.add(totalPages)

  for (let i = currentPage - 2; i <= currentPage + 2; i += 1) {
    if (i >= 1 && i <= totalPages) {
      pages.add(i)
    }
  }

  return Array.from(pages).sort((a, b) => a - b)
}

export default function CatalogPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const page = normalizePage(searchParams.get('page'))
  const type = normalizeType(searchParams.get('type'))
  const activeQuery = (searchParams.get('q') || '').trim()

  const [queryInput, setQueryInput] = useState(activeQuery)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const [suggestions, setSuggestions] = useState<CatalogItem[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestionBoxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setQueryInput(activeQuery)
  }, [activeQuery])

  useEffect(() => {
    const controller = new AbortController()

    async function loadBrowse() {
      try {
        setLoading(true)
        setError('')

        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('pageSize', String(PAGE_SIZE))
        params.set('type', type)

        if (activeQuery) {
          params.set('q', activeQuery)
        }

        const response = await fetch(`/api/catalog-browse-page?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })

        const data = (await response.json()) as CatalogBrowseResponse

        setItems(Array.isArray(data.items) ? data.items : [])
        setTotalItems(Number(data.totalItems || 0))
        setTotalPages(Math.max(1, Number(data.totalPages || 1)))
      } catch (err: any) {
        if (err?.name === 'AbortError') return

        console.error(err)
        setItems([])
        setTotalItems(0)
        setTotalPages(1)
        setError('Could not load the catalog right now.')
      } finally {
        setLoading(false)
      }
    }

    loadBrowse()

    return () => controller.abort()
  }, [page, type, activeQuery])

  useEffect(() => {
    const q = queryInput.trim()

    if (q.length < 2) {
      setSuggestions([])
      setSuggestionsLoading(false)
      return
    }

    const timer = setTimeout(async () => {
      try {
        setSuggestionsLoading(true)

        const params = new URLSearchParams()
        params.set('title', q)
        params.set('type', type)

        const response = await fetch(`/api/catalog-suggest?${params.toString()}`, {
          cache: 'no-store',
        })

        const data = await response.json()
        setSuggestions(Array.isArray(data) ? data.slice(0, 5) : [])
      } catch (err) {
        console.error(err)
        setSuggestions([])
      } finally {
        setSuggestionsLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [queryInput, type])

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

  const pageList = useMemo(() => buildPageList(page, totalPages), [page, totalPages])

  const updateUrl = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())

    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === 'all' || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })

    const next = params.toString()
    router.replace(next ? `/catalog?${next}` : '/catalog', { scroll: false })
  }

  const applyQuery = () => {
    const trimmed = queryInput.trim()

    updateUrl({
      q: trimmed || null,
      page: '1',
    })

    setShowSuggestions(false)
  }

  const clearQuery = () => {
    setQueryInput('')
    setSuggestions([])
    setShowSuggestions(false)

    updateUrl({
      q: null,
      page: '1',
    })
  }

  const changeType = (nextType: 'all' | 'game' | 'dlc' | 'software') => {
    updateUrl({
      type: nextType === 'all' ? null : nextType,
      page: '1',
    })
  }

  const goToPage = (nextPage: number) => {
    updateUrl({
      page: String(Math.max(1, nextPage)),
    })
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-col gap-4" ref={suggestionBoxRef}>
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <input
                type="text"
                value={queryInput}
                onChange={(e) => {
                  setQueryInput(e.target.value)
                  setShowSuggestions(true)
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    applyQuery()
                  }
                }}
                placeholder="Search titles, slug or Steam App ID"
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
              />

              {queryInput.trim().length > 0 ? (
                <button
                  type="button"
                  onClick={clearQuery}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={applyQuery}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
            >
              Search
            </button>
          </div>

          {showSuggestions && queryInput.trim().length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              {queryInput.trim().length < 2 ? (
                <div className="px-4 py-3 text-sm text-zinc-500">
                  Type at least 2 letters.
                </div>
              ) : suggestionsLoading ? (
                <div className="px-4 py-3 text-sm text-zinc-400">
                  Loading suggestions...
                </div>
              ) : suggestions.length > 0 ? (
                suggestions.map((item) => {
                  const href = buildCatalogHref(item)
                  const external = !item.canOpenPage && Boolean(item.url)
                  const display = getCardDisplayState(item)

                  if (external) {
                    return (
                      <a
                        key={item.id}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          setQueryInput(item.title || '')
                          setShowSuggestions(false)
                        }}
                        className="flex items-center gap-3 border-t border-zinc-800 px-4 py-3 transition first:border-t-0 hover:bg-zinc-800"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                          {item.thumb ? (
                            <img
                              src={item.thumb}
                              alt={item.title || 'Catalog item'}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-100">
                            {item.title}
                          </p>
                          <p className="text-xs text-zinc-500">{display.priceLabel}</p>
                        </div>

                        <span className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200">
                          Steam
                        </span>
                      </a>
                    )
                  }

                  return (
                    <Link
                      key={item.id}
                      href={href}
                      onClick={() => {
                        setQueryInput(item.title || '')
                        setShowSuggestions(false)
                      }}
                      className="flex items-center gap-3 border-t border-zinc-800 px-4 py-3 transition first:border-t-0 hover:bg-zinc-800"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                        {item.thumb ? (
                          <img
                            src={item.thumb}
                            alt={item.title || 'Catalog item'}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {item.title}
                        </p>
                        <p className="text-xs text-zinc-500">{display.priceLabel}</p>
                      </div>

                      <span className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200">
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

        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => changeType('all')}
            className={`rounded-xl px-3 py-2 text-sm transition ${
              type === 'all'
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            All
          </button>

          <button
            type="button"
            onClick={() => changeType('game')}
            className={`rounded-xl px-3 py-2 text-sm transition ${
              type === 'game'
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            Games
          </button>

          <button
            type="button"
            onClick={() => changeType('dlc')}
            className={`rounded-xl px-3 py-2 text-sm transition ${
              type === 'dlc'
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            DLC
          </button>

          <button
            type="button"
            onClick={() => changeType('software')}
            className={`rounded-xl px-3 py-2 text-sm transition ${
              type === 'software'
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            Software
          </button>
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-zinc-400">
            {loading ? 'Loading...' : `${totalItems.toLocaleString()} items`}
          </div>

          <div className="text-sm text-zinc-500">
            Page {page} of {Math.max(1, totalPages)}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {!loading && items.length === 0 && !error ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-400">
            No items found for this catalog view.
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
              {items.map((item) => {
                const href = buildCatalogHref(item)
                const external = !item.canOpenPage && Boolean(item.url)
                const display = getCardDisplayState(item)

                const titleBlock = (
                  <div className="line-clamp-2 text-sm font-semibold text-white transition hover:text-emerald-300">
                    {item.title}
                  </div>
                )

                return (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
                  >
                    {item.canOpenPage ? (
                      <Link href={href} className="block">
                        <div className="aspect-[16/9] w-full overflow-hidden bg-white/[0.04]">
                          {item.thumb ? (
                            <img
                              src={item.thumb}
                              alt={item.title || 'Catalog item'}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
                              No image
                            </div>
                          )}
                        </div>
                      </Link>
                    ) : external ? (
                      <a href={href} target="_blank" rel="noreferrer" className="block">
                        <div className="aspect-[16/9] w-full overflow-hidden bg-white/[0.04]">
                          {item.thumb ? (
                            <img
                              src={item.thumb}
                              alt={item.title || 'Catalog item'}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
                              No image
                            </div>
                          )}
                        </div>
                      </a>
                    ) : (
                      <div className="aspect-[16/9] w-full overflow-hidden bg-white/[0.04]">
                        {item.thumb ? (
                          <img
                            src={item.thumb}
                            alt={item.title || 'Catalog item'}
                            className="h-full w-full object-cover opacity-90"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
                            No image
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {item.canOpenPage ? (
                            <Link href={href} className="block">
                              {titleBlock}
                            </Link>
                          ) : external ? (
                            <a href={href} target="_blank" rel="noreferrer" className="block">
                              {titleBlock}
                            </a>
                          ) : (
                            <div className="line-clamp-2 text-sm font-semibold text-white">
                              {item.title}
                            </div>
                          )}
                        </div>

                        {typeof item.metacritic === 'number' && item.metacritic > 0 ? (
                          <span className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            MC {item.metacritic}
                          </span>
                        ) : null}
                      </div>

                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {item.savings && Number(item.savings) > 0 ? (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                            -{item.savings}%
                          </span>
                        ) : null}

                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${getTypeBadgeClass(
                            item
                          )}`}
                        >
                          {getTypeLabel(item)}
                        </span>

                        {item.isFreeToPlay ? (
                          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                            Free to play
                          </span>
                        ) : null}
                      </div>

                      <div className="rounded-2xl bg-black/40 p-3">
                        <div className="text-2xl font-bold text-emerald-400">
                          {display.priceLabel}
                        </div>

                        {display.showNormalPrice ? (
                          <div className="text-sm text-white/45 line-through">
                            ${item.normalPrice}
                          </div>
                        ) : null}

                        {item.hasActiveOffer ? (
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-300">
                            {getStoreLogo(item.storeID) ? (
                              <img
                                src={getStoreLogo(item.storeID)!}
                                alt={getStoreName(item.storeID)}
                                className="h-4 w-4 object-contain"
                              />
                            ) : null}
                            <span>{getStoreName(item.storeID)}</span>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-zinc-500">
                            {display.isUpcoming ? 'TBA' : 'No active Steam offer cached'}
                          </p>
                        )}
                      </div>

                      <div className="mt-3">
                        {item.canOpenPage ? (
                          <Link
                            href={href}
                            className="block rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
                          >
                            {getPrimaryActionLabel(item)}
                          </Link>
                        ) : item.url ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-xl border border-zinc-700 px-4 py-2 text-center text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
                          >
                            {getPrimaryActionLabel(item)}
                          </a>
                        ) : (
                          <div className="block rounded-xl border border-zinc-700 px-4 py-2 text-center text-sm font-medium text-zinc-500">
                            {getPrimaryActionLabel(item)}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>

              {pageList.map((pageNumber, index) => {
                const previous = pageList[index - 1]
                const showDots = previous && pageNumber - previous > 1

                return (
                  <div key={pageNumber} className="flex items-center gap-2">
                    {showDots ? (
                      <span className="px-1 text-sm text-zinc-500">…</span>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => goToPage(pageNumber)}
                      className={`rounded-xl px-4 py-2 text-sm transition ${
                        pageNumber === page
                          ? 'bg-white text-black'
                          : 'border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  )
}