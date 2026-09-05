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

      if (!surface || !outboundType || !storeSlug || !storeName) return

      window.dataLayer = window.dataLayer || []

      window.dataLayer.push({
        event: 'lobodeals_outbound_click',
        surface,
        outbound_type: outboundType,
        store_slug: storeSlug,
        store_name: storeName,
        link_mode: link.dataset.linkMode || 'official',
        ...(link.dataset.saleCampaignId
          ? { sale_campaign_id: link.dataset.saleCampaignId }
          : {}),
        ...(link.dataset.saleCampaignName
          ? { sale_campaign_name: link.dataset.saleCampaignName }
          : {}),
      })
    }

    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [])

  return null
}