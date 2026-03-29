import Link from 'next/link'
import RegionNotice from '@/app/components/RegionNotice'

export default function PlayStationPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Platform
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">PlayStation</h1>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
              Console data in progress
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-zinc-400">
            This platform hub is ready for the next phase of LoboDeals. We are
            preparing a more complete PlayStation price pipeline before exposing
            live console catalog data here.
          </p>
        </header>

        <div className="mb-6">
          <RegionNotice />
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <InfoCard
            title="Current status"
            value="Hub ready"
            description="This page is live and prepared for future PlayStation price ingestion."
          />
          <InfoCard
            title="What comes next"
            value="Store syncing"
            description="We will connect reliable PlayStation pricing sources before turning this into a full deal catalog."
          />
          <InfoCard
            title="Tester expectation"
            value="Transparent beta"
            description="For now, use PC, All Deals, and Catalog while console support is finalized."
          />
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-bold">What you can do right now</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            While PlayStation data is still being integrated, you can keep using
            the rest of the platform to search games, track titles, and explore
            the current deal system already working in the app.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/catalog"
              className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold text-black transition hover:opacity-90"
            >
              Search all games
            </Link>

                        <Link
              href="/pc?page=1&sort=all"
              className="rounded-2xl border border-zinc-700 px-4 py-3 text-center text-sm font-medium transition hover:bg-zinc-800"
            >
              Browse PC deals
            </Link>

            <Link
              href="/tracked"
              className="rounded-2xl border border-zinc-700 px-4 py-3 text-center text-sm font-medium transition hover:bg-zinc-800"
            >
              Open tracked
            </Link>

            <Link
              href="/pc"
              className="rounded-2xl border border-zinc-700 px-4 py-3 text-center text-sm font-medium transition hover:bg-zinc-800"
            >
              Explore PC now
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-bold">PlayStation roadmap</h2>
          <div className="mt-4 grid gap-3">
            <RoadmapRow
              title="Platform landing"
              status="Done"
              description="The hub is now part of the V2 navigation and tester flow."
            />
            <RoadmapRow
              title="Reliable pricing source"
              status="In progress"
              description="We are evaluating the best route for stable PlayStation price ingestion."
            />
            <RoadmapRow
              title="Regional pricing"
              status="Planned"
              description="Region-aware PlayStation views will come after the base data layer is stable."
            />
            <RoadmapRow
              title="Full console deal feed"
              status="Planned"
              description="Once the source is stable, this page will evolve into a real console catalog."
            />
          </div>
        </div>
      </section>
    </main>
  )
}

function InfoCard({
  title,
  value,
  description,
}: {
  title: string
  value: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{title}</p>
      <p className="mt-2 text-xl font-bold text-zinc-100">{value}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
    </div>
  )
}

function RoadmapRow({
  title,
  status,
  description,
}: {
  title: string
  status: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{title}</h3>
        <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-300">
          {status}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
    </div>
  )
}