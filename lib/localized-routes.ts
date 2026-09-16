import type { Locale } from './locale'
import { storeProfileStaticParams } from './stores'

export const englishPublicRoutes = [
  '/', '/playstation', '/pc', '/nintendo', '/xbox', '/sales', '/about',
  ...storeProfileStaticParams.map(({ slug }) => `/services/${slug}`),
] as const

export function englishPath(pathname: string): string {
  return pathname === '/es' ? '/' : pathname.startsWith('/es/') ? pathname.slice(3) : pathname
}

export function isPublicPath(pathname: string): boolean {
  return englishPublicRoutes.includes(englishPath(pathname))
}

// Only internal, approved routes have language equivalents. Never map a 404 to Home.
export function localizedHref(href: string, locale: Locale): string {
  const match = href.match(/^([^?#]*)(.*)$/)
  if (!match || !isPublicPath(match[1])) return href
  const path = englishPath(match[1])
  return (locale === 'es' ? `/es${path === '/' ? '' : path}` : path) + match[2]
}

export function isCurrentRoute(pathname: string, href: string): boolean {
  const path = englishPath(pathname)
  return path === href || (href === '/pc' && path.startsWith('/services/') && isPublicPath(path))
}
