'use client'

import { supabase } from '@/lib/supabaseClient'
import { useEffect, useMemo, useState } from 'react'

type Click = {
  id: string
  deal_id: string
  title: string
  sale_price: string
  normal_price: string
  created_at: string
}

export default function DashboardPage() {
  const [clicks, setClicks] = useState<Click[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchClicks = async () => {
      const { data, error } = await supabase
        .from('clicks')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setClicks(data)
      }

      setLoading(false)
    }

    fetchClicks()
  }, [])

  const topGames = useMemo(() => {
    const map = new Map<
      string,
      { title: string; clicks: number; lastPrice: string }
    >()

    for (const click of clicks) {
      const existing = map.get(click.title)

      if (existing) {
        existing.clicks += 1
      } else {
        map.set(click.title, {
          title: click.title,
          clicks: 1,
          lastPrice: click.sale_price,
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => b.clicks - a.clicks)
  }, [clicks])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 p-10 text-zinc-100">
        Cargando dashboard...
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-2 text-4xl font-bold">Dashboard</h1>
        <p className="mb-8 text-zinc-400">Clics registrados en LoboDeals</p>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">Total clics</p>
            <p className="mt-2 text-3xl font-bold">{clicks.length}</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">Juegos únicos clickeados</p>
            <p className="mt-2 text-3xl font-bold">{topGames.length}</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">Juego más popular</p>
            <p className="mt-2 text-sm font-medium">
              {topGames[0]?.title || 'Sin datos'}
            </p>
          </div>
        </div>

        <div className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">Ranking de interés</h2>

          {topGames.length === 0 ? (
            <p className="text-zinc-400">Todavía no hay clics registrados.</p>
          ) : (
            <div className="space-y-3">
              {topGames.slice(0, 5).map((game, index) => (
                <div
                  key={game.title}
                  className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-bold text-black">
                      #{index + 1}
                    </div>

                    <div>
                      <p className="font-semibold">{game.title}</p>
                      <p className="text-sm text-zinc-400">
                        Último precio clickeado: ${game.lastPrice}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-bold">{game.clicks}</p>
                    <p className="text-sm text-zinc-400">clics</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {clicks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center text-zinc-400">
            No hay clics todavía.
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
            <div className="grid grid-cols-4 border-b border-zinc-800 bg-zinc-950 px-5 py-4 text-sm font-medium text-zinc-400">
              <span>Juego</span>
              <span>Precio oferta</span>
              <span>Precio normal</span>
              <span>Fecha</span>
            </div>

            {clicks.map((click) => (
              <div
                key={click.id}
                className="grid grid-cols-4 border-t border-zinc-800 px-5 py-4 text-sm"
              >
                <span>{click.title}</span>
                <span>${click.sale_price}</span>
                <span>${click.normal_price}</span>
                <span>{new Date(click.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}