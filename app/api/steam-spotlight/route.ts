export const runtime = 'nodejs'

export async function GET() {
  return Response.json(
    {
      success: false,
      error: 'Legacy endpoint disabled. Spotlight content must come from the current Steam-first public storefront layers.',
      code: 'LEGACY_ENDPOINT_DISABLED',
      endpoint: '/api/steam-spotlight',
    },
    { status: 410 }
  )
}