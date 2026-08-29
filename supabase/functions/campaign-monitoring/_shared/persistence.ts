import type { DetectedCampaign } from './types.ts'

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
  confirmedAt: string
): CampaignBaseRow {
  return {
    campaign_key: campaignKey,
    store_slug: entry.storeSlug,
    source_uid: entry.sourceUid,
    name: entry.name,
    market: 'US',
    state: entry.state,
    lifecycle_basis: entry.lifecycleBasis,
    starts_on: entry.starts?.precision === 'date' ? entry.starts.value : null,
    starts_at:
      entry.starts?.precision === 'datetime' ? entry.starts.value : null,
    ends_on: entry.ends?.precision === 'date' ? entry.ends.value : null,
    ends_at: entry.ends?.precision === 'datetime' ? entry.ends.value : null,
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
