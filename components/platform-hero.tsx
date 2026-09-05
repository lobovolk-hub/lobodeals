import Image from 'next/image'
import type { Platform } from '@/lib/stores'

type PlatformHeroProps = {
  platform: Platform
  name: string
  storeCount: number
}

const platformHeroTreatments = {
  playstation: {
    surface: 'from-[#0759a5] via-[#082b55] to-[#0b0f15]',
    glow: 'bg-[#168eea]/35',
    line: 'from-[#38a7ff]/0 via-[#38a7ff]/55 to-[#38a7ff]/0',
    logo: {
      src: '/services/playstation-store/logo.png',
      width: 800,
      height: 800,
      className: 'h-28 w-28 sm:h-40 sm:w-40 lg:h-48 lg:w-48',
    },
  },
  pc: {
    surface: 'from-[#235b78] via-[#182f40] to-[#0b0f14]',
    glow: 'bg-[#4ba3d1]/25',
    line: 'from-[#7cc7ea]/0 via-[#7cc7ea]/45 to-[#7cc7ea]/0',
    logo: null,
  },
  nintendo: {
    surface: 'from-[#b10718] via-[#65111b] to-[#140d10]',
    glow: 'bg-[#ff3042]/25',
    line: 'from-[#ff8792]/0 via-[#ff8792]/50 to-[#ff8792]/0',
    logo: {
      src: '/services/nintendo-eshop/logo.png',
      width: 512,
      height: 512,
      className:
        'h-32 w-32 rounded-3xl sm:h-40 sm:w-40 lg:h-48 lg:w-48',
    },
  },
  xbox: {
    surface: 'from-[#16803d] via-[#17452a] to-[#0b110d]',
    glow: 'bg-[#55c977]/25',
    line: 'from-[#8be6a5]/0 via-[#8be6a5]/50 to-[#8be6a5]/0',
    logo: {
      src: '/platforms/xbox/logo.png',
      width: 410,
      height: 124,
      className: 'h-auto w-36 sm:w-64 lg:w-72',
    },
  },
} as const

export function PlatformHero({
  platform,
  name,
  storeCount,
}: PlatformHeroProps) {
  const treatment = platformHeroTreatments[platform]

  return (
    <header
      data-platform-hero={platform}
      className={`relative isolate min-h-[270px] overflow-hidden border-b border-white/10 bg-gradient-to-br sm:min-h-[290px] lg:min-h-[310px] ${treatment.surface}`}
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
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(8,9,11,0.82)_0%,rgba(8,9,11,0.46)_44%,rgba(8,9,11,0.08)_100%)]"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-[62%] min-w-64 overflow-hidden"
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

        <div className="absolute inset-0 flex items-center justify-center pl-12 sm:pl-16">
          {treatment.logo ? (
            <Image
              src={treatment.logo.src}
              alt=""
              width={treatment.logo.width}
              height={treatment.logo.height}
              sizes="(max-width: 640px) 160px, (max-width: 1024px) 224px, 288px"
              className={`${treatment.logo.className} object-contain drop-shadow-[0_18px_45px_rgba(0,0,0,0.5)]`}
              loading="eager"
              unoptimized
            />
          ) : (
            <span className="text-7xl font-black tracking-[-0.07em] text-white/90 drop-shadow-[0_18px_45px_rgba(0,0,0,0.5)] sm:text-8xl lg:text-9xl">
              PC
            </span>
          )}
        </div>
      </div>

      <div className="relative mx-auto flex min-h-[270px] w-full max-w-7xl items-center px-4 py-9 sm:min-h-[290px] sm:px-6 sm:py-10 lg:min-h-[310px] lg:px-8">
        <div className="max-w-[68%] sm:max-w-[58%]">
          <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-white/70">
            <span className="h-px w-8 bg-[#990303]" aria-hidden="true" />
            Platform
          </p>

          <h1 className="mt-4 text-4xl font-black leading-none tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
            {name}
          </h1>

          <p className="mt-5 inline-flex rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white/80 backdrop-blur-sm">
            {storeCount} {storeCount === 1 ? 'official store' : 'official stores'}
          </p>
        </div>
      </div>
    </header>
  )
}