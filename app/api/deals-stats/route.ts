export const runtime = 'nodejs'

export async function GET() {
  return Response.json(
    {
      success: false,
      error: 'Legacy endpoint disabled. Stats must come from current Steam-first public layers.',
      code: 'LEGACY_ENDPOINT_DISABLED',
      endpoint: '/api/deals-stats',
    },
    { status: 410 }
  )
}