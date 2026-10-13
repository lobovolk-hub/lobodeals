import SalesPage from '@/components/sales-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  title: 'Official Game Sales — Live & Upcoming',
  description: 'See live and officially announced sale campaigns from official digital game stores across PlayStation, PC, Nintendo, and Xbox.',
  localizedDescription: true,
  canonical: '/sales',
})

export default function Page() {
  return <SalesPage locale="en" />
}
