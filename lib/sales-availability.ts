const ALL_STORE_SLUGS = [
  'playstation-store',
  'nintendo-eshop',
  'microsoft-store',
  'steam',
  'epic-games-store',
  'gog',
  'ea-app',
  'ubisoft-store',
  'battle-net',
  'rockstar-store',
] as const

export type SalesAvailability = Readonly<{
  storeSlug: string
  availability: 'available' | 'temporarily_unavailable'
}>

export type SalesSelectionState =
  | 'content'
  | 'content-with-availability-notice'
  | 'empty'
  | 'unavailable'

export type PlatformSalesState = SalesSelectionState

export function isSalesUnavailableForStores(
  availability: readonly SalesAvailability[],
  storeSlugs: readonly string[],
  sourceUnavailable: boolean
): boolean {
  if (sourceUnavailable) return true
  const availabilityByStore = new Map(
    availability.map((entry) => [entry.storeSlug, entry.availability])
  )

  return storeSlugs.some(
    (storeSlug) => availabilityByStore.get(storeSlug) !== 'available'
  )
}

export function getSalesSelectionState({
  selectedStoreSlug,
  campaignCount,
  availability,
  sourceUnavailable,
}: Readonly<{
  selectedStoreSlug: string | null
  campaignCount: number
  availability: readonly SalesAvailability[]
  sourceUnavailable: boolean
}>): SalesSelectionState {
  if (selectedStoreSlug === null) {
    if (campaignCount > 0) return 'content'

    const unavailable = isSalesUnavailableForStores(
      availability,
      ALL_STORE_SLUGS,
      sourceUnavailable
    )

    return unavailable ? 'unavailable' : 'empty'
  }

  const unavailable = isSalesUnavailableForStores(
    availability,
    [selectedStoreSlug],
    sourceUnavailable
  )

  if (campaignCount > 0) {
    return unavailable ? 'content-with-availability-notice' : 'content'
  }
  return unavailable ? 'unavailable' : 'empty'
}

export function getPlatformSalesState({
  storeSlugs,
  campaignCount,
  availability,
  sourceUnavailable,
}: Readonly<{
  storeSlugs: readonly string[]
  campaignCount: number
  availability: readonly SalesAvailability[]
  sourceUnavailable: boolean
}>): PlatformSalesState {
  const availabilityByStore = new Map(
    availability.map((entry) => [entry.storeSlug, entry.availability])
  )
  const hasUsableStore =
    !sourceUnavailable &&
    storeSlugs.some(
      (storeSlug) => availabilityByStore.get(storeSlug) === 'available'
    )

  if (campaignCount > 0) {
    return hasUsableStore ? 'content' : 'content-with-availability-notice'
  }

  return hasUsableStore ? 'empty' : 'unavailable'
}
