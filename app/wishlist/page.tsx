'use client'

import { supabase } from '@/lib/supabaseClient'
import { useEffect, useState } from 'react'

type WishlistItem = {
  id: string
  deal_id: string
  title: string
  sale_price: string
  normal_price: string
  thumb: string
  created_at: string
}

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchWishlist = async () => {
      const { data, error } = await supabase
        .from('wishlist')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setItems(data)
      }

      setLoading(false)
    }

    fetchWishlist()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 p-10 text-zinc-100">
        Cargando wishlist...
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-6 text-4xl font-bold">Tu Wishlist</h1>

        {items.length === 0 ? (
          <p className="text-zinc-400">No tienes juegos guardados.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900"
              >
                <img
                  src={item.thumb}
                  className="h-44 w-full object-cover"
                />

                <div className="p-4">
                  <h3 className="font-bold">{item.title}</h3>

                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xl font-bold text-emerald-400">
                      ${item.sale_price}
                    </p>
                    <p className="text-sm text-zinc-400 line-through">
                      ${item.normal_price}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}