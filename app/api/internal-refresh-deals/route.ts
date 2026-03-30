export const runtime = 'nodejs'

export async function POST() {
  return Response.json(
    {
      success: false,
      deprecated: true,
      source: 'lobodeals-2.5',
      message:
        'Legacy CheapShark refresh is disabled. Use the Steam catalog pipeline endpoints for 2.5.',
      nextEndpoints: [
        '/api/internal-import-steam-applist',
        '/api/internal-enrich-steam-appdetails',
        '/api/internal-sync-steam-foundation',
        '/api/internal-run-steam-catalog-enrich',
      ],
    },
    {
      status: 410,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}