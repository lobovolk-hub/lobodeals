
export const metadata: Metadata = {
  title: 'PC Deals and Catalog | LoboDeals',
  description:
    'Browse Steam PC games, compare prices, and discover the latest discounts and top-rated releases on LoboDeals.',
  alternates: {
    canonical: 'https://www.lobodeals.com/pc',
  },
  openGraph: {
    title: 'PC Deals and Catalog | LoboDeals',
    description:
      'Browse Steam PC games, compare prices, and discover the latest discounts and top-rated releases on LoboDeals.',
    url: 'https://www.lobodeals.com/pc',
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
    title: 'PC Deals and Catalog | LoboDeals',
    description:
      'Browse Steam PC games, compare prices, and discover the latest discounts and top-rated releases on LoboDeals.',
    images: ['/og-lobodeals.png'],
  },
}

import type { Metadata } from 'next'
import { Suspense } from 'react'
import PcPageClient from './PcPageClient'

export default function PcPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
          <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
              Loading PC catalog...
            </div>
          </section>
        </main>
      }
    >
      <PcPageClient />
    </Suspense>
  )
}