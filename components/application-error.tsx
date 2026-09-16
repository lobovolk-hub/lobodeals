'use client'

import { usePathname } from 'next/navigation'
import { localeFromPath } from '@/lib/locale'
import { t } from '@/lib/i18n'

export function ApplicationError({ retry }: { retry: () => void }) {
  const locale = localeFromPath(usePathname() || '/')
  return (
    <main className="mx-auto max-w-4xl px-4 py-20">
      <h1 className="text-3xl font-bold">{t(locale, 'This page couldn’t load')}</h1>
      <p className="mt-4">{t(locale, 'Reload to try again, or go back.')}</p>
      <button className="mt-6 min-h-11 rounded-md bg-[#990303] px-5 text-white" onClick={retry}>
        {t(locale, 'Reload')}
      </button>
    </main>
  )
}
