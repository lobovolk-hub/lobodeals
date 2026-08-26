import type { Metadata } from 'next'
import { SalesBrowser } from '@/components/sales-browser'
import { loadSalesFeed } from '@/lib/sales-source'
import { stores } from '@/lib/stores'

export const metadata: Metadata = {
  title: 'Sales',
  description:
    'Official digital store sale campaigns for the United States market.',
  alternates: { canonical: '/sales' },
}

export default async function SalesPage() {
  const salesFeed = await loadSalesFeed()

  return (
    <main>
      <header className="border-b border-white/10">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-[#c84b4b]">
            <span className="h-px w-8 bg-[#990303]" aria-hidden="true" />
            Official campaigns · United States
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
            Sales
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#aaa8a4]">
            Live and officially announced campaigns from the ten stores
            LoboDeals follows, ordered by useful campaign timing.
          </p>
        </div>
      </header>

      <SalesBrowser
        campaigns={salesFeed.campaigns}
        stores={stores}
        availability={salesFeed.availability}
        sourceUnavailable={salesFeed.sourceUnavailable}
      />
    </main>
  )
}
