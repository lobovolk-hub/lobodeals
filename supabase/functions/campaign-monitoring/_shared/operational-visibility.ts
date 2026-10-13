import { AdapterError, type AdapterResult, type KnownCampaign, type StoreSlug } from './types.ts'
import { parseEpicPublicationStatus } from './epic-snapshot-persistence.ts'

// New contracts must establish completeness of the relevant surface before opt-in.
// All ten stores share the interface; partial coverage alone never enables it.
export const ABSENCE_CONTRACTS: Readonly<Record<StoreSlug, readonly string[]>> = {
  'playstation-store': ['playstation-ems-promotions-v1'],
  'nintendo-eshop': [], 'microsoft-store': [], steam: [], 'epic-games-store': [],
  gog: [], 'ea-app': [], 'ubisoft-store': [], 'battle-net': [], 'rockstar-store': [],
}

export function verifiedAbsentSourceUids(result: AdapterResult, known: readonly KnownCampaign[]): string[] {
  const present = new Set(result.campaigns.map(c => c.sourceUid))
  const ended = new Set(result.explicitlyEndedSourceUids)
  const seen = new Set<string>()
  const absent: string[] = []
  for (const check of result.absenceChecks ?? []) {
    const row = known.find(c => c.sourceUid === check.sourceUid)
    if (!row || seen.has(check.sourceUid) ||
        !ABSENCE_CONTRACTS[result.storeSlug].includes(check.contract) ||
        !result.sourceUrls.includes(check.sourceUrl) ||
        check.sourceUrl !== row.sourceUrl ||
        !['absent', 'inconclusive'].includes(check.outcome) || present.has(check.sourceUid)) {
      throw new AdapterError('INVALID_ABSENCE_EVIDENCE', 'Absence check is outside the verified store contract')
    }
    seen.add(check.sourceUid)
    if (check.outcome === 'absent' && row.state === 'live' && !row.endsOn && !row.endsAt && !ended.has(row.sourceUid)) {
      absent.push(row.sourceUid)
    }
  }
  return absent
}

export function parseVisibilityPublication(value: unknown) {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid visibility publication')
  const entry = value as Record<string, unknown>
  const status = parseEpicPublicationStatus(entry.status)
  const count = (key: string) => {
    if (status !== 'published') return 0
    const value = entry[key]
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new TypeError('Invalid publication count')
    return value
  }
  return { status, upserted: count('upserted'), ended: count('ended'), hidden: count('hidden'),
    operationallyClosed: count('operationallyClosed') }
}
