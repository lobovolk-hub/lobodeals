import {
  validateOfficialCampaigns,
  type CampaignBoundary,
  type OfficialCampaign,
} from './sales'
import type { SalesAvailability } from './sales-availability'
import { getStoreBySlug, type StoreSlug } from './stores'

export type { SalesAvailability } from './sales-availability'

const EMPTY_CAMPAIGN_FEED: readonly OfficialCampaign[] = Object.freeze([])
const EMPTY_AVAILABILITY: readonly SalesAvailability[] = Object.freeze([])

export type SalesFeed = Readonly<{
  campaigns: readonly OfficialCampaign[]
  availability: readonly SalesAvailability[]
  sourceUnavailable: boolean
}>

type SalesCampaignRow = Readonly<{
  campaign_key: string
  store_slug: string
  name: string
  market: string
  state: 'live' | 'upcoming'
  lifecycle_basis: 'official-source' | 'exact-time'
  starts_on: string | null
  starts_at: string | null
  ends_on: string | null
  ends_at: string | null
  official_url: string
}>

type SalesAvailabilityRow = Readonly<{
  store_slug: string
  availability: 'available' | 'temporarily_unavailable'
}>

function boundary(
  date: string | null,
  dateTime: string | null
): CampaignBoundary | undefined {
  if (dateTime) return { precision: 'datetime', dateTime }
  if (date) return { precision: 'date', date }
  return undefined
}

function toOfficialCampaign(row: SalesCampaignRow): OfficialCampaign {
  const starts = boundary(row.starts_on, row.starts_at)
  const ends = boundary(row.ends_on, row.ends_at)
  const lifecycle =
    row.lifecycle_basis === 'exact-time'
      ? ({ basis: 'exact-time' } as const)
      : ({ basis: 'official-source', status: row.state } as const)

  return {
    id: row.campaign_key,
    name: row.name,
    storeSlug: row.store_slug,
    market: row.market as 'US',
    starts,
    ends,
    lifecycle,
    officialUrl: row.official_url,
  }
}

/**
 * Replaceable server-side boundary for the approved Sales persistence.
 * It uses the public read policy directly and keeps the browser free of a
 * Supabase SDK. A missing or failed backend produces no synthetic campaign.
 */
async function loadCampaigns(): Promise<Readonly<{
  campaigns: readonly OfficialCampaign[]
  unavailable: boolean
}>> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!baseUrl || !publishableKey) {
    return { campaigns: EMPTY_CAMPAIGN_FEED, unavailable: true }
  }

  const columns = [
    'campaign_key',
    'store_slug',
    'name',
    'market',
    'state',
    'lifecycle_basis',
    'starts_on',
    'starts_at',
    'ends_on',
    'ends_at',
    'official_url',
  ].join(',')

  try {
    const response = await fetch(
      `${baseUrl}/rest/v1/sales_campaigns?select=${columns}&state=in.(live,upcoming)`,
      {
        headers: { apikey: publishableKey },
        next: { revalidate: 300 },
      }
    )
    if (!response.ok) {
      console.error(`Sales source returned HTTP ${response.status}`)
      return { campaigns: EMPTY_CAMPAIGN_FEED, unavailable: true }
    }

    const rows = (await response.json()) as readonly SalesCampaignRow[]
    return {
      campaigns: validateOfficialCampaigns(rows.map(toOfficialCampaign)),
      unavailable: false,
    }
  } catch (error) {
    console.error(
      'Sales source is unavailable',
      error instanceof Error ? error.message : 'unknown error'
    )
    return { campaigns: EMPTY_CAMPAIGN_FEED, unavailable: true }
  }
}

async function loadAvailability(): Promise<Readonly<{
  availability: readonly SalesAvailability[]
  unavailable: boolean
}>> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!baseUrl) {
    return { availability: EMPTY_AVAILABILITY, unavailable: true }
  }

  try {
    const response = await fetch(
      `${baseUrl}/functions/v1/campaign-monitoring`,
      { next: { revalidate: 300 } }
    )
    if (!response.ok) {
      console.error(`Sales availability returned HTTP ${response.status}`)
      return { availability: EMPTY_AVAILABILITY, unavailable: true }
    }

    const rows = (await response.json()) as readonly SalesAvailabilityRow[]
    const seen = new Set<string>()
    const availability: SalesAvailability[] = []

    for (const row of rows) {
      if (
        !getStoreBySlug(row.store_slug) ||
        seen.has(row.store_slug) ||
        (row.availability !== 'available' &&
          row.availability !== 'temporarily_unavailable')
      ) {
        throw new TypeError('Sales availability returned an invalid row')
      }

      seen.add(row.store_slug)
      availability.push({
        storeSlug: row.store_slug as StoreSlug,
        availability: row.availability,
      })
    }

    return { availability, unavailable: false }
  } catch (error) {
    console.error(
      'Sales availability is unavailable',
      error instanceof Error ? error.message : 'unknown error'
    )
    return { availability: EMPTY_AVAILABILITY, unavailable: true }
  }
}

export async function loadSalesFeed(): Promise<SalesFeed> {
  const [campaignResult, availabilityResult] = await Promise.all([
    loadCampaigns(),
    loadAvailability(),
  ])

  return {
    campaigns: campaignResult.campaigns,
    availability: availabilityResult.availability,
    sourceUnavailable:
      campaignResult.unavailable || availabilityResult.unavailable,
  }
}
