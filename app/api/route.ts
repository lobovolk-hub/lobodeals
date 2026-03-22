import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const { error } = await supabase.from('wishlist').insert([
      {
        deal_id: body.dealID,
        title: body.title,
        sale_price: body.salePrice,
        normal_price: body.normalPrice,
        thumb: body.thumb,
      },
    ])

    if (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return Response.json({ success: true })
  } catch (error) {
    return Response.json(
      { success: false, error: 'No se pudo guardar en wishlist' },
      { status: 500 }
    )
  }
}