import Image from 'next/image'
import type { Store } from '@/lib/stores'

type StoreLogoProps = {
  store: Store
  compact?: boolean
}

export function StoreLogo({ store, compact = false }: StoreLogoProps) {
  const dimensions = compact
    ? 'h-14 w-20'
    : 'h-24 w-full sm:h-28'

  if (!store.logo) {
    return (
      <div
        className={`flex ${dimensions} items-center justify-center rounded-md border border-dashed border-white/15 bg-[#1a1a1a] px-3 text-center`}
        aria-label={`${store.name}; no verified local logo is available`}
      >
        <span className="text-sm font-semibold leading-5 text-[#d0cdc7]">
          {store.name}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`flex ${dimensions} items-center justify-center overflow-hidden rounded-md px-4 py-3 ${
        store.logo.surface === 'light' ? 'bg-[#f0ede7]' : 'bg-[#202020]'
      }`}
    >
      <Image
        src={store.logo.src}
        alt={`${store.name} logo`}
        width={store.logo.width}
        height={store.logo.height}
        sizes={compact ? '80px' : '(max-width: 640px) 180px, 220px'}
        className="max-h-full w-auto max-w-full object-contain"
      />
    </div>
  )
}
