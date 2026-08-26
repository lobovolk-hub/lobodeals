import { canonicalDate, exactBoundary, monthNumber } from './campaign.ts'
import type { SourceBoundary } from './types.ts'

const ZONE_OFFSETS: Readonly<Record<string, string>> = {
  UTC: '+00:00',
  GMT: '+00:00',
  BST: '+01:00',
  CET: '+01:00',
  CEST: '+02:00',
  EST: '-05:00',
  EDT: '-04:00',
  CST: '-06:00',
  CDT: '-05:00',
  MST: '-07:00',
  MDT: '-06:00',
  PST: '-08:00',
  PDT: '-07:00',
}

const EXACT_ENGLISH_DATE =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(UTC|GMT|BST|CET|CEST|EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/gi

export function extractExactEnglishDateTimes(
  text: string
): readonly SourceBoundary[] {
  const values: SourceBoundary[] = []

  for (const match of text.matchAll(EXACT_ENGLISH_DATE)) {
    const month = monthNumber(match[1])
    if (!month) continue

    let hour = Number(match[4])
    const minute = Number(match[5] ?? '0')
    const meridiem = match[6]?.toLowerCase().replaceAll('.', '')
    const zone = match[7].toUpperCase()

    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    if (hour > 23 || minute > 59) continue

    const date = canonicalDate(Number(match[3]), month, Number(match[2]))
    const value = `${date}T${hour.toString().padStart(2, '0')}:${minute
      .toString()
      .padStart(2, '0')}:00${ZONE_OFFSETS[zone]}`

    try {
      values.push(exactBoundary(value))
    } catch {
      // Ignore malformed official prose rather than guessing.
    }
  }

  return values
}

export function extractEnglishDateOnlyRange(
  text: string,
  defaultYear?: number
): Readonly<{ starts: SourceBoundary; ends: SourceBoundary }> | null {
  const pattern =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:-|–|—|to|through|until)\s*(?:(January|February|March|April|May|June|July|August|September|October|November|December)\s+)?(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/i
  const match = pattern.exec(text)
  if (!match) return null

  const startMonth = monthNumber(match[1])
  const endMonth = monthNumber(match[3] ?? match[1])
  const explicitYear = match[5] ? Number(match[5]) : defaultYear
  if (!startMonth || !endMonth || !explicitYear) return null

  let startYear = explicitYear
  const endYear = explicitYear
  if (startMonth > endMonth) startYear -= 1

  return {
    starts: {
      precision: 'date',
      value: canonicalDate(startYear, startMonth, Number(match[2])),
    },
    ends: {
      precision: 'date',
      value: canonicalDate(endYear, endMonth, Number(match[4])),
    },
  }
}
