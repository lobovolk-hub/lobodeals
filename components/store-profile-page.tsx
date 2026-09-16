
import type { Locale } from '@/lib/locale'
import { t } from '@/lib/i18n'
import { localizedStoreDescription } from '@/lib/store-copy'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CampaignSections } from '@/components/campaign-sections'
import { createPageMetadata } from '@/lib/seo'
import { StoreProfileHero } from '@/components/store-profile-hero'
import {
  getCampaignsByStore,
  projectCampaignStores,
  projectPublicCampaigns,
} from '@/lib/sales'
import { getSalesSelectionState } from '@/lib/sales-availability'
import { loadSalesFeed } from '@/lib/sales-source'
import { getStoreBySlug, storeProfileStaticParams } from '@/lib/stores'

type StorePageProps = {
  locale?: Locale
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return storeProfileStaticParams
}

export async function generateMetadata({
  params,
  locale = 'en',
}: StorePageProps): Promise<Metadata> {
  const { slug } = await params
  const store = getStoreBySlug(slug)

  // The page owns the 404; invalid profiles must not inherit a Home canonical.
  if (!store || !storeProfileStaticParams.some((entry) => entry.slug === slug)) {
    return {
      title: t(locale, '404 · Not found'),
      robots: { index: false, follow: true },
      alternates: { canonical: null },
      openGraph: null,
      twitter: null,
    }
  }

  return createPageMetadata({
    locale,
    localizedDescription: true,
    title: store.name,
    description: localizedStoreDescription(locale, store),
    canonical: `/services/${store.slug}`,
  })
}

export default async function StoreProfilePage({ params, locale = 'en' }: StorePageProps) {
  const { slug } = await params
  const store = getStoreBySlug(slug)

  if (!store || !storeProfileStaticParams.some((entry) => entry.slug === slug)) notFound()

  const salesFeed = await loadSalesFeed()
  const campaigns = getCampaignsByStore(salesFeed.campaigns, store.slug)
  const publicCampaigns = projectPublicCampaigns(campaigns)
  const campaignStores = projectCampaignStores([store])
  const salesState = getSalesSelectionState({
    selectedStoreSlug: store.slug,
    campaignCount: campaigns.length,
    availability: salesFeed.availability,
    sourceUnavailable: salesFeed.sourceUnavailable,
  })

  return (
    <main>
      <article>
        <StoreProfileHero locale={locale} store={store} />
      </article>

      {salesState === 'unavailable' ? (
        <section
          data-store-sales-state="unavailable"
          aria-live="polite"
          className="border-t border-white/10"
        >
          <p className="mx-auto my-8 w-[calc(100%-2rem)] max-w-7xl rounded-lg border border-dashed border-amber-200/15 bg-amber-100/[0.035] px-5 py-5 text-sm leading-6 text-[#c8bda7] sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
            {t(locale, "Sales data is temporarily unavailable for this store.")}
          </p>
        </section>
      ) : (
        <>
          {salesState === 'content-with-availability-notice' ? (
            <aside
              aria-label={t(locale, "Store sales data availability")}
              className="border-t border-amber-200/15 bg-amber-100/[0.035]"
            >
              <p className="mx-auto w-full max-w-7xl px-4 py-3 text-sm text-[#c8bda7] sm:px-6 lg:px-8">
                {t(locale, "Sales data is temporarily unavailable for this store. Previously confirmed campaigns remain visible.")}
              </p>
            </aside>
          ) : null}
          <CampaignSections locale={locale}
            campaigns={publicCampaigns}
            stores={campaignStores}
            idPrefix={`store-${store.slug}`}
            analyticsSurface="store_profile"
            showStore={false}
            emptyLiveMessage={t(locale, "No live official store campaigns right now.")}
            emptyUpcomingMessage={t(locale, "No upcoming official store campaigns are currently announced.")}
          />
        </>
      )}
    </main>
  )
}
