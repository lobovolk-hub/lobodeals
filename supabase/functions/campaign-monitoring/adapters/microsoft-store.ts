import {
  campaign,
  isExcludedCampaignText,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import { extractAnchors, uniqueBy } from '../_shared/html.ts'
import { discoverOfficialArtwork } from '../_shared/artwork.ts'
import { fetchOfficialText } from '../_shared/http.ts'
import { verifyKnownCampaigns } from '../_shared/verification.ts'
import type { AdapterResult, StoreAdapter } from '../_shared/types.ts'

const SOURCE_URL = 'https://www.xbox.com/en-US/promotions/sales/sales-and-specials'

export const runMicrosoftStoreAdapter: StoreAdapter = async ({
  fetch,
  knownCampaigns = [],
}) => {
  const html = await fetchOfficialText(fetch, SOURCE_URL)
  const anchors = extractAnchors(html, SOURCE_URL)
  const metadataPattern =
    /"(CampsiteChannel\.Games\.Sale\.[^"]+)"\s*:\s*\{"type":2,"data":\{"channelTitleModuleData":(\{[^{}]*\})/gi
  const detected: { key: string; name: string }[] = []

  for (const match of html.matchAll(metadataPattern)) {
    try {
      const metadata = JSON.parse(match[2]) as { title?: unknown }
      const name = typeof metadata.title === 'string' ? metadata.title.trim() : ''
      if (
        name &&
        isSaleCampaignText(name) &&
        !isExcludedCampaignText(name)
      ) {
        detected.push({ key: match[1], name })
      }
    } catch {
      // Ignore malformed embedded metadata rather than reading the product grid.
    }
  }

  const campaigns = await Promise.all(
    uniqueBy(detected, ({ key }) => key.toLowerCase()).map(
      async ({ key, name }) => {
      const matchingLink = anchors.find(({ href }) =>
        new URL(href).pathname.toLowerCase().includes(key.toLowerCase())
      )
      const officialUrl =
        matchingLink?.href ?? `https://www.xbox.com/games/browse/${key}`
        return campaign({
        sourceUid: key.toLowerCase(),
        name,
        storeSlug: 'microsoft-store',
        state: 'live',
        lifecycleBasis: 'official-source',
        officialUrl,
          sourceUrl: SOURCE_URL,
          artworkUrl: await discoverOfficialArtwork(fetch, officialUrl),
        })
      }
    )
  )

  const explicitlyEndedSourceUids = await verifyKnownCampaigns(
    fetch,
    knownCampaigns,
    ['www.xbox.com']
  )

  return {
    storeSlug: 'microsoft-store',
    sourceUrl: SOURCE_URL,
    sourceUrls: [SOURCE_URL],
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
