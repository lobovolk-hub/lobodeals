'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

function isValidPassword(value: string) {
  return value.length >= 8 && value.length <= 12
}

export default function ResetPasswordPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (cancelled) return

        setSessionReady(!!session)
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setSessionReady(false)
        }
      }
    }

    loadSession()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async () => {
    setMessage('')
    setErrorMessage('')

    if (!isValidPassword(password)) {
      setErrorMessage('Password must be between 8 and 12 characters.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      })

      if (error) {
        setErrorMessage(error.message || 'Could not update password.')
        return
      }

      setMessage('Password updated successfully. Redirecting to login...')
      setTimeout(() => {
        router.push('/login')
      }, 1200)
    } catch (error) {
      console.error(error)
      setErrorMessage('Unexpected reset error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <div className="mb-6">
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
              Account recovery
            </p>
            <h1 className="mt-1 text-3xl font-bold">Set a new password</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Use a password between 8 and 12 characters.
            </p>
          </div>

          {message ? (
            <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {message}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errorMessage}
            </div>
          ) : null}

          {!sessionReady ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
              Open this page from the recovery email link to reset your password.
            </div>
          ) : (
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  New password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 to 12 characters"
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Confirm new password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
                />
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? 'Updating password...' : 'Save new password'}
              </button>
            </div>
          )}

          <div className="mt-6 text-sm text-zinc-400">
            <Link href="/login" className="transition hover:text-zinc-200">
              ← Back to login
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}