'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function GamesRedirectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())

    // Por ahora Games no será un hub real cross-platform.
    // Todo converge a la experiencia Steam-first de PC.
    const href = `/pc${params.toString() ? `?${params.toString()}` : ''}`

    router.replace(href)
  }, [router, searchParams])

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            Redirecting
          </p>
          <h1 className="mt-2 text-2xl font-bold">Opening PC deals…</h1>
          <p className="mt-3 text-sm text-zinc-400">
            For now, LoboDeals is focusing on a unified Steam-first PC experience.
            This Games route temporarily redirects into PC until the broader
            multi-platform layer is ready.
          </p>
        </div>
      </section>
    </main>
  )
}