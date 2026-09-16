import type { Locale } from './locale'
import { en, type MessageKey } from './messages/en'
import { es } from './messages/es'

export type { MessageKey }
export const dictionaries = { en, es } as const

export function t(locale: Locale, key: MessageKey, values: Record<string, string | number> = {}): string {
  const message = dictionaries[locale][key]
  if (message === undefined) throw new Error(`Unknown public message: ${key}`)
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    if (!(name in values)) throw new Error(`Missing message parameter: ${name}`)
    return String(values[name])
  })
}
