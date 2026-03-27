import Link from 'next/link'

export default function PCPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Platform</p>
          <h1 className="mt-1 text-3xl font-bold">PC Deals</h1>
          <p className="mt-2 text-zinc-400">
            Browse approved PC game deals from stores like Steam, GOG, Epic Games Store, Ubisoft Connect, EA, Fanatical, Humble Store, and Green Man Gaming.
          </p>
        </header>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-zinc-300">
            This platform hub is ready. For now, your full PC catalog continues in the main games section.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/games?page=1&sort=all"
              className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
            >
              Open full PC catalog
            </Link>

            <Link
              href="/games?page=1&sort=best"
              className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
            >
              Best PC deals
            </Link>

            <Link
              href="/games?page=1&sort=top-rated"
              className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
            >
              Top rated PC deals
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}