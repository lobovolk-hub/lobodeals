export const runtime = 'nodejs'

export async function GET() {
  return Response.json(
    {
      success: false,
      error: 'Legacy endpoint disabled. LoboDeals is now Steam-first only.',
      code: 'LEGACY_ENDPOINT_DISABLED',
      endpoint: '/api/rawg',
    },
    { status: 410 }
  )
}