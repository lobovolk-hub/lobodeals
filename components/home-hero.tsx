'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

const ROTATION_INTERVAL_MS = 8_000

const heroSlides = [
  {
    platform: 'PlayStation',
    href: '/playstation',
    storeCount: '1 store',
    note: 'PlayStation Store sales, live and announced',
    logo: {
      src: '/services/playstation-store/logo.png',
      width: 800,
      height: 800,
      className: 'h-32 w-32 sm:h-36 sm:w-36 lg:h-44 lg:w-44',
    },
    surface: 'from-[#0759a5] via-[#082b55] to-[#0b0f15]',
    glow: 'bg-[#168eea]/45',
    line: 'from-[#38a7ff]/0 via-[#38a7ff]/60 to-[#38a7ff]/0',
  },
  {
    platform: 'PC',
    href: '/pc',
    storeCount: '8 stores',
    note: 'Eight official PC stores, with Steam as the visual reference',
    logo: {
      src: '/services/steam/logo.png',
      width: 744,
      height: 171,
      className: 'h-auto w-60 sm:w-72 lg:w-80',
    },
    surface: 'from-[#235b78] via-[#182f40] to-[#0b0f14]',
    glow: 'bg-[#4ba3d1]/35',
    line: 'from-[#7cc7ea]/0 via-[#7cc7ea]/55 to-[#7cc7ea]/0',
  },
  {
    platform: 'Nintendo',
    href: '/nintendo',
    storeCount: '1 store',
    note: 'Nintendo eShop sales, live and announced',
    logo: {
      src: '/services/nintendo-eshop/logo.png',
      width: 512,
      height: 512,
      className:
        'h-32 w-32 rounded-3xl sm:h-36 sm:w-36 lg:h-44 lg:w-44',
    },
    surface: 'from-[#d30a1c] via-[#70111d] to-[#120d10]',
    glow: 'bg-[#ff3042]/35',
    line: 'from-[#ff8792]/0 via-[#ff8792]/55 to-[#ff8792]/0',
  },
  {
    platform: 'Xbox',
    href: '/xbox',
    storeCount: '1 store',
    note: 'One Microsoft / Xbox Store across PC and console',
    logo: {
      src: '/platforms/xbox/logo.png',
      width: 410,
      height: 124,
      className: 'h-auto w-60 sm:w-72 lg:w-80',
    },
    surface: 'from-[#16803d] via-[#17452a] to-[#0b110d]',
    glow: 'bg-[#55c977]/35',
    line: 'from-[#8be6a5]/0 via-[#8be6a5]/55 to-[#8be6a5]/0',
  },
] as const

function wrapSlide(index: number): number {
  return (index + heroSlides.length) % heroSlides.length
}

export function HomeHero() {
  const [activeSlide, setActiveSlide] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [autoplayEnabled, setAutoplayEnabled] = useState(true)
  const [timerReset, setTimerReset] = useState(0)
  const playbackChoiceMade = useRef(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => {
      setReducedMotion(media.matches)
      if (!playbackChoiceMade.current) {
        setAutoplayEnabled(!media.matches)
      }
    }

    updatePreference()
    media.addEventListener('change', updatePreference)
    return () => media.removeEventListener('change', updatePreference)
  }, [])

  useEffect(() => {
    if (!autoplayEnabled) return

    const timeout = window.setTimeout(() => {
      setActiveSlide((current) => wrapSlide(current + 1))
    }, ROTATION_INTERVAL_MS)

    return () => window.clearTimeout(timeout)
  }, [activeSlide, autoplayEnabled, timerReset])

  const selectSlide = useCallback((index: number) => {
    setActiveSlide(wrapSlide(index))
    setTimerReset((current) => current + 1)
  }, [])

  const setPlayback = (playing: boolean) => {
    playbackChoiceMade.current = true
    setAutoplayEnabled(playing)
    if (playing) setTimerReset((current) => current + 1)
  }

  const handleHeroKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    selectSlide(activeSlide + (event.key === 'ArrowLeft' ? -1 : 1))
  }

  const activePlatform = heroSlides[activeSlide].platform

  return (
    <section
      data-hero-full-bleed
      role="region"
      aria-label="Gaming platform spotlight"
      onKeyDown={handleHeroKeyDown}
      className="home-hero-full-bleed relative isolate min-h-[570px] w-full overflow-hidden border-b border-white/10 bg-[#0b0d10] sm:min-h-[540px] lg:min-h-[470px]"
    >
      {heroSlides.map((slide, index) => {
        const isActive = activeSlide === index

        return (
          <div
            key={slide.platform}
            data-hero-slide={slide.platform.toLowerCase()}
            aria-hidden={!isActive}
            className={`absolute inset-0 transition-opacity duration-500 ease-out ${
              isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br ${slide.surface}`}
              aria-hidden="true"
            />
            <div
              className={`absolute -right-24 top-[-35%] h-[135%] w-[68%] rounded-full ${slide.glow} blur-[100px] sm:right-[-5%] lg:right-[-2%]`}
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,8,10,0.96)_0%,rgba(7,8,10,0.86)_30%,rgba(7,8,10,0.25)_66%,rgba(7,8,10,0.06)_100%)] max-lg:bg-[linear-gradient(180deg,rgba(7,8,10,0.72)_0%,rgba(7,8,10,0.45)_57%,rgba(7,8,10,0.12)_100%)]"
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(90deg,transparent_30%,black_100%)]"
              aria-hidden="true"
            />

            <div
              className={`absolute inset-x-0 bottom-16 top-[330px] transition-[opacity,transform] duration-500 ease-out sm:top-[300px] lg:inset-y-0 lg:left-[48%] lg:right-0 ${
                isActive
                  ? 'translate-x-0 opacity-100'
                  : 'translate-x-3 opacity-0'
              }`}
              aria-hidden="true"
            >
              <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 whitespace-nowrap text-center text-[clamp(4.6rem,12vw,10rem)] font-black uppercase tracking-[-0.08em] text-white/[0.07]">
                {slide.platform}
              </p>
              <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white/15 sm:h-48 sm:w-48 lg:h-60 lg:w-60" />
              <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 sm:h-40 sm:w-40 lg:h-52 lg:w-52" />
              <div
                className={`absolute left-[14%] right-[8%] top-1/2 h-px -translate-y-1/2 bg-gradient-to-r ${slide.line}`}
              />

              <div className="absolute inset-0 flex items-center justify-center px-8">
                <Image
                  src={slide.logo.src}
                  alt=""
                  width={slide.logo.width}
                  height={slide.logo.height}
                  sizes="(max-width: 640px) 240px, (max-width: 1024px) 288px, 320px"
                  className={`${slide.logo.className} relative z-10 object-contain drop-shadow-[0_18px_45px_rgba(0,0,0,0.55)]`}
                  loading="eager"
                />
              </div>

              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap text-[0.67rem] font-black uppercase tracking-[0.18em] text-white/70 lg:bottom-8">
                <span>{slide.platform}</span>
                <span className="h-1 w-1 rounded-full bg-white/45" />
                <span>{slide.storeCount}</span>
              </div>
            </div>
          </div>
        )
      })}

      <Link
        data-hero-platform-link
        href={heroSlides[activeSlide].href}
        aria-label={`View ${activePlatform} platform`}
        className="absolute inset-0 z-10 cursor-pointer bg-white/0 transition-colors hover:bg-white/[0.015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f87171]"
      >
        <span className="sr-only">View {activePlatform} platform</span>
      </Link>

      <div className="pointer-events-none relative z-20 mx-auto flex min-h-[570px] w-full max-w-7xl items-start px-4 pb-56 pt-9 sm:min-h-[540px] sm:px-6 sm:pb-52 sm:pt-11 lg:min-h-[470px] lg:items-center lg:px-8 lg:pb-20 lg:pt-12">
        <div className="w-full lg:w-[54%]">
          <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-[#ef8a8a]">
            <span className="h-px w-8 bg-[#990303]" aria-hidden="true" />
            Official game sales
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.02] tracking-[-0.045em] text-white sm:text-5xl lg:text-5xl xl:text-6xl">
            Know where official game sales are happening
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#d0cfcc] sm:text-lg sm:leading-8 lg:max-w-xl">
            Find official digital game stores and see which sale campaigns are
            live or coming next.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/sales"
              className="pointer-events-auto inline-flex min-h-11 items-center justify-center rounded-md bg-[#990303] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#b20a0a]"
            >
              Browse Sales <span className="ml-2" aria-hidden="true">→</span>
            </Link>
            <Link
              href="#platforms"
              className="pointer-events-auto inline-flex min-h-11 items-center justify-center rounded-md border border-white/20 bg-black/15 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:border-white/40 hover:bg-black/25"
            >
              Explore platforms
            </Link>
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {activePlatform} platform visual
      </p>

      <div className="absolute inset-x-0 bottom-4 z-30 flex justify-center sm:bottom-5">
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/45 p-1.5 shadow-[0_12px_35px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <button
            type="button"
            onClick={() => selectSlide(activeSlide - 1)}
            aria-label="Previous platform visual"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm text-white transition-colors hover:bg-white/10"
          >
            <span aria-hidden="true">←</span>
          </button>
          <div
            className="flex items-center gap-1.5 px-1"
            aria-label="Platform visual selection"
          >
            {heroSlides.map((slide, index) => (
              <button
                key={slide.platform}
                type="button"
                onClick={() => selectSlide(index)}
                aria-label={`Show ${slide.platform} visual`}
                aria-pressed={activeSlide === index}
                className={`h-2 rounded-full transition-[width,background-color] duration-300 ${
                  activeSlide === index
                    ? 'w-6 bg-white'
                    : 'w-2 bg-white/35 hover:bg-white/65'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPlayback(!autoplayEnabled)}
            aria-label={autoplayEnabled ? 'Pause slideshow' : 'Play slideshow'}
            aria-pressed={!autoplayEnabled}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
          >
            {autoplayEnabled ? (
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 24 24"
                className="h-6 w-6"
              >
                <path
                  d="M7 5h3v14H7zM14 5h3v14h-3z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 24 24"
                className="h-6 w-6"
              >
                <path d="M8 5.5v13l10-6.5z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => selectSlide(activeSlide + 1)}
            aria-label="Next platform visual"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm text-white transition-colors hover:bg-white/10"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-[#101010]/75 to-transparent"
        aria-hidden="true"
      />

      <span className="sr-only">
        Reduced motion preference is {reducedMotion ? 'enabled' : 'disabled'}.
      </span>
    </section>
  )
}
