import {
  campaign,
  canonicalDate,
  dateBoundary,
  expireAtExactEnd,
  isExcludedCampaignText,
  isSaleCampaignText,
  monthNumber,
} from '../_shared/campaign.ts'
import { discoverOfficialArtwork } from '../_shared/artwork.ts'
import { extractAnchors, textFromHtml, uniqueBy } from '../_shared/html.ts'
import { fetchOfficialText } from '../_shared/http.ts'
import { extractExactEnglishDateTimes } from '../_shared/time.ts'
import { currentCampaignEvidence, sourceExplicitlyEndsCampaign } from '../_shared/verification.ts'
import type {
  AdapterResult,
  KnownCampaign,
  SourceBoundary,
  StoreAdapter,
} from '../_shared/types.ts'

const SOURCE_URL =
  'https://www.xbox.com/en-US/promotions/sales/sales-and-specials'

function identityYear(value: string): number | undefined {
  const match = /\b(20\d{2})\b/.exec(value)
  return match ? Number(match[1]) : undefined
}

function validDateBoundary(
  year: number,
  month: number,
  day: number
): SourceBoundary | undefined {
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return undefined
  }

  return dateBoundary(canonicalDate(year, month, day))
}

function dateOnlyEnd(
  phrase: string,
  defaultYear?: number
): SourceBoundary | undefined {
  const numeric =
    /\b(?:ends?|until|through)\s+(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/i.exec(
      phrase
    )

  if (numeric) {
    const year = numeric[3] ? Number(numeric[3]) : defaultYear

    return year
      ? validDateBoundary(
          year,
          Number(numeric[1]),
          Number(numeric[2])
        )
      : undefined
  }

  const named =
    /\b(?:ends?|until|through)\s+(?:on\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(20\d{2}))?\b/i.exec(
      phrase
    )

  if (!named) return undefined

  const month = monthNumber(named[1])
  const year = named[3] ? Number(named[3]) : defaultYear

  return month && year
    ? validDateBoundary(year, month, Number(named[2]))
    : undefined
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function embeddedChannelTitleText(
  html: string,
  identity: string
): string {
  const escapedIdentity = escapeRegex(identity)
  const pattern = new RegExp(
    `"${escapedIdentity}"\\s*:\\s*\\{\\s*"type"\\s*:\\s*2\\s*,\\s*"data"\\s*:\\s*\\{\\s*"channelTitleModuleData"\\s*:\\s*(\\{[^{}]*\\})`,
    'i'
  )
  const match = pattern.exec(html)

  if (!match) return ''

  try {
    const metadata = JSON.parse(match[1]) as {
      title?: unknown
      description?: unknown
    }

    return [metadata.title, metadata.description]
      .filter(
        (value): value is string =>
          typeof value === 'string' &&
          value.trim().length > 0
      )
      .map((value) => value.trim())
      .join(' ')
  } catch {
    return ''
  }
}
function campaignEndBoundary(
  text: string,
  identity: string
): SourceBoundary | undefined {
  const defaultYear = identityYear(identity)

  const phrases = [
    ...text.matchAll(
      /[^.!?]*(?:sale|promotion|event|campaign)[^.!?]*(?:ends?|until|through)[^.!?]*/gi
    ),
  ].map((match) => match[0])

  for (const phrase of phrases) {
    const exact = extractExactEnglishDateTimes(
      phrase,
      defaultYear
    )

    if (exact.length > 0) {
      return exact[exact.length - 1]
    }

    const dateOnly = dateOnlyEnd(
      phrase,
      defaultYear
    )

    if (dateOnly) return dateOnly
  }

  return undefined
}

function clearlyEnded(
  ends: SourceBoundary | undefined,
  now: Date
): boolean {
  if (!ends) return false

  if (ends.precision === 'datetime') {
    return expireAtExactEnd('live', ends, now) === 'ended'
  }

  // A date-only official fact contains no end instant or timezone.
  // Wait until that calendar day is unambiguously past rather than
  // inventing an artificial hour.
  const conservativePastCutoff = new Date(
    now.getTime() - 86_400_000
  )
    .toISOString()
    .slice(0, 10)

  return ends.value < conservativePastCutoff
}

async function discoverCampaignTiming(
  fetcher: typeof fetch,
  officialUrl: string,
  identity: string,
  now: Date
): Promise<
  Readonly<{
    ended: boolean
    ends?: SourceBoundary
  }>
> {
  try {
    const html = await fetchOfficialText(
      fetcher,
      officialUrl
    )

    const ends = campaignEndBoundary(
      `${textFromHtml(html)} ${embeddedChannelTitleText(
        html,
        identity
      )}`,
      identity
    )

    return {
      ended:
        sourceExplicitlyEndsCampaign(html) ||
        clearlyEnded(ends, now),
      ...(ends ? { ends } : {}),
    }
  } catch {
    // Timing enrichment is best-effort and must not invalidate
    // successful discovery from the official Sales hub.
    return { ended: false }
  }
}

async function verifyKnownXboxCampaigns(
  fetcher: typeof fetch,
  knownCampaigns: readonly KnownCampaign[],
  now: Date
): Promise<readonly string[]> {
  const byUrl = new Map<string, KnownCampaign[]>()

  for (const known of knownCampaigns) {
    try {
      if (
        known.officialUrl === known.sourceUrl ||
        new URL(known.officialUrl).hostname !== 'www.xbox.com'
      ) {
        continue
      }
    } catch {
      continue
    }

    const group =
      byUrl.get(known.officialUrl) ?? []

    group.push(known)
    byUrl.set(known.officialUrl, group)
  }

  const settled = await Promise.allSettled(
    [...byUrl.entries()].map(
      async ([officialUrl, knownAtUrl]) => {
        const html = await fetchOfficialText(
          fetcher,
          officialUrl
        )

        if (sourceExplicitlyEndsCampaign(html)) {
          return knownAtUrl.map(
            ({ sourceUid }) => sourceUid
          )
        }

        const visibleText = textFromHtml(html)

        return knownAtUrl.flatMap((known) => {
          const ends = campaignEndBoundary(
            `${visibleText} ${embeddedChannelTitleText(
              html,
              known.sourceUid
            )}`,
            known.sourceUid
          )

          return clearlyEnded(ends, now)
            ? [known.sourceUid]
            : []
        })
      }
    )
  )

  return [
    ...new Set(
      settled.flatMap((result) =>
        result.status === 'fulfilled'
          ? result.value
          : []
      )
    ),
  ]
}

export const runMicrosoftStoreAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const html = await fetchOfficialText(
    fetch,
    SOURCE_URL
  )

  const anchors = extractAnchors(
    html,
    SOURCE_URL
  )

  const metadataPattern =
    /"(CampsiteChannel\.Games\.Sale\.[^"]+)"\s*:\s*\{"type":2,"data":\{"channelTitleModuleData":(\{[^{}]*\})/gi

  const detected: {
    key: string
    name: string
  }[] = []

  for (const match of html.matchAll(metadataPattern)) {
    try {
      const metadata = JSON.parse(
        match[2]
      ) as {
        title?: unknown
      }

      const name =
        typeof metadata.title === 'string'
          ? metadata.title.trim()
          : ''

      if (
        name &&
        isSaleCampaignText(name) &&
        !isExcludedCampaignText(name)
      ) {
        detected.push({
          key: match[1],
          name,
        })
      }
    } catch {
      // Ignore malformed embedded metadata rather than reading the product grid.
    }
  }

  const campaigns = await Promise.all(
    uniqueBy(
      detected,
      ({ key }) => key.toLowerCase()
    ).map(async ({ key, name }) => {
      const matchingLink =
        anchors.find(({ href }) =>
          new URL(href)
            .pathname
            .toLowerCase()
            .includes(key.toLowerCase())
        )

      const officialUrl =
        matchingLink?.href ??
        `https://www.xbox.com/games/browse/${key}`

      const [timing, artworkUrl] =
        await Promise.all([
          discoverCampaignTiming(
            fetch,
            officialUrl,
            key,
            now
          ),
          discoverOfficialArtwork(
            fetch,
            officialUrl
          ),
        ])

      return campaign({
        sourceUid: key.toLowerCase(),
        name,
        storeSlug: 'microsoft-store',
        state: timing.ended
          ? 'ended'
          : 'live',
        lifecycleBasis: 'official-source',
        ...(timing.ends
          ? { ends: timing.ends }
          : {}),
        officialUrl,
        sourceUrl: SOURCE_URL,
        ...(artworkUrl
          ? { artworkUrl }
          : {}),
      })
    })
  )

  const explicitlyEndedSourceUids =
    await verifyKnownXboxCampaigns(
      fetch,
      knownCampaigns,
      now
    )

  return {
    storeSlug: 'microsoft-store',
    sourceUrl: SOURCE_URL,
    sourceUrls: [SOURCE_URL],
    coverage: 'partial',
    ...currentCampaignEvidence(campaigns, knownCampaigns, explicitlyEndedSourceUids),
  } satisfies AdapterResult
}
