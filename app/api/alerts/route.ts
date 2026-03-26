import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const userId = body.userId

    if (!userId) {
      return Response.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      )
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('alerts')
      .select('id')
      .eq('deal_id', body.dealID)
      .eq('user_id', userId)

    if (existingError) {
      return Response.json(
        { success: false, error: existingError.message },
        { status: 500 }
      )
    }

    if (existingRows && existingRows.length > 0) {
      const { error: deleteError } = await supabase
        .from('alerts')
        .delete()
        .eq('deal_id', body.dealID)
        .eq('user_id', userId)

      if (deleteError) {
        return Response.json(
          { success: false, error: deleteError.message },
          { status: 500 }
        )
      }

      return Response.json({
        success: true,
        action: 'removed',
      })
    }

    const { error } = await supabase.from('alerts').insert([
      {
        deal_id: body.dealID,
        title: body.title,
        target_price: body.targetPrice,
        current_price: body.currentPrice,
        user_id: userId,
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
      action: 'added',
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error interno alerts',
      },
      { status: 500 }
    )
  }
}