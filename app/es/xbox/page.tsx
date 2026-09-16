import { PlatformPage } from '@/components/platform-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  locale: 'es',
  title: 'Xbox',
  description: 'Official Xbox Store sales, live and announced.',
  canonical: '/xbox',
})

export default function XboxPage() {
  return <PlatformPage locale="es" platform="xbox" name="Xbox" />
}
