import { Suspense } from 'react'
import CatalogPageClient from './CatalogPageClient'

function CatalogPageFallback() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="h-12 flex-1 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900" />
            <div className="h-12 w-28 animate-pulse rounded-2xl bg-zinc-800" />
          </div>

          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`type-${index}`}
                className="h-10 w-24 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900"
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`sort-${index}`}
                className="h-10 w-32 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900"
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900"
            >
              <div className="h-32 w-full animate-pulse bg-zinc-800" />
              <div className="p-4">
                <div className="h-4 animate-pulse rounded bg-zinc-800" />
                <div className="mt-3 h-9 animate-pulse rounded bg-zinc-800" />
                <div className="mt-3 h-8 animate-pulse rounded bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<CatalogPageFallback />}>
      <CatalogPageClient />
    </Suspense>
  )
}