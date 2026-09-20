
import type { Locale } from '@/lib/locale'
import { t } from '@/lib/i18n'
import { CampaignSections } from '@/components/campaign-sections'
import { PlatformHero } from '@/components/platform-hero'
import { SingleStoreSummary } from '@/components/single-store-summary'
import { StoreCard } from '@/components/store-card'
import {
  getCampaignsByPlatform,
  projectCampaignStores,
  projectPublicCampaigns,
} from '@/lib/sales'
import { getPlatformSalesState } from '@/lib/sales-availability'
import { loadSalesFeed } from '@/lib/sales-source'
import { getStoresByPlatform, type Platform } from '@/lib/stores'

type PlatformPageProps = {
  locale?: Locale
  platform: Platform
  name: string
}

export async function PlatformPage({ locale = 'en',  platform, name }: PlatformPageProps) {
  const platformStores = getStoresByPlatform(platform)
  const singleStore = platformStores.length === 1 ? platformStores[0] : null
  const salesFeed = await loadSalesFeed()
  const campaigns = getCampaignsByPlatform(
    salesFeed.campaigns,
    platform
  )
  const publicCampaigns = projectPublicCampaigns(campaigns)
  const campaignStores = projectCampaignStores(platformStores)
  const platformState = getPlatformSalesState({
    storeSlugs: platformStores.map((store) => store.slug),
    campaignCount: campaigns.length,
    availability: salesFeed.availability,
    sourceUnavailable: salesFeed.sourceUnavailable,
  })

  return (
    <main>
      {singleStore ? (
        <SingleStoreSummary locale={locale}
          platform={platform}
          name={name}
          store={singleStore}
        />
      ) : (
        <>
          <PlatformHero locale={locale}
            platform={platform}
            name={name}
            storeCount={platformStores.length}
          />

          <section
            aria-labelledby={`${platform}-stores-heading`}
            className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71706e]">
              {t(locale, "Directory")}
            </p>
            <h2
              id={`${platform}-stores-heading`}
              className="mt-2 text-2xl font-semibold tracking-tight text-white"
            >
              {t(locale, "Official Stores")}
            </h2>
            <div className="mt-5 grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
              {platformStores.map((store) => (
                <StoreCard locale={locale}
                  key={store.slug}
                  store={store}
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
              {t(locale, "Current sale campaign availability cannot be confirmed right now.")}
            </p>
          </div>
        </section>
      ) : (
        <>
          {platformState === 'content-with-availability-notice' ? (
            <aside
              aria-label={t(locale, "Platform sales data availability")}
              className="border-t border-amber-200/15 bg-amber-100/[0.035]"
            >
              <p className="mx-auto w-full max-w-7xl px-4 py-3 text-sm text-[#c8bda7] sm:px-6 lg:px-8">
                {t(locale, "Some current campaign availability cannot be refreshed right now. Previously confirmed campaigns remain visible.")}
              </p>
            </aside>
          ) : null}
          <CampaignSections locale={locale}
            campaigns={publicCampaigns}
            stores={campaignStores}
            idPrefix={`${platform}-campaigns`}
            analyticsSurface="platform"
            showStore={platformStores.length > 1}
          />
        </>
      )}
    </main>
  )
}