import { getStoreBySlug, type Platform, type Store } from './stores'

export type DateOnlyBoundary = Readonly<{
  precision: 'date'
  date: string
}>

export type ExactDateTimeBoundary = Readonly<{
  precision: 'datetime'
  dateTime: string
}>

export type CampaignBoundary = DateOnlyBoundary | ExactDateTimeBoundary

export type CampaignLifecycle =
  | Readonly<{
      basis: 'official-source'
      status: 'live' | 'upcoming'
    }>
  | Readonly<{
      basis: 'exact-time'
    }>

export type OfficialCampaign = Readonly<{
  id: string
  name: string
  storeSlug: string
  market: 'US'
  starts?: CampaignBoundary
  ends?: CampaignBoundary
  lifecycle: CampaignLifecycle
  officialUrl: string
  artworkUrl?: string
}>

export type CampaignState = 'live' | 'upcoming' | 'expired' | 'indeterminate'

export type CampaignWithStore = Readonly<{
  campaign: OfficialCampaign
  store: Store
}>

export type CampaignGroups = Readonly<{
  live: readonly CampaignWithStore[]
  upcoming: readonly CampaignWithStore[]
}>

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const EXACT_DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const
const exactDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC',
})
const compactExactDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC',
})

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function isCanonicalDate(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value)

  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

export function isExactDateTime(value: string): boolean {
  const match = EXACT_DATE_TIME_PATTERN.exec(value)

  return Boolean(
    match && isCanonicalDate(match[1]) && Number.isFinite(Date.parse(value))
  )
}

export function isCampaignBoundary(
  value: unknown
): value is CampaignBoundary {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>

  if (candidate.precision === 'date') {
    return (
      typeof candidate.date === 'string' && isCanonicalDate(candidate.date)
    )
  }

  return (
    candidate.precision === 'datetime' &&
    typeof candidate.dateTime === 'string' &&
    isExactDateTime(candidate.dateTime)
  )
}

function isAbsoluteHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false

  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

function isCampaignLifecycle(value: unknown): value is CampaignLifecycle {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>

  if (candidate.basis === 'official-source') {
    return candidate.status === 'live' || candidate.status === 'upcoming'
  }

  return candidate.basis === 'exact-time' && candidate.status === undefined
}

export function isOfficialCampaign(value: unknown): value is OfficialCampaign {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>

  if (
    typeof candidate.id !== 'string' ||
    !ID_PATTERN.test(candidate.id) ||
    typeof candidate.name !== 'string' ||
    !candidate.name.trim() ||
    typeof candidate.storeSlug !== 'string' ||
    !getStoreBySlug(candidate.storeSlug) ||
    candidate.market !== 'US' ||
    !isCampaignLifecycle(candidate.lifecycle) ||
    !isAbsoluteHttpsUrl(candidate.officialUrl) ||
    (candidate.artworkUrl !== undefined &&
      !isAbsoluteHttpsUrl(candidate.artworkUrl))
  ) {
    return false
  }

  if (candidate.starts !== undefined && !isCampaignBoundary(candidate.starts)) {
    return false
  }

  if (candidate.ends !== undefined && !isCampaignBoundary(candidate.ends)) {
    return false
  }

  const starts = candidate.starts
  const ends = candidate.ends
  const lifecycle = candidate.lifecycle

  if (lifecycle.basis === 'exact-time') {
    if (
      !starts ||
      starts.precision !== 'datetime' ||
      !ends ||
      ends.precision !== 'datetime'
    ) {
      return false
    }

    return Date.parse(ends.dateTime) > Date.parse(starts.dateTime)
  }

  if (starts?.precision === 'date' && ends?.precision === 'date') {
    return ends.date >= starts.date
  }

  if (starts?.precision === 'datetime' && ends?.precision === 'datetime') {
    return Date.parse(ends.dateTime) > Date.parse(starts.dateTime)
  }

  return true
}

export function validateOfficialCampaigns(
  campaigns: readonly unknown[]
): readonly OfficialCampaign[] {
  const ids = new Set<string>()

  for (const [index, campaign] of campaigns.entries()) {
    if (!isOfficialCampaign(campaign)) {
      throw new TypeError(`Invalid official campaign at index ${index}`)
    }

    if (ids.has(campaign.id)) {
      throw new TypeError(`Duplicate official campaign id: ${campaign.id}`)
    }

    ids.add(campaign.id)
  }

  return campaigns as readonly OfficialCampaign[]
}

export function formatCampaignBoundary(boundary: CampaignBoundary): string {
  if (!isCampaignBoundary(boundary)) {
    throw new RangeError('Cannot format an invalid campaign boundary')
  }

  if (boundary.precision === 'date') {
    const match = DATE_ONLY_PATTERN.exec(boundary.date)

    if (!match) {
      throw new RangeError('Cannot format an invalid campaign boundary')
    }

    const month = Number(match[2])
    const day = Number(match[3])

    return `${MONTH_NAMES[month - 1]} ${day}, ${match[1]}`
  }

  return `${exactDateTimeFormatter.format(new Date(boundary.dateTime))} UTC`
}

export function formatCompactCampaignBoundary(
  boundary: CampaignBoundary
): string {
  if (!isCampaignBoundary(boundary)) {
    throw new RangeError('Cannot format an invalid campaign boundary')
  }

  if (boundary.precision === 'date') {
    const match = DATE_ONLY_PATTERN.exec(boundary.date)

    if (!match) {
      throw new RangeError('Cannot format an invalid campaign boundary')
    }

    const month = Number(match[2])
    const day = Number(match[3])

    return `${MONTH_NAMES[month - 1].slice(0, 3)} ${day}, ${match[1]}`
  }

  return `${compactExactDateTimeFormatter.format(
    new Date(boundary.dateTime)
  )} UTC`
}

export function getCampaignState(
  campaign: OfficialCampaign,
  referenceTime?: Date
): CampaignState {
  if (campaign.lifecycle.basis === 'official-source') {
    if (referenceTime) {
      const now = referenceTime.getTime()

      if (!Number.isFinite(now)) {
        throw new RangeError('Campaign state requires a valid reference time')
      }

      if (
        campaign.ends?.precision === 'datetime' &&
        now >= Date.parse(campaign.ends.dateTime)
      ) {
        return 'expired'
      }

      if (
        campaign.lifecycle.status === 'upcoming' &&
        campaign.starts?.precision === 'datetime' &&
        now >= Date.parse(campaign.starts.dateTime)
      ) {
        return 'live'
      }
    }

    return campaign.lifecycle.status
  }

  if (!referenceTime) return 'indeterminate'

  const now = referenceTime.getTime()

  if (!Number.isFinite(now)) {
    throw new RangeError('Campaign state requires a valid reference time')
  }

  const start = Date.parse(
    (campaign.starts as ExactDateTimeBoundary).dateTime
  )
  const end = Date.parse(
    (campaign.ends as ExactDateTimeBoundary).dateTime
  )

  if (now < start) return 'upcoming'
  if (now >= end) return 'expired'
  return 'live'
}

function boundaryCalendarDate(boundary: CampaignBoundary): string {
  return boundary.precision === 'date'
    ? boundary.date
    : boundary.dateTime.slice(0, 10)
}

function compareBoundaries(
  left?: CampaignBoundary,
  right?: CampaignBoundary
): number {
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1

  const calendarDifference = boundaryCalendarDate(left).localeCompare(
    boundaryCalendarDate(right),
    'en'
  )

  if (calendarDifference !== 0) return calendarDifference

  if (left.precision === 'datetime' && right.precision === 'datetime') {
    return Date.parse(left.dateTime) - Date.parse(right.dateTime)
  }

  return 0
}

function compareByBoundary(
  left: CampaignWithStore,
  right: CampaignWithStore,
  boundary: 'starts' | 'ends'
): number {
  const difference = compareBoundaries(
    left.campaign[boundary],
    right.campaign[boundary]
  )

  if (difference !== 0) return difference

  const nameDifference = left.campaign.name.localeCompare(
    right.campaign.name,
    'en'
  )

  if (nameDifference !== 0) return nameDifference
  return left.campaign.id.localeCompare(right.campaign.id, 'en')
}

export function groupCampaigns(
  campaigns: readonly OfficialCampaign[],
  referenceTime?: Date
): CampaignGroups {
  const live: CampaignWithStore[] = []
  const upcoming: CampaignWithStore[] = []

  for (const campaign of campaigns) {
    const store = getStoreBySlug(campaign.storeSlug)

    if (!store) continue

    const entry = { campaign, store }
    const state = getCampaignState(campaign, referenceTime)

    if (state === 'live') live.push(entry)
    if (state === 'upcoming') upcoming.push(entry)
  }

  live.sort((left, right) => compareByBoundary(left, right, 'ends'))
  upcoming.sort((left, right) => compareByBoundary(left, right, 'starts'))

  return { live, upcoming }
}

export function getCampaignsByStore(
  campaigns: readonly OfficialCampaign[],
  storeSlug: string
): readonly OfficialCampaign[] {
  return campaigns.filter((campaign) => campaign.storeSlug === storeSlug)
}

export function getCampaignsByPlatform(
  campaigns: readonly OfficialCampaign[],
  platform: Platform
): readonly OfficialCampaign[] {
  return campaigns.filter((campaign) =>
    getStoreBySlug(campaign.storeSlug)?.platforms.includes(platform)
  )
}

export function getNextExactBoundary(
  campaigns: readonly OfficialCampaign[],
  currentTime: number
): number | null {
  let nextBoundary: number | null = null

  for (const campaign of campaigns) {
    const boundaries =
      campaign.lifecycle.basis === 'exact-time'
        ? [campaign.starts, campaign.ends]
        : [
            campaign.lifecycle.status === 'upcoming'
              ? campaign.starts
              : undefined,
            campaign.ends,
          ]

    for (const boundary of boundaries) {
      if (!boundary || boundary.precision !== 'datetime') continue

      const boundaryTime = Date.parse(boundary.dateTime)

      if (
        boundaryTime > currentTime &&
        (nextBoundary === null || boundaryTime < nextBoundary)
      ) {
        nextBoundary = boundaryTime
      }
    }
  }

  return nextBoundary
}
