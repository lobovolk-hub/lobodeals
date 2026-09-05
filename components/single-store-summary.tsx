import { StoreLogo } from '@/components/store-logo'
import type { Platform, Store } from '@/lib/stores'

type SingleStoreSummaryProps = {
  platform: Platform
  name: string
  store: Store
}

const singleStoreTreatments = {
  playstation: {
    surface: 'from-[#0759a5] via-[#082b55] to-[#0b0f15]',
    glow: 'bg-[#168eea]/35',
    line: 'from-[#38a7ff]/0 via-[#38a7ff]/55 to-[#38a7ff]/0',
  },
  nintendo: {
    surface: 'from-[#b10718] via-[#65111b] to-[#140d10]',
    glow: 'bg-[#ff3042]/25',
    line: 'from-[#ff8792]/0 via-[#ff8792]/50 to-[#ff8792]/0',
  },
  xbox: {
    surface: 'from-[#16803d] via-[#17452a] to-[#0b110d]',
    glow: 'bg-[#55c977]/25',
    line: 'from-[#8be6a5]/0 via-[#8be6a5]/50 to-[#8be6a5]/0',
  },
} as const

export function SingleStoreSummary({
  platform,
  name,
  store,
}: SingleStoreSummaryProps) {
  const headingId = `${platform}-heading`
  const treatment =
    singleStoreTreatments[platform as keyof typeof singleStoreTreatments]

  if (!treatment) {
    return null
  }

  return (
    <header
      data-single-store-summary={store.slug}
      data-platform={platform}
      aria-labelledby={headingId}
      className={`relative isolate min-h-[300px] overflow-hidden border-b border-white/10 bg-gradient-to-br sm:min-h-[320px] lg:min-h-[330px] ${treatment.surface}`}
    >
      <div
        className={`pointer-events-none absolute -right-[8%] top-[-45%] h-[150%] w-[62%] rounded-full blur-[90px] ${treatment.glow}`}
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.11] [background-image:linear-gradient(rgba(255,255,255,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.2)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(90deg,transparent_20%,black_100%)]"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(8,9,11,0.86)_0%,rgba(8,9,11,0.50)_48%,rgba(8,9,11,0.08)_100%)]"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-[58%] min-w-64 overflow-hidden"
        aria-hidden="true"
      >
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 whitespace-nowrap text-center text-[clamp(5rem,13vw,11rem)] font-black uppercase tracking-[-0.08em] text-white/[0.065]">
          {name}
        </p>

        <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white/15 sm:h-48 sm:w-48 lg:h-56 lg:w-56" />

        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 sm:h-40 sm:w-40 lg:h-48 lg:w-48" />

        <div
          className={`absolute left-[8%] right-[4%] top-1/2 h-px -translate-y-1/2 bg-gradient-to-r ${treatment.line}`}
        />

        <div
          data-single-store-logo
          className="absolute inset-0 flex items-center justify-center pl-12 sm:pl-16"
        >
          <div className="relative w-36 sm:w-44 lg:w-56">
            <StoreLogo
              store={store}
              variant="platform"
              eager
            />
          </div>
        </div>
      </div>

      <div className="relative mx-auto flex min-h-[300px] w-full max-w-7xl items-center px-4 py-8 sm:min-h-[320px] sm:px-6 sm:py-9 lg:min-h-[330px] lg:px-8">
        <div className="max-w-[72%] sm:max-w-[60%]">
          <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-white/70">
            <span className="h-px w-8 bg-[#990303]" aria-hidden="true" />
            Platform
          </p>

          <h1
            id={headingId}
            className="mt-3 text-4xl font-black leading-none tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl"
          >
            {name}
          </h1>

          <h2 className="mt-4 text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {store.name}
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75 sm:text-base sm:leading-7">
            {store.description}
          </p>

          <a
            href={store.officialUrl}
            data-lobodeals-outbound="true"
            data-analytics-surface="platform"
            data-outbound-type="store"
            data-store-slug={store.slug}
            data-store-name={store.name}
            data-link-mode="official"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-[#990303] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#b20a0a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f87171]"
          >
            Visit official store
            <span className="ml-2" aria-hidden="true">
              {'\u2197'}
            </span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </header>
  )
}