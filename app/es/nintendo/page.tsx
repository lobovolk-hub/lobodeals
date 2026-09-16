import { PlatformPage } from '@/components/platform-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  locale: 'es',
  title: 'Nintendo',
  description: 'Official Nintendo eShop sales, live and announced.',
  canonical: '/nintendo',
})

export default function NintendoPage() {
  return <PlatformPage locale="es" platform="nintendo" name="Nintendo" />
}
