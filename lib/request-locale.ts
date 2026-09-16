import { headers } from 'next/headers'
import { isLocale, type Locale } from './locale'

export async function requestLocale(): Promise<Locale> {
  const locale = (await headers()).get('x-lobodeals-locale')
  return isLocale(locale) ? locale : 'en'
}
