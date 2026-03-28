export const runtime = 'nodejs'

type RawgSearchResult = {
  id: number
  name: string
  slug: string
  released: string | null
  background_image: string | null
  platforms?: { platform?: { name?: string } }[]
}

type RawgDetail = {
  name: string
  description_raw?: string
  background_image?: string | null
  rating?: number
  metacritic?: number | null
  released?: string
  genres?: { name: string }[]
  platforms?: { platform?: { name?: string } }[]
}

type RawgScreenshot = {
  image: string
}

const detailCache = new Map<
  string,
  { expiresAt: number; data: unknown | null }
>()

const RAWG_TTL_MS = 1000 * 60 * 60 * 12

const TITLE_ALIASES: Record<string, string> = {
  'god of war': 'god of war (2018)',
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(
      /\b(digital|deluxe|edition|ultimate|complete|standard|bundle|collection|remastered|director'?s cut|game of the year|goty)\b/g,
      ' '
    )
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferExpectedPlatforms(storeID: string | null) {
  if (!storeID) return []

  // PC stores in tu proyecto actual
  if (['1', '3', '7', '8', '11', '13', '15', '25'].includes(storeID)) {
    return ['pc', 'linux', 'macos', 'mac', 'windows', 'steam']
  }

  return []
}

function candidatePlatformNames(candidate: RawgSearchResult) {
  return Array.isArray(candidate.platforms)
    ? candidate.platforms
        .map((p) => p.platform?.name?.toLowerCase() || '')
        .filter(Boolean)
    : []
}

function scoreCandidate(
  rawTitle: string,
  candidate: RawgSearchResult,
  expectedPlatforms: string[]
) {
  const normalizedQuery = normalizeTitle(rawTitle)
  const aliasQuery = TITLE_ALIASES[normalizedQuery] || normalizedQuery
  const normalizedCandidate = normalizeTitle(candidate.name || '')
  const platforms = candidatePlatformNames(candidate)

  let score = 0

  // Texto
  if (normalizedCandidate === aliasQuery) score += 150
  else if (normalizedCandidate === normalizedQuery) score += 100
  else if (normalizedCandidate.startsWith(aliasQuery)) score += 60
  else if (normalizedCandidate.startsWith(normalizedQuery)) score += 40
  else if (normalizedCandidate.includes(aliasQuery)) score += 30
  else if (normalizedCandidate.includes(normalizedQuery)) score += 20

  // Favorecer plataformas esperadas
  if (expectedPlatforms.length > 0) {
    const hasExpected = expectedPlatforms.some((expected) =>
      platforms.some((platform) => platform.includes(expected))
    )

    if (hasExpected) score += 45
    else score -= 40
  }

  // Penalizar casos raros web-only para títulos famosos ambiguos
  if (
    normalizedQuery === 'god of war' &&
    platforms.length > 0 &&
    platforms.every((platform) => platform.includes('web'))
  ) {
    score -= 120
  }

  // Favorecer God of War 2018 específicamente
  if (
    normalizedQuery === 'god of war' &&
    (normalizedCandidate === 'god of war 2018' ||
      normalizedCandidate === 'god of war (2018)' ||
      normalizedCandidate.includes('2018'))
  ) {
    score += 80
  }

  return score
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LoboDeals/1.0',
    },
  })

  if (!res.ok) {
    throw new Error(`RAWG request failed with ${res.status}`)
  }

  return res.json()
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawTitle = searchParams.get('title')?.trim() || ''
    const storeID = searchParams.get('storeID')?.trim() || ''
    const forceRefresh = searchParams.get('forceRefresh') === '1'

    if (!rawTitle) {
      return Response.json(null, { status: 200 })
    }

    const apiKey = process.env.RAWG_API_KEY
    if (!apiKey) {
      return Response.json(null, { status: 200 })
    }

    const cacheKey = `${rawTitle.toLowerCase()}::${storeID}`

    if (!forceRefresh) {
      const cached = detailCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        return Response.json(cached.data, { status: 200 })
      }
    }

    const normalizedTitle = normalizeTitle(rawTitle)
    const alias = TITLE_ALIASES[normalizedTitle]
    const expectedPlatforms = inferExpectedPlatforms(storeID)

    const queryVariants = Array.from(
      new Set([rawTitle, normalizedTitle, alias].filter(Boolean))
    )

    let candidates: RawgSearchResult[] = []

    for (const variant of queryVariants) {
      const searchUrl = `https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(
        variant
      )}&page_size=10`

      const searchData = await fetchJson(searchUrl)
      const results = Array.isArray(searchData?.results)
        ? (searchData.results as RawgSearchResult[])
        : []

      candidates.push(...results)
    }

    const deduped = Array.from(
      new Map(candidates.map((item) => [item.id, item])).values()
    )

    if (deduped.length === 0) {
      detailCache.set(cacheKey, {
        expiresAt: Date.now() + RAWG_TTL_MS,
        data: null,
      })
      return Response.json(null, { status: 200 })
    }

    const scored = deduped
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(rawTitle, candidate, expectedPlatforms),
      }))
      .sort((a, b) => b.score - a.score)

    const best = scored[0]?.candidate

    if (!best || scored[0].score < 40) {
      detailCache.set(cacheKey, {
        expiresAt: Date.now() + RAWG_TTL_MS,
        data: null,
      })
      return Response.json(null, { status: 200 })
    }

    const detailUrl = `https://api.rawg.io/api/games/${best.id}?key=${apiKey}`
    const detail = (await fetchJson(detailUrl)) as RawgDetail

    let screenshots: string[] = []
    try {
      const screenshotsUrl = `https://api.rawg.io/api/games/${best.id}/screenshots?key=${apiKey}&page_size=6`
      const screenshotsData = await fetchJson(screenshotsUrl)
      screenshots = Array.isArray(screenshotsData?.results)
        ? (screenshotsData.results as RawgScreenshot[])
            .map((shot) => shot.image)
            .filter(Boolean)
        : []
    } catch (error) {
      console.error('RAWG screenshots error', error)
    }

    const payload = {
      name: detail.name || best.name || rawTitle,
      description: detail.description_raw || '',
      background_image: detail.background_image || best.background_image || '',
      rating: detail.rating || 0,
      metacritic: detail.metacritic ?? null,
      released: detail.released || best.released || '',
      genres: Array.isArray(detail.genres)
        ? detail.genres.map((g) => g.name).filter(Boolean)
        : [],
      platforms: Array.isArray(detail.platforms)
        ? detail.platforms
            .map((p) => p.platform?.name)
            .filter(Boolean)
        : [],
      screenshots,
    }

    detailCache.set(cacheKey, {
      expiresAt: Date.now() + RAWG_TTL_MS,
      data: payload,
    })

    return Response.json(payload, { status: 200 })
  } catch (error) {
    console.error('api/rawg error', error)
    return Response.json(null, { status: 200 })
  }
}