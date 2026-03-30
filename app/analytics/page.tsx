'use client'

import { useEffect, useMemo, useState } from 'react'

type AnalyticsTotals = {
  totalEvents: number
  pageViews: number
  cardClickHome: number
  cardClickPc: number
  openDealHome: number
  openDealGamePage: number
  openDealStoreCard: number
  trackAdd: number
  trackRemove: number
}

type ClickTypeRow = {
  clickType: string
  count: number
}

type TopGameRow = {
  title: string
  dealID: string
  total: number
  pageViews: number
  openDeal: number
  trackAdd: number
  cardClicks: number
}

type AnalyticsSummary = {
  days: number
  since: string | null
  totals: AnalyticsTotals
  clickTypes: ClickTypeRow[]
  topGames: TopGameRow[]
}

function MetricCard({
  label,
  value,
  sublabel,
}: {
  label: string
  value: string | number
  sublabel?: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {sublabel ? <p className="mt-1 text-xs text-zinc-500">{sublabel}</p> : null}
    </div>
  )
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<AnalyticsSummary>({
    days: 30,
    since: null,
    totals: {
      totalEvents: 0,
      pageViews: 0,
      cardClickHome: 0,
      cardClickPc: 0,
      openDealHome: 0,
      openDealGamePage: 0,
      openDealStoreCard: 0,
      trackAdd: 0,
      trackRemove: 0,
    },
    clickTypes: [],
    topGames: [],
  })

  useEffect(() => {
    let cancelled = false

    const loadAnalytics = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/analytics-summary?days=${days}`)
        const data = await res.json()

        if (!cancelled) {
          setSummary(data)
        }
      } catch (error) {
        console.error(error)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadAnalytics()

    return () => {
      cancelled = true
    }
  }, [days])

  const openDealTotal = useMemo(() => {
    return (
      Number(summary.totals.openDealHome || 0) +
      Number(summary.totals.openDealGamePage || 0) +
      Number(summary.totals.openDealStoreCard || 0)
    )
  }, [summary])

  const cardClicksTotal = useMemo(() => {
    return (
      Number(summary.totals.cardClickHome || 0) +
      Number(summary.totals.cardClickPc || 0)
    )
  }, [summary])

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Analytics
          </p>
          <h1 className="mt-1 text-3xl font-bold">LoboDeals event overview</h1>
          <p className="mt-2 max-w-3xl text-zinc-400">
            Internal metrics from the current clicks table. This is the first
            useful analytics layer for page views, card clicks, deal intent, and
            tracked interactions.
          </p>
        </header>

        <div className="mb-8 flex flex-wrap gap-2">
          {[7, 30, 60, 90].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                days === value
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              Last {value} days
            </button>
          ))}
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total events"
            value={summary.totals.totalEvents}
            sublabel={`Rolling window: ${summary.days} days`}
          />
          <MetricCard
            label="Page views"
            value={summary.totals.pageViews}
            sublabel="Canonical game page views"
          />
          <MetricCard
            label="Card clicks"
            value={cardClicksTotal}
            sublabel="Home + PC browsing cards"
          />
          <MetricCard
            label="Open deal clicks"
            value={openDealTotal}
            sublabel="Steam/store intent clicks"
          />
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Track add"
            value={summary.totals.trackAdd}
            sublabel="Games added to tracked"
          />
          <MetricCard
            label="Track remove"
            value={summary.totals.trackRemove}
            sublabel="Games removed from tracked"
          />
          <MetricCard
            label="Home card clicks"
            value={summary.totals.cardClickHome}
            sublabel="Open game page from Home"
          />
          <MetricCard
            label="PC card clicks"
            value={summary.totals.cardClickPc}
            sublabel="Open game page from /pc"
          />
        </div>

        {loading ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
            Loading analytics...
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-xl font-bold text-white">Events by type</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Breakdown of the current analytics signals stored in the clicks table.
              </p>

              {summary.clickTypes.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                  No analytics events registered yet.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {summary.clickTypes.map((row) => (
                    <div
                      key={row.clickType}
                      className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">
                          {row.clickType}
                        </p>
                      </div>
                      <div className="text-lg font-bold text-emerald-300">
                        {row.count}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-xl font-bold text-white">Top games by activity</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Games that concentrate the most movement across views, clicks, and tracking.
              </p>

              {summary.topGames.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                  No game-level analytics available yet.
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800">
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-zinc-950 text-sm">
                      <thead className="bg-zinc-900 text-zinc-400">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Game</th>
                          <th className="px-4 py-3 text-left font-medium">Total</th>
                          <th className="px-4 py-3 text-left font-medium">Views</th>
                          <th className="px-4 py-3 text-left font-medium">Open deal</th>
                          <th className="px-4 py-3 text-left font-medium">Track add</th>
                          <th className="px-4 py-3 text-left font-medium">Card clicks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.topGames.map((row) => (
                          <tr key={row.dealID} className="border-t border-zinc-800">
                            <td className="px-4 py-3 text-white">{row.title}</td>
                            <td className="px-4 py-3 text-zinc-300">{row.total}</td>
                            <td className="px-4 py-3 text-zinc-300">{row.pageViews}</td>
                            <td className="px-4 py-3 text-zinc-300">{row.openDeal}</td>
                            <td className="px-4 py-3 text-zinc-300">{row.trackAdd}</td>
                            <td className="px-4 py-3 text-zinc-300">{row.cardClicks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  )
}