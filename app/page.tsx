import type { Metadata } from 'next'
import Link from 'next/link'
import { CampaignSections } from '@/components/campaign-sections'
import { loadOfficialCampaigns } from '@/lib/sales-source'
import { getStoresByPlatform, type Platform } from '@/lib/stores'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

const platforms = [
  {
    platform: 'playstation',
    href: '/playstation',
    name: 'PlayStation',
    description: 'Official PlayStation Store campaigns in the US market.',
  },
  {
    platform: 'pc',
    href: '/pc',
    name: 'PC',
    description: 'Official campaigns from the approved PC stores.',
  },
  {
    platform: 'nintendo',
    href: '/nintendo',
    name: 'Nintendo',
    description: 'Official Nintendo eShop campaigns in the US market.',
  },
  {
    platform: 'xbox',
    href: '/xbox',
    name: 'Xbox',
    description: 'Official Microsoft / Xbox Store campaigns in the US market.',
  },
] satisfies readonly {
  platform: Platform
  href: string
  name: string
  description: string
}[]

export default async function HomePage() {
  const campaigns = await loadOfficialCampaigns()

  return (
    <main>
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(153,3,3,0.3),transparent_34%)]" />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-[#c84b4b]">
            <span className="h-px w-8 bg-[#990303]" aria-hidden="true" />
            Official store sales · United States
          </p>
          <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
            Know where official game sales are happening.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[#b6b5b3] sm:text-lg sm:leading-8">
            LoboDeals is a focused directory of official digital stores and the
            campaigns they announce for the US market.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/sales"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#990303] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#b20a0a]"
            >
              Browse Sales <span className="ml-2" aria-hidden="true">→</span>
            </Link>
            <Link
              href="#platforms"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.06]"
            >
              Explore platforms
            </Link>
          </div>
        </div>
      </section>

      <section
        id="platforms"
        aria-labelledby="platforms-heading"
        className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-10 sm:px-6 lg:px-8"
      >
        <div className="flex flex-col gap-2 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
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
          <p className="text-sm text-[#9b9a98]">
            10 official stores · one US market scope
          </p>
        </div>

        <nav aria-label="Platform directories" className="mt-5">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {platforms.map((entry) => {
              const storeCount = getStoresByPlatform(entry.platform).length

              return (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    className="group flex h-full min-h-44 flex-col rounded-lg border border-white/10 bg-[#171717] p-5 transition-colors hover:border-[#990303] hover:bg-[#1c1c1c]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-xl font-semibold tracking-tight text-white">
                        {entry.name}
                      </h3>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-[#a09f9d]">
                        {storeCount}
                      </span>
                    </div>
                    <p className="mt-3 flex-1 text-sm leading-6 text-[#9b9a98]">
                      {entry.description}
                    </p>
                    <span className="mt-4 border-t border-white/10 pt-4 text-sm font-semibold text-white group-hover:text-[#d66b6b]">
                      View platform <span aria-hidden="true">→</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </section>

      <CampaignSections campaigns={campaigns} idPrefix="home" showStore />
    </main>
  )
}
