
import type { Locale } from '@/lib/locale'
import { t } from '@/lib/i18n'
import { CampaignArtwork } from '@/components/campaign-artwork'
import { CampaignTiming } from '@/components/campaign-timing'
import { StoreIdentity } from '@/components/store-identity'
import type { AnalyticsSurface } from '@/lib/analytics'
import {
  type CampaignBoundary,
  type CampaignState,
  type CampaignWithStore,
} from '@/lib/sales'

type CampaignCardProps = CampaignWithStore & {
  locale?: Locale
  state: Extract<CampaignState, 'live' | 'upcoming'>
  showStore: boolean
  compact?: boolean
  analyticsSurface: AnalyticsSurface
}

function getPrimaryTiming(
  campaign: CampaignWithStore['campaign'],
  state: CampaignCardProps['state']
): Readonly<{
  boundary: CampaignBoundary
  purpose: 'start' | 'started' | 'end'
}> | null {
  if (state === 'live') {
    if (campaign.ends) return { boundary: campaign.ends, purpose: 'end' }
    if (campaign.starts) return { boundary: campaign.starts, purpose: 'started' }
    return null
  }

  if (campaign.starts) return { boundary: campaign.starts, purpose: 'start' }
  if (campaign.ends) return { boundary: campaign.ends, purpose: 'end' }
  return null
}

export function CampaignCard({ locale = 'en',
  campaign,
  store,
  state,
  showStore,
  analyticsSurface,
  compact = false,
}: CampaignCardProps) {
  const timing = getPrimaryTiming(campaign, state)

  return (
    <article className="h-full">
      <a
        href={campaign.officialUrl}
        data-lobodeals-outbound="true"
        data-analytics-surface={analyticsSurface}
        data-outbound-type="sale"
        data-store-slug={store.slug}
        data-store-name={store.name}
        data-sale-campaign-id={campaign.id}
        data-sale-campaign-name={campaign.name}
        data-link-mode="official"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t(locale, "View {value0} on {value1} (opens in a new tab)", { value0: campaign.name, value1: store.name })}
        className="group flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#171717] shadow-[0_16px_38px_rgba(0,0,0,0.18)] transition duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-[#1b1b1b] hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f87171]"
      >
        <div className="border-b border-white/10">
          <CampaignArtwork locale={locale}
            artworkUrl={campaign.artworkUrl}
            campaignName={campaign.name}
            compact={compact}
            state={state}
            store={store}
          />
        </div>

        <div className={`flex flex-1 flex-col ${compact ? 'p-4' : 'p-5'}`}>
          <div className="flex items-center justify-between gap-3">
            {showStore ? (
              <div className="flex min-w-0 items-center gap-2">
                <StoreIdentity store={store} variant="mini" />
                <p className="min-w-0 truncate text-xs font-bold uppercase tracking-[0.12em] text-[#bdbbb7]">
                  {store.name}
                </p>
              </div>
            ) : (
              <span aria-hidden="true" />
            )}
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.66rem] font-black uppercase tracking-[0.15em] ${
                state === 'live'
                  ? 'border-[#d83a3a]/60 bg-[#990303] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.04)]'
                  : 'border-white/15 bg-white/[0.06] text-[#c4c2be]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  state === 'live'
                    ? 'live-indicator-dot bg-white'
                    : 'bg-[#71706e]'
                }`}
                aria-hidden="true"
              />
              {state === 'live' ? t(locale, "Live") : t(locale, "Upcoming")}
            </span>
          </div>

          <h3
            className={`mt-4 font-semibold leading-snug tracking-[-0.02em] text-white ${
              compact ? 'text-lg' : 'text-xl'
            }`}
          >
            {campaign.name}
          </h3>

          {timing ? (
            <CampaignTiming locale={locale}
              boundary={timing.boundary}
              purpose={timing.purpose}
              state={state}
            />
          ) : null}

          <span className="mt-auto inline-flex min-h-11 items-end pt-5 text-sm font-bold text-white transition-colors group-hover:text-[#ef7777]">
            {t(locale, "View official sale")} <span className="ml-2" aria-hidden="true">↗</span>
            <span className="sr-only"> {t(locale, "(opens in a new tab)")}</span>
          </span>
        </div>
      </a>
    </article>
  )
}
