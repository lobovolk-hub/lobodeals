export const PC_ALLOWED_STORE_IDS = ['1', '7', '25', '31'] as const

export type PcAllowedStoreID = (typeof PC_ALLOWED_STORE_IDS)[number]

export const PC_ALLOWED_STORE_SET = new Set<string>(PC_ALLOWED_STORE_IDS)

export type CanonicalPcOffer = {
  id: string
  source: 'steam' | 'deal'
  title: string
  normalizedTitle: string
  canonicalKey: string
  slug: string
  steamAppID?: string
  gameID?: string
  dealID?: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  url?: string
  metacriticScore?: string
}

export type CanonicalPcGame = {
  slug: string
  canonicalTitle: string
  normalizedTitle: string
  canonicalKey: string
  steamAppID?: string
  offers: CanonicalPcOffer[]
  heroOffer: CanonicalPcOffer
}

const EDITION_NOISE_REGEX =
  /\b(game of the year|goty|digital deluxe|deluxe edition|deluxe|ultimate edition|ultimate|complete edition|complete|gold edition|gold|definitive edition|definitive|remastered|director'?s cut|collection|bundle)\b/g

export function isAllowedPcStore(storeID?: string | null) {
  if (!storeID) return false
  return PC_ALLOWED_STORE_SET.has(String(storeID))
}

export function normalizeCanonicalTitle(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™©]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[:\-–—_/.,+!?'"]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function makePcCanonicalSlug(value: string) {
  return normalizeCanonicalTitle(value)
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export function makePcCanonicalKey(value: string) {
  return normalizeCanonicalTitle(value)
    .replace(EDITION_NOISE_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getSafeDiscountPercent(
  salePrice?: string | number | null,
  normalPrice?: string | number | null,
  savings?: string | number | null
) {
  const sale = Number(salePrice || 0)
  const normal = Number(normalPrice || 0)
  const rawSavings = Number(savings || 0)

  if (normal > 0 && sale > 0 && normal > sale) {
    const computed = ((normal - sale) / normal) * 100
    return Math.max(0, Math.min(99, Math.round(computed)))
  }

  if (Number.isFinite(rawSavings) && rawSavings > 0) {
    return Math.max(0, Math.min(99, Math.round(rawSavings)))
  }

  return 0
}

export function choosePreferredPcOffer(
  current: CanonicalPcOffer,
  incoming: CanonicalPcOffer
) {
  if (incoming.storeID === '1' && current.storeID !== '1') return incoming
  if (incoming.storeID !== '1' && current.storeID === '1') return current

  const currentSale = Number(current.salePrice || 999999)
  const incomingSale = Number(incoming.salePrice || 999999)

  if (incomingSale < currentSale) return incoming
  if (incomingSale > currentSale) return current

  const currentSavings = Number(current.savings || 0)
  const incomingSavings = Number(incoming.savings || 0)

  if (incomingSavings > currentSavings) return incoming
  if (incomingSavings < currentSavings) return current

  const currentMeta = Number(current.metacriticScore || 0)
  const incomingMeta = Number(incoming.metacriticScore || 0)

  if (incomingMeta > currentMeta) return incoming

  return current
}

export function dedupeOffersByStore(offers: CanonicalPcOffer[]) {
  const bestByStore = new Map<string, CanonicalPcOffer>()

  for (const offer of offers) {
    const key = String(offer.storeID || 'unknown')
    const existing = bestByStore.get(key)

    if (!existing) {
      bestByStore.set(key, offer)
      continue
    }

    bestByStore.set(key, choosePreferredPcOffer(existing, offer))
  }

  return Array.from(bestByStore.values())
}

export function buildCanonicalPcGames(offers: CanonicalPcOffer[]) {
  const grouped = new Map<string, CanonicalPcOffer[]>()

  for (const offer of offers) {
    const groupKey = offer.steamAppID
      ? `steam:${offer.steamAppID}`
      : `title:${offer.canonicalKey}`

    const current = grouped.get(groupKey) || []
    current.push(offer)
    grouped.set(groupKey, current)
  }

  const games: CanonicalPcGame[] = []

  for (const [, groupedOffers] of grouped) {
    if (!groupedOffers.length) continue

    const dedupedOffers = dedupeOffersByStore(groupedOffers)
    const heroOffer = dedupedOffers.reduce((best, current) =>
      choosePreferredPcOffer(best, current)
    )

    games.push({
      slug: heroOffer.slug,
      canonicalTitle: heroOffer.title,
      normalizedTitle: heroOffer.normalizedTitle,
      canonicalKey: heroOffer.canonicalKey,
      steamAppID: heroOffer.steamAppID,
      offers: dedupedOffers.sort((a, b) => {
        if (a.storeID === '1' && b.storeID !== '1') return -1
        if (a.storeID !== '1' && b.storeID === '1') return 1

        const aSale = Number(a.salePrice || 999999)
        const bSale = Number(b.salePrice || 999999)

        return aSale - bSale
      }),
      heroOffer,
    })
  }

  return games.sort((a, b) => a.canonicalTitle.localeCompare(b.canonicalTitle))
}

export function makeSteamCanonicalOffer(input: {
  steamAppID?: string
  title: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
  storeID?: string
  url?: string
  metacriticScore?: string
}) {
  const normalizedTitle = normalizeCanonicalTitle(input.title)
  const canonicalKey = makePcCanonicalKey(input.title)
  const slug = makePcCanonicalSlug(input.title)
  const safeSavings = String(
    getSafeDiscountPercent(
      input.salePrice,
      input.normalPrice,
      input.savings
    )
  )

  return {
    id: `steam-${input.steamAppID || canonicalKey}`,
    source: 'steam' as const,
    title: input.title,
    normalizedTitle,
    canonicalKey,
    slug,
    steamAppID: input.steamAppID || '',
    gameID: '',
    dealID: `steam-${input.steamAppID || canonicalKey}`,
    salePrice: input.salePrice || '',
    normalPrice: input.normalPrice || '',
    savings: safeSavings,
    thumb: input.thumb || '',
    storeID: input.storeID || '1',
    url: input.url || '',
    metacriticScore: input.metacriticScore || '',
  } satisfies CanonicalPcOffer
}

export function makeDealCanonicalOffer(input: {
  gameID?: string
  dealID?: string
  title: string
  salePrice?: string
  normalPrice?: string
  savings?: string
  thumb?: string
  storeID?: string
  steamAppID?: string
  url?: string
  metacriticScore?: string
}) {
  const normalizedTitle = normalizeCanonicalTitle(input.title)
  const canonicalKey = makePcCanonicalKey(input.title)
  const slug = makePcCanonicalSlug(input.title)
  const safeSavings = String(
    getSafeDiscountPercent(
      input.salePrice,
      input.normalPrice,
      input.savings
    )
  )

  return {
    id:
      input.dealID ||
      `${input.storeID || 'store'}-${input.gameID || canonicalKey}`,
    source: 'deal' as const,
    title: input.title,
    normalizedTitle,
    canonicalKey,
    slug,
    steamAppID: input.steamAppID || '',
    gameID: input.gameID || '',
    dealID: input.dealID || '',
    salePrice: input.salePrice || '',
    normalPrice: input.normalPrice || '',
    savings: safeSavings,
    thumb: input.thumb || '',
    storeID: input.storeID || '',
    url: input.url || '',
    metacriticScore: input.metacriticScore || '',
  } satisfies CanonicalPcOffer
}