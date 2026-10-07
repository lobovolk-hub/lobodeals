import { campaignBaseRow, artworkPatch } from './persistence.ts'
import { isEpicTagOnlyCampaign, nullableScanGeneration, scanGeneration } from './epic-snapshot.ts'
import type { DetectedCampaign, KnownCampaign } from './types.ts'
import type { ActiveCampaignIdentity } from './reconcile.ts'

export type KnownCampaignRow = Readonly<{
  campaign_key: string
  source_uid: string
  name: string
  state: 'live' | 'upcoming'
  official_url: string
  source_url: string
  starts_on: string | null
  starts_at: string | null
  ends_on: string | null
  ends_at: string | null
}>

export function knownCampaignFromRow(row: KnownCampaignRow): ActiveCampaignIdentity & KnownCampaign {
  return {
    ...row,
    campaignKey: row.campaign_key,
    sourceUid: row.source_uid,
    officialUrl: row.official_url,
    sourceUrl: row.source_url,
    startsOn: row.starts_on ?? undefined,
    startsAt: row.starts_at ?? undefined,
    endsOn: row.ends_on ?? undefined,
    endsAt: row.ends_at ?? undefined,
  }
}

export function parseEpicReservation(value: unknown) {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid Epic reservation')
  const result = value as Record<string, unknown>
  const generation = scanGeneration(result.generation)
  const basePointer = nullableScanGeneration(result.base_pointer)
  if (!Array.isArray(result.campaigns)) throw new TypeError('Invalid Epic baseline')
  const known = result.campaigns.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new TypeError('Invalid Epic known campaign')
    const row = entry as Record<string, unknown>
    for (const field of ['campaign_key', 'source_uid', 'name', 'official_url', 'source_url']) {
      if (typeof row[field] !== 'string' || !row[field]) throw new TypeError('Invalid Epic known identity')
    }
    if (row.state !== 'live' && row.state !== 'upcoming') throw new TypeError('Invalid Epic known state')
    for (const field of ['starts_on', 'starts_at', 'ends_on', 'ends_at']) {
      if (row[field] !== null && typeof row[field] !== 'string') throw new TypeError('Invalid Epic known timing')
    }
    return knownCampaignFromRow(row as KnownCampaignRow)
  })
  return { generation, basePointer, known }
}

export function prepareEpicPublication(
  keyed: readonly { entry: DetectedCampaign; key: string }[],
  generation: string,
  confirmedAt: string,
  previous: readonly KnownCampaign[]
) {
  const canonical = scanGeneration(generation)
  const campaigns = keyed.map(({ entry, key }) => {
    if (entry.storeSlug !== 'epic-games-store') throw new TypeError('Non-Epic snapshot campaign')
    const row = campaignBaseRow(entry, key, confirmedAt, previous.find((known) =>
      known.campaignKey === key && known.sourceUid === entry.sourceUid))
    return { ...row, epic_public_scan_generation: isEpicTagOnlyCampaign(row) ? canonical : null }
  })
  const artwork = keyed.flatMap(({ entry, key }) => {
    const patch = artworkPatch(entry, key)
    return patch ? [{ campaign_key: patch.campaignKey, artwork_url: patch.artworkUrl }] : []
  })
  return { campaigns, artwork }
}

export type EpicPublicationStatus = 'published' | 'already-published' | 'obsolete' | 'baseline-conflict'

export function parseEpicPublicationStatus(value: unknown): EpicPublicationStatus {
  if (value !== 'published' && value !== 'already-published' &&
      value !== 'obsolete' && value !== 'baseline-conflict') {
    throw new TypeError('Invalid Epic publication result')
  }
  return value
}
