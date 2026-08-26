import type { Metadata } from 'next'
import { PlatformPage } from '@/components/platform-page'

export const metadata: Metadata = {
  title: 'PC',
  description:
    'Official PC store sale campaigns for the United States market.',
  alternates: { canonical: '/pc' },
}

export default function PcPage() {
  return <PlatformPage platform="pc" name="PC" />
}
