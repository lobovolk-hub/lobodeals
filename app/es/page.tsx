import HomePage from '@/components/home-page'
import { createHomeMetadata } from '@/lib/seo'

export const metadata = createHomeMetadata('es')

export default function Page() {
  return <HomePage locale="es" />
}
