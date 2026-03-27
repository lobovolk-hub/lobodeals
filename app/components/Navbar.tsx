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
    <nav className="border-b border-zinc-800 bg-zinc-900/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="min-w-0 leading-tight transition hover:text-emerald-300"
            onClick={closeMobileMenu}
          >
            <div className="truncate text-lg font-bold">LoboDeals</div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
              by LoboVolk
            </div>
          </Link>

          <div className="hidden items-center gap-2 text-sm md:flex">
            <Link
              href="/"
              className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
            >
              Home
            </Link>

            <Link
              href="/catalog"
              className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
            >
              Catalog
            </Link>

            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setPlatformsOpen((prev) => !prev)}
                className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
              >
                Platforms ▾
              </button>

              {platformsOpen && (
                <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
                  <Link
                    href="/games?page=1&sort=all"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm transition hover:bg-zinc-800"
                  >
                    All Platform Deals
                  </Link>

                  <Link
                    href="/pc"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm transition hover:bg-zinc-800"
                  >
                    PC
                  </Link>

                  <Link
                    href="/playstation"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm transition hover:bg-zinc-800"
                  >
                    PlayStation
                  </Link>

                  <Link
                    href="/xbox"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm transition hover:bg-zinc-800"
                  >
                    Xbox
                  </Link>

                  <Link
                    href="/nintendo"
                    onClick={() => setPlatformsOpen(false)}
                    className="block px-4 py-3 text-sm transition hover:bg-zinc-800"
                  >
                    Nintendo
                  </Link>
                </div>
              )}
            </div>

            <Link
              href="/wishlist"
              className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
            >
              Wishlist
            </Link>

            <Link
              href="/alerts"
              className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
            >
              Alerts
            </Link>

            {userEmail ? (
              <>
                <span className="rounded-lg px-3 py-2 text-zinc-400">
                  Signed in
                </span>

                <button
                  onClick={async () => {
                    await supabase.auth.signOut()
                  }}
                  className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
              >
                Login
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm transition hover:bg-zinc-800 md:hidden"
          >
            Menu
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-3 md:hidden">
            <div className="grid gap-2 text-sm">
              <Link
                href="/"
                onClick={closeMobileMenu}
                className="rounded-xl px-3 py-3 transition hover:bg-zinc-800"
              >
                Home
              </Link>

              <Link
                href="/catalog"
                onClick={closeMobileMenu}
                className="rounded-xl px-3 py-3 transition hover:bg-zinc-800"
              >
                Catalog
              </Link>

              <button
                type="button"
                onClick={() => setMobilePlatformsOpen((prev) => !prev)}
                className="rounded-xl px-3 py-3 text-left transition hover:bg-zinc-800"
              >
                Platforms {mobilePlatformsOpen ? '▴' : '▾'}
              </button>

              {mobilePlatformsOpen && (
                <div className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-2">
                  <Link
                    href="/games?page=1&sort=all"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
                  >
                    All Platform Deals
                  </Link>

                  <Link
                    href="/pc"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
                  >
                    PC
                  </Link>

                  <Link
                    href="/playstation"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
                  >
                    PlayStation
                  </Link>

                  <Link
                    href="/xbox"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
                  >
                    Xbox
                  </Link>

                  <Link
                    href="/nintendo"
                    onClick={closeMobileMenu}
                    className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
                  >
                    Nintendo
                  </Link>
                </div>
              )}

              <Link
                href="/wishlist"
                onClick={closeMobileMenu}
                className="rounded-xl px-3 py-3 transition hover:bg-zinc-800"
              >
                Wishlist
              </Link>

              <Link
                href="/alerts"
                onClick={closeMobileMenu}
                className="rounded-xl px-3 py-3 transition hover:bg-zinc-800"
              >
                Alerts
              </Link>

              {userEmail ? (
                <>
                  <div className="rounded-xl px-3 py-3 text-zinc-400">
                    Signed in
                  </div>

                  <button
                    onClick={async () => {
                      await supabase.auth.signOut()
                      closeMobileMenu()
                    }}
                    className="rounded-xl px-3 py-3 text-left transition hover:bg-zinc-800"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-3 transition hover:bg-zinc-800"
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