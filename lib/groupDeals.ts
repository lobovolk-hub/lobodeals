type DealLike = {
  title?: string
  salePrice?: string
  dealRating?: string
}

function normalizeTitle(title?: string) {
  return (title || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function groupDealsByGame<T extends DealLike>(deals: T[]) {
  const grouped = new Map<string, T>()

  for (const deal of deals) {
    const key = normalizeTitle(deal.title)
    if (!key) continue

    const existing = grouped.get(key)

    if (!existing) {
      grouped.set(key, deal)
      continue
    }

    const currentPrice = Number(deal.salePrice || 999999)
    const existingPrice = Number(existing.salePrice || 999999)

    if (currentPrice < existingPrice) {
      grouped.set(key, deal)
      continue
    }

    if (currentPrice === existingPrice) {
      const currentRating = Number(deal.dealRating || 0)
      const existingRating = Number(existing.dealRating || 0)

      if (currentRating > existingRating) {
        grouped.set(key, deal)
      }
    }
  }

  return Array.from(grouped.values())
}