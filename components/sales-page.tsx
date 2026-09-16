
import type { Locale } from '@/lib/locale'
import { SalesBrowser } from '@/components/sales-browser'
import {
  projectCampaignStores,
  projectPublicCampaigns,
} from '@/lib/sales'
import { loadSalesFeed } from '@/lib/sales-source'
import { stores } from '@/lib/stores'



export default async function SalesPage({ locale = 'en' }: { locale?: Locale }) {
  const salesFeed = await loadSalesFeed()
  const publicCampaigns = projectPublicCampaigns(salesFeed.campaigns)
  const campaignStores = projectCampaignStores(stores)

  return (
    <main>
      <SalesBrowser locale={locale}
        campaigns={publicCampaigns}
        stores={campaignStores}
        availability={salesFeed.availability}
        sourceUnavailable={salesFeed.sourceUnavailable}
      />
    </main>
  )
}
