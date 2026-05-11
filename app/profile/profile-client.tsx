'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser'

type ProfileRow = {
  login_username: string
  public_display_name: string | null
  avatar_key: string
  birthday: string | null
  username_updated_at: string | null
  created_at: string
}

type ProfileClientProps = {
  userId: string
  email: string
  emailConfirmedAt: string | null
  providers: string[]
  initialProfile: ProfileRow
  resetPasswordMode: boolean
}

const avatarOptions = [
  { key: 'lobo-01', label: 'Lobo 01' },
  { key: 'lobo-02', label: 'Lobo 02' },
  { key: 'lobo-03', label: 'Lobo 03' },
  { key: 'lobo-04', label: 'Lobo 04' },
  { key: 'lobo-05', label: 'Lobo 05' },
  { key: 'lobo-06', label: 'Lobo 06' },
  { key: 'lobo-07', label: 'Lobo 07' },
  { key: 'lobo-08', label: 'Lobo 08' },
  { key: 'lobo-09', label: 'Lobo 09' },
  { key: 'lobo-10', label: 'Lobo 10' },
]

function validateLoginUsername(value: string) {
  return /^[a-z0-9_]{3,12}$/.test(value)
}

function validatePassword(value: string) {
  return /^(?=.*[A-Z])(?=.*\d).{8,12}$/.test(value)
}

function normalizeLoginUsername(value: string) {
  return value.trim().toLowerCase()
}

function getAvatarSrc(avatarKey: string) {
  return `/avatars/${avatarKey}.png`
}

function formatDisplayDate(value: string | null) {
  if (!value) return 'Not set'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function formatDateTime(value: string | null) {
  if (!value) return 'Never'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function getCanUpdateUsername(usernameUpdatedAt: string | null) {
  if (!usernameUpdatedAt) return true

  const lastUpdate = new Date(usernameUpdatedAt).getTime()
  const thirtyDays = 30 * 24 * 60 * 60 * 1000

  return Date.now() - lastUpdate >= thirtyDays
}

function getNextUsernameUpdateDate(usernameUpdatedAt: string | null) {
  if (!usernameUpdatedAt) return null

  const next = new Date(usernameUpdatedAt)
  next.setDate(next.getDate() + 30)

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(next)
}

export function ProfileClient({
  userId,
  email,
  emailConfirmedAt,
  providers,
  initialProfile,
  resetPasswordMode,
}: ProfileClientProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  const [savedLoginUsername, setSavedLoginUsername] = useState(
    initialProfile.login_username
  )
  const [loginUsername, setLoginUsername] = useState(
    initialProfile.login_username
  )
  const [publicDisplayName, setPublicDisplayName] = useState(
    initialProfile.public_display_name || ''
  )
  const [avatarKey, setAvatarKey] = useState(initialProfile.avatar_key)
  const [birthday, setBirthday] = useState(initialProfile.birthday || '')
  const [usernameUpdatedAt, setUsernameUpdatedAt] = useState(
    initialProfile.username_updated_at
  )
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [passwordMessage, setPasswordMessage] = useState<string | null>(
    resetPasswordMode
      ? 'Password reset mode is active. Set a new password below.'
      : null
  )
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const displayName = publicDisplayName.trim() || loginUsername || 'player'
  const selectedAvatar = avatarOptions.find((avatar) => avatar.key === avatarKey)

  const canUpdateUsername = getCanUpdateUsername(usernameUpdatedAt)
  const nextUsernameUpdateDate = getNextUsernameUpdateDate(usernameUpdatedAt)

  const hasGoogle = providers.includes('google')
  const hasEmail = providers.includes('email')

  function resetProfileStatus() {
    setProfileMessage(null)
    setProfileError(null)
  }

  function resetPasswordStatus() {
    setPasswordMessage(null)
    setPasswordError(null)
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    resetProfileStatus()
    setIsSavingProfile(true)

    const normalizedUsername = normalizeLoginUsername(loginUsername)
    const cleanDisplayName = publicDisplayName.trim()

    if (!validateLoginUsername(normalizedUsername)) {
      setProfileError(
        'Login username must be 3–12 characters and use only lowercase letters, numbers, or underscore.'
      )
      setIsSavingProfile(false)
      return
    }

    if (
      cleanDisplayName.length > 0 &&
      (cleanDisplayName.length < 2 || cleanDisplayName.length > 24)
    ) {
      setProfileError('Public display name must be between 2 and 24 characters.')
      setIsSavingProfile(false)
      return
    }

    if (normalizedUsername !== savedLoginUsername) {
      if (!canUpdateUsername) {
        setProfileError(
          `You can update your login username again on ${nextUsernameUpdateDate}.`
        )
        setIsSavingProfile(false)
        return
      }

      const { data: isAvailable, error: availabilityError } =
        await supabase.rpc('is_login_username_available', {
          p_login_username: normalizedUsername,
        })

      if (availabilityError) {
        setProfileError('We could not check that username. Please try again.')
        setIsSavingProfile(false)
        return
      }

      if (!isAvailable) {
        setProfileError('That login username is already taken.')
        setIsSavingProfile(false)
        return
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        login_username: normalizedUsername,
        public_display_name: cleanDisplayName || null,
        avatar_key: avatarKey,
        birthday: birthday || null,
      })
      .eq('id', userId)

    if (error) {
      if (error.message.includes('LOGIN_USERNAME_UPDATE_TOO_SOON')) {
        setProfileError(
          `You can update your login username again on ${nextUsernameUpdateDate}.`
        )
      } else {
        setProfileError(error.message)
      }

      setIsSavingProfile(false)
      return
    }

    if (normalizedUsername !== savedLoginUsername) {
      const now = new Date().toISOString()
      setUsernameUpdatedAt(now)
      setSavedLoginUsername(normalizedUsername)
    }

    setLoginUsername(normalizedUsername)
    setShowAvatarPicker(false)
    setProfileMessage('Profile updated.')
    setIsSavingProfile(false)
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    resetPasswordStatus()
    setIsSavingPassword(true)

    if (!validatePassword(password)) {
      setPasswordError(
        'Password must be 8–12 characters and include at least one uppercase letter and one number.'
      )
      setIsSavingPassword(false)
      return
    }

    if (password !== passwordConfirm) {
      setPasswordError('Passwords do not match.')
      setIsSavingPassword(false)
      return
    }

    const { error } = await supabase.auth.updateUser({
      password,
    })

    if (error) {
      setPasswordError(error.message)
      setIsSavingPassword(false)
      return
    }

    setPassword('')
    setPasswordConfirm('')
    setPasswordMessage('Password updated.')
    setIsSavingPassword(false)
  }

  async function handleSignOut() {
    resetProfileStatus()
    resetPasswordStatus()
    setIsSigningOut(true)

    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 md:p-8">
        <p className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-zinc-500">
          Profile
        </p>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="h-24 w-24 overflow-hidden rounded-3xl border border-zinc-700 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getAvatarSrc(avatarKey)}
                alt={selectedAvatar?.label || 'Profile avatar'}
                className="h-full w-full object-cover"
              />
            </div>

            <div>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">
                Welcome, {displayName}!
              </h1>

              <p className="mt-4 text-zinc-400">{email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
            Email confirmed
          </p>
          <p className="mt-2 text-lg font-bold text-white">
            {emailConfirmedAt ? 'Yes' : 'No'}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
            Google connected
          </p>
          <p className="mt-2 text-lg font-bold text-white">
            {hasGoogle ? 'Yes' : 'No'}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
            Email/password
          </p>
          <p className="mt-2 text-lg font-bold text-white">
            {hasEmail ? 'Enabled' : 'Can be added'}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
            Member since
          </p>
          <p className="mt-2 text-lg font-bold text-white">
            {formatDateTime(initialProfile.created_at)}
          </p>
        </div>
      </section>

      <form
        onSubmit={handleProfileSubmit}
        className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 md:p-8"
      >
        <h2 className="text-2xl font-black tracking-tight">Account details</h2>

        {profileMessage ? (
          <div className="mt-5 rounded-2xl border border-emerald-800 bg-emerald-950/40 p-4 text-sm font-semibold text-emerald-200">
            {profileMessage}
          </div>
        ) : null}

        {profileError ? (
          <div className="mt-5 rounded-2xl border border-red-800 bg-red-950/40 p-4 text-sm font-semibold text-red-200">
            {profileError}
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
              Login username
            </label>
            <input
              value={loginUsername}
              onChange={(event) =>
                setLoginUsername(normalizeLoginUsername(event.target.value))
              }
              maxLength={12}
              className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
              placeholder="lobo_user"
            />
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Used to sign in. 3–12 characters. You can update this once every
              30 days.
            </p>
            {!canUpdateUsername ? (
              <p className="mt-2 text-xs font-semibold text-yellow-300">
                Next username update available on {nextUsernameUpdateDate}.
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
              Public display name
            </label>
            <input
              value={publicDisplayName}
              onChange={(event) => setPublicDisplayName(event.target.value)}
              maxLength={24}
              className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
              placeholder="Lobo User"
            />
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Can include spaces. This is the name other users may see later.
            </p>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
              Birthday
            </label>
            <input
              type="date"
              value={birthday}
              onChange={(event) => setBirthday(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
            />
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Current display: {formatDisplayDate(birthday || null)}
            </p>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
              Subscription
            </label>
            <div className="mt-2 rounded-xl border border-zinc-800 bg-black p-4 text-sm text-zinc-400">
              Coming soon. Subscription benefits will be defined later.
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-black p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getAvatarSrc(avatarKey)}
                  alt={selectedAvatar?.label || 'Selected avatar'}
                  className="h-full w-full object-cover"
                />
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                  Avatar
                </p>
                <p className="mt-1 text-sm font-bold text-white">
                  {selectedAvatar?.label || avatarKey}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAvatarPicker((value) => !value)}
              className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              {showAvatarPicker ? 'Hide avatars' : 'Change avatar'}
            </button>
          </div>

          {showAvatarPicker ? (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {avatarOptions.map((avatar) => {
                const isActive = avatar.key === avatarKey

                return (
                  <button
                    key={avatar.key}
                    type="button"
                    onClick={() => setAvatarKey(avatar.key)}
                    className={
                      isActive
                        ? 'rounded-2xl border border-white bg-zinc-900 p-2 text-left'
                        : 'rounded-2xl border border-zinc-800 bg-zinc-950 p-2 text-left transition hover:border-zinc-500'
                    }
                  >
                    <div className="overflow-hidden rounded-xl bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getAvatarSrc(avatar.key)}
                        alt={avatar.label}
                        className="aspect-square w-full object-cover"
                      />
                    </div>

                    <p className="mt-2 text-xs font-bold text-white">
                      {avatar.label}
                    </p>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSavingProfile}
          className="mt-8 rounded-xl bg-[#990303] px-6 py-4 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSavingProfile ? 'Saving profile...' : 'Save profile'}
        </button>
      </form>

      <form
        onSubmit={handlePasswordSubmit}
        className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 md:p-8"
      >
        <h2 className="text-2xl font-black tracking-tight">Update password</h2>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Password must be 8–12 characters and include at least one uppercase
          letter and one number.
        </p>

        {passwordMessage ? (
          <div className="mt-5 rounded-2xl border border-emerald-800 bg-emerald-950/40 p-4 text-sm font-semibold text-emerald-200">
            {passwordMessage}
          </div>
        ) : null}

        {passwordError ? (
          <div className="mt-5 rounded-2xl border border-red-800 bg-red-950/40 p-4 text-sm font-semibold text-red-200">
            {passwordError}
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
              placeholder="8–12 chars, 1 uppercase, 1 number"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
              Verify new password
            </label>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-black px-4 text-sm text-white outline-none focus:border-zinc-500"
              placeholder="Type your password again"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSavingPassword}
          className="mt-8 rounded-xl border border-zinc-700 px-6 py-4 text-sm font-black text-zinc-200 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSavingPassword ? 'Updating password...' : 'Update password'}
        </button>
      </form>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 md:p-8">
        <h2 className="text-2xl font-black tracking-tight">
          Birthday greeting
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Coming later. LoboDeals will eventually celebrate your birthday with a
          themed greeting.
        </p>
      </section>
    </div>
  )
}