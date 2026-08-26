import type { Metadata } from 'next'
import { PlatformPage } from '@/components/platform-page'

export const metadata: Metadata = {
  title: 'Xbox',
  description:
    'Official Microsoft / Xbox Store sale campaigns for the United States market.',
  alternates: { canonical: '/xbox' },
}

export default function XboxPage() {
  return <PlatformPage platform="xbox" name="Xbox" />
}
