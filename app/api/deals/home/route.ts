export const runtime = 'nodejs'

export async function GET() {
  return Response.json(
    {
      deprecated: true,
      source: 'lobodeals-2.5',
      items: [],
      message:
        'Legacy home deals feed is disabled. The homepage now reads from the local Steam-first PC layer.',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}