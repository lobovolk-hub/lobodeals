import {
  campaign,
  canonicalDate,
  exactTimeState,
  expireAtExactEnd,
  isExcludedCampaignText,
  isSaleCampaignText,
  monthNumber,
} from '../_shared/campaign.ts'
import {
  decodeHtml,
  extractAnchors,
  extractMeta,
  textFromHtml,
  uniqueBy,
} from '../_shared/html.ts'
import { extractOfficialArtwork } from '../_shared/artwork.ts'
import { fetchOfficialText } from '../_shared/http.ts'
import { extractExactEnglishDateTimes } from '../_shared/time.ts'
import { verifyKnownCampaigns } from '../_shared/verification.ts'
import type { AdapterResult, DetectedCampaign, StoreAdapter } from '../_shared/types.ts'

const CALENDAR_URL =
  'https://partner.steamgames.com/doc/marketing/upcoming_events?l=english'
const STORE_HOME_URL = 'https://store.steampowered.com/?cc=us&l=english'
const MONTH =
  '(January|February|March|April|May|June|July|August|September|October|November|December)'
const CAMPAIGN_KIND = '(?:sale|fest|festival|promotion|deals?)'

type SteamPartnerEvent = Readonly<{
  event_name?: unknown
  rtime32_start_time?: unknown
  rtime32_end_time?: unknown
  jsondata?: unknown
}>

type SteamGroup = Readonly<{
  group_name?: unknown
}>

function normalizeTitle(value: string): string {
  return decodeHtml(value).replace(/\s+/g, ' ').trim()
}

function extractDataAttributeJson(html: string, attribute: string): unknown {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(
    `\\b${escaped}=(["'])([\\s\\S]*?)\\1`,
    'i'
  ).exec(html)
  if (!match) return null

  try {
    return JSON.parse(decodeHtml(match[2])) as unknown
  } catch {
    return null
  }
}

function firstRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (!Array.isArray(value) || !value[0] || typeof value[0] !== 'object') {
    return null
  }
  return value[0] as Readonly<Record<string, unknown>>
}

function partnerEvent(html: string): SteamPartnerEvent | null {
  return firstRecord(
    extractDataAttributeJson(html, 'data-partnereventstore')
  ) as SteamPartnerEvent | null
}

function officialGroupName(html: string): string | null {
  const group = firstRecord(
    extractDataAttributeJson(html, 'data-groupvanityinfo')
  ) as SteamGroup | null
  if (typeof group?.group_name !== 'string') return null

  const name = normalizeTitle(group.group_name).replace(/^official\s+/i, '')
  return name || null
}

function localizedSubtitle(event: SteamPartnerEvent | null): string | null {
  if (typeof event?.jsondata !== 'string') return null

  try {
    const data = JSON.parse(event.jsondata) as {
      localized_subtitle?: unknown
    }
    const subtitle = Array.isArray(data.localized_subtitle)
      ? data.localized_subtitle[0]
      : null
    return typeof subtitle === 'string' ? normalizeTitle(subtitle) : null
  } catch {
    return null
  }
}

function titleFromCampaignSentence(value: string): string | null {
  const normalized = normalizeTitle(value)
    .replace(/\s+[|–—-]\s+Steam(?:\s+Store)?$/i, '')
    .replace(/\s+Advertising App$/i, '')
  const sentence = new RegExp(
    `^(?:the|a|an)\\s+(.+?\\b${CAMPAIGN_KIND})\\b(?=\\s+(?:is|are|starts?|runs?|returns?|has|ends?)\\b|\\s*[.!–—-]|$)`,
    'i'
  ).exec(normalized)
  const candidate = normalizeTitle(sentence?.[1] ?? normalized).replace(
    /^(?:the|a|an)\s+/i,
    ''
  )

  if (candidate.length < 6 || candidate.length > 120) return null
  if (!new RegExp(`\\b${CAMPAIGN_KIND}\\b`, 'i').test(candidate)) return null
  if (/[,;:]$/.test(candidate)) return null
  if (
    /^(?:steam|steam store|store|home|featured|special offers?|publisher sale)$/i.test(
      candidate
    )
  ) {
    return null
  }
  if (
    /\b(?:click here|learn more|shop now|save up to|happening now|we(?:'|’)re|going shopping)\b/i.test(
      candidate
    )
  ) {
    return null
  }

  return candidate
}

function completePublisherTitle(
  candidate: string,
  groupName: string | null
): string {
  if (!groupName || !/\sPublisher Sale$/i.test(candidate)) return candidate

  const prefix = candidate.replace(/\s+Publisher Sale$/i, '').trim()
  if (
    prefix.length >= 3 &&
    groupName.toLowerCase().startsWith(prefix.toLowerCase())
  ) {
    return `${groupName} Publisher Sale`
  }
  return candidate
}

export function extractSteamCampaignTitle(
  html: string,
  fallbackLabel = ''
): string | null {
  const event = partnerEvent(html)
  const eventName =
    typeof event?.event_name === 'string' ? normalizeTitle(event.event_name) : ''
  const subtitle =
    localizedSubtitle(event) ??
    extractMeta(html, 'og:description') ??
    extractMeta(html, 'description') ??
    ''
  const documentTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''
  const groupName = officialGroupName(html)

  for (const source of [
    eventName,
    subtitle,
    extractMeta(html, 'og:title') ?? '',
    documentTitle,
    fallbackLabel,
  ]) {
    const candidate = titleFromCampaignSentence(source)
    if (candidate) return completePublisherTitle(candidate, groupName)
  }
  return null
}

export function extractSteamPartnerTiming(
  html: string
): Readonly<{
  starts: { precision: 'datetime'; value: string }
  ends: { precision: 'datetime'; value: string }
}> | null {
  const event = partnerEvent(html)
  const start = Number(event?.rtime32_start_time)
  const end = Number(event?.rtime32_end_time)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= start) {
    return null
  }

  return {
    starts: { precision: 'datetime', value: new Date(start * 1_000).toISOString() },
    ends: { precision: 'datetime', value: new Date(end * 1_000).toISOString() },
  }
}

function parseUpcomingCalendar(html: string): readonly DetectedCampaign[] {
  const text = textFromHtml(html)
  const contentStart = text.lastIndexOf('Upcoming Steam Events')
  if (contentStart < 0) throw new Error('Steam event calendar content was not found')
  const content = text.slice(contentStart)
  const campaigns: DetectedCampaign[] = []

  const seasonalPattern = new RegExp(
    `([A-Z][A-Za-z ]+ Sale) \\| ${MONTH} (\\d{1,2}) - (?:${MONTH} )?(\\d{1,2}), (\\d{4})`,
    'g'
  )
  for (const match of content.matchAll(seasonalPattern)) {
    const seasonalName = /(Autumn|Winter|Spring|Summer) Sale$/i.exec(match[1])
    const saleName = seasonalName
      ? `${seasonalName[1]} Sale`
      : match[1].replace(/^Seasonal Sales\s+/i, '').trim()
    const startMonth = monthNumber(match[2])
    const endMonth = monthNumber(match[4] ?? match[2])
    const endYear = Number(match[6])
    if (!startMonth || !endMonth) continue
    const startYear = startMonth > endMonth ? endYear - 1 : endYear
    campaigns.push(
      campaign({
        sourceUid: `steamworks-${saleName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${startYear}`,
        name: `Steam ${saleName}`,
        storeSlug: 'steam',
        state: 'upcoming',
        lifecycleBasis: 'official-source',
        starts: {
          precision: 'date',
          value: canonicalDate(startYear, startMonth, Number(match[3])),
        },
        ends: {
          precision: 'date',
          value: canonicalDate(endYear, endMonth, Number(match[5])),
        },
        officialUrl: CALENDAR_URL,
        sourceUrl: CALENDAR_URL,
      })
    )
  }

  for (const yearMatch of content.matchAll(/\b(20\d{2}) Fests\b/g)) {
    const year = Number(yearMatch[1])
    const nextYear = content.indexOf(`${year + 1} Fests`, yearMatch.index)
    const nextFest = content.indexOf('Next Fest', yearMatch.index)
    const sectionEnd = [nextYear, nextFest]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0]
    const section = content.slice(yearMatch.index, sectionEnd)
    const festPattern = /\b([A-Z][a-z]{2}) (\d{1,2}) ([A-Z][a-z]{2}) (\d{1,2}) ([A-Za-z][A-Za-z0-9 '&:.-]+?) Registration details/g
    for (const match of section.matchAll(festPattern)) {
      const startMonth = monthNumber(match[1])
      const endMonth = monthNumber(match[3])
      if (!startMonth || !endMonth) continue
      const officialName = match[5].trim()
      const name = /^Steam\b/i.test(officialName)
        ? officialName
        : `Steam ${officialName}`
      campaigns.push(
        campaign({
          sourceUid: `steamworks-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}`,
          name,
          storeSlug: 'steam',
          state: 'upcoming',
          lifecycleBasis: 'official-source',
          starts: {
            precision: 'date',
            value: canonicalDate(year, startMonth, Number(match[2])),
          },
          ends: {
            precision: 'date',
            value: canonicalDate(year, endMonth, Number(match[4])),
          },
          officialUrl: CALENDAR_URL,
          sourceUrl: CALENDAR_URL,
        })
      )
    }
  }

  return uniqueBy(campaigns, (entry) => entry.sourceUid)
}

function comparableName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bsteam\b|\b20\d{2}\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function discoverLiveCampaigns(
  now: Date,
  fetcher: typeof fetch,
  homeHtml: string,
  upcoming: readonly DetectedCampaign[]
): Promise<readonly DetectedCampaign[]> {
  const links = uniqueBy(
    extractAnchors(homeHtml, STORE_HOME_URL).filter(({ href }) => {
      const url = new URL(href)
      return (
        url.hostname === 'store.steampowered.com' &&
        /^\/sale\/[^/]+/i.test(url.pathname)
      )
    }),
    ({ href }) => new URL(href).pathname.toLowerCase()
  )

  const settled = await Promise.allSettled(
    links.map(async ({ href, label }): Promise<DetectedCampaign | null> => {
      const officialUrl = new URL(href)
      officialUrl.search = ''
      officialUrl.hash = ''
      const html = await fetchOfficialText(
        fetcher,
        `${officialUrl.toString()}?cc=us&l=english`
      )
      const title = extractSteamCampaignTitle(html, label)
      const description =
        extractMeta(html, 'og:description') ?? extractMeta(html, 'description') ?? ''
      if (!title) return null
      if (!isSaleCampaignText(`${title} ${description}`)) return null
      if (isExcludedCampaignText(`${title} ${description}`)) return null

      const matchingUpcoming = upcoming.find(
        (entry) => comparableName(entry.name) === comparableName(title)
      )
      const partnerTiming = extractSteamPartnerTiming(html)
      const exact = partnerTiming
        ? [partnerTiming.starts, partnerTiming.ends]
        : extractExactEnglishDateTimes(textFromHtml(html))
      if (exact.length >= 2) {
        const starts = exact[0]
        const ends = exact[exact.length - 1]
        if (Date.parse(ends.value) <= Date.parse(starts.value)) return null
        return campaign({
          sourceUid: matchingUpcoming?.sourceUid ?? officialUrl.toString(),
          name: title,
          storeSlug: 'steam',
          state: exactTimeState(starts, ends, now),
          lifecycleBasis: 'exact-time',
          starts,
          ends,
          officialUrl: officialUrl.toString(),
          sourceUrl: STORE_HOME_URL,
          artworkUrl: extractOfficialArtwork(html, officialUrl.toString()),
        })
      }

      const ends = exact.length === 1 ? exact[0] : undefined
      return campaign({
        sourceUid: matchingUpcoming?.sourceUid ?? officialUrl.toString(),
        name: title,
        storeSlug: 'steam',
        state: expireAtExactEnd('live', ends, now),
        lifecycleBasis: 'official-source',
        starts: matchingUpcoming?.starts,
        ends: ends ?? matchingUpcoming?.ends,
        officialUrl: officialUrl.toString(),
        sourceUrl: STORE_HOME_URL,
        artworkUrl: extractOfficialArtwork(html, officialUrl.toString()),
      })
    })
  )
  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  return settled.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : []
  )
}

export const runSteamAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const [calendarHtml, homeHtml] = await Promise.all([
    fetchOfficialText(fetch, CALENDAR_URL),
    fetchOfficialText(fetch, STORE_HOME_URL),
  ])
  const upcoming = parseUpcomingCalendar(calendarHtml)
  const [live, explicitlyEndedSourceUids] = await Promise.all([
    discoverLiveCampaigns(now, fetch, homeHtml, upcoming),
    verifyKnownCampaigns(fetch, knownCampaigns, [
      'partner.steamgames.com',
      'store.steampowered.com',
    ]),
  ])
  const liveUids = new Set(live.map((entry) => entry.sourceUid))

  return {
    storeSlug: 'steam',
    sourceUrl: CALENDAR_URL,
    sourceUrls: [CALENDAR_URL, STORE_HOME_URL],
    coverage: 'partial',
    campaigns: [...live, ...upcoming.filter((entry) => !liveUids.has(entry.sourceUid))],
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
