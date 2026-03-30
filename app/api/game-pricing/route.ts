export const runtime = 'nodejs'

export async function GET() {
  return Response.json(
    {
      cheapestPriceEver: null,
      cheapestPriceEverDate: null,
      source: 'deprecated-local-2.5',
      note: 'Legacy CheapShark pricing history is disabled in LoboDeals 2.5.',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}