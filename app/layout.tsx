import type { Metadata } from 'next'
import { Suspense } from 'react'
import './globals.css'
import Navbar from '@/app/components/Navbar'
import Footer from '@/app/components/Footer'
import GoogleAnalytics from '@/app/components/GoogleAnalytics'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lobodeals.com'),
  title: 'LoboDeals — Steam PC game deals, prices, and catalog',
  description:
    'Browse Steam PC games and DLC, track prices, and discover the latest deals in one clean catalog with LoboDeals.',
  alternates: {
    canonical: 'https://www.lobodeals.com',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'LoboDeals — Steam PC game deals, prices, and catalog',
    description:
      'Browse Steam PC games and DLC, track prices, and discover the latest deals in one clean catalog with LoboDeals.',
    url: 'https://www.lobodeals.com',
    siteName: 'LoboDeals',
    images: [
      {
        url: '/og-lobodeals.png',
        width: 1200,
        height: 630,
        alt: 'LoboDeals',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LoboDeals — Steam PC game deals, prices, and catalog',
    description:
      'Browse Steam PC games and DLC, track prices, and discover the latest deals in one clean catalog with LoboDeals.',
    images: ['/og-lobodeals.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <Suspense fallback={null}>
          <GoogleAnalytics />
        </Suspense>

        <div className="flex min-h-screen flex-col">
          <Navbar />
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  )
}