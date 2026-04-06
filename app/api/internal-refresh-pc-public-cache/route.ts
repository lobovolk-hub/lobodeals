export const runtime = 'nodejs'

export async function POST() {
  return Response.json(
    {
      success: false,
      disabled: true,
      message:
        'internal-refresh-pc-public-cache is disabled in LoboDeals v2.5k stabilization. Do not use this route for now.',
    },
    { status: 503 }
  )
}