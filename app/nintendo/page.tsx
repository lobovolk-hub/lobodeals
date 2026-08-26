import type { Metadata } from 'next'
import { PlatformPage } from '@/components/platform-page'

export const metadata: Metadata = {
  title: 'Nintendo',
  description:
    'Official Nintendo eShop sale campaigns for the United States market.',
  alternates: { canonical: '/nintendo' },
}

export default function NintendoPage() {
  return <PlatformPage platform="nintendo" name="Nintendo" />
}
