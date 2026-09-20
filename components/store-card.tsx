
import type { Locale } from '@/lib/locale'
import { t } from '@/lib/i18n'
import { localizedStoreDescription } from '@/lib/store-copy'
import { localizedHref } from '@/lib/localized-routes'
import Link from 'next/link'
import { StoreIdentity } from '@/components/store-identity'
import { getStoreVisualTreatment } from '@/lib/store-visuals'
import {
  getStorePublicHref,
  platformLabels,
  type Store,
} from '@/lib/stores'

type StoreCardProps = {
  locale?: Locale
  store: Store
}

export function StoreCard({ locale = 'en',  store }: StoreCardProps) {
  const visual = getStoreVisualTreatment(store.slug)

  return (
    <article className="h-full">
      <Link
        href={localizedHref(getStorePublicHref(store), locale)}
        aria-label={t(locale, "View {value0}", { value0: store.name })}
        className={`group relative flex h-full min-h-80 cursor-pointer flex-col overflow-hidden rounded-xl border bg-gradient-to-br p-4 shadow-[0_16px_40px_rgba(0,0,0,0.16)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(0,0,0,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f87171] motion-reduce:hover:translate-y-0 ${visual.surface} ${visual.border}`}
      >
        <div
          className={`pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full blur-3xl transition-transform duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100 ${visual.glow}`}
          aria-hidden="true"
        />

        <div
          className={`relative flex min-h-32 items-center justify-center overflow-hidden rounded-lg border px-3 py-2 ${visual.logoSurface}`}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:32px_32px]"
            aria-hidden="true"
          />

          <div className="relative w-full transition-transform duration-200 group-hover:scale-[1.025] motion-reduce:group-hover:scale-100">
            <StoreIdentity store={store} />
          </div>
        </div>

        <div className="relative flex flex-1 flex-col pt-4">
          <h3 className="text-lg font-semibold tracking-tight text-white">
            {store.name}
          </h3>

          <p className="mt-2 flex-1 text-sm leading-6 text-white/65">
            {localizedStoreDescription(locale, store)}
          </p>

          <ul
            aria-label={t(locale, "{value0} platforms", { value0: store.name })}
            className="mt-4 flex flex-wrap gap-1.5"
          >
            {store.platforms.map((platform) => (
              <li
                key={platform}
                className={`rounded-sm border px-2 py-1 text-[0.7rem] font-bold uppercase tracking-[0.14em] ${visual.tag}`}
              >
                {platformLabels[platform]}
              </li>
            ))}
          </ul>

          <span
            className={`mt-4 inline-flex min-h-11 items-center border-t border-white/10 pt-3 text-sm font-semibold text-white transition-colors ${visual.cta}`}
          >
            {t(locale, "View store")}
            <span className="ml-2" aria-hidden="true">
              {'\u2192'}
            </span>
          </span>
        </div>
      </Link>
    </article>
  )
}