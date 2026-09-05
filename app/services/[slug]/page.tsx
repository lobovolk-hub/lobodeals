import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CampaignSections } from '@/components/campaign-sections'
import { StoreProfileHero } from '@/components/store-profile-hero'
import { getCampaignsByStore } from '@/lib/sales'
import { getSalesSelectionState } from '@/lib/sales-availability'
import { loadSalesFeed } from '@/lib/sales-source'
import { getStoreBySlug, storeProfileStaticParams } from '@/lib/stores'

type StorePageProps = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return storeProfileStaticParams
}

export async function generateMetadata({
  params,
}: StorePageProps): Promise<Metadata> {
  const { slug } = await params
  const store = getStoreBySlug(slug)

  if (!store) notFound()

  return {
    title: store.name,
    description: store.description,
    alternates: { canonical: `/services/${store.slug}` },
    openGraph: {
      title: store.name,
      description: store.description,
      url: `/services/${store.slug}`,
    },
  }
}

export default async function StoreProfilePage({ params }: StorePageProps) {
  const { slug } = await params
  const store = getStoreBySlug(slug)

  if (!store) notFound()

  const salesFeed = await loadSalesFeed()
  const campaigns = getCampaignsByStore(salesFeed.campaigns, store.slug)
  const salesState = getSalesSelectionState({
    selectedStoreSlug: store.slug,
    campaignCount: campaigns.length,
    availability: salesFeed.availability,
    sourceUnavailable: salesFeed.sourceUnavailable,
  })

  return (
    <main>
      <article>
        <StoreProfileHero store={store} />
      </article>

      {salesState === 'unavailable' ? (
        <section
          data-store-sales-state="unavailable"
          aria-live="polite"
          className="border-t border-white/10"
        >
          <p className="mx-auto my-8 w-[calc(100%-2rem)] max-w-7xl rounded-lg border border-dashed border-amber-200/15 bg-amber-100/[0.035] px-5 py-5 text-sm leading-6 text-[#c8bda7] sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
            Sales data is temporarily unavailable for this store.
          </p>
        </section>
      ) : (
        <>
          {salesState === 'content-with-availability-notice' ? (
            <aside
              aria-label="Store sales data availability"
              className="border-t border-amber-200/15 bg-amber-100/[0.035]"
            >
              <p className="mx-auto w-full max-w-7xl px-4 py-3 text-sm text-[#c8bda7] sm:px-6 lg:px-8">
                Sales data is temporarily unavailable for this store.
                Previously confirmed campaigns remain visible.
              </p>
            </aside>
          ) : null}
          <CampaignSections
            campaigns={campaigns}
            idPrefix={`store-${store.slug}`}
            analyticsSurface="store_profile"
            showStore={false}
            emptyLiveMessage="No live official store campaigns right now."
            emptyUpcomingMessage="No upcoming official store campaigns are currently announced."
          />
        </>
      )}
    </main>
  )
}
