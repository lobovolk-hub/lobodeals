function normalizePsdealsId(value) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

export function selectEndedDiscountCandidatesFromListing(
  discountsItemsInput,
  stageRowsInput
) {
  const discountsItems = Array.isArray(discountsItemsInput) ? discountsItemsInput : []
  const stageRows = Array.isArray(stageRowsInput) ? stageRowsInput : []
  const activeDiscountIds = new Set()
  for (const item of discountsItems) {
    const psdealsId = normalizePsdealsId(item?.psdeals_id)
    if (psdealsId !== null) activeDiscountIds.add(psdealsId)
  }
  const candidates = stageRows
    .filter((row) => normalizePsdealsId(row?.psdeals_id) !== null)
    .filter((row) => !activeDiscountIds.has(normalizePsdealsId(row.psdeals_id)))
    .sort((a, b) => {
      const aUpdated = a?.updated_at ? new Date(a.updated_at).getTime() : 0
      const bUpdated = b?.updated_at ? new Date(b.updated_at).getTime() : 0
      return aUpdated - bUpdated || String(a?.title || '').localeCompare(String(b?.title || ''))
    })
  return {
    active_discount_ids: [...activeDiscountIds].sort((a, b) => a - b),
    candidates,
  }
}
