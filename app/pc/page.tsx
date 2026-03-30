import { Suspense } from 'react'
import PcPageClient from './PcPageClient'

export default function PcPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
          <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
              Loading PC catalog...
            </div>
          </section>
        </main>
      }
    >
      <PcPageClient />
    </Suspense>
  )
}