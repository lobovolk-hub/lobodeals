import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SiteFooter, SiteHeader } from '@/components/site-shell'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'LoboDeals',
  title: {
    default: 'LoboDeals — PlayStation deals, prices, and game tracking',
    template: '%s | LoboDeals',
  },
  description:
    'Track PlayStation games, compare prices, discover current deals, and follow upcoming PS4 and PS5 releases in one catalog.',
  keywords: [
    'PlayStation deals',
    'PS5 deals',
    'PS4 deals',
    'PlayStation game prices',
    'video game deals',
    'game price tracker',
    'LoboDeals',
  ],
  authors: [{ name: 'LoboDeals' }],
  creator: 'LoboDeals',
  publisher: 'LoboDeals',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'LoboDeals',
    title: 'LoboDeals — PlayStation deals, prices, and game tracking',
    description:
      'Track PlayStation games, compare prices, discover current deals, and follow upcoming PS4 and PS5 releases in one catalog.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LoboDeals — PlayStation deals, prices, and game tracking',
    description:
      'Track PlayStation games, compare prices, discover current deals, and follow upcoming PS4 and PS5 releases in one catalog.',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-black text-white">
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  )
}