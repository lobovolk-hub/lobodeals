import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Login | LoboDeals',
  description: 'Sign in to your LoboDeals account to manage tracked games and account settings.',
  alternates: {
    canonical: 'https://www.lobodeals.com/login',
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
