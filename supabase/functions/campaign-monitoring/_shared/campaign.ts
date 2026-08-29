import type {
  CampaignState,
  DetectedCampaign,
  SourceBoundary,
  StoreSlug,
} from './types.ts'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const EXACT_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/

const EXCLUDED_CAMPAIGN_PATTERN =
  /\b(?:free(?:bie| game| weekend| play days?)|demo|giveaway|hardware|console|controller|headset|merch|apparel|collectible|subscription giveaway)\b/i

export function isExcludedCampaignText(value: string): boolean {
  return EXCLUDED_CAMPAIGN_PATTERN.test(value)
}

export function isSaleCampaignText(value: string): boolean {
  return /\b(?:sale|sales|deals|savings|save up to|discount event|fest)\b/i.test(
    value
  )
}

export function dateBoundary(value: string): SourceBoundary {
  if (!DATE_PATTERN.test(value)) throw new Error(`Invalid date-only value: ${value}`)
  return { precision: 'date', value }
}

export function exactBoundary(value: string): SourceBoundary {
  if (!EXACT_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid exact datetime value: ${value}`)
  }
  return { precision: 'datetime', value }
}

function boundaryEpoch(boundary?: SourceBoundary): number | null {
  return boundary?.precision === 'datetime' ? Date.parse(boundary.value) : null
}

export function exactTimeState(
  starts: SourceBoundary,
  ends: SourceBoundary,
  now: Date
): CampaignState {
  const start = boundaryEpoch(starts)
  const end = boundaryEpoch(ends)
  if (start === null || end === null || end <= start) {
    throw new Error('Exact-time lifecycle requires ordered exact instants')
  }

  const current = now.getTime()
  if (current < start) return 'upcoming'
  if (current >= end) return 'ended'
  return 'live'
}

export function expireAtExactEnd(
  reportedState: Exclude<CampaignState, 'ended'>,
  ends: SourceBoundary | undefined,
  now: Date
): CampaignState {
  const end = boundaryEpoch(ends)
  return end !== null && now.getTime() >= end ? 'ended' : reportedState
}

export function campaign(input: {
  sourceUid: string
  name: string
  storeSlug: StoreSlug
  state: CampaignState
  lifecycleBasis: 'official-source' | 'exact-time'
  starts?: SourceBoundary
  ends?: SourceBoundary
  officialUrl: string
  sourceUrl: string
  artworkUrl?: string
}): DetectedCampaign {
  return {
    ...input,
    sourceUid: input.sourceUid.trim(),
    name: input.name.replace(/\s+/g, ' ').trim(),
  }
}

export function monthNumber(name: string): number | null {
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ]
  const normalized = name.toLowerCase()
  const exact = months.indexOf(normalized)
  if (exact >= 0) return exact + 1
  const abbreviated = months.findIndex((month) => month.startsWith(normalized))
  return abbreviated >= 0 ? abbreviated + 1 : null
}

export function canonicalDate(year: number, month: number, day: number): string {
  const date = `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`
  if (!DATE_PATTERN.test(date)) throw new Error('Invalid calendar date')
  return date
}
