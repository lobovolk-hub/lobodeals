import type { Metadata } from 'next'
import { PlatformPage } from '@/components/platform-page'

export const metadata: Metadata = {
  title: 'PC',
  description: 'Official digital PC store sales, live and announced.',
  alternates: { canonical: '/pc' },
}

export default function PcPage() {
  return <PlatformPage platform="pc" name="PC" />
}
