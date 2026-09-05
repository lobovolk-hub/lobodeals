import Image from 'next/image'
import Link from 'next/link'
import siteIcon from '@/app/icon.png'
import { SiteNavigation } from '@/components/site-navigation'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 border-t-2 border-t-[#990303] bg-[#101010]/95 shadow-[0_10px_30px_rgba(0,0,0,0.16)] backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="LoboDeals home"
          className="group inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-md"
        >
          <Image
            src={siteIcon}
            alt=""
            width={34}
            height={34}
            priority
            className="h-8.5 w-8.5"
          />
          <span className="text-lg font-bold tracking-[-0.025em] text-white">
            Lobo<span className="text-[#c84b4b]">Deals</span>
          </span>
        </Link>

        <SiteNavigation />
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
