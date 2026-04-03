type TrackClickPayload = {
  dealID?: string
  title?: string
  salePrice?: string | number | null
  normalPrice?: string | number | null
  clickType: string
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

function sendGaEvent(payload: TrackClickPayload) {
  if (
    !GA_MEASUREMENT_ID ||
    typeof window === 'undefined' ||
    typeof window.gtag !== 'function'
  ) {
    return
  }

  window.gtag('event', payload.clickType, {
    event_category: 'engagement',
    event_label: payload.title || payload.dealID || 'unknown',
    deal_id: payload.dealID || '',
    game_title: payload.title || '',
    sale_price: payload.salePrice ?? '',
    normal_price: payload.normalPrice ?? '',
  })
}

export async function trackClick(payload: TrackClickPayload) {
  try {
    sendGaEvent(payload)

    await fetch('/api/track-click', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dealID: payload.dealID || '',
        title: payload.title || '',
        salePrice: payload.salePrice ?? '',
        normalPrice: payload.normalPrice ?? '',
        clickType: payload.clickType,
      }),
    })
  } catch (error) {
    console.error('trackClick client error', error)
  }
}