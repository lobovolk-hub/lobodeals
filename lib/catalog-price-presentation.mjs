function positiveMoney(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export function calculateDiscountPercent(baseAmount, priceAmount) {
  const base = positiveMoney(baseAmount)
  const price = positiveMoney(priceAmount)
  if (base === null || price === null || price >= base) return null

  const percent = Math.round(((base - price) / base) * 100)
  return percent >= 1 && percent <= 99 ? percent : null
}

function psPlusBaseAmount(item) {
  const original = positiveMoney(item?.original_price_amount)
  const current = positiveMoney(item?.current_price_amount)
  const psPlus = positiveMoney(item?.ps_plus_price_amount)
  if (psPlus === null) return null
  if (original !== null && original > psPlus) return original
  if (current !== null && current > psPlus) return current
  return null
}

export function derivePublicPricePresentation(item = {}) {
  const current = positiveMoney(item.current_price_amount)
  const original = positiveMoney(item.original_price_amount)
  const psPlus = positiveMoney(item.ps_plus_price_amount)
  const calculatedRegularPercent = calculateDiscountPercent(original, current)

  // discount_percent follows the best commercial price in current cache rows.
  // On a verified double-discount it therefore describes PS+, not regular.
  // Each public offer must be proven independently from its own amounts.
  const regularPercent =
    item.has_verified_deal === true &&
    calculatedRegularPercent !== null
      ? calculatedRegularPercent
      : null

  const psPlusBase = psPlusBaseAmount(item)
  const psPlusPercent =
    item.has_verified_ps_plus_deal === true
      ? calculateDiscountPercent(psPlusBase, psPlus)
      : null

  const hasRegularOffer = regularPercent !== null
  const hasPsPlusOffer = psPlusPercent !== null
  const showBuyPrice = current !== null && !hasRegularOffer

  return {
    buy_price_amount: current,
    show_buy_price: showBuyPrice,
    original_price_amount:
      hasRegularOffer && original !== null ? original : null,
    show_original_price: hasRegularOffer && original !== null,
    has_regular_offer: hasRegularOffer,
    regular_price_amount: hasRegularOffer ? current : null,
    regular_discount_percent: regularPercent,
    has_ps_plus_offer: hasPsPlusOffer,
    ps_plus_price_amount: hasPsPlusOffer ? psPlus : null,
    ps_plus_base_amount: hasPsPlusOffer ? psPlusBase : null,
    ps_plus_discount_percent: psPlusPercent,
    is_monthly_entitlement: item.is_ps_plus_monthly_game === true,
    savings_labels: [
      ...(regularPercent === null ? [] : [`-${regularPercent}%`]),
      ...(psPlusPercent === null ? [] : [`PS+ -${psPlusPercent}%`]),
    ],
  }
}

function legacyLow(value) {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function derivePriceLowPresentation({ legacy, certified } = {}) {
  const historicalAmount = legacyLow(legacy)
  const certifiedAmount = legacyLow(certified)
  return {
    historical_amount: historicalAmount,
    certified_amount: certifiedAmount,
    values_match:
      historicalAmount !== null &&
      certifiedAmount !== null &&
      Math.abs(historicalAmount - certifiedAmount) < 0.01,
  }
}
