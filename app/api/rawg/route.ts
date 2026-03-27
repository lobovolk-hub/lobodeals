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

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[:\-–—]/g, ' ')
    .replace(/\b(edition|collection|bundle|complete|ultimate|definitive|goty|game of the year)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreCandidate(inputTitle: string, candidateName: string) {
  const inputRaw = inputTitle.trim().toLowerCase()
  const candidateRaw = candidateName.trim().toLowerCase()

  const inputNorm = normalizeTitle(inputTitle)
  const candidateNorm = normalizeTitle(candidateName)

  if (candidateRaw === inputRaw) return 100
  if (candidateNorm === inputNorm) return 95
  if (candidateRaw.startsWith(inputRaw)) return 85
  if (candidateNorm.startsWith(inputNorm)) return 80
  if (candidateRaw.includes(inputRaw)) return 70
  if (candidateNorm.includes(inputNorm)) return 65
  if (inputNorm.includes(candidateNorm)) return 55

  const inputWords = new Set(inputNorm.split(' ').filter(Boolean))
  const candidateWords = new Set(candidateNorm.split(' ').filter(Boolean))

  let overlap = 0
  for (const word of inputWords) {
    if (candidateWords.has(word)) overlap += 1
  }

  if (overlap === 0) return 0

  const ratio = overlap / Math.max(inputWords.size, candidateWords.size)
  return Math.round(ratio * 50)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const title = searchParams.get('title')
    const dealID = searchParams.get('dealID')
    const forceRefresh = searchParams.get('forceRefresh') === '1'

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

    if (!forceRefresh) {
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
    }

    const searchUrl = `https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(title)}&page_size=10`

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

    const rankedResults = (searchData.results as RawgSearchGame[])
      .map((game) => ({
        game,
        score: scoreCandidate(title, game.name),
      }))
      .sort((a, b) => b.score - a.score)

    const bestMatch = rankedResults[0]

    if (!bestMatch || bestMatch.score < 25) {
      return Response.json({ error: 'No strong RAWG match found' }, { status: 404 })
    }

    const game = bestMatch.game

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