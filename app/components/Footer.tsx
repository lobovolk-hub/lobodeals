import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-base font-bold">LoboDeals</div>
          <div className="mt-1 text-xs uppercase tracking-[0.25em] text-zinc-500">
            by LoboVolk
          </div>
          <p className="mt-3 max-w-md text-sm text-zinc-400">
            Find the best video game deals, track prices, and build your
            wishlist with LoboDeals.
          </p>
        </div>

        <div className="flex flex-col gap-4 text-sm text-zinc-400 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <Link href="/" className="transition hover:text-zinc-200">
            Home
          </Link>
          <Link href="/games?page=1" className="transition hover:text-zinc-200">
            All Games
          </Link>
          <Link href="/wishlist" className="transition hover:text-zinc-200">
            Wishlist
          </Link>
          <Link href="/alerts" className="transition hover:text-zinc-200">
            Alerts
          </Link>
          <Link href="/login" className="transition hover:text-zinc-200">
            Login
          </Link>
        </div>
      </div>

      <div className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-zinc-500 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p>© 2026 LoboDeals by LoboVolk. All rights reserved.</p>
          <p>Game data and images may belong to their respective owners.</p>
        </div>
      </div>
    </footer>
  )
}