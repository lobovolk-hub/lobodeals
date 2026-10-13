import AboutPage from '@/components/about-page'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata({
  title: 'About Official Stores & Sales',
  description:
    'Learn how LoboDeals helps you find official digital game stores and follow official sale campaigns.',
  canonical: '/about',
})

export default function Page() {
  return <AboutPage locale="en" />
}
