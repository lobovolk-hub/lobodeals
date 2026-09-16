'use client'

import { usePathname } from 'next/navigation'
import { localeFromPath } from '@/lib/locale'
import { ApplicationError } from '@/components/application-error'
import { t } from '@/lib/i18n'
import './globals.css'

export default function GlobalError({ retry }: { retry: () => void }) {
  const locale = localeFromPath(usePathname() || '/')
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-[#101010] text-[#f4f1eb]">
        <title>{t(locale, 'This page couldn’t load')}</title>
        <ApplicationError retry={retry} />
      </body>
    </html>
  )
}
