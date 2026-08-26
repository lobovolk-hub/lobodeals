import type {
  DetectedCampaign,
  SourceCoverage,
} from './types.ts'

export type ActiveCampaignIdentity = Readonly<{
  campaign_key: string
  source_uid: string
  ends_at: string | null
}>

export function campaignKeysToEnd(input: Readonly<{
  sourceSucceeded: boolean
  coverage: SourceCoverage
  activeCampaigns: readonly ActiveCampaignIdentity[]
  detectedCampaigns: readonly DetectedCampaign[]
  explicitlyEndedSourceUids: readonly string[]
  now: Date
}>): readonly string[] {
  if (!input.sourceSucceeded) return []

  const detectedBySourceUid = new Map(
    input.detectedCampaigns.map((campaign) => [campaign.sourceUid, campaign])
  )
  const explicitlyEnded = new Set(input.explicitlyEndedSourceUids)
  const completeSnapshot =
    input.coverage === 'authoritative-complete-current-set'

  return input.activeCampaigns
    .filter((active) => {
      if (explicitlyEnded.has(active.source_uid)) return true

      const detected = detectedBySourceUid.get(active.source_uid)
      if (detected?.state === 'ended') return true

      if (
        active.ends_at &&
        Number.isFinite(Date.parse(active.ends_at)) &&
        input.now.getTime() >= Date.parse(active.ends_at)
      ) {
        return true
      }

      return completeSnapshot && !detected
    })
    .map(({ campaign_key }) => campaign_key)
}
