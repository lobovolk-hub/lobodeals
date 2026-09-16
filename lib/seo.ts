import type { Metadata } from 'next'
import type { Locale } from './locale'
import { localizedHref } from './localized-routes'
import { t, type MessageKey } from './i18n'

export const SOCIAL_IMAGE = '/og/lobodeals-og-v2.png'

type PageMetadataOptions = {
  title: string
  description: string
  canonical: string
  locale?: Locale
  localizedDescription?: boolean
}

export function createPageMetadata({ title, description, canonical, locale = 'en', localizedDescription = false }: PageMetadataOptions): Metadata {
  const localizedTitle = title === 'Sales' || title === 'About' ? t(locale, title) : title
  const localizedCopy = localizedDescription ? description : t(locale, description as MessageKey)
  const image = { url: SOCIAL_IMAGE, width: 1200, height: 630, alt: t(locale, 'Official stores. Live sales.') }
  return {
    title: localizedTitle,
    description: localizedCopy,
    alternates: { canonical: locale === 'en' ? canonical : null },
    robots: { index: locale === 'en', follow: true },
    openGraph: {
      type: 'website', siteName: 'LoboDeals', title: localizedTitle,
      description: localizedCopy, url: localizedHref(canonical, locale), images: [image],
    },
    twitter: { card: 'summary_large_image', title: localizedTitle, description: localizedCopy, images: [image] },
  }
}

export function createHomeMetadata(locale: Locale): Metadata {
  const title = t(locale, 'LoboDeals — Official game sales')
  const metadata = createPageMetadata({
    title,
    description: 'Find official digital game stores and see their live or announced sale campaigns.',
    canonical: '/', locale,
  })
  const socialDescription = t(locale, 'Official digital game stores and their live or announced sale campaigns.')
  return {
    ...metadata,
    title: { absolute: title },
    openGraph: { ...metadata.openGraph, description: socialDescription },
    twitter: { ...metadata.twitter, description: socialDescription },
  }
}
