export const runtime = 'nodejs'

type LegacyRelatedDeal = {
  dealID: string
  gameID?: string
  title?: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
  storeID?: string
  dealRating?: string
  metacriticScore?: string
  steamUrl?: string
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const title = (searchParams.get('title') || '').trim()
    const steamAppID = (searchParams.get('steamAppID') || '').trim()
    const steamUrl = (searchParams.get('steamUrl') || '').trim()
    const steamSalePrice = (searchParams.get('steamSalePrice') || '').trim()
    const steamNormalPrice = (searchParams.get('steamNormalPrice') || '').trim()
    const steamSavings = (searchParams.get('steamSavings') || '').trim()
    const thumb = (searchParams.get('thumb') || '').trim()

    const results: LegacyRelatedDeal[] = []

    if (steamAppID) {
      results.push({
        dealID: `steam-${steamAppID}`,
        gameID: '',
        title: title || '',
        salePrice: steamSalePrice || '',
        normalPrice: steamNormalPrice || '',
        savings: steamSavings || '',
        thumb: thumb || '',
        storeID: '1',
        dealRating: '',
        metacriticScore: '',
        steamUrl: steamUrl || `https://store.steampowered.com/app/${steamAppID}/`,
      })
    }

    return Response.json(results, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load local-only game deals',
      },
      { status: 500 }
    )
  }
}