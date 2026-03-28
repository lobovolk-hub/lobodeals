'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import RegionNotice from '@/app/components/RegionNotice'
import {
  REGION_STORAGE_KEY,
  RegionCode,
  getRegionLabel,
  isRegionCode,
} from '@/lib/region'

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [trackedCount, setTrackedCount] = useState(0)
  const [region, setRegion] = useState<RegionCode>('GLOBAL')

  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(REGION_STORAGE_KEY)
        : null

    if (stored && isRegionCode(stored)) {
      setRegion(stored)
    }

    const handleRegionChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>
      const value = customEvent.detail

      if (value && isRegionCode(value)) {
        setRegion(value)
      }
    }

    window.addEventListener(
      'lobodeals-region-change',
      handleRegionChange as EventListener
    )

    return () => {
      window.removeEventListener(
        'lobodeals-region-change',
        handleRegionChange as EventListener
      )
    }
  }, [])

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)

        const {
          data: { session },
        } = await supabase.auth.getSession()

        const currentUserId = session?.user?.id ?? null
        const currentUserEmail = session?.user?.email ?? null

        setUserEmail(currentUserEmail)

        if (!currentUserId) {
          setTrackedCount(0)
          return
        }

        const { count } = await supabase
          .from('tracked_games')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', currentUserId)

        setTrackedCount(count || 0)
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [])

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Profile
          </p>
          <h1 className="mt-1 text-3xl font-bold">Your account</h1>
          <p className="mt-2 text-zinc-400">
            Basic profile settings, region context, and tracking summary.
          </p>
        </header>

        <div className="mb-6">
          <RegionNotice />
        </div>

        {!loading && !userEmail ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
            <h2 className="text-xl font-bold">Sign in to view your profile</h2>
            <p className="mt-2 text-zinc-400">
              Your profile will show tracked games and future account preferences.
            </p>

            <div className="mt-5">
              <Link
                href="/login"
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
              >
                Go to login
              </Link>
            </div>
          </div>
        ) : null}

        {userEmail ? (
          <>
            <div className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Email
              </p>
              <p className="mt-2 text-xl font-bold">{userEmail}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                  Region: {getRegionLabel(region)}
                </span>

                <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                  Web account active
                </span>
              </div>
            </div>

            <div className="mb-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Tracked games
                </p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">
                  {loading ? '...' : trackedCount}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Tracking status
                </p>
                <p className="mt-2 text-2xl font-bold text-zinc-100">
                  {loading ? '...' : trackedCount > 0 ? 'Active' : 'Starting'}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
                <h2 className="text-lg font-bold">Quick actions</h2>

                <div className="mt-4 grid gap-3">
                  <Link
                    href="/tracked"
                    className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
                  >
                    Open tracked games
                  </Link>

                  <Link
                    href="/catalog"
                    className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
                  >
                    Search all games
                  </Link>

                  <Link
                    href="/games?page=1&sort=all"
                    className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
                  >
                    Browse all deals
                  </Link>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
                <h2 className="text-lg font-bold">What comes next</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  This profile is the base for future preferences like email notifications,
                  favorite platforms, and deeper account settings.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    Region-ready
                  </span>

                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    Track-ready
                  </span>

                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    Profile-ready
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  )
}