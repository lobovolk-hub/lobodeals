export const runtime = 'nodejs'

export async function GET() {
  return Response.json(
    {
      success: false,
      error: 'Legacy endpoint disabled. Canonical game data must come from current PC Steam routes.',
      code: 'LEGACY_ENDPOINT_DISABLED',
      endpoint: '/api/steam-game',
    },
    { status: 410 }
  )
}