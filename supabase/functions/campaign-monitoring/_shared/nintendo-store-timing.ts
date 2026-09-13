import { exactBoundary } from './campaign.ts'
import { textFromHtml } from './html.ts'
import type { SourceBoundary } from './types.ts'

export function nintendoStoreEnd(
  html: string, name: string, now: Date, knownEndsOn: readonly string[] = [],
  knownEndsAt: readonly string[] = []
): SourceBoundary | undefined {
  try {
    const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
    const identity = words(name).filter(word => word && !['sale', 'sales', 'deals', 'franchise', 'the'].includes(word))
    const matches = (value: unknown) => typeof value === 'string' && identity.length > 0 &&
      identity.every(word => words(value).includes(word))
    const raw = /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1]
    const content = raw ? JSON.parse(raw)?.props?.pageProps?.page?.content : undefined
    const texts: string[] = []
    const collect = (blocks: unknown, sectionMatches = false) => {
      if (!Array.isArray(blocks)) return
      for (const block of blocks) {
        if (block?.CONTENT_TYPE === 'promoRichTextCta' && typeof block.heading === 'string' &&
            (sectionMatches || matches(block.heading))) texts.push(textFromHtml(block.heading))
      }
    }
    collect(content?.merchandisedGrid)
    if (Array.isArray(content?.pageSections)) {
      for (const section of content.pageSections) collect(section?.storyModuleOrCuratedProductList, matches(section?.deepLink))
    }
    // For server-rendered prose, require campaign identity in the same element.
    for (const element of html.matchAll(/<(?:p|h[1-6])\b[^>]*>([\s\S]*?)<\/(?:p|h[1-6])>/gi)) {
      const text = textFromHtml(element[1])
      if (matches(text)) texts.push(text)
    }
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
    const parts = (instant: number) => Object.fromEntries(formatter.formatToParts(instant)
      .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
    const localEpoch = (instant: number) => {
      const p = parts(instant)
      return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    }
    const current = parts(now.getTime())
    const knownDates = [...knownEndsOn, ...knownEndsAt.flatMap(value => {
      try {
        const p = parts(Date.parse(exactBoundary(value).value))
        return [`${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`]
      } catch {
        return []
      }
    })]
    const ends = new Set<number>()
    const pattern = /\b(?:ends?|ending|until)\s+(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\s+at\s+(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)\s+PT\b/gi
    for (const text of texts) for (const match of text.matchAll(pattern)) {
      const month = Number(match[1]), day = Number(match[2]), clock = Number(match[4]), minute = Number(match[5])
      const priorYears = new Set(knownDates.filter(date =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) && Number(date.slice(5, 7)) === month && Number(date.slice(8)) === day
      ).map(date => Number(date.slice(0, 4))))
      if (!match[3] && priorYears.size > 1) return undefined
      // Without prior evidence, never assign this year to a past Pacific date
      // or guess next year. Same-day endings remain resolvable after their minute.
      if (!match[3] && !priorYears.size &&
          (month < current.month || (month === current.month && day < current.day))) return undefined
      const year = match[3] ? Number(match[3]) : [...priorYears][0] ?? current.year
      if (clock < 1 || clock > 12 || minute > 59) return undefined
      const hour = clock % 12 + (/^p/i.test(match[6]) ? 12 : 0)
      const wall = Date.UTC(year, month - 1, day, hour, minute)
      const date = new Date(wall)
      if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return undefined
      // Obtain offsets from the runtime's IANA data on both sides of a possible
      // transition, then round-trip. Gaps yield zero matches; folds yield two.
      const offsets = new Set([-86_400_000, 0, 86_400_000].map(delta => localEpoch(wall + delta) - (wall + delta)))
      const candidates = [...offsets].map(offset => wall - offset).filter(instant => localEpoch(instant) === wall)
      if (candidates.length !== 1) return undefined
      ends.add(candidates[0])
    }
    return ends.size === 1 ? exactBoundary(new Date([...ends][0]).toISOString()) : undefined
  } catch {
    // Missing/malformed prose, CMS data or timezone support is optional enrichment.
    return undefined
  }
}
