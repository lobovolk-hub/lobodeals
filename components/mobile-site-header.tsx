'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

type MobileSiteHeaderProps = {
  isLoggedIn: boolean
}

const menuLinks = [
  { href: '/', label: 'Home' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/deals', label: 'Deals' },
]

export function MobileSiteHeader({ isLoggedIn }: MobileSiteHeaderProps) {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  function closeMenu() {
    setIsMenuOpen(false)
  }

  function toggleMenu() {
    setIsMenuOpen((current) => !current)
    setIsSearchOpen(false)
  }

  function toggleSearch() {
    setIsSearchOpen((current) => !current)
    setIsMenuOpen(false)
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      router.push('/catalog?tab=all&letter=ALL&sort=title')
      setIsSearchOpen(false)
      return
    }

    const params = new URLSearchParams({
      tab: 'all',
      letter: 'ALL',
      sort: 'title',
      q: trimmedQuery,
    })

    router.push(`/catalog?${params.toString()}`)
    setIsSearchOpen(false)
  }

  return (
    <div className="md:hidden">
      <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={toggleMenu}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-2xl font-bold text-white transition hover:border-zinc-600"
          aria-label="Open menu"
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? '×' : '☰'}
        </button>

        <Link
          href="/"
          onClick={() => {
            setIsMenuOpen(false)
            setIsSearchOpen(false)
          }}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="LoboDeals"
            className="h-10 w-10 shrink-0 object-contain"
          />

          <div className="min-w-0">
            <p className="truncate text-base font-black leading-none">
              LoboDeals
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-zinc-500">
              PlayStation prices and deals
            </p>
          </div>
        </Link>

        <button
          type="button"
          onClick={toggleSearch}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#990303] text-xl font-black text-white transition hover:bg-red-700"
          aria-label="Search"
          aria-expanded={isSearchOpen}
        >
          {isSearchOpen ? '×' : '⌕'}
        </button>
      </div>

      {isSearchOpen ? (
        <div className="border-t border-zinc-900 px-4 pb-4">
          <form
            onSubmit={handleSearch}
            className="flex overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              type="search"
              placeholder="Search PlayStation games..."
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-zinc-600"
              aria-label="Search PlayStation games"
            />

            <button
              type="submit"
              className="shrink-0 bg-[#990303] px-5 text-sm font-black text-white transition hover:bg-red-700"
              aria-label="Submit search"
            >
              Search
            </button>
          </form>
        </div>
      ) : null}

      {isMenuOpen ? (
        <div className="border-t border-zinc-900 px-4 pb-4">
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            <div className="grid grid-cols-1 divide-y divide-zinc-900">
              {menuLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  className="px-4 py-3 text-sm font-black text-zinc-200 transition hover:bg-zinc-900 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}

              <Link
                href="/tracked"
                onClick={closeMenu}
                className="px-4 py-3 text-sm font-black text-zinc-200 transition hover:bg-zinc-900 hover:text-white"
              >
                Tracked
              </Link>

              <Link
                href={isLoggedIn ? '/profile' : '/login'}
                onClick={closeMenu}
                className="px-4 py-3 text-sm font-black text-zinc-200 transition hover:bg-zinc-900 hover:text-white"
              >
                {isLoggedIn ? 'Profile' : 'Login'}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}