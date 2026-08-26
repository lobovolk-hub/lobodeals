const ENTITY_PATTERN = /&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  ndash: '–',
  nbsp: ' ',
  quot: '"',
  rdquo: '”',
  rsquo: '’',
}

export function decodeHtml(value: string): string {
  return value.replace(ENTITY_PATTERN, (match, entity: string) => {
    if (entity.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

export function textFromHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractMeta(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      'i'
    ),
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (match) return decodeHtml(match[1]).trim()
  }

  return null
}

export function extractAnchors(
  html: string,
  baseUrl: string
): readonly { href: string; label: string }[] {
  const anchors: { href: string; label: string }[] = []
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(pattern)) {
    try {
      anchors.push({
        href: new URL(decodeHtml(match[1]), baseUrl).toString(),
        label: textFromHtml(match[2]),
      })
    } catch {
      // Ignore malformed links from the official page.
    }
  }

  return anchors
}

export function uniqueBy<T>(
  values: readonly T[],
  key: (value: T) => string
): readonly T[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const candidate = key(value)
    if (seen.has(candidate)) return false
    seen.add(candidate)
    return true
  })
}
