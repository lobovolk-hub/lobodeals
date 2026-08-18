import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  derivePriceLowPresentation,
  derivePublicPricePresentation,
} from '@/lib/catalog-price-presentation.mjs'
import { FallbackGameImage } from '@/components/fallback-game-image'
import { TrackButton } from '@/components/track-button'

export const dynamic = 'force-static'
export const dynamicParams = true
export const revalidate = 86400
export const fetchCache = 'force-cache'
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com'

type SlugMetadataProps = {
  params: Promise<{
    slug: string
  }>
}

type SlugSeoItem = {
  slug: string
  title: string
  image_url: string | null
  platforms: string[] | null
  content_type: string | null
  item_type_label: string | null
  release_date: string | null
  publisher: string | null
  current_price_amount: number | null
  original_price_amount: number | null
  discount_percent: number | null
  ps_plus_price_amount: number | null
  best_price_amount: number | null
  best_price_type: string | null
  has_deal: boolean | null
  has_ps_plus_deal: boolean | null
  has_verified_deal: boolean | null
  has_verified_ps_plus_deal: boolean | null
  is_ps_plus_monthly_game: boolean | null
  ps_plus_monthly_label: string | null
  ps_plus_monthly_note: string | null
  ps_plus_monthly_month: string | null
  ps_plus_monthly_until: string | null
  metacritic_score: number | null
}

function formatSeoPrice(amount: number | null) {
  if (amount === null) return null
  if (amount === 0) return 'Free'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount)
}

function getSeoTypeLabel(item: SlugSeoItem) {
  if (item.item_type_label === 'bundle' || item.content_type === 'bundle') {
    return 'bundle'
  }

  if (item.item_type_label === 'addon') {
    return 'add-on'
  }

  return 'game'
}

function buildSlugSeoTitle(item: SlugSeoItem) {
  const typeLabel = getSeoTypeLabel(item)
  const pricePresentation = derivePublicPricePresentation(item)
  const platformLabel =
    item.platforms && item.platforms.length > 0
      ? item.platforms.join(' & ')
      : 'PlayStation'

  if (pricePresentation.has_ps_plus_offer) {
    return `${item.title} PS Plus deal and price`
  }

  if (pricePresentation.has_regular_offer) {
    return `${item.title} deal and price`
  }

  return `${item.title} ${platformLabel} ${typeLabel} price`
}

function buildSlugSeoDescription(item: SlugSeoItem) {
  const typeLabel = getSeoTypeLabel(item)
  const pricePresentation = derivePublicPricePresentation(item)
  const platformLabel =
    item.platforms && item.platforms.length > 0
      ? item.platforms.join(' and ')
      : 'PlayStation'

  const currentPrice = formatSeoPrice(pricePresentation.buy_price_amount)
  const regularDealPrice = formatSeoPrice(pricePresentation.regular_price_amount)
  const psPlusPrice = formatSeoPrice(pricePresentation.ps_plus_price_amount)

  const parts: string[] = []

  if (
    pricePresentation.has_regular_offer &&
    pricePresentation.has_ps_plus_offer &&
    regularDealPrice &&
    psPlusPrice
  ) {
    parts.push(
      `Track ${item.title} on LoboDeals and view its current PlayStation deal at ${regularDealPrice} and PS Plus deal at ${psPlusPrice}.`
    )
  } else if (pricePresentation.has_ps_plus_offer && psPlusPrice) {
    parts.push(
      `Track ${item.title} on LoboDeals and view its current PS Plus deal at ${psPlusPrice}.`
    )
  } else if (pricePresentation.has_regular_offer && regularDealPrice) {
    parts.push(
      `Track ${item.title} on LoboDeals and view its current PlayStation deal at ${regularDealPrice}.`
    )
  } else if (currentPrice) {
    parts.push(
      `Track ${item.title} on LoboDeals and view its current PlayStation price at ${currentPrice}.`
    )
  } else {
    parts.push(
      `Track ${item.title} on LoboDeals and view its PlayStation price, details, and store link.`
    )
  }

  parts.push(`${item.title} is listed as a ${platformLabel} ${typeLabel}.`)

  if (item.metacritic_score !== null) {
    parts.push(`Metacritic score: ${item.metacritic_score}.`)
  }

  if (item.publisher) {
    parts.push(`Publisher: ${item.publisher}.`)
  }

  return parts.join(' ').slice(0, 280)
}

export async function generateMetadata({
  params,
}: SlugMetadataProps): Promise<Metadata> {
  const { slug } = await params

  let decodedSlug = slug
  try {
    decodedSlug = decodeURIComponent(slug)
  } catch {
    decodedSlug = slug
  }

  const encodedSlug = encodeURIComponent(decodedSlug)

  const slugCandidates = Array.from(
    new Set([slug, decodedSlug, encodedSlug])
  )

  const { data } = await supabase
    .from('catalog_public_cache')
    .select(
      'slug, title, image_url, platforms, content_type, item_type_label, release_date, publisher, current_price_amount, original_price_amount, discount_percent, ps_plus_price_amount, best_price_amount, best_price_type, has_deal, has_ps_plus_deal, has_verified_deal, has_verified_ps_plus_deal, is_ps_plus_monthly_game, ps_plus_monthly_label, ps_plus_monthly_note, ps_plus_monthly_month, ps_plus_monthly_until, metacritic_score'
    )
    .eq('region_code', 'us')
    .eq('storefront', 'playstation')
    .in('slug', slugCandidates)
    .maybeSingle()

  if (!data) {
    return {
      title: 'PlayStation item not found',
      description: 'This PlayStation item could not be found on LoboDeals.',
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  const item = data as SlugSeoItem
  const title = buildSlugSeoTitle(item)
  const description = buildSlugSeoDescription(item)
  const canonical = `/us/playstation/${item.slug}`

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: 'website',
      title: `${title} | LoboDeals`,
      description,
      url: canonical,
      siteName: 'LoboDeals',
      images: item.image_url
        ? [
            {
              url: item.image_url,
              alt: item.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: item.image_url ? 'summary_large_image' : 'summary',
      title: `${title} | LoboDeals`,
      description,
      images: item.image_url ? [item.image_url] : undefined,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

type PageProps = {
  params: Promise<{
    slug: string
  }>
}

type Item = {
  id: string
  psdeals_id: number
  psdeals_slug: string | null
  title: string
  image_url: string | null
  platforms: string[] | null
  content_type: string | null
  item_type_label: string | null
  availability_state: string | null
  current_price_amount: number | null
  original_price_amount: number | null
  discount_percent: number | null
  ps_plus_price_amount: number | null
  best_price_amount: number | null
  best_price_type: string | null
  has_deal: boolean | null
  has_ps_plus_deal: boolean | null
  has_verified_deal: boolean | null
  has_verified_ps_plus_deal: boolean | null
  is_ps_plus_monthly_game: boolean | null
  ps_plus_monthly_label: string | null
  ps_plus_monthly_note: string | null
  ps_plus_monthly_month: string | null
  ps_plus_monthly_until: string | null
  currency_code: string | null
  lowest_price_amount: number | null
  lowest_ps_plus_price_amount: number | null
  lobodeals_lowest_regular_price_amount: number | null
  lobodeals_lowest_regular_price_first_seen_at: string | null
  lobodeals_lowest_ps_plus_price_amount: number | null
  lobodeals_lowest_ps_plus_price_first_seen_at: string | null
  release_date: string | null
  publisher: string | null
  genres: string[] | null
  store_url: string | null
  deal_ends_at: string | null
  metacritic_score: number | null
}


type RelationRow = {
  relation_kind: string
  related_psdeals_id: number | null
  related_title: string
  related_platform_label: string | null
  sort_order: number | null
}

type RelatedItem = {
  id: string
  psdeals_id: number
  psdeals_slug: string | null
  public_slug: string | null
  title: string
  content_type: string | null
  item_type_label: string | null
}

function formatPrice(amount: number | null, currency: string | null) {
  if (amount === null) return 'TBA'
if (amount === 0) return 'Free'
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(amount)
}

function formatDate(value: string | null) {
  if (!value) return null

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value.includes('T') ? value : `${value}T00:00:00`))
}

function isDealWindowActive(value: string | null) {
  if (!value) return true
  return new Date(value).getTime() > Date.now()
}

function getTypeLabel(item: Item | RelatedItem) {
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

function isGame(item: Item) {
  return item.content_type === 'game' && item.item_type_label === 'game'
}

function getDisplayCurrentAmount(item: Item) {
  return item.current_price_amount
}

function getLowestCertifiedAmount(item: Item) {
  const values = [
    item.lobodeals_lowest_regular_price_amount,
    item.lobodeals_lowest_ps_plus_price_amount,
  ].filter((value): value is number => value !== null)

  if (values.length === 0) return null

  return Math.min(...values)
}

function pricesMatch(a: number | null, b: number | null) {
  if (a === null || b === null) return false
  return Math.abs(a - b) < 0.01
}

function getFreeLabel(item: Item, displayCurrentAmount: number | null) {
  if (displayCurrentAmount !== 0) return null

  if (item.has_verified_deal === true) return 'Free'
  if (isGame(item)) return 'Free to Play'
  return 'Free'
}

function getAvailabilityLabel(item: Item) {
  if (item.availability_state === 'demo') return 'Demo'
  if (item.availability_state === 'included') return 'Included'
  if (item.availability_state === 'not_available') return 'Not available'
  if (item.availability_state === 'tba') return 'TBA'
  return null
}

function isUnwantedRelatedContent(title: string) {
  const normalized = title.toLowerCase()

  return (
    normalized.includes('avatar') ||
    normalized.includes('sharefactory') ||
    normalized.includes('theme')
  )
}

function groupRelations(relations: RelationRow[]) {
  const editions = relations.filter(
    (relation) => relation.relation_kind === 'edition'
  )

  const addOns = relations.filter(
    (relation) => relation.relation_kind === 'dlc'
  )

  const groups: Array<[string, RelationRow[]]> = []

  if (editions.length > 0) {
    groups.push(['Editions', editions])
  }

  if (addOns.length > 0) {
    groups.push(['Add-ons', addOns])
  }

  return groups
}

export default async function PlayStationItemPage({ params }: PageProps) {
  const { slug } = await params

  let decodedSlug = slug

  try {
    decodedSlug = decodeURIComponent(slug)
  } catch {
    decodedSlug = slug
  }

  const slugCandidates = Array.from(new Set([slug, decodedSlug]))

    const { data: cacheRow, error: cacheError } = await supabase
  .from('catalog_public_cache')
  .select('item_id, platforms, content_type, item_type_label, current_price_amount, original_price_amount, discount_percent, ps_plus_price_amount, best_price_amount, best_price_type, has_deal, has_ps_plus_deal, has_verified_deal, has_verified_ps_plus_deal, is_ps_plus_monthly_game, ps_plus_monthly_label, ps_plus_monthly_note, ps_plus_monthly_month, ps_plus_monthly_until, deal_ends_at')
  .eq('region_code', 'us')
  .eq('storefront', 'playstation')
  .in('slug', slugCandidates)
  .maybeSingle()

if (cacheError || !cacheRow?.item_id) {
  notFound()
}

const { data, error } = await supabase
  .from('psdeals_stage_items')
  .select(
    'id, psdeals_id, psdeals_slug, title, image_url, platforms, content_type, item_type_label, availability_state, current_price_amount, original_price_amount, discount_percent, currency_code, lowest_price_amount, lowest_ps_plus_price_amount, lobodeals_lowest_regular_price_amount, lobodeals_lowest_regular_price_first_seen_at, lobodeals_lowest_ps_plus_price_amount, lobodeals_lowest_ps_plus_price_first_seen_at, release_date, publisher, genres, store_url, deal_ends_at, metacritic_score'
  )
  .eq('id', cacheRow.item_id)
  .eq('region_code', 'us')
  .eq('storefront', 'playstation')
  .maybeSingle()

if (error || !data) {
  notFound()
}

const stageItem = data as Omit<
  Item,
  | 'ps_plus_price_amount'
  | 'best_price_amount'
  | 'best_price_type'
  | 'has_deal'
  | 'has_ps_plus_deal'
  | 'has_verified_deal'
  | 'has_verified_ps_plus_deal'
  | 'is_ps_plus_monthly_game'
  | 'ps_plus_monthly_label'
  | 'ps_plus_monthly_note'
  | 'ps_plus_monthly_month'
  | 'ps_plus_monthly_until'
>

const item = {
  ...stageItem,
  platforms: cacheRow.platforms ?? stageItem.platforms,
  content_type: cacheRow.content_type ?? stageItem.content_type,
  item_type_label: cacheRow.item_type_label ?? stageItem.item_type_label,
  current_price_amount: cacheRow.current_price_amount,
  original_price_amount: cacheRow.original_price_amount,
  discount_percent: cacheRow.discount_percent,
  ps_plus_price_amount: cacheRow.ps_plus_price_amount,
  best_price_amount: cacheRow.best_price_amount,
  best_price_type: cacheRow.best_price_type,
  has_deal: cacheRow.has_deal,
  has_ps_plus_deal: cacheRow.has_ps_plus_deal,
  has_verified_deal: cacheRow.has_verified_deal,
  has_verified_ps_plus_deal: cacheRow.has_verified_ps_plus_deal,
  is_ps_plus_monthly_game: cacheRow.is_ps_plus_monthly_game,
  ps_plus_monthly_label: cacheRow.ps_plus_monthly_label,
  ps_plus_monthly_note: cacheRow.ps_plus_monthly_note,
  ps_plus_monthly_month: cacheRow.ps_plus_monthly_month,
  ps_plus_monthly_until: cacheRow.ps_plus_monthly_until,
  deal_ends_at: cacheRow.deal_ends_at,
} as Item

const showMonthlyIncluded = item.is_ps_plus_monthly_game === true
const monthlyPriceLabel = item.ps_plus_monthly_label || 'Free with PS Plus'
const monthlyNote =
  item.ps_plus_monthly_note || 'Included with PlayStation Plus this month.'

  const relationsResult = await supabase
    .from('psdeals_stage_relations')
    .select(
      'relation_kind, related_psdeals_id, related_title, related_platform_label, sort_order'
    )
    .eq('item_id', item.id)
    .order('sort_order', { ascending: true })

  const relationRows = ((relationsResult.data || []) as RelationRow[]).filter(
    (relation) =>
      (relation.relation_kind === 'edition' ||
        relation.relation_kind === 'dlc') &&
      !isUnwantedRelatedContent(relation.related_title)
  )

  const relatedIds = relationRows
    .map((relation) => relation.related_psdeals_id)
    .filter((value): value is number => value !== null)

  const relatedItemsResult =
  relatedIds.length > 0
    ? await supabase
        .from('psdeals_stage_items')
        .select(
          'id, psdeals_id, psdeals_slug, title, content_type, item_type_label'
        )
        .eq('region_code', 'us')
        .eq('storefront', 'playstation')
        .in('psdeals_id', relatedIds)
    : { data: [] }

const relatedItemsRaw = (relatedItemsResult.data || []) as Omit<
  RelatedItem,
  'public_slug'
>[]

const relatedItemIds = relatedItemsRaw.map((relatedItem) => relatedItem.id)

const relatedPublicSlugsResult =
  relatedItemIds.length > 0
    ? await supabase
        .from('catalog_public_cache')
        .select('item_id, slug')
        .eq('region_code', 'us')
        .eq('storefront', 'playstation')
        .in('item_id', relatedItemIds)
    : { data: [] }

const relatedPublicSlugByItemId = new Map(
  (relatedPublicSlugsResult.data || []).map((row) => [row.item_id, row.slug])
)

const relatedItems = relatedItemsRaw.map((relatedItem) => ({
  ...relatedItem,
  public_slug: relatedPublicSlugByItemId.get(relatedItem.id) || null,
}))

const relatedItemById = new Map(
  relatedItems.map((relatedItem) => [relatedItem.psdeals_id, relatedItem])
)

  const typeLabel = getTypeLabel(item)
  const pricePresentation = derivePublicPricePresentation(item)
  const currentRegularOffer = pricePresentation.has_regular_offer
const currentPsPlusOffer = pricePresentation.has_ps_plus_offer
const showBuyPrice = pricePresentation.show_buy_price
const savingsLabel = pricePresentation.savings_labels.join(' / ') || null
const displayCurrentAmount = getDisplayCurrentAmount(item)

    const bestCurrentAmount = currentPsPlusOffer
    ? item.ps_plus_price_amount
    : displayCurrentAmount

  const freeLabel = getFreeLabel(item, displayCurrentAmount)
  const availabilityLabel = getAvailabilityLabel(item)

  const currentPriceLabel = formatPrice(
    item.current_price_amount,
    item.currency_code
  )

  const displayCurrentPriceLabel = formatPrice(
    displayCurrentAmount,
    item.currency_code
  )

    const psPlusPriceLabel = formatPrice(
    item.ps_plus_price_amount,
    item.currency_code
  )

  const lowestRegularPriceLabel = formatPrice(
    item.lobodeals_lowest_regular_price_amount,
    item.currency_code
  )

  const lowestPsPlusPriceLabel = formatPrice(
    item.lobodeals_lowest_ps_plus_price_amount,
    item.currency_code
  )

  const historicalRegularPriceLabel = formatPrice(
    item.lowest_price_amount,
    item.currency_code
  )

  const historicalPsPlusPriceLabel = formatPrice(
    item.lowest_ps_plus_price_amount,
    item.currency_code
  )

  const regularLowPresentation = derivePriceLowPresentation({
    legacy: item.lowest_price_amount,
    certified: item.lobodeals_lowest_regular_price_amount,
  })
  const psPlusLowPresentation = derivePriceLowPresentation({
    legacy: item.lowest_ps_plus_price_amount,
    certified: item.lobodeals_lowest_ps_plus_price_amount,
  })

  const lowestCertifiedAmount = getLowestCertifiedAmount(item)
  const bestCurrentMatchesCertifiedLow =
    (currentRegularOffer || currentPsPlusOffer) &&
    pricesMatch(bestCurrentAmount, lowestCertifiedAmount)

  const releaseDate = formatDate(item.release_date)
  const dealEndsAt =
    isDealWindowActive(item.deal_ends_at) &&
    (currentRegularOffer || currentPsPlusOffer)
      ? formatDate(item.deal_ends_at)
      : null

  const relationGroups = groupRelations(relationRows)

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-[1500px] px-6 py-10">
        <div className="mb-6">
          <Link
            href="/catalog"
            className="text-sm font-semibold text-zinc-400 transition hover:text-white"
          >
            ← Back to catalog
          </Link>
        </div>

        <section className="grid items-start gap-8 lg:grid-cols-[420px_1fr]">
          <div className="space-y-4 self-start">
            <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
              <div className="relative aspect-square overflow-hidden bg-black leading-none">
                <FallbackGameImage
  src={item.image_url}
  alt={item.title}
  className="block h-full w-full object-cover"
  placeholderClassName="flex aspect-square h-full w-full items-center justify-center bg-zinc-900 text-sm font-semibold text-zinc-500"
/>
              </div>
            </div>

            {relationGroups.length > 0 ? (
              <details className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
                <summary className="cursor-pointer text-sm font-black text-white">
                  Related content
                </summary>

                <div className="mt-4 space-y-3">
                  {relationGroups.map(([groupLabel, relations]) => (
                    <details
                      key={groupLabel}
                      className="rounded-2xl border border-zinc-800 bg-black p-3"
                    >
                      <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                        {groupLabel} ({relations.length})
                      </summary>

                      <div className="mt-3 space-y-2">
                        {relations.map((relation) => {
                          const relatedItem =
                            relation.related_psdeals_id !== null
                              ? relatedItemById.get(relation.related_psdeals_id)
                              : null

                          const title =
                            relatedItem?.title || relation.related_title

                          const content = (
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                              <p className="text-sm font-semibold text-white">
                                {title}
                              </p>
                            </div>
                          )

                          if (relatedItem?.public_slug) {
  return (
    <Link
      key={`${relation.relation_kind}-${relation.related_psdeals_id}-${relation.related_title}`}
      href={`/us/playstation/${relatedItem.public_slug}`}
      className="block transition hover:opacity-80"
    >
      {content}
    </Link>
  )
}

                          return (
                            <div
                              key={`${relation.relation_kind}-${relation.related_psdeals_id}-${relation.related_title}`}
                            >
                              {content}
                            </div>
                          )
                        })}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ) : null}
          </div>

          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300">
                {typeLabel}
              </span>

              {item.metacritic_score ? (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
                  MC {item.metacritic_score}
                </span>
              ) : null}

              {item.platforms?.map((platform) => (
                <span
                  key={platform}
                  className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-300"
                >
                  {platform}
                </span>
              ))}
            </div>

            <h1 className="max-w-4xl text-4xl font-bold tracking-tight md:text-5xl">
              {item.title}
            </h1>

            {item.publisher ? (
              <p className="mt-3 text-zinc-400">{item.publisher}</p>
            ) : null}

            {releaseDate ? (
              <p className="mt-2 text-sm text-zinc-500">
                Released {releaseDate}
              </p>
            ) : null}

            <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
    Current price
  </p>

  <div className="mt-4 space-y-3">
    {showMonthlyIncluded ? (
      <div className="rounded-2xl border border-yellow-300/30 bg-yellow-300/10 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-300/80">
          PlayStation Plus Monthly Game
        </p>
        <p className="mt-1 text-5xl font-black text-yellow-300">
          {monthlyPriceLabel}
        </p>
        <p className="mt-2 text-sm font-semibold text-yellow-100/80">
          {monthlyNote}
        </p>
      </div>
    ) : null}

        {currentPsPlusOffer && item.ps_plus_price_amount !== null ? (
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-300/80">
          PlayStation Plus
        </p>
        <p className="mt-1 text-5xl font-black text-yellow-300">
          PS+ {psPlusPriceLabel}
        </p>
      </div>
    ) : null}

    {currentRegularOffer && item.current_price_amount !== null ? (
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
          Regular deal price
        </p>
        <p
          className={
            currentPsPlusOffer
              ? 'mt-1 text-2xl font-black text-emerald-300'
              : 'mt-1 text-5xl font-black text-emerald-300'
          }
        >
          {currentPriceLabel}
        </p>
      </div>
    ) : null}

    {pricePresentation.show_original_price ? (
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
          Original price
        </p>
        <p className="mt-1 text-lg font-semibold text-zinc-500 line-through">
          {formatPrice(pricePresentation.original_price_amount, item.currency_code)}
        </p>
      </div>
    ) : null}

    {showBuyPrice ? (
      <div>
        {currentPsPlusOffer || showMonthlyIncluded ? (
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
            Buy price
          </p>
        ) : null}
        <p
          className={
            currentPsPlusOffer || showMonthlyIncluded
              ? 'mt-1 text-2xl font-black text-zinc-200'
              : 'text-5xl font-black text-white'
          }
        >
          {formatPrice(pricePresentation.buy_price_amount, item.currency_code)}
        </p>
      </div>
    ) : null}

    {!currentRegularOffer && !currentPsPlusOffer && !showMonthlyIncluded && !showBuyPrice ? (
      <p className="text-5xl font-black text-white">
        {freeLabel || availabilityLabel || displayCurrentPriceLabel}
      </p>
    ) : null}

    {savingsLabel ? (
      <div>
        <span className="inline-flex rounded-full border border-white/20 bg-black/80 px-3 py-1 text-xs font-black text-white">
          {savingsLabel}
        </span>
      </div>
    ) : null}
  </div>

  {bestCurrentMatchesCertifiedLow ? (
    <p className="mt-5 text-sm font-bold text-emerald-300">
      Matches a certified low
    </p>
  ) : null}

  {dealEndsAt ? (
    <p className="mt-4 text-sm font-semibold text-red-200">
      Deal ends {dealEndsAt}
    </p>
  ) : null}
</div>

            <section className="mt-6 space-y-3" aria-labelledby="price-history-heading">
              <div>
                <h2 id="price-history-heading" className="text-lg font-black text-white">
                  Price lows
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Preserved historical observations are shown separately from cycle-certified lows.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Historical lowest regular price
                  </p>
                  <p className="mt-2 text-2xl font-bold text-zinc-100">
                    {regularLowPresentation.historical_amount === null
                      ? '—'
                      : historicalRegularPriceLabel}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">Preserved legacy observation</p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Historical lowest PS+ price
                  </p>
                  <p className="mt-2 text-2xl font-bold text-zinc-100">
                    {psPlusLowPresentation.historical_amount === null
                      ? '—'
                      : historicalPsPlusPriceLabel}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">Preserved legacy observation</p>
                </div>

                <div className="rounded-2xl border border-emerald-300/20 bg-zinc-900 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Lowest certified regular price
                  </p>
                  <p className="mt-2 text-2xl font-bold text-emerald-300">
                    {regularLowPresentation.certified_amount === null
                      ? '—'
                      : lowestRegularPriceLabel}
                  </p>
                  {regularLowPresentation.values_match ? (
                    <p className="mt-1 text-xs text-zinc-500">Matches the historical low</p>
                  ) : item.lobodeals_lowest_regular_price_first_seen_at ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      First certified{' '}
                      {formatDate(item.lobodeals_lowest_regular_price_first_seen_at)}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-yellow-300/20 bg-zinc-900 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Lowest certified PS+ price
                  </p>
                  <p className="mt-2 text-2xl font-bold text-yellow-300">
                    {psPlusLowPresentation.certified_amount === null
                      ? '—'
                      : lowestPsPlusPriceLabel}
                  </p>
                  {psPlusLowPresentation.values_match ? (
                    <p className="mt-1 text-xs text-zinc-500">Matches the historical low</p>
                  ) : item.lobodeals_lowest_ps_plus_price_first_seen_at ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      First certified{' '}
                      {formatDate(item.lobodeals_lowest_ps_plus_price_first_seen_at)}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="mt-6 flex flex-wrap gap-3">
  <TrackButton itemId={item.id} size="large" checkOnMount />

  {item.store_url ? (
    <a
      href={item.store_url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex rounded-xl bg-[#990303] px-6 py-4 text-base font-bold text-white transition hover:bg-red-700"
    >
      View on PlayStation
    </a>
  ) : null}
</div>
          </div>
        </section>


      </div>
    </main>
  )
}
