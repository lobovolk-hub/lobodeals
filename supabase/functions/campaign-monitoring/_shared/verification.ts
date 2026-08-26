import { textFromHtml } from './html.ts'
import { fetchOfficialText } from './http.ts'
import type { KnownCampaign } from './types.ts'

const EXPLICIT_END_PATTERN =
  /\b(?:sale|promotion|event|campaign)\s+(?:has\s+|is\s+)(?:now\s+)?(?:ended|over|finished|closed)\b/i

export function sourceExplicitlyEndsCampaign(html: string): boolean {
  return EXPLICIT_END_PATTERN.test(textFromHtml(html))
}

export async function verifyKnownCampaigns(
  fetcher: typeof fetch,
  knownCampaigns: readonly KnownCampaign[],
  allowedHosts: readonly string[]
): Promise<readonly string[]> {
  const allowed = new Set(allowedHosts)
  const eligible = knownCampaigns.filter((known) => {
    try {
      return (
        known.officialUrl !== known.sourceUrl &&
        allowed.has(new URL(known.officialUrl).hostname)
      )
    } catch {
      return false
    }
  })

  const byUrl = new Map<string, KnownCampaign[]>()
  for (const known of eligible) {
    const group = byUrl.get(known.officialUrl) ?? []
    group.push(known)
    byUrl.set(known.officialUrl, group)
  }
  const settled = await Promise.allSettled(
    [...byUrl.entries()].map(async ([officialUrl, knownAtUrl]) => ({
      sourceUids: knownAtUrl.map(({ sourceUid }) => sourceUid),
      ended: sourceExplicitlyEndsCampaign(
        await fetchOfficialText(fetcher, officialUrl)
      ),
    }))
  )

  return settled.flatMap((result) =>
    result.status === 'fulfilled' && result.value.ended
      ? result.value.sourceUids
      : []
  )
}
