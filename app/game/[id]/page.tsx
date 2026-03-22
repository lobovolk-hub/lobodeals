'use client'

import { supabase } from '@/lib/supabaseClient'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Game = {
  id: string
  title: string
  slug: string | null
  image_url: string | null
}

const coverGradients = [
  'from-slate-700 via-slate-800 to-slate-950',
  'from-indigo-700 via-zinc-800 to-zinc-950',
  'from-emerald-700 via-zinc-800 to-zinc-950',
  'from-rose-700 via-zinc-800 to-zinc-950',
  'from-amber-700 via-zinc-800 to-zinc-950',
  'from-cyan-700 via-zinc-800 to-zinc-950',
]

export default function GamePage() {
  const params = useParams()
  const id = params.id as string

  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchGame = async () => {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', id)
        .single()

      if (!error && data) {
        setGame(data)
      }

      setLoading(false)
    }

    if (id) {
      fetchGame()
    }
  }, [id])

  const fakeData = useMemo(() => {
    if (!game) return null

    const seed = game.title.length
    const price = (59.99 - (seed % 6) * 4).toFixed(2)
    const oldPrice = (79.99 - (seed % 4) * 3).toFixed(2)
    const discount = 20 + (seed % 5) * 7
    const coverClass = coverGradients[seed % coverGradients.length]
    const store = seed % 2 === 0 ? 'Steam' : 'Epic Games'
    const target = (Number(price) - 5).toFixed(2)

    return {
      price,
      oldPrice,
      discount,
      coverClass,
      store,
      target,
    }
  }, [game])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 p-10 text-zinc-100">
        Cargando juego...
      </div>
    )
  }

  if (!game || !fakeData) {
    return (
      <div className="min-h-screen bg-zinc-950 p-10 text-zinc-100">
        Juego no encontrado
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
          >
            ← Volver al catálogo
          </Link>
        </div>

        <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-xl">
          <div className={`relative h-72 bg-gradient-to-br ${fakeData.coverClass}`}>
            <div className="absolute inset-0 bg-black/30" />

            <div className="absolute left-6 top-6 flex items-center gap-3">
              <span className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs text-zinc-200 backdrop-blur-sm">
                {fakeData.store}
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                -{fakeData.discount}%
              </span>
            </div>

            <div className="absolute bottom-6 left-6 right-6">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-300">
                Featured game
              </p>
              <h1 className="mt-3 text-4xl font-bold text-white">{game.title}</h1>
              <p className="mt-2 text-zinc-300">{game.slug}</p>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr_0.8fr]">
            <div className="space-y-6">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                <h2 className="text-xl font-semibold">Resumen</h2>
                <p className="mt-3 leading-7 text-zinc-400">
                  Esta es la vista de detalle inicial para <strong>{game.title}</strong>.
                  Aquí luego mostraremos precios reales, historial, plataformas,
                  enlaces afiliados y alertas personalizadas.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <InfoCard label="Tienda principal" value={fakeData.store} />
                <InfoCard label="Slug" value={game.slug || 'sin-slug'} />
                <InfoCard label="ID corto" value={game.id.slice(0, 8)} />
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                <h2 className="text-xl font-semibold">Próximamente en esta pantalla</h2>
                <ul className="mt-4 space-y-3 text-zinc-400">
                  <li>• Historial de precios</li>
                  <li>• Alertas por precio objetivo</li>
                  <li>• Tiendas comparadas</li>
                  <li>• Enlaces afiliados</li>
                </ul>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                  Mejor precio detectado
                </p>
                <div className="mt-3 flex items-end justify-between">
                  <p className="text-4xl font-bold">${fakeData.price}</p>
                  <p className="text-zinc-400 line-through">${fakeData.oldPrice}</p>
                </div>

                <button className="mt-5 w-full rounded-2xl bg-white px-4 py-3 font-semibold text-black transition hover:opacity-90">
                  Ir a la oferta
                </button>
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                <h3 className="font-semibold">Acciones rápidas</h3>

                <div className="mt-4 grid gap-3">
                  <button className="rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800">
                    Añadir a wishlist
                  </button>
                  <button className="rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800">
                    Crear alerta
                  </button>
                  <button className="rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800">
                    Compartir
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                <p className="text-sm text-zinc-400">Precio objetivo sugerido</p>
                <p className="mt-2 text-2xl font-bold">${fakeData.target}</p>
                <p className="mt-2 text-sm text-zinc-500">
                  Te avisaremos cuando baje de este valor.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  )
}