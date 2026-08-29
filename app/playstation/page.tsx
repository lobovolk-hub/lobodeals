import type { Metadata } from 'next'
import { PlatformPage } from '@/components/platform-page'

export const metadata: Metadata = {
  title: 'PlayStation',
  description: 'Official PlayStation Store sales, live and announced.',
  alternates: { canonical: '/playstation' },
}

export default function PlayStationPage() {
  return <PlatformPage platform="playstation" name="PlayStation" />
}
