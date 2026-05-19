'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser'

type AccountLinksVariant = 'desktop' | 'footer' | 'mobile'

type AccountLinksProps = {
  variant?: AccountLinksVariant
  onNavigate?: () => void
}

export function AccountLinks({
  variant = 'desktop',
  onNavigate,
}: AccountLinksProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadSession() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (isMounted) {
          setIsLoggedIn(Boolean(user))
        }
      } catch {
        if (isMounted) {
          setIsLoggedIn(false)
        }
      }
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setIsLoggedIn(Boolean(session?.user))
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  const accountHref = isLoggedIn ? '/profile' : '/login'
  const accountLabel = isLoggedIn ? 'Profile' : 'Login'

  if (variant === 'mobile') {
    return (
      <>
        <Link
          href="/tracked"
          onClick={onNavigate}
          className="px-4 py-3 text-sm font-black text-zinc-200 transition hover:bg-zinc-900 hover:text-white"
        >
          Tracked
        </Link>

        <Link
          href={accountHref}
          onClick={onNavigate}
          className="px-4 py-3 text-sm font-black text-zinc-200 transition hover:bg-zinc-900 hover:text-white"
        >
          {accountLabel}
        </Link>
      </>
    )
  }

  if (variant === 'footer') {
    return (
      <div className="flex flex-col gap-2 text-sm font-semibold">
        <Link href="/tracked" className="transition hover:text-white">
          Tracked
        </Link>

        <Link href={accountHref} className="transition hover:text-white">
          {accountLabel}
        </Link>
      </div>
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
        href={accountHref}
        className={
          isLoggedIn
            ? 'rounded-xl bg-white px-4 py-2 text-sm font-bold text-black transition hover:opacity-90'
            : 'shrink-0 whitespace-nowrap rounded-xl border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white'
        }
      >
        {accountLabel}
      </Link>
    </>
  )
}
