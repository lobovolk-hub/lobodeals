export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

type ClickRow = {
  deal_id?: string | null
  title?: string | null
  sale_price?: string | null
  normal_price?: string | null
  click_type?: string | null
  created_at?: string | null
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for analytics summary')
  }

  return createClient(url, serviceRole)
}

function daysAgoIso(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const days = Math.max(1, Math.min(90, Number(searchParams.get('days') || '30')))
    const since = daysAgoIso(days)

    const supabase = getServiceSupabase()

    const { data, error } = await supabase
      .from('clicks')
      .select('deal_id, title, sale_price, normal_price, click_type, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (error) {
      throw error
    }

    const rows = Array.isArray(data) ? (data as ClickRow[]) : []

    const totals = {
      totalEvents: rows.length,
      pageViews: 0,
      cardClickHome: 0,
      cardClickPc: 0,
      openDealHome: 0,
      openDealGamePage: 0,
      openDealStoreCard: 0,
      trackAdd: 0,
      trackRemove: 0,
    }

    const byClickType = new Map<string, number>()
    const byGame = new Map<
      string,
      {
        title: string
        dealID: string
        total: number
        pageViews: number
        openDeal: number
        trackAdd: number
        cardClicks: number
      }
    >()

    for (const row of rows) {
      const clickType = String(row.click_type || '').trim()
      const title = String(row.title || 'Untitled').trim()
      const dealID = String(row.deal_id || '').trim() || `unknown::${title}`

      byClickType.set(clickType, (byClickType.get(clickType) || 0) + 1)

      if (clickType === 'page_view') totals.pageViews += 1
      if (clickType === 'card_click_home') totals.cardClickHome += 1
      if (clickType === 'card_click_pc') totals.cardClickPc += 1
      if (clickType === 'open_deal_home') totals.openDealHome += 1
      if (clickType === 'open_deal_game_page') totals.openDealGamePage += 1
      if (clickType === 'open_deal_store_card') totals.openDealStoreCard += 1
      if (clickType === 'track_add') totals.trackAdd += 1
      if (clickType === 'track_remove') totals.trackRemove += 1

      const current = byGame.get(dealID) || {
        title,
        dealID,
        total: 0,
        pageViews: 0,
        openDeal: 0,
        trackAdd: 0,
        cardClicks: 0,
      }

      current.total += 1

      if (clickType === 'page_view') current.pageViews += 1
      if (
        clickType === 'open_deal_home' ||
        clickType === 'open_deal_game_page' ||
        clickType === 'open_deal_store_card'
      ) {
        current.openDeal += 1
      }
      if (clickType === 'track_add') current.trackAdd += 1
      if (clickType === 'card_click_home' || clickType === 'card_click_pc') {
        current.cardClicks += 1
      }

      byGame.set(dealID, current)
    }

    const topGames = Array.from(byGame.values())
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total
        if (b.openDeal !== a.openDeal) return b.openDeal - a.openDeal
        return b.pageViews - a.pageViews
      })
      .slice(0, 15)

    const clickTypes = Array.from(byClickType.entries())
      .map(([clickType, count]) => ({ clickType, count }))
      .sort((a, b) => b.count - a.count)

    return Response.json(
      {
        days,
        since,
        totals,
        clickTypes,
        topGames,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('analytics summary error', error)

    return Response.json(
      {
        days: 30,
        since: null,
        totals: {
          totalEvents: 0,
          pageViews: 0,
          cardClickHome: 0,
          cardClickPc: 0,
          openDealHome: 0,
          openDealGamePage: 0,
          openDealStoreCard: 0,
          trackAdd: 0,
          trackRemove: 0,
        },
        clickTypes: [],
        topGames: [],
      },
      { status: 200 }
    )
  }
}