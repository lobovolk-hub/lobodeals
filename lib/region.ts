export const REGION_STORAGE_KEY = 'lobodeals-region'

export const REGION_OPTIONS = ['US', 'PE'] as const
export type RegionCode = (typeof REGION_OPTIONS)[number]

export const DEFAULT_REGION: RegionCode = 'US'

export function isRegionCode(value: string): value is RegionCode {
  return REGION_OPTIONS.includes(value as RegionCode)
}

export function getRegionLabel(region: RegionCode) {
  switch (region) {
    case 'PE':
      return 'Peru'
    case 'US':
    default:
      return 'United States'
  }
}

export function getRegionDescription(region: RegionCode) {
  switch (region) {
    case 'PE':
      return 'Use Peru as your preferred account region while pricing remains Steam US for now.'
    case 'US':
    default:
      return 'Best for current Steam US pricing while LoboDeals is still Steam-first.'
  }
}

export function getRegionShortNote(region: RegionCode) {
  switch (region) {
    case 'PE':
      return 'Account region set to Peru. Pricing still uses Steam US for now.'
    case 'US':
    default:
      return 'Showing Steam US pricing.'
  }
}