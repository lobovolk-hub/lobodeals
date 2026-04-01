export const runtime = 'nodejs'

function getBearerToken(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const prefix = 'Bearer '

  if (!authHeader.startsWith(prefix)) {
    return ''
  }

  return authHeader.slice(prefix.length).trim()
}

function findFirstIndex(haystack: string, needles: string[]) {
  const indexes = needles
    .map((needle) => haystack.indexOf(needle))
    .filter((index) => index >= 0)

  return indexes.length ? Math.min(...indexes) : -1
}

function extractSteamHomeSpotlightAppIds(html: string) {
  const normalizedHtml = html.replace(/\r/g, '')

  const sectionStart = findFirstIndex(normalizedHtml, [
    'Discounts & Events',
    'Discounts &amp; Events',
  ])

  if (sectionStart === -1) {
    return {
      appIds: [] as string[],
      sectionHtml: '',
      error: 'Could not find Discounts & Events section',
    }
  }

  const afterStart = normalizedHtml.slice(sectionStart)

  const sectionEndCandidates = [
    afterStart.indexOf('Browse by Category'),
    afterStart.indexOf('Browse by category'),
    afterStart.indexOf('Top Played on Steam Deck'),
    afterStart.indexOf('Recommended Based on the Games You Play'),
    afterStart.indexOf('New & Trending'),
  ].filter((value) => value >= 0)

  const sectionEnd =
    sectionEndCandidates.length > 0
      ? Math.min(...sectionEndCandidates)
      : Math.min(afterStart.length, 80000)

  const sectionHtml = afterStart.slice(0, sectionEnd)

  const relativeMatches = Array.from(
    sectionHtml.matchAll(/href="\/app\/(\d+)\/[^"]*"/g)
  )

  const absoluteMatches = Array.from(
    sectionHtml.matchAll(/href="https:\/\/store\.steampowered\.com\/app\/(\d+)\/[^"]*"/g)
  )

  const appIds = Array.from(
    new Set(
      [...relativeMatches, ...absoluteMatches]
        .map((match) => String(match[1] || '').trim())
        .filter(Boolean)
    )
  )

  return {
    appIds,
    sectionHtml,
    error: '',
  }
}

export async function GET(request: Request) {
  const expectedToken = process.env.INTERNAL_REFRESH_TOKEN

  if (!expectedToken) {
    return Response.json(
      { success: false, error: 'Missing INTERNAL_REFRESH_TOKEN on server' },
      { status: 500 }
    )
  }

  const providedToken = getBearerToken(request)

  if (!providedToken || providedToken !== expectedToken) {
    return Response.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const steamRes = await fetch('https://store.steampowered.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LoboDeals/1.0',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://store.steampowered.com/',
      },
      cache: 'no-store',
    })

    if (!steamRes.ok) {
      throw new Error(`Steam home request failed with ${steamRes.status}`)
    }

    const html = await steamRes.text()

    const { appIds, sectionHtml, error } = extractSteamHomeSpotlightAppIds(html)

    return Response.json({
      success: true,
      count: appIds.length,
      appIds,
      parserError: error || null,
      preview: sectionHtml.slice(0, 4000),
    })
  } catch (error) {
    console.error('internal-preview-steam-home-spotlight error', error)

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown Steam home spotlight preview error',
      },
      { status: 500 }
    )
  }
}