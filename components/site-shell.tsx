import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MobileSiteHeader } from './mobile-site-header'

const primaryLinks = [
  { href: '/', label: 'Home' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/deals', label: 'Deals' },
]

function AccountLinks({ isLoggedIn }: { isLoggedIn: boolean }) {
  if (isLoggedIn) {
    return (
      <>
        <Link
          href="/tracked"
          className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-zinc-600 hover:text-white"
        >
          Tracked
        </Link>

        <Link
          href="/profile"
          className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-black transition hover:opacity-90"
        >
          Profile
        </Link>
      </>
    )
  }

  return (
    <>
      <Link
        href="/tracked"
        className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-zinc-600 hover:text-white"
      >
        Tracked
      </Link>

      <Link
        href="/login"
        className="shrink-0 whitespace-nowrap rounded-xl border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
      >
        Login
      </Link>
    </>
  )
}

export async function SiteHeader() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoggedIn = Boolean(user)

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/95 text-white backdrop-blur">
      <MobileSiteHeader isLoggedIn={isLoggedIn} />

      <div className="mx-auto hidden max-w-[1700px] items-center justify-between gap-6 px-6 py-4 md:flex">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="LoboDeals"
            className="h-10 w-10 object-contain"
          />

          <div>
            <p className="text-base font-bold leading-none">LoboDeals</p>
            <p className="mt-1 text-xs text-zinc-500">
              PlayStation prices and deals
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-6 text-sm font-semibold text-zinc-300">
          {primaryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <AccountLinks isLoggedIn={isLoggedIn} />
        </div>
      </div>
    </header>
  )
}

export async function SiteFooter() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const accountLinks = user
    ? [
        { href: '/tracked', label: 'Tracked' },
        { href: '/profile', label: 'Profile' },
      ]
    : [
        { href: '/tracked', label: 'Tracked' },
        { href: '/login', label: 'Login' },
      ]

  return (
    <footer className="border-t border-zinc-800 bg-black text-zinc-400">
      <div className="mx-auto grid max-w-[1700px] gap-8 px-6 py-8 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="LoboDeals"
              className="h-9 w-9 object-contain"
            />

            <div>
              <p className="font-bold text-white">LoboDeals</p>
              <p className="mt-1 text-xs text-zinc-500">
                PlayStation prices and deals
              </p>
            </div>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-6">
            Browse PlayStation games, bundles, add-ons, prices, deals, and price
            history in one place.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <nav>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-zinc-600">
              Browse
            </p>

            <div className="flex flex-col gap-2 text-sm font-semibold">
              {primaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="transition hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>

          <nav>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-zinc-600">
              Account
            </p>

            <div className="flex flex-col gap-2 text-sm font-semibold">
              {accountLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="transition hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </footer>
  )
}