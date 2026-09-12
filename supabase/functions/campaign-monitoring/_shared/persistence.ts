import type { DetectedCampaign, KnownCampaign, SourceBoundary } from './types.ts'

function priorBoundary(date?: string, instant?: string): SourceBoundary | undefined {
  if (date && !instant) return { precision: 'date', value: date }
  if (instant && !date) return { precision: 'datetime', value: instant }
  return undefined
}

function compatibleBoundary(
  boundary: SourceBoundary | undefined,
  kind: 'starts' | 'ends',
  state: DetectedCampaign['state'],
  now: Date
): SourceBoundary | undefined {
  if (!boundary || state === 'ended') return boundary
  let past: boolean
  let future: boolean
  if (boundary.precision === 'datetime') {
    const instant = Date.parse(boundary.value)
    if (!Number.isFinite(instant)) return undefined
    past = instant <= now.getTime()
    future = instant > now.getTime()
  } else {
    // Compare calendar dates only. A boundary is contradictory only when
    // past/future across all timezone offsets; never invent a source instant.
    past = boundary.value < new Date(now.getTime() - 12 * 3_600_000).toISOString().slice(0, 10)
    future = boundary.value > new Date(now.getTime() + 14 * 3_600_000).toISOString().slice(0, 10)
  }
  if (kind === 'ends' && past) return undefined
  if (kind === 'starts' && (state === 'upcoming' ? past : future)) return undefined
  return boundary
}

export function mergedCampaignTiming(
  entry: DetectedCampaign,
  previous: KnownCampaign | undefined,
  now: Date
): Pick<DetectedCampaign, 'starts' | 'ends'> {
  const known = previous?.sourceUid === entry.sourceUid ? previous : undefined
  let starts = entry.starts ?? compatibleBoundary(
    priorBoundary(known?.startsOn, known?.startsAt), 'starts', entry.state, now
  )
  let ends = entry.ends ?? compatibleBoundary(
    priorBoundary(known?.endsOn, known?.endsAt), 'ends', entry.state, now
  )
  // A fresh boundary also supersedes an incompatible retained opposite bound.
  if (starts && ends) {
    let reversed: boolean
    if (starts.precision === 'datetime' && ends.precision === 'datetime') {
      reversed = Date.parse(starts.value) >= Date.parse(ends.value)
    } else if (starts.precision === 'date' && ends.precision === 'date') {
      reversed = starts.value > ends.value
    } else if (starts.precision === 'date') {
      // Even the latest calendar date at the exact end precedes this start.
      reversed = starts.value > new Date(Date.parse(ends.value) + 14 * 3_600_000).toISOString().slice(0, 10)
    } else {
      // Even the earliest calendar date at the exact start follows this end.
      reversed = new Date(Date.parse(starts.value) - 12 * 3_600_000).toISOString().slice(0, 10) > ends.value
    }
    if (reversed) {
      if (!entry.starts) starts = undefined
      if (!entry.ends) ends = undefined
    }
  }
  return { starts, ends }
}

export type CampaignBaseRow = Readonly<{
  campaign_key: string
  store_slug: DetectedCampaign['storeSlug']
  source_uid: string
  name: string
  market: 'US'
  state: DetectedCampaign['state']
  lifecycle_basis: DetectedCampaign['lifecycleBasis']
  starts_on: string | null
  starts_at: string | null
  ends_on: string | null
  ends_at: string | null
  official_url: string
  source_url: string
  last_confirmed_at: string
  updated_at: string
}>

export type ArtworkPatch = Readonly<{
  campaignKey: string
  artworkUrl: string
}>

export function campaignBaseRow(
  entry: DetectedCampaign,
  campaignKey: string,
  confirmedAt: string,
  previous?: KnownCampaign
): CampaignBaseRow {
  const { starts, ends } = mergedCampaignTiming(entry, previous, new Date(confirmedAt))
  return {
    campaign_key: campaignKey,
    store_slug: entry.storeSlug,
    source_uid: entry.sourceUid,
    name: entry.name,
    market: 'US',
    state: entry.state,
    lifecycle_basis: entry.lifecycleBasis,
    starts_on: starts?.precision === 'date' ? starts.value : null,
    starts_at:
      starts?.precision === 'datetime' ? starts.value : null,
    ends_on: ends?.precision === 'date' ? ends.value : null,
    ends_at: ends?.precision === 'datetime' ? ends.value : null,
    official_url: entry.officialUrl,
    source_url: entry.sourceUrl,
    last_confirmed_at: confirmedAt,
    updated_at: confirmedAt,
  }
}

export function artworkPatch(
  entry: DetectedCampaign,
  campaignKey: string
): ArtworkPatch | null {
  return entry.artworkUrl
    ? { campaignKey, artworkUrl: entry.artworkUrl }
    : null
}
