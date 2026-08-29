import type { StoreSlug } from './stores'

export type StoreVisualTreatment = Readonly<{
  surface: string
  border: string
  glow: string
  logoSurface: string
  tag: string
  cta: string
}>

export const storeVisualTreatments = {
  'playstation-store': {
    surface: 'from-[#063d78] via-[#102b47] to-[#171717]',
    border: 'border-[#4fa8ed]/25 hover:border-[#4fa8ed]/60',
    glow: 'bg-[#168eea]/20',
    logoSurface: 'border-[#4fa8ed]/15 bg-[#071b2c]/30',
    tag: 'border-[#4fa8ed]/20 bg-[#0a2c48]/35 text-[#b9dcf7]',
    cta: 'group-hover:text-[#8ed0ff]',
  },
  'nintendo-eshop': {
    surface: 'from-[#8f0010] via-[#421016] to-[#171717]',
    border: 'border-[#e83a49]/25 hover:border-[#ff6471]/60',
    glow: 'bg-[#ff3042]/18',
    logoSurface: 'border-[#ff6471]/15 bg-[#3a0810]/30',
    tag: 'border-[#ff6471]/20 bg-[#4d0b14]/35 text-[#ffc4c9]',
    cta: 'group-hover:text-[#ff9da6]',
  },
  'microsoft-store': {
    surface: 'from-[#155b32] via-[#183824] to-[#171717]',
    border: 'border-[#55c977]/25 hover:border-[#75db91]/60',
    glow: 'bg-[#55c977]/18',
    logoSurface: 'border-[#75db91]/15 bg-[#0b2d19]/30',
    tag: 'border-[#75db91]/20 bg-[#103d23]/35 text-[#b9efc8]',
    cta: 'group-hover:text-[#91e5a8]',
  },
  steam: {
    surface: 'from-[#174a68] via-[#1b3241] to-[#171717]',
    border: 'border-[#66a8ce]/25 hover:border-[#7cc7ea]/55',
    glow: 'bg-[#4ba3d1]/17',
    logoSurface: 'border-[#7cc7ea]/15 bg-[#0e2635]/30',
    tag: 'border-[#7cc7ea]/20 bg-[#123247]/35 text-[#c2e6f8]',
    cta: 'group-hover:text-[#8ed4f4]',
  },
  'epic-games-store': {
    surface: 'from-[#3b3b3b] via-[#262626] to-[#171717]',
    border: 'border-white/15 hover:border-white/35',
    glow: 'bg-white/10',
    logoSurface: 'border-white/10 bg-black/20',
    tag: 'border-white/15 bg-white/[0.045] text-[#d7d7d7]',
    cta: 'group-hover:text-white',
  },
  gog: {
    surface: 'from-[#57327b] via-[#32233f] to-[#171717]',
    border: 'border-[#a879cf]/25 hover:border-[#bd91df]/55',
    glow: 'bg-[#9c62c8]/18',
    logoSurface: 'border-[#bd91df]/15 bg-[#281334]/30',
    tag: 'border-[#bd91df]/20 bg-[#382047]/35 text-[#e3cbf4]',
    cta: 'group-hover:text-[#d3a8f0]',
  },
  'ea-app': {
    surface: 'from-[#612029] via-[#342126] to-[#171717]',
    border: 'border-[#c55a64]/25 hover:border-[#dd7780]/55',
    glow: 'bg-[#b53c47]/15',
    logoSurface: 'border-[#dd7780]/15 bg-[#311016]/28',
    tag: 'border-[#dd7780]/20 bg-[#451921]/32 text-[#efc3c7]',
    cta: 'group-hover:text-[#f09ca4]',
  },
  'ubisoft-store': {
    surface: 'from-[#264d79] via-[#202e48] to-[#171717]',
    border: 'border-[#6587c5]/25 hover:border-[#7c9bd5]/55',
    glow: 'bg-[#496fb1]/17',
    logoSurface: 'border-[#7c9bd5]/15 bg-[#111e39]/28',
    tag: 'border-[#7c9bd5]/20 bg-[#192a4b]/35 text-[#c7d7f2]',
    cta: 'group-hover:text-[#9db8e8]',
  },
  'battle-net': {
    surface: 'from-[#075a94] via-[#163b55] to-[#171717]',
    border: 'border-[#3d9bd8]/25 hover:border-[#5db8ee]/55',
    glow: 'bg-[#168bd2]/17',
    logoSurface: 'border-[#5db8ee]/15 bg-[#062b45]/28',
    tag: 'border-[#5db8ee]/20 bg-[#073a5d]/35 text-[#c3e8fc]',
    cta: 'group-hover:text-[#83cef5]',
  },
  'rockstar-store': {
    surface: 'from-[#72500f] via-[#352d1d] to-[#171717]',
    border: 'border-[#c99b3b]/25 hover:border-[#ddb45f]/55',
    glow: 'bg-[#d5a338]/14',
    logoSurface: 'border-[#ddb45f]/15 bg-[#302207]/28',
    tag: 'border-[#ddb45f]/20 bg-[#3c2b0d]/35 text-[#ead7ac]',
    cta: 'group-hover:text-[#e3c16f]',
  },
} satisfies Record<StoreSlug, StoreVisualTreatment>

const defaultStoreVisualTreatment: StoreVisualTreatment = {
  surface: 'from-[#343434] via-[#242424] to-[#171717]',
  border: 'border-white/10 hover:border-white/30',
  glow: 'bg-white/10',
  logoSurface: 'border-white/10 bg-black/15',
  tag: 'border-white/10 bg-white/[0.035] text-[#b7b6b3]',
  cta: 'group-hover:text-white',
}

export const storeVisualClassNames = Object.fromEntries(
  Object.entries(storeVisualTreatments).map(([slug, treatment]) => [
    slug,
    treatment.surface,
  ])
) as Record<StoreSlug, string>

export function getStoreVisualTreatment(slug: string): StoreVisualTreatment {
  return (
    storeVisualTreatments[slug as StoreSlug] ?? defaultStoreVisualTreatment
  )
}

export function getStoreVisualClassName(slug: string): string {
  return getStoreVisualTreatment(slug).surface
}
