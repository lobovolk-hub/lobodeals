import SalesPage from '@/components/sales-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  locale: 'es',
  title: 'Sales',
  description: 'Live and upcoming official digital store sale campaigns.',
  canonical: '/sales',
})

export default function Page() {
  return <SalesPage locale="es" />
}
