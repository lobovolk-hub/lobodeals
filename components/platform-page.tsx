import { CampaignSections } from '@/components/campaign-sections'
import { PlatformHero } from '@/components/platform-hero'
import { SingleStoreSummary } from '@/components/single-store-summary'
import { StoreCard } from '@/components/store-card'
import { getCampaignsByPlatform } from '@/lib/sales'
import { getPlatformSalesState } from '@/lib/sales-availability'
import { loadSalesFeed } from '@/lib/sales-source'
import { getStoresByPlatform, type Platform } from '@/lib/stores'

type PlatformPageProps = {
  platform: Platform
  name: string
}

export async function PlatformPage({ platform, name }: PlatformPageProps) {
  const platformStores = getStoresByPlatform(platform)
  const singleStore = platformStores.length === 1 ? platformStores[0] : null
  const salesFeed = await loadSalesFeed()
  const campaigns = getCampaignsByPlatform(
    salesFeed.campaigns,
    platform
  )
  const platformState = getPlatformSalesState({
    storeSlugs: platformStores.map((store) => store.slug),
    campaignCount: campaigns.length,
    availability: salesFeed.availability,
    sourceUnavailable: salesFeed.sourceUnavailable,
  })

  return (
    <main>
      {singleStore ? (
        <SingleStoreSummary
          platform={platform}
          name={name}
          store={singleStore}
        />
      ) : (
        <>
          <PlatformHero
            platform={platform}
            name={name}
            storeCount={platformStores.length}
          />

          <section
            aria-labelledby={`${platform}-stores-heading`}
            className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71706e]">
              Directory
            </p>
            <h2
              id={`${platform}-stores-heading`}
              className="mt-2 text-2xl font-semibold tracking-tight text-white"
            >
              Official Stores
            </h2>
            <div className="mt-5 grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
              {platformStores.map((store, index) => (
                <StoreCard
                  key={store.slug}
                  store={store}
                  eagerLogo={index === 0}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {platformState === 'unavailable' ? (
        <section
          aria-live="polite"
          data-platform-availability-state="unavailable"
          className="border-t border-white/10"
        >
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <p className="rounded-lg border border-dashed border-white/15 bg-[#171717] px-5 py-5 text-sm leading-6 text-[#9b9a98]">
              Current sale campaign availability cannot be confirmed right now.
            </p>
          </div>
        </section>
      ) : (
        <>
          {platformState === 'content-with-availability-notice' ? (
            <aside
              aria-label="Platform sales data availability"
              className="border-t border-amber-200/15 bg-amber-100/[0.035]"
            >
              <p className="mx-auto w-full max-w-7xl px-4 py-3 text-sm text-[#c8bda7] sm:px-6 lg:px-8">
                Some current campaign availability cannot be refreshed right
                now. Previously confirmed campaigns remain visible.
              </p>
            </aside>
          ) : null}
          <CampaignSections
            campaigns={campaigns}
            idPrefix={`${platform}-campaigns`}
            analyticsSurface="platform"
            showStore={platformStores.length > 1}
          />
        </>
      )}
    </main>
  )
}