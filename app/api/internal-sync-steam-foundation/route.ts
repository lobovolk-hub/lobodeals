export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import {
  getSafeDiscountPercent,
  makePcCanonicalKey,
  makePcCanonicalSlug,
  normalizeCanonicalTitle,
} from '@/lib/pcCanonical'

type SteamCacheItem = {
  steamAppID?: string
  title?: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
  storeID?: string
  platform?: string
  url?: string
}

type SyncLogRow = {
  id: string
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for steam foundation sync')
  }

  return createClient(url, serviceRole)
}

function isAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const token = process.env.INTERNAL_REFRESH_TOKEN || ''

  if (!token) {
    throw new Error('Missing INTERNAL_REFRESH_TOKEN')
  }

  return authHeader === `Bearer ${token}`
}

function toMoneyNumber(value?: string) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return 0
  return Number(amount.toFixed(2))
}

function dedupeSteamItems(items: SteamCacheItem[]) {
  const bestByApp = new Map<string, SteamCacheItem>()

  for (const item of items) {
    const steamAppID = String(item.steamAppID || '').trim()
    const title = String(item.title || '').trim()

    if (!steamAppID || !title) continue

    const current = bestByApp.get(steamAppID)

    if (!current) {
      bestByApp.set(steamAppID, item)
      continue
    }

    const currentSale = toMoneyNumber(current.salePrice)
    const nextSale = toMoneyNumber(item.salePrice)

    if (nextSale < currentSale) {
      bestByApp.set(steamAppID, item)
      continue
    }

    if (nextSale === currentSale) {
      const currentDiscount = getSafeDiscountPercent(
        current.salePrice,
        current.normalPrice,
        current.savings
      )
      const nextDiscount = getSafeDiscountPercent(
        item.salePrice,
        item.normalPrice,
        item.savings
      )

      if (nextDiscount > currentDiscount) {
        bestByApp.set(steamAppID, item)
      }
    }
  }

  return Array.from(bestByApp.values())
}

async function readSteamCache(cacheKey: string) {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('deals_cache')
    .select('payload')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (error) {
    throw error
  }

  return Array.isArray(data?.payload) ? (data.payload as SteamCacheItem[]) : []
}

async function createSyncLog(jobType: string) {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('sync_logs')
    .insert({
      job_type: jobType,
      status: 'running',
      notes: 'Steam foundation sync started',
      items_processed: 0,
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return data as SyncLogRow
}

async function finishSyncLog(
  logId: string,
  status: 'success' | 'error',
  notes: string,
  itemsProcessed: number
) {
  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('sync_logs')
    .update({
      status,
      notes,
      items_processed: itemsProcessed,
      finished_at: new Date().toISOString(),
    })
    .eq('id', logId)

  if (error) {
    throw error
  }
}

export async function POST(request: Request) {
  let logId: string | null = null

  try {
    if (!isAuthorized(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const log = await createSyncLog('steam_foundation_sync')
    logId = log.id

    const [spotlightItems, salesItems] = await Promise.all([
      readSteamCache('steam_spotlight_us'),
      readSteamCache('steam_sales_us'),
    ])

    const steamItems = dedupeSteamItems([...spotlightItems, ...salesItems]).filter(
      (item) =>
        String(item.storeID || '') === '1' &&
        !!String(item.steamAppID || '').trim() &&
        !!String(item.title || '').trim()
    )

    if (!steamItems.length) {
      await finishSyncLog(
        logId,
        'success',
        'No Steam cache items found to sync',
        0
      )

      return Response.json({
        ok: true,
        insertedGames: 0,
        insertedOffers: 0,
        note: 'No Steam cache items found to sync',
      })
    }

    const supabase = getServiceSupabase()

    const pcGamesRows = steamItems.map((item) => {
      const title = String(item.title || '').trim()
      const steamAppID = String(item.steamAppID || '').trim()

      return {
        steam_app_id: steamAppID,
        slug: makePcCanonicalSlug(title),
        canonical_title: title,
        normalized_title: normalizeCanonicalTitle(title),
        canonical_key: makePcCanonicalKey(title),
        is_free_to_play:
          toMoneyNumber(item.salePrice) === 0 &&
          toMoneyNumber(item.normalPrice) === 0,
        is_active: true,
        header_image: item.thumb || '',
        capsule_image: item.thumb || '',
        updated_at: new Date().toISOString(),
      }
    })

    const { data: upsertedGames, error: gamesError } = await supabase
      .from('pc_games')
      .upsert(pcGamesRows, {
        onConflict: 'steam_app_id',
      })
      .select('id, steam_app_id')

    if (gamesError) {
      throw gamesError
    }

    const pcGameIdBySteamApp = new Map<string, string>()

    for (const row of upsertedGames || []) {
      const steamAppID = String(row.steam_app_id || '').trim()
      const id = String(row.id || '').trim()

      if (steamAppID && id) {
        pcGameIdBySteamApp.set(steamAppID, id)
      }
    }

    const pcOffersRows = steamItems
      .map((item) => {
        const steamAppID = String(item.steamAppID || '').trim()
        const pcGameId = pcGameIdBySteamApp.get(steamAppID)

        if (!pcGameId) return null

        const salePrice = toMoneyNumber(item.salePrice)
        const normalPrice = toMoneyNumber(item.normalPrice)
        const discountPercent = getSafeDiscountPercent(
          item.salePrice,
          item.normalPrice,
          item.savings
        )

        return {
          pc_game_id: pcGameId,
          store_id: '1',
          external_offer_id: `steam-${steamAppID}`,
          sale_price: salePrice,
          normal_price: normalPrice,
          discount_percent: discountPercent,
          currency: 'USD',
          url: item.url || '',
          is_on_sale: discountPercent > 0,
          is_available: true,
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      })
      .filter(Boolean)

    const { error: offersError } = await supabase
      .from('pc_store_offers')
      .upsert(pcOffersRows, {
        onConflict: 'pc_game_id,store_id',
      })

    if (offersError) {
      throw offersError
    }

    await finishSyncLog(
      logId,
      'success',
      'Steam foundation sync completed',
      steamItems.length
    )

    return Response.json({
      ok: true,
      insertedGames: pcGamesRows.length,
      insertedOffers: pcOffersRows.length,
      sourceCounts: {
        spotlight: spotlightItems.length,
        sales: salesItems.length,
        merged: steamItems.length,
      },
    })
  } catch (error) {
    console.error('internal-sync-steam-foundation error', error)

    if (logId) {
      try {
        await finishSyncLog(
          logId,
          'error',
          error instanceof Error ? error.message : 'Unknown sync error',
          0
        )
      } catch (logError) {
        console.error('sync log update failed', logError)
      }
    }

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown steam foundation sync error',
      },
      { status: 500 }
    )
  }
}