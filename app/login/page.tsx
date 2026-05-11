import type { Metadata } from 'next'
import { LoginClient } from './login-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to your LoboDeals account.',
  robots: {
    index: false,
    follow: false,
  },
}

type LoginPageProps = {
  searchParams: Promise<{
    next?: string
    error?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams

  return (
    <LoginClient
      nextPath={params.next || '/profile'}
      authError={params.error || null}
    />
  )
}