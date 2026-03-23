'use client'

import { useEffect, useMemo, useState } from 'react'

type Deal = {
  dealID: string
  title: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  dealRating?: string
}

export default function Home() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'cheap' | 'biggest'>('all')
  const [visibleCount, setVisibleCount] = useState(12)
  const [wishlistMessage, setWishlistMessage] = useState('')
  const [alertMessage, setAlertMessage] = useState('')

  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const res = await fetch('/api/deals')
        const data = await res.json()
        setDeals(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error(error)
        setDeals([])
      } finally {
        setLoading(false)
      }
    }

    fetchDeals()
  }, [])

  const filteredDeals = useMemo(() => {
    let list = [...deals]

    if (search.trim()) {
      const term = search.toLowerCase()
      list = list.filter((deal) => deal.title.toLowerCase().includes(term))
    }

    if (filter === 'cheap') {
      list.sort((a, b) => Number(a.salePrice) - Number(b.salePrice))
    }

    if (filter === 'biggest') {
      list.sort((a, b) => Number(b.savings) - Number(a.savings))
    }

    return list
  }, [deals, search, filter])

  const visibleDeals = useMemo(() => {
    return filteredDeals.slice(0, visibleCount)
  }, [filteredDeals, visibleCount])

  const averagePrice = useMemo(() => {
    if (deals.length === 0) return '0.00'
    const total = deals.reduce((sum, deal) => sum + Number(deal.salePrice), 0)
    return (total / deals.length).toFixed(2)
  }, [deals])

  const bestDiscount = useMemo(() => {
    if (deals.length === 0) return 0
    return Math.max(...deals.map((deal) => Math.round(Number(deal.savings))))
  }, [deals])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 p-10 text-zinc-100">
        Cargando ofertas...
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-xl">
          <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-800 p-5">
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
              LoboDeals
            </p>
            <h1 className="mt-1 text-3xl font-bold">Ofertas reales de videojuegos</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
  Descubre descuentos reales y explora precios en tiempo real.
</p>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-3">
            <MetricCard label="Ofertas cargadas" value={String(deals.length)} />
            <MetricCard label="Precio promedio" value={`$${averagePrice}`} />
            <MetricCard label="Mejor descuento" value={`${bestDiscount}%`} />
          </div>
        </header>

        <section className="mb-6 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
          <input
            type="text"
            placeholder="Buscar una oferta..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setVisibleCount(12)
            }}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
          />

          <div className="grid grid-cols-3 gap-3">
            <FilterButton
              label="Todos"
              active={filter === 'all'}
              onClick={() => {
                setFilter('all')
                setVisibleCount(12)
              }}
            />
            <FilterButton
              label="Más baratos"
              active={filter === 'cheap'}
              onClick={() => {
                setFilter('cheap')
                setVisibleCount(12)
              }}
            />
            <FilterButton
              label="Mayor descuento"
              active={filter === 'biggest'}
              onClick={() => {
                setFilter('biggest')
                setVisibleCount(12)
              }}
            />
          </div>
        </section>
{alertMessage && (
  <div className="mb-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-300">
    {alertMessage}
  </div>
)}
        <section className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Deals disponibles</h2>
            <p className="text-sm text-zinc-400">Resultados en tiempo real.</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300">
            Mostrando: {visibleDeals.length} / {filteredDeals.length}
          </div>
        </section>

        {filteredDeals.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center text-zinc-400">
            No hay resultados.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              {visibleDeals.map((deal) => (
                <article
                  key={deal.dealID}
                  className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg transition hover:-translate-y-1"
                >
                  <img
                    src={deal.thumb}
                    alt={deal.title}
                    className="h-32 w-full object-cover"
                  />

                  <div className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
  <h3 className="line-clamp-2 text-base font-bold leading-5">
    {deal.title}
  </h3>
</div>

                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                        -{Math.round(Number(deal.savings))}%
                      </span>
                    </div>

                    <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-xs uppercase tracking-wider text-zinc-500">
                        Precio actual
                      </p>
                      <div className="mt-2 flex items-end justify-between">
                        <p className="text-3xl font-bold text-emerald-400">
                          ${deal.salePrice}
                        </p>
                        <p className="text-sm text-zinc-400 line-through">
                          ${deal.normalPrice}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2">
  <button
    onClick={async () => {
      try {
        const res = await fetch('/api/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dealID: deal.dealID,
            title: deal.title,
            salePrice: deal.salePrice,
            normalPrice: deal.normalPrice,
            thumb: deal.thumb,
          }),
        })

        const data = await res.json()

        if (data.success && data.alreadyExists) {
          setWishlistMessage(`Ya estaba en wishlist: ${deal.title}`)
        } else if (data.success) {
          setWishlistMessage(`Guardado en wishlist: ${deal.title}`)
        } else {
          setWishlistMessage(`Error wishlist: ${data.error}`)
        }

        setTimeout(() => setWishlistMessage(''), 2500)
      } catch (error) {
        setWishlistMessage('Error de conexión con wishlist')
        setTimeout(() => setWishlistMessage(''), 2500)
      }
    }}
    className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
  >
    Guardar
  </button>

  <button
    onClick={async () => {
      try {
        const targetPrice = (
          Math.max(Number(deal.salePrice) - 1, 0.5)
        ).toFixed(2)

        const res = await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dealID: deal.dealID,
            title: deal.title,
            targetPrice,
            currentPrice: deal.salePrice,
          }),
        })

        const data = await res.json()

        if (data.success) {
          setAlertMessage(`Alerta creada para ${deal.title} en $${targetPrice}`)
        } else {
          setAlertMessage(`Error alerta: ${data.error}`)
        }

        setTimeout(() => setAlertMessage(''), 2500)
      } catch (error) {
        setAlertMessage('Error de conexión con alerts')
        setTimeout(() => setAlertMessage(''), 2500)
      }
    }}
    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
  >
    Crear alerta
  </button>

  <a
    href={`https://www.cheapshark.com/redirect?dealID=${deal.dealID}`}
    target="_blank"
    rel="noopener noreferrer"
    onClick={() => {
      fetch('/api/track-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealID: deal.dealID,
          title: deal.title,
          salePrice: deal.salePrice,
          normalPrice: deal.normalPrice,
        }),
      })
    }}
    className="rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-black transition hover:opacity-90"
  >
    Ir a oferta
  </a>
</div>
                  </div>
                </article>
              ))}
            </div>

            {visibleCount < filteredDeals.length && (
              <div className="mt-8 flex justify-center">
                <button
  onClick={() => setVisibleCount((prev) => prev + 12)}
  className="rounded-full border border-zinc-700 bg-zinc-900 px-6 py-3 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
>
  Cargar más ofertas
</button>
              </div>
            )}
          </>
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

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
        active
          ? 'border-white bg-white text-black'
          : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  )
}