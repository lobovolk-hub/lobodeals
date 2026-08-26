import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col items-start px-4 py-20 sm:px-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c84b4b]">
        404 · Not found
      </p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
        This page is not part of LoboDeals.
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-[#aaa8a4]">
        Browse the current official store directory or view the Sales page.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md bg-[#990303] px-5 text-sm font-bold text-white hover:bg-[#b20a0a]"
        >
          Go home
        </Link>
        <Link
          href="/sales"
          className="inline-flex min-h-11 items-center rounded-md border border-white/15 px-5 text-sm font-semibold text-white hover:border-[#990303]"
        >
          Browse Sales
        </Link>
      </div>
    </main>
  )
}
