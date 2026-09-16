export { generateStaticParams } from '@/components/store-profile-page'
import StoreProfilePage, { generateMetadata as metadataForStore } from '@/components/store-profile-page'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return metadataForStore({ params, locale: 'en' })
}
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <StoreProfilePage params={params} locale="en" />
}
