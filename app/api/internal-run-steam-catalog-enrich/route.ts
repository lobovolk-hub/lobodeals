export const runtime = 'nodejs'

function isAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const token = process.env.INTERNAL_REFRESH_TOKEN || ''

  if (!token) {
    throw new Error('Missing INTERNAL_REFRESH_TOKEN')
  }

  return authHeader === `Bearer ${token}`
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))

    const requestedIterations = Number(body?.iterations || 10)
    const requestedBatchSize = Number(body?.batchSize || 50)

    const iterations = Math.max(1, Math.min(100, requestedIterations))
    const batchSize = Math.max(1, Math.min(100, requestedBatchSize))

    const origin = new URL(request.url).origin
    const authHeader = request.headers.get('authorization') || ''

    const runs: Array<{
      iteration: number
      ok: boolean
      processed?: number
      updated?: number
      screenshotsInserted?: number
      note?: string
      error?: string
    }> = []

    let totalProcessed = 0
    let totalUpdated = 0
    let totalScreenshotsInserted = 0

    for (let i = 0; i < iterations; i += 1) {
      const res = await fetch(`${origin}/api/internal-enrich-steam-appdetails`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchSize }),
        cache: 'no-store',
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data?.ok) {
        runs.push({
          iteration: i + 1,
          ok: false,
          error: data?.error || `Batch failed with status ${res.status}`,
        })

        break
      }

      runs.push({
        iteration: i + 1,
        ok: true,
        processed: Number(data?.processed || 0),
        updated: Number(data?.updated || 0),
        screenshotsInserted: Number(data?.screenshotsInserted || 0),
        note: data?.note || '',
      })

      totalProcessed += Number(data?.processed || 0)
      totalUpdated += Number(data?.updated || 0)
      totalScreenshotsInserted += Number(data?.screenshotsInserted || 0)

      if (Number(data?.processed || 0) === 0) {
        break
      }
    }

    return Response.json({
      ok: true,
      iterationsRequested: iterations,
      batchSize,
      totalProcessed,
      totalUpdated,
      totalScreenshotsInserted,
      runs,
    })
  } catch (error) {
    console.error('internal-run-steam-catalog-enrich error', error)

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown internal run steam catalog enrich error',
      },
      { status: 500 }
    )
  }
}