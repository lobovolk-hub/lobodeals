import type { Metadata } from 'next'
import { PlatformPage } from '@/components/platform-page'

export const metadata: Metadata = {
  title: 'Nintendo',
  description: 'Official Nintendo eShop sales, live and announced.',
  alternates: { canonical: '/nintendo' },
}

export default function NintendoPage() {
  return <PlatformPage platform="nintendo" name="Nintendo" />
}
