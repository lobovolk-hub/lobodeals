export const runtime = 'nodejs'

export async function GET() {
  return Response.json(
    {
      success: false,
      error: 'Legacy endpoint disabled. Public deal data must come from Steam-first Supabase layers.',
      code: 'LEGACY_ENDPOINT_DISABLED',
      endpoint: '/api/deals',
    },
    { status: 410 }
  )
}