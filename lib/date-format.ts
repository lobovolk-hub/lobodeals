import type { Locale } from './locale'
import type { CampaignBoundary } from './sales'

const englishMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const
export const spanishMonths = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const
const exactFormatters = {
  long: new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }),
  compact: new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }),
}
const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' })

function calendarParts(value: string): [string, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new RangeError('Cannot format an invalid campaign boundary')
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const limit = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  if (!limit || day < 1 || day > limit) throw new RangeError('Cannot format an invalid campaign boundary')
  return [match[1], month, day]
}

export function formatBoundary(boundary: CampaignBoundary, locale: Locale = 'en', style: 'long' | 'compact' = 'compact'): string {
  if (boundary.precision === 'date') {
    const [year, month, day] = calendarParts(boundary.date)
    return locale === 'es' ? `${day} ${spanishMonths[month - 1]} ${year}`
      : `${style === 'compact' ? englishMonths[month - 1].slice(0, 3) : englishMonths[month - 1]} ${day}, ${year}`
  }
  const instant = new Date(boundary.dateTime)
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Cannot format an invalid campaign boundary')
  if (locale === 'en') return `${exactFormatters[style].format(instant)} UTC`
  // Keep the existing hour/minute precision and UTC; only the calendar presentation changes.
  return `${instant.getUTCDate()} ${spanishMonths[instant.getUTCMonth()]} ${instant.getUTCFullYear()}, ${timeFormatter.format(instant)} UTC`
}
