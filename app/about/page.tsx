import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Learn how LoboDeals covers official digital store sale campaigns in the United States.',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <header className="border-b border-white/10 pb-10">
        <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-[#c84b4b]">
          <span className="h-px w-8 bg-[#990303]" aria-hidden="true" />
          About LoboDeals
        </p>
        <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
          A focused guide to official store sales.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-[#aaa8a4] sm:text-lg">
          LoboDeals shows where to look and when official digital stores have
          active or announced sale campaigns in the United States market.
        </p>
      </header>

      <section
        aria-labelledby="scope-heading"
        className="grid gap-8 py-10 lg:grid-cols-[0.7fr_1.3fr]"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71706e]">
            Product boundary
          </p>
          <h2
            id="scope-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-white"
          >
            Directory + Sales
          </h2>
        </div>
        <dl className="divide-y divide-white/10 rounded-lg border border-white/10 bg-[#171717] px-5 sm:px-7">
          <div className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <dt className="font-semibold text-white">Directory</dt>
            <dd className="leading-7 text-[#aaa8a4]">
              Find the ten official stores LoboDeals follows and the platforms
              where each store operates.
            </dd>
          </div>
          <div className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <dt className="font-semibold text-white">Sales</dt>
            <dd className="leading-7 text-[#aaa8a4]">
              See official store-wide or themed sale campaigns that are live or
              officially announced.
            </dd>
          </div>
          <div className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <dt className="font-semibold text-white">Market</dt>
            <dd className="leading-7 text-[#aaa8a4]">
              Campaign coverage is limited to the United States market for an
              international English-speaking audience.
            </dd>
          </div>
          <div className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <dt className="font-semibold text-white">Not tracked</dt>
            <dd className="leading-7 text-[#aaa8a4]">
              LoboDeals does not maintain proprietary game prices, price
              histories, individual game catalogs, accounts, or wishlists.
            </dd>
          </div>
        </dl>
      </section>

      <p className="border-t border-white/10 pt-8 text-sm font-semibold text-[#d0cdc7]">
        A LoboVolk brand
      </p>
    </main>
  )
}
