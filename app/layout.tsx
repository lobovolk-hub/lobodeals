import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Navbar from './components/Navbar'
import Footer from './components/Footer'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lobodeals.com'),
  title: 'LoboDeals — The best video game deals',
  description: 'Find cheap games, track prices, and create alerts on LoboDeals.',
  openGraph: {
    title: 'LoboDeals — The best video game deals',
    description:
      'Find cheap games, track prices, and create alerts on LoboDeals.',
    url: 'https://lobodeals.com',
    siteName: 'LoboDeals',
    images: [
      {
        url: '/og-lobodeals.png',
        width: 768,
        height: 512,
        alt: 'LoboDeals by LoboVolk',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LoboDeals — The best video game deals',
    description:
      'Find cheap games, track prices, and create alerts on LoboDeals.',
    images: ['/og-lobodeals.png'],
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
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
  <Navbar />
  {children}
  <Footer />
</body>
    </html>
  )
}