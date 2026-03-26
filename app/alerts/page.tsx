'use client'

import { supabase } from '@/lib/supabaseClient'
import { useEffect, useState } from 'react'

type AlertItem = {
  id: string
  deal_id: string
  title: string
  target_price: string
  current_price: string
  created_at: string
  user_id: string | null
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const fetchAlerts = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const currentUserId = session?.user?.id ?? null
      setUserId(currentUserId)

      if (!currentUserId) {
        setAlerts([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setAlerts(data)
      }

      setLoading(false)
    }

    fetchAlerts()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 p-10 text-zinc-100">
        Cargando alertas...
      </div>
    )
  }

  if (!userId) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <section className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center text-zinc-400">
            Inicia sesión para ver tus alertas.
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-xl">
          <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-800 p-5">
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
              Alerts
            </p>
            <h1 className="mt-1 text-3xl font-bold">Tus alertas de precio</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Revisa los juegos que estás monitoreando y el precio objetivo que
              definiste.
            </p>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-3">
            <MetricCard label="Alertas guardadas" value={String(alerts.length)} />
            <MetricCard
              label="Precio objetivo promedio"
              value={
                alerts.length > 0
                  ? `$${(
                      alerts.reduce(
                        (sum, alert) => sum + Number(alert.target_price),
                        0
                      ) / alerts.length
                    ).toFixed(2)}`
                  : '$0.00'
              }
            />
            <MetricCard
              label="Última alerta"
              value={alerts[0]?.title || 'Sin datos'}
            />
          </div>
        </header>

        {alerts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center text-zinc-400">
            No tienes alertas guardadas.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map((alert) => (
              <article
                key={alert.id}
                className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-lg"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="line-clamp-2 text-lg font-bold">
                      {alert.title}
                    </h3>
                  </div>

                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                    Activa
                  </span>
                </div>

                <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    Precio objetivo
                  </p>
                  <p className="mt-2 text-3xl font-bold text-cyan-300">
                    ${alert.target_price}
                  </p>
                </div>

                <div className="space-y-2 text-sm text-zinc-400">
  <p>Precio actual: ${alert.current_price}</p>
  <p>Creada: {new Date(alert.created_at).toLocaleString()}</p>
</div>

<button
  onClick={async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const currentUserId = session?.user?.id

    if (!currentUserId) return

    await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dealID: alert.deal_id,
        userId: currentUserId,
      }),
    })

    setAlerts((prev) => prev.filter((item) => item.id !== alert.id))
  }}
  className="mt-4 w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition active:scale-[0.98] active:translate-y-[1px] hover:bg-red-500/20"
>
  Quitar alerta
</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  )
}