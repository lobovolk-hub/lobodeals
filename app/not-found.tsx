import { requestLocale } from '@/lib/request-locale'
import { NotFoundView } from '@/components/not-found-view'

export default async function NotFoundPage() {
  return <NotFoundView locale={await requestLocale()} />
}
