import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/app/components/Navbar'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lobodeals.com'),
  title: 'LoboDeals — The best video game deals',
  description:
    'Find cheap games, track prices, and explore deals across trusted stores with LoboDeals.',
  openGraph: {
    title: 'LoboDeals — The best video game deals',
    description:
      'Find cheap games, track prices, and explore deals across trusted stores with LoboDeals.',
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
    title: 'LoboDeals — The best video game deals',
    description:
      'Find cheap games, track prices, and explore deals across trusted stores with LoboDeals.',
    images: ['/og-lobodeals.png'],
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  )
}