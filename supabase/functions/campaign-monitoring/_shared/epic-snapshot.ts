/** Public membership only; never commercial identity or END authority. */
export type EpicSnapshotScope = Readonly<{
  store_slug: string
  market?: string
  source_uid: string
  source_url: string
  official_url: string
}>

export function isEpicTagOnlyCampaign(row: EpicSnapshotScope): boolean {
  if (row.store_slug !== 'epic-games-store' ||
      (row.market !== undefined && row.market !== 'US') ||
      !row.source_uid.startsWith('epic-storefront:') ||
      row.source_uid.length === 'epic-storefront:'.length) return false
  try {
    const source = new URL(row.source_url)
    const destination = new URL(row.official_url)
    const official = (url: URL) => url.origin === 'https://store.epicgames.com' &&
      !url.username && !url.password
    if (!official(source) || !official(destination) ||
        !/^\/(?:en-US\/)?sales-and-specials\/?$/.test(source.pathname) ||
        source.search || source.hash ||
        !/^\/(?:en-US\/)?browse\/?$/.test(destination.pathname)) return false
    const tags = destination.searchParams.getAll('tag')
    return tags.length === 1 && Boolean(tags[0].trim()) &&
      !/[|\u0000-\u001f\u007f\ufffd]/.test(tags[0])
  } catch {
    return false
  }
}

/** JSON generations are strings: never pass a PostgreSQL bigint through Number. */
export function scanGeneration(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new TypeError('Invalid Epic scan generation')
  }
  const canonical = value.replace(/^0+/, '')
  const maximum = '9223372036854775807'
  if (!canonical || canonical.length > maximum.length ||
      (canonical.length === maximum.length && canonical > maximum)) {
    throw new TypeError('Invalid Epic scan generation')
  }
  return canonical
}

export function nullableScanGeneration(value: unknown): string | null {
  return value === null ? null : scanGeneration(value)
}

export function isEpicSnapshotMember(
  row: EpicSnapshotScope & { epic_public_scan_generation: unknown },
  pointer: string | null
): boolean {
  const generation = nullableScanGeneration(row.epic_public_scan_generation)
  return !isEpicTagOnlyCampaign(row) || pointer === null || generation === pointer
}
