import {
  campaign,
  exactTimeState,
  expireAtExactEnd,
  isExcludedCampaignText,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import { extractAnchors, extractMeta, textFromHtml, uniqueBy } from '../_shared/html.ts'
import { extractOfficialArtwork } from '../_shared/artwork.ts'
import { fetchOfficialText } from '../_shared/http.ts'
import { extractExactEnglishDateTimes } from '../_shared/time.ts'
import { AdapterError } from '../_shared/types.ts'
import { verifyKnownCampaigns } from '../_shared/verification.ts'
import type { AdapterResult, DetectedCampaign, StoreAdapter } from '../_shared/types.ts'

const STORE_URL = 'https://store.playstation.com/en-us/pages/latest'
const BLOG_URL = 'https://blog.playstation.com/category/ps-store/'

type StoreLink = Readonly<{ type?: string; target?: string; localizedName?: string }>
type StoreComponent = Readonly<{
  altText?: string
  name?: string
  text?: string
  link?: StoreLink
}>
type StoreView = Readonly<{
  components?: readonly StoreComponent[]
  childViews?: readonly StoreView[]
}>

async function storeModuleLinks(
  fetcher: typeof fetch,
  storeHtml: string
): Promise<Readonly<{ links: readonly { href: string; label: string }[]; graphqlUrl: string }>> {
  const nextData = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
    storeHtml
  )
  if (!nextData) {
    throw new AdapterError(
      'OFFICIAL_STORE_CONTRACT_UNAVAILABLE',
      'PlayStation Store latest did not expose its public runtime contract',
      true
    )
  }
  const runtime = JSON.parse(nextData[1]) as {
    runtimeConfig?: {
      emsClientId?: string
      service?: { gqlBrowser?: { host?: string } }
    }
  }
  const clientId = runtime.runtimeConfig?.emsClientId
  const graphqlUrl = runtime.runtimeConfig?.service?.gqlBrowser?.host
  if (!clientId || !graphqlUrl) {
    throw new AdapterError(
      'OFFICIAL_STORE_CONTRACT_UNAVAILABLE',
      'PlayStation Store latest omitted its campaign-module service metadata',
      true
    )
  }

  const componentSelection = `
    __typename
    ... on EMSImageComponent { altText link { type target localizedName } }
    ... on EMSTextComponent { name text link { type target localizedName } }
  `
  const query = `
    query CampaignModules($clientId: ID!, $alias: ID) {
      emsExperienceRetrieve(clientId: $clientId, alias: $alias) {
        views {
          __typename
          ... on EMSView { components { ${componentSelection} } }
          ... on EMSViewCollection {
            childViews { components { ${componentSelection} } }
          }
        }
      }
    }
  `
  const responseText = await fetchOfficialText(fetcher, graphqlUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: 'https://store.playstation.com',
      Referer: STORE_URL,
    },
    body: JSON.stringify({ query, variables: { clientId, alias: 'latest' } }),
  })
  const response = JSON.parse(responseText) as {
    data?: { emsExperienceRetrieve?: { views?: readonly StoreView[] } }
    errors?: readonly unknown[]
  }
  if (response.errors?.length || !response.data?.emsExperienceRetrieve?.views) {
    throw new AdapterError(
      'OFFICIAL_STORE_CONTRACT_UNAVAILABLE',
      'PlayStation Store campaign-module service returned no usable official view',
      true
    )
  }
  const views = response.data.emsExperienceRetrieve.views
  const components = views.flatMap((view) => [
    ...(view.components ?? []),
    ...(view.childViews ?? []).flatMap((child) => child.components ?? []),
  ])
  const links = uniqueBy(
    components.flatMap((component) => {
      const target = component.link?.target
      const label = [
        component.link?.localizedName,
        component.altText,
        component.name,
        component.text,
      ]
        .filter(Boolean)
        .join(' ')
      if (!target || !isSaleCampaignText(label) || isExcludedCampaignText(label)) {
        return []
      }
      try {
        const href = new URL(target, STORE_URL).toString()
        const url = new URL(href)
        if (
          url.hostname !== 'store.playstation.com' ||
          !/^\/en-us\/(?:pages|category)\//i.test(url.pathname) ||
          /^\/en-us\/pages\/(?:latest|deals|collections)\/?$/i.test(
            url.pathname
          )
        ) {
          return []
        }
        return [{ href, label }]
      } catch {
        return []
      }
    }),
    ({ href }) => href
  )
  return { links, graphqlUrl }
}

async function campaignFromPage(
  now: Date,
  fetcher: typeof fetch,
  href: string,
  label: string,
  sourceUrl: string
): Promise<DetectedCampaign | null> {
  const html = await fetchOfficialText(fetcher, href)
  const title = (extractMeta(html, 'og:title') ?? label)
    .replace(/\s*[–—|-]\s*PlayStation(?:\.Blog| Store)?.*$/i, '')
    .trim()
  const text = textFromHtml(html)
  if (!isSaleCampaignText(`${title} ${text.slice(0, 800)}`)) return null
  if (isExcludedCampaignText(title)) return null

  const exact = extractExactEnglishDateTimes(text)
  if (exact.length >= 2) {
    const starts = exact[0]
    const ends = exact[exact.length - 1]
    if (Date.parse(ends.value) <= Date.parse(starts.value)) return null
    return campaign({
      sourceUid: href,
      name: title,
      storeSlug: 'playstation-store',
      state: exactTimeState(starts, ends, now),
      lifecycleBasis: 'exact-time',
      starts,
      ends,
      officialUrl: href,
      sourceUrl,
      artworkUrl: extractOfficialArtwork(html, href),
    })
  }

  if (exact.length === 1 && /\b(?:ends|until|through)\b/i.test(text)) {
    const ends = exact[0]
    return campaign({
      sourceUid: href,
      name: title,
      storeSlug: 'playstation-store',
      state: expireAtExactEnd('live', ends, now),
      lifecycleBasis: 'official-source',
      ends,
      officialUrl: href,
      sourceUrl,
      artworkUrl: extractOfficialArtwork(html, href),
    })
  }

  return campaign({
    sourceUid: href,
    name: title,
    storeSlug: 'playstation-store',
    state: 'live',
    lifecycleBasis: 'official-source',
    officialUrl: href,
    sourceUrl,
    artworkUrl: extractOfficialArtwork(html, href),
  })
}

export const runPlayStationStoreAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const [storeHtml, blogHtml] = await Promise.all([
    fetchOfficialText(fetch, STORE_URL),
    fetchOfficialText(fetch, BLOG_URL),
  ])
  let storeModules: Awaited<ReturnType<typeof storeModuleLinks>>
  try {
    storeModules = await storeModuleLinks(fetch, storeHtml)
  } catch (error) {
    if (error instanceof AdapterError) {
      throw new AdapterError(
        'OFFICIAL_STORE_MODULES_UNAVAILABLE',
        `PlayStation Store latest campaign modules are unavailable to server-side monitoring (${error.code}); PlayStation Blog remains complementary, not a complete substitute`,
        true
      )
    }
    throw error
  }
  const storeLinks = storeModules.links

  const blogLinks = uniqueBy(
    extractAnchors(blogHtml, BLOG_URL).filter(({ href, label }) => {
      const url = new URL(href)
      return (
        url.hostname === 'blog.playstation.com' &&
        /^\/\d{4}\/\d{2}\/\d{2}\//.test(url.pathname) &&
        isSaleCampaignText(label) &&
        !isExcludedCampaignText(label) &&
        !/\b(?:single game|dlc|add-on|playstation plus|ps plus)\b/i.test(label)
      )
    }),
    ({ href }) => href
  )

  const settled = await Promise.allSettled([
    ...storeLinks.map(({ href, label }) =>
      campaignFromPage(now, fetch, href, label, STORE_URL)
    ),
    ...blogLinks.map(({ href, label }) =>
      campaignFromPage(now, fetch, href, label, BLOG_URL)
    ),
  ])
  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason

  const campaigns = uniqueBy(
    settled.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : []
    ),
    (entry) => entry.sourceUid
  )
  const explicitlyEndedSourceUids = await verifyKnownCampaigns(
    fetch,
    knownCampaigns,
    ['store.playstation.com', 'blog.playstation.com']
  )

  return {
    storeSlug: 'playstation-store',
    sourceUrl: STORE_URL,
    sourceUrls: [STORE_URL, storeModules.graphqlUrl, BLOG_URL],
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
