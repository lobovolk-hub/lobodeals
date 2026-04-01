export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type PcGameRow = {
  id: string
  steam_app_id: string | null
  slug: string | null
  steam_name: string | null
  canonical_title: string | null
  hero_image_url: string | null
  header_image: string | null
  capsule_image: string | null
}

type OfferRow = {
  pc_game_id: string
  sale_price: number | string | null
  normal_price: number | string | null
  discount_percent: number | string | null
  store_id: string | null
  url: string | null
  price_source: string | null
  price_last_synced_at: string | null
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for steam spotlight refresh')
  }

  return createClient(url, serviceRole)
}

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

function pickThumb(game: PcGameRow) {
  return (
    String(game.hero_image_url || '').trim() ||
    String(game.header_image || '').trim() ||
    String(game.capsule_image || '').trim()
  )
}

function pickTitle(game: PcGameRow) {
  return (
    String(game.steam_name || '').trim() ||
    String(game.canonical_title || '').trim() ||
    'Untitled'
  )
}

function pickBestOffer(offers: OfferRow[]) {
  const ordered = [...offers].sort((a, b) => {
    const aSource = a.price_source === 'steam_appdetails_us' ? 0 : 1
    const bSource = b.price_source === 'steam_appdetails_us' ? 0 : 1

    if (aSource !== bSource) {
      return aSource - bSource
    }

    const aDiscount = Number(a.discount_percent || 0)
    const bDiscount = Number(b.discount_percent || 0)

    if (bDiscount !== aDiscount) {
      return bDiscount - aDiscount
    }

    const aSale = Number(a.sale_price || 999999)
    const bSale = Number(b.sale_price || 999999)

    if (aSale !== bSale) {
      return aSale - bSale
    }

    const aSynced = a.price_last_synced_at ? Date.parse(a.price_last_synced_at) : 0
    const bSynced = b.price_last_synced_at ? Date.parse(b.price_last_synced_at) : 0

    return bSynced - aSynced
  })

  return ordered[0] || null
}

export async function POST(request: Request) {
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
    const supabase = getServiceSupabase()

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
    const { appIds, error: parserError } = extractSteamHomeSpotlightAppIds(html)

    if (parserError) {
      throw new Error(parserError)
    }

    if (!appIds.length) {
      throw new Error('Steam home spotlight parser returned zero app ids')
    }

    const { data: gamesData, error: gamesError } = await supabase
      .from('pc_games')
      .select(
        'id, steam_app_id, slug, steam_name, canonical_title, hero_image_url, header_image, capsule_image'
      )
      .in('steam_app_id', appIds)
      .eq('steam_type', 'game')
      .eq('is_catalog_ready', true)

    if (gamesError) {
      throw gamesError
    }

    const games = Array.isArray(gamesData) ? (gamesData as PcGameRow[]) : []

    if (!games.length) {
      throw new Error('No spotlight app ids could be resolved in pc_games')
    }

    const gameIds = games.map((game) => game.id)

    const { data: offersData, error: offersError } = await supabase
      .from('pc_store_offers')
      .select(
        'pc_game_id, sale_price, normal_price, discount_percent, store_id, url, price_source, price_last_synced_at'
      )
      .in('pc_game_id', gameIds)
      .eq('store_id', '1')
      .eq('region_code', 'us')
      .eq('is_available', true)

    if (offersError) {
      throw offersError
    }

    const offers = Array.isArray(offersData) ? (offersData as OfferRow[]) : []
    const offersByGameId = new Map<string, OfferRow[]>()

    for (const offer of offers) {
      const key = String(offer.pc_game_id || '').trim()
      if (!key) continue

      const current = offersByGameId.get(key) || []
      current.push(offer)
      offersByGameId.set(key, current)
    }

    const gamesByAppId = new Map<string, PcGameRow>()
    for (const game of games) {
      const appId = String(game.steam_app_id || '').trim()
      if (!appId) continue
      gamesByAppId.set(appId, game)
    }

    const rowsToInsert = []

    for (const [index, appId] of appIds.entries()) {
      const game = gamesByAppId.get(appId)
      if (!game) continue

      const slug = String(game.slug || '').trim()
      const thumb = pickThumb(game)
      const title = pickTitle(game)

      if (!slug || !thumb || !title) {
        continue
      }

      const bestOffer = pickBestOffer(offersByGameId.get(game.id) || [])

      rowsToInsert.push({
        position: index + 1,
        steam_app_id: appId,
        title,
        slug,
        thumb,
        sale_price: bestOffer?.sale_price ?? null,
        normal_price: bestOffer?.normal_price ?? null,
        discount_percent: Number(bestOffer?.discount_percent || 0),
        store_id: String(bestOffer?.store_id || '1').trim(),
        url:
          String(bestOffer?.url || '').trim() ||
          `https://store.steampowered.com/app/${appId}/`,
        updated_at: new Date().toISOString(),
      })
    }

    if (!rowsToInsert.length) {
      throw new Error('Resolved spotlight rows were empty after validation')
    }

    const { error: deleteError } = await supabase
      .from('steam_spotlight_cache')
      .delete()
      .neq('steam_app_id', '')

    if (deleteError) {
      throw deleteError
    }

    const { error: insertError } = await supabase
      .from('steam_spotlight_cache')
      .insert(rowsToInsert)

    if (insertError) {
      throw insertError
    }

    return Response.json({
      success: true,
      source: 'steam_home',
      appIdsFound: appIds,
      rowsInserted: rowsToInsert.length,
      rows: rowsToInsert,
    })
  } catch (error) {
    console.error('internal-refresh-steam-home-spotlight error', error)

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown Steam home spotlight refresh error',
      },
      { status: 500 }
    )
  }
}