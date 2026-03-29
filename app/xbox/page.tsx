import Link from 'next/link'
import RegionNotice from '@/app/components/RegionNotice'

export default function XboxPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Platform
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">Xbox</h1>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
              Console data in progress
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-zinc-400">
            Xbox is part of the LoboDeals roadmap. This hub is ready so testers
            can see where the platform will live once stable Xbox pricing data is
            connected.
          </p>
        </header>

        <div className="mb-6">
          <RegionNotice />
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <InfoCard
            title="Current status"
            value="Hub ready"
            description="The Xbox section already has a defined place inside the product."
          />
          <InfoCard
            title="Data plan"
            value="Source evaluation"
            description="We are preparing a more reliable backend route before exposing live Xbox offers."
          />
          <InfoCard
            title="Tester usage"
            value="Use current core"
            description="Track games, search catalog, and explore current approved deal flows meanwhile."
          />
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-bold">What you can do right now</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Xbox deal ingestion is not live yet, but the rest of the platform is
            already useful for product testing, discovery, tracking, and general
            deal exploration.
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
          <h2 className="text-xl font-bold">Xbox roadmap</h2>
          <div className="mt-4 grid gap-3">
            <RoadmapRow
              title="Platform hub"
              status="Done"
              description="The Xbox destination now exists in the navigation and product structure."
            />
            <RoadmapRow
              title="Reliable offer source"
              status="In progress"
              description="We are evaluating the best path to surface stable Xbox store pricing."
            />
            <RoadmapRow
              title="Regional console view"
              status="Planned"
              description="Regional console support will come after base Xbox ingestion is stable."
            />
            <RoadmapRow
              title="Real Xbox catalog"
              status="Planned"
              description="This page will eventually become a live console discovery and deal page."
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