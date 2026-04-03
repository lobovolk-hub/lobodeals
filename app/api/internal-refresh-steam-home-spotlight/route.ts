export const runtime = 'nodejs'

export async function POST() {
  return Response.json(
    {
      success: false,
      error: 'Legacy internal endpoint disabled. Steam spotlight refresh is no longer part of the active runtime.',
      code: 'LEGACY_ENDPOINT_DISABLED',
      endpoint: '/api/internal-refresh-steam-home-spotlight',
    },
    { status: 410 }
  )
}