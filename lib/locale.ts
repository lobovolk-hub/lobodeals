export const locales = ['en', 'es'] as const
export type Locale = (typeof locales)[number]

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'es'
}

export function localeFromPath(pathname: string): Locale {
  return pathname === '/es' || pathname.startsWith('/es/') ? 'es' : 'en'
}
