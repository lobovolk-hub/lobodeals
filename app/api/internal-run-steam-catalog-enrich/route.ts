export const runtime = 'nodejs'

type CandidateScope = 'visible' | 'full_games'

type PromoteResponse = {
  success?: boolean
  promoted?: number
  demoted?: number
  totalGames?: number
  readyGames?: number
  visibleGames?: number
  error?: string
}

function isAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const token = process.env.INTERNAL_REFRESH_TOKEN || ''

  if (!token) {
    throw new Error('Missing INTERNAL_REFRESH_TOKEN')
  }

  return authHeader === `Bearer ${token}`
}

function normalizeScope(value: unknown): CandidateScope {
  return value === 'visible' ? 'visible' : 'full_games'
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))

    const requestedIterations = Number(body?.iterations || 10)
    const requestedBatchSize = Number(body?.batchSize || 50)
    const requestedConcurrency = Number(body?.concurrency || 2)
    const scope = normalizeScope(body?.scope)
    const promoteAfterRun =
      typeof body?.promoteAfterRun === 'boolean'
        ? body.promoteAfterRun
        : scope === 'full_games'

    const iterations = Math.max(1, Math.min(100, requestedIterations))
    const batchSize = Math.max(1, Math.min(100, requestedBatchSize))
    const concurrency = Math.max(1, Math.min(8, requestedConcurrency))

    const origin = new URL(request.url).origin
    const authHeader = request.headers.get('authorization') || ''

    const runs: Array<{
      iteration: number
      ok: boolean
      processed?: number
      enriched?: number
      screenshotsInserted?: number
      rateLimited?: number
      priceRowsUpserted?: number
      note?: string
      error?: string
      scope: CandidateScope
    }> = []

    let totalProcessed = 0
    let totalEnriched = 0
    let totalScreenshotsInserted = 0
    let totalRateLimited = 0
    let totalPriceRowsUpserted = 0

    for (let i = 0; i < iterations; i += 1) {
      const res = await fetch(`${origin}/api/internal-enrich-steam-appdetails`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batchSize,
          concurrency,
          scope,
        }),
        cache: 'no-store',
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data?.success) {
        runs.push({
          iteration: i + 1,
          ok: false,
          error: data?.error || `Batch failed with status ${res.status}`,
          scope,
        })

        break
      }

      const processed = Number(data?.processed || 0)
      const enriched = Number(data?.enriched || 0)
      const screenshotsInserted = Number(data?.screenshotsInserted || 0)
      const rateLimited = Number(data?.rateLimited || 0)
      const priceRowsUpserted = Number(data?.priceRowsUpserted || 0)

      runs.push({
        iteration: i + 1,
        ok: true,
        processed,
        enriched,
        screenshotsInserted,
        rateLimited,
        priceRowsUpserted,
        note: data?.note || '',
        scope,
      })

      totalProcessed += processed
      totalEnriched += enriched
      totalScreenshotsInserted += screenshotsInserted
      totalRateLimited += rateLimited
      totalPriceRowsUpserted += priceRowsUpserted

      if (processed === 0) {
        break
      }
    }

    let promoteResult: PromoteResponse | null = null

    if (promoteAfterRun && totalProcessed > 0 && scope === 'full_games') {
      const promoteRes = await fetch(
        `${origin}/api/internal-promote-public-ready-games`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      )

      promoteResult = (await promoteRes.json().catch(() => ({}))) as PromoteResponse

      if (!promoteRes.ok || !promoteResult?.success) {
        return Response.json(
          {
            success: false,
            error:
              promoteResult?.error ||
              `Promote step failed with status ${promoteRes.status}`,
            iterationsRequested: iterations,
            batchSize,
            concurrency,
            scope,
            totalProcessed,
            totalEnriched,
            totalScreenshotsInserted,
            totalRateLimited,
            totalPriceRowsUpserted,
            runs,
            promoteResult,
          },
          { status: 500 }
        )
      }
    }

    return Response.json({
      success: true,
      iterationsRequested: iterations,
      batchSize,
      concurrency,
      scope,
      promoteAfterRun,
      totalProcessed,
      totalEnriched,
      totalScreenshotsInserted,
      totalRateLimited,
      totalPriceRowsUpserted,
      runs,
      promoteResult,
    })
  } catch (error) {
    console.error('internal-run-steam-catalog-enrich error', error)

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown internal run steam catalog enrich error',
      },
      { status: 500 }
    )
  }
}
