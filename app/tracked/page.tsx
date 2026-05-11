import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ItemCard, type ItemCardData } from '@/components/item-card'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata: Metadata = {
  title: 'Tracked games',
  description: 'View your tracked PlayStation games on LoboDeals.',
  robots: {
    index: false,
    follow: false,
  },
}

type TrackedRow = {
  item_id: string
  created_at: string
}

type TrackedItem = ItemCardData & {
  item_id: string
}

const baseSelect =
  'id, item_id, slug, title, image_url, platforms, content_type, item_type_label, release_date, current_price_amount, original_price_amount, discount_percent, ps_plus_price_amount, best_price_amount, best_price_type, has_deal, has_ps_plus_deal, metacritic_score'

export default async function TrackedPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/tracked')
  }

  const { data: trackedRows, error: trackedError } = await supabase
    .from('user_tracked_items')
    .select('item_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const tracked = (trackedRows || []) as TrackedRow[]
  const itemIds = tracked.map((row) => row.item_id)

  let items: TrackedItem[] = []

  if (itemIds.length > 0) {
    const { data } = await supabase
      .from('catalog_public_cache')
      .select(baseSelect)
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .in('item_id', itemIds)

    const rawItems = (data || []) as TrackedItem[]
    const itemById = new Map(rawItems.map((item) => [item.item_id, item]))

    items = itemIds
      .map((itemId) => itemById.get(itemId))
      .filter((item): item is TrackedItem => Boolean(item))
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-[1700px] px-6 py-10">
        <div className="mb-8">
          <Link
            href="/profile"
            className="text-sm font-semibold text-zinc-400 transition hover:text-white"
          >
            ← Back to profile
          </Link>
        </div>

        <section className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
  <h1 className="text-4xl font-black tracking-tight md:text-5xl">
    Tracked
  </h1>
</div>

            <div className="rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-300">
              <span className="font-semibold text-white">{items.length}</span>{' '}
              tracked
            </div>
          </div>
        </section>

        {trackedError ? (
          <div className="rounded-2xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
            We could not load your tracked games right now.
          </div>
        ) : null}

        {!trackedError && items.length === 0 ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <h2 className="text-2xl font-black tracking-tight">
              No tracked games yet
            </h2>

            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Games you mark from Home, Catalog, Deals, or an item page will
              appear here.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/catalog"
                className="rounded-xl bg-[#990303] px-6 py-4 text-sm font-black text-white transition hover:bg-red-700"
              >
                Browse catalog
              </Link>

              <Link
                href="/deals"
                className="rounded-xl border border-zinc-700 px-6 py-4 text-sm font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                Browse deals
              </Link>
            </div>
          </section>
        ) : null}

        {items.length > 0 ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                initialIsTracked
                checkTrackOnMount={false}
                reloadOnUntrack
              />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  )
}