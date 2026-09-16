import { isLocale, localeFromPath, type Locale } from './locale'
import { isPublicPath, localizedHref } from './localized-routes'

export const LANGUAGE_COOKIE = 'lobodeals_language'
// Implementation choice, not a permanent product rule: 365 days.
export const LANGUAGE_MAX_AGE = 365 * 24 * 60 * 60

export function initialLocale(header: string | null): Locale {
  const preferences = (header || '').split(',').map((part, index) => {
    const [tag, ...parameters] = part.trim().split(';')
    const quality = parameters.find((value) => value.trim().startsWith('q='))
    const q = quality ? Number(quality.trim().slice(2)) : 1
    return { tag: tag.toLowerCase(), q, index }
  }).filter(({ tag, q }) => /^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$|^\*$/.test(tag) && q > 0 && q <= 1)
    .sort((a, b) => b.q - a.q || a.index - b.index)
  return /^es(?:-|$)/.test(preferences[0]?.tag || '') ? 'es' : 'en'
}

export function resolveLanguage(pathname: string, remembered: unknown, acceptLanguage: string | null) {
  if (!isPublicPath(pathname)) return null
  // Only the neutral root negotiates. Every concrete public URL selects its language.
  const locale: Locale = pathname === '/'
    ? isLocale(remembered) ? remembered : initialLocale(acceptLanguage)
    : localeFromPath(pathname)
  return { locale, pathname: localizedHref(pathname, locale) }
}

// Crawlers receive precisely the requested URL; content itself is never UA-dependent.
export function shouldNegotiate(method: string, headers: Pick<Headers, 'get'>, search: string): boolean {
  return method === 'GET' &&
    Boolean(headers.get('accept')?.includes('text/html')) &&
    !headers.get('purpose')?.includes('prefetch') &&
    !headers.get('sec-purpose')?.includes('prefetch') &&
    !new URLSearchParams(search).has('_rsc') &&
    !/bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegrambot|linkedinbot/i.test(headers.get('user-agent') || '')
}

export function preferenceCookie(locale: Locale, secure: boolean): string {
  return `${LANGUAGE_COOKIE}=${locale}; Path=/; Max-Age=${LANGUAGE_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`
}
