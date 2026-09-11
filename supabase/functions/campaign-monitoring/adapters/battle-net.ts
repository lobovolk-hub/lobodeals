import {
  campaign,
  dateBoundary,
  exactTimeState,
  expireAtExactEnd,
  isExcludedCampaignText,
  monthNumber,
  isSaleCampaignText,
} from '../_shared/campaign.ts'
import { extractMeta, textFromHtml, uniqueBy } from '../_shared/html.ts'
import { extractOfficialArtwork } from '../_shared/artwork.ts'
import { fetchOfficialJson, fetchOfficialText } from '../_shared/http.ts'
import {
  extractEnglishDateOnlyRange,
  extractExactEnglishDateTimes,
} from '../_shared/time.ts'
import { sourceExplicitlyEndsCampaign } from '../_shared/verification.ts'
import type {
  AdapterResult,
  DetectedCampaign,
  KnownCampaign,
  SourceBoundary,
  StoreAdapter,
} from '../_shared/types.ts'

const SOURCE_URL = 'https://news.blizzard.com/en-us/api/feed/blizzard?offset=0'

type FeedProperties = {
  title?: string
  summary?: string
  newsUrl?: string
  newsPath?: string
  newsSlug?: string
}

type FeedResponse = {
  contentItems?: readonly { properties?: FeedProperties }[]
  pagination?: {
    offset?: number
    limit?: number
    hasNextPage?: boolean
  }
}

function publicationYear(
  html: string
): number | undefined {
  const year =
    /["']datePublished["']\s*:\s*["'](20\d{2})-/i.exec(
      html
    )?.[1]

  return year
    ? Number(year)
    : undefined
}

function normalizeDateOnlyProse(
  text: string
): string {
  return text.replace(
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*,?\s+(?=(?:January|February|March|April|May|June|July|August|September|October|November|December)\b)/gi,
    ''
  )
}

function saleTimingSegments(
  text: string
): readonly string[] {
  return text
    .split(
      /(?<=[.!?])\s+/
    )
    .map(
      (segment) =>
        segment.trim()
    )
    .filter(
      (segment) =>
        segment.length > 0 &&
        isSaleCampaignText(
          segment
        )
    )
}

function reportsCampaignStart(
  text: string
): boolean {
  return (
    /\b(?:sale|sales|deals|savings|promotion|campaign)\b[^.!?]{0,120}\b(?:starts?|begins?|kicks off|launches?)\b/i.test(
      text
    ) ||
    /\b(?:starts?|begins?|kicks off|launches?)\b[^.!?]{0,120}\b(?:sale|sales|deals|savings|promotion|campaign)\b/i.test(
      text
    )
  )
}

function explicitlyReportsLive(
  text: string
): boolean {
  return /\b(?:live now|now live|is now live|available now|now through)\b/i.test(
    text
  )
}

function validDateBoundary(
  year: number,
  month: number,
  day: number
): SourceBoundary | undefined {
  const parsed =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    )

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return undefined
  }

  return dateBoundary(
    `${year
      .toString()
      .padStart(4, '0')}-${month
      .toString()
      .padStart(2, '0')}-${day
      .toString()
      .padStart(2, '0')}`
  )
}

function dateOnlySaleEnd(
  text: string,
  defaultYear?: number
): SourceBoundary | undefined {
  const named =
    /\b(?:sale|sales|deals|savings|promotion|campaign)\b[^.!?]{0,120}\b(?:ends?|until|through)\s+(?:on\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(20\d{2}))?\b/i.exec(
      text
    )

  if (!named) {
    return undefined
  }

  const month =
    monthNumber(
      named[1]
    )

  const year =
    named[3]
      ? Number(
          named[3]
        )
      : defaultYear

  if (
    !month ||
    !year
  ) {
    return undefined
  }

  return validDateBoundary(
    year,
    month,
    Number(
      named[2]
    )
  )
}

function dateOnlyRangeFromSaleText(
  text: string,
  defaultYear?: number
) {
  for (
    const segment
    of saleTimingSegments(text)
  ) {
    const range =
      extractEnglishDateOnlyRange(
        normalizeDateOnlyProse(
          segment
        ),
        defaultYear
      )

    if (range) {
      return range
    }
  }

  return null
}

function dateOnlyEndFromSaleText(
  text: string,
  defaultYear?: number
): SourceBoundary | undefined {
  for (
    const segment
    of saleTimingSegments(text)
  ) {
    const ends =
      dateOnlySaleEnd(
        segment,
        defaultYear
      )

    if (ends) {
      return ends
    }
  }

  return undefined
}

function dateOnlyClearlyEnded(
  ends: SourceBoundary,
  now: Date
): boolean {
  if (
    ends.precision !== 'date'
  ) {
    return false
  }

  const conservativePastCutoff =
    new Date(
      now.getTime() -
        86_400_000
    )
      .toISOString()
      .slice(0, 10)

  return (
    ends.value <
    conservativePastCutoff
  )
}

function exactEndClearlyPassed(
  ends: SourceBoundary,
  now: Date
): boolean {
  return (
    ends.precision ===
      'datetime' &&
    expireAtExactEnd(
      'live',
      ends,
      now
    ) === 'ended'
  )
}

function feedItems(value: FeedResponse): readonly FeedProperties[] {
  return (value.contentItems ?? []).flatMap((item) =>
    item.properties ? [item.properties] : []
  )
}

async function fetchDiscoveryWindow(fetcher: typeof fetch): Promise<readonly FeedResponse[]> {
  const pages: FeedResponse[] = []
  let offset = 0

  for (let page = 0; page < 20; page += 1) {
    const response = await fetchOfficialJson<FeedResponse>(
      fetcher,
      `https://news.blizzard.com/en-us/api/feed/blizzard?offset=${offset}`
    )
    pages.push(response)
    if (!response.pagination?.hasNextPage) break
    const limit = response.pagination.limit ?? response.contentItems?.length ?? 15
    if (limit <= 0) break
    offset = (response.pagination.offset ?? offset) + limit
  }

  return pages
}

async function verifyKnownBattleNetCampaigns(
  fetcher: typeof fetch,
  knownCampaigns: readonly KnownCampaign[],
  now: Date
): Promise<readonly string[]> {
  const groups =
    new Map<
      string,
      KnownCampaign[]
    >()

  for (
    const known
    of knownCampaigns
  ) {
    try {
      const url =
        new URL(
          known.officialUrl
        )

      if (
        url.hostname !==
          'news.blizzard.com' ||
        known.officialUrl ===
          known.sourceUrl
      ) {
        continue
      }
    } catch {
      continue
    }

    const atUrl =
      groups.get(
        known.officialUrl
      ) ?? []

    atUrl.push(known)

    groups.set(
      known.officialUrl,
      atUrl
    )
  }

  const settled =
    await Promise.allSettled(
      [...groups.entries()]
        .map(
          async (
            [
              officialUrl,
              knownAtUrl,
            ]
          ) => {
            const html =
              await fetchOfficialText(
                fetcher,
                officialUrl
              )

            if (
              sourceExplicitlyEndsCampaign(
                html
              )
            ) {
              return knownAtUrl.map(
                ({ sourceUid }) =>
                  sourceUid
              )
            }

            const text =
              textFromHtml(html)

            const defaultYear =
              publicationYear(
                html
              )

            const exact =
              extractExactEnglishDateTimes(
                text,
                defaultYear
              )

            if (
              exact.length > 0
            ) {
              const ends =
                exact[
                  exact.length - 1
                ]

              if (
                exactEndClearlyPassed(
                  ends,
                  now
                )
              ) {
                return knownAtUrl.map(
                  ({ sourceUid }) =>
                    sourceUid
                )
              }
            }

            const range =
              dateOnlyRangeFromSaleText(
                text,
                defaultYear
              )

            if (
              range &&
              dateOnlyClearlyEnded(
                range.ends,
                now
              )
            ) {
              return knownAtUrl.map(
                ({ sourceUid }) =>
                  sourceUid
              )
            }

            const dateOnlyEnd =
              dateOnlyEndFromSaleText(
                text,
                defaultYear
              )

            if (
              dateOnlyEnd &&
              dateOnlyClearlyEnded(
                dateOnlyEnd,
                now
              )
            ) {
              return knownAtUrl.map(
                ({ sourceUid }) =>
                  sourceUid
              )
            }

            return []
          }
        )
    )

  return [
    ...new Set(
      settled.flatMap(
        (result) =>
          result.status ===
            'fulfilled'
            ? result.value
            : []
      )
    ),
  ]
}

export const runBattleNetAdapter: StoreAdapter = async ({
  now,
  fetch,
  knownCampaigns = [],
}) => {
  const pages = await fetchDiscoveryWindow(fetch)
  const candidates = uniqueBy(
    pages
      .flatMap(feedItems)
      .filter(
        (item) =>
          Boolean(item.title) &&
          isSaleCampaignText(`${item.title ?? ''} ${item.summary ?? ''}`) &&
          !isExcludedCampaignText(`${item.title ?? ''} ${item.summary ?? ''}`) &&
          !/\b(?:in-game|gear store|merch)\b/i.test(
            `${item.title ?? ''} ${item.summary ?? ''}`
          )
      ),
    (item) => item.newsUrl ?? item.newsPath ?? item.newsSlug ?? item.title ?? ''
  )

  const settled = await Promise.allSettled(
    candidates.map(async (item): Promise<DetectedCampaign | null> => {
      const url = item.newsUrl
        ? new URL(item.newsUrl, 'https://news.blizzard.com').toString()
        : item.newsPath
          ? new URL(item.newsPath, 'https://news.blizzard.com').toString()
          : null
      if (!url) return null
      const html = await fetchOfficialText(fetch, url)
      const title = extractMeta(html, 'og:title') ?? item.title ?? ''
      const text = textFromHtml(html)
      if (!isSaleCampaignText(title) || isExcludedCampaignText(title)) return null
      const defaultYear =
        publicationYear(
          html
        )

      const exact =
        extractExactEnglishDateTimes(
          text,
          defaultYear
        )

      const cleanName =
        title
          .replace(
            /\s*[|\u2013\u2014-]\s*Blizzard News.*$/i,
            ''
          )
          .trim()

      const artworkUrl =
        extractOfficialArtwork(
          html,
          url
        )

      if (
        exact.length >= 2 &&
        reportsCampaignStart(
          text
        )
      ) {
        const starts =
          exact[0]

        const ends =
          exact[
            exact.length - 1
          ]

        if (
          Date.parse(
            ends.value
          ) >
          Date.parse(
            starts.value
          )
        ) {
          const state =
            exactTimeState(
              starts,
              ends,
              now
            )

          if (
            state === 'ended'
          ) {
            return null
          }

          return campaign({
            sourceUid:
              url,

            name:
              cleanName,

            storeSlug:
              'battle-net',

            state,

            lifecycleBasis:
              'exact-time',

            starts,

            ends,

            officialUrl:
              url,

            sourceUrl:
              SOURCE_URL,

            artworkUrl,
          })
        }
      }

      if (
        exact.length > 0
      ) {
        const ends =
          exact[
            exact.length - 1
          ]

        const state =
          expireAtExactEnd(
            'live',
            ends,
            now
          )

        if (
          state === 'ended'
        ) {
          return null
        }

        return campaign({
          sourceUid:
            url,

          name:
            cleanName,

          storeSlug:
            'battle-net',

          state,

          lifecycleBasis:
            'official-source',

          ends,

          officialUrl:
            url,

          sourceUrl:
            SOURCE_URL,

          artworkUrl,
        })
      }

      const dateOnlyRange =
        dateOnlyRangeFromSaleText(
          text,
          defaultYear
        )

      if (dateOnlyRange) {
        if (
          dateOnlyClearlyEnded(
            dateOnlyRange.ends,
            now
          )
        ) {
          return null
        }

        const currentCalendarDay =
          now
            .toISOString()
            .slice(0, 10)

        const state =
          dateOnlyRange
              .starts
              .value >
            currentCalendarDay
            ? 'upcoming'
            : explicitlyReportsLive(
                  text
                )
              ? 'live'
              : 'upcoming'

        return campaign({
          sourceUid:
            url,

          name:
            cleanName,

          storeSlug:
            'battle-net',

          state,

          lifecycleBasis:
            'official-source',

          starts:
            dateOnlyRange.starts,

          ends:
            dateOnlyRange.ends,

          officialUrl:
            url,

          sourceUrl:
            SOURCE_URL,

          artworkUrl,
        })
      }

      const dateOnlyEnd =
        dateOnlyEndFromSaleText(
          text,
          defaultYear
        )

      if (!dateOnlyEnd) {
        return null
      }

      if (
        dateOnlyClearlyEnded(
          dateOnlyEnd,
          now
        )
      ) {
        return null
      }

      return campaign({
        sourceUid:
          url,

        name:
          cleanName,

        storeSlug:
          'battle-net',

        state:
          'live',

        lifecycleBasis:
          'official-source',

        ends:
          dateOnlyEnd,

        officialUrl:
          url,

        sourceUrl:
          SOURCE_URL,

        artworkUrl,
      })
    })
  )

  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason

  const campaigns = settled.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : []
  )
  const explicitlyEndedSourceUids =
    await verifyKnownBattleNetCampaigns(
      fetch,
      knownCampaigns,
      now
    )
  return {
    storeSlug: 'battle-net',
    sourceUrl: SOURCE_URL,
    sourceUrls: pages.map(
      (page) =>
        `https://news.blizzard.com/en-us/api/feed/blizzard?offset=${page.pagination?.offset ?? 0}`
    ),
    coverage: 'partial',
    campaigns,
    explicitlyEndedSourceUids,
  } satisfies AdapterResult
}
