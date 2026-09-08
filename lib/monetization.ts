import type { StoreSlug } from './stores'

export type StoreCreatorCode = Readonly<{
  code: string
  disclosure: string
}>

const storeCreatorCodes: Partial<Record<StoreSlug, StoreCreatorCode>> = {
  'epic-games-store': {
    code: 'LOBOVOLK',
    disclosure:
      'LoboDeals may earn from eligible purchases made with this code.',
  },
}

export function getStoreCreatorCode(
  storeSlug: string
): StoreCreatorCode | null {
  return storeCreatorCodes[storeSlug as StoreSlug] ?? null
}