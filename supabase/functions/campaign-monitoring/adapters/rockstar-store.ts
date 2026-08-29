import {
  campaign,
  isExcludedCampaignText,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import { extractAnchors, uniqueBy } from '../_shared/html.ts'
import { discoverOfficialArtwork } from '../_shared/artwork.ts'
import { fetchOfficialText } from '../_shared/http.ts'
import { AdapterError } from '../_shared/types.ts'
import { verifyKnownCampaigns } from '../_shared/verification.ts'
import type { AdapterResult, StoreAdapter } from '../_shared/types.ts'

const SOURCE_URL = 'https://www.rockstargames.com/newswire?tag_id=43'

export const runRockstarStoreAdapter: StoreAdapter = async ({
  fetch,
  knownCampaigns = [],
}) => {
  const html = await fetchOfficialText(fetch, SOURCE_URL)
  const links = uniqueBy(
    extractAnchors(html, SOURCE_URL).filter(({ href, label }) => {
      const url = new URL(href)
      return (
        url.hostname === 'www.rockstargames.com' &&
        url.pathname.includes('/newswire/article/') &&
        /rockstar store/i.test(label) &&
        isSaleCampaignText(label) &&
        !isExcludedCampaignText(label)
      )
    }),
    ({ href }) => href
  )

  if (links.length === 0) {
    throw new AdapterError(
      'OFFICIAL_SOURCE_AUTOMATION_BLOCKED',
      'Rockstar Newswire returned no server-rendered Store sale campaign links through an honest standard HTTP request',
      true
    )
  }

  const campaigns = await Promise.all(
    links.map(async ({ href, label }) =>
      campaign({
        sourceUid: href,
        name: label,
        storeSlug: 'rockstar-store',
        state: 'live',
        lifecycleBasis: 'official-source',
        officialUrl: href,
        sourceUrl: SOURCE_URL,
        artworkUrl: await discoverOfficialArtwork(fetch, href),
      })
    )
  )
  const explicitlyEndedSourceUids = await verifyKnownCampaigns(
    fetch,
    knownCampaigns,
    ['www.rockstargames.com']
  )
  return {
    storeSlug: 'rockstar-store',
    sourceUrl: SOURCE_URL,
    sourceUrls: [SOURCE_URL],
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
