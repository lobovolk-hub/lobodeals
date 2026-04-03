export const LANGUAGE_STORAGE_KEY = 'lobodeals-language'

export const LANGUAGE_OPTIONS = ['EN', 'ES'] as const
export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]

export const DEFAULT_LANGUAGE: LanguageCode = 'EN'

export function isLanguageCode(value: string): value is LanguageCode {
  return LANGUAGE_OPTIONS.includes(value as LanguageCode)
}

export function getLanguageLabel(language: LanguageCode) {
  switch (language) {
    case 'ES':
      return 'Spanish'
    case 'EN':
    default:
      return 'English'
  }
}

export function getLanguageDescription(language: LanguageCode) {
  switch (language) {
    case 'ES':
      return 'Spanish account preference saved. Interface translation can be expanded later.'
    case 'EN':
    default:
      return 'English remains the base interface language for LoboDeals right now.'
  }
}

export function getLanguageShortNote(language: LanguageCode) {
  switch (language) {
    case 'ES':
      return 'Preferred language set to Spanish.'
    case 'EN':
    default:
      return 'Preferred language set to English.'
  }
}