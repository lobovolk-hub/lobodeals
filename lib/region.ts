export type RegionCode = 'GLOBAL' | 'US' | 'PE' | 'EU'

export const REGION_STORAGE_KEY = 'lobodeals-region'

export const REGION_OPTIONS: { value: RegionCode; label: string }[] = [
  { value: 'GLOBAL', label: 'Global' },
  { value: 'US', label: 'United States' },
  { value: 'PE', label: 'Peru' },
  { value: 'EU', label: 'Europe' },
]

export function isRegionCode(value: string): value is RegionCode {
  return ['GLOBAL', 'US', 'PE', 'EU'].includes(value)
}

export function getRegionLabel(region: RegionCode) {
  switch (region) {
    case 'US':
      return 'United States'
    case 'PE':
      return 'Peru'
    case 'EU':
      return 'Europe'
    case 'GLOBAL':
    default:
      return 'Global'
  }
}

export function getRegionDescription(region: RegionCode) {
  switch (region) {
    case 'US':
      return 'Displayed prices are compared against U.S.-style storefront pricing when possible. Taxes may still vary at checkout.'
    case 'PE':
      return 'Displayed prices may differ from final Peru checkout totals because storefront taxes, currency conversion, and regional pricing can vary.'
    case 'EU':
      return 'Displayed prices may differ from final Europe checkout totals depending on VAT, currency, and storefront regional policies.'
    case 'GLOBAL':
    default:
      return 'Displayed prices are shown as source/storefront values and may differ by taxes, currency, or region.'
  }
}

export function getRegionShortNote(region: RegionCode) {
  switch (region) {
    case 'US':
      return 'US storefront view'
    case 'PE':
      return 'Peru storefront view'
    case 'EU':
      return 'Europe storefront view'
    case 'GLOBAL':
    default:
      return 'Global storefront view'
  }
}