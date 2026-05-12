import Link from 'next/link'
import { FallbackGameImage } from './fallback-game-image'
import { TrackButton } from './track-button'

export type ItemCardData = {
  id: string
  slug: string
  title: string
  image_url: string
  platforms: string[]
  content_type: string | null
  item_type_label: string | null
  release_date: string | null
  current_price_amount: number | null
  original_price_amount: number | null
  discount_percent: number | null
  ps_plus_price_amount: number | null
  best_price_amount: number | null
  best_price_type: 'regular' | 'ps_plus' | 'none'
  has_deal: boolean
  has_ps_plus_deal: boolean
  is_ps_plus_monthly_game?: boolean | null
  ps_plus_monthly_label?: string | null
  ps_plus_monthly_note?: string | null
  ps_plus_monthly_month?: string | null
  ps_plus_monthly_until?: string | null
  metacritic_score: number | null
}

type ItemCardProps = {
  item: ItemCardData
  initialIsTracked?: boolean
  checkTrackOnMount?: boolean
  reloadOnUntrack?: boolean
}

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

function getTypeLabel(item: ItemCardData) {
  if (item.content_type === 'bundle' && item.item_type_label === 'bundle') {
    return 'Bundle'
  }

  if (item.content_type === 'game' && item.item_type_label === 'addon') {
    return 'Add-on'
  }

  if (item.content_type === 'game' && item.item_type_label === 'game') {
    return 'Game'
  }

  if (item.content_type === 'dlc') {
    return 'Add-on'
  }

  return item.item_type_label || item.content_type || 'Item'
}

function getPsPlusDiscountPercent(item: ItemCardData) {
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

function getSavingsLabel(item: ItemCardData) {
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

export function ItemCard({
  item,
  initialIsTracked = false,
  checkTrackOnMount = false,
  reloadOnUntrack = false,
}: ItemCardProps) {
  const releaseDate = formatDate(item.release_date)
  const savingsLabel = getSavingsLabel(item)
  const showMonthlyIncluded = item.is_ps_plus_monthly_game === true
  const monthlyPriceLabel = item.ps_plus_monthly_label || 'Free with PS Plus'
  const imageBadgeLabel = showMonthlyIncluded
    ? 'Monthly PS Plus game'
    : savingsLabel

  const showOriginalPrice =
    (item.has_deal || item.has_ps_plus_deal) &&
    item.original_price_amount !== null &&
    item.original_price_amount > 0

  const showRegularDealPrice =
    item.has_deal && item.current_price_amount !== null

  const showPsPlusDealPrice =
    item.has_ps_plus_deal && item.ps_plus_price_amount !== null

  const showBasePrice =
    !item.has_deal && !item.has_ps_plus_deal && !showMonthlyIncluded

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:border-zinc-600">
      <Link href={`/us/playstation/${item.slug}`} className="flex flex-1 flex-col">
        <div className="relative aspect-square bg-zinc-800">
          <FallbackGameImage
            src={item.image_url}
            alt={item.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            placeholderClassName="flex h-full w-full items-center justify-center bg-zinc-800 text-xs font-semibold text-zinc-500"
          />

          {item.metacritic_score ? (
            <span className="absolute left-2 top-2 rounded-full bg-white px-2 py-1 text-[11px] font-black text-black">
              MC {item.metacritic_score}
            </span>
          ) : null}

          {item.platforms && item.platforms.length > 0 ? (
            <div className="absolute right-2 top-2 flex gap-1">
              {item.platforms.slice(0, 2).map((platform) => (
                <span
                  key={platform}
                  className="rounded-full bg-black/80 px-2 py-1 text-[10px] font-bold text-white backdrop-blur"
                >
                  {platform}
                </span>
              ))}
            </div>
          ) : null}

          {imageBadgeLabel ? (
            <div className="absolute bottom-2 left-2 right-2">
              <span className="inline-flex rounded-full border border-white/20 bg-black/85 px-2 py-1 text-[10px] font-black text-white shadow-lg backdrop-blur">
                {imageBadgeLabel}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-3">
          <div className="mb-2">
            <span className="rounded-full bg-zinc-800 px-2 py-1 text-[11px] font-semibold text-zinc-300">
              {getTypeLabel(item)}
            </span>
          </div>

          <h3 className="text-sm font-bold leading-tight text-white group-hover:text-zinc-200">
            {item.title}
          </h3>

          {releaseDate ? (
            <p className="mt-2 text-xs text-zinc-500">{releaseDate}</p>
          ) : null}

          <div className="mt-auto space-y-1 pt-4">
            {showPsPlusDealPrice ? (
              <p className="text-xl font-black text-yellow-300">
                PS+ {formatPrice(item.ps_plus_price_amount)}
              </p>
            ) : null}

            {showRegularDealPrice ? (
              <p
                className={
                  showPsPlusDealPrice
                    ? 'text-sm font-bold text-zinc-100'
                    : 'text-xl font-black text-white'
                }
              >
                {showPsPlusDealPrice ? 'Regular ' : ''}
                {formatPrice(item.current_price_amount)}
              </p>
            ) : null}

            {showOriginalPrice ? (
              <p className="text-xs text-zinc-500 line-through">
                {formatPrice(item.original_price_amount)}
              </p>
            ) : null}

            {showMonthlyIncluded ? (
              <div>
                <p className="text-xl font-black text-yellow-300">
                  {monthlyPriceLabel}
                </p>
                {item.current_price_amount !== null ? (
                  <p className="text-xs font-semibold text-zinc-500">
                    Regular {formatPrice(item.current_price_amount)}
                  </p>
                ) : null}
              </div>
            ) : null}

            {showBasePrice ? (
              <p className="text-xl font-black text-white">
                {formatPrice(item.current_price_amount)}
              </p>
            ) : null}
          </div>
        </div>
      </Link>

      <div className="border-t border-zinc-800 p-3 pt-2">
        <TrackButton
          itemId={item.id}
          initialIsTracked={initialIsTracked}
          checkOnMount={checkTrackOnMount}
          reloadOnUntrack={reloadOnUntrack}
          fullWidth
        />
      </div>
    </article>
  )
}