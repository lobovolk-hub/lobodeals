import { PlatformPage } from '@/components/platform-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  title: 'Xbox Store Sales — Live & Upcoming',
  description: 'Find Xbox Store information for Xbox consoles and Windows PC, plus live and officially announced digital sale campaigns.',
  localizedDescription: true,
  canonical: '/xbox',
})

export default function XboxPage() {
  return <PlatformPage platform="xbox" name="Xbox" />
}
