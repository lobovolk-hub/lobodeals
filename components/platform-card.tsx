import Link from 'next/link'
import { StoreLogo } from '@/components/store-logo'
import {
  getStoresByPlatform,
  type Platform,
  type Store,
} from '@/lib/stores'

type PlatformCardProps = {
  platform: Platform
}

const platformPresentation = {
  playstation: {
    href: '/playstation',
    name: 'PlayStation',
    description: 'PlayStation Store sales, live and announced.',
    gradient: 'from-[#063d78] via-[#102b47] to-[#171717]',
  },
  pc: {
    href: '/pc',
    name: 'PC',
    description: 'Official campaigns across eight PC game stores.',
    gradient: 'from-[#283747] via-[#202832] to-[#171717]',
  },
  nintendo: {
    href: '/nintendo',
    name: 'Nintendo',
    description: 'Nintendo eShop sales, live and announced.',
    gradient: 'from-[#8f0010] via-[#421016] to-[#171717]',
  },
  xbox: {
    href: '/xbox',
    name: 'Xbox',
    description: 'Microsoft / Xbox Store sales for console and PC.',
    gradient: 'from-[#155b32] via-[#183824] to-[#171717]',
  },
} as const satisfies Record<
  Platform,
  Readonly<{
    href: string
    name: string
    description: string
    gradient: string
  }>
>

function PlatformIdentity({
  platform,
  stores,
}: {
  platform: Platform
  stores: readonly Store[]
}) {
  if (platform === 'pc') {
    const steam = stores.find((store) => store.slug === 'steam')

    return steam ? (
      <div
        role="img"
        aria-label="Steam, visual reference for eight PC stores"
        className="rounded-lg bg-black/15 px-3 shadow-[0_14px_36px_rgba(0,0,0,0.2)]"
      >
        <StoreLogo store={steam} variant="platform" />
      </div>
    ) : null
  }

  return stores[0] ? (
    <StoreLogo
      store={stores[0]}
      variant="platform"
      eager={platform === 'playstation'}
    />
  ) : null
}

export function PlatformCard({ platform }: PlatformCardProps) {
  const presentation = platformPresentation[platform]
  const platformStores = getStoresByPlatform(platform)

  return (
    <Link
      href={presentation.href}
      aria-label={`Explore ${presentation.name} sales and store directory`}
      className={`group relative flex h-full min-h-64 cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br ${presentation.gradient} p-5 shadow-[0_16px_42px_rgba(0,0,0,0.18)] transition duration-200 hover:-translate-y-0.5 hover:border-white/30 hover:shadow-[0_22px_52px_rgba(0,0,0,0.32)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f87171]`}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl transition-transform duration-300 group-hover:scale-110"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-black/30 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-3">
        <h3 className="text-3xl font-black tracking-[-0.04em] text-white">
          {presentation.name}
        </h3>
        <span className="rounded-full border border-white/15 bg-black/15 px-2.5 py-1 text-[0.66rem] font-bold text-white/75">
          {platformStores.length} {platformStores.length === 1 ? 'store' : 'stores'}
        </span>
      </div>

      <div className="relative mt-4 flex min-h-28 flex-1 items-center justify-center rounded-lg border border-white/[0.06] bg-black/10 px-4 py-3">
        <div className="shrink-0 transition-transform duration-200 group-hover:scale-[1.03]">
          <PlatformIdentity platform={platform} stores={platformStores} />
        </div>
      </div>

      <p className="relative mt-3 text-sm leading-6 text-white/70">
        {presentation.description}
      </p>
      <span className="relative mt-4 border-t border-white/15 pt-4 text-sm font-bold text-white transition-colors group-hover:text-[#ffd0d0]">
        View platform <span aria-hidden="true">→</span>
      </span>
    </Link>
  )
}
