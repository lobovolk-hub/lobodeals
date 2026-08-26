export type SalesAvailability = Readonly<{
  storeSlug: string
  availability: 'available' | 'temporarily_unavailable'
}>

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
