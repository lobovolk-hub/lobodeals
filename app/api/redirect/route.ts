import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const dealID = searchParams.get('dealID')
    const title = searchParams.get('title')
    const salePrice = searchParams.get('salePrice')
    const normalPrice = searchParams.get('normalPrice')

    if (!dealID) {
      return Response.json({ error: 'Missing dealID' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('affiliate_links')
      .select('affiliate_url')
      .eq('deal_id', dealID)
      .limit(1)

    const hasAffiliate = !error && data && data.length > 0 && data[0].affiliate_url
    const destinationUrl = hasAffiliate
      ? data[0].affiliate_url
      : `https://www.cheapshark.com/redirect?dealID=${dealID}`

    await supabase.from('clicks').insert([
      {
        deal_id: dealID,
        title: title || 'Sin título',
        sale_price: salePrice || '0',
        normal_price: normalPrice || '0',
        click_type: hasAffiliate ? 'affiliate' : 'fallback',
      },
    ])

    return Response.redirect(destinationUrl)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Redirect error',
      },
      { status: 500 }
    )
  }
}