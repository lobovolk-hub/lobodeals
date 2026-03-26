import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

type RawgSearchGame = {
  id: number
  name: string
  slug: string
}

type RawgDetail = {
  id: number
  name: string
  slug: string
  description_raw: string
  background_image: string
  rating: number
  metacritic: number | null
  released: string
  genres?: { name: string }[]
  platforms?: { platform: { name: string } }[]
}

type RawgScreenshot = {
  image: string
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const title = searchParams.get('title')
    const dealID = searchParams.get('dealID')

    if (!title) {
      return Response.json({ error: 'Missing title' }, { status: 400 })
    }

    if (!dealID) {
      return Response.json({ error: 'Missing dealID' }, { status: 400 })
    }

    const apiKey = process.env.RAWG_API_KEY

    if (!apiKey) {
      return Response.json({ error: 'Missing RAWG_API_KEY' }, { status: 500 })
    }

    // 1) Primero intentamos leer desde Supabase
    const { data: cachedRow, error: cacheError } = await supabase
      .from('game_metadata')
      .select('*')
      .eq('deal_id', dealID)
      .maybeSingle()

    if (!cacheError && cachedRow) {
      return Response.json({
        id: cachedRow.rawg_id,
        name: cachedRow.title,
        slug: cachedRow.slug,
        description: cachedRow.description,
        background_image: cachedRow.background_image,
        rating: cachedRow.rating,
        metacritic: cachedRow.metacritic,
        released: cachedRow.released,
        genres: cachedRow.genres || [],
        platforms: cachedRow.platforms || [],
        screenshots: cachedRow.screenshots || [],
      })
    }

    // 2) Si no existe cache, consultamos RAWG
    const searchUrl = `https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(title)}&page_size=5`

    const searchRes = await fetch(searchUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!searchRes.ok) {
      const text = await searchRes.text()
      return Response.json(
        {
          error: 'RAWG search failed',
          status: searchRes.status,
          body: text.slice(0, 500),
        },
        { status: 500 }
      )
    }

    const searchData = await searchRes.json()

    if (!searchData.results || searchData.results.length === 0) {
      return Response.json({ error: 'Game not found in RAWG' }, { status: 404 })
    }

    const normalizedTitle = title.trim().toLowerCase()

    const exactMatch =
      searchData.results.find(
        (game: RawgSearchGame) =>
          game.name?.trim().toLowerCase() === normalizedTitle
      ) || null

    const game = (exactMatch || searchData.results[0]) as RawgSearchGame

    const detailUrl = `https://api.rawg.io/api/games/${game.id}?key=${apiKey}`
    const detailRes = await fetch(detailUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!detailRes.ok) {
      const text = await detailRes.text()
      return Response.json(
        {
          error: 'RAWG detail failed',
          status: detailRes.status,
          body: text.slice(0, 500),
        },
        { status: 500 }
      )
    }

    const detailData = (await detailRes.json()) as RawgDetail

    const screenshotsUrl = `https://api.rawg.io/api/games/${game.id}/screenshots?key=${apiKey}&page_size=6`
    const screenshotsRes = await fetch(screenshotsUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    })

    let screenshots: string[] = []

    if (screenshotsRes.ok) {
      const screenshotsData = await screenshotsRes.json()
      screenshots =
        screenshotsData.results?.map((shot: RawgScreenshot) => shot.image) || []
    }

    const payload = {
      deal_id: dealID,
      rawg_id: detailData.id,
      title: detailData.name,
      slug: detailData.slug,
      description: detailData.description_raw,
      background_image: detailData.background_image,
      rating: detailData.rating,
      metacritic: detailData.metacritic,
      released: detailData.released,
      genres: detailData.genres?.map((g) => g.name) || [],
      platforms: detailData.platforms?.map((p) => p.platform.name) || [],
      screenshots,
      updated_at: new Date().toISOString(),
    }

    // 3) Guardamos en cache
    const { data: existingRow } = await supabase
      .from('game_metadata')
      .select('id')
      .eq('deal_id', dealID)
      .maybeSingle()

    if (existingRow) {
      await supabase.from('game_metadata').update(payload).eq('deal_id', dealID)
    } else {
      await supabase.from('game_metadata').insert([
        {
          ...payload,
          created_at: new Date().toISOString(),
        },
      ])
    }

    return Response.json({
      id: detailData.id,
      name: detailData.name,
      slug: detailData.slug,
      description: detailData.description_raw,
      background_image: detailData.background_image,
      rating: detailData.rating,
      metacritic: detailData.metacritic,
      released: detailData.released,
      genres: detailData.genres?.map((g) => g.name) || [],
      platforms: detailData.platforms?.map((p) => p.platform.name) || [],
      screenshots,
    })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unknown RAWG error',
      },
      { status: 500 }
    )
  }
}