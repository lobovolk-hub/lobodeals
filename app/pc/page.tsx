import { PlatformPage } from '@/components/platform-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  title: 'PC',
  description: 'Official digital PC store sales, live and announced.',
  canonical: '/pc',
})

export default function PcPage() {
  return <PlatformPage platform="pc" name="PC" />
}
