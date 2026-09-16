import { PlatformPage } from '@/components/platform-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  locale: 'es',
  title: 'PlayStation',
  description: 'Official PlayStation Store sales, live and announced.',
  canonical: '/playstation',
})

export default function PlayStationPage() {
  return <PlatformPage locale="es" platform="playstation" name="PlayStation" />
}
