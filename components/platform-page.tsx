import { CampaignSections } from '@/components/campaign-sections'
import { StoreCard } from '@/components/store-card'
import { getCampaignsByPlatform } from '@/lib/sales'
import { isSalesUnavailableForStores } from '@/lib/sales-availability'
import { loadSalesFeed } from '@/lib/sales-source'
import { getStoresByPlatform, type Platform } from '@/lib/stores'

type PlatformPageProps = {
  platform: Platform
  name: string
}

export async function PlatformPage({ platform, name }: PlatformPageProps) {
  const platformStores = getStoresByPlatform(platform)
  const salesFeed = await loadSalesFeed()
  const campaigns = getCampaignsByPlatform(
    salesFeed.campaigns,
    platform
  )

  return (
    <main>
      <header className="border-b border-white/10">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-8">
          <div>
            <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-[#c84b4b]">
              <span className="h-px w-8 bg-[#990303]" aria-hidden="true" />
              Platform sales · United States
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
              {name}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#aaa8a4]">
              Official stores for {name}, followed by their live and announced
              sale campaigns.
            </p>
          </div>
          <div className="border-l-2 border-[#990303] pl-4">
            <p className="text-3xl font-semibold tabular-nums text-white">
              {platformStores.length}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-[#71706e]">
              {platformStores.length === 1 ? 'official store' : 'official stores'}
            </p>
          </div>
        </div>
      </header>

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
        <div
          className={`mt-5 grid auto-rows-fr gap-3 sm:grid-cols-2 ${
            platform === 'pc' ? 'lg:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-3'
          }`}
        >
          {platformStores.map((store) => (
            <StoreCard key={store.slug} store={store} />
          ))}
        </div>
      </section>

      <CampaignSections
        campaigns={campaigns}
        idPrefix={`${platform}-campaigns`}
        showStore
        dataUnavailable={isSalesUnavailableForStores(
          salesFeed.availability,
          platformStores.map((store) => store.slug),
          salesFeed.sourceUnavailable
        )}
      />
    </main>
  )
}
