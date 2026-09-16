'use client'

import { usePathname } from 'next/navigation'
import type { Locale } from '@/lib/locale'
import { localizedHref, isPublicPath } from '@/lib/localized-routes'
import { preferenceCookie } from '@/lib/language-preference'
import { t } from '@/lib/i18n'

export function LanguageSelector({ locale }: { locale: Locale }) {
  const pathname = usePathname()
  // An invalid route has no invented language equivalent.
  if (!isPublicPath(pathname)) return null
  return (
    <div role="group" aria-label={t(locale, 'Language')} className="flex items-center gap-1 border-l border-white/10 px-2">
      {(['en', 'es'] as const).map((language) => (
        <a
          key={language}
          href={localizedHref(pathname, language)}
          aria-current={locale === language ? 'true' : undefined}
          onClick={(event) => {
            document.cookie = preferenceCookie(language, window.location.protocol === 'https:')
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault()
              // Full document navigation keeps the shared root layout and SSR lang aligned.
              window.location.assign(localizedHref(pathname, language) + window.location.search + window.location.hash)
            }
          }}
          className={`inline-flex min-h-11 items-center rounded-md px-2 text-xs font-semibold ${locale === language ? 'text-white underline decoration-[#990303] decoration-2 underline-offset-4' : 'text-[#aaa8a4] hover:text-white'}`}
        >
          {language === 'en' ? 'English' : 'Español'}
        </a>
      ))}
    </div>
  )
}
