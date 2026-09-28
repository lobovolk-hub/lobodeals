import HomePage from '@/components/home-page'
import { createHomeMetadata } from '@/lib/seo'

export const metadata = createHomeMetadata('en')

const websiteIdentity = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'LoboDeals',
  alternateName: 'lobodeals.com',
  url: 'https://lobodeals.com/',
} as const

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteIdentity).replace(/</g, '\\u003c'),
        }}
      />
      <HomePage locale="en" />
    </>
  )
}
