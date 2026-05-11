'use client'

import { useEffect, useMemo, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser'

type TrackButtonProps = {
  itemId: string
  initialIsTracked?: boolean
  checkOnMount?: boolean
  reloadOnUntrack?: boolean
  fullWidth?: boolean
  size?: 'default' | 'large'
  className?: string
}

function shouldRedirectToLogin(errorMessage: string) {
  return (
    errorMessage.includes('AUTH_REQUIRED') ||
    errorMessage.includes('permission denied') ||
    errorMessage.includes('not authenticated') ||
    errorMessage.includes('JWT')
  )
}

export function TrackButton({
  itemId,
  initialIsTracked = false,
  checkOnMount = false,
  reloadOnUntrack = false,
  fullWidth = false,
  size = 'default',
  className,
}: TrackButtonProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  const [isTracked, setIsTracked] = useState(initialIsTracked)
  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(checkOnMount)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!checkOnMount) return

    let isMounted = true

    async function checkTrackedState() {
      try {
        const { data, error } = await supabase.rpc('is_user_tracking_item', {
          p_item_id: itemId,
        })

        if (!isMounted) return

        if (!error && typeof data === 'boolean') {
          setIsTracked(data)
        }
      } catch {
        // Avoid crashing the page if auth/session checks are interrupted.
      } finally {
        if (isMounted) {
          setIsChecking(false)
        }
      }
    }

    checkTrackedState()

    return () => {
      isMounted = false
    }
  }, [checkOnMount, itemId, supabase])

  async function handleClick() {
    setErrorMessage(null)
    setIsLoading(true)

    const previousState = isTracked
    const nextState = !previousState

    setIsTracked(nextState)

    const rpcName = previousState ? 'untrack_user_item' : 'track_user_item'

    const { error } = await supabase.rpc(rpcName, {
      p_item_id: itemId,
    })

    if (error) {
      setIsTracked(previousState)
      setIsLoading(false)

      if (shouldRedirectToLogin(error.message)) {
        const next = `${window.location.pathname}${window.location.search}`
        window.location.href = `/login?next=${encodeURIComponent(next)}`
        return
      }

      setErrorMessage('Could not update tracked status.')
      return
    }

    setIsLoading(false)

    if (reloadOnUntrack && previousState) {
      window.location.reload()
    }
  }

  const sizeClass =
    size === 'large'
      ? 'px-6 py-4 text-base'
      : 'px-4 py-2.5 text-sm'

  const widthClass = fullWidth ? 'w-full justify-center' : 'justify-center'

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading || isChecking}
        className={
          isTracked
            ? `inline-flex ${widthClass} rounded-xl bg-white ${sizeClass} font-black text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60`
            : `inline-flex ${widthClass} rounded-xl border border-zinc-700 ${sizeClass} font-black text-zinc-200 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60`
        }
      >
        {isChecking
          ? 'Checking...'
          : isLoading
            ? 'Saving...'
            : isTracked
              ? 'Tracked'
              : 'Track'}
      </button>

      {errorMessage ? (
        <p className="mt-2 text-xs font-semibold text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}