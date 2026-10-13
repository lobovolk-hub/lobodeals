import { PlatformPage } from '@/components/platform-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  title: 'Official PC Game Stores & Sales',
  description: 'Find official digital PC stores, from Steam to Xbox Store, and follow their live and officially announced sale campaigns.',
  localizedDescription: true,
  canonical: '/pc',
})

export default function PcPage() {
  return <PlatformPage platform="pc" name="PC" />
}
