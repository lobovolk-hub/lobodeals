'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { FallbackGameImage } from './fallback-game-image'
import { TrackButton } from './track-button'

type FeaturedItem = {
  id: string
  slug: string
  title: string
  image_url: string
  platforms: string[]
  release_date: string | null
  current_price_amount: number | null
  original_price_amount: number | null
  discount_percent: number | null
  ps_plus_price_amount: number | null
  best_price_amount: number | null
  best_price_type: 'regular' | 'ps_plus' | 'none'
  has_deal: boolean
  has_ps_plus_deal: boolean
  metacritic_score: number | null
}

const AUTOPLAY_MS = 10000

function formatPrice(amount: number | null) {
  if (amount === null) return 'TBA'
  if (amount === 0) return 'Free'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function formatDate(value: string | null) {
  if (!value) return null

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value.includes('T') ? value : `${value}T00:00:00`))
}

function getHref(item: FeaturedItem) {
  return `/us/playstation/${item.slug}`
}

function getPsPlusDiscountPercent(item: FeaturedItem) {
  if (!item.has_ps_plus_deal) return null
  if (item.original_price_amount === null) return null
  if (item.ps_plus_price_amount === null) return null
  if (item.original_price_amount <= 0) return null
  if (item.ps_plus_price_amount >= item.original_price_amount) return null

  const percent = Math.round(
    ((item.original_price_amount - item.ps_plus_price_amount) /
      item.original_price_amount) *
      100
  )

  return percent > 0 && percent < 100 ? percent : null
}

function getSavingsLabel(item: FeaturedItem) {
  const labels: string[] = []

  if (
    item.has_deal &&
    item.discount_percent !== null &&
    item.discount_percent > 0 &&
    item.discount_percent < 100
  ) {
    labels.push(`Save ${item.discount_percent}%`)
  }

  const psPlusDiscountPercent = getPsPlusDiscountPercent(item)

  if (psPlusDiscountPercent !== null) {
    labels.push(`PS+ ${psPlusDiscountPercent}%`)
  }

  return labels.length > 0 ? labels.join(' / ') : null
}

export function HomeFeaturedCarousel({ items }: { items: FeaturedItem[] }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (items.length <= 1) return

    const timeout = window.setTimeout(() => {
      setIndex((current) => (current + 1) % items.length)
    }, AUTOPLAY_MS)

    return () => window.clearTimeout(timeout)
  }, [index, items.length])

  if (items.length === 0) return null

  const item = items[index]
  const releaseDate = formatDate(item.release_date)
  const savingsLabel = getSavingsLabel(item)

  const showOriginalPrice =
    (item.has_deal || item.has_ps_plus_deal) &&
    item.original_price_amount !== null &&
    item.original_price_amount > 0

  const showRegularDealPrice =
    item.has_deal && item.current_price_amount !== null

  const showPsPlusDealPrice =
    item.has_ps_plus_deal && item.ps_plus_price_amount !== null

  const showBasePrice = !item.has_deal && !item.has_ps_plus_deal

  function previous() {
    setIndex((current) => (current - 1 + items.length) % items.length)
  }

  function next() {
    setIndex((current) => (current + 1) % items.length)
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
      <div className="grid gap-0 lg:grid-cols-[520px_1fr]">
        <div className="relative aspect-square bg-zinc-800">
          <Link
            href={getHref(item)}
            className="block h-full w-full"
            aria-label={`View ${item.title}`}
          >
            <FallbackGameImage
              src={item.image_url}
              alt={item.title}
              className="block h-full w-full object-cover"
              placeholderClassName="flex h-full w-full items-center justify-center bg-zinc-800 text-sm font-semibold text-zinc-500"
            />
          </Link>

          {items.length > 1 ? (
            <>
              <button
                type="button"
                onClick={previous}
                className="absolute left-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/75 text-2xl font-black text-white shadow-lg backdrop-blur transition hover:bg-black hover:text-white"
                aria-label="Previous featured game"
              >
                ‹
              </button>

              <button
                type="button"
                onClick={next}
                className="absolute right-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/75 text-2xl font-black text-white shadow-lg backdrop-blur transition hover:bg-black hover:text-white"
                aria-label="Next featured game"
              >
                ›
              </button>
            </>
          ) : null}

          {item.metacritic_score ? (
            <span className="absolute left-4 top-4 rounded-full bg-white px-3 py-2 text-sm font-black text-black">
              MC {item.metacritic_score}
            </span>
          ) : null}

          {item.platforms && item.platforms.length > 0 ? (
            <div className="absolute right-4 top-4 flex gap-1">
              {item.platforms.slice(0, 2).map((platform) => (
                <span
                  key={platform}
                  className="rounded-full bg-black/80 px-3 py-2 text-xs font-bold text-white backdrop-blur"
                >
                  {platform}
                </span>
              ))}
            </div>
          ) : null}

          {savingsLabel ? (
            <div className="absolute bottom-4 left-4 right-4">
              <span className="inline-flex rounded-full border border-white/20 bg-black/85 px-3 py-1.5 text-xs font-black text-white shadow-lg backdrop-blur">
                {savingsLabel}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col justify-center p-6 md:p-10">
          <h1 className="max-w-3xl text-4xl font-black tracking-tight md:text-6xl">
            {item.title}
          </h1>

          <p className="mt-4 text-sm font-semibold text-zinc-400">
            {item.platforms?.join(' · ') || 'PlayStation'}
          </p>

          {releaseDate ? (
            <p className="mt-2 text-sm text-zinc-500">Released {releaseDate}</p>
          ) : null}

          <div className="mt-6 space-y-1">
            {showPsPlusDealPrice ? (
              <p className="text-4xl font-black text-yellow-300">
                PS+ {formatPrice(item.ps_plus_price_amount)}
              </p>
            ) : null}

            {showRegularDealPrice ? (
              <p
                className={
                  showPsPlusDealPrice
                    ? 'text-xl font-black text-white'
                    : 'text-4xl font-black text-white'
                }
              >
                {showPsPlusDealPrice ? 'Regular ' : ''}
                {formatPrice(item.current_price_amount)}
              </p>
            ) : null}

            {showOriginalPrice ? (
              <p className="text-lg font-semibold text-zinc-500 line-through">
                {formatPrice(item.original_price_amount)}
              </p>
            ) : null}

            {showBasePrice ? (
              <p className="text-4xl font-black text-white">
                {formatPrice(item.current_price_amount)}
              </p>
            ) : null}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={getHref(item)}
              className="rounded-xl bg-[#990303] px-6 py-4 text-base font-bold text-white transition hover:bg-red-700"
            >
              View details
            </Link>

            <TrackButton
              key={item.id}
              itemId={item.id}
              checkOnMount
              size="large"
            />

            <Link
              href="/deals?tab=games"
              className="rounded-xl border border-zinc-700 px-6 py-4 text-base font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              Browse deals
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}