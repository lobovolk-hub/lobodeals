import type { Metadata } from 'next'
import { SalesBrowser } from '@/components/sales-browser'
import { loadSalesFeed } from '@/lib/sales-source'
import { stores } from '@/lib/stores'

export const metadata: Metadata = {
  title: 'Sales',
  description: 'Live and upcoming official digital store sale campaigns.',
  alternates: { canonical: '/sales' },
}

export default async function SalesPage() {
  const salesFeed = await loadSalesFeed()

  return (
    <main>
      <SalesBrowser
        campaigns={salesFeed.campaigns}
        stores={stores}
        availability={salesFeed.availability}
        sourceUnavailable={salesFeed.sourceUnavailable}
      />
    </main>
  )
}
