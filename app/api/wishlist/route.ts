import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const { data: existingRows, error: existingError } = await supabase
      .from('wishlist')
      .select('id')
      .eq('deal_id', body.dealID)

    if (existingError) {
      return Response.json(
        { success: false, error: existingError.message },
        { status: 500 }
      )
    }

    if (existingRows && existingRows.length > 0) {
      return Response.json({
        success: true,
        alreadyExists: true,
      })
    }

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

    return Response.json({
      success: true,
      alreadyExists: false,
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error interno wishlist',
      },
      { status: 500 }
    )
  }
}