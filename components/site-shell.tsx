import Image from 'next/image'
import Link from 'next/link'
import siteIcon from '@/app/icon.png'

const navigation = [
  { href: '/', label: 'Home' },
  { href: '/sales', label: 'Sales' },
  { href: '/playstation', label: 'PlayStation' },
  { href: '/pc', label: 'PC' },
  { href: '/nintendo', label: 'Nintendo' },
  { href: '/xbox', label: 'Xbox' },
  { href: '/about', label: 'About' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 border-t-2 border-t-[#990303] bg-[#0d0d0d]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4 md:flex-row md:items-center md:justify-between lg:px-8">
        <Link
          href="/"
          className="group inline-flex min-h-11 w-fit items-center gap-3 rounded-md"
        >
          <Image
            src={siteIcon}
            alt=""
            width={38}
            height={38}
            priority
            className="h-9.5 w-9.5"
          />
          <span className="text-lg font-bold tracking-[-0.025em] text-white">
            Lobo<span className="text-[#c42b2b]">Deals</span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="-mx-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm font-medium text-zinc-400"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-md px-2 py-2 transition-colors hover:bg-white/5 hover:text-white sm:px-3"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0d0d0d]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div>
          <p className="font-semibold text-zinc-300">LoboDeals</p>
          <p className="mt-1 text-zinc-400">A LoboVolk brand</p>
        </div>
        <Link
          href="/about"
          className="inline-flex min-h-11 w-fit items-center rounded-md font-medium text-zinc-400 transition-colors hover:text-white"
        >
          About LoboDeals
        </Link>
      </div>
    </footer>
  )
}
