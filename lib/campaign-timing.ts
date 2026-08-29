import type { CampaignBoundary, CampaignState } from './sales'

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
  label: 'Starts' | 'Started' | 'Ends',
  now: Date
): string | null {
  if (!Number.isFinite(now.getTime()) || label === 'Started') return null

  if (boundary.precision === 'date') {
    const days = Math.round(
      (dateOnlyEpoch(boundary.date) - localCalendarEpoch(now)) / DAY_MS
    )
    if (days < 0) return null

    if (days === 0) return `${label} today`
    if (days === 1) return `${label} tomorrow`
    return state === 'live' && label === 'Ends'
      ? `${days} days left`
      : `${label} in ${days} days`
  }

  const remaining = Date.parse(boundary.dateTime) - now.getTime()
  if (remaining <= 0) return null

  const days = Math.floor(remaining / DAY_MS)
  const hours = Math.floor((remaining % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS)
  const seconds = Math.floor((remaining % MINUTE_MS) / SECOND_MS)
  const prefix = label === 'Ends' ? 'Ends in' : 'Starts in'

  if (days > 0) return `${prefix} ${days}d ${hours}h ${minutes}m ${seconds}s`
  if (hours > 0) return `${prefix} ${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${prefix} ${minutes}m ${seconds}s`
  if (seconds > 0) return `${prefix} ${seconds}s`
  return `${prefix} <1s`
}
