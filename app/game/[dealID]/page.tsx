'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useParams } from 'next/navigation'

type Game = {
  dealID: string
  title: string
  thumb: string
  salePrice: string
  normalPrice: string
  dealRating: string
  savings: string
}

export default function GamePage() {
  const params = useParams()
const dealID = decodeURIComponent(params.dealID as string)

  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)

  const [userId, setUserId] = useState<string | null>(null)
  const [isInWishlist, setIsInWishlist] = useState(false)
  const [hasAlert, setHasAlert] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // obtener juego
        const res = await fetch(`/api/deals`)
        const data = await res.json()

        const found = data.find((g: Game) => g.dealID === dealID)

        if (found) {
          setGame(found)
        }

        // obtener usuario
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const currentUserId = session?.user?.id ?? null
        setUserId(currentUserId)

        if (!currentUserId) return

        // wishlist
        const { data: wishlist } = await supabase
          .from('wishlist')
          .select('deal_id')
          .eq('user_id', currentUserId)
          .eq('deal_id', dealID)

        if (wishlist && wishlist.length > 0) {
          setIsInWishlist(true)
        }

        // alerts
        const { data: alerts } = await supabase
          .from('alerts')
          .select('deal_id')
          .eq('user_id', currentUserId)
          .eq('deal_id', dealID)

        if (alerts && alerts.length > 0) {
          setHasAlert(true)
        }
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [dealID])

  if (loading) {
    return <div className="p-10 text-white">Cargando...</div>
  }

  if (!game) {
    return <div className="p-10 text-white">Juego no encontrado</div>
  }
const discount = Math.round(Number(game.savings))
const savingsAmount =
  Number(game.normalPrice) - Number(game.salePrice)

let dealLabel = ''
let dealColor = ''

if (discount >= 85) {
  dealLabel = '🔥 Oferta brutal'
  dealColor = 'text-red-400'
} else if (discount >= 70) {
  dealLabel = '💎 Muy buen precio'
  dealColor = 'text-emerald-400'
} else if (discount >= 50) {
  dealLabel = '👍 Buen descuento'
  dealColor = 'text-cyan-400'
} else {
  dealLabel = '📉 Oferta normal'
  dealColor = 'text-zinc-400'
}
  return (
    <main className="relative min-h-screen text-zinc-100">
  {/* Fondo difuminado */}
  <div className="absolute inset-0 overflow-hidden">
    <img
      src={game.thumb}
      alt={game.title}
      className="h-full w-full object-cover blur-2xl scale-110 opacity-30"
    />
    <div className="absolute inset-0 bg-zinc-950/80" />
  </div>

  {/* Contenido */}
  <section className="relative mx-auto max-w-4xl px-6 py-12">
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 backdrop-blur">
          <img
            src={game.thumb}
            alt={game.title}
            className="mb-6 h-72 w-full rounded-xl object-cover shadow-xl"
          />

          <h1 className="text-3xl font-bold">{game.title}</h1>
<p className={`mt-2 text-sm font-medium ${dealColor}`}>
  {dealLabel}
</p>
          <div className="mt-4 flex items-center gap-4">
            <span className="text-3xl font-bold text-emerald-400">
              ${game.salePrice}
            </span>
            <span className="text-lg text-zinc-400 line-through">
              ${game.normalPrice}
            </span>
          </div>
<div className="mt-4 grid gap-3 sm:grid-cols-3">
  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
    <p className="text-xs uppercase tracking-wider text-zinc-500">
      Descuento
    </p>
    <p className="mt-2 text-2xl font-bold text-emerald-300">
      -{Math.round(Number(game.savings))}%
    </p>
  </div>

  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
    <p className="text-xs uppercase tracking-wider text-zinc-500">
      Deal rating
    </p>
    <p className="mt-2 text-2xl font-bold text-cyan-300">
      {game.dealRating || 'N/A'}
    </p>
  </div>

  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
    <p className="text-xs uppercase tracking-wider text-zinc-500">
      Ahorras
    </p>
    <p className="mt-2 text-2xl font-bold text-yellow-300">
      $
      {(
        Number(game.normalPrice) - Number(game.salePrice)
      ).toFixed(2)}
    </p>
  </div>
</div>
<div className="mt-4 flex flex-wrap gap-2">
  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
    -{discount}%
  </span>

  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
    Ahorras ${savingsAmount.toFixed(2)}
  </span>

  {Number(game.dealRating) >= 9 && (
    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
      ⭐ Top deal
    </span>
  )}
</div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {/* Wishlist */}
            <button
              onClick={async () => {
                if (!userId) return

                const res = await fetch('/api/wishlist', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    dealID: game.dealID,
                    title: game.title,
                    salePrice: game.salePrice,
                    normalPrice: game.normalPrice,
                    thumb: game.thumb,
                    userId,
                  }),
                })

                const data = await res.json()

                if (data.action === 'added') setIsInWishlist(true)
                if (data.action === 'removed') setIsInWishlist(false)
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98] ${
                isInWishlist
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                  : 'border border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              {isInWishlist ? 'Quitar de deseados' : 'Agregar a deseados'}
            </button>

            {/* Alerts */}
            <button
              onClick={async () => {
                if (!userId) return

                const targetPrice = prompt('Precio objetivo?')

                if (!targetPrice) return

                const res = await fetch('/api/alerts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    dealID: game.dealID,
                    title: game.title,
                    targetPrice,
                    currentPrice: game.salePrice,
                    userId,
                  }),
                })

                const data = await res.json()

                if (data.action === 'added') setHasAlert(true)
                if (data.action === 'removed') setHasAlert(false)
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98] ${
                hasAlert
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {hasAlert ? 'Quitar alerta' : 'Crear alerta'}
            </button>

            {/* Ir a oferta */}
            <a
  href={`/api/redirect?dealID=${game.dealID}`}
  target="_blank"
  className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-black transition active:scale-[0.98] hover:opacity-90"
>
  Comprar ahora — ${game.salePrice}
</a>
          </div>
        </div>
      </section>
    </main>
  )
}