'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import RegionNotice from '@/app/components/RegionNotice'
import {
  DEFAULT_REGION,
  REGION_STORAGE_KEY,
  REGION_OPTIONS,
  RegionCode,
  getRegionDescription,
  getRegionLabel,
  isRegionCode,
} from '@/lib/region'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_OPTIONS,
  LanguageCode,
  getLanguageDescription,
  getLanguageLabel,
  isLanguageCode,
} from '@/lib/language'

type ProfileData = {
  user_id: string
  email: string | null
  username: string
  preferred_region: RegionCode
  preferred_language: LanguageCode
  created_at: string | null
  updated_at: string | null
}

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(value)
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [savingUsername, setSavingUsername] = useState(false)
  const [savingRegion, setSavingRegion] = useState(false)
  const [savingLanguage, setSavingLanguage] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [usernameInput, setUsernameInput] = useState('')
  const [trackedCount, setTrackedCount] = useState(0)
  const [region, setRegion] = useState<RegionCode>(DEFAULT_REGION)
  const [regionInput, setRegionInput] = useState<RegionCode>(DEFAULT_REGION)
  const [language, setLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE)
  const [languageInput, setLanguageInput] = useState<LanguageCode>(DEFAULT_LANGUAGE)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const storedRegion =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(REGION_STORAGE_KEY)
        : null

    if (storedRegion && isRegionCode(storedRegion)) {
      setRegion(storedRegion)
      setRegionInput(storedRegion)
    }

    const storedLanguage =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
        : null

    if (storedLanguage && isLanguageCode(storedLanguage)) {
      setLanguage(storedLanguage)
      setLanguageInput(storedLanguage)
    }

    const handleRegionChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>
      const value = customEvent.detail

      if (value && isRegionCode(value)) {
        setRegion(value)
        setRegionInput(value)
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
        const accessToken = session?.access_token ?? null

        setUserEmail(currentUserEmail)

        if (!currentUserId || !accessToken) {
          setTrackedCount(0)
          setUsername('')
          setUsernameInput('')
          setRegion(DEFAULT_REGION)
          setRegionInput(DEFAULT_REGION)
          setLanguage(DEFAULT_LANGUAGE)
          setLanguageInput(DEFAULT_LANGUAGE)
          return
        }

        const [trackedRes, profileRes] = await Promise.all([
          supabase
            .from('tracked_games')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUserId),
          fetch('/api/auth/profile', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }),
        ])

        setTrackedCount(trackedRes.count || 0)

        const profileJson = await profileRes.json()

        if (profileRes.ok && profileJson?.success && profileJson?.profile) {
          const profile = profileJson.profile as ProfileData
          const nextUsername = String(profile.username || '').trim()
          const nextRegion = isRegionCode(profile.preferred_region)
            ? profile.preferred_region
            : DEFAULT_REGION
          const nextLanguage = isLanguageCode(profile.preferred_language)
            ? profile.preferred_language
            : DEFAULT_LANGUAGE

          setUsername(nextUsername)
          setUsernameInput(nextUsername)
          setRegion(nextRegion)
          setRegionInput(nextRegion)
          setLanguage(nextLanguage)
          setLanguageInput(nextLanguage)

          if (typeof window !== 'undefined') {
            window.localStorage.setItem(REGION_STORAGE_KEY, nextRegion)
            window.dispatchEvent(
              new CustomEvent('lobodeals-region-change', { detail: nextRegion })
            )

            window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage)
          }
        }
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [])

  const saveUsername = async () => {
    setMessage('')
    setErrorMessage('')

    const cleanUsername = usernameInput.trim()

    if (!isValidUsername(cleanUsername)) {
      setErrorMessage(
        'Username must be 3 to 20 characters and only use letters, numbers, underscores, or hyphens.'
      )
      return
    }

    setSavingUsername(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      if (!accessToken) {
        setErrorMessage('Sign in again to update your username.')
        return
      }

      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          username: cleanUsername,
          preferredRegion: region,
          preferredLanguage: language,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data?.success) {
        setErrorMessage(data?.error || 'Could not update username.')
        return
      }

      setUsername(cleanUsername)
      setUsernameInput(cleanUsername)
      setMessage('Username updated successfully.')
    } catch (error) {
      console.error(error)
      setErrorMessage('Unexpected username update error.')
    } finally {
      setSavingUsername(false)
    }
  }

  const saveRegion = async () => {
    setMessage('')
    setErrorMessage('')

    if (!isRegionCode(regionInput)) {
      setErrorMessage('Choose a valid region.')
      return
    }

    setSavingRegion(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      if (!accessToken) {
        setErrorMessage('Sign in again to update your region.')
        return
      }

      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          preferredRegion: regionInput,
          preferredLanguage: language,
          ...(username ? { username } : {}),
        }),
      })

      const data = await res.json()

      if (!res.ok || !data?.success) {
        setErrorMessage(data?.error || 'Could not update region.')
        return
      }

      setRegion(regionInput)

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(REGION_STORAGE_KEY, regionInput)
        window.dispatchEvent(
          new CustomEvent('lobodeals-region-change', { detail: regionInput })
        )
      }

      setMessage('Preferred region updated successfully.')
    } catch (error) {
      console.error(error)
      setErrorMessage('Unexpected region update error.')
    } finally {
      setSavingRegion(false)
    }
  }

  const saveLanguage = async () => {
    setMessage('')
    setErrorMessage('')

    if (!isLanguageCode(languageInput)) {
      setErrorMessage('Choose a valid language.')
      return
    }

    setSavingLanguage(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      if (!accessToken) {
        setErrorMessage('Sign in again to update your language.')
        return
      }

      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          preferredRegion: region,
          preferredLanguage: languageInput,
          ...(username ? { username } : {}),
        }),
      })

      const data = await res.json()

      if (!res.ok || !data?.success) {
        setErrorMessage(data?.error || 'Could not update language.')
        return
      }

      setLanguage(languageInput)

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, languageInput)
      }

      setMessage('Preferred language updated successfully.')
    } catch (error) {
      console.error(error)
      setErrorMessage('Unexpected language update error.')
    } finally {
      setSavingLanguage(false)
    }
  }

  const greetingName = username || 'player'

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Profile
          </p>
          <h1 className="mt-1 text-3xl font-bold">Your account</h1>
          <p className="mt-2 text-zinc-400">
            Basic profile settings, region context, language preference, account identity, and tracking summary.
          </p>
        </header>

        <div className="mb-6">
          <RegionNotice />
        </div>

        {!loading && !userEmail ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
            <h2 className="text-xl font-bold">Sign in to view your profile</h2>
            <p className="mt-2 text-zinc-400">
              Your profile will show tracked games, username settings, region preferences, language preferences, and future account controls.
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
            {message ? (
              <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">
                {message}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
                {errorMessage}
              </div>
            ) : null}

            <div className="mb-8 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Welcome
                </p>
                <h2 className="mt-2 text-3xl font-bold">Welcome, {greetingName}!</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  This is your account hub for username, region preference, language preference, tracked games,
                  and future preferences.
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    Account region: {getRegionLabel(region)}
                  </span>

                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    Language: {getLanguageLabel(language)}
                  </span>

                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    {username ? 'Username set' : 'Username pending'}
                  </span>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Email
                </p>
                <p className="mt-2 text-xl font-bold break-all">{userEmail}</p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-xs uppercase tracking-wider text-zinc-500">
                      Tracked games
                    </p>
                    <p className="mt-2 text-2xl font-bold text-emerald-300">
                      {loading ? '...' : trackedCount}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-xs uppercase tracking-wider text-zinc-500">
                      Interface language
                    </p>
                    <p className="mt-2 text-2xl font-bold text-zinc-100">
                      {getLanguageLabel(language)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-bold">
                {username ? 'Update your username' : 'Set your username'}
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                {username
                  ? 'You can keep your current username or update it here.'
                  : 'Older accounts may not have a username yet. Set one now to complete your account.'}
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-300">
                    Username
                  </label>
                  <input
                    type="text"
                    autoComplete="username"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="3 to 20 characters"
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    Letters, numbers, underscores, and hyphens only.
                  </p>
                </div>

                <div className="self-end">
                  <button
                    type="button"
                    onClick={saveUsername}
                    disabled={savingUsername}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                  >
                    {savingUsername ? 'Saving...' : username ? 'Update username' : 'Save username'}
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-bold">Preferred region</h2>
              <p className="mt-2 text-sm text-zinc-400">
                United States is now the default base region for LoboDeals. You can still switch
                your account region manually, while pricing remains Steam US for now.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-300">
                    Region
                  </label>
                  <select
                    value={regionInput}
                    onChange={(e) => {
                      const value = e.target.value
                      if (isRegionCode(value)) {
                        setRegionInput(value)
                      }
                    }}
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none"
                  >
                    {REGION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {getRegionLabel(option)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-zinc-500">
                    {getRegionDescription(regionInput)}
                  </p>
                </div>

                <div className="self-end">
                  <button
                    type="button"
                    onClick={saveRegion}
                    disabled={savingRegion}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                  >
                    {savingRegion ? 'Saving...' : 'Save region'}
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-bold">Preferred language</h2>
              <p className="mt-2 text-sm text-zinc-400">
                This stores your interface language preference now, even though LoboDeals still uses English as the base UI and Steam data source.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-300">
                    Language
                  </label>
                  <select
                    value={languageInput}
                    onChange={(e) => {
                      const value = e.target.value
                      if (isLanguageCode(value)) {
                        setLanguageInput(value)
                      }
                    }}
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none"
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {getLanguageLabel(option)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-zinc-500">
                    {getLanguageDescription(languageInput)}
                  </p>
                </div>

                <div className="self-end">
                  <button
                    type="button"
                    onClick={saveLanguage}
                    disabled={savingLanguage}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                  >
                    {savingLanguage ? 'Saving...' : 'Save language'}
                  </button>
                </div>
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
                    href="/pc?page=1&sort=all"
                    className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium transition hover:bg-zinc-800"
                  >
                    Browse PC deals
                  </Link>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
                <h2 className="text-lg font-bold">Language strategy status</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Your account now stores a preferred interface language separately from current English UI content and English Steam source data.
                  This keeps the project ready for future translation layers.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    User language modeled
                  </span>

                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    UI still English-first
                  </span>

                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    Ready for translation later
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