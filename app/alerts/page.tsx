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
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAlerts = async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
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

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-6 text-4xl font-bold">Tus Alertas</h1>

        {alerts.length === 0 ? (
          <p className="text-zinc-400">No tienes alertas guardadas.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"
              >
                <h3 className="text-lg font-bold">{alert.title}</h3>

                <div className="mt-4 space-y-2 text-sm text-zinc-400">
                  <p>Precio actual: ${alert.current_price}</p>
                  <p>Precio objetivo: ${alert.target_price}</p>
                  <p>
                    Creada: {new Date(alert.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}