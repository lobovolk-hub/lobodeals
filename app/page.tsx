import type { Metadata } from 'next'
import { CampaignSections } from '@/components/campaign-sections'
import { HomeHero } from '@/components/home-hero'
import { PlatformCard } from '@/components/platform-card'
import { isSalesUnavailableForStores } from '@/lib/sales-availability'
import { loadSalesFeed } from '@/lib/sales-source'
import { stores, type Platform } from '@/lib/stores'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

const platforms = [
  'playstation',
  'pc',
  'nintendo',
  'xbox',
] as const satisfies readonly Platform[]

export default async function HomePage() {
  const salesFeed = await loadSalesFeed()

  return (
    <main>
      <HomeHero />

      <section
        id="platforms"
        aria-labelledby="platforms-heading"
        className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-10 sm:px-6 lg:px-8"
      >
        <div className="border-b border-white/10 pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71706e]">
              Directory
            </p>
            <h2
              id="platforms-heading"
              className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl"
            >
              Explore by Platform
            </h2>
          </div>
        </div>

        <nav aria-label="Platform directories" className="mt-5">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {platforms.map((platform) => (
              <li key={platform}>
                <PlatformCard platform={platform} />
              </li>
            ))}
          </ul>
        </nav>
      </section>

      <CampaignSections
        campaigns={salesFeed.campaigns}
        idPrefix="home"
        showStore
        homePreview
        dataUnavailable={isSalesUnavailableForStores(
          salesFeed.availability,
          stores.map((store) => store.slug),
          salesFeed.sourceUnavailable
        )}
      />
    </main>
  )
}
