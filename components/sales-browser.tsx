'use client'

import { useState } from 'react'
import { CampaignSections } from '@/components/campaign-sections'
import type { OfficialCampaign } from '@/lib/sales'
import type { Store } from '@/lib/stores'

type SalesBrowserProps = {
  campaigns: readonly OfficialCampaign[]
  stores: readonly Store[]
}

export function SalesBrowser({ campaigns, stores }: SalesBrowserProps) {
  const [storeSlug, setStoreSlug] = useState('all')
  const visibleCampaigns =
    storeSlug === 'all'
      ? campaigns
      : campaigns.filter((campaign) => campaign.storeSlug === storeSlug)

  return (
    <>
      <section
        aria-labelledby="store-filter-heading"
        className="border-b border-white/10"
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71706e]">
                Campaign view
              </p>
              <h2
                id="store-filter-heading"
                className="mt-2 text-lg font-semibold text-white"
              >
                Filter by store
              </h2>
            </div>
            <label className="grid gap-1.5 text-sm font-semibold text-[#d0cdc7]">
              <span className="sr-only">Store</span>
              <select
                value={storeSlug}
                onChange={(event) => setStoreSlug(event.target.value)}
                className="min-h-11 min-w-64 rounded-md border border-white/15 bg-[#171717] px-3 text-sm text-white outline-none focus:border-[#990303]"
              >
                <option value="all">All official stores</option>
                {stores.map((store) => (
                  <option key={store.slug} value={store.slug}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <CampaignSections
        campaigns={visibleCampaigns}
        idPrefix="sales"
        showStore
      />
    </>
  )
}
