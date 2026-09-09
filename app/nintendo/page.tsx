import { PlatformPage } from '@/components/platform-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  title: 'Nintendo',
  description: 'Official Nintendo eShop sales, live and announced.',
  canonical: '/nintendo',
})

export default function NintendoPage() {
  return <PlatformPage platform="nintendo" name="Nintendo" />
}
