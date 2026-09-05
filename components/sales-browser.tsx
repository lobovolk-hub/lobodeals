'use client'

import { useState } from 'react'
import { CampaignSections } from '@/components/campaign-sections'
import type { OfficialCampaign } from '@/lib/sales'
import {
  getSalesSelectionState,
  type SalesAvailability,
} from '@/lib/sales-availability'
import type { Store } from '@/lib/stores'

type SalesBrowserProps = {
  campaigns: readonly OfficialCampaign[]
  stores: readonly Store[]
  availability: readonly SalesAvailability[]
  sourceUnavailable: boolean
}

export function SalesBrowser({
  campaigns,
  stores,
  availability,
  sourceUnavailable,
}: SalesBrowserProps) {
  const [storeSlug, setStoreSlug] = useState('all')
  const visibleCampaigns =
    storeSlug === 'all'
      ? campaigns
      : campaigns.filter((campaign) => campaign.storeSlug === storeSlug)
  const selectedStoreSlug = storeSlug === 'all' ? null : storeSlug
  const selectionState = getSalesSelectionState({
    selectedStoreSlug,
    campaignCount: visibleCampaigns.length,
    availability,
    sourceUnavailable,
  })

  return (
    <>
      <header
        data-sales-header
        className="border-b border-white/10"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-10 lg:px-8">
          <div>
            <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-[#c84b4b]">
              <span className="h-px w-8 bg-[#990303]" aria-hidden="true" />
              Official campaigns
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
              Sales
            </h1>
          </div>
          <label className="w-full sm:w-72 sm:flex-none">
            <span className="sr-only">Filter by store</span>
            <select
              data-sales-store-filter
              value={storeSlug}
              onChange={(event) => setStoreSlug(event.target.value)}
              className="min-h-11 w-full rounded-md border border-white/15 bg-[#171717] px-3 text-sm font-semibold text-white outline-none focus-visible:border-[#c84b4b] focus-visible:ring-2 focus-visible:ring-[#990303]/50"
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
      </header>

      {selectionState === 'content-with-availability-notice' ? (
        <aside
          aria-label="Store sales data availability"
          className="border-b border-amber-200/15 bg-amber-100/[0.035]"
        >
          <p className="mx-auto w-full max-w-7xl px-4 py-3 text-sm text-[#c8bda7] sm:px-6 lg:px-8">
            Current source availability is temporarily unavailable for this
            store. Previously confirmed campaigns remain visible.
          </p>
        </aside>
      ) : null}

      {selectionState === 'unavailable' || selectionState === 'empty' ? (
        <section
          aria-live="polite"
          className="border-t border-white/10"
          data-sales-selection-state={selectionState}
        >
          <p className="mx-auto my-8 w-[calc(100%-2rem)] max-w-7xl rounded-lg border border-dashed border-white/15 bg-[#171717] px-5 py-5 text-sm leading-6 text-[#9b9a98] sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
            {selectionState === 'unavailable'
              ? selectedStoreSlug === null
                ? 'Sales data is temporarily unavailable.'
                : 'Sales data is temporarily unavailable for this store.'
              : 'No current or upcoming official campaigns detected.'}
          </p>
        </section>
      ) : (
        <CampaignSections
          campaigns={visibleCampaigns}
          idPrefix="sales"
          analyticsSurface="sales"
          showStore
        />
      )}
    </>
  )
}
