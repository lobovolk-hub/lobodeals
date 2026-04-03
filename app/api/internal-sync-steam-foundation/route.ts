export const runtime = 'nodejs'

export async function POST() {
  return Response.json(
    {
      success: false,
      error: 'Legacy internal endpoint disabled. Steam foundation sync is no longer part of the active runtime.',
      code: 'LEGACY_ENDPOINT_DISABLED',
      endpoint: '/api/internal-sync-steam-foundation',
    },
    { status: 410 }
  )
}