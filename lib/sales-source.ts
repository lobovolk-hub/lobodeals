import type { OfficialCampaign } from './sales'

const EMPTY_CAMPAIGN_FEED: readonly OfficialCampaign[] = Object.freeze([])

/**
 * Local source boundary for the approved future Sales backend.
 *
 * MACROBLOQUE A intentionally returns no campaign records: it does not use a
 * manual campaign registry, crawl product catalogs, or connect to legacy
 * persistence infrastructure. The backend adapter can replace this function
 * without changing the public campaign model or page components.
 */
export async function loadOfficialCampaigns(): Promise<
  readonly OfficialCampaign[]
> {
  return EMPTY_CAMPAIGN_FEED
}
