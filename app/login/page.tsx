'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const resetMessages = () => {
    setMessage('')
    setErrorMessage('')
  }

  const validateEmail = (value: string) => {
    return /\S+@\S+\.\S+/.test(value)
  }

  const handleLogin = async () => {
    resetMessages()

    const cleanEmail = email.trim().toLowerCase()

    if (!validateEmail(cleanEmail)) {
      setErrorMessage('Enter a valid email address.')
      return
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (error) {
        setErrorMessage(error.message || 'Unable to sign in.')
        return
      }

      setMessage('Signed in successfully.')
      router.push('/tracked')
      router.refresh()
    } catch (error) {
      console.error(error)
      setErrorMessage('Unexpected login error.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async () => {
    resetMessages()

    const cleanEmail = email.trim().toLowerCase()

    if (!validateEmail(cleanEmail)) {
      setErrorMessage('Enter a valid email address.')
      return
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      })

      if (error) {
        setErrorMessage(error.message || 'Unable to create account.')
        return
      }

      if (data.session) {
        setMessage('Account created successfully.')
        router.push('/tracked')
        router.refresh()
        return
      }

      setMessage(
        'Account created. If your project still requires email confirmation, review your Supabase Email settings.'
      )
    } catch (error) {
      console.error(error)
      setErrorMessage('Unexpected signup error.')
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    if (mode === 'login') {
      await handleLogin()
      return
    }

    await handleSignup()
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <div className="mb-6">
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
              Account
            </p>
            <h1 className="mt-1 text-3xl font-bold">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              {mode === 'login'
                ? 'Use email and password to access your tracked games and profile.'
                : 'Create your account with a simple password-based login.'}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                resetMessages()
              }}
              className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
                mode === 'login'
                  ? 'bg-white text-black'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              Sign in
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('signup')
                resetMessages()
              }}
              className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
                mode === 'signup'
                  ? 'bg-white text-black'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              Create account
            </button>
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

          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Password
              </label>
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
              />
              <p className="mt-2 text-xs text-zinc-500">
                Password must be at least 8 characters.
              </p>
            </div>

            {mode === 'signup' ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Confirm password
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
            ) : null}

            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
            >
              {loading
                ? mode === 'login'
                  ? 'Signing in...'
                  : 'Creating account...'
                : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-sm text-zinc-400">
              This login flow now uses email and password instead of OTP.
            </p>
          </div>

          <div className="mt-6 text-sm text-zinc-400">
            <Link href="/" className="transition hover:text-zinc-200">
              ← Back to home
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}