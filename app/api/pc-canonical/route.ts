export const runtime = 'nodejs'

import { resolveCanonicalPcGame } from '@/lib/server/resolveCanonicalPcGame'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const slug = (searchParams.get('slug') || '').trim()
    const titleHint = (searchParams.get('title') || '').trim()
    const steamAppIDHint = (searchParams.get('steamAppID') || '').trim()

    if (!slug) {
      return Response.json(
        { error: 'Missing slug' },
        { status: 400 }
      )
    }

    const game = await resolveCanonicalPcGame({
      slug,
      titleHint,
      steamAppIDHint,
    })

    if (!game) {
      return Response.json(
        { error: 'Canonical PC game not found' },
        { status: 404 }
      )
    }

    return Response.json(game)
  } catch (error) {
    console.error('api/pc-canonical error', error)

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to resolve canonical pc game',
      },
      { status: 500 }
    )
  }
}