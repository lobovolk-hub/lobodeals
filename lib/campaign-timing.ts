import { t } from './i18n'
import type { Locale } from './locale'
import type { CampaignBoundary, CampaignState } from './sales'

export type TimingPurpose = 'start' | 'started' | 'end'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
const SECOND_MS = 1_000

function localCalendarEpoch(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
}

function dateOnlyEpoch(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function getCampaignCounter(
  boundary: CampaignBoundary,
  state: Extract<CampaignState, 'live' | 'upcoming'>,
  purpose: TimingPurpose,
  now: Date,
  locale: Locale = 'en'
): string | null {
  if (!Number.isFinite(now.getTime()) || purpose === 'started') return null

  if (boundary.precision === 'date') {
    const days = Math.round(
      (dateOnlyEpoch(boundary.date) - localCalendarEpoch(now)) / DAY_MS
    )
    if (days < 0) return null

    if (days === 0) return t(locale, purpose === 'end' ? 'Ends today' : 'Starts today')
    if (days === 1) return t(locale, purpose === 'end' ? 'Ends tomorrow' : 'Starts tomorrow')
    return state === 'live' && purpose === 'end'
      ? t(locale, '{days} days left', { days })
      : t(locale, purpose === 'end' ? 'Ends in {days} days' : 'Starts in {days} days', { days })
  }

  const remaining = Date.parse(boundary.dateTime) - now.getTime()
  if (remaining <= 0) return null

  const days = Math.floor(remaining / DAY_MS)
  const hours = Math.floor((remaining % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS)
  const seconds = Math.floor((remaining % MINUTE_MS) / SECOND_MS)
  const message = purpose === 'end' ? 'Ends in {duration}' : 'Starts in {duration}'
  const format = (duration: string) => t(locale, message, { duration })

  if (days > 0) return format(`${days}d ${hours}h ${minutes}m ${seconds}s`)
  if (hours > 0) return format(`${hours}h ${minutes}m ${seconds}s`)
  if (minutes > 0) return format(`${minutes}m ${seconds}s`)
  if (seconds > 0) return format(`${seconds}s`)
  return format(`<1s`)
}
