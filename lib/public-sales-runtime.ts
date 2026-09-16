import type {
  CampaignBoundary,
  CampaignGroups,
  CampaignState,
  CampaignStore,
  CampaignWithStore,
  ExactDateTimeBoundary,
  PublicOfficialCampaign,
} from './sales'

export { formatBoundary as formatCompactCampaignBoundary } from './date-format'

export function getCampaignState(
  campaign: PublicOfficialCampaign,
  referenceTime?: Date
): CampaignState {
  if (campaign.lifecycle.basis === 'official-source') {
    if (referenceTime) {
      const now = referenceTime.getTime()

      if (!Number.isFinite(now)) {
        throw new RangeError(
          'Campaign state requires a valid reference time'
        )
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
    throw new RangeError(
      'Campaign state requires a valid reference time'
    )
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

function boundaryCalendarDate(
  boundary: CampaignBoundary
): string {
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

  const calendarDifference =
    boundaryCalendarDate(left).localeCompare(
      boundaryCalendarDate(right),
      'en'
    )

  if (calendarDifference !== 0) {
    return calendarDifference
  }

  if (
    left.precision === 'datetime' &&
    right.precision === 'datetime'
  ) {
    return Date.parse(left.dateTime) -
      Date.parse(right.dateTime)
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

  const nameDifference =
    left.campaign.name.localeCompare(
      right.campaign.name,
      'en'
    )

  if (nameDifference !== 0) return nameDifference

  return left.campaign.id.localeCompare(
    right.campaign.id,
    'en'
  )
}

export function groupPublicCampaigns(
  campaigns: readonly PublicOfficialCampaign[],
  stores: readonly CampaignStore[],
  referenceTime?: Date
): CampaignGroups {
  const live: CampaignWithStore[] = []
  const upcoming: CampaignWithStore[] = []

  const storesBySlug = new Map<string, CampaignStore>(
    stores.map(
      (store) => [store.slug, store] as const
    )
  )

  for (const campaign of campaigns) {
    const store = storesBySlug.get(
      campaign.storeSlug
    )

    if (!store) continue

    const entry = { campaign, store }

    const state = getCampaignState(
      campaign,
      referenceTime
    )

    if (state === 'live') live.push(entry)
    if (state === 'upcoming') upcoming.push(entry)
  }

  live.sort(
    (left, right) =>
      compareByBoundary(left, right, 'ends')
  )

  upcoming.sort(
    (left, right) =>
      compareByBoundary(left, right, 'starts')
  )

  return { live, upcoming }
}

export function getNextExactBoundary(
  campaigns: readonly PublicOfficialCampaign[],
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
      if (
        !boundary ||
        boundary.precision !== 'datetime'
      ) {
        continue
      }

      const boundaryTime = Date.parse(
        boundary.dateTime
      )

      if (
        boundaryTime > currentTime &&
        (
          nextBoundary === null ||
          boundaryTime < nextBoundary
        )
      ) {
        nextBoundary = boundaryTime
      }
    }
  }

  return nextBoundary
}
