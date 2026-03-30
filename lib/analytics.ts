type TrackClickPayload = {
  dealID?: string
  title?: string
  salePrice?: string | number | null
  normalPrice?: string | number | null
  clickType: string
}

export async function trackClick(payload: TrackClickPayload) {
  try {
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