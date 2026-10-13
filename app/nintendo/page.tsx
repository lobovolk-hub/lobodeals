import { PlatformPage } from '@/components/platform-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  title: 'Nintendo eShop Sales — Live & Upcoming',
  description: 'Find Nintendo eShop information and its official storefront, plus live and officially announced digital sale campaigns.',
  localizedDescription: true,
  canonical: '/nintendo',
})

export default function NintendoPage() {
  return <PlatformPage platform="nintendo" name="Nintendo" />
}
