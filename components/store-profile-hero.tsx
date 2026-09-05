import Link from 'next/link'
import { StoreLogo } from '@/components/store-logo'
import { platformLabels, type Store } from '@/lib/stores'

type StoreProfileHeroProps = {
  store: Store
}

export function StoreProfileHero({ store }: StoreProfileHeroProps) {
  return (
    <header
      data-store-profile-hero={store.slug}
      className="relative isolate overflow-hidden border-b border-white/10 bg-[#121212]"
    >
      <span
        className="absolute inset-x-0 top-0 h-px bg-[#990303]"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid w-full max-w-7xl gap-6 px-4 py-7 sm:px-6 sm:py-8 md:grid-cols-[11rem_minmax(0,1fr)] md:items-center lg:px-8">
        <div
          data-store-profile-logo
          className="flex min-h-28 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#101010] px-4 py-3"
        >
          <div className="relative w-full">
            <StoreLogo store={store} eager />
          </div>
        </div>

        <div className="min-w-0">
          <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-[#8d8b87]">
            <span className="h-px w-8 bg-[#990303]" aria-hidden="true" />
            Official store
          </p>

          <h1 className="mt-3 text-4xl font-black leading-none tracking-[-0.045em] text-white sm:text-5xl">
            {store.name}
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#aaa8a4] sm:text-base sm:leading-7">
            {store.description}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <ul
              aria-label={`${store.name} platforms`}
              className="flex flex-wrap gap-2"
            >
              {store.platforms.map((platform) => (
                <li key={platform}>
                  <Link
                    href={`/${platform}`}
                    className="inline-flex min-h-10 items-center rounded-md border border-white/10 bg-white/[0.025] px-3 text-xs font-bold uppercase tracking-[0.14em] text-[#aaa8a4] transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f87171]"
                  >
                    {platformLabels[platform]}
                  </Link>
                </li>
              ))}
            </ul>

            <a
              href={store.officialUrl}
              data-lobodeals-outbound="true"
              data-analytics-surface="store_profile"
              data-outbound-type="store"
              data-store-slug={store.slug}
              data-store-name={store.name}
              data-link-mode="official"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#990303] px-4 text-sm font-bold text-white transition-colors hover:bg-[#b20a0a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f87171]"
            >
              Visit official store
              <span className="ml-2" aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}