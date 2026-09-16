import HomePage from '@/components/home-page'
import { createHomeMetadata } from '@/lib/seo'

export const metadata = createHomeMetadata('en')

export default function Page() {
  return <HomePage locale="en" />
}
