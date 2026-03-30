export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for track-click api')
  }

  return createClient(url, serviceRole)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const dealID = String(body?.dealID || '').trim()
    const title = String(body?.title || '').trim()
    const salePrice = String(body?.salePrice ?? '').trim()
    const normalPrice = String(body?.normalPrice ?? '').trim()
    const clickType = String(body?.clickType || '').trim()

    if (!clickType) {
      return Response.json(
        { success: false, error: 'Missing clickType' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    const { error } = await supabase.from('clicks').insert([
      {
        deal_id: dealID || null,
        title: title || null,
        sale_price: salePrice || null,
        normal_price: normalPrice || null,
        click_type: clickType,
      },
    ])

    if (error) {
      throw error
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('api/track-click error', error)

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Could not register click',
      },
      { status: 500 }
    )
  }
}