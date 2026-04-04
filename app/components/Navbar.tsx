'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Navbar() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [platformsOpen, setPlatformsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobilePlatformsOpen, setMobilePlatformsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      setUserEmail(session?.user?.email ?? null)
    }

    loadSession()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUserEmail(session?.user?.email ?? null)
      }
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setPlatformsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
    setMobilePlatformsOpen(false)
  }

  return (
    <nav className="sticky top-0 z-[100] border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="group flex min-w-0 items-center gap-3 rounded-2xl transition hover:bg-zinc-900/80"
            onClick={closeMobileMenu}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-lg shadow-red-950/20">
              <img
                src="/lobodeals-logo.png"
                alt="LoboDeals logo"
                className="h-10 w-10 object-contain"
              />
            </div>

            <div className="min-w-0 leading-tight">
              <div className="truncate text-lg font-bold text-white transition group-hover:text-red-300">
                LoboDeals
              </div>
              <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                by LoboVolk
              </div>
            </div>
          </Link>

          <div className="hidden items-center gap-2 text-sm md:flex">
            <Link
              href="/"
              className="rounded-xl px-3 py-2 text-zinc-200 transition hover:bg-zinc-800"
            >
              Home
            </Link>

            <Link
              href="/pc?page=1&sort=all"
              className="rounded-xl px-3 py-2 text-zinc-200 transition hover:bg-zinc-800"
            >
              PC
            </Link>

            <Link
              href="/catalog"
              className="rounded-xl px-3 py-2 text-zinc-200 transition hover:bg-zinc-800"
            >
              Catalog
            </Link>

            <div className="relative z-[120]" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setPlatformsOpen((prev) => !prev)}
                className="rounded-xl px-3 py-2 text-zinc-200 transition hover:bg-zinc-800"
              >
                Explore ▾
              </button>

              {platformsOpen && (
                <div className="absolute right-0 top-full z-[130] mt-2 w-64 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl ring-1 ring-black/30">
                  <Link
                    href="/pc?page=1&sort=all"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm text-zinc-100 transition hover:bg-zinc-900"
                  >
                    PC
                  </Link>

                  <Link
                    href="/pc?page=1&sort=best"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm text-zinc-100 transition hover:bg-zinc-900"
                  >
                    Best Deals
                  </Link>

                  <Link
                    href="/pc?page=1&sort=latest-discounts"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm text-zinc-100 transition hover:bg-zinc-900"
                  >
                    Latest Discounts
                  </Link>

                  <Link
                    href="/pc?page=1&sort=latest"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm text-zinc-100 transition hover:bg-zinc-900"
                  >
                    Latest Releases
                  </Link>

                  <Link
                    href="/pc?page=1&sort=biggest-discount"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm text-zinc-100 transition hover:bg-zinc-900"
                  >
                    Biggest Discounts
                  </Link>

                  <Link
                    href="/pc?page=1&sort=top-rated"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm text-zinc-100 transition hover:bg-zinc-900"
                  >
                    Top Rated
                  </Link>

                  <div className="border-t border-zinc-800 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                    Next platform
                  </div>

                  <Link
                    href="/playstation"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm text-zinc-400 transition hover:bg-zinc-900"
                  >
                    PlayStation
                  </Link>
                </div>
              )}
            </div>

            <Link
              href="/tracked"
              className="rounded-xl px-3 py-2 text-zinc-200 transition hover:bg-zinc-800"
            >
              Tracked
            </Link>

            {userEmail ? (
              <>
                <Link
                  href="/profile"
                  className="rounded-xl px-3 py-2 text-zinc-200 transition hover:bg-zinc-800"
                >
                  Profile
                </Link>

                <button
                  onClick={async () => {
                    await supabase.auth.signOut()
                  }}
                  className="rounded-xl border border-zinc-700 px-3 py-2 text-zinc-200 transition hover:bg-zinc-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-xl border border-zinc-700 px-3 py-2 text-zinc-200 transition hover:bg-zinc-800"
              >
                Login
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 md:hidden"
          >
            Menu
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 md:hidden">
            <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-black">
                  <img
                    src="/lobodeals-logo.png"
                    alt="LoboDeals logo"
                    className="h-9 w-9 object-contain"
                  />
                </div>

                <div>
                  <div className="text-sm font-bold text-white">LoboDeals</div>
                  <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                    by LoboVolk
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-2 text-sm">
              <Link
                href="/"
                onClick={closeMobileMenu}
                className="rounded-xl px-3 py-3 text-zinc-100 transition hover:bg-zinc-800"
              >
                Home
              </Link>

              <Link
                href="/pc?page=1&sort=all"
                onClick={closeMobileMenu}
                className="rounded-xl px-3 py-3 text-zinc-100 transition hover:bg-zinc-800"
              >
                PC
              </Link>

              <Link
                href="/catalog"
                onClick={closeMobileMenu}
                className="rounded-xl px-3 py-3 text-zinc-100 transition hover:bg-zinc-800"
              >
                Catalog
              </Link>

              <Link
                href="/tracked"
                onClick={closeMobileMenu}
                className="rounded-xl px-3 py-3 text-zinc-100 transition hover:bg-zinc-800"
              >
                Tracked
              </Link>

              <button
                type="button"
                onClick={() => setMobilePlatformsOpen((prev) => !prev)}
                className="rounded-xl px-3 py-3 text-left text-zinc-100 transition hover:bg-zinc-800"
              >
                Explore {mobilePlatformsOpen ? '▴' : '▾'}
              </button>

              {mobilePlatformsOpen && (
                <div className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-2">
                  <Link
                    href="/pc?page=1&sort=all"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 text-zinc-100 transition hover:bg-zinc-800"
                  >
                    PC
                  </Link>

                  <Link
                    href="/pc?page=1&sort=best"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 text-zinc-100 transition hover:bg-zinc-800"
                  >
                    Best Deals
                  </Link>

                  <Link
                    href="/pc?page=1&sort=latest-discounts"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 text-zinc-100 transition hover:bg-zinc-800"
                  >
                    Latest Discounts
                  </Link>

                  <Link
                    href="/pc?page=1&sort=latest"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 text-zinc-100 transition hover:bg-zinc-800"
                  >
                    Latest Releases
                  </Link>

                  <Link
                    href="/pc?page=1&sort=biggest-discount"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 text-zinc-100 transition hover:bg-zinc-800"
                  >
                    Biggest Discounts
                  </Link>

                  <Link
                    href="/pc?page=1&sort=top-rated"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 text-zinc-100 transition hover:bg-zinc-800"
                  >
                    Top Rated
                  </Link>

                  <div className="px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                    Next platform
                  </div>

                  <Link
                    href="/playstation"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 text-zinc-400 transition hover:bg-zinc-800"
                  >
                    PlayStation
                  </Link>
                </div>
              )}

              {userEmail ? (
                <>
                  <Link
                    href="/profile"
                    onClick={closeMobileMenu}
                    className="rounded-xl px-3 py-3 text-zinc-100 transition hover:bg-zinc-800"
                  >
                    Profile
                  </Link>

                  <button
                    onClick={async () => {
                      await supabase.auth.signOut()
                      closeMobileMenu()
                    }}
                    className="rounded-xl border border-zinc-700 px-3 py-3 text-left text-zinc-100 transition hover:bg-zinc-800"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={closeMobileMenu}
                  className="rounded-xl border border-zinc-700 px-3 py-3 text-zinc-100 transition hover:bg-zinc-800"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}