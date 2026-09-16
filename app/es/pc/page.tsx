import { PlatformPage } from '@/components/platform-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  locale: 'es',
  title: 'PC',
  description: 'Official digital PC store sales, live and announced.',
  canonical: '/pc',
})

export default function PcPage() {
  return <PlatformPage locale="es" platform="pc" name="PC" />
}
