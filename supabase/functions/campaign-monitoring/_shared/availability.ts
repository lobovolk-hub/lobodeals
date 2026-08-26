export type HealthStatus = 'never-run' | 'healthy' | 'error' | 'blocked'

export type PublicAvailability = Readonly<{
  store_slug: string
  availability: 'available' | 'temporarily_unavailable'
}>

export function toPublicAvailability(
  storeSlugs: readonly string[],
  rows: readonly Readonly<{ store_slug: string; status: HealthStatus }>[]
): readonly PublicAvailability[] {
  const statuses = new Map(rows.map((row) => [row.store_slug, row.status]))

  return storeSlugs.map((store_slug) => ({
    store_slug,
    availability:
      statuses.get(store_slug) === 'healthy'
        ? 'available'
        : 'temporarily_unavailable',
  }))
}
