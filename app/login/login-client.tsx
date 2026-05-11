'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser'

type LoginClientProps = {
  nextPath: string
  authError: string | null
}

type Mode = 'signin' | 'signup' | 'forgot-password' | 'forgot-username'

function validateLoginUsername(value: string) {
  return /^[a-z0-9_]{3,12}$/.test(value)
}

function validatePassword(value: string) {
  return /^(?=.*[A-Z])(?=.*\d).{8,12}$/.test(value)
}

function normalizeLoginUsername(value: string) {
  return value.trim().toLowerCase()
}

function getAuthCallbackUrl(nextPath: string) {
  const origin = window.location.origin
  const next = nextPath || '/profile'

  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`
}

export function LoginClient({ nextPath, authError }: LoginClientProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  const [mode, setMode] = useState<Mode>('signin')
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(
    authError ? 'Authentication failed. Please try again.' : null
  )
  const [isLoading, setIsLoading] = useState(false)

  const [signInIdentifier, setSignInIdentifier] = useState('')
  const [signInPassword, setSignInPassword] = useState('')

  const [signUpEmail, setSignUpEmail] = useState('')
  const [signUpUsername, setSignUpUsername] = useState('')
  const [signUpDisplayName, setSignUpDisplayName] = useState('')
  const [signUpPassword, setSignUpPassword] = useState('')
  const [signUpPasswordConfirm, setSignUpPasswordConfirm] = useState('')

  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const hashError = hashParams.get('error')
    const hashErrorCode = hashParams.get('error_code')
    const hashErrorDescription = hashParams.get('error_description')

    if (hashError || hashErrorCode || hashErrorDescription) {
      setErrorMessage(
        hashErrorDescription ||
          'The email link is invalid or has expired. Please request a new link later.'
      )
    }
  }, [])

  function resetStatus() {
    setMessage(null)
    setErrorMessage(null)
  }

  async function handleGoogleSignIn() {
    resetStatus()
    setIsLoading(true)

    const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: getAuthCallbackUrl(nextPath),
    queryParams: {
      prompt: 'select_account',
    },
  },
})

    if (error) {
      setErrorMessage(error.message)
      setIsLoading(false)
    }
  }

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    resetStatus()
    setIsLoading(true)

    const identifier = signInIdentifier.trim()
    let email = identifier

    if (!identifier.includes('@')) {
      const username = normalizeLoginUsername(identifier)

      if (!validateLoginUsername(username)) {
        setErrorMessage(
          'Enter a valid username: 3–12 characters, lowercase letters, numbers, or underscore.'
        )
        setIsLoading(false)
        return
      }

      const { data, error } = await supabase.rpc(
        'get_email_for_login_username',
        {
          p_login_username: username,
        }
      )

      if (error || !data) {
        setErrorMessage('Invalid username or password.')
        setIsLoading(false)
        return
      }

      email = data
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: signInPassword,
    })

    if (error) {
      setErrorMessage(error.message)
      setIsLoading(false)
      return
    }

    window.location.href = nextPath || '/profile'
  }

  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    resetStatus()
    setIsLoading(true)

    const username = normalizeLoginUsername(signUpUsername)
    const displayName = signUpDisplayName.trim() || username

    if (!validateLoginUsername(username)) {
      setErrorMessage(
        'Username must be 3–12 characters and use only lowercase letters, numbers, or underscore.'
      )
      setIsLoading(false)
      return
    }

    if (!validatePassword(signUpPassword)) {
      setErrorMessage(
        'Password must be 8–12 characters and include at least one uppercase letter and one number.'
      )
      setIsLoading(false)
      return
    }

    if (signUpPassword !== signUpPasswordConfirm) {
      setErrorMessage('Passwords do not match.')
      setIsLoading(false)
      return
    }

    const { data: isAvailable, error: availabilityError } = await supabase.rpc(
      'is_login_username_available',
      {
        p_login_username: username,
      }
    )

    if (availabilityError) {
      setErrorMessage('We could not check that username. Please try again.')
      setIsLoading(false)
      return
    }

    if (!isAvailable) {
      setErrorMessage('That username is already taken.')
      setIsLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email: signUpEmail.trim(),
      password: signUpPassword,
      options: {
        emailRedirectTo: getAuthCallbackUrl('/profile'),
        data: {
          login_username: username,
          public_display_name: displayName,
        },
      },
    })

    if (error) {
      setErrorMessage(error.message)
      setIsLoading(false)
      return
    }

    setMessage(
      'Account created. Please check your email and confirm your account before signing in.'
    )
    setIsLoading(false)
  }

  async function handleForgotPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    resetStatus()
    setIsLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(
      forgotPasswordEmail.trim(),
      {
        redirectTo: getAuthCallbackUrl('/profile?mode=reset-password'),
      }
    )

    if (error) {
      setErrorMessage(error.message)
      setIsLoading(false)
      return
    }

    setMessage('Password reset email sent. Please check your inbox.')
    setIsLoading(false)
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
        <div className="grid w-full gap-8 lg:grid-cols-[1fr_460px] lg:items-center">
          <section>
            <p className="mb-4 text-sm font-black uppercase tracking-[0.24em] text-zinc-500">
              LoboDeals account
            </p>

            <h1 className="max-w-3xl text-4xl font-black tracking-tight md:text-6xl">
              Track PlayStation games, deals, and future price drops.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">
              Create an account to save games to your tracked list. You can sign
              in with email, username, or Google.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm font-bold text-white">Track games</p>
                <p className="mt-2 text-sm text-zinc-400">
                  Save games and return to them later.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm font-bold text-white">Watch deals</p>
                <p className="mt-2 text-sm text-zinc-400">
                  Prepare for future price tracking.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm font-bold text-white">Build profile</p>
                <p className="mt-2 text-sm text-zinc-400">
                  Choose your username, avatar, and display name.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  resetStatus()
                  setMode('signin')
                }}
                className={
                  mode === 'signin'
                    ? 'rounded-xl bg-white px-4 py-3 text-sm font-black text-black'
                    : 'rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-300'
                }
              >
                Sign in
              </button>

              <button
                type="button"
                onClick={() => {
                  resetStatus()
                  setMode('signup')
                }}
                className={
                  mode === 'signup'
                    ? 'rounded-xl bg-white px-4 py-3 text-sm font-black text-black'
                    : 'rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-300'
                }
              >
                Create account
              </button>
            </div>

            {message ? (
              <div className="mb-4 rounded-2xl border border-emerald-800 bg-emerald-950/40 p-4 text-sm font-semibold text-emerald-200">
                {message}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mb-4 rounded-2xl border border-red-800 bg-red-950/40 p-4 text-sm font-semibold text-red-200">
                {errorMessage}
              </div>
            ) : null}

            {mode === 'signin' ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Email or username
                  </label>
                  <input
                    value={signInIdentifier}
                    onChange={(event) =>
                      setSignInIdentifier(event.target.value)
                    }
                    required
                    className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
                    placeholder="email@example.com or lobo_user"
                  />
                </div>

                <div>
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Password
                  </label>
                  <input
                    type="password"
                    value={signInPassword}
                    onChange={(event) =>
                      setSignInPassword(event.target.value)
                    }
                    required
                    className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
                    placeholder="Your password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-12 w-full rounded-xl bg-[#990303] px-6 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </button>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="h-12 w-full rounded-xl border border-zinc-700 px-6 text-sm font-black text-zinc-200 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continue with Google
                </button>

                <div className="flex flex-wrap justify-between gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      resetStatus()
                      setMode('forgot-username')
                    }}
                    className="font-semibold text-zinc-400 transition hover:text-white"
                  >
                    Forgot username?
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      resetStatus()
                      setMode('forgot-password')
                    }}
                    className="font-semibold text-zinc-400 transition hover:text-white"
                  >
                    Forgot password?
                  </button>
                </div>
              </form>
            ) : null}

            {mode === 'signup' ? (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Email
                  </label>
                  <input
                    type="email"
                    value={signUpEmail}
                    onChange={(event) => setSignUpEmail(event.target.value)}
                    required
                    className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Login username
                  </label>
                  <input
                    value={signUpUsername}
                    onChange={(event) =>
                      setSignUpUsername(normalizeLoginUsername(event.target.value))
                    }
                    required
                    maxLength={12}
                    className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
                    placeholder="lobo_user"
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    3–12 characters. Lowercase letters, numbers, and underscore.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Public display name
                  </label>
                  <input
                    value={signUpDisplayName}
                    onChange={(event) =>
                      setSignUpDisplayName(event.target.value)
                    }
                    maxLength={24}
                    className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
                    placeholder="Lobo User"
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    Can include spaces. You can change it later in Profile.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Password
                  </label>
                  <input
                    type="password"
                    value={signUpPassword}
                    onChange={(event) =>
                      setSignUpPassword(event.target.value)
                    }
                    required
                    className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
                    placeholder="8–12 chars, 1 uppercase, 1 number"
                  />
                </div>

                <div>
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Verify password
                  </label>
                  <input
                    type="password"
                    value={signUpPasswordConfirm}
                    onChange={(event) =>
                      setSignUpPasswordConfirm(event.target.value)
                    }
                    required
                    className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
                    placeholder="Type your password again"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-12 w-full rounded-xl bg-[#990303] px-6 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? 'Creating account...' : 'Create account'}
                </button>

                <div className="space-y-2">
  <button
    type="button"
    onClick={handleGoogleSignIn}
    disabled={isLoading}
    className="h-12 w-full rounded-xl border border-zinc-700 px-6 text-sm font-black text-zinc-200 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
  >
    Create account with Google
  </button>

  <p className="text-xs leading-5 text-zinc-500">
    If you already have an account created with Google, we&apos;ll sign you in.
  </p>
</div>
              </form>
            ) : null}

            {mode === 'forgot-password' ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Email
                  </label>
                  <input
                    type="email"
                    value={forgotPasswordEmail}
                    onChange={(event) =>
                      setForgotPasswordEmail(event.target.value)
                    }
                    required
                    className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
                    placeholder="email@example.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-12 w-full rounded-xl bg-[#990303] px-6 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? 'Sending...' : 'Send password reset email'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetStatus()
                    setMode('signin')
                  }}
                  className="w-full rounded-xl border border-zinc-700 px-6 py-3 text-sm font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                >
                  Back to sign in
                </button>
              </form>
            ) : null}

            {mode === 'forgot-username' ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-800 bg-black p-4 text-sm leading-6 text-zinc-300">
                  You can sign in with your email even if you forgot your
                  username. After signing in, your username will be visible in
                  Profile.
                </div>

                <button
                  type="button"
                  onClick={() => {
                    resetStatus()
                    setMode('signin')
                  }}
                  className="w-full rounded-xl border border-zinc-700 px-6 py-3 text-sm font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                >
                  Back to sign in
                </button>
              </div>
            ) : null}

            <div className="mt-6 border-t border-zinc-800 pt-4 text-xs leading-5 text-zinc-500">
              By creating an account, you agree to use LoboDeals for personal
              game tracking and deal discovery.
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}