import { SalesBrowser } from '@/components/sales-browser'
import { createPageMetadata } from '@/lib/seo'
import {
  projectCampaignStores,
  projectPublicCampaigns,
} from '@/lib/sales'
import { loadSalesFeed } from '@/lib/sales-source'
import { stores } from '@/lib/stores'

export const metadata = createPageMetadata({
  title: 'Sales',
  description: 'Live and upcoming official digital store sale campaigns.',
  canonical: '/sales',
})

export default async function SalesPage() {
  const salesFeed = await loadSalesFeed()
  const publicCampaigns = projectPublicCampaigns(salesFeed.campaigns)
  const campaignStores = projectCampaignStores(stores)

  return (
    <main>
      <SalesBrowser
        campaigns={publicCampaigns}
        stores={campaignStores}
        availability={salesFeed.availability}
        sourceUnavailable={salesFeed.sourceUnavailable}
      />
    </main>
  )
}
