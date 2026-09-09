import { PlatformPage } from '@/components/platform-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  title: 'PlayStation',
  description: 'Official PlayStation Store sales, live and announced.',
  canonical: '/playstation',
})

export default function PlayStationPage() {
  return <PlatformPage platform="playstation" name="PlayStation" />
}
