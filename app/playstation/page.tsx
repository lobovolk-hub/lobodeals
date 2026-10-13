import { PlatformPage } from '@/components/platform-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  title: 'PlayStation Store Sales — Live & Upcoming',
  description: 'Find PlayStation Store information and its official storefront, plus live and officially announced digital sale campaigns.',
  localizedDescription: true,
  canonical: '/playstation',
})

export default function PlayStationPage() {
  return <PlatformPage platform="playstation" name="PlayStation" />
}
