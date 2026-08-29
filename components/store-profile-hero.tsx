import Link from 'next/link'
import { StoreLogo } from '@/components/store-logo'
import { getStoreVisualTreatment } from '@/lib/store-visuals'
import { platformLabels, type Store } from '@/lib/stores'

type StoreProfileHeroProps = {
  store: Store
}

export function StoreProfileHero({ store }: StoreProfileHeroProps) {
  const visual = getStoreVisualTreatment(store.slug)

  return (
    <header
      data-store-profile-hero={store.slug}
      className={`relative isolate overflow-hidden border-b bg-gradient-to-br ${visual.surface} ${visual.border}`}
    >
      <div
        className={`pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full blur-[100px] sm:h-96 sm:w-96 ${visual.glow}`}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.2)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(90deg,black,transparent_88%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(8,9,11,0.44),rgba(8,9,11,0.08)_58%,rgba(8,9,11,0.3))]"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-6 sm:py-8 md:grid-cols-[13rem_minmax(0,1fr)] md:items-center md:gap-8 lg:px-8 lg:py-9">
        <div
          data-store-profile-logo
          className={`relative flex min-h-24 items-center justify-center overflow-hidden rounded-xl border px-4 py-2 shadow-[0_18px_45px_rgba(0,0,0,0.2)] sm:min-h-28 md:min-h-40 ${visual.logoSurface}`}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_65%)]"
            aria-hidden="true"
          />
          <div className="relative w-full">
            <StoreLogo store={store} eager />
          </div>
        </div>

        <div className="min-w-0">
          <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-white/70">
            <span className="h-px w-8 bg-[#990303]" aria-hidden="true" />
            Official store
          </p>
          <h1 className="mt-3 text-4xl font-black leading-none tracking-[-0.045em] text-white sm:text-5xl">
            {store.name}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
            {store.description}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ul
              aria-label={`${store.name} platforms`}
              className="flex flex-wrap gap-2"
            >
              {store.platforms.map((platform) => (
                <li key={platform}>
                  <Link
                    href={`/${platform}`}
                    className={`inline-flex min-h-10 items-center rounded-md border px-3 text-xs font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f87171] ${visual.tag}`}
                  >
                    {platformLabels[platform]}
                  </Link>
                </li>
              ))}
            </ul>
            <a
              href={store.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/15 bg-black/20 px-4 text-sm font-bold text-white transition-colors hover:border-white/30 hover:bg-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f87171]"
            >
              Visit official store <span className="ml-2" aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
