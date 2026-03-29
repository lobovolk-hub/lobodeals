export const runtime = 'nodejs'

export async function GET() {
  return Response.json({
    steamCatalogSize: 125899,
    updatedAt: '2026-03-29',
    source: 'manual-steamdb',
  })
}