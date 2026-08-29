import { extractMeta } from './html.ts'
import { fetchOfficialText } from './http.ts'

const ARTWORK_META_KEYS = [
  'og:image',
  'twitter:image',
  'twitter:image:src',
] as const

const GENERIC_IMAGE_PATTERN =
  /(?:^|[\/_.-])(?:favicon|site[-_.]?logo|logo|icon|avatar|sprite|spacer|transparent|placeholder|fallback|default[-_.]?(?:social|share|image)|social[-_.]?share)(?:[\/_.?&#-]|$)/i

export function isSafeArtworkUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false

  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !GENERIC_IMAGE_PATTERN.test(`${url.pathname}${url.search}`)
    )
  } catch {
    return false
  }
}

export function extractOfficialArtwork(
  html: string,
  campaignPageUrl: string
): string | undefined {
  let officialPage: URL

  try {
    officialPage = new URL(campaignPageUrl)
  } catch {
    return undefined
  }

  if (
    officialPage.protocol !== 'https:' ||
    officialPage.username ||
    officialPage.password
  ) {
    return undefined
  }

  for (const key of ARTWORK_META_KEYS) {
    const candidate = extractMeta(html, key)
    if (!candidate) continue

    try {
      const resolved = new URL(candidate, officialPage).toString()
      if (isSafeArtworkUrl(resolved)) return resolved
    } catch {
      // Ignore malformed official metadata and retain the visual fallback.
    }
  }

  return undefined
}

/**
 * Artwork is best-effort enrichment only. A campaign-specific page fetch that
 * fails must never turn a successful campaign discovery into a source error.
 */
export async function discoverOfficialArtwork(
  fetcher: typeof fetch,
  campaignPageUrl: string
): Promise<string | undefined> {
  try {
    const html = await fetchOfficialText(fetcher, campaignPageUrl)
    return extractOfficialArtwork(html, campaignPageUrl)
  } catch {
    return undefined
  }
}
