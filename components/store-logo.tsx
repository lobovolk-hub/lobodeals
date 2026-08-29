import Image from 'next/image'
import type { Store } from '@/lib/stores'

type StoreLogoProps = {
  store: Store
  variant?: 'standard' | 'campaign' | 'platform' | 'mini'
  eager?: boolean
}

const dimensionsByVariant = {
  standard: 'h-24 w-full sm:h-28',
  campaign: 'h-24 w-40 sm:h-28 sm:w-48',
  platform: 'h-24 w-32 sm:h-28 sm:w-36',
  mini: 'h-8 w-12',
} as const

const sizesByVariant = {
  standard: '(max-width: 640px) 180px, 220px',
  campaign: '(max-width: 640px) 160px, 192px',
  platform: '(max-width: 640px) 128px, 144px',
  mini: '48px',
} as const

export function StoreLogo({
  store,
  variant = 'standard',
  eager = false,
}: StoreLogoProps) {
  const dimensions = dimensionsByVariant[variant]
  const isMini = variant === 'mini'

  if (!store.logo) {
    return (
      <div
        data-store-logo-fallback="rockstar-store"
        className={`flex ${dimensions} items-center justify-center px-2 text-center`}
        aria-label={`${store.name}; no verified local logo is available`}
      >
        <span
          className={`${
            isMini ? 'text-[0.62rem]' : 'text-sm'
          } font-black uppercase leading-tight tracking-[0.12em] text-white`}
        >
          Rockstar
        </span>
      </div>
    )
  }

  const needsLightTreatment = ['gog', 'ubisoft-store'].includes(store.slug)

  return (
    <div
      className={`flex ${dimensions} items-center justify-center px-2 py-1`}
    >
      <Image
        src={store.logo.src}
        alt={`${store.name} logo`}
        width={store.logo.width}
        height={store.logo.height}
        loading={eager ? 'eager' : undefined}
        sizes={sizesByVariant[variant]}
        className={`max-h-full w-auto max-w-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${
          needsLightTreatment ? 'brightness-0 invert' : ''
        }`}
      />
    </div>
  )
}
