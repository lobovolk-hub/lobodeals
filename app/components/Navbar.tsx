'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Navbar() {
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
    <nav className="border-b border-zinc-800 bg-zinc-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="leading-tight transition hover:text-emerald-300"
        >
          <div className="text-lg font-bold">LoboDeals</div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            by LoboVolk
          </div>
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <Link
            href="/"
            className="rounded-lg px-2 py-2 transition hover:bg-zinc-800 sm:px-3"
          >
            Home
          </Link>

          <Link
            href="/wishlist"
            className="rounded-lg px-2 py-2 transition hover:bg-zinc-800 sm:px-3"
          >
            Wishlist
          </Link>

          <Link
            href="/alerts"
            className="rounded-lg px-2 py-2 transition hover:bg-zinc-800 sm:px-3"
          >
            Alerts
          </Link>

          {userEmail ? (
            <>
              <span className="rounded-lg px-2 py-2 text-zinc-400 sm:px-3">
                Signed in
              </span>

              <button
                onClick={async () => {
                  await supabase.auth.signOut()
                }}
                className="rounded-lg px-2 py-2 transition hover:bg-zinc-800 sm:px-3"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg px-2 py-2 transition hover:bg-zinc-800 sm:px-3"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}