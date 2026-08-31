export const STORE_SLUGS = [
  'playstation-store',
  'nintendo-eshop',
  'microsoft-store',
  'steam',
  'epic-games-store',
  'gog',
  'ea-app',
  'ubisoft-store',
  'battle-net',
  'rockstar-store',
] as const

export type StoreSlug = (typeof STORE_SLUGS)[number]
export type CampaignState = 'live' | 'upcoming' | 'ended'

export const SOURCE_URLS: Readonly<Record<StoreSlug, string>> = {
  'playstation-store': 'https://store.playstation.com/en-us/pages/deals',
  'nintendo-eshop': 'https://www.nintendo.com/us/store/sales-and-deals/',
  'microsoft-store':
    'https://www.xbox.com/en-US/promotions/sales/sales-and-specials',
  steam:
    'https://partner.steamgames.com/doc/marketing/upcoming_events?l=english',
  'epic-games-store': 'https://store.epicgames.com/en-US/sales-and-specials',
  gog: 'https://www.gog.com/en/',
  'ea-app': 'https://www.ea.com/sales/deals',
  'ubisoft-store': 'https://store.ubisoft.com/us/deals',
  'battle-net': 'https://news.blizzard.com/en-us/api/feed/blizzard?offset=0',
  'rockstar-store': 'https://www.rockstargames.com/newswire?tag=661',
}

export type DateOnlyBoundary = Readonly<{
  precision: 'date'
  value: string
}>

export type ExactBoundary = Readonly<{
  precision: 'datetime'
  value: string
}>

export type SourceBoundary = DateOnlyBoundary | ExactBoundary
export type SourceCoverage =
  | 'partial'
  | 'authoritative-complete-current-set'

export type DetectedCampaign = Readonly<{
  sourceUid: string
  name: string
  storeSlug: StoreSlug
  state: CampaignState
  lifecycleBasis: 'official-source' | 'exact-time'
  starts?: SourceBoundary
  ends?: SourceBoundary
  officialUrl: string
  sourceUrl: string
  artworkUrl?: string
}>

export type KnownCampaign = Readonly<{
  campaignKey: string
  sourceUid: string
  name: string
  state: Exclude<CampaignState, 'ended'>
  officialUrl: string
  sourceUrl: string
  endsAt?: string
}>

export type AdapterContext = Readonly<{
  now: Date
  fetch: typeof fetch
  knownCampaigns?: readonly KnownCampaign[]
}>

export type AdapterResult = Readonly<{
  storeSlug: StoreSlug
  sourceUrl: string
  sourceUrls: readonly string[]
  coverage: SourceCoverage
  campaigns: readonly DetectedCampaign[]
  explicitlyEndedSourceUids: readonly string[]
}>

export type StoreAdapter = (
  context: AdapterContext
) => Promise<AdapterResult>

export class AdapterError extends Error {
  readonly code: string
  readonly blocked: boolean

  constructor(code: string, message: string, blocked = false) {
    super(message)
    this.name = 'AdapterError'
    this.code = code
    this.blocked = blocked
  }
}
