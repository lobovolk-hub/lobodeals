import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ProfileClient } from './profile-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata: Metadata = {
  title: 'Profile',
  description: 'Manage your LoboDeals profile.',
  robots: {
    index: false,
    follow: false,
  },
}

type ProfilePageProps = {
  searchParams: Promise<{
    mode?: string
  }>
}

type ProfileRow = {
  login_username: string
  public_display_name: string | null
  avatar_key: string
  birthday: string | null
  username_updated_at: string | null
  created_at: string
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = await searchParams
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/profile')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'login_username, public_display_name, avatar_key, birthday, username_updated_at, created_at'
    )
    .eq('id', user.id)
    .maybeSingle()

  const providers = Array.isArray(user.app_metadata?.providers)
    ? (user.app_metadata.providers as string[])
    : []

  const safeProfile: ProfileRow = {
    login_username: profile?.login_username || 'player',
    public_display_name: profile?.public_display_name || null,
    avatar_key: profile?.avatar_key || 'lobo-01',
    birthday: profile?.birthday || null,
    username_updated_at: profile?.username_updated_at || null,
    created_at: profile?.created_at || user.created_at || new Date().toISOString(),
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap gap-4">
          <Link
            href="/"
            className="text-sm font-semibold text-zinc-400 transition hover:text-white"
          >
            ← Back to home
          </Link>

          <Link
            href="/tracked"
            className="text-sm font-semibold text-zinc-400 transition hover:text-white"
          >
            Go to tracked →
          </Link>
        </div>

        <ProfileClient
          userId={user.id}
          email={user.email || ''}
          emailConfirmedAt={user.email_confirmed_at || null}
          providers={providers}
          initialProfile={safeProfile}
          resetPasswordMode={params.mode === 'reset-password'}
        />
      </div>
    </main>
  )
}