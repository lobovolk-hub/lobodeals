'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>
  }
}

export function OutboundAnalytics() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return

      const link = event.target.closest<HTMLAnchorElement>(
        'a[data-lobodeals-outbound="true"]'
      )

      if (!link) return

      const surface = link.dataset.analyticsSurface
      const outboundType = link.dataset.outboundType
      const storeSlug = link.dataset.storeSlug
      const storeName = link.dataset.storeName
      const saleCampaignId =
        outboundType === 'sale' ? link.dataset.saleCampaignId || null : null
      const saleCampaignName =
        outboundType === 'sale' ? link.dataset.saleCampaignName || null : null

      if (!surface || !outboundType || !storeSlug || !storeName) return
      if (outboundType === 'sale' && (!saleCampaignId || !saleCampaignName)) return

      window.dataLayer = window.dataLayer || []

      window.dataLayer.push({
        event: 'lobodeals_outbound_click',
        surface,
        outbound_type: outboundType,
        store_slug: storeSlug,
        store_name: storeName,
        link_mode: link.dataset.linkMode || 'official',
        sale_campaign_id: saleCampaignId,
        sale_campaign_name: saleCampaignName,
      })
    }

    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [])

  return null
}
