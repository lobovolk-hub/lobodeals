'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Footer() {
  const [userEmail, setUserEmail] = useState<string | null>(null)

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

  return (
    <footer className="mt-auto border-t border-zinc-800 bg-black">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-lg shadow-red-950/20">
                <img
                  src="/lobodeals-logo.png"
                  alt="LoboDeals logo"
                  className="h-10 w-10 object-contain"
                />
              </div>

              <div>
                <div className="text-lg font-bold text-white">LoboDeals</div>
                <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                  by LoboVolk
                </div>
              </div>
            </div>

            <p className="mt-4 max-w-md text-sm leading-6 text-zinc-400">
              Steam-first PC tracking focused on clean browsing, real screenshots,
              canonical game pages, curated highlights, and scalable price data.
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              Explore
            </p>

            <div className="mt-4 grid gap-3 text-sm text-zinc-300">
              <Link href="/" className="transition hover:text-white">
                Home
              </Link>
              <Link href="/pc?page=1&sort=all" className="transition hover:text-white">
                PC
              </Link>
              <Link
                href="/pc?page=1&sort=best-deals"
                className="transition hover:text-white"
              >
                Best Deals
              </Link>
              <Link
                href="/pc?page=1&sort=latest-discounts"
                className="transition hover:text-white"
              >
                Latest Discounts
              </Link>
              <Link
                href="/pc?page=1&sort=latest-releases"
                className="transition hover:text-white"
              >
                Latest Releases
              </Link>
              <Link
                href="/pc?page=1&sort=biggest-discount"
                className="transition hover:text-white"
              >
                Biggest Discounts
              </Link>
              <Link
                href="/pc?page=1&sort=top-rated"
                className="transition hover:text-white"
              >
                Top Rated
              </Link>
              <Link href="/tracked" className="transition hover:text-white">
                Tracked
              </Link>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              Account
            </p>

            <div className="mt-4 grid gap-3 text-sm text-zinc-300">
              <a
                href="https://www.youtube.com/@lobovolk"
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-white"
              >
                YouTube
              </a>

              <a
                href="https://www.tiktok.com/@lobovolk2"
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-white"
              >
                TikTok
              </a>

              {userEmail ? (
                <>
                  <Link href="/profile" className="transition hover:text-white">
                    Profile
                  </Link>

                  <button
                    onClick={async () => {
                      await supabase.auth.signOut()
                    }}
                    className="text-left transition hover:text-white"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link href="/login" className="transition hover:text-white">
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-zinc-500 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p>© 2026 LoboDeals. Built as a Steam-first PC discovery layer.</p>
          <p>Game data, artwork, and store assets belong to their respective owners.</p>
        </div>
      </div>
    </footer>
  )
}