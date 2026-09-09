import type { Metadata } from 'next'

const socialImage = {
  url: '/og/lobodeals-og.png',
  width: 1200,
  height: 630,
  alt: 'LoboDeals \u2014 Official game sales.',
}

type PageMetadataOptions = {
  title: string
  description: string
  canonical: string
}

export function createPageMetadata({
  title,
  description,
  canonical,
}: PageMetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: 'LoboDeals',
      title,
      description,
      url: canonical,
      images: [socialImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og/lobodeals-og.png'],
    },
  }
}
