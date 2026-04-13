'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Mode = 'login' | 'signup' | 'recover'
type SocialProvider = 'google'

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value)
}

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(value)
}

function isValidPassword(value: string) {
  return value.length >= 8 && value.length <= 12
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [mode, setMode] = useState<Mode>('login')
  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const oauthProvider = useMemo(() => {
    const value = searchParams.get('oauth')

    if (value === 'google') {
      return value
    }

    return null
  }, [searchParams])

  useEffect(() => {
    if (searchParams.get('verified') === '1') {
      setMessage('Email verified. You can now sign in with your username or email and password.')
    }
  }, [searchParams])

  useEffect(() => {
    let cancelled = false

    async function syncSessionAfterOAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (cancelled) return

        if (session?.user) {
          router.push('/tracked')
          router.refresh()
          return
        }

        if (oauthProvider) {
          setErrorMessage('Google sign-in did not complete. Please try again.')
        }
      } catch (error) {
        console.error(error)

        if (!cancelled && oauthProvider) {
          setErrorMessage('Unexpected Google sign-in error.')
        }
      } finally {
        if (!cancelled) {
          setSocialLoading(null)
        }
      }
    }

    if (oauthProvider) {
      syncSessionAfterOAuth()
    }

    return () => {
      cancelled = true
    }
  }, [oauthProvider, router])

  const resetMessages = () => {
    setMessage('')
    setErrorMessage('')
  }

  const handleLogin = async () => {
    resetMessages()

    const cleanIdentifier = identifier.trim()

    if (!cleanIdentifier) {
      setErrorMessage('Enter your username or email.')
      return
    }

    if (!password) {
      setErrorMessage('Enter your password.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanIdentifier, password }),
      })

      const data = await res.json()

      if (!res.ok || !data?.success || !data?.session) {
        setErrorMessage(data?.error || 'Unable to sign in.')
        return
      }

      const session = data.session

      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })

      if (error) {
        setErrorMessage(error.message || 'Could not initialize your session.')
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

  const handleSocialLogin = async (provider: SocialProvider) => {
    resetMessages()
    setSocialLoading(provider)

    try {
      const origin =
        typeof window !== 'undefined'
          ? window.location.origin
          : process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com'

      const redirectTo = `${origin}/login?oauth=${provider}`

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      })

      if (error) {
        setErrorMessage(error.message || 'Could not start Google sign-in.')
        setSocialLoading(null)
      }
    } catch (error) {
      console.error(error)
      setErrorMessage('Unexpected Google sign-in error.')
      setSocialLoading(null)
    }
  }

  const handleSignup = async () => {
    resetMessages()

    const cleanEmail = email.trim().toLowerCase()
    const cleanUsername = username.trim()

    if (!isValidEmail(cleanEmail)) {
      setErrorMessage('Enter a valid email address.')
      return
    }

    if (!isValidUsername(cleanUsername)) {
      setErrorMessage(
        'Username must be 3 to 20 characters and only use letters, numbers, underscores, or hyphens.'
      )
      return
    }

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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          username: cleanUsername,
          password,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data?.success) {
        setErrorMessage(data?.error || 'Unable to create account.')
        return
      }

      if (data.session?.access_token && data.session?.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        })

        if (error) {
          setErrorMessage(error.message || 'Account created but session could not be initialized.')
          return
        }

        setMessage('Account created successfully.')
        router.push('/tracked')
        router.refresh()
        return
      }

      setMessage(
        'Account created. Check your email to verify your account before signing in.'
      )
      setMode('login')
      setIdentifier(cleanUsername)
      setEmail('')
      setUsername('')
      setPassword('')
      setConfirmPassword('')
    } catch (error) {
      console.error(error)
      setErrorMessage('Unexpected signup error.')
    } finally {
      setLoading(false)
    }
  }

  const handleRecover = async () => {
    resetMessages()

    const cleanIdentifier = identifier.trim()

    if (!cleanIdentifier) {
      setErrorMessage('Enter your email or username.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanIdentifier }),
      })

      const data = await res.json()

      if (!res.ok || !data?.success) {
        setErrorMessage(data?.error || 'Could not send recovery email.')
        return
      }

      setMessage(
        data?.message ||
          'If that account exists, a recovery email has been sent. You can also sign in directly using your email.'
      )
    } catch (error) {
      console.error(error)
      setErrorMessage('Unexpected recovery error.')
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    if (mode === 'login') {
      await handleLogin()
      return
    }

    if (mode === 'signup') {
      await handleSignup()
      return
    }

    await handleRecover()
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
              {mode === 'login'
                ? 'Sign in'
                : mode === 'signup'
                ? 'Create account'
                : 'Recover account'}
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              {mode === 'login'
                ? 'Sign in with your username, your email, or Google.'
                : mode === 'signup'
                ? 'Create your account with email, username, and a password between 8 and 12 characters.'
                : 'Enter your email or username and we will send a password recovery email.'}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
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
              Create
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('recover')
                resetMessages()
              }}
              className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
                mode === 'recover'
                  ? 'bg-white text-black'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              Recover
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

          {mode !== 'recover' ? (
            <>
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => handleSocialLogin('google')}
                  disabled={loading || socialLoading !== null}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-zinc-700 bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                  >
                    <path
                      fill="#EA4335"
                      d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6.1-2.8-6.1-6.2s2.8-6.2 6.1-6.2c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 2.9 14.7 2 12 2 6.9 2 2.8 6.2 2.8 11.3S6.9 20.7 12 20.7c6.9 0 9.1-4.8 9.1-7.3 0-.5 0-.8-.1-1.2H12z"
                    />
                  </svg>
                  {socialLoading === 'google'
                    ? 'Redirecting...'
                    : 'Continue with Google'}
                </button>
              </div>

              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-800" />
                <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  or
                </span>
                <div className="h-px flex-1 bg-zinc-800" />
              </div>
            </>
          ) : null}

          <div className="grid gap-4">
            {mode === 'login' ? (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-300">
                    Username or email
                  </label>
                  <input
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="yourname or you@example.com"
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-300">
                    Password
                  </label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                </div>
              </>
            ) : null}

            {mode === 'signup' ? (
              <>
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
                    Username
                  </label>
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="3 to 20 characters"
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    Letters, numbers, underscores, and hyphens only.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-300">
                    Password
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
              </>
            ) : null}

            {mode === 'recover' ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Email or username
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com or yourname"
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
                />
                <p className="mt-2 text-xs text-zinc-500">
                  If you forgot your username, you can also use your email directly to sign in.
                </p>
              </div>
            ) : null}

            <button
              type="button"
              onClick={submit}
              disabled={loading || socialLoading !== null}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
            >
              {loading
                ? mode === 'login'
                  ? 'Signing in...'
                  : mode === 'signup'
                  ? 'Creating account...'
                  : 'Sending recovery email...'
                : mode === 'login'
                ? 'Sign in'
                : mode === 'signup'
                ? 'Create account'
                : 'Send recovery email'}
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-sm text-zinc-400">
              You can sign in with email, username, or Google. If Google uses the same verified email, your account can stay connected under the same profile.
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

function LoginPageFallback() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <p className="text-sm text-zinc-400">Loading account page...</p>
        </div>
      </section>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageInner />
    </Suspense>
  )
}